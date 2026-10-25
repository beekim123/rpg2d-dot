import type {ActionWeight,BattleActor,DamageTarget,IntentMode,IntentReason,Point} from './model.ts';
import {applySharedDamage,calculateDamage,manhattan,orderTimeline,rating,rescheduleActor,validateActor} from './math.ts';
import {battleRules,getSkill,hasLineOfSight} from './skills.ts';

export interface BattleGoal {kind:'survive_and_hit';actorId:string;enemyId:string;enemyActions:number}
export interface BattleDefinition { id:string;width:number;height:number;blocked:Point[];actors:BattleActor[];goal?:BattleGoal;hpFloors?:Record<string,number>;intentModes?:Record<string,IntentMode> }
export interface BattleState extends BattleDefinition {
  phase:'active'|'won'|'lost';activeId:string;turnNumber:number;time:number;
  turnStart:BattleActor;bodySpent:number;astralSpent:number;
  manifestUsed:boolean;enemyActions:Record<string,number>;hitEnemy:Record<string,string[]>;
}
export type BattleCommand={actorId:string;type:'move_body'|'move_astral';to:Point;path?:Point[]}
  |{actorId:string;type:'manifest';to:Point}
  |{actorId:string;type:'undo'|'wait'|'recall'|'guard'}
  |{actorId:string;type:'skill';skillId:string;targetId:string;target:DamageTarget}
  |{actorId:string;type:'cancelled_skill';skillId:string;outcome:'miss'|'interrupted';reason:IntentReason};
export type BattleEvent={type:'move';actorId:string;unit:'body'|'astral';from:Point;to:Point;path:Point[]}
  |{type:'tether_pull';actorId:string;from:Point;to:Point|null}
  |{type:'undo';actorId:string}|{type:'turn';actorId:string;time:number}|{type:'invalid';reason:string}
  |{type:'skill';actorId:string;skillId:string;targetId:string;target:DamageTarget;cost:number}
  |{type:'cancelled_skill';actorId:string;skillId:string;cost:number;outcome:'miss'|'interrupted';reason:IntentReason}
  |{type:'intent_status';actorId:string;status:'ready'|'interrupted';reason?:IntentReason}
  |{type:'damage';actorId:string;sourceId:string;target:DamageTarget;damage:number;absorbed:number;hp:number}
  |{type:'heal';actorId:string;sourceId:string;amount:number;hp:number}
  |{type:'shield';actorId:string;sourceId:string;amount:number;shield:number}
  |{type:'marks';actorId:string;marks:number}|{type:'ko';actorId:string}
  |{type:'hp_floor';actorId:string;prevented:number}
  |{type:'recall';actorId:string}|{type:'manifest';actorId:string;at:Point}
  |{type:'knockback';actorId:string;unit:DamageTarget;from:Point;to:Point}
  |{type:'collision';actorId:string;otherId?:string;damage:number;at:Point}
  |{type:'outcome';phase:'won'|'lost'};
