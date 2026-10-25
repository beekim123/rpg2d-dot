import data from '../../../../content/data/battle-skills.json' with {type:'json'};
import type {BattleSkill,Point} from './model.ts';

const definitions:Readonly<BattleSkill>[]=data.skills.map(skill=>Object.freeze({...skill}) as Readonly<BattleSkill>);
export const skillIds:readonly string[]=Object.freeze(definitions.map(skill=>skill.id));
export const battleRules=Object.freeze({...data.rules});
export function getSkill(id:string):Readonly<BattleSkill>|undefined {return definitions.find(skill=>skill.id===id);}

/** Supercover ray: a diagonal corner also tests both touching side cells. Units do not block rays. */
export function hasLineOfSight(from:Point,to:Point,blocked:readonly Point[]):boolean {
  const wall=(x:number,y:number)=>blocked.some(p=>p.x===x&&p.y===y);
  let x=from.x,y=from.y,ix=0,iy=0;
  const nx=Math.abs(to.x-from.x),ny=Math.abs(to.y-from.y),sx=Math.sign(to.x-from.x),sy=Math.sign(to.y-from.y);
  if(wall(x,y))return false;
  while(ix<nx||iy<ny){
    const decision=(1+2*ix)*ny-(1+2*iy)*nx;
    if(decision===0){
      if(wall(x+sx,y)||wall(x,y+sy))return false;
      x+=sx;y+=sy;ix++;iy++;
    }else if(decision<0){x+=sx;ix++;}else{y+=sy;iy++;}
    if(wall(x,y))return false;
  }
  return true;
}
