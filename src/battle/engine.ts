import type {BattleActor,Point} from './model.ts';
import {manhattan,orderTimeline,rating,rescheduleActor,validateActor} from './math.ts';

export interface BattleDefinition { id:string;width:number;height:number;blocked:Point[];actors:BattleActor[] }
export interface BattleState extends BattleDefinition {
  phase:'active'|'won'|'lost';activeId:string;turnNumber:number;time:number;
  turnStart:BattleActor;bodySpent:number;astralSpent:number;
}
export type BattleCommand={actorId:string;type:'move_body'|'move_astral';to:Point}|{actorId:string;type:'undo'|'wait'};
export type BattleEvent={type:'move';actorId:string;unit:'body'|'astral';from:Point;to:Point;path:Point[]}
  |{type:'tether_pull';actorId:string;from:Point;to:Point|null}
  |{type:'undo';actorId:string}|{type:'turn';actorId:string;time:number}|{type:'invalid';reason:string};
export interface BattleResult {ok:boolean;state:BattleState;events:BattleEvent[]}
const directions=[{x:0,y:-1},{x:-1,y:0},{x:1,y:0},{x:0,y:1}];
const key=(p:Point)=>`${p.x},${p.y}`;
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
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
function pullWithinTether(state:BattleState,actor:BattleActor):BattleEvent|undefined {
  if(!actor.astral||manhattan(actor.body,actor.astral)<=actor.reach)return undefined;
  const from=actor.astral;const possible:Point[]=[];
  for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){const p={x,y};if(manhattan(p,actor.body)<=actor.reach&&!solid(state,p,actor.id,'astral'))possible.push(p);}
  possible.sort((a,b)=>manhattan(a,from)-manhattan(b,from)||a.y-b.y||a.x-b.x);
  actor.astral=possible[0]??null;if(!actor.astral)actor.mode='recalled';
  return {type:'tether_pull',actorId:actor.id,from,to:actor.astral};
}
export function createBattle(definition:BattleDefinition):BattleState {
  const board=structuredClone(definition);
  if(!board.id||!Number.isInteger(board.width)||!Number.isInteger(board.height)||board.width<1||board.height<1||board.width>64||board.height>64||board.actors.length===0)throw new Error('Invalid battle board');
  if(board.blocked.some(p=>!inBounds(board,p)))throw new Error('Invalid blocked cell');
  const ids=new Set<string>();const occupied=new Set<string>();
  for(const actor of board.actors){
    validateActor(actor);
    if(ids.has(actor.id)||!actor.id||!['player','enemy'].includes(actor.team)||!['close','remote'].includes(actor.kind))throw new Error('Invalid M1 actor');ids.add(actor.id);
    if(!inBounds(board,actor.body)||board.blocked.some(p=>same(p,actor.body)))throw new Error('Invalid body position');
    if(actor.hp===0){actor.mode='extinguished';actor.astral=null;continue;}
    if(!['manifested','recalled'].includes(actor.mode)||((actor.mode==='manifested')!==(actor.astral!==null)))throw new Error('Invalid manifestation');
    if(actor.astral&&(actor.reach===0||manhattan(actor.body,actor.astral)>actor.reach))throw new Error('Invalid tether');
    for(const p of [actor.body,actor.astral]){if(!p)continue;if(!inBounds(board,p)||board.blocked.some(b=>same(b,p))||occupied.has(key(p)))throw new Error('Colliding actors');occupied.add(key(p));}
  }
  const active=orderTimeline(board.actors.filter(a=>a.hp>0))[0]??board.actors[0]!;
  const phase=!board.actors.some(a=>a.hp>0&&a.team==='player')?'lost':!board.actors.some(a=>a.hp>0&&a.team==='enemy')?'won':'active';
  if(phase==='active')active.will=Math.min(active.maxWill,active.will+(active.mode==='recalled'?4:2));
  return {...board,phase,activeId:active.id,turnNumber:1,time:active.readyAt,turnStart:structuredClone(active),bodySpent:0,astralSpent:0};
}
export function applyBattleCommand(input:BattleState,command:BattleCommand):BattleResult {
  const invalid=(reason:string):BattleResult=>({ok:false,state:input,events:[{type:'invalid',reason}]});
  if(input.phase!=='active')return invalid('battle_finished');
  if(command.actorId!==input.activeId)return invalid('wrong_turn');
  const state=structuredClone(input);const actor=state.actors.find(a=>a.id===command.actorId);
  if(!actor||actor.hp===0)return invalid('actor_unavailable');
  if(command.type==='move_body'||command.type==='move_astral'){
    if(!inBounds(state,command.to))return invalid('invalid_destination');
    const unit=command.type==='move_body'?'body':'astral';
    if(unit==='astral'&&(actor.mode!=='manifested'||!actor.astral))return invalid('astral_unavailable');
    if(unit==='astral'&&manhattan(command.to,actor.body)>actor.reach)return invalid('outside_tether');
    const allowance=unit==='body'?3:({E:1,D:2,C:3,B:4,A:5,S:6}[rating(actor.chart.spd)]);
    const spent=unit==='body'?state.bodySpent:state.astralSpent;
    const path=pathTo(state,actor,unit,command.to,allowance-spent);if(!path)return invalid('unreachable');
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
  if(command.type==='wait'){
    const index=state.actors.findIndex(a=>a.id===actor.id);state.actors[index]=rescheduleActor(actor,'light');
    const next=orderTimeline(state.actors.filter(a=>a.hp>0))[0]!;next.will=Math.min(next.maxWill,next.will+(next.mode==='recalled'?4:2));
    state.activeId=next.id;state.time=next.readyAt;state.turnNumber++;state.turnStart=structuredClone(next);state.bodySpent=0;state.astralSpent=0;
    return {ok:true,state,events:[{type:'turn',actorId:next.id,time:next.readyAt}]};
  }
  return invalid('unknown_command');
}
