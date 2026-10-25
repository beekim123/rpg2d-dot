import {expect,it} from 'vitest';
import {BattleController} from '../src/battle/controller.ts';
import type {BattleDefinition} from '../src/battle/engine.ts';
import type {BattleActor,Point} from '../src/battle/model.ts';

function actor(id:string,team:'player'|'enemy',body:Point,astral:Point):BattleActor {
  return {id,team,order:0,body,astral,kind:'close',mode:'manifested',hp:100,maxHp:100,
    will:6,maxWill:12,shield:0,chart:{pow:65,spd:65,rch:25,end:50,prc:50,pot:80},
    reach:2,readyAt:0,skillIds:['lamp_punch','flare','laurel_heal','laurel_shield']};
}
function definition():BattleDefinition {
  return {id:'controller_test',width:6,height:5,blocked:[],actors:[
    actor('finn','player',{x:1,y:2},{x:2,y:2}),
    {...actor('shade','enemy',{x:4,y:2},{x:3,y:2}),skillIds:['basic_strike']}
  ]};
}
const setup=()=>new BattleController(definition());
const enterSkill=(controller:BattleController,index=0)=>{controller.choose(2);controller.choose(index);};

it('navigates command columns without selecting their empty last cell',()=>{
  const controller=setup();
  controller.handle('right');expect(controller.selection).toBe(4);
  controller.handle('down');controller.handle('down');expect(controller.selection).toBe(6);
  controller.handle('left');expect(controller.selection).toBe(2);
  controller.handle('down');controller.handle('right');expect(controller.selection).toBe(3);
  controller.handle('up');controller.handle('up');controller.handle('up');controller.handle('up');
  expect(controller.selection).toBe(6);
  expect(controller.options().map(option=>option.id)).toEqual(['move_body','move_astral','skills','guard','recall','undo','wait']);
});

it('uses engine movement previews without changing positions or move budgets',()=>{
  const controller=setup(),before=structuredClone(controller.encounter);
  controller.choose(0);controller.handle('down');
  expect(controller.preview()).toMatchObject({valid:true});
  expect(controller.encounter).toEqual(before);
  const events=controller.handle('confirm');
  expect(events.some(event=>event.type==='move')).toBe(true);
  expect(controller.actor.body).toEqual({x:1,y:3});expect(controller.encounter.battle.bodySpent).toBe(1);
  expect(controller.encounter.battle.turnNumber).toBe(1);expect(controller.mode).toBe('command');
});

it('rejects an illegal astral move without consuming a turn or rewriting the encounter',()=>{
  const controller=setup(),before=controller.encounter;
  controller.choose(1);controller.handle('right');controller.handle('right');
  expect(controller.preview()).toEqual({valid:false,reason:'outside_tether'});
  expect(controller.handle('confirm')).toContainEqual({type:'invalid',reason:'outside_tether'});
  expect(controller.encounter).toBe(before);expect(controller.mode).toBe('move_astral');
  expect(controller.message).toBe('battle.error.outside_tether');
});

it('cancels target selection to its skill and then command without spending the draft',()=>{
  const controller=setup();controller.choose(0);controller.clickCell({x:1,y:3});
  controller.choose(2);controller.choose(1);expect(controller.mode).toBe('target');
  controller.handle('cancel');expect(controller.mode).toBe('skills');expect(controller.selection).toBe(1);
  controller.handle('cancel');expect(controller.mode).toBe('command');expect(controller.selection).toBe(2);
  expect(controller.actor.body).toEqual({x:1,y:3});
  controller.handle('cancel');expect(controller.actor.body).toEqual({x:1,y:2});
  expect(controller.exitRequested).toBe(false);expect(controller.encounter.battle.turnNumber).toBe(1);
});

it('selects the nearest legal entity and targets its actual body or astral cell',()=>{
  const controller=setup();enterSkill(controller);
  expect(controller.cursor).toEqual({x:3,y:2});expect(controller.selectedSkillId).toBe('lamp_punch');
  const before=structuredClone(controller.encounter),preview=controller.preview();
  expect(preview).toMatchObject({valid:true,damage:18,absorbed:0});expect(controller.encounter).toEqual(before);
  const events=controller.handle('confirm');
  expect(events).toContainEqual({type:'skill',actorId:'finn',skillId:'lamp_punch',targetId:'shade',target:'astral',cost:0});
  expect(controller.encounter.battle.actors.find(entry=>entry.id==='shade')?.hp).toBe(82);
  expect(controller.isEnemyTurn).toBe(true);
});

it('never turns an empty or illegal clicked target into another enemy',()=>{
  const controller=setup();enterSkill(controller);const before=controller.encounter;
  expect(controller.clickCell({x:2,y:1})).toContainEqual({type:'invalid',reason:'target_unavailable'});
  expect(controller.cursor).toEqual({x:2,y:1});expect(controller.encounter).toBe(before);
  expect(controller.clickCell({x:4,y:2})).toContainEqual({type:'invalid',reason:'outside_skill_range'});
  expect(controller.cursor).toEqual({x:4,y:2});expect(controller.encounter).toBe(before);
});

it('distinguishes body damage and shield absorption in its actual event preview',()=>{
  const data=definition();data.actors[1]!.body={x:2,y:1};data.actors[1]!.astral={x:3,y:1};data.actors[1]!.shield=5;
  const controller=new BattleController(data);enterSkill(controller);
  expect(controller.cursor).toEqual({x:2,y:1});
  expect(controller.preview()).toEqual({valid:true,damage:22,absorbed:5});
  expect(controller.handle('confirm')).toContainEqual({type:'damage',actorId:'shade',sourceId:'finn',target:'body',damage:22,absorbed:5,hp:78});
});

