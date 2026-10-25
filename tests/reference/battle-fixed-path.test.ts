import {expect,it} from 'vitest';
import {fighter,definition} from '../../tools/qa/battle-skill-fixtures.ts';
import {createEncounter,commandEncounter,advanceEnemy} from '../../reference/web/src/battle/encounter.ts';
import {createBattle,applyBattleCommand,type BattleCommand} from '../../reference/web/src/battle/engine.ts';
it('interrupts a blocked advertised intermediate cell even when an equal-length detour exists',()=>{
  const initial=definition({actors:[fighter('hero','player',{body:{x:1,y:2},astral:{x:0,y:2},chart:{pow:40,spd:90,rch:40,end:50,prc:50,pot:80}}),fighter('foe','enemy',{body:{x:4,y:3},astral:{x:3,y:3},chart:{pow:40,spd:50,rch:40,end:50,prc:50,pot:80},skillIds:['basic_strike']})]});
  let enc=createEncounter(initial);
  const announced=structuredClone(enc.intents.foe!);
  const moved=commandEncounter(enc,{type:'move_astral',actorId:'hero',to:{x:3,y:2}});expect(moved.ok).toBe(true);enc=moved.encounter;
  expect(enc.intents.foe!.reason).toBe('plan_blocked');
  expect(enc.intents.foe!.commands).toEqual(announced.commands);
  enc=commandEncounter(enc,{type:'wait',actorId:'hero'}).encounter;
  const result=advanceEnemy(enc);expect(result.ok).toBe(true);
  expect(result.events.some(e=>e.type==='move')).toBe(false);
  expect(result.encounter.battle.actors[0]!.hp).toBe(100);
  expect(result.events).toContainEqual({type:'cancelled_skill',actorId:'foe',skillId:'basic_strike',cost:0,outcome:'interrupted',reason:'plan_blocked'});
});
it('executes the advertised route instead of choosing a newly available shortcut',()=>{
  const state=createBattle(definition());const path=[{x:1,y:2},{x:0,y:2},{x:0,y:3},{x:1,y:3}];
  const result=applyBattleCommand(state,{type:'move_body',actorId:'finn',to:{x:1,y:3},path} as BattleCommand);
  expect(result.ok).toBe(true);expect(result.state.bodySpent).toBe(3);
  expect(result.events[0]).toMatchObject({type:'move',path});
});
it('rejects malformed fixed routes without moving or spending the turn',()=>{
  const state=createBattle(definition());
  for(const path of [null,[],[{x:1,y:3}],[{x:1,y:2},{x:2,y:3}],[{x:1,y:2},{x:2,y:2},{x:2,y:3},{x:1,y:3}],[{x:1,y:2},{x:0,y:2},{x:0,y:1},{x:1,y:1},{x:1,y:2},{x:1,y:3}]]){
    const result=applyBattleCommand(state,{type:'move_body',actorId:'finn',to:{x:1,y:3},path} as unknown as BattleCommand);
    expect(result.ok).toBe(false);expect(result.state).toEqual(state);
  }
});
it('rejects a fixed astral path that exits the tether before returning to a legal endpoint',()=>{
  const state=createBattle(definition({actors:[fighter('finn','player',{reach:2}),fighter('shade','enemy',{body:{x:6,y:2},astral:{x:5,y:2}})]}));
  const path=[{x:2,y:2},{x:3,y:2},{x:3,y:3},{x:2,y:3}];
  const result=applyBattleCommand(state,{type:'move_astral',actorId:'finn',to:{x:2,y:3},path});
  expect(result.ok).toBe(false);expect(result.state).toEqual(state);
});
