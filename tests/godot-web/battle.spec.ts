import {test,expect,type Page} from '@playwright/test';
type Point={x:number;y:number};
type Actor={id:string;team:string;kind:string;body:Point;astral:Point|null;hp:number;maxHp:number;will:number;maxWill:number;cheered?:boolean;skillIds?:string[];lampMarks?:number};
type Ui={selection:{type?:string;skillId?:string;itemId?:string};busy:boolean;mode:string;speed:number;cursor:Point;options:{id:string;enabled:boolean;selected:boolean;rect:number[]}[];grid:{x:number;y:number;size:number};reachable:Point[];preview:{ok?:boolean;damage?:number};snapshot:{battle:{phase:string;activeId:string;turnNumber:number;actors:Actor[];inventory?:Record<string,number>};intents:Record<string,unknown>}};
async function ui(page:Page):Promise<Ui>{return JSON.parse((await page.locator('#canvas').getAttribute('data-battle_ui'))??'{}') as Ui;}
async function idle(page:Page):Promise<Ui>{await expect.poll(async()=>{const state=await ui(page);return state.snapshot&&!state.busy;},{timeout:20000}).toBe(true);return ui(page);}
async function choose(page:Page,id:string):Promise<void>{
  await expect.poll(async()=>{const state=await ui(page);return !state.busy&&state.options.some(o=>o.id===id&&o.enabled&&o.rect[2]!>1);},{timeout:20000}).toBe(true);
  const state=await ui(page),option=state.options.find(o=>o.id===id)!;
  const box=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.click(box.x+(option.rect[0]!+option.rect[2]!/2)*box.width/480,box.y+(option.rect[1]!+option.rect[3]!/2)*box.height/270);
}
async function cell(page:Page,point:Point,click=true):Promise<void>{
  const state=await ui(page),box=(await page.locator('#canvas').boundingBox())!;
  const x=box.x+(state.grid.x+(point.x+0.5)*state.grid.size)*box.width/480;
  const y=box.y+(state.grid.y+(point.y+0.5)*state.grid.size)*box.height/270;
  await page.mouse.move(x,y);if(click)await page.mouse.click(x,y);
}
async function openBattle(page:Page,id:string):Promise<string[]>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?battle='+id);
  await expect(page.locator('#canvas')).toHaveAttribute('data-battle_active','true',{timeout:30000});
  await idle(page);return errors;
}
test('native battle displays paired units and starless assistance through real mouse and keyboard',async({page})=>{
  test.setTimeout(90000);
  const errors=await openBattle(page,'prologue_ella');
  const initial=await ui(page);expect(initial.snapshot.battle.actors.map(a=>a.id)).toContain('finn');
  await page.screenshot({path:'artifacts/screenshots/godot-g3-ella.png'});
  await choose(page,'move_body');
  await expect.poll(async()=>(await ui(page)).mode).toBe('move_body');
  await page.screenshot({path:'artifacts/screenshots/godot-g3-move.png'});
  await cell(page,{x:1,y:4});await idle(page);
  expect((await ui(page)).snapshot.battle.actors.find(a=>a.id==='ella')!.body).toEqual({x:1,y:4});
  await choose(page,'undo');await idle(page);
  expect((await ui(page)).snapshot.battle.actors.find(a=>a.id==='ella')!.body).toEqual({x:1,y:3});
  await choose(page,'guard');await idle(page);
  expect((await ui(page)).snapshot.battle.activeId).toBe('finn');
  expect((await ui(page)).options.map(o=>o.id)).not.toContain('skills');
  await choose(page,'cheer');await cell(page,{x:1,y:3});await idle(page);
  await page.screenshot({path:'artifacts/screenshots/godot-g3-after-assist.png'});
  await page.keyboard.press('c');await expect.poll(async()=>(await ui(page)).speed).toBe(1);
  await page.keyboard.press('c');await expect.poll(async()=>(await ui(page)).speed).toBe(2);
  await page.keyboard.press('r');await page.keyboard.press('m');
  expect(errors).toEqual([]);
});

