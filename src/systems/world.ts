export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Point { x: number; y: number }
export interface Entity extends Point { id: string; kind: 'npc'|'lamp'|'decoration'; sprite: string; solid: boolean; script?: string; footprint?: [number,number] }
export interface MapData { id: string; name: string; width: number; height: number; rows: string[]; spawn: Point; entities: Entity[]; arenas?:Record<string,{x:number;y:number;width:number;height:number}>; required: string[]; exits: {x:number;y:number;to:string;at:Point}[] }
export interface GameState { version: 1; mapId: string; player: Point & { facing: Direction }; followers: Point[]; actors: Record<string,Point>; flags: Record<string,boolean>; lamps: string[]; steps: number; inventory: Record<string,number> }
export const DELTA: Record<Direction, Point> = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
export function newGame(): GameState {
  return { version:1,mapId:'lantern.test',player:{x:8,y:12,facing:'down'},followers:[],actors:{},flags:{},lamps:[],steps:0,inventory:{bread:3} };
}
export function parseMap(raw: unknown): MapData {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid map');
  const map = raw as MapData;
  if (typeof map.id!=='string' || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width<1 || map.height<1 || !Array.isArray(map.rows) || map.rows.length!==map.height || map.rows.some(r=>typeof r!=='string'||r.length!==map.width||/[^gswbt]/.test(r))) throw new Error('Invalid map dimensions or tiles');
  if(!Array.isArray(map.entities)||!Array.isArray(map.required)||!Array.isArray(map.exits)||!map.spawn) throw new Error('Missing map data');
  const ids = new Set<string>();
  for(const e of map.entities) {
    if(typeof e.id!=='string'||ids.has(e.id)||!Number.isInteger(e.x)||!Number.isInteger(e.y)||e.x<0||e.y<0||e.x>=map.width||e.y>=map.height||!['npc','lamp','decoration'].includes(e.kind)||typeof e.sprite!=='string'||typeof e.solid!=='boolean') throw new Error('Invalid entity');
    if(e.footprint && (e.footprint.length!==2 || e.footprint.some(n=>!Number.isInteger(n)||n<1))) throw new Error('Invalid footprint');
    ids.add(e.id);
  }
  if(!walkable(map,map.spawn.x,map.spawn.y)) throw new Error('Blocked spawn');
  return map;
}
export function entityAt(map:MapData,x:number,y:number, actors:Record<string,Point>={}):Entity|undefined {
  return map.entities.find(e=>{
    const p=actors[e.id]??e; const [w,h]=e.footprint??[1,1];
    return x>=p.x-Math.floor(w/2)&&x<p.x-Math.floor(w/2)+w&&y>p.y-h&&y<=p.y;
  });
}
/** Only NPCs can move; every occupied tile must remain free of terrain and other actors. */
export function canPlaceActor(state:GameState,map:MapData,actorId:string,target:Point):boolean {
  const actor=map.entities.find(e=>e.id===actorId);
  if(!actor||actor.kind!=='npc'||!Number.isSafeInteger(target.x)||!Number.isSafeInteger(target.y))return false;
  const [width,height]=actor.footprint??[1,1];
  const left=target.x-Math.floor(width/2),top=target.y-height+1;
  const otherEntities={...map,entities:map.entities.filter(e=>e.id!==actorId)};
  for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++) {
    if(x<0||y<0||x>=map.width||y>=map.height||['w','t'].includes(map.rows[y]![x]!))return false;
    if(entityAt(otherEntities,x,y,state.actors))return false;
    if([state.player,...state.followers].some(p=>p.x===x&&p.y===y))return false;
  }
  return true;
}
export function walkable(map:MapData,x:number,y:number,actors:Record<string,Point>={}):boolean {
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.width||y>=map.height) return false;
  return !['w','t'].includes(map.rows[y]![x]!) && !entityAt(map,x,y,actors)?.solid;
}
export function movePlayer(state:GameState,map:MapData,direction:Direction):GameState {
  const result=structuredClone(state); result.player.facing=direction;
  const d=DELTA[direction];const x=state.player.x+d.x,y=state.player.y+d.y;
  if(walkable(map,x,y,state.actors)) {
    result.followers=[{x:state.player.x,y:state.player.y},...state.followers].slice(0,state.followers.length);
    result.player={x,y,facing:direction};result.steps++;
  }
  return result;
}
export function interact(state:GameState,map:MapData):{state:GameState;script?:string;lamp?:string;newlyLit?:boolean} {
  const d=DELTA[state.player.facing]; const e=entityAt(map,state.player.x+d.x,state.player.y+d.y,state.actors);
  if(e?.kind==='npc')return {state,script:e.script};
  if(e?.kind==='lamp') {
    const next=structuredClone(state);const newlyLit=!next.lamps.includes(e.id); if(newlyLit)next.lamps.push(e.id);
    return {state:next,lamp:e.id,newlyLit};
  }
  return {state};
}
export function nearLitLamp(state:GameState,map:MapData):boolean {
  return map.entities.some(e=>{
    const p=state.actors[e.id]??e;
    return e.kind==='lamp'&&state.lamps.includes(e.id)&&Math.abs(p.x-state.player.x)+Math.abs(p.y-state.player.y)<=1;
  });
}
export function reachable(map:MapData,start:Point,actors:Record<string,Point>={}):Set<string> {
  const seen=new Set<string>(); const queue=[start];
  for(let i=0;i<queue.length;i++) {
    const p=queue[i]!;const key=`${p.x},${p.y}`;
    if(seen.has(key)||!walkable(map,p.x,p.y,actors))continue;seen.add(key);
    for(const d of Object.values(DELTA))queue.push({x:p.x+d.x,y:p.y+d.y});
  }
  return seen;
}
/** Match interaction's actual front-cell lookup against the final actor layout. */
export function requiredInteractionsReachable(map:MapData,start:Point,actors:Record<string,Point>={}):boolean {
  const seen=reachable(map,start,actors);
  return map.required.every(id=>{
    const entity=map.entities.find(e=>e.id===id);if(!entity)return false;
    const p=actors[id]??entity;const [width,height]=entity.footprint??[1,1];
    const left=p.x-Math.floor(width/2),top=p.y-height+1;
    for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++) {
      if(entityAt(map,x,y,actors)?.id!==id)continue;
      if(Object.values(DELTA).some(d=>seen.has(`${x+d.x},${y+d.y}`)))return true;
    }
    return false;
  });
}
export function edgeMask(rows:string[],x:number,y:number):number {
  return ([['up',1],['right',2],['down',4],['left',8]] as const).reduce((mask,[dir,bit])=>{
    const d=DELTA[dir];return mask | (rows[y+d.y]?.[x+d.x]==='s'?bit:0);
  },0);
}
export function cameraOffset(center:number,mapPixels:number,viewport:number):number {
  return mapPixels<viewport ? -Math.floor((viewport-mapPixels)/2) : Math.max(0,Math.min(mapPixels-viewport,Math.round(center-viewport/2)));
}
