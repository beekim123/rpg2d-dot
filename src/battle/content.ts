import ella from '../../content/data/battles/prologue_ella.json' with {type:'json'};
import shade from '../../content/data/battles/prologue_shade.json' with {type:'json'};
import type {BattleDefinition} from './engine.ts';
/** Authored candidates for the two prologue fights; scene integration is separate. */
export const battles:Record<string,BattleDefinition>={prologue_ella:ella as BattleDefinition,prologue_shade:shade as BattleDefinition};
