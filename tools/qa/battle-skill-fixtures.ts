import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyBattleCommand,createBattle,type BattleCommand,type BattleDefinition,type BattleResult} from '../../reference/web/src/battle/engine.ts';
import {hasLineOfSight} from '../../reference/web/src/battle/skills.ts';
import type {BattleActor,DamageTarget,Point} from '../../reference/web/src/battle/model.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
export const skillData=read('content/data/battle-skills.json');
export function fighter(id='finn',team:'player'|'enemy'='player',extra:Partial<BattleActor>={}):BattleActor{
  const x=team==='player'?1:4;
  return {id,team,order:team==='player'?0:1,body:{x,y:2},astral:{x:x+(team==='player'?1:-1),y:2},kind:'close',mode:'manifested',hp:100,maxHp:100,will:8,maxWill:20,shield:0,chart:{pow:40,spd:60,rch:40,end:50,prc:50,pot:80},reach:3,readyAt:0,skillIds:skillData.skills.map((s:{id:string})=>s.id),lampMarks:0,...extra};
}
export function definition(extra:Partial<BattleDefinition>={}):BattleDefinition{return {id:'skills',width:9,height:7,blocked:[],actors:[fighter(),fighter('shade','enemy')],...extra};}
export function sourceHashes(paths:string[]){return Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));}
function replay(id:string,initial:BattleDefinition,run:(step:(c:BattleCommand)=>void,back:()=>void,cast:(s:string,targetId?:string,target?:DamageTarget)=>void)=>void){
  let state=createBattle(initial);const expectedInitial=structuredClone(state);const steps:{command:BattleCommand;expected:BattleResult}[]=[];
  const step=(command:BattleCommand)=>{const expected=applyBattleCommand(state,command);steps.push({command,expected:structuredClone(expected)});state=expected.state;};
  const back=()=>{for(let i=0;i<20&&state.phase==='active'&&state.activeId!=='finn';i++)step({type:'wait',actorId:state.activeId});};
  const cast=(skillId:string,targetId='shade',target:DamageTarget='astral')=>step({type:'skill',actorId:state.activeId,skillId,targetId,target});
  run(step,back,cast);return {id,initial,expectedInitial,steps};
}
export function buildSkillFixtures(){
  const goal={kind:'survive_and_hit' as const,actorId:'finn',enemyId:'shade',enemyActions:3};
  const replays=[
    replay('basic_and_guard',definition(),(step,back,cast)=>{cast('basic_strike');back();step({type:'guard',actorId:'finn'});back();step({type:'guard',actorId:'finn'});}),
    replay('marks_cap_and_detonate',definition({actors:[fighter(),fighter('shade','enemy',{hp:300,maxHp:300})]}),(_step,back,cast)=>{for(let i=0;i<4;i++){cast('lamp_punch');back();}cast('flare','shade','body');}),
    replay('heal_shield_caps',definition({actors:[fighter('finn','player',{hp:60}),fighter('shade','enemy')]}),(_step,back,cast)=>{cast('laurel_heal','finn','body');back();cast('laurel_heal','finn','astral');back();cast('laurel_shield','finn','body');back();cast('laurel_shield','finn','body');}),
    replay('invalid_skills',definition(),(step,_back,cast)=>{step({type:'move_body',actorId:'finn',to:{x:1,y:3}});for(const [s,t,u] of [['missing','shade','astral'],['flare','shade','astral'],['laurel_heal','shade','body'],['basic_strike','finn','body'],['basic_strike','absent','body'],['basic_strike','shade','wrong']] as string[][])cast(s!,t!,u as DamageTarget);}),
    replay('insufficient_will',definition({actors:[fighter('finn','player',{will:0}),fighter('shade','enemy',{lampMarks:1})]}),(_s,_b,cast)=>cast('flare')),
    replay('restricted_skills',definition({actors:[fighter('finn','player',{skillIds:['basic_strike']}),fighter('shade','enemy')]}),(_s,_b,cast)=>cast('lamp_punch')),
    replay('recalled_protection',definition({actors:[fighter('finn','player',{mode:'recalled',astral:null}),fighter('shade','enemy')]}),(step,_back,cast)=>{cast('basic_strike');step({type:'wait',actorId:'finn'});cast('laurel_bolt','finn','astral');cast('laurel_bolt','finn','body');}),
    replay('wall_ray',definition({blocked:[{x:3,y:2}],actors:[fighter(),fighter('shade','enemy',{body:{x:5,y:2},astral:{x:4,y:2},lampMarks:1})]}),(_s,_b,cast)=>cast('flare')),
    replay('corner_ray',definition({blocked:[{x:3,y:2}],actors:[fighter(),fighter('shade','enemy',{body:{x:4,y:3},astral:{x:3,y:3},lampMarks:1})]}),(_s,_b,cast)=>cast('flare')),
    replay('push_and_tether',definition({actors:[fighter(),fighter('shade','enemy',{body:{x:3,y:2},astral:{x:3,y:3},reach:1})]}),(_s,_b,cast)=>cast('rush','shade','body')),
    replay('wall_collision',definition({blocked:[{x:4,y:2}],actors:[fighter(),fighter('shade','enemy',{body:{x:3,y:2},astral:{x:3,y:3}})]}),(_s,_b,cast)=>cast('rush','shade','body')),
    replay('two_owner_collision',definition({actors:[fighter(),fighter('shade','enemy',{body:{x:3,y:2},astral:{x:3,y:3}}),fighter('blocker','enemy',{body:{x:4,y:2},astral:{x:5,y:2}})]}),(_s,_b,cast)=>cast('rush','shade','body')),
    replay('same_owner_collision',definition(),(_s,_b,cast)=>cast('rush')),
    replay('lethal_stops_knockback',definition({actors:[fighter(),fighter('shade','enemy',{hp:1})]}),(step,_b,cast)=>{cast('rush');step({type:'wait',actorId:'finn'});}),
    replay('simultaneous_ko_loses',definition({actors:[fighter('finn','player',{body:{x:4,y:2},hp:10}),fighter('shade','enemy',{body:{x:3,y:2},astral:{x:3,y:3},hp:39})]}),(step,_b,cast)=>{cast('rush','shade','body');step({type:'undo',actorId:'finn'});}),
    replay('no_resurrection',definition({actors:[fighter(),fighter('shade','enemy'),fighter('fallen','player',{body:{x:1,y:3},hp:0,mode:'extinguished',astral:null})]}),(_s,_b,cast)=>cast('laurel_heal','fallen','body')),
    replay('floor_hit_counts',definition({goal,hpFloors:{shade:1},actors:[fighter(),fighter('shade','enemy',{hp:1,shield:5})]}),(step,back,cast)=>{cast('basic_strike');back();for(let i=0;i<2;i++){step({type:'wait',actorId:'finn'});step({type:'wait',actorId:'shade'});}}),
    replay('full_shield_no_hit',definition({goal,hpFloors:{shade:1},actors:[fighter(),fighter('shade','enemy',{shield:999})]}),(step,back,cast)=>{cast('basic_strike');back();for(let i=0;i<3;i++){step({type:'wait',actorId:'finn'});step({type:'wait',actorId:'shade'});}}),
    replay('premature_goal_ko',definition({goal,actors:[fighter(),fighter('shade','enemy',{hp:1})]}),(_s,_b,cast)=>cast('basic_strike')),
    replay('cancelled_attack_costs_turn',definition(),(step)=>{step({type:'cancelled_skill',actorId:'finn',skillId:'rush',outcome:'miss',reason:'empty_cell'});step({type:'wait',actorId:'finn'});step({type:'cancelled_skill',actorId:'shade',skillId:'rush',outcome:'miss',reason:'empty_cell'});}),
  ];
  const rays:{from:Point;to:Point;blocked:Point[];visible:boolean}[]=[];
  for(const from of [{x:0,y:0},{x:3,y:3}])for(let x=0;x<5;x++)for(let y=0;y<5;y++)for(const blocked of [[],[{x:1,y:0}],[{x:0,y:1}],[{x:2,y:2}]]){
    const to={x,y};rays.push({from,to,blocked,visible:hasLineOfSight(from,to,blocked)});
  }
  return {format:'astra.battle-skills/1',sources:sourceHashes(['reference/web/src/battle/engine.ts','reference/web/src/battle/math.ts','reference/web/src/battle/skills.ts','content/data/battle-skills.json','content/data/battle-balance.json']),balance:read('content/data/battle-balance.json'),skillData,replays,rays};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const fixture=buildSkillFixtures(),path=resolve(root,'tests/fixtures/battle/skills.json'),text=JSON.stringify(fixture,null,2)+'\n';
  if(process.argv[2]==='--write')writeFileSync(path,text);
  else if(process.argv[2]!=='--verify'||readFileSync(path,'utf8')!==text)throw new Error('Skill oracle differs; explicit --write after review required');
  console.log(`Skill oracle: ${fixture.replays.length} replays / ${fixture.replays.reduce((n,r)=>n+r.steps.length,0)} commands, ${fixture.rays.length} rays`);
}
