import {applyBattleCommand,reachableBattleMoves,type BattleCommand,type BattleState} from './engine.ts';
import {calculateDamage,manhattan} from './math.ts';
import {getSkill,hasLineOfSight} from './skills.ts';
import type {BattleActor,DamageTarget,IntentMode,IntentReason,Point} from './model.ts';
import type {Encounter} from './encounter.ts';

export interface EnemyIntent {
  actorId:string;mode:IntentMode;skillId?:string;targetId?:string;target?:DamageTarget;cell?:Point;
  expectedDamage:number;status:'ready'|'interrupted';reason?:IntentReason;
  commands:BattleCommand[];origin:{body:Point;astral:Point|null};
}
interface Plan {commands:BattleCommand[];damage:number;score:number[]}
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const actorIn=(state:BattleState,id:string)=>state.actors.find(a=>a.id===id)!;
function better(a:Plan,b:Plan):boolean {
  for(let i=0;i<a.score.length;i++){if(a.score[i]!==b.score[i])return a.score[i]!>b.score[i]!;}return false;
}
/** Only a view: commands clone before mutation, so planning never changes the input or its actor objects. */
export function actorTurnView(state:BattleState,actorId:string):BattleState {
  return {...state,activeId:actorId,turnStart:actorIn(state,actorId),bodySpent:0,astralSpent:0,manifestUsed:false};
}
function distanceToOpponents(at:Point,targets:BattleActor[]):number {
  return Math.min(...targets.flatMap(a=>[a.body,...(a.astral?[a.astral]:[])]).map(p=>manhattan(at,p)));
}
function planTurn(input:BattleState):Plan {
  const actor=actorIn(input,input.activeId),targets=input.actors.filter(a=>a.hp>0&&a.team!==actor.team);
  let state=input,prefix:BattleCommand[]=[];
  if(actor.mode==='recalled'){
    const adjacent=[{x:actor.body.x,y:actor.body.y-1},{x:actor.body.x-1,y:actor.body.y},{x:actor.body.x+1,y:actor.body.y},{x:actor.body.x,y:actor.body.y+1}]
      .filter(p=>p.x>=0&&p.y>=0).sort((a,b)=>distanceToOpponents(a,targets)-distanceToOpponents(b,targets)||a.y-b.y||a.x-b.x);
    for(const to of adjacent){const command:BattleCommand={type:'manifest',actorId:actor.id,to},result=applyBattleCommand(state,command);
      if(result.ok){state=result.state;prefix=[command];break;}
    }
  }
  let best:Plan={commands:[...prefix,{type:'wait',actorId:actor.id}],damage:0,score:[0,0,0,-Infinity,0,0]};
  if(!targets.length)return best;
  // At most twelve body endpoints, each with one small astral flood. No attack tree or full-board cloning.
  const bodyMoves=reachableBattleMoves(state,'body').sort((a,b)=>Number(a.steps>0)-Number(b.steps>0)
    ||distanceToOpponents(a.to,targets)-distanceToOpponents(b.to,targets)||a.steps-b.steps||a.to.y-b.to.y||a.to.x-b.to.x).slice(0,12);
  for(const bodyMove of bodyMoves){
    const bodyCommand:BattleCommand={type:'move_body',actorId:actor.id,to:bodyMove.to};
    const moved=bodyMove.steps?applyBattleCommand(state,bodyCommand):{ok:true,state};if(!moved.ok)continue;
    const bodyState=moved.state,current=actorIn(bodyState,actor.id);
    const bodyCommands=bodyMove.steps?[...prefix,bodyCommand]:prefix;
    const astralMoves=reachableBattleMoves(bodyState,'astral');
    if(!astralMoves.length){
      const candidate:Plan={commands:[...bodyCommands,{type:'wait',actorId:actor.id}],damage:0,score:[0,0,0,-distanceToOpponents(current.body,targets),-bodyMove.steps,0]};
      if(better(candidate,best))best=candidate;continue;
    }
    for(const astralMove of astralMoves){
      const commands:BattleCommand[]=astralMove.steps?[...bodyCommands,{type:'move_astral',actorId:actor.id,to:astralMove.to}]:bodyCommands;
      const steps=bodyMove.steps+astralMove.steps,distance=distanceToOpponents(astralMove.to,targets);
      const approach:Plan={commands:[...commands,{type:'wait',actorId:actor.id}],damage:0,score:[0,0,0,-distance,-steps,0]};
      if(better(approach,best))best=approach;
      for(const target of targets)for(const unit of ['body','astral'] as const){
        const at=unit==='body'?target.body:target.astral;if(!at)continue;
        for(const skillId of current.skillIds??['basic_strike']){
          const skill=getSkill(skillId);if(!skill||skill.effect!=='damage'||current.will<skill.cost||skill.consumeMarks&&!(target.lampMarks??0))continue;
          if(manhattan(astralMove.to,at)>skill.range||!hasLineOfSight(astralMove.to,at,bodyState.blocked))continue;
          const raw=calculateDamage({power:skill.power*(skill.consumeMarks?(target.lampMarks??0):1),attackerPower:current.chart.pow,defenderEndurance:target.chart.end,
            distance:manhattan(current.body,astralMove.to),reach:current.reach,target:unit,recalled:target.mode==='recalled'});
          const damage=Math.min(target.hp,Math.max(0,raw-target.shield));
          const candidate:Plan={commands:[...commands,{type:'skill',actorId:actor.id,skillId,targetId:target.id,target:unit}],damage,
            score:[damage>=target.hp?1:0,damage,unit==='body'?1:0,-steps,-distance,-skill.cost]};
          if(better(candidate,best))best=candidate;
        }
      }
    }
  }
  return best;
}

