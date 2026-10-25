import { Assets } from './assets.ts';
import {phaseFor} from './animation.ts';
import { cameraOffset, edgeMask, walkable, type MapData, type GameState, type Point } from '../systems/world.ts';
const terrainCache=new WeakMap<Assets,WeakMap<MapData,HTMLCanvasElement>>();
function terrain(assets:Assets,map:MapData):HTMLCanvasElement {
  let maps=terrainCache.get(assets);if(!maps){maps=new WeakMap();terrainCache.set(assets,maps);}
  const existing=maps.get(map);if(existing)return existing;
  const canvas=document.createElement('canvas');canvas.width=map.width*16;canvas.height=map.height*16;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const tile=map.rows[y]![x]!,hash=((x*73856093)^(y*19349663))>>>0;
    const variant=tile==='g'||tile==='t'?(hash%10<7?0:1+hash%3):hash%4;
    assets.draw(ctx,tile==='b'?'tile.bridge':tile==='s'?'tile.path':tile==='w'?'tile.water':'tile.grass',x*16,y*16,tile==='w'||tile==='b'?0:variant,false);
    if(tile==='g')assets.draw(ctx,'tile.edge',x*16,y*16,edgeMask(map.rows,x,y),false);
  }
  maps.set(map,canvas);return canvas;
}
export function renderWorld(ctx:CanvasRenderingContext2D,assets:Assets,map:MapData,state:GameState,tick:number,visual:Point,walking:boolean,grid:boolean,hidePlayer=false,hiddenEntityIds:readonly string[]=[]):void {
  const cx=cameraOffset(visual.x*16+8,map.width*16,480),cy=cameraOffset(visual.y*16+8,map.height*16,270);
  ctx.fillStyle='#1a1220';ctx.fillRect(0,0,480,270);
  ctx.save();ctx.translate(-cx,-cy);ctx.drawImage(terrain(assets,map),0,0);
  for(let y=Math.max(0,Math.floor(cy/16));y<Math.min(map.height,Math.ceil((cy+270)/16));y++)for(let x=Math.max(0,Math.floor(cx/16));x<Math.min(map.width,Math.ceil((cx+480)/16));x++) {
    const tile=map.rows[y]![x]!;
    if(tile==='w')assets.draw(ctx,'tile.water',x*16,y*16,assets.frame('tile.water','idle',tick,phaseFor(`water:${y}`)),false);
    if(tile==='g'&&(x*11+y*23)%41===0)assets.draw(ctx,'prop.flower',x*16,y*16,assets.frame('prop.flower','idle',tick,phaseFor(`flower:${x},${y}`)),false);
    if(tile==='t')assets.draw(ctx,'prop.hedge',x*16+8,y*16+16,assets.frame('prop.hedge','idle',tick,phaseFor(`hedge:${x},${y}`)));
  }
  const sprites:{id:string;x:number;y:number;frame:number;shadow:boolean}[]=map.entities.filter(e=>!hiddenEntityIds.includes(e.id)).map(e=>{
    const p=state.actors[e.id]??e;return {id:e.sprite,x:p.x*16+8,y:p.y*16+16,frame:e.kind==='lamp'?assets.frame(e.sprite,state.lamps.includes(e.id)?'lit':'unlit',tick,phaseFor(e.id)):assets.frame(e.sprite,'idle',tick,phaseFor(e.id)),shadow:e.kind==='npc'};
  });
  // Followers are populated when a companion joins; M0 exercises the path data in unit tests.
  if(!hidePlayer)for(const [i,p] of state.followers.entries())sprites.push({id:'char.hob',x:p.x*16+8,y:p.y*16+16,frame:assets.frame('char.hob','idle',tick,phaseFor(`follower:${i}`)),shadow:true});
  if(!hidePlayer)sprites.push({id:'char.finn',x:visual.x*16+8,y:visual.y*16+16,frame:assets.frame('char.finn',`${walking?'walk':'idle'}_${state.player.facing}`,tick),shadow:true});
  sprites.sort((a,b)=>a.y-b.y);
  for(const s of sprites){if(s.shadow)assets.draw(ctx,'prop.shadow',s.x,s.y);assets.draw(ctx,s.id,s.x,s.y,s.frame);}
  if(grid) {
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      ctx.strokeStyle=walkable(map,x,y,state.actors)?'#c4e070':'#d6453a';ctx.strokeRect(x*16+0.5,y*16+0.5,15,15);
    }
  }
  ctx.restore();
}
