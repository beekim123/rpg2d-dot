import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {maps,traverse,walkTo,face} from './world-controls.ts';

async function clickAt(page:Page,x:number,y:number):Promise<void>{
  const canvas=page.locator('#canvas'),bounds=await canvas.boundingBox();expect(bounds).not.toBeNull();
  await canvas.click({position:{x:x*bounds!.width/480,y:y*bounds!.height/270}});
}
async function action(page:Page,index:number):Promise<void>{await clickAt(page,361,81+index*24);}
async function openMenu(page:Page):Promise<void>{
  await page.keyboard.press('KeyC');await expect(page.locator('#canvas')).toHaveAttribute('data-save_menu','true');
}

test('lamp memories, four slots and real file transfer persist through reload and new pages',async({page,context})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?explore=1');const canvas=page.locator('#canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});await canvas.click();
  const home=maps['lv.finn_house']!,town=maps['lv.town']!;
  const arrival=await traverse(page,home,home.spawn,'lv.town');
  await walkTo(page,town,arrival,{x:18,y:11});await face(page,'ArrowUp','up');
  await page.keyboard.press('KeyZ');await expect(canvas).toHaveAttribute('data-dialogue_active','true');
  await page.keyboard.press('KeyX');await expect(canvas).toHaveAttribute('data-dialogue_revealed','true');
  await page.keyboard.press('KeyZ');await expect(canvas).toHaveAttribute('data-speaker','芬恩');
  await page.keyboard.press('KeyX');await expect(canvas).toHaveAttribute('data-dialogue_revealed','true');
  await page.keyboard.press('KeyZ');await expect(canvas).toHaveAttribute('data-dialogue_active','false');
  await walkTo(page,town,{x:18,y:11},{x:12,y:19});await face(page,'ArrowUp','up');
  await page.keyboard.press('KeyZ');await expect(canvas).toHaveAttribute('data-lit_lamps','lv.lamp.square');
  await page.screenshot({path:'artifacts/screenshots/godot-g1-lamp.png'});
  await page.keyboard.press('KeyZ');await expect(canvas).toHaveAttribute('data-save_menu','true');
  await expect(canvas).toHaveAttribute('data-save_slot','1');
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(150);await page.keyboard.up('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-grid_x','12');await expect(canvas).toHaveAttribute('data-grid_y','19');
  await action(page,0);await expect(canvas).toHaveAttribute('data-save_status','save.saved');
  await page.screenshot({path:'artifacts/screenshots/godot-g1-save-menu.png'});
  await action(page,0);await expect(canvas).toHaveAttribute('data-save_confirming','true');
  await page.screenshot({path:'artifacts/screenshots/godot-g1-save-overwrite.png'});
  await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-save_confirming','false');
  await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-save_menu','false');
  await traverse(page,town,{x:12,y:19},'lv.lamp_shop');
  await openMenu(page);await action(page,1);
  await expect(canvas).toHaveAttribute('data-save_menu','false');await expect(canvas).toHaveAttribute('data-map_id','lv.town');
  await expect(canvas).toHaveAttribute('data-grid_x','12');await expect(canvas).toHaveAttribute('data-grid_y','19');
  await openMenu(page);
  const downloading=page.waitForEvent('download');await action(page,2);const file=await downloading;
  const filename=await file.path();expect(filename).not.toBeNull();const bytes=await readFile(filename!);
  const exported=JSON.parse(bytes.toString('utf8'));
  expect(exported).toMatchObject({version:3,mapId:'lv.town',player:{x:12,y:19,facing:'up'},lamps:['lv.lamp.square'],flags:{'seen.hob':true}});
  const cancelling=page.waitForEvent('filechooser');await action(page,3);await (await cancelling).setFiles([]);
  await expect(page.locator('#astra-save-import')).toHaveCount(0);await expect(canvas).toHaveAttribute('data-map_id','lv.town');
  const choosingBad=page.waitForEvent('filechooser');await action(page,3);await (await choosingBad).setFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(canvas).toHaveAttribute('data-save_status','save.invalid');await expect(canvas).toHaveAttribute('data-map_id','lv.town');
  await page.screenshot({path:'artifacts/screenshots/godot-g1-save-invalid.png'});
  const choosingUnsafe=page.waitForEvent('filechooser');await action(page,3);await (await choosingUnsafe).setFiles({name:'blocked.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,player:{x:0,y:0,facing:'up'}}))});
  await expect(canvas).toHaveAttribute('data-save_status','save.bad_position');await expect(canvas).toHaveAttribute('data-grid_x','12');
  const choosingEncoding=page.waitForEvent('filechooser');await action(page,3);await (await choosingEncoding).setFiles({name:'encoding.json',mimeType:'application/json',buffer:Buffer.from([255])});
  await expect(canvas).toHaveAttribute('data-save_status','save.invalid_utf8');await expect(canvas).toHaveAttribute('data-lit_lamps','lv.lamp.square');
  await action(page,4);await expect(canvas).toHaveAttribute('data-save_confirming','true');
  await clickAt(page,147,168);await expect(canvas).toHaveAttribute('data-save_menu','false');
  await expect(canvas).toHaveAttribute('data-map_id','lv.finn_house');await expect(canvas).toHaveAttribute('data-lamps','0');
  await openMenu(page);const choosing=page.waitForEvent('filechooser');await action(page,3);await (await choosing).setFiles({name:'journey.json',mimeType:'application/json',buffer:bytes});
  await expect(canvas).toHaveAttribute('data-save_menu','false');await expect(canvas).toHaveAttribute('data-save_status','save.imported');
  await expect(canvas).toHaveAttribute('data-lit_lamps','lv.lamp.square');
  await page.reload();await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(canvas).toHaveAttribute('data-map_id','lv.town');await expect(canvas).toHaveAttribute('data-grid_x','12');await expect(canvas).toHaveAttribute('data-lit_lamps','lv.lamp.square');
  await page.screenshot({path:'artifacts/screenshots/godot-g1-save-reloaded.png'});
  const second=await context.newPage();await second.goto('/?explore=1');await expect(second.locator('#canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(second.locator('#canvas')).toHaveAttribute('data-map_id','lv.town');await expect(second.locator('#canvas')).toHaveAttribute('data-lit_lamps','lv.lamp.square');await second.close();
  expect(errors).toEqual([]);
});

test('a browser storage write failure cannot replace an existing manual record',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/?explore=1');const canvas=page.locator('#canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});await canvas.click();
  const home=maps['lv.finn_house']!,town=maps['lv.town']!;
  const at=await traverse(page,home,home.spawn,'lv.town');
  await walkTo(page,town,at,{x:12,y:19});await face(page,'ArrowUp','up');await page.keyboard.press('KeyZ');
  await expect(canvas).toHaveAttribute('data-lit_lamps','lv.lamp.square');await openMenu(page);await action(page,0);
  await expect(canvas).toHaveAttribute('data-save_status','save.saved');
  const before=await page.evaluate(()=>{
    const key=Object.keys(localStorage).find(k=>k.startsWith('astra.godot.save.')&&k.endsWith('.1'))!;
    return {key,value:localStorage.getItem(key)};
  });
  expect(before.value).not.toBeNull();
  await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-save_menu','false');
  await walkTo(page,town,{x:12,y:19},{x:11,y:19});await walkTo(page,town,{x:11,y:19},{x:12,y:19});await openMenu(page);
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    (window as unknown as {restoreStorage:()=>void}).restoreStorage=()=>{Storage.prototype.setItem=original;};
    Storage.prototype.setItem=function(key:string,value:string):void{
      if(key.startsWith('astra.godot.save.'))throw new DOMException('Test quota failure','QuotaExceededError');
      original.call(this,key,value);
    };
  });
  await action(page,0);await expect(canvas).toHaveAttribute('data-save_confirming','true');await clickAt(page,147,168);
  await expect(canvas).toHaveAttribute('data-save_status','save.io');await expect(canvas).toHaveAttribute('data-save_menu','true');
  expect(await page.evaluate(key=>localStorage.getItem(key),before.key)).toBe(before.value);
  await page.screenshot({path:'artifacts/screenshots/godot-g1-save-write-failed.png'});
  await page.evaluate(()=>(window as unknown as {restoreStorage:()=>void}).restoreStorage());
});
