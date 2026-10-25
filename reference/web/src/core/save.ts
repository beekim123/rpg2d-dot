import { activeMap, canPlaceActor, newGame, requiredInteractionsReachable, safeMapEntry, validFlagId, walkable, type GameState, type MapData, type Point } from '../systems/world.ts';
const validRecord=(value:unknown):value is Record<string,unknown> => !!value&&typeof value==='object'&&!Array.isArray(value);
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const pointOnMap=(p:unknown,map:MapData):p is Point=>validRecord(p)&&int(p.x)&&int(p.y)&&p.x<map.width&&p.y<map.height;
function validateActors(actors:unknown,map:MapData):asserts actors is Record<string,Point> {
  if(!validRecord(actors)||Object.entries(actors).some(([id,p])=>!map.entities.some(e=>e.id===id&&e.kind==='npc')||!pointOnMap(p,map)))throw new Error('Invalid actor');
}
function validateLayout(state:GameState,map:MapData,maps:Record<string,MapData>):void {
  map=activeMap(map,state.flags);
  if(map.entities.some(entity=>entity.kind==='npc'&&!canPlaceActor(state,map,entity.id,Object.hasOwn(state.actors,entity.id)?state.actors[entity.id]!:entity)))throw new Error('Blocked actor position');
  if(!requiredInteractionsReachable(map,state.player,state.actors))throw new Error('Unreachable required interaction or exit');
  const arrivals=[map.spawn,...Object.values(maps).flatMap(source=>source.exits.filter(exit=>exit.to===map.id).map(exit=>exit.at))];
  if(arrivals.some(at=>!safeMapEntry(map,at,state.actors)||!requiredInteractionsReachable(map,at,state.actors)))throw new Error('Blocked map entrance');
}
export function encodeSave(state:GameState):string { return JSON.stringify(state); }
export function decodeSave(text:string,maps:Record<string,MapData>):GameState {
  if(text.length>512000)throw new Error('Save too large');
  let raw:unknown=JSON.parse(text);
  if(!validRecord(raw))throw new Error('Invalid save');
  if(raw.version===0) {
    raw={...newGame(), mapId:raw.mapId, player:{x:raw.x,y:raw.y,facing:'down'},followers:[],flags:raw.flags??{}};
  }
  if(validRecord(raw)&&raw.version===1)raw={...raw,version:2,actorMemory:{}};
  if(!validRecord(raw)||raw.version!==2||typeof raw.mapId!=='string'||!Object.hasOwn(maps,raw.mapId))throw new Error('Unsupported save version or map');
  const map=maps[raw.mapId]!;
  const point=(p:unknown):p is Point=>pointOnMap(p,map);
  if(!point(raw.player)||!['up','down','left','right'].includes(String((raw.player as unknown as Record<string,unknown>).facing)))throw new Error('Invalid player');
  if(!validRecord(raw.actorMemory)||!validRecord(raw.flags)||!validRecord(raw.inventory)||!Array.isArray(raw.followers)||raw.followers.length>3||!Array.isArray(raw.lamps)||!int(raw.steps))throw new Error('Invalid save data');
  validateActors(raw.actors,map);
  const actors=raw.actors;
  if(Object.entries(raw.flags).some(([k,v])=>!validFlagId(k)||typeof v!=='boolean'))throw new Error('Invalid flags');
  const view=activeMap(map,raw.flags as Record<string,boolean>);
  if(!safeMapEntry(view,raw.player,actors)||raw.followers.some(p=>!point(p)||!walkable(view,p.x,p.y,actors)))throw new Error('Blocked save position');
  if(Object.entries(raw.inventory).some(([k,v])=>!/^\w[\w.]*$/.test(k)||!int(v)||v>999))throw new Error('Invalid inventory');
  const lampIds=new Set(Object.values(maps).flatMap(m=>m.entities.filter(e=>e.kind==='lamp').map(e=>e.id)));
  if(new Set(raw.lamps).size!==raw.lamps.length||raw.lamps.some(id=>typeof id!=='string'||!lampIds.has(id)))throw new Error('Invalid lamps');
  const state=raw as unknown as GameState;
  validateLayout(state,map,maps);
  for(const [mapId,memory] of Object.entries(state.actorMemory)) {
    if(!Object.hasOwn(maps,mapId))throw new Error('Invalid actor memory map');
    const rememberedMap=maps[mapId]!;
    validateActors(memory,rememberedMap);
    validateLayout({...state,mapId,player:{...rememberedMap.spawn,facing:state.player.facing},followers:[],actors:memory},rememberedMap,maps);
  }
  return structuredClone({version:2,mapId:state.mapId,player:state.player,followers:state.followers,actors:state.actors,actorMemory:state.actorMemory,flags:state.flags,lamps:state.lamps,steps:state.steps,inventory:state.inventory});
}
interface StoragePort { getItem(key:string):string|null;setItem(key:string,value:string):void }
type SaveResult={ok:true}|{ok:false};
type LoadResult={ok:true;state:GameState}|{ok:false};
export class SaveStore {
  private storage:StoragePort;
  private maps:Record<string,MapData>;
  constructor(storage:StoragePort,maps:Record<string,MapData>) { this.storage=storage;this.maps=maps; }
  private key(slot:number):string {if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Invalid slot');return `astra.save.${slot}`;}
  save(slot:number,state:GameState):SaveResult {try{const raw=encodeSave(state);decodeSave(raw,this.maps);this.storage.setItem(this.key(slot),raw);return {ok:true};}catch{return {ok:false};}}
  load(slot:number):LoadResult {try{const raw=this.storage.getItem(this.key(slot));if(!raw)return {ok:false};return {ok:true,state:decodeSave(raw,this.maps)};}catch{return {ok:false};}}
}