export interface BattleResult {ok:boolean;state:BattleState;events:BattleEvent[]}
const directions=[{x:0,y:-1},{x:-1,y:0},{x:1,y:0},{x:0,y:1}];
const key=(p:Point)=>`${p.x},${p.y}`;
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const own=<T>(record:Record<string,T>|undefined,id:string):T|undefined=>record&&Object.hasOwn(record,id)?record[id]:undefined;
function inBounds(board:BattleDefinition,p:Point):boolean {
  return !!p&&typeof p==='object'&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<board.width&&p.y<board.height;
}
function solid(board:BattleDefinition,p:Point,ignoreId:string,ignoreUnit:'body'|'astral'):boolean {
  if(!inBounds(board,p)||board.blocked.some(b=>same(b,p)))return true;
  for(const actor of board.actors){if(actor.hp<=0)continue;
    if(!(actor.id===ignoreId&&ignoreUnit==='body')&&same(actor.body,p))return true;
    if(actor.astral&&!(actor.id===ignoreId&&ignoreUnit==='astral')&&same(actor.astral,p))return true;
  }return false;
}
function pathTo(board:BattleDefinition,actor:BattleActor,unit:'body'|'astral',to:Point,budget:number):Point[]|undefined {
  const from=unit==='body'?actor.body:actor.astral;if(!from||solid(board,to,actor.id,unit))return undefined;
  const seen=new Set<string>([key(from)]);const queue:Point[][]=[[from]];
  for(let i=0;i<queue.length;i++){const path=queue[i]!,p=path.at(-1)!;if(same(p,to))return path;if(path.length-1>=budget)continue;
    for(const d of directions){const q={x:p.x+d.x,y:p.y+d.y};if(seen.has(key(q))||solid(board,q,actor.id,unit))continue;
      // A companion cannot cross out of its tether on its way to a legal destination.
      if(unit==='astral'&&manhattan(q,actor.body)>actor.reach)continue;
      seen.add(key(q));queue.push([...path,q]);
    }
  }return undefined;
}
/** Advertised intent paths are validated exactly; never silently run BFS again. */
function fixedPath(board:BattleDefinition,actor:BattleActor,unit:DamageTarget,to:Point,budget:number,path:unknown):Point[]|undefined {
  const from=unit==='body'?actor.body:actor.astral;
  if(!from||!Array.isArray(path)||path.length===0||path.length>budget+1||path.some(p=>!inBounds(board,p)))return undefined;
  if(!same(path[0],from)||!same(path.at(-1),to))return undefined;
  for(let i=0;i<path.length;i++){
    const p=path[i] as Point;
    if(solid(board,p,actor.id,unit)||(i>0&&manhattan(path[i-1],p)!==1)||unit==='astral'&&manhattan(p,actor.body)>actor.reach)return undefined;
  }
  return structuredClone(path);
}
/** One bounded flood per unit; callers can score legal endpoints without cloning a battle per cell. */
export function reachableBattleMoves(state:BattleState,unit:DamageTarget):{to:Point;steps:number}[] {
  const actor=state.actors.find(a=>a.id===state.activeId);if(!actor||actor.hp===0||state.phase!=='active')return [];
  const from=unit==='body'?actor.body:actor.astral;if(!from)return [];
  const allowance=unit==='body'?3:({E:1,D:2,C:3,B:4,A:5,S:6}[rating(actor.chart.spd)]);
  const budget=allowance-(unit==='body'?state.bodySpent:state.astralSpent);
  const found=[{to:{...from},steps:0}],seen=new Set([key(from)]);
  for(let i=0;i<found.length;i++){
    const at=found[i]!;if(at.steps>=budget)continue;
    for(const d of directions){const to={x:at.to.x+d.x,y:at.to.y+d.y};
      if(seen.has(key(to))||solid(state,to,actor.id,unit)||unit==='astral'&&manhattan(to,actor.body)>actor.reach)continue;
      seen.add(key(to));found.push({to,steps:at.steps+1});
    }
  }
  return found;
}
function pullWithinTether(state:BattleState,actor:BattleActor):BattleEvent|undefined {
  if(!actor.astral||manhattan(actor.body,actor.astral)<=actor.reach)return undefined;
  const from=actor.astral;const possible:Point[]=[];
  for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){const p={x,y};if(manhattan(p,actor.body)<=actor.reach&&!solid(state,p,actor.id,'astral'))possible.push(p);}
  possible.sort((a,b)=>manhattan(a,from)-manhattan(b,from)||a.y-b.y||a.x-b.x);
  actor.astral=possible[0]??null;if(!actor.astral)actor.mode='recalled';
  return {type:'tether_pull',actorId:actor.id,from,to:actor.astral};
}
function validateGoal(board:BattleDefinition):void {
  const goal=board.goal;
  if(goal!==undefined){
    if(!goal||goal.kind!=='survive_and_hit'||!Number.isSafeInteger(goal.enemyActions)||goal.enemyActions<1
      ||!board.actors.some(a=>a.id===goal.actorId&&a.team==='player')||!board.actors.some(a=>a.id===goal.enemyId&&a.team==='enemy'))throw new Error('Invalid battle goal');
  }
  if(board.hpFloors!==undefined){
    if(!goal||!board.hpFloors||typeof board.hpFloors!=='object'||Array.isArray(board.hpFloors))throw new Error('Invalid HP floor');
    for(const [id,floor]of Object.entries(board.hpFloors)){
      const actor=board.actors.find(a=>a.id===id);
      if(id!==goal.enemyId||!actor||!Number.isSafeInteger(floor)||floor<1||floor>=actor.maxHp||actor.hp<floor)throw new Error('Invalid HP floor');
    }
  }
}
function outcome(state:BattleState):BattleState['phase'] {
  if(!state.actors.some(a=>a.team==='player'&&a.hp>0))return 'lost';
  if(state.goal){
    const goal=state.goal,actor=state.actors.find(a=>a.id===goal.actorId)!,enemy=state.actors.find(a=>a.id===goal.enemyId)!;
    if(actor.hp===0)return 'lost';
    if((own(state.enemyActions,enemy.id)??0)>=goal.enemyActions&&(own(state.hitEnemy,actor.id)??[]).includes(enemy.id))return 'won';
    return enemy.hp===0?'lost':'active';
  }
  return state.actors.some(a=>a.team==='enemy'&&a.hp>0)?'active':'won';
}
function settleDamage(state:BattleState,sourceId:string,target:BattleActor,unit:DamageTarget,amount:number,events:BattleEvent[]):void {
  const floor=own(state.hpFloors,target.id)??0;
  // Story protection may prevent HP loss, but a strike that penetrates the pre-hit shield still lands.
  const impact=Math.max(0,amount-target.shield);
  const allowed=Math.min(amount,target.shield+Math.max(0,target.hp-floor));
  const result=applySharedDamage(target,unit,allowed);
  const wasAlive=target.hp>0;Object.assign(target,result.actor);
  events.push({type:'damage',actorId:target.id,sourceId,target:unit,damage:result.damage,absorbed:result.absorbed,hp:target.hp});
  if(amount>allowed&&floor>0)events.push({type:'hp_floor',actorId:target.id,prevented:amount-allowed});
  if(impact>0&&target.team==='enemy'&&state.actors.some(a=>a.id===sourceId&&a.team==='player')){
    const hits=own(state.hitEnemy,sourceId)??[];
    if(!hits.includes(target.id))state.hitEnemy={...state.hitEnemy,[sourceId]:[...hits,target.id]};
  }
  if(wasAlive&&target.hp===0)events.push({type:'ko',actorId:target.id});
}
function knockback(state:BattleState,sourceId:string,target:BattleActor,unit:DamageTarget,origin:Point,distance:number,events:BattleEvent[]):void {
  const start=unit==='body'?target.body:target.astral;if(!start||target.hp===0||distance===0)return;
  let at:Point=start;
  const dx=at.x-origin.x,dy=at.y-origin.y;
  const direction=Math.abs(dx)>=Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
  if(direction.x===0&&direction.y===0)return;
  for(let step=0;step<distance;step++){
    const next:Point={x:at.x+direction.x,y:at.y+direction.y};
    if(solid(state,next,target.id,unit)){
      const blocker=state.actors.find(a=>a.hp>0&&((!(a.id===target.id&&unit==='body')&&same(a.body,next))
        ||(a.astral&&!(a.id===target.id&&unit==='astral')&&same(a.astral,next))));
      const amount=battleRules.collisionDamagePerCell*(distance-step);
      events.push({type:'collision',actorId:target.id,...(blocker?{otherId:blocker.id}:{}),damage:amount,at:next});
      settleDamage(state,sourceId,target,unit,amount,events);
      // A body and its own astral share one health pool and receive this collision only once.
      if(blocker&&blocker.id!==target.id)settleDamage(state,sourceId,blocker,same(blocker.body,next)?'body':'astral',amount,events);
      break;
    }
    const from={...at};if(unit==='body')target.body=next;else target.astral=next;at=next;
    events.push({type:'knockback',actorId:target.id,unit,from,to:next});
  }
  if(target.hp>0){const pull=pullWithinTether(state,target);if(pull)events.push(pull);}
}
function finishAction(state:BattleState,actor:BattleActor,weight:ActionWeight,events:BattleEvent[]):BattleResult {
  if(actor.team==='enemy')state.enemyActions={...state.enemyActions,[actor.id]:(own(state.enemyActions,actor.id)??0)+1};
  if(actor.hp>0)Object.assign(actor,rescheduleActor(actor,weight));
  state.phase=outcome(state);
  if(state.phase!=='active'){events.push({type:'outcome',phase:state.phase});return {ok:true,state,events};}
  const next=orderTimeline(state.actors.filter(a=>a.hp>0))[0]!;
  next.will=Math.min(next.maxWill,next.will+(next.mode==='recalled'?4:2));
  state.activeId=next.id;state.time=next.readyAt;state.turnNumber++;state.turnStart=structuredClone(next);
  state.bodySpent=0;state.astralSpent=0;state.manifestUsed=false;
  events.push({type:'turn',actorId:next.id,time:next.readyAt});return {ok:true,state,events};
}
export function createBattle(definition:BattleDefinition):BattleState {
  const board=structuredClone(definition);
  if(!board.id||!Number.isInteger(board.width)||!Number.isInteger(board.height)||board.width<1||board.height<1||board.width>64||board.height>64||board.actors.length===0)throw new Error('Invalid battle board');
  if(board.blocked.some(p=>!inBounds(board,p)))throw new Error('Invalid blocked cell');
  const ids=new Set<string>();const occupied=new Set<string>();
  for(const actor of board.actors){
    validateActor(actor);
    if(actor.skillIds?.some(id=>!getSkill(id)))throw new Error('Unknown actor skill');
    if(ids.has(actor.id)||!actor.id||!['player','enemy'].includes(actor.team)||!['close','remote'].includes(actor.kind))throw new Error('Invalid M1 actor');ids.add(actor.id);
    if(!inBounds(board,actor.body)||board.blocked.some(p=>same(p,actor.body)))throw new Error('Invalid body position');
    if(actor.hp===0){actor.mode='extinguished';actor.astral=null;continue;}
    if(!['manifested','recalled'].includes(actor.mode)||((actor.mode==='manifested')!==(actor.astral!==null)))throw new Error('Invalid manifestation');
    if(actor.astral&&(actor.reach===0||manhattan(actor.body,actor.astral)>actor.reach))throw new Error('Invalid tether');
    for(const p of [actor.body,actor.astral]){if(!p)continue;if(!inBounds(board,p)||board.blocked.some(b=>same(b,p))||occupied.has(key(p)))throw new Error('Colliding actors');occupied.add(key(p));}
  }
  validateGoal(board);
  if(board.intentModes!==undefined){
    if(!board.intentModes||typeof board.intentModes!=='object'||Array.isArray(board.intentModes))throw new Error('Invalid intent modes');
    for(const [id,mode]of Object.entries(board.intentModes))if(!board.actors.some(a=>a.id===id&&a.team==='enemy')||!['point','unit'].includes(mode))throw new Error('Invalid intent mode');
  }
  const active=orderTimeline(board.actors.filter(a=>a.hp>0))[0]??board.actors[0]!;
  const state:BattleState={...board,phase:'active',activeId:active.id,turnNumber:1,time:active.readyAt,turnStart:structuredClone(active),bodySpent:0,astralSpent:0,manifestUsed:false,enemyActions:{},hitEnemy:{}};
  state.phase=outcome(state);
  if(state.phase==='active')active.will=Math.min(active.maxWill,active.will+(active.mode==='recalled'?4:2));
  state.turnStart=structuredClone(active);return state;
}
export function applyBattleCommand(input:BattleState,command:BattleCommand):BattleResult {
  const invalid=(reason:string):BattleResult=>({ok:false,state:input,events:[{type:'invalid',reason}]});
  if(input.phase!=='active')return invalid('battle_finished');
  if(command.actorId!==input.activeId)return invalid('wrong_turn');
  const state=structuredClone(input);const actor=state.actors.find(a=>a.id===command.actorId);
  if(!actor||actor.hp===0)return invalid('actor_unavailable');
  if(command.type==='manifest'){
    if(actor.mode!=='recalled'||state.manifestUsed||state.bodySpent!==0||state.astralSpent!==0)return invalid('manifest_unavailable');
    if(!inBounds(state,command.to)||manhattan(actor.body,command.to)!==1||actor.reach<1||solid(state,command.to,actor.id,'astral'))return invalid('invalid_manifest_position');
    actor.astral=structuredClone(command.to);actor.mode='manifested';state.manifestUsed=true;
    // Undo rolls back draft movement, not the one free manifestation already accepted.
    state.turnStart.body=structuredClone(actor.body);state.turnStart.astral=structuredClone(actor.astral);state.turnStart.mode=actor.mode;
    return {ok:true,state,events:[{type:'manifest',actorId:actor.id,at:actor.astral}]};
  }
  if(command.type==='move_body'||command.type==='move_astral'){
    if(!inBounds(state,command.to))return invalid('invalid_destination');
    const unit=command.type==='move_body'?'body':'astral';
    if(unit==='astral'&&(actor.mode!=='manifested'||!actor.astral))return invalid('astral_unavailable');
    if(unit==='astral'&&manhattan(command.to,actor.body)>actor.reach)return invalid('outside_tether');
    const allowance=unit==='body'?3:({E:1,D:2,C:3,B:4,A:5,S:6}[rating(actor.chart.spd)]);
    const spent=unit==='body'?state.bodySpent:state.astralSpent;
    const path=Object.hasOwn(command,'path')?fixedPath(state,actor,unit,command.to,allowance-spent,command.path):pathTo(state,actor,unit,command.to,allowance-spent);if(!path)return invalid('unreachable');
    const from=structuredClone(unit==='body'?actor.body:actor.astral!);const to=structuredClone(command.to);
    const events:BattleEvent[]=[{type:'move',actorId:actor.id,unit,from,to,path}];
    if(unit==='body'){actor.body=to;state.bodySpent+=path.length-1;const pull=pullWithinTether(state,actor);if(pull)events.push(pull);}
    else{actor.astral=to;state.astralSpent+=path.length-1;}
    return {ok:true,state,events};
  }
  if(command.type==='undo'){
    actor.body=structuredClone(state.turnStart.body);actor.astral=structuredClone(state.turnStart.astral);actor.mode=state.turnStart.mode;state.bodySpent=0;state.astralSpent=0;
    return {ok:true,state,events:[{type:'undo',actorId:actor.id}]};
  }
  if(command.type==='wait')return finishAction(state,actor,'light',[]);
  if(command.type==='recall'){
    if(actor.mode!=='manifested'||!actor.astral)return invalid('astral_unavailable');
    actor.mode='recalled';actor.astral=null;
    return finishAction(state,actor,'light',[{type:'recall',actorId:actor.id}]);
  }
  if(command.type==='guard'){
    const before=actor.shield;actor.shield=Math.max(actor.shield,battleRules.guardShield);
    return finishAction(state,actor,'normal',[{type:'shield',actorId:actor.id,sourceId:actor.id,amount:actor.shield-before,shield:actor.shield}]);
  }
  if(command.type==='cancelled_skill'){
    const skill=getSkill(command.skillId);
    if(actor.team!=='enemy'||!skill||skill.effect!=='damage'||!(actor.skillIds??['basic_strike']).includes(skill.id))return invalid('skill_unavailable');
    if(actor.will<skill.cost)return invalid('not_enough_will');
    if(!['miss','interrupted'].includes(command.outcome)||!['actor_displaced','actor_unavailable','plan_blocked','target_unavailable','outside_skill_range','blocked_line_of_sight','empty_cell','skill_condition_lost'].includes(command.reason))return invalid('invalid_cancellation');
    actor.will-=skill.cost;
    return finishAction(state,actor,skill.weight,[{type:'cancelled_skill',actorId:actor.id,skillId:skill.id,cost:skill.cost,outcome:command.outcome,reason:command.reason}]);
  }
  if(command.type==='skill'){
    const skill=getSkill(command.skillId),target=state.actors.find(a=>a.id===command.targetId);
    if(!skill||!(actor.skillIds??['basic_strike']).includes(command.skillId))return invalid('skill_unavailable');
    if(actor.mode!=='manifested'||!actor.astral||actor.reach===0||manhattan(actor.body,actor.astral)>actor.reach)return invalid('astral_unavailable');
    if(!target||target.hp===0||(command.target!=='body'&&command.target!=='astral'))return invalid('target_unavailable');
    const position=command.target==='body'?target.body:target.mode==='manifested'?target.astral:null;
    if(!position)return invalid('target_unavailable');
    if((skill.effect==='damage')===(target.team===actor.team))return invalid('wrong_target_team');
    if(manhattan(actor.astral,position)>skill.range)return invalid('outside_skill_range');
    if(!hasLineOfSight(actor.astral,position,state.blocked))return invalid('blocked_line_of_sight');
    if(actor.will<skill.cost)return invalid('not_enough_will');
    const marks=target.lampMarks??0;if(skill.consumeMarks&&marks===0)return invalid('no_lamp_marks');
    const events:BattleEvent[]=[{type:'skill',actorId:actor.id,skillId:skill.id,targetId:target.id,target:command.target,cost:skill.cost}];
    actor.will-=skill.cost;
    if(skill.effect==='damage'){
      const amount=calculateDamage({power:skill.power*(skill.consumeMarks?marks:1),attackerPower:actor.chart.pow,defenderEndurance:target.chart.end,
        distance:manhattan(actor.body,actor.astral),reach:actor.reach,target:command.target,recalled:target.mode==='recalled'});
      const origin={...actor.astral};settleDamage(state,actor.id,target,command.target,amount,events);
      if(skill.consumeMarks){target.lampMarks=0;events.push({type:'marks',actorId:target.id,marks:0});}
      if(skill.lampMarks){target.lampMarks=Math.min(3,(target.lampMarks??0)+skill.lampMarks);events.push({type:'marks',actorId:target.id,marks:target.lampMarks});}
      if(skill.knockback)knockback(state,actor.id,target,command.target,origin,skill.knockback,events);
    }else if(skill.effect==='heal'){
      const amount=Math.min(target.maxHp-target.hp,skill.power+Math.floor(actor.chart.prc/battleRules.precisionDivisor));
      target.hp+=amount;events.push({type:'heal',actorId:target.id,sourceId:actor.id,amount,hp:target.hp});
    }else{
      const before=target.shield;target.shield=Math.max(target.shield,skill.power+Math.floor(actor.chart.prc/battleRules.precisionDivisor));
      events.push({type:'shield',actorId:target.id,sourceId:actor.id,amount:target.shield-before,shield:target.shield});
    }
    return finishAction(state,actor,skill.weight,events);
  }
  return invalid('unknown_command');
}
