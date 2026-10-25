import { canPlaceActor, requiredInteractionsReachable, type GameState, type MapData } from './world.ts';
export type Say = {op:'say';speaker:string;portrait:string;text:string};
export type Command = Say | {op:'set';flag:string;value:boolean} | {op:'if';flag:string;equals:boolean;goto:number} | {op:'move';entity:string;x:number;y:number} | {op:'end'};
export interface ScriptResult {state:GameState;pc:number;line?:Say;done:boolean}
export function runScript(script:Command[],input:GameState,cursor:number,map:MapData):ScriptResult {
  const state=structuredClone(input);let pc=cursor;let moved=false;
  const result=(done:boolean,line?:Say):ScriptResult=>{
    if(moved&&!requiredInteractionsReachable(map,state.player,state.actors))throw new Error('Unreachable required interaction after actor move');
    return line?{state,pc,line,done}:{state,pc,done};
  };
  for(let budget=0;budget<100;budget++) {
    if(!Number.isInteger(pc)||pc<0||pc>script.length)throw new Error('Invalid script cursor');
    const command=script[pc++];
    if(!command||command.op==='end')return result(true);
    switch(command.op) {
      case 'say':return result(false,command);
      case 'set':state.flags[command.flag]=command.value;break;
      case 'if':if((state.flags[command.flag]??false)===command.equals)pc=command.goto;break;
      case 'move': {
        const target={x:command.x,y:command.y};
        if(!canPlaceActor(state,map,command.entity,target))throw new Error(`Invalid actor move: ${command.entity}`);
        state.actors[command.entity]=target;moved=true;break;
      }
      default:throw new Error('Invalid story command');
    }
  }
  throw new Error('Script instruction budget exceeded');
}
