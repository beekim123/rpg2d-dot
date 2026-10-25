import {test,expect} from '@playwright/test';
test('Godot Web export boots, renders and accepts real movement with collision',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');const canvas=page.locator('#canvas');
  await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(canvas).toHaveAttribute('data-grid_x','8');await expect(canvas).toHaveAttribute('data-grid_y','12');
  await expect(canvas).toHaveAttribute('aria-label',/伴星 ASTRA/);
  await page.screenshot({path:'artifacts/screenshots/godot-g0-map.png'});
  await canvas.click();
  for(const x of [9,10]){
    await page.keyboard.down('ArrowRight');await expect(canvas).toHaveAttribute('data-grid_x',String(x));await page.keyboard.up('ArrowRight');await expect(canvas).toHaveAttribute('data-moving','false');
  }
  await page.keyboard.down('ArrowUp');await expect(canvas).toHaveAttribute('data-facing','up');await page.keyboard.up('ArrowUp');
  await expect(canvas).toHaveAttribute('data-grid_y','12');await expect(canvas).toHaveAttribute('data-grid_x','10');
  await page.screenshot({path:'artifacts/screenshots/godot-g0-collision.png'});
  expect(errors).toEqual([]);
});
