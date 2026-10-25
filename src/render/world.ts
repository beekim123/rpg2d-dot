import { Assets } from './assets.ts';
import { cameraOffset, edgeMask, walkable, type MapData, type GameState, type Point } from '../systems/world.ts';
export function renderWorld(ctx:CanvasRenderingContext2D,assets:Assets,map:MapData,state:GameState,tick:number,visual:Point,walking:boolean,grid:boolean):void {
  const cx=cameraOffset(visual.x*16+8,map.width*16,480),cy=cameraOffset(visual.y*16+8,map.height*16,270);
  ctx.fillStyle='#1a1220';ctx.fillRect(0,0,480,270);
  ctx.save();ctx.translate(-cx,-cy);
  for(let y=Math.max(0,Math.floor(cy/16));y<Math.min(map.height,Math.ceil((cy+270)/16));y++)for(let x=Math.max(0,Math.floor(cx/16));x<Math.min(map.width,Math.ceil((cx+480)/16));x++) {
    const tile=map.rows[y]![x]!;const hash=((x*73856093)^(y*19349663))>>>0;const variant=tile==='g'||tile==='t'?(hash%10<7?0:1+hash%3):hash%4;
    assets.draw(ctx,tile==='b'?'tile.bridge':tile==='s'?'tile.path':tile==='w'?'tile.water':'tile.grass',x*16,y*16,tile==='b'?0:tile==='w'?Math.floor(tick/15)%2:variant,false);
    if(tile==='g') { assets.draw(ctx,'tile.edge',x*16,y*16,edgeMask(map.rows,x,y),false);if((x*11+y*23)%41===0)assets.draw(ctx,'prop.flower',x*16,y*16,0,false); }
    if(tile==='t')assets.draw(ctx,'prop.hedge',x*16+8,y*16+16,0);
  }
  const sprites:{id:string;x:number;y:number;frame:number;shadow:boolean}[]=map.entities.map(e=>{
    const p=state.actors[e.id]??e;return {id:e.sprite,x:p.x*16+8,y:p.y*16+16,frame:e.kind==='lamp'?assets.frame(e.sprite,state.lamps.includes(e.id)?'lit':'unlit',tick):assets.frame(e.sprite,'idle',tick),shadow:e.kind==='npc'};
  });
  // Followers are populated when a companion joins; M0 exercises the path data in unit tests.
  for(const p of state.followers)sprites.push({id:'char.hob',x:p.x*16+8,y:p.y*16+16,frame:0,shadow:true});
  sprites.push({id:'char.finn',x:visual.x*16+8,y:visual.y*16+16,frame:assets.frame('char.finn',`${walking?'walk':'idle'}_${state.player.facing}`,tick),shadow:true});
  sprites.sort((a,b)=>a.y-b.y);
  for(const s of sprites){if(s.shadow)assets.draw(ctx,'prop.shadow',s.x,s.y);assets.draw(ctx,s.id,s.x,s.y,s.frame);}
  if(grid) {
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      ctx.strokeStyle=walkable(map,x,y,state.actors)?'#c4e070':'#d6453a';ctx.strokeRect(x*16+0.5,y*16+0.5,15,15);
    }
  }
  ctx.restore();
}
