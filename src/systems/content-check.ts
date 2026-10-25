import {parseMap,reachable,DELTA,type MapData} from './world.ts';
import type {Command} from './story.ts';
export function validateContent(maps:Record<string,MapData>,scripts:Record<string,Command[]>,words:Record<string,string>,assets:Set<string>):string[] {
  const errors:string[]=[];
  const checkText=(id:string)=>{if(!words[id])errors.push(`missing text ${id}`);};
  const checkArt=(id:string)=>{if(!assets.has(id))errors.push(`missing sprite ${id}`);};
  for(const map of Object.values(maps)) {
    try{parseMap(map);}catch{errors.push(`invalid map ${map.id}`);continue;}
    checkText(map.name);const reached=reachable(map,map.spawn);
    for(const e of map.entities){checkArt(e.sprite);if(e.script&&!scripts[e.script])errors.push(`missing script ${e.script}`);}
    for(const id of map.required){const e=map.entities.find(entity=>entity.id===id);if(!e||!Object.values(DELTA).some(d=>reached.has(`${e.x+d.x},${e.y+d.y}`)))errors.push(`unreachable objective ${id}`);}
    for(const exit of map.exits){const destination=maps[exit.to];if(!destination||!destination.exits.some(back=>back.to===map.id))errors.push(`unpaired exit ${map.id} -> ${exit.to}`);}
  }
  for(const [id,script] of Object.entries(scripts)){
    for(const c of script){
      if(c.op==='say'){checkText(c.text);checkText(c.speaker);checkArt(c.portrait);}
      else if(c.op==='if'){if(!Number.isInteger(c.goto)||c.goto<0||c.goto>=script.length)errors.push(`invalid jump ${id}`);}
      else if(c.op==='move'){if(!Object.values(maps).some(m=>m.entities.some(e=>e.id===c.entity&&e.kind==='npc')))errors.push(`missing actor ${c.entity}`);}
      else if(c.op!=='set'&&c.op!=='end')errors.push(`invalid command ${id}`);
    }
  }
  return errors;
}
