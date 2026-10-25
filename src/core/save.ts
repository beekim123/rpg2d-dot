import { canPlaceActor, newGame, requiredInteractionsReachable, walkable, type GameState, type MapData, type Point } from '../systems/world.ts';
const validRecord=(value:unknown):value is Record<string,unknown> => !!value&&typeof value==='object'&&!Array.isArray(value);
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
export function encodeSave(state:GameState):string { return JSON.stringify(state); }
export function decodeSave(text:string,maps:Record<string,MapData>):GameState {
  if(text.length>512000)throw new Error('Save too large');
  let raw:unknown=JSON.parse(text);
  if(!validRecord(raw))throw new Error('Invalid save');
  if(raw.version===0) {
    raw={...newGame(), mapId:raw.mapId, player:{x:raw.x,y:raw.y,facing:'down'},followers:[],flags:raw.flags??{}};
  }
  if(!validRecord(raw)||raw.version!==1||typeof raw.mapId!=='string'||!maps[raw.mapId])throw new Error('Unsupported save version or map');
  const map=maps[raw.mapId]!;
  const point=(p:unknown):p is Point=>validRecord(p)&&int(p.x)&&int(p.y)&&Number(p.x)<map.width&&Number(p.y)<map.height;
  if(!point(raw.player)||!['up','down','left','right'].includes(String((raw.player as unknown as Record<string,unknown>).facing)))throw new Error('Invalid player');
  if(!validRecord(raw.actors)||!validRecord(raw.flags)||!validRecord(raw.inventory)||!Array.isArray(raw.followers)||raw.followers.length>3||!Array.isArray(raw.lamps)||!int(raw.steps))throw new Error('Invalid save data');
  for(const [key,p]of Object.entries(raw.actors))if(!map.entities.some(e=>e.id===key&&e.kind==='npc')||!point(p))throw new Error('Invalid actor');
  const actors=raw.actors as Record<string,Point>;
  if(!walkable(map,raw.player.x,raw.player.y,actors)||raw.followers.some(p=>!point(p)||!walkable(map,p.x,p.y,actors)))throw new Error('Blocked save position');
  if(Object.entries(raw.flags).some(([k,v])=>!/^\w[\w.]*$/.test(k)||['__proto__','constructor','prototype'].includes(k)||typeof v!=='boolean'))throw new Error('Invalid flags');
  if(Object.entries(raw.inventory).some(([k,v])=>!/^\w[\w.]*$/.test(k)||!int(v)||v>999))throw new Error('Invalid inventory');
  if(new Set(raw.lamps).size!==raw.lamps.length||raw.lamps.some(id=>typeof id!=='string'||!map.entities.some(e=>e.kind==='lamp'&&e.id===id)))throw new Error('Invalid lamps');
  const state=raw as unknown as GameState;
  if(Object.entries(state.actors).some(([id,p])=>!canPlaceActor(state,map,id,p)))throw new Error('Blocked actor position');
  if(!requiredInteractionsReachable(map,state.player,state.actors))throw new Error('Unreachable required interaction');
  return structuredClone({version:1,mapId:state.mapId,player:state.player,followers:state.followers,actors:state.actors,flags:state.flags,lamps:state.lamps,steps:state.steps,inventory:state.inventory});
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
