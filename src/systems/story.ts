import { activeMap, canPlaceActor, requiredInteractionsReachable, safeMapEntry, validFlagId, type GameState, type MapData } from './world.ts';
export type Say = {op:'say';speaker:string;portrait:string;text:string};
export type Command = Say | {op:'set';flag:string;value:boolean} | {op:'if';flag:string;equals:boolean;goto:number} | {op:'move';entity:string;x:number;y:number} | {op:'end'};
export interface ScriptResult {state:GameState;pc:number;line?:Say;done:boolean}
export function runScript(script:Command[],input:GameState,cursor:number,map:MapData):ScriptResult {
  const state=structuredClone(input);let pc=cursor;
  const result=(done:boolean,line?:Say):ScriptResult=>{
    const view=activeMap(map,state.flags);
    if([state.player,...state.followers].some(point=>!safeMapEntry(view,point,state.actors)))throw new Error('Blocked player position after story');
    if(view.entities.some(entity=>entity.kind==='npc'&&!canPlaceActor(state,view,entity.id,Object.hasOwn(state.actors,entity.id)?state.actors[entity.id]!:entity)))throw new Error('Blocked actor position after story');
    if(!requiredInteractionsReachable(view,state.player,state.actors))throw new Error('Unreachable required interaction or exit after story');
    return line?{state,pc,line,done}:{state,pc,done};
  };
  for(let budget=0;budget<100;budget++) {
    if(!Number.isInteger(pc)||pc<0||pc>script.length)throw new Error('Invalid script cursor');
    const command=script[pc++];
    if(!command||command.op==='end')return result(true);
    switch(command.op) {
      case 'say':return result(false,command);
      case 'set':
        if(!validFlagId(command.flag)||typeof command.value!=='boolean')throw new Error('Invalid story flag');
        state.flags={...state.flags,[command.flag]:command.value};break;
      case 'if':
        if(!validFlagId(command.flag)||typeof command.equals!=='boolean')throw new Error('Invalid story flag');
        if((Object.hasOwn(state.flags,command.flag)&&state.flags[command.flag]===true)===command.equals)pc=command.goto;break;
      case 'move': {
        const target={x:command.x,y:command.y};
        if(!canPlaceActor(state,map,command.entity,target))throw new Error(`Invalid actor move: ${command.entity}`);
        state.actors={...state.actors,[command.entity]:target};break;
      }
      default:throw new Error('Invalid story command');
    }
  }
  throw new Error('Script instruction budget exceeded');
}
