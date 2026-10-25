import {expect,type Page} from '@playwright/test';
import home from '../../content/maps/prologue/lv-finn_house.json' with {type:'json'};
import town from '../../content/maps/prologue/lv-town.json' with {type:'json'};
import shop from '../../content/maps/prologue/lv-lamp_shop.json' with {type:'json'};
export type Point={x:number;y:number};
export type MapData={id:string;width:number;height:number;rows:string[];spawn:Point;entities:{x:number;y:number;solid?:boolean;footprint?:number[];visibleWhen?:{all?:string[];none?:string[]}}[];exits:({pair:string;to:string;at:Point}&Point)[]};
export const maps:Record<string,MapData>={'lv.finn_house':home,'lv.town':town,'lv.lamp_shop':shop};
const directions=[{x:0,y:-1,key:'ArrowUp'},{x:0,y:1,key:'ArrowDown'},{x:-1,y:0,key:'ArrowLeft'},{x:1,y:0,key:'ArrowRight'}];
const key=(p:Point)=>`${p.x},${p.y}`;
function walkable(map:MapData,p:Point):boolean{
  if(p.x<0||p.y<0||p.x>=map.width||p.y>=map.height||'wt'.includes(map.rows[p.y]![p.x]!))return false;
  return !map.entities.some(e=>{
    if(!e.solid||(e.visibleWhen?.all?.length??0)>0)return false;
    const [w,h]=e.footprint??[1,1],left=e.x-Math.floor(w!/2),top=e.y-h!+1;
    return p.x>=left&&p.x<left+w!&&p.y>=top&&p.y<top+h!;
  });
}
export function route(map:MapData,start:Point,goal:Point):{point:Point;key:string}[]{
  const queue=[start],seen=new Set([key(start)]),previous=new Map<string,{from:Point;key:string}>();
  for(let cursor=0;cursor<queue.length;cursor++){
    const at=queue[cursor]!;
    if(key(at)===key(goal)){
      const steps:{point:Point;key:string}[]=[];let current=goal;
      while(key(current)!==key(start)){const parent=previous.get(key(current))!;steps.unshift({point:current,key:parent.key});current=parent.from;}
      return steps;
    }
    for(const d of directions){
      const next={x:at.x+d.x,y:at.y+d.y};
      const otherDoor=map.exits.some(e=>key(e)===key(next)&&key(e)!==key(goal));
      if(!seen.has(key(next))&&!otherDoor&&walkable(map,next)){seen.add(key(next));previous.set(key(next),{from:at,key:d.key});queue.push(next);}
    }
  }
  throw new Error(`No legal route through ${map.id}`);
}
export async function traverse(page:Page,map:MapData,start:Point,target:string):Promise<Point>{
  const door=map.exits.find(e=>e.to===target)!;const canvas=page.locator('#canvas');
  for(const step of route(map,start,door)){
    await page.keyboard.down(step.key);
    await expect(canvas).toHaveAttribute('data-grid_x',String(step.point.x));
    await expect(canvas).toHaveAttribute('data-grid_y',String(step.point.y));
    await page.keyboard.up(step.key);
    if(key(step.point)!==key(door))await expect(canvas).toHaveAttribute('data-moving','false');
  }
  await expect(canvas).toHaveAttribute('data-map_id',target);
  await expect(canvas).toHaveAttribute('data-moving','false');
  await expect(canvas).toHaveAttribute('data-grid_x',String(door.at.x));
  await expect(canvas).toHaveAttribute('data-grid_y',String(door.at.y));
  return door.at;
}

export async function walkTo(page:Page,map:MapData,start:Point,goal:Point):Promise<void>{
  const canvas=page.locator('#canvas');
  for(const step of route(map,start,goal)){
    await page.keyboard.down(step.key);
    await expect(canvas).toHaveAttribute('data-grid_x',String(step.point.x));
    await expect(canvas).toHaveAttribute('data-grid_y',String(step.point.y));
    await page.keyboard.up(step.key);
    await expect(canvas).toHaveAttribute('data-moving','false');
  }
}
export async function face(page:Page,key:string,direction:string):Promise<void>{
  await page.keyboard.down(key);
  await expect(page.locator('#canvas')).toHaveAttribute('data-facing',direction);
  await page.keyboard.up(key);
}