export function planEnemyIntent(state:BattleState,actorId:string):EnemyIntent {
  const actor=actorIn(state,actorId),plan=planTurn(actorTurnView(state,actorId)),action=plan.commands.at(-1)!;
  // Freeze each intermediate cell when announcing, not merely the destination.
  let projected=actorTurnView(state,actorId);
  for(let i=0;i<plan.commands.length-1;i++){
    const command=plan.commands[i]!,result=applyBattleCommand(projected,command);
    if(!result.ok)throw new Error('Planner produced an invalid movement prefix');
    if(command.type==='move_body'||command.type==='move_astral'){
      const movement=result.events.find(event=>event.type==='move');
      if(!movement||movement.type!=='move')throw new Error('Missing planned movement path');
      plan.commands[i]={...command,path:structuredClone(movement.path)};
    }
    projected=result.state;
  }
  const mode=state.intentModes&&Object.hasOwn(state.intentModes,actorId)?state.intentModes[actorId]!:'unit';
  const intent:EnemyIntent={actorId,mode,expectedDamage:plan.damage,status:'ready',commands:plan.commands,
    origin:{body:{...actor.body},astral:actor.astral?{...actor.astral}:null}};
  if(action.type==='skill'){
    const target=actorIn(state,action.targetId),cell=action.target==='body'?target.body:target.astral!;
    Object.assign(intent,{skillId:action.skillId,targetId:action.targetId,target:action.target,cell:{...cell}});
  }
  intent.expectedDamage=forecastIntentDamage(state,intent);
  return intent;
}

/** The target ID, target unit, cell and commands never change between announcements. */
export function intentInterruption(state:BattleState,intent:EnemyIntent):IntentReason|undefined {
  const actor=state.actors.find(a=>a.id===intent.actorId);
  if(!actor||actor.hp===0)return 'actor_unavailable';
  if(!same(actor.body,intent.origin.body)||!!actor.astral!==!!intent.origin.astral
    ||actor.astral&&intent.origin.astral&&!same(actor.astral,intent.origin.astral))return 'actor_displaced';
  let projected=actorTurnView(state,actor.id);
  for(const command of intent.commands.slice(0,-1)){
    const result=applyBattleCommand(projected,command);if(!result.ok)return 'plan_blocked';projected=result.state;
  }
  if(!intent.skillId)return undefined;
  const target=state.actors.find(a=>a.id===intent.targetId);
  if(!target||target.hp===0||intent.target==='astral'&&!target.astral)return 'target_unavailable';
  const origin=actorIn(projected,actor.id).astral;
  if(!origin)return 'actor_unavailable';
  const cell=intent.mode==='point'?intent.cell:intent.target==='body'?target.body:target.astral;
  if(!cell)return 'target_unavailable';
  const skill=getSkill(intent.skillId)!;
  const conditionalTarget=intent.mode==='unit'?target:state.actors.find(a=>a.hp>0&&a.team!==actor.team
    &&(same(a.body,cell)||a.astral&&same(a.astral,cell)));
  if(skill.consumeMarks&&conditionalTarget&&!(conditionalTarget.lampMarks??0))return 'skill_condition_lost';
  if(manhattan(origin,cell)>skill.range)return 'outside_skill_range';
  if(!hasLineOfSight(origin,cell,state.blocked))return 'blocked_line_of_sight';
  return undefined;
}

/** Replays only the fixed plan, so shield, recall, floors and target collisions use the real settlement rules. */
export function forecastIntentDamage(state:BattleState,intent:EnemyIntent):number {
  const action=intent.commands.at(-1);
  if(state.phase!=='active'||action?.type!=='skill'||intentInterruption(state,intent))return 0;
  let projected=actorTurnView(state,intent.actorId);
  for(const command of intent.commands.slice(0,-1)){
    const result=applyBattleCommand(projected,command);if(!result.ok)return 0;projected=result.state;
  }
  let command=action;
  if(intent.mode==='point'){
    const actor=actorIn(projected,intent.actorId),cell=intent.cell;
    if(!cell)return 0;
    const occupant=projected.actors.filter(a=>a.team!==actor.team&&a.hp>0).flatMap(a=>[
      {actor:a,target:'body' as const,cell:a.body},...(a.astral?[{actor:a,target:'astral' as const,cell:a.astral}]:[])
    ]).find(entry=>same(entry.cell,cell));
    if(!occupant)return 0;
    command={...action,targetId:occupant.actor.id,target:occupant.target};
  }
  const target=projected.actors.find(a=>a.id===command.targetId);if(!target)return 0;
  const result=applyBattleCommand(projected,command);if(!result.ok)return 0;
  // Other owners hit by a collision are separate victims, not extra damage on this intended target.
  return Math.max(0,target.hp-actorIn(result.state,target.id).hp);
}

/** Returns legal commands for a real current player turn; the caller still executes each command normally. */
export function planPlayerTurn(encounter:Encounter):BattleCommand[] {
  const state=encounter.battle,actor=actorIn(state,state.activeId);
  if(state.phase!=='active'||actor.team!=='player')return [];
  if(state.goal&&actor.id===state.goal.actorId&&Object.hasOwn(state.hitEnemy,actor.id)
    &&state.hitEnemy[actor.id]!.includes(state.goal.enemyId))return [{type:'guard',actorId:actor.id}];
  return planTurn(state).commands;
}
