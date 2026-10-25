import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import manifest from '../../../resources/art/export/manifest.json' with {type:'json'};
const screenshot=async(page:Page,name:string)=>{await page.screenshot({path:`artifacts/screenshots/m0-${name}.png`});};
async function step(page:Page,key:string,position:string):Promise<void>{await page.keyboard.down(key);await expect(page.locator('#game')).toHaveAttribute('data-position',position);await page.keyboard.up(key);await page.waitForTimeout(190);}
async function confirm(page:Page):Promise<void>{await page.keyboard.press('KeyZ');await page.waitForTimeout(60);}

test('title, town, dialogue, lamp and manual save form a playable loop',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const requests:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('data:'))requests.push(r.url());});
  await page.goto('./');const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-scene','title');
  await screenshot(page,'title');await confirm(page);await expect(canvas).toHaveAttribute('data-scene','map');
  await screenshot(page,'map');
  await step(page,'ArrowRight','9,12');await step(page,'ArrowRight','10,12');await page.keyboard.press('ArrowUp');await confirm(page);
  await expect(canvas).toHaveAttribute('data-scene','dialogue');await confirm(page);await screenshot(page,'dialogue');
  // Each line first reveals, then advances; no synthetic state injection.
  for(let n=0;n<5;n++)await confirm(page);
  await expect(canvas).toHaveAttribute('data-scene','map');await expect(canvas).toHaveAttribute('data-met-hob','true');
  for(let x=11;x<=15;x++)await step(page,'ArrowRight',`${x},12`);
  await page.keyboard.press('ArrowUp');await confirm(page);await expect(canvas).toHaveAttribute('data-lamps','1');
  await page.keyboard.press('KeyC');await expect(canvas).toHaveAttribute('data-scene','menu');await page.keyboard.press('ArrowDown');await confirm(page);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('astra.save.1'))).not.toBeNull();await page.waitForTimeout(3100);await screenshot(page,'menu');
  await page.keyboard.press('Escape');await step(page,'ArrowRight','16,12');
  await page.keyboard.press('KeyC');for(let n=0;n<4;n++)await page.keyboard.press('ArrowDown');await confirm(page);
  await expect(canvas).toHaveAttribute('data-position','15,12');await expect(canvas).toHaveAttribute('data-scene','map');
  await page.reload();await expect(canvas).toHaveAttribute('data-scene','title');await page.keyboard.press('ArrowDown');await confirm(page);
  await expect(canvas).toHaveAttribute('data-position','15,12');
  expect(errors).toEqual([]);expect(requests).toEqual([]);
});

test('workbench previews shipped PNGs, animation and audio without runtime errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1280,height:900});
  await page.addInitScript(()=>{const Original=window.AudioContext;(window as unknown as {audioContexts:AudioContext[]}).audioContexts=[];window.AudioContext=class extends Original{constructor(options?:AudioContextOptions){super({...options,sampleRate:192000});(window as unknown as {audioContexts:AudioContext[]}).audioContexts.push(this);}};});
  await page.goto('./workbench/');
  await expect(page.locator('article')).toHaveCount(manifest.assets.length);await page.getByRole('button',{name:'确认',exact:true}).click();
  await page.getByRole('button',{name:'试奏 · 第一盏灯'}).click();await page.getByRole('button',{name:'暂停动画'}).click();
  await expect(page.locator('body')).toHaveCSS('display','block');
  expect(await page.locator('#library').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(1000);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {audioContexts:AudioContext[]}).audioContexts.map(c=>c.state))).toEqual(['running']);
  await screenshot(page,'workbench');expect(errors).toEqual([]);
});

test('debug invalid positions fall back and imports reject a corrupted file',async({page})=>{
  await page.goto('./?map=lantern.test&at=10,11');const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-position','8,12');
  await page.keyboard.press('KeyC');for(let n=0;n<8;n++)await page.keyboard.press('ArrowDown');
  await page.locator('input[type=file]').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await expect(page.locator('#status')).toContainText('存档不可用');await expect(canvas).toHaveAttribute('data-position','8,12');
});

test('menu horizontal navigation is reversible and its bottom padding cannot load a save',async({page})=>{
  await page.goto('./?map=lantern.test&at=15,12');const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-scene','map');
  await page.keyboard.press('ArrowUp');await confirm(page);await page.keyboard.press('KeyC');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await confirm(page);
  await expect.soft.poll(()=>page.evaluate(()=>localStorage.getItem('astra.save.1'))).not.toBeNull();
  expect.soft(await page.evaluate(()=>localStorage.getItem('astra.save.2'))).toBeNull();
  await page.keyboard.press('Escape');await page.keyboard.press('KeyC');for(let n=0;n<3;n++)await page.keyboard.press('ArrowDown');await confirm(page);
  await page.keyboard.press('Escape');await step(page,'ArrowRight','16,12');await page.keyboard.press('KeyC');
  await canvas.click({position:{x:96,y:432}});await page.waitForTimeout(60);
  await expect(canvas).toHaveAttribute('data-scene','menu');await expect(canvas).toHaveAttribute('data-position','16,12');
});

test('idle art animates in the real scene while feet and tree roots stay planted',async({page})=>{
  await page.goto('./?map=lantern.test');const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-position','8,12');
  const record=process.env.ASTRA_CAPTURE_IDLE==='1';if(record)mkdirSync('build/captures/idle-frames',{recursive:true});
  const samples:{finn:number;hob:number;tree:number;flower:number;feet:number;roots:number}[]=[];
  for(let n=0;n<25;n++){
    const snapshot=await canvas.evaluate((element,recording)=>{
      const c=element as HTMLCanvasElement;const ctx=c.getContext('2d')!;
      function hash(x:number,y:number,w:number,h:number):number{let value=2166136261;for(const byte of ctx.getImageData(x,y,w,h).data)value=Math.imul(value^byte,16777619)>>>0;return value;}
      return {checks:{finn:hash(128,119,16,24),hob:hash(160,103,16,24),tree:hash(408,31,32,32),flower:hash(176,79,16,16),feet:hash(128,139,16,4),roots:hash(408,71,32,8)},png:recording?c.toDataURL('image/png'):''};
    },record);
    samples.push(snapshot.checks);
    if(record)writeFileSync(`build/captures/idle-frames/frame-${String(n).padStart(2,'0')}.png`,Buffer.from(snapshot.png.split(',')[1]!,'base64'));
    await page.waitForTimeout(250);
  }
  for(const animated of ['finn','hob','tree','flower'] as const)expect(new Set(samples.map(s=>s[animated])).size,`${animated} must visibly animate`).toBeGreaterThan(1);
  expect(new Set(samples.map(s=>s.feet)).size).toBe(1);expect(new Set(samples.map(s=>s.roots)).size).toBe(1);
  await expect(canvas).toHaveAttribute('data-position','8,12');await screenshot(page,'idle');
});
