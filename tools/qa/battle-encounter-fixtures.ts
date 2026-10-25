import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEncounter,commandEncounter,advanceEnemy} from '../../reference/web/src/battle/encounter.ts';
import {planPlayerTurn} from '../../reference/web/src/battle/ai.ts';
import {runBattleRoute} from './battle-playthrough.ts';
import {battles} from '../../reference/web/src/battle/content.ts';
import {fighter,sourceHashes,skillData} from './battle-skill-fixtures.ts';
import type {BattleCommand,BattleDefinition} from '../../reference/web/src/battle/engine.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
type Step={kind:'player';command:BattleCommand}|{kind:'enemy';actorId?:string};
const move=(type:'move_body'|'move_astral',x:number,y:number):Step=>({kind:'player',command:{type,actorId:'hero',to:{x,y}}});
const body=(type:'wait'|'undo'|'guard'|'recall'):Step=>({kind:'player',command:{type,actorId:'hero'}});
const enemy:Step={kind:'enemy'};
function definition():BattleDefinition{return {id:'intents',width:9,height:6,blocked:[],actors:[
  fighter('hero','player',{body:{x:1,y:2},astral:{x:1,y:3},kind:'remote',maxWill:12,chart:{pow:40,spd:50,rch:50,end:50,prc:50,pot:50},skillIds:['lamp_punch','rush']}),
  fighter('foe','enemy',{body:{x:4,y:2},astral:{x:3,y:2},kind:'remote',maxWill:12,order:0,chart:{pow:40,spd:50,rch:50,end:50,prc:50,pot:50},skillIds:['laurel_bolt']})]};}
