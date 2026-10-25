import type {BattleDefinition} from '../battle/engine.ts';
import {walkable,type MapData} from '../systems/world.ts';
export const battleMapId='lantern.yard';
export const battleArenaId='practice';
export const actorArt:Record<string,{body:string;astral:string;portrait?:string}>={
  finn:{body:'char.finn',astral:'astral.morning_star',portrait:'portrait.finn'},
  ella:{body:'char.ella',astral:'astral.laurel',portrait:'portrait.ella'},
  shade:{body:'char.shade',astral:'astral.ash_hand',portrait:'portrait.shade'},
  faux_sword:{body:'char.faux_sword',astral:'astral.faux_sword'},
};

export function validateBattlePresentation(definitions:Record<string,BattleDefinition>,maps:Record<string,MapData>,assets:Set<string>,words:Record<string,string>):string[] {
  const errors:string[]=[];const map=maps[battleMapId],arena=map?.arenas?.[battleArenaId];
  if(!map||!arena)return ['Missing battle map or arena'];
  if(![arena.x,arena.y,arena.width,arena.height].every(Number.isInteger)||arena.x<0||arena.y<0||arena.width<1||arena.height<1||arena.x+arena.width>map.width||arena.y+arena.height>map.height)return ['Invalid arena bounds'];
  for(const battle of Object.values(definitions)){
    if(battle.width!==arena.width||battle.height!==arena.height)errors.push(`${battle.id}: arena dimensions mismatch`);
    for(let y=0;y<battle.height;y++)for(let x=0;x<battle.width;x++)if(battle.blocked.some(p=>p.x===x&&p.y===y)===walkable(map,arena.x+x,arena.y+y))errors.push(`${battle.id}: map obstacle mismatch ${x},${y}`);
    for(const actor of battle.actors){const art=actorArt[actor.id];if(!art){errors.push(`${battle.id}: missing actor presentation ${actor.id}`);continue;}
      for(const id of Object.values(art))if(!assets.has(id))errors.push(`${battle.id}: missing sprite ${id}`);
      if(!words[`name.${actor.id}`])errors.push(`${battle.id}: missing actor name ${actor.id}`);
    }
  }return errors;
}
