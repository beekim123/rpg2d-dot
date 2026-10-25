import {expect,it} from 'vitest';
import {createBattle,applyBattleCommand} from '../../reference/web/src/battle/engine.ts';
import type {BattleActor} from '../../reference/web/src/battle/model.ts';
function actor(id:string,team:'player'|'enemy',x:number):BattleActor{return {id,team,order:team==='player'?0:1,body:{x,y:2},astral:{x:x+(team==='player'?1:-1),y:2},kind:'close',mode:'manifested',hp:100,maxHp:100,will:6,maxWill:12,shield:0,chart:{pow:65,spd:65,rch:25,end:50,prc:50,pot:80},reach:2,readyAt:0};}
const setup=()=>createBattle({id:'test',width:8,height:6,blocked:[],actors:[actor('finn','player',1),actor('shade','enemy',6)]});
it('starts deterministically with the player on a tied timeline',()=>{
  const state=setup();expect(state.activeId).toBe('finn');expect(state.turnNumber).toBe(1);
});
it('cannot pass through a blocking astral even if Manhattan distance fits',()=>{
  const state=setup();const result=applyBattleCommand(state,{actorId:'finn',type:'move_body',to:{x:3,y:2}});
  expect(result.ok).toBe(false);expect(result.state).toBe(state);
});
it('pulls an astral to the nearest available tether cell with deterministic tie order',()=>{
  const state=setup();const result=applyBattleCommand(state,{actorId:'finn',type:'move_body',to:{x:1,y:4}});
  expect(result.ok).toBe(true);expect(result.state.actors[0]!.body).toEqual({x:1,y:4});
  expect(result.state.actors[0]!.astral).toEqual({x:1,y:2});
  expect(state.actors[0]!.body).toEqual({x:1,y:2});
  expect(result.events.map(e=>e.type)).toEqual(['move','tether_pull']);
});
it('does not grant extra movement by issuing a second move command',()=>{
  let state=setup();state=applyBattleCommand(state,{actorId:'finn',type:'move_body',to:{x:1,y:4}}).state;
  const result=applyBattleCommand(state,{actorId:'finn',type:'move_body',to:{x:4,y:4}});
  expect(result.ok).toBe(false);expect(result.state.actors[0]!.body).toEqual({x:1,y:4});
});
it('undo restores body, astral and manifestation after a draft move',()=>{
  const original=setup();let state=applyBattleCommand(original,{actorId:'finn',type:'move_body',to:{x:1,y:4}}).state;
  state=applyBattleCommand(state,{actorId:'finn',type:'undo'}).state;
  expect(state.actors).toEqual(original.actors);expect(state.activeId).toBe('finn');
});
it('rejects an out-of-tether astral destination and an occupied destination',()=>{
  const state=setup();
  expect(applyBattleCommand(state,{actorId:'finn',type:'move_astral',to:{x:4,y:2}}).ok).toBe(false);
  expect(applyBattleCommand(state,{actorId:'finn',type:'move_astral',to:{x:1,y:2}}).ok).toBe(false);
});
it('supports moving each unit before committing one wait action',()=>{
  let state=setup();state=applyBattleCommand(state,{actorId:'finn',type:'move_astral',to:{x:2,y:3}}).state;
  const move=applyBattleCommand(state,{actorId:'finn',type:'move_body',to:{x:2,y:2}});expect(move.ok).toBe(true);
  const end=applyBattleCommand(move.state,{actorId:'finn',type:'wait'});expect(end.ok).toBe(true);
  expect(end.state.activeId).toBe('shade');expect(end.state.turnNumber).toBe(2);
  expect(end.state.actors[0]!.readyAt).toBe(70);expect(end.state.actors[1]!.will).toBe(8);
});
it('rejects wrong-turn, fractional, out-of-bounds and terminal commands without mutation',()=>{
  const state=setup();
  expect(applyBattleCommand(state,{actorId:'shade',type:'wait'}).state).toBe(state);
  for(const to of [{x:1.5,y:2},{x:-1,y:2},{x:1,y:9},{x:NaN,y:2}]) {
    expect(applyBattleCommand(state,{actorId:'finn',type:'move_body',to}).ok).toBe(false);
    expect(applyBattleCommand(state,{actorId:'finn',type:'move_astral',to}).ok).toBe(false);
  }
  expect(applyBattleCommand({...state,phase:'won'},{actorId:'finn',type:'wait'}).ok).toBe(false);
});
it('rejects colliding initial actors and invalid manifest positions',()=>{
  const a=actor('finn','player',1),b=actor('shade','enemy',1);
  expect(()=>createBattle({id:'bad',width:8,height:6,blocked:[],actors:[a,b]})).toThrow();
  a.astral={x:7,y:5};expect(()=>createBattle({id:'bad',width:8,height:6,blocked:[],actors:[a,actor('shade','enemy',6)]})).toThrow();
});

it('rejects a missing movement target through the normal invalid-command result',()=>{
  const state=setup();
  for(const to of [null,undefined]){
    const command={actorId:'finn',type:'move_body',to} as unknown as Parameters<typeof applyBattleCommand>[1];
    expect(applyBattleCommand(state,command).ok).toBe(false);
  }
});
it('validates defeated records instead of letting them bypass the actor contract',()=>{
  const dead=actor('shade','enemy',6);dead.hp=0;dead.mode='extinguished';dead.astral=null;dead.chart={} as BattleActor['chart'];
  expect(()=>createBattle({id:'bad',width:8,height:6,blocked:[],actors:[actor('finn','player',1),dead]})).toThrow();
});
