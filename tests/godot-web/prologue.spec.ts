import {test,expect,type Page} from '@playwright/test';
type Story={mode:string;step:string;busy:boolean;revealed:boolean;summary:boolean;image:string;visual:string;flags:Record<string,boolean>;inventory:Record<string,number>;options:{id:string;enabled:boolean;rect:number[]}[]};
async function story(page:Page):Promise<Story>{return JSON.parse(await page.locator('#canvas').getAttribute('data-story_ui')??'{}') as Story;}
async function choose(page:Page,id:string):Promise<void>{
  await expect.poll(async()=>(await story(page)).options?.some(o=>o.id===id&&o.enabled&&o.rect[2]!>1)).toBe(true);
  const option=(await story(page)).options.find(o=>o.id===id)!,box=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(box.x+(option.rect[0]!+option.rect[2]!/2)*box.width/480,box.y+(option.rect[1]!+option.rect[3]!/2)*box.height/270);
}
async function skip(page:Page):Promise<void>{
  const before=(await story(page)).step;
  await page.keyboard.press('x');await expect.poll(async()=>(await story(page)).summary).toBe(true);
  await page.keyboard.press('z');await expect.poll(async()=>(await story(page)).revealed).toBe(true);
  await page.keyboard.press('z');await expect.poll(async()=>(await story(page)).step).not.toBe(before);
}
test('native prologue title, illustrated legend, pole pickup and immediate continue use real input',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');const canvas=page.locator('#canvas');
  await expect.poll(async()=>(await story(page)).mode,{timeout:30000}).toBe('title');
  await page.screenshot({path:'artifacts/screenshots/godot-prologue-title.png'});
  const original=await canvas.getAttribute('data-grid_y');
  await page.keyboard.press('ArrowDown');expect(await canvas.getAttribute('data-grid_y')).toBe(original);
  await choose(page,'new');await expect.poll(async()=>(await story(page)).step).toBe('legend');
  await page.keyboard.press('z');await expect.poll(async()=>(await story(page)).revealed).toBe(true);
  await page.screenshot({path:'artifacts/screenshots/godot-prologue-legend.png'});
  await skip(page);await expect.poll(async()=>(await story(page)).step).toBe('wake');await skip(page);
  await expect.poll(async()=>(await story(page)).busy).toBe(false);
  expect((await story(page)).visual).toBe('char.finn_unarmed');
  await page.screenshot({path:'artifacts/screenshots/godot-prologue-wake.png'});
  for(const [key,x,y] of [['ArrowDown',5,8],['ArrowDown',5,9],['ArrowRight',6,9],['ArrowRight',7,9],['ArrowDown',7,10]] as const){
    await page.keyboard.press(key);
    await expect(canvas).toHaveAttribute('data-grid_x',String(x));await expect(canvas).toHaveAttribute('data-grid_y',String(y));
    await expect(canvas).toHaveAttribute('data-moving','false');await expect.poll(async()=>(await story(page)).busy).toBe(false);
  }
  await page.keyboard.press('z');await expect.poll(async()=>(await story(page)).inventory.lamp_rod).toBe(1);
  expect((await story(page)).visual).toBe('char.finn');
  await page.screenshot({path:'artifacts/screenshots/godot-prologue-pole.png'});
  await page.reload();await expect.poll(async()=>(await story(page)).mode,{timeout:30000}).toBe('title');await choose(page,'continue');
  await expect.poll(async()=>(await story(page)).mode).toBe('');expect((await story(page)).inventory.lamp_rod).toBe(1);
  expect((await story(page)).flags['p.woken']).toBe(true);expect((await story(page)).flags['p.rod_taken']).toBe(true);
  expect(errors).toEqual([]);
});
