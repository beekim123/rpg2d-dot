import assert from 'node:assert/strict';
import {maps,scripts} from '../../reference/web/src/content.ts';
import {newGame,movePlayer,interact,walkable,DELTA,type Direction,type Point} from '../../reference/web/src/systems/world.ts';
import {runScript} from '../../reference/web/src/systems/story.ts';
import {SaveStore} from '../../reference/web/src/core/save.ts';
let state=newGame();const map=maps[state.mapId]!;
function travel(target:Point):void {
  const queue:{point:Point;path:Direction[]}[]=[{point:state.player,path:[]}];const seen=new Set<string>();let path:Direction[]|undefined;
  for(let i=0;i<queue.length;i++){const here=queue[i]!;if(here.point.x===target.x&&here.point.y===target.y){path=here.path;break;}const key=`${here.point.x},${here.point.y}`;if(seen.has(key))continue;seen.add(key);
    for(const [dir,d]of Object.entries(DELTA)){const p={x:here.point.x+d.x,y:here.point.y+d.y};if(walkable(map,p.x,p.y,state.actors))queue.push({point:p,path:[...here.path,dir as Direction]});}
  }
  assert(path,'Route must reach objective');for(const d of path)state=movePlayer(state,map,d);
}
travel({x:10,y:12});state=movePlayer(state,map,'up');
const greeting=interact(state,map);assert.equal(greeting.script,'hob');
let pc=0;let lines=0;
for(let i=0;i<20;i++){const r=runScript(scripts.hob!,state,pc,map);state=r.state;pc=r.pc;if(r.line)lines++;if(r.done)break;}
assert.equal(lines,3);assert.equal(state.flags.met_hob,true);
for(const p of [{x:15,y:12,d:'up'},{x:25,y:12,d:'down'}] as const){travel(p);state=movePlayer(state,map,p.d);state=interact(state,map).state;}
assert.equal(state.lamps.length,2);
const memory=new Map<string,string>();const saves=new SaveStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);}},maps);
assert.equal(saves.save(1,state).ok,true);const expected=structuredClone(state);
travel({x:16,y:20});const restored=saves.load(1);assert(restored.ok);assert.deepEqual(restored.state,expected);
console.log(`M0 route OK: ${expected.steps} grid steps, ${lines} dialogue lines, 2 lamps, manual save restored. No combat exists in M0.`);
