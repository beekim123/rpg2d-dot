import {applyBattleCommand,createBattle,type BattleCommand,type BattleDefinition,type BattleEvent,type BattleState} from './engine.ts';
import {forecastIntentDamage,intentInterruption,planEnemyIntent,type EnemyIntent} from './ai.ts';

export type {EnemyIntent} from './ai.ts';
export interface Encounter {battle:BattleState;intents:Record<string,EnemyIntent>}
export interface EncounterResult {ok:boolean;encounter:Encounter;events:BattleEvent[]}

function invalid(encounter:Encounter,reason:string):EncounterResult {return {ok:false,encounter,events:[{type:'invalid',reason}]};}
function refreshStatus(encounter:Encounter,events:BattleEvent[]):Encounter {
  let intents:Record<string,EnemyIntent>={};
  for(const [id,intent]of Object.entries(encounter.intents)){
    const reason=intentInterruption(encounter.battle,intent),status=reason?'interrupted':'ready';
    const {reason:previousReason,...rest}=intent;
    const expectedDamage=reason?0:forecastIntentDamage(encounter.battle,intent);
    intents={...intents,[id]:{...rest,status,expectedDamage,...(reason?{reason}:{})}};
    if(status!==intent.status||reason!==previousReason)events.push({type:'intent_status',actorId:id,status,...(reason?{reason}:{})});
  }
  return {battle:encounter.battle,intents};
}
export function createEncounter(definition:BattleDefinition):Encounter {
  const battle=createBattle(definition);
  const intents:Record<string,EnemyIntent>=Object.fromEntries(battle.phase==='active'
    ?battle.actors.filter(a=>a.team==='enemy'&&a.hp>0).map(actor=>[actor.id,planEnemyIntent(battle,actor.id)]):[]);
  return {battle,intents};
}
export function commandEncounter(encounter:Encounter,command:BattleCommand):EncounterResult {
  const actor=encounter.battle.actors.find(a=>a.id===command.actorId);
  if(!actor||actor.team!=='player'||command.type==='cancelled_skill')return invalid(encounter,'player_command_required');
  const result=applyBattleCommand(encounter.battle,command);
  if(!result.ok)return {ok:false,encounter,events:result.events};
  return {ok:true,encounter:refreshStatus({battle:result.state,intents:encounter.intents},result.events),events:result.events};
}
export function advanceEnemy(encounter:Encounter):EncounterResult {
  const state=encounter.battle,actor=state.actors.find(a=>a.id===state.activeId);
  if(state.phase!=='active'||!actor||actor.team!=='enemy')return invalid(encounter,'enemy_turn_required');
  const intent=encounter.intents[actor.id];if(!intent)return invalid(encounter,'intent_unavailable');
  const reason=intentInterruption(state,intent);let battle=state;const events:BattleEvent[]=[];
  if(!reason)for(const command of intent.commands.slice(0,-1)){
    const result=applyBattleCommand(battle,command);if(!result.ok)return invalid(encounter,'invalid_intent_plan');
    battle=result.state;events.push(...result.events);
  }
  let command=intent.commands.at(-1)!;
  if(intent.skillId){
    if(reason)command={type:'cancelled_skill',actorId:actor.id,skillId:intent.skillId,outcome:'interrupted',reason};
    else if(intent.mode==='point'){
      const occupant=battle.actors.filter(a=>a.team!==actor.team&&a.hp>0).flatMap(a=>[
        {actor:a,target:'body' as const,cell:a.body},...(a.astral?[{actor:a,target:'astral' as const,cell:a.astral}]:[])
      ]).find(entry=>entry.cell.x===intent.cell!.x&&entry.cell.y===intent.cell!.y);
      command=occupant?{type:'skill',actorId:actor.id,skillId:intent.skillId,targetId:occupant.actor.id,target:occupant.target}
        :{type:'cancelled_skill',actorId:actor.id,skillId:intent.skillId,outcome:'miss',reason:'empty_cell'};
    }
  }
  const result=applyBattleCommand(battle,command);
  if(!result.ok)return {ok:false,encounter,events:result.events};
  battle=result.state;events.push(...result.events);
  const intents={...encounter.intents};
  if(battle.phase==='active'&&battle.actors.some(a=>a.id===actor.id&&a.hp>0))intents[actor.id]=planEnemyIntent(battle,actor.id);
  else delete intents[actor.id];
  return {ok:true,encounter:refreshStatus({battle,intents},events),events};
}
