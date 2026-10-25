/** Offline oracle only: production Godot never imports the frozen reference. */
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as math from '../../reference/web/src/battle/math.ts';
import type {BattleActor, DamageInput, DamageTarget} from '../../reference/web/src/battle/model.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const file='tests/fixtures/battle/math.json';
type Result={ok:true;value:unknown}|{ok:false};
type Case={id:string;op:string;args:unknown[];expected:Result};
function capture(fn:()=>unknown):Result {
  try{return {ok:true,value:fn()};}catch(error){if(!(error instanceof RangeError))throw error;return {ok:false};}
}
function actor(overrides:Partial<BattleActor>={}):BattleActor {
  return {id:'finn',team:'player',order:0,body:{x:2,y:2},astral:{x:3,y:2},kind:'close',mode:'manifested',
    hp:100,maxHp:100,will:10,maxWill:20,shield:0,chart:{pow:60,spd:60,rch:20,end:40,prc:40,pot:80},reach:2,readyAt:100,
    skillIds:['basic_strike'],lampMarks:0,...overrides};
}
export function invokeMath(op:string,args:unknown[]):unknown {
  switch(op){
    case 'rating':return math.rating(...args as Parameters<typeof math.rating>);
    case 'manhattan':return math.manhattan(...args as Parameters<typeof math.manhattan>);
    case 'tether_factor':return math.tetherFactor(...args as Parameters<typeof math.tetherFactor>);
    case 'calculate_damage':return math.calculateDamage(...args as Parameters<typeof math.calculateDamage>);
    case 'validate_actor':math.validateActor(...args as Parameters<typeof math.validateActor>);return true;
    case 'apply_shared_damage':return math.applySharedDamage(...args as Parameters<typeof math.applySharedDamage>);
    case 'action_interval':return math.actionInterval(...args as Parameters<typeof math.actionInterval>);
    case 'order_timeline':return math.orderTimeline(...args as Parameters<typeof math.orderTimeline>);
    case 'reschedule_actor':return math.rescheduleActor(...args as Parameters<typeof math.rescheduleActor>);
    default:throw new Error(`Unknown fixture operation ${op}`);
  }
}
export function buildMathFixtures(){
  const sources=Object.fromEntries(['reference/web/src/battle/math.ts','reference/web/src/battle/model.ts','content/data/battle-balance.json']
    .map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
  const balance=JSON.parse(readFileSync(resolve(root,'content/data/battle-balance.json'),'utf8')) as unknown;
  const cases:Case[]=[];
  const add=(id:string,op:string,...args:unknown[])=>cases.push({id,op,args,expected:capture(()=>invokeMath(op,args))});
  for(const value of [0,19,20,39,40,59,60,74,75,89,90,100,-1,101,40.5,null,'60',true,Number.MAX_SAFE_INTEGER+1])add(`rating_${String(value)}`,'rating',value);
  add('distance_cardinal','manhattan',{x:2,y:3},{x:7,y:1});
  add('distance_reverse','manhattan',{x:7,y:1},{x:2,y:3});
  add('distance_same','manhattan',{x:2,y:3},{x:2,y:3});
  add('distance_overflow','manhattan',{x:0,y:0},{x:Number.MAX_SAFE_INTEGER,y:1});
  for(const value of [-1,0.5,null,'1',true])add(`distance_invalid_${value}`,'manhattan',{x:value,y:0},{x:1,y:1});
  for(let reach=1;reach<=8;reach++)for(let distance=0;distance<=reach+1;distance++)add(`tether_${distance}_${reach}`,'tether_factor',distance,reach);
  for(const [d,r] of [[0,0],[-1,2],[1,-1],[1.5,2],[1,null],[null,1],[true,1]])add(`invalid_tether_${d}_${r}`,'tether_factor',d,r);
  const damage:DamageInput={power:100,attackerPower:40,defenderEndurance:50,distance:1,reach:5,target:'astral'};
  add('damage_astral','calculate_damage',damage);
  add('damage_body','calculate_damage',{...damage,target:'body'});
  add('damage_recalled','calculate_damage',{...damage,target:'body',recalled:true});
  add('damage_round_once','calculate_damage',{power:11,attackerPower:63,defenderEndurance:37,distance:4,reach:5,target:'body',openingMultiplier:1.5});
  add('damage_half','calculate_damage',{...damage,power:5,attackerPower:40,defenderEndurance:0,target:'body'});
  add('damage_half_below','calculate_damage',{...damage,power:1,attackerPower:40,defenderEndurance:0,openingMultiplier:0.49999999999999994});
  add('damage_zero','calculate_damage',{...damage,power:0});
  // Exercise fractional intermediates, odd/even tethers and every rating boundary without randomness.
  for(const pow of [0,19,20,39,40,59,60,74,75,89,90,100])for(const distance of [1,3,4,5]){
    add(`damage_grid_${pow}_${distance}`,'calculate_damage',{...damage,power:11,attackerPower:pow,defenderEndurance:37,distance,target:'body',openingMultiplier:1.5});
  }
  for(const [i,patch] of [{power:-1},{power:0.1},{power:Number.MAX_SAFE_INTEGER},{attackerPower:101},{defenderEndurance:-1},
    {openingMultiplier:-1},{openingMultiplier:null},{openingMultiplier:true},{openingMultiplier:Number.MAX_SAFE_INTEGER},
    {recalled:true},{recalled:1},{target:'missing'},{reach:0},{distance:6}].entries())add(`damage_invalid_${i}`,'calculate_damage',{...damage,...patch});
  add('damage_null','calculate_damage',null);
  add('actor_valid','validate_actor',actor());
  add('actor_optional_absent','validate_actor',Object.fromEntries(Object.entries(actor()).filter(([k])=>!['skillIds','lampMarks'].includes(k))));
  for(const [i,patch] of [{id:''},{id:'有星'},{team:'other'},{kind:'other'},{mode:'other'},{order:-1},{readyAt:0.5},{reach:-1},
    {maxHp:0},{hp:101},{hp:0},{will:21},{shield:-1},{body:null},{astral:null},{chart:null},{lampMarks:4},
    {skillIds:['same','same']},{skillIds:['bad id']},{skillIds:null},{maxWill:true}].entries())add(`actor_invalid_${i}`,'validate_actor',{...actor(),...patch});
  for(const kind of ['close','remote','auto','swarm','set','field'] as const)for(const target of ['body','astral'] as const){
    add(`shared_${kind}_${target}`,'apply_shared_damage',actor({kind}),target,30);
  }
  for(const amount of [-1,0.5,null,'10',true])add(`shared_invalid_${amount}`,'apply_shared_damage',actor(),'body',amount);
  add('shared_wrong_target','apply_shared_damage',actor(),'missing',1);
  for(const speed of [0,20,40,60,75,90,100])for(const weight of ['light','normal','heavy'])add(`interval_${speed}_${weight}`,'action_interval',speed,weight);
  add('interval_bad_weight','action_interval',60,'other');
  add('interval_bad_speed','action_interval',101,'normal');
  add('timeline_ties','order_timeline',[actor({id:'enemy',team:'enemy'}),actor({id:'a',order:1}),actor({id:'A',order:1}),actor({id:'first'}),actor({id:'early',readyAt:99,team:'enemy'})]);
  add('timeline_stable','order_timeline',[actor({hp:90}),actor({hp:80}),actor({id:'dead',hp:0,mode:'extinguished',astral:null,readyAt:0})]);
  add('timeline_empty','order_timeline',[]);
  add('reschedule','reschedule_actor',actor({readyAt:80,chart:{...actor().chart,spd:20}}),'heavy');
  add('reschedule_overflow','reschedule_actor',actor({readyAt:Number.MAX_SAFE_INTEGER}),'normal');
  add('reschedule_dead','reschedule_actor',actor({hp:0,mode:'extinguished',astral:null}),'normal');
  const replay=(id:string,initial:BattleActor,commands:{target:DamageTarget;amount:number}[])=>{
    let current=structuredClone(initial);
    const steps=commands.map(command=>{
      const expected=capture(()=>math.applySharedDamage(current,command.target,command.amount));
      if(expected.ok)current=(expected.value as ReturnType<typeof math.applySharedDamage>).actor;
      return {command,expected};
    });return {id,initial,steps};
  };
  const replays=[
    replay('shield_then_ko',actor({hp:20,shield:15}),[{target:'astral',amount:10},{target:'body',amount:100},{target:'body',amount:5},{target:'astral',amount:5}]),
    replay('recalled_body',actor({kind:'remote',mode:'recalled',astral:null}),[{target:'astral',amount:5},{target:'body',amount:7},{target:'body',amount:0},{target:'body',amount:100}]),
    replay('invalid_then_valid',actor(),[{target:'body',amount:-1},{target:'astral',amount:30},{target:'body',amount:30}]),
  ];
  return {format:'astra.battle-math/1',sources,balance,cases,replays};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=JSON.stringify(buildMathFixtures(),null,2)+'\n';
  if(process.argv[2]==='--write'){mkdirSync(resolve(root,dirname(file)),{recursive:true});writeFileSync(resolve(root,file),output);}
  else if(process.argv[2]==='--verify'){
    if(readFileSync(resolve(root,file),'utf8')!==output)throw new Error('Battle oracle differs; review reference changes before explicit regeneration.');
  }else throw new Error('Use --write or --verify');
  const fixture=buildMathFixtures();
  console.log(`Battle oracle: ${fixture.cases.length} cases, ${fixture.replays.length} shared-HP replays (${process.argv[2]})`);
}
