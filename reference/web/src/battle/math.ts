import balance from '../../../../content/data/battle-balance.json' with { type: 'json' };
import type { ActionWeight, BattleActor, DamageInput, DamageTarget, Point, Rating, SharedDamageResult } from './model.ts';

function integer(value:number,name:string,min=0,max=Number.MAX_SAFE_INTEGER):void {
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`Invalid ${name}`);
}

function chartValue(value:number):void {
  integer(value,'chart value',balance.chart.minimum,balance.chart.maximum);
}

function point(value:Point):void {
  if(!value||typeof value!=='object')throw new RangeError('Invalid battle position');
  integer(value.x,'position x');integer(value.y,'position y');
}

function damageTarget(target:DamageTarget):void {
  if(target!=='body'&&target!=='astral')throw new RangeError('Invalid damage target');
}

export function validateActor(actor:BattleActor):void {
  if(!actor||typeof actor!=='object'||typeof actor.id!=='string'||!/^[\x21-\x7e]+$/.test(actor.id))throw new RangeError('Invalid actor id');
  if(actor.team!=='player'&&actor.team!=='enemy')throw new RangeError('Invalid actor team');
  if(!['close','remote','auto','swarm','set','field'].includes(actor.kind))throw new RangeError('Invalid astral type');
  if(!['manifested','recalled','extinguished'].includes(actor.mode))throw new RangeError('Invalid astral mode');
  integer(actor.order,'actor order');integer(actor.readyAt,'ready tick');integer(actor.reach,'reach');
  integer(actor.maxHp,'maximum HP',1);integer(actor.hp,'HP',0,actor.maxHp);
  integer(actor.maxWill,'maximum will');integer(actor.will,'will',0,actor.maxWill);integer(actor.shield,'shield');
  point(actor.body);if(actor.astral!==null)point(actor.astral);
  if((actor.mode==='manifested')!==(actor.astral!==null)||actor.hp===0&&actor.mode!=='extinguished')throw new RangeError('Inconsistent astral manifestation');
  if(!actor.chart||typeof actor.chart!=='object')throw new RangeError('Invalid star chart');
  for(const key of ['pow','spd','rch','end','prc','pot'] as const)chartValue(actor.chart[key]);
  if(actor.lampMarks!==undefined)integer(actor.lampMarks,'lamp marks',0,3);
  if(actor.skillIds!==undefined&&(!Array.isArray(actor.skillIds)||new Set(actor.skillIds).size!==actor.skillIds.length
    ||actor.skillIds.some(id=>typeof id!=='string'||!/^\w[\w.-]*$/.test(id))))throw new RangeError('Invalid actor skill list');
}

export function rating(value:number):Rating {
  chartValue(value);
  for(const grade of ['S','A','B','C','D','E'] as const)if(value>=balance.chart.ratingMinimums[grade])return grade;
  throw new RangeError('Unrated chart value');
}

export function manhattan(a:Point,b:Point):number {
  point(a);point(b);
  const distance=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  integer(distance,'Manhattan distance');
  return distance;
}

/** A zero-length tether or an out-of-range origin cannot produce an attack. */
export function tetherFactor(distance:number,reach:number):number {
  integer(distance,'tether distance');integer(reach,'reach',1);
  if(distance>reach)throw new RangeError('Attack is outside the tether');
  const half=Math.ceil(reach/2);
  if(distance<=half)return 1;
  return 1-balance.damage.tetherLoss*(distance-half)/(reach-half);
}

export function calculateDamage(input:DamageInput):number {
  if(!input||typeof input!=='object')throw new RangeError('Invalid damage input');
  integer(input.power,'skill power');chartValue(input.attackerPower);chartValue(input.defenderEndurance);
  damageTarget(input.target);
  if(input.recalled!==undefined&&typeof input.recalled!=='boolean')throw new RangeError('Invalid recall state');
  if(input.target==='astral'&&input.recalled)throw new RangeError('A recalled astral cannot be targeted');
  const opening=input.openingMultiplier===undefined?balance.damage.defaultOpeningMultiplier:input.openingMultiplier;
  if(!Number.isFinite(opening)||opening<0||opening>Number.MAX_SAFE_INTEGER)throw new RangeError('Invalid opening multiplier');
  const target=input.target==='astral'?balance.damage.astralMultiplier:input.recalled?balance.damage.recalledBodyMultiplier:balance.damage.bodyMultiplier;
  const damage=Math.round(input.power*(balance.damage.basePowerFactor+input.attackerPower/balance.damage.powerDivisor)
    *tetherFactor(input.distance,input.reach)*target*opening*(1-input.defenderEndurance/balance.damage.enduranceDivisor));
  integer(damage,'calculated damage');
  return damage;
}

/** The amount is already calculated damage: body/recall multipliers are not reapplied. */
export function applySharedDamage(actor:BattleActor,target:DamageTarget,amount:number):SharedDamageResult {
  validateActor(actor);damageTarget(target);integer(amount,'settled damage');
  if(actor.kind!=='close'&&actor.kind!=='remote')throw new RangeError('This astral type does not share HP');
  if(target==='astral'&&(actor.mode!=='manifested'||actor.astral===null))throw new RangeError('No manifested astral to damage');
  const next=structuredClone(actor);
  if(next.hp===0)return {actor:next,damage:0,absorbed:0};
  const absorbed=Math.min(next.shield,amount);
  const damage=Math.min(next.hp,amount-absorbed);
  next.shield-=absorbed;next.hp-=damage;
  if(next.hp===0){next.mode='extinguished';next.astral=null;}
  return {actor:next,damage,absorbed};
}

export function actionInterval(speedValue:number,weight:ActionWeight):number {
  if(!Object.hasOwn(balance.timeline.actionWeights,weight))throw new RangeError('Invalid action weight');
  const interval=Math.round(balance.timeline.baseInterval*balance.timeline.speedFactors[rating(speedValue)]*balance.timeline.actionWeights[weight]);
  integer(interval,'action interval',1);
  return interval;
}

/** Sorting keeps every member; the turn engine decides which actors can still act. */
export function orderTimeline(actors:readonly BattleActor[]):BattleActor[] {
  actors.forEach(validateActor);
  return [...actors].sort((a,b)=>a.readyAt-b.readyAt
    ||(a.team===b.team?0:a.team==='player'?-1:1)
    ||a.order-b.order
    ||(a.id===b.id?0:a.id<b.id?-1:1));
}

export function rescheduleActor(actor:BattleActor,weight:ActionWeight):BattleActor {
  validateActor(actor);
  if(actor.hp===0)throw new RangeError('A defeated actor cannot act');
  const readyAt=actor.readyAt+actionInterval(actor.chart.spd,weight);
  integer(readyAt,'rescheduled tick');
  return {...structuredClone(actor),readyAt};
}
