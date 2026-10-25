import {activeMap,parseMap,reachable,requiredInteractionsReachable,safeMapEntry,validFlagId,type MapData,type MapExit} from './world.ts';
import type {Command} from './story.ts';
export function validateContent(maps:Record<string,MapData>,scripts:Record<string,Command[]>,words:Record<string,string>,assets:Set<string>):string[] {
  const errors:string[]=[];
  const checkText=(id:string)=>{if(!Object.hasOwn(words,id)||!words[id])errors.push(`missing text ${id}`);};
  const checkArt=(id:string)=>{if(!assets.has(id))errors.push(`missing sprite ${id}`);};
  const validMaps=new Map<string,MapData>();
  const pairs=new Map<string,{map:MapData;exit:MapExit}[]>();
  const lampIds=new Set<string>();
  for(const [id,map] of Object.entries(maps)) {
    try{parseMap(map);if(map.id!==id)throw new Error('Mismatched map id');}catch{errors.push(`invalid map ${id}`);continue;}
    validMaps.set(id,map);
    for(const exit of map.exits)pairs.set(exit.pair,[...(pairs.get(exit.pair)??[]),{map,exit}]);
  }
  for(const [pair,endpoints] of pairs)if(endpoints.length!==2)errors.push(`invalid exit pair ${pair}: expected two endpoints`);
  for(const map of validMaps.values()) {
    const view=activeMap(map,{});
    checkText(map.name);const reached=reachable(view,map.spawn);
    for(const sprite of Object.values(map.terrain??{}))checkArt(sprite);
    for(const e of map.entities){
      checkArt(e.sprite);if(e.script&&!Object.hasOwn(scripts,e.script))errors.push(`missing script ${e.script}`);
      if(e.kind==='lamp'){if(lampIds.has(e.id))errors.push(`duplicate lamp ${e.id}`);lampIds.add(e.id);}
    }
    if(!requiredInteractionsReachable(view,map.spawn))errors.push(`unreachable objective or exit ${map.id}`);
    for(const exit of map.exits){
      const destination=validMaps.get(exit.to);
      const destinationView=destination?activeMap(destination,{}):undefined;
      const ends=pairs.get(exit.pair)??[];
      const back=ends.find(end=>end.exit!==exit);
      if(!destination||ends.length!==2||!back||back.map.id!==exit.to||back.exit.to!==map.id)errors.push(`unpaired exit ${map.id} -> ${exit.to}`);
      if(!reached.has(`${exit.x},${exit.y}`))errors.push(`unreachable exit ${map.id}`);
      if(!destinationView||!safeMapEntry(destinationView,exit.at)||!reachable(destinationView,destinationView.spawn).has(`${exit.at.x},${exit.at.y}`)||!back||Math.abs(exit.at.x-back.exit.x)+Math.abs(exit.at.y-back.exit.y)>1)errors.push(`invalid exit landing ${map.id} -> ${exit.to}`);
    }
  }
  for(const [id,script] of Object.entries(scripts)){
    for(const c of script){
      if((c.op==='set'||c.op==='if')&&!validFlagId(c.flag))errors.push(`invalid flag ${id}`);
      if(c.op==='say'){checkText(c.text);checkText(c.speaker);checkArt(c.portrait);}
      else if(c.op==='if'){if(!Number.isInteger(c.goto)||c.goto<0||c.goto>=script.length)errors.push(`invalid jump ${id}`);}
      else if(c.op==='move'){if(!Object.values(maps).some(m=>m.entities.some(e=>e.id===c.entity&&e.kind==='npc')))errors.push(`missing actor ${c.entity}`);}
      else if(c.op!=='set'&&c.op!=='end')errors.push(`invalid command ${id}`);
    }
  }
  return errors;
}