it('previews real healing and shields without adding either before confirmation',()=>{
  const data=definition();data.actors[0]!.hp=70;
  const controller=new BattleController(data);enterSkill(controller,2);
  expect(controller.preview()).toEqual({valid:true,heal:27});expect(controller.actor.hp).toBe(70);
  controller.handle('cancel');controller.choose(3);
  expect(controller.preview()).toEqual({valid:true,shield:23});expect(controller.actor.shield).toBe(0);
});

it('retains the chosen skill after an unaffordable confirmation',()=>{
  const data=definition();data.actors[0]!.will=0;data.actors[1]!.lampMarks=1;
  const controller=new BattleController(data);enterSkill(controller,1);const before=controller.encounter;
  expect(controller.preview()).toEqual({valid:false,reason:'not_enough_will'});
  controller.handle('confirm');expect(controller.encounter).toBe(before);
  expect(controller.mode).toBe('target');expect(controller.selectedSkillId).toBe('flare');
});

it('offers free manifestation when recalled and keeps it when undoing subsequent movement',()=>{
  const data=definition();data.actors[0]!.astral=null;data.actors[0]!.mode='recalled';
  const controller=new BattleController(data);expect(controller.options()[4]!.id).toBe('manifest');
  controller.choose(4);expect(controller.mode).toBe('manifest');expect(controller.preview().valid).toBe(true);
  controller.handle('confirm');const manifested={...controller.actor.astral!};
  expect(controller.encounter.battle.manifestUsed).toBe(true);expect(controller.encounter.battle.turnNumber).toBe(1);
  controller.choose(0);controller.clickCell({x:0,y:2});controller.handle('cancel');
  expect(controller.actor.astral).toEqual(manifested);expect(controller.actor.mode).toBe('manifested');
  expect(controller.encounter.battle.manifestUsed).toBe(true);
});

it('blocks all player menu and board input during the enemy turn',()=>{
  const controller=setup();controller.choose(6);expect(controller.isEnemyTurn).toBe(true);
  const before=controller.encounter,mode=controller.mode,selection=controller.selection,cursor={...controller.cursor};
  for(const action of ['up','down','left','right','confirm','cancel']as const)expect(controller.handle(action)).toEqual([]);
  expect(controller.choose(3)).toEqual([]);expect(controller.clickCell({x:0,y:0})).toEqual([]);
  expect(controller.encounter).toBe(before);expect(controller.mode).toBe(mode);
  expect(controller.selection).toBe(selection);expect(controller.cursor).toEqual(cursor);
  expect(controller.advanceEnemy().length).toBeGreaterThan(0);expect(controller.encounter.battle.turnNumber).toBe(3);
  expect(controller.isEnemyTurn).toBe(false);expect(controller.mode).toBe('command');
});

it('ignores invalid option indices and board clicks outside a grid selection',()=>{
  const controller=setup(),before=controller.encounter;
  for(const index of [-1,7,0.5,NaN])expect(controller.choose(index)).toEqual([]);
  expect(controller.clickCell({x:1,y:3})).toEqual([]);expect(controller.encounter).toBe(before);
  controller.choose(0);const cursor={...controller.cursor};
  expect(controller.clickCell({x:NaN,y:2})).toContainEqual({type:'invalid',reason:'invalid_destination'});
  expect(controller.cursor).toEqual(cursor);expect(controller.encounter).toBe(before);
});

it('clamps keyboard grid selection to board bounds',()=>{
  const controller=setup();controller.choose(0);
  for(let count=0;count<8;count++){controller.handle('left');controller.handle('up');}
  expect(controller.cursor).toEqual({x:0,y:0});
  for(let count=0;count<8;count++){controller.handle('right');controller.handle('down');}
  expect(controller.cursor).toEqual({x:5,y:4});
});

it('offers return first after victory and lets the owning game perform the exit',()=>{
  const data=definition();data.actors[1]!.hp=1;
  const controller=new BattleController(data);enterSkill(controller);controller.handle('confirm');
  expect(controller.mode).toBe('outcome');expect(controller.options().map(option=>option.id)).toEqual(['return','retry']);
  expect(controller.exitRequested).toBe(false);controller.choose(0);expect(controller.exitRequested).toBe(true);
  expect(controller.encounter.battle.phase).toBe('won');
});

it('offers retry first after defeat and rebuilds pristine HP, intents and counters',()=>{
  const data=definition();data.actors[0]!.hp=1;
  const controller=new BattleController(data),fresh=structuredClone(controller.encounter);
  controller.choose(6);controller.advanceEnemy();expect(controller.encounter.battle.phase).toBe('lost');
  expect(controller.options().map(option=>option.id)).toEqual(['retry','return']);
  controller.choose(0);expect(controller.mode).toBe('command');expect(controller.exitRequested).toBe(false);
  expect(controller.encounter).toEqual(fresh);expect(controller.selection).toBe(0);
});

it('restarts from its captured definition after caller edits and an exit request',()=>{
  const data=definition();data.actors[1]!.hp=1;
  const controller=new BattleController(data),fresh=structuredClone(controller.encounter);
  data.actors[0]!.hp=10;enterSkill(controller);controller.handle('confirm');controller.choose(0);
  controller.restart();expect(controller.encounter).toEqual(fresh);expect(controller.exitRequested).toBe(false);
  expect(controller.selectedSkillId).toBe(null);expect(controller.mode).toBe('command');
});
