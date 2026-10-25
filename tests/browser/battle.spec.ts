import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {battles} from '../../src/battle/content.ts';
import {runBattleRoute} from '../../tools/battle-playthrough.ts';
import type {BattleState,BattleCommand} from '../../src/battle/engine.ts';

test('battle opens on its map with paired units, a public intent, movement and undo',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./?battle=prologue_shade');const canvas=page.locator('#game');
  await expect(canvas).toHaveAttribute('data-scene','battle');
  await expect(canvas).toHaveAttribute('data-battle-actor','finn');
  await expect(canvas).toHaveAttribute('data-intent-mode','unit');
  await page.keyboard.press('Enter');await expect(canvas).toHaveAttribute('data-battle-mode','move_body');
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await expect.poll(()=>canvas.getAttribute('data-battle-body')).toBe('3,2');
  await expect(canvas).toHaveAttribute('data-battle-mode','command');
  await page.keyboard.press('Escape');await expect.poll(()=>canvas.getAttribute('data-battle-body')).toBe('1,3');
  await page.screenshot({path:'docs/plan/screenshots/m1-battle-shade.png'});
  expect(errors).toEqual([]);
});

test('Ella arena supports mouse command selection and invalid targets do not spend a turn',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./?battle=prologue_ella');
  const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-scene','battle');
  await expect(canvas).toHaveAttribute('data-intent-mode','point');
  const turn=await canvas.getAttribute('data-battle-turn');
  // The first command is body movement, but a wall cell cannot be entered.
  await canvas.click({position:{x:364,y:430}});await expect(canvas).toHaveAttribute('data-battle-mode','move_body');
  await canvas.click({position:{x:432,y:206}});
  await expect(canvas).toHaveAttribute('data-battle-turn',turn!);
  await page.keyboard.press('Escape');
  await page.screenshot({path:'docs/plan/screenshots/m1-battle-ella.png'});
  expect(errors).toEqual([]);
});

const readBattle=async(page:Page):Promise<BattleState>=>JSON.parse((await page.locator('#game').getAttribute('data-battle-state'))!);
async function option(page:Page,index:number):Promise<void>{await page.locator('#game').click({position:{x:(182+Math.floor(index/4)*148)*2,y:(215+(index%4)*13)*2}});}
async function cell(page:Page,x:number,y:number):Promise<void>{await page.locator('#game').click({position:{x:(160+x*16+8)*2,y:(79+y*16+8)*2}});}
async function enterCommand(page:Page,command:BattleCommand):Promise<void>{
  const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-battle-busy','false');await expect(canvas).toHaveAttribute('data-battle-actor',command.actorId);
  const state=await readBattle(page),actor=state.actors.find(a=>a.id===command.actorId)!;
  if(command.type==='move_body'||command.type==='move_astral'||command.type==='manifest'){
    await option(page,command.type==='move_body'?0:command.type==='move_astral'?1:4);await expect(canvas).toHaveAttribute('data-battle-mode',command.type);await cell(page,command.to.x,command.to.y);
  }else if(command.type==='skill'){
    await option(page,2);await expect(canvas).toHaveAttribute('data-battle-mode','skills');await option(page,(actor.skillIds??['basic_strike']).indexOf(command.skillId));await expect(canvas).toHaveAttribute('data-battle-mode','target');
    const target=state.actors.find(a=>a.id===command.targetId)!,p=command.target==='body'?target.body:target.astral!;await cell(page,p.x,p.y);
  }else {const index={guard:3,recall:4,undo:5,wait:6}[command.type as 'guard'|'recall'|'undo'|'wait'];await option(page,index);}
}
for(const id of ['prologue_ella','prologue_shade'])test(`real controls finish ${id} and retry restores the fight`,async({page})=>{
  test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const route=runBattleRoute(battles[id]!);await page.goto(`./?battle=${id}`);const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-scene','battle');
  const record=process.env.ASTRA_CAPTURE_BATTLE==='1'&&id==='prologue_shade';let recorded=false;
  if(!record){await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');await expect(canvas).toHaveAttribute('data-battle-speed','0');}
  const enemyActions:Record<string,number>={};
  for(const step of route.steps){
    if(step.kind==='enemy'){enemyActions[step.actorId]=(enemyActions[step.actorId]??0)+1;await expect.poll(async()=>(await readBattle(page)).enemyActions[step.actorId]??0).toBeGreaterThanOrEqual(enemyActions[step.actorId]!);}
    else{
      await enterCommand(page,step.command);
      if(record&&!recorded&&step.command.type==='skill'){
        mkdirSync('test-results/battle-frames',{recursive:true});
        for(let frame=0;frame<32;frame++){const png=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL('image/png'));writeFileSync(`test-results/battle-frames/frame-${String(frame).padStart(2,'0')}.png`,Buffer.from(png.split(',')[1]!,'base64'));await page.waitForTimeout(100);}
        recorded=true;await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');await expect(canvas).toHaveAttribute('data-battle-speed','0');
      }
    }
  }
  await expect(canvas).toHaveAttribute('data-battle-busy','false');await expect(canvas).toHaveAttribute('data-battle-mode','outcome');expect((await readBattle(page)).phase).toBe('won');
  await page.screenshot({path:`docs/plan/screenshots/m1-${id}-won.png`});
  await option(page,1);await expect(canvas).toHaveAttribute('data-battle-mode','command');const reset=await readBattle(page);
  expect(reset.turnNumber).toBe(1);expect(reset.enemyActions).toEqual({});expect(reset.actors[0]!.hp).toBe(battles[id]!.actors[0]!.maxHp);
  expect(errors).toEqual([]);
});

test('opening a battle preview preserves the existing autosave',async({page})=>{
  await page.goto('./?map=lantern.test&at=15,12');const canvas=page.locator('#game');await expect(canvas).toHaveAttribute('data-scene','map');
  await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');await expect(canvas).toHaveAttribute('data-lamps','1');
  const saved=await page.evaluate(()=>localStorage.getItem('astra.save.0'));expect(saved).not.toBeNull();
  await page.goto('./?battle=prologue_shade');await expect(canvas).toHaveAttribute('data-scene','battle');
  expect(await page.evaluate(()=>localStorage.getItem('astra.save.0'))).toBe(saved);
});