const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
async function moveToward(page:Page,unit:'body'|'astral',target:Point):Promise<void>{
  const state=await idle(page),id='move_'+unit;
  if(!state.options.some(o=>o.id===id&&o.enabled))return;
  const actor=state.snapshot.battle.actors.find(a=>a.id===state.snapshot.battle.activeId)!;
  await choose(page,id);
  await expect.poll(async()=>(await ui(page)).mode).toBe(id);
  const choices=(await ui(page)).reachable.filter(p=>distance(p,target)>0).sort((a,b)=>distance(a,target)-distance(b,target)||distance(a,actor[unit]!)-distance(b,actor[unit]!)||a.y-b.y||a.x-b.x);
  if(choices[0])await cell(page,choices[0]);else await page.keyboard.press('x');
  await idle(page);
}
async function tryTarget(page:Page,choice:string,target:Point):Promise<boolean>{
  await choose(page,choice);
  await expect.poll(async()=>(await ui(page)).mode).toBe('target');
  if(choice.startsWith('skill:'))await expect.poll(async()=>(await ui(page)).selection.skillId).toBe(choice.slice(6));
  if(choice.startsWith('item:'))await expect.poll(async()=>(await ui(page)).selection.itemId).toBe(choice.slice(5));
  await cell(page,target,false);
  await expect.poll(async()=>JSON.stringify((await ui(page)).cursor)).toBe(JSON.stringify(target));
  const valid=(await ui(page)).preview.ok;
  if(valid){await cell(page,target);await idle(page);return true;}
  await page.keyboard.press('x');return false;
}
async function winByControls(page:Page):Promise<void>{
  for(let turn=0;turn<45;turn++){
    let state=await idle(page);if(state.snapshot.battle.phase!=='active')return;
    const actor=state.snapshot.battle.actors.find(a=>a.id===state.snapshot.battle.activeId)!;
    if(actor.team==='enemy')continue;
    if(actor.kind==='starless'){
      const ally=state.snapshot.battle.actors.find(a=>a.team==='player'&&a.kind!=='starless'&&a.hp>0)!;
      await moveToward(page,'body',ally.body);state=await idle(page);
      if(state.options.some(o=>o.id==='cheer'&&o.enabled)&&await tryTarget(page,'cheer',ally.body))continue;
      await choose(page,'guard');continue;
    }
    const foe=state.snapshot.battle.actors.find(a=>a.team==='enemy'&&a.hp>0)!;
    await moveToward(page,'body',foe.body);await moveToward(page,'astral',foe.body);
    await choose(page,'skills');
    let acted=false;
    for(const skill of ['flare','lamp_punch','laurel_bolt','basic_strike','rush']){
      state=await ui(page);if(!state.options.some(o=>o.id==='skill:'+skill&&o.enabled))continue;
      const target=state.snapshot.battle.actors.find(a=>a.id===foe.id)!;
      for(const point of [target.body,target.astral].filter((p):p is Point=>p!==null)){
        if(await tryTarget(page,'skill:'+skill,point)){acted=true;break;}
      }
      if(acted)break;
    }
    if(!acted){await page.keyboard.press('x');await choose(page,'guard');}
  }
  throw new Error('Native UI route did not finish within45 player turns');
}
for(const id of ['prologue_ella','prologue_shade'])test(`real native Web controls win ${id}, lose honestly, and retry`,async({page})=>{
  test.setTimeout(180000);
  const errors=await openBattle(page,id);
  await page.locator('#canvas').click({position:{x:4,y:530}});
  await page.keyboard.press('c');await page.keyboard.press('c');
  await expect.poll(async()=>(await ui(page)).speed).toBe(2);
  await winByControls(page);
  expect((await ui(page)).snapshot.battle.phase).toBe('won');
  await page.screenshot({path:`artifacts/screenshots/godot-g3-${id}-won.png`});
  await choose(page,'retry');await idle(page);
  const initial=(await ui(page)).snapshot;let spentItem=false;
  for(let turn=0;turn<100;turn++){
    const state=await idle(page);if(state.snapshot.battle.phase!=='active')break;
    const active=state.snapshot.battle.actors.find(a=>a.id===state.snapshot.battle.activeId)!;
    if(active.team==='player'){
      const hurt=state.snapshot.battle.actors.find(a=>a.team==='player'&&a.hp>0&&a.hp<a.maxHp&&distance(a.body,active.body)<=3);
      if(!spentItem&&hurt&&(state.snapshot.battle.inventory?.bread??0)>0&&state.options.some(o=>o.id==='items'&&o.enabled)){
        await choose(page,'items');
        if(await tryTarget(page,'item:bread',hurt.body)){spentItem=true;continue;}
        await page.keyboard.press('x');
      }
      await choose(page,'wait');
    }
  }
  expect((await ui(page)).snapshot.battle.phase).toBe('lost');
  if(initial.battle.inventory?.bread){expect(spentItem).toBe(true);expect((await ui(page)).snapshot.battle.inventory!.bread).toBeLessThan(initial.battle.inventory.bread);}
  await page.screenshot({path:`artifacts/screenshots/godot-g3-${id}-lost.png`});
  await choose(page,'retry');await idle(page);
  expect((await ui(page)).snapshot).toEqual(initial);
  expect(errors).toEqual([]);
});

test('terminal X and keyboard confirmation return without leaking input or changing autosaves',async({page})=>{
  test.setTimeout(180000);
  for(const [id,key] of [['prologue_ella','x'],['prologue_shade','z']] as const){
    const errors=await openBattle(page,id);
    const stored=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
    await page.locator('#canvas').click({position:{x:4,y:530}});
    await page.keyboard.press('c');await page.keyboard.press('c');
    await expect.poll(async()=>(await ui(page)).speed).toBe(2);
    await winByControls(page);
    expect((await ui(page)).snapshot.battle.phase).toBe('won');
    await page.keyboard.press(key);
    await expect(page.locator('#canvas')).toHaveAttribute('data-battle_active','false');
    await expect(page.locator('#canvas')).toHaveAttribute('data-map_id','lv.finn_house');
    expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))).toEqual(stored);
    expect(errors).toEqual([]);
  }
});
