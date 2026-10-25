import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {battles} from '../../reference/web/src/battle/content.ts';
import {planPlayerTurn} from '../../reference/web/src/battle/ai.ts';
import {advanceEnemy,commandEncounter,createEncounter,type Encounter} from '../../reference/web/src/battle/encounter.ts';
import type {BattleCommand,BattleDefinition,BattleEvent} from '../../reference/web/src/battle/engine.ts';

type RouteStep={kind:'player';command:BattleCommand}|{kind:'enemy';actorId:string};
export interface BattleRouteResult {encounter:Encounter;steps:RouteStep[];events:BattleEvent[]}

/** Every step passes through the same encounter interface as player input; no HP or timeline edits. */
export function runBattleRoute(definition:BattleDefinition,strategy:'attack'|'wait'='attack'):BattleRouteResult {
  let encounter=createEncounter(definition);const steps:RouteStep[]=[],events:BattleEvent[]=[];
  for(let action=0;action<80&&encounter.battle.phase==='active';action++){
    const actor=encounter.battle.actors.find(a=>a.id===encounter.battle.activeId)!;
    if(actor.team==='enemy'){
      const result=advanceEnemy(encounter);assert.ok(result.ok,JSON.stringify(result.events));
      steps.push({kind:'enemy',actorId:actor.id});events.push(...result.events);encounter=result.encounter;
    }else{
      const commands=strategy==='wait'?[{type:'wait' as const,actorId:actor.id}]:planPlayerTurn(encounter);
      assert.ok(commands.length>0,'The player route needs a legal main action');
      const turn=encounter.battle.turnNumber;
      for(const command of commands){
        const result=commandEncounter(encounter,command);assert.ok(result.ok,JSON.stringify({command,events:result.events}));
        steps.push({kind:'player',command});events.push(...result.events);encounter=result.encounter;
      }
      assert.ok(encounter.battle.turnNumber>turn||encounter.battle.phase!=='active','The player route must finish its turn');
    }
  }
  assert.notEqual(encounter.battle.phase,'active','Battle route exceeded 80 real actions');
  return {encounter,steps,events};
}

export function verifyBattlePlaythrough():void {
  for(const [id,definition]of Object.entries(battles)){
    const pristine=structuredClone(definition),initial=createEncounter(definition);
    const win=runBattleRoute(definition),repeated=runBattleRoute(definition),loss=runBattleRoute(definition,'wait');
    assert.equal(win.encounter.battle.phase,'won');assert.deepEqual(repeated,win,'Deterministic route diverged');
    assert.equal(loss.encounter.battle.phase,'lost');assert.deepEqual(createEncounter(definition),initial,'Retry leaked battle state');
    const retry=runBattleRoute(definition);assert.equal(retry.encounter.battle.phase,'won');assert.deepEqual(definition,pristine);
    const player=definition.actors.find(a=>a.team==='player')!,enemy=definition.actors.find(a=>a.team==='enemy')!;
    assert.ok(win.events.some(e=>e.type==='damage'&&e.sourceId===player.id&&e.damage>0),'Missing effective player hit');
    assert.ok(win.events.some(e=>e.type==='damage'&&e.sourceId===enemy.id&&e.damage>0),'Missing genuine incoming damage');
    if(definition.goal){
      assert.equal(win.encounter.battle.enemyActions[enemy.id],3);
      assert.ok(win.encounter.battle.hitEnemy[player.id]?.includes(enemy.id));
      assert.equal(win.steps.filter(step=>step.kind==='enemy').length,3);
    }
    console.log(`${id}: won; player HP ${win.encounter.battle.actors.find(a=>a.id===player.id)!.hp}; enemy actions ${win.encounter.battle.enemyActions[enemy.id]??0}; deterministic replay, loss and clean retry passed`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)verifyBattlePlaythrough();
