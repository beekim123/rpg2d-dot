import { decodeSave, encodeSave } from '../core/save.ts';
import { activeMap, parseMap, safeMapEntry, type GameState, type MapData, type Point } from './world.ts';

export interface TravelResult { state: GameState; changed: boolean; reason?: string }

/** A door clears the old follower trail; it contains coordinates from another map. */
export function travelTo(state:GameState,mapId:string,at:Point,maps:Record<string,MapData>):TravelResult {
  try {
    if(!Object.hasOwn(maps,state.mapId)||!Object.hasOwn(maps,mapId))throw new Error('Unknown travel map');
    const source=parseMap(maps[state.mapId]);const destination=parseMap(maps[mapId]);
    if(source.id!==state.mapId||destination.id!==mapId)throw new Error('Invalid travel map id');
    const actors=mapId===state.mapId?state.actors:Object.hasOwn(state.actorMemory,mapId)?state.actorMemory[mapId]! : {};
    if(!safeMapEntry(activeMap(destination,state.flags),at,actors))throw new Error('Blocked travel destination');
    const candidate:GameState={
      ...state,mapId,player:{x:at.x,y:at.y,facing:state.player.facing},followers:[],actors,
      actorMemory:{...state.actorMemory,[state.mapId]:state.actors},
    };
    // Share the import validator so travel cannot create a state that cannot be saved.
    return {state:decodeSave(encodeSave(candidate),maps),changed:true};
  } catch(error) {
    return {state,changed:false,reason:error instanceof Error?error.message:'Invalid travel state'};
  }
}

export function tryMapExit(state:GameState,maps:Record<string,MapData>):TravelResult {
  try {
    if(!Object.hasOwn(maps,state.mapId))throw new Error('Unknown travel map');
    const source=parseMap(maps[state.mapId]);
    const exit=source.exits.find(candidate=>candidate.x===state.player.x&&candidate.y===state.player.y);
    if(!exit)return {state,changed:false};
    const endpoints=Object.values(maps).flatMap(map=>map.exits.filter(candidate=>candidate.pair===exit.pair).map(candidate=>({map,exit:candidate})));
    const back=endpoints.find(endpoint=>endpoint.exit!==exit);
    if(endpoints.length!==2||!back||back.map.id!==exit.to||back.exit.to!==source.id||Math.abs(exit.at.x-back.exit.x)+Math.abs(exit.at.y-back.exit.y)>1||Math.abs(back.exit.at.x-exit.x)+Math.abs(back.exit.at.y-exit.y)>1)throw new Error('Invalid exit pair');
    return travelTo(state,exit.to,exit.at,maps);
  } catch(error) {
    return {state,changed:false,reason:error instanceof Error?error.message:'Invalid map exit'};
  }
}
