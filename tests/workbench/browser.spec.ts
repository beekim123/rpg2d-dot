import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import manifest from '../../resources/art/export/manifest.json' with {type:'json'};

async function loaded(page:Page):Promise<void>{
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('article[data-id]')).toHaveCount(manifest.assets.length);
}

test('single HTML moved outside the repository previews exact PNGs without network access',async({page})=>{
  const directory=await mkdtemp(join(tmpdir(),'astra-workbench-detached-'));
  const detached=join(directory,'gallery.html');await copyFile('build/asset-workbench/index.html',detached);
  const errors:string[]=[],remote:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
  try{
    await page.goto(pathToFileURL(detached).href);await loaded(page);
    await page.locator('#search').fill('char.finn');
    const card=page.locator('article[data-id="char.finn"]'),canvas=card.locator('canvas');
    await expect(page.locator('article[data-id]:visible')).toHaveCount(1);
    await card.locator('select[data-animation]').selectOption('walk_down');
    await expect(canvas).toHaveAttribute('data-frame',/\d+/);
    const first=await canvas.getAttribute('data-frame');
    await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(first);
    await page.locator('#animate').click();
    const paused=await canvas.getAttribute('data-frame');await page.waitForTimeout(300);
    expect(await canvas.getAttribute('data-frame')).toBe(paused);
    await page.locator('#zoom').selectOption('3');
    const dimensions=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return {w:c.width,h:c.height,cssW:c.getBoundingClientRect().width,cssH:c.getBoundingClientRect().height};});
    expect(dimensions.cssW).toBe(dimensions.w*3);expect(dimensions.cssH).toBe(dimensions.h*3);
    const downloadPromise=page.waitForEvent('download');
    await card.locator('a[download="char.finn.png"]').click();const download=await downloadPromise;
    const downloaded=await download.path();expect(downloaded).not.toBeNull();
    expect((await readFile(downloaded!)).equals(await readFile('godot/resources/art/char.finn.png'))).toBe(true);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'artifacts/screenshots/workbench-detached.png'});
    await page.locator('#search').fill('');await page.locator('#filter').selectOption('portrait');
    await expect(page.locator('article[data-id]:visible')).toHaveCount(manifest.assets.filter(a=>a.category==='portrait').length);
    expect(remote).toEqual([]);expect(errors).toEqual([]);
  }finally{await page.close();await rm(directory,{recursive:true,force:true});}
});

test('HTTP viewer is isolated, keeps all categories, and resamples audio for a 192kHz device',async({page})=>{
  const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.addInitScript(()=>{
    const Original=window.AudioContext;
    const state=window as unknown as {audioContexts:AudioContext[];assetBufferRates:number[];assetBuffers:AudioBuffer[]};
    state.audioContexts=[];state.assetBufferRates=[];state.assetBuffers=[];
    window.AudioContext=class extends Original{
      constructor(options?:AudioContextOptions){super({...options,sampleRate:192000});state.audioContexts.push(this);}
      override createBuffer(channels:number,length:number,sampleRate:number):AudioBuffer{
        state.assetBufferRates.push(sampleRate);const buffer=super.createBuffer(channels,length,sampleRate);state.assetBuffers.push(buffer);return buffer;
      }
    };
  });
  await page.goto('/');await loaded(page);
  await page.screenshot({path:'artifacts/screenshots/workbench-overview.png'});
  await page.locator('button[data-cue="confirm"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {audioContexts:AudioContext[]}).audioContexts.map(c=>c.state))).toEqual(['running']);
  await page.locator('button[data-cue="battle_theme"]').click();
  expect(await page.evaluate(()=>(window as unknown as {assetBufferRates:number[]}).assetBufferRates.every(rate=>rate===44100))).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {assetBuffers:AudioBuffer[]}).assetBuffers.every(buffer=>buffer.getChannelData(0).every(sample=>Number.isInteger(sample*32768))))).toBe(true);
  await page.locator('#audio-stop').click();
  await page.locator('#search').fill('prop.windmill');
  await expect(page.locator('article[data-id]:visible')).toHaveCount(1);
  await page.screenshot({path:'artifacts/screenshots/workbench-resources.png'});
  expect(requests).toEqual(['http://127.0.0.1:8787/']);expect(errors).toEqual([]);
  expect(resolve('build/asset-workbench/index.html')).not.toContain('reference/web');
});

test('pause commits a frame accumulated between throttled draws before returning',async({page})=>{
  // Drive the real viewer across its 30Hz paint gate without relying on wall-clock luck.
  await page.addInitScript(()=>{
    let now=0;let serial=0;const callbacks:FrameRequestCallback[]=[];
    Object.defineProperty(performance,'now',{value:()=>now});
    window.requestAnimationFrame=(callback:FrameRequestCallback)=>{callbacks.push(callback);return ++serial;};
    (window as unknown as {stepViewer:(time:number)=>void}).stepViewer=time=>{
      now=time;const pending=callbacks.splice(0);for(const callback of pending)callback(time);
    };
  });
  await page.goto('/');await loaded(page);
  await page.evaluate(()=>{
    const search=document.querySelector<HTMLInputElement>('#search')!;search.value='char.finn';search.dispatchEvent(new Event('input'));
    const select=document.querySelector<HTMLSelectElement>('article[data-id="char.finn"] select[data-animation]')!;
    select.value='walk_down';select.dispatchEvent(new Event('change'));
  });
  await page.evaluate(()=>new Promise<void>(resolve=>{
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();resolve();}});
    observer.observe(document.querySelector('article[data-id="char.finn"]')!);
  }));
  const frames=await page.evaluate(()=>{
    const tick=(window as unknown as {stepViewer:(time:number)=>void}).stepViewer;
    const canvas=document.querySelector<HTMLCanvasElement>('article[data-id="char.finn"] canvas')!;
    const button=document.querySelector<HTMLButtonElement>('#animate')!;
    tick(0);tick(100);const before=canvas.dataset.frame;
    tick(130);button.click();const paused=canvas.dataset.frame;
    tick(150);const after=canvas.dataset.frame;
    tick(500);const later=canvas.dataset.frame;
    button.click();tick(600);tick(650);const resumed=canvas.dataset.frame;
    return {before,paused,after,later,resumed};
  });
  expect(frames.after).toBe(frames.paused);
  expect(frames.later).toBe(frames.paused);
  expect(frames.paused).not.toBe(frames.before);
  expect(frames.resumed).not.toBe(frames.paused);
});