function replay(id:string,initial:BattleDefinition,commands:Step[]){
  let encounter=createEncounter(initial);const expectedInitial=structuredClone(encounter),initialPlan=planPlayerTurn(encounter);
  const steps=commands.map(step=>{const expected=step.kind==='enemy'?advanceEnemy(encounter):commandEncounter(encounter,step.command);encounter=expected.encounter;
    return {step,expected:structuredClone(expected),playerPlan:planPlayerTurn(encounter)};});
  return {id,initial,expectedInitial,initialPlan,steps};
}
export function buildEncounterFixtures(){
  const header={format:'astra.encounter/1',sources:sourceHashes(['reference/web/src/battle/engine.ts','reference/web/src/battle/math.ts','reference/web/src/battle/skills.ts','reference/web/src/battle/ai.ts','reference/web/src/battle/encounter.ts','content/data/battle-balance.json','content/data/battle-skills.json','content/data/battles/prologue_ella.json','content/data/battles/prologue_shade.json']),balance:JSON.parse(readFileSync(resolve(root,'content/data/battle-balance.json'),'utf8')),skillData};
  const point=definition();point.intentModes={foe:'point'};
  const pushed=definition();pushed.actors[0]!.astral={x:2,y:2};pushed.actors[1]!.body={x:3,y:1};pushed.actors[1]!.astral={x:3,y:2};
  const recalled=definition();recalled.actors[0]!.body={x:0,y:0};recalled.actors[0]!.astral={x:1,y:2};recalled.blocked=[{x:1,y:0},{x:0,y:1}];
  const blocked=definition();blocked.actors[1]!.body={x:6,y:2};blocked.actors[1]!.astral={x:5,y:2};blocked.actors[1]!.skillIds=['basic_strike'];
  const planned=createEncounter(blocked).intents.foe!.commands.find(c=>c.type==='move_astral');if(!planned||planned.type!=='move_astral')throw new Error('Missing movement plan');
  const behindWall=definition();behindWall.actors[0]!.lampMarks=1;behindWall.actors[1]!.skillIds=['flare'];behindWall.blocked=[{x:2,y:1}];
  const marks=definition();marks.actors[0]!.readyAt=200;marks.actors[0]!.lampMarks=1;marks.actors[1]!.skillIds=['flare'];
  marks.actors.push({...structuredClone(marks.actors[1]!),id:'foe2',order:1,body:{x:4,y:4},astral:{x:3,y:4}});
  const reserved=definition();reserved.actors[1]!.id='__proto__';
  const collision=definition();collision.actors[1]!.body={x:3,y:2};collision.actors[1]!.astral={x:2,y:2};collision.actors[1]!.skillIds=['rush'];
  collision.actors.push({...structuredClone(collision.actors[0]!),id:'ally',order:1,body:{x:0,y:2},astral:{x:0,y:3}});
  const unavailable=definition();unavailable.actors[0]!.hp=1;unavailable.actors[0]!.readyAt=200;
  unavailable.actors.push({...structuredClone(unavailable.actors[0]!),id:'ally',order:1,hp:100,body:{x:0,y:0},astral:null,mode:'recalled'});
  unavailable.actors.push({...structuredClone(unavailable.actors[1]!),id:'foe2',order:1,body:{x:4,y:4},astral:{x:3,y:4}});
  unavailable.blocked=[{x:1,y:0},{x:0,y:1}];
  const numeric=structuredClone(marks);numeric.actors[1]!.id='2';numeric.actors[2]!.id='1';
  const fixed=definition();fixed.actors[0]!.astral={x:0,y:2};fixed.actors[0]!.chart.spd=90;
  fixed.actors[1]!.body={x:4,y:3};fixed.actors[1]!.astral={x:3,y:3};fixed.actors[1]!.skillIds=['basic_strike'];
  const replays=[
    replay('intermediate_path_blocked',fixed,[move('move_astral',3,2),body('wait'),enemy]),
    replay('collision_forecast',collision,[body('wait'),{kind:'player',command:{type:'wait',actorId:'ally'}},enemy]),
    replay('target_defeated_by_other_enemy',unavailable,[enemy,enemy]),
    replay('numeric_id_order',numeric,[enemy,enemy]),
    replay('guard_forecast',definition(),[body('guard'),enemy]),replay('recall_forecast',definition(),[body('recall'),enemy]),
    replay('point_miss',point,[move('move_body',0,2),body('wait'),enemy]),
    replay('point_replacement',point,[move('move_body',0,2),body('undo'),move('move_body',0,2),move('move_astral',1,2),body('wait'),enemy]),
    replay('unit_follows',definition(),[move('move_body',2,2),body('wait'),enemy]),
    replay('unit_out_of_range',definition(),[move('move_body',0,2),body('undo'),move('move_body',0,2),body('wait'),enemy]),
    replay('pushed_attacker',pushed,[{kind:'player',command:{type:'skill',actorId:'hero',skillId:'rush',targetId:'foe',target:'astral'}},enemy]),
    replay('recalled_target',recalled,[body('recall'),enemy]),
    replay('blocked_plan',blocked,[move('move_body',planned.to.x,planned.to.y),body('wait'),enemy]),
    replay('wall_interrupts',behindWall,[move('move_body',1,1),body('wait'),enemy]),
    replay('marks_consumed_by_other_enemy',marks,[enemy,enemy]),
    replay('reserved_id',reserved,[body('wait'),enemy]),
    replay('entry_permissions',definition(),[enemy,{kind:'player',command:{type:'wait',actorId:'foe'}},{kind:'player',command:{type:'cancelled_skill',actorId:'hero',skillId:'rush',outcome:'miss',reason:'empty_cell'}}]),
  ];
  const outputs:Record<string,typeof header & {replays:ReturnType<typeof replay>[]}>={'intents.json':{...header,replays}};
  for(const [id,initial] of Object.entries(battles))for(const strategy of ['attack','wait'] as const){
    const route=runBattleRoute(initial,strategy);
    outputs[`route-${id}-${strategy}.json`]={...header,replays:[replay(`${id}_${strategy}`,initial,route.steps)]};
  }
  return outputs;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  for(const [file,fixture] of Object.entries(buildEncounterFixtures())){
    const text=JSON.stringify(fixture,null,2)+'\n',path=resolve(root,'tests/fixtures/battle',file);
    if(Buffer.byteLength(text)>2000000)throw new Error(`Split oversized fixture ${file}`);
    if(process.argv[2]==='--write')writeFileSync(path,text);
    else if(process.argv[2]!=='--verify'||readFileSync(path,'utf8')!==text)throw new Error(`Oracle differs: ${file}`);
    console.log(`${file}: ${fixture.replays.length} replays / ${fixture.replays.reduce((n,r)=>n+r.steps.length,0)} steps`);
  }
}
