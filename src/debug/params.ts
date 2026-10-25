import { newGame, walkable, type GameState, type MapData } from '../systems/world.ts';
export function debugStart(search:string,maps:Record<string,MapData>):GameState|undefined {
  const p=new URLSearchParams(search);const id=p.get('map');if(!id||!maps[id])return undefined;
  const state=newGame();state.mapId=id;const map=maps[id]!;state.player={...map.spawn,facing:'down'};
  const raw=p.get('at');
  if(raw&&/^\d+,\d+$/.test(raw)) {const [x,y]=raw.split(',').map(Number);if(walkable(map,x!,y!))state.player={x:x!,y:y!,facing:'down'};}
  return state;
}
