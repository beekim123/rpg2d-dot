/** Offline movement oracle; no production game module depends on this file. */
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBattle,applyBattleCommand,reachableBattleMoves} from '../../reference/web/src/battle/engine.ts';
import type {BattleDefinition,BattleCommand,BattleState} from '../../reference/web/src/battle/engine.ts';
import type {BattleActor} from '../../reference/web/src/battle/model.ts';
import {skillIds} from '../../reference/web/src/battle/skills.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const file='tests/fixtures/battle/movement.json';
function fighter(id='finn',team:'player'|'enemy'='player',extra:Partial<BattleActor>={}):BattleActor{
  const x=team==='player'?1:6;
  return {id,team,order:team==='player'?0:1,body:{x,y:2},astral:{x:x+(team==='player'?1:-1),y:2},kind:'close',mode:'manifested',
    hp:100,maxHp:100,will:6,maxWill:12,shield:0,chart:{pow:65,spd:65,rch:25,end:50,prc:50,pot:80},reach:2,readyAt:0,...extra};
}
function definition(extra:Partial<BattleDefinition>={}):BattleDefinition{
  return {id:'movement',width:8,height:6,blocked:[],actors:[fighter(),fighter('shade','enemy')],...extra};
}
const move=(type:'move_body'|'move_astral'|'manifest',x:number,y:number,actorId='finn'):BattleCommand=>({type,to:{x,y},actorId});
const action=(type:'wait'|'undo'|'recall',actorId='finn'):BattleCommand=>({type,actorId});
function previews(state:BattleState){return {body:reachableBattleMoves(state,'body'),astral:reachableBattleMoves(state,'astral')};}
function replay(id:string,initial:BattleDefinition,commands:BattleCommand[]){
  let state=createBattle(initial);const expectedInitial=structuredClone(state),initialMoves=previews(state);
  const steps=commands.map(command=>{
    const expected=applyBattleCommand(state,command);state=expected.state;
    return {command,expected:structuredClone(expected),moves:previews(state)};
  });
  return {id,initial,expectedInitial,initialMoves,steps};
}
export function buildMovementFixtures(){
  const sources=Object.fromEntries(['reference/web/src/battle/engine.ts','reference/web/src/battle/math.ts','reference/web/src/battle/model.ts',
    'reference/web/src/battle/skills.ts','content/data/battle-balance.json','content/data/battle-skills.json']
    .map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
  const replays=[
    replay('movement_and_turns',definition(),[
      action('wait','shade'),move('move_body',3,2),move('move_astral',4,2),move('move_body',1,4),move('move_body',4,4),action('undo'),
      move('move_astral',2,3),move('move_body',2,2),action('wait'),action('wait','shade'),action('recall'),action('wait','shade'),
      move('manifest',2,3),move('move_astral',3,3),action('undo'),action('wait'),
    ]),
    replay('manifest_once',definition({blocked:[{x:1,y:1}],actors:[fighter('finn','player',{mode:'recalled',astral:null}),fighter('shade','enemy')]}),[
      move('manifest',1,1),move('move_body',1,3),move('manifest',2,3),action('undo'),move('manifest',2,2),move('move_astral',2,3),action('undo'),move('manifest',1,3),action('wait'),
    ]),
    replay('tether_path_cannot_leave_range',definition({actors:[fighter('finn','player',{body:{x:2,y:2},astral:{x:2,y:1},reach:1}),fighter('shade','enemy')]}),[
      move('move_astral',3,2),move('move_astral',2,1),move('move_body',2,3),action('undo'),
    ]),
    replay('wall_detour',definition({blocked:[{x:1,y:3}]}),[move('move_body',1,4),move('move_body',0,3),move('move_body',0,4),move('move_body',0,5),action('undo')]),
    replay('bad_commands',definition(),[
      ...[{x:1.5,y:2},{x:-1,y:2},{x:1,y:9},null].map(to=>({type:'move_body',actorId:'finn',to} as BattleCommand)),
      {type:'unknown',actorId:'finn'} as unknown as BattleCommand,move('move_astral',1,2),action('wait'),action('undo'),
    ]),
    replay('dead_units_do_not_block',definition({actors:[fighter(),fighter('shade','enemy'),fighter('fallen','player',{hp:0,mode:'extinguished',astral:null,body:{x:1,y:3}})]}),[move('move_body',1,3),action('undo'),action('wait')]),
    replay('terminal_won',definition({actors:[fighter(),fighter('shade','enemy',{hp:0,mode:'extinguished',astral:null})]}),[action('wait'),move('move_body',1,3)]),
    replay('terminal_lost',definition({actors:[fighter('finn','player',{hp:0,mode:'extinguished',astral:null}),fighter('shade','enemy')]}),[action('wait','shade')]),
    replay('goal_counts_only_actions',definition({goal:{kind:'survive_and_hit',actorId:'finn',enemyId:'shade',enemyActions:3},hpFloors:{shade:1},intentModes:{shade:'point'}}),[
      action('wait'),move('move_body',6,3,'shade'),action('undo','shade'),action('wait','shade'),action('wait'),action('recall','shade'),action('wait'),action('wait','shade'),
    ]),
  ];
  const invalid:BattleDefinition[]=[definition({width:0}),definition({width:65}),definition({height:1.5}),definition({actors:[]}),definition({blocked:[{x:8,y:1}]}),
    definition({actors:[fighter(),fighter()]}),definition({actors:[fighter(),fighter('shade','enemy',{body:{x:1,y:2}})]}),
    definition({actors:[fighter('finn','player',{astral:{x:7,y:5}})]}),definition({actors:[fighter('finn','player',{skillIds:['unknown']})]}),
    definition({actors:[fighter('finn','player',{kind:'auto'})]}),definition({hpFloors:{shade:1}}),
    definition({goal:{kind:'survive_and_hit',actorId:'finn',enemyId:'missing',enemyActions:3}}),definition({intentModes:{finn:'point'}})];
  const rejected=invalid.map((initial,index)=>{let ok=true;try{createBattle(initial);}catch{ok=false;}if(ok)throw new Error('Invalid fixture unexpectedly accepted');return {id:`invalid_definition_${index}`,initial,ok};});
  return {format:'astra.battle-movement/1',sources,skillIds,balance:JSON.parse(readFileSync(resolve(root,'content/data/battle-balance.json'),'utf8')) as unknown,replays,rejected};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const fixture=buildMovementFixtures(),output=JSON.stringify(fixture,null,2)+'\n';
  if(process.argv[2]==='--write'){mkdirSync(resolve(root,dirname(file)),{recursive:true});writeFileSync(resolve(root,file),output);}
  else if(process.argv[2]==='--verify'){if(readFileSync(resolve(root,file),'utf8')!==output)throw new Error('Movement oracle differs; review before explicit regeneration.');}
  else throw new Error('Use --write or --verify');
  console.log(`Movement oracle: ${fixture.replays.length} replays, ${fixture.replays.reduce((n,r)=>n+r.steps.length,0)} commands, ${fixture.rejected.length} rejected definitions (${process.argv[2]})`);
}
