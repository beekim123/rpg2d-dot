import {expect,it} from 'vitest';
import ella from '../../content/data/battles/prologue_ella.json';
import shade from '../../content/data/battles/prologue_shade.json';
import {createBattle,type BattleDefinition} from '../../reference/web/src/battle/engine.ts';

it.each([ella,shade])('constructs the authored $id arena with legal shared-HP units',definition=>{
  const state=createBattle(definition as BattleDefinition);
  expect(state.phase).toBe('active');expect(state.activeId).toBe(definition.actors[0]!.id);
  expect(state.actors.every(a=>a.hp>0&&a.astral!==null)).toBe(true);
});

it('reports missing battle skills before a fight can reach the player',async()=>{
  const {validateBattles}=await import('../../reference/web/src/battle/content-check.ts');
  const bad=structuredClone(ella) as BattleDefinition;
  bad.actors[0]!.skillIds=['missing_skill'];
  expect(validateBattles({bad}).join(' ')).toMatch(/missing_skill/);
  expect(validateBattles({ella:ella as BattleDefinition,shade:shade as BattleDefinition})).toEqual([]);
});

it('rejects invalid skill costs and duplicate definitions at content-check time',async()=>{
  const {validateSkillDefinitions}=await import('../../reference/web/src/battle/content-check.ts');
  const skill={id:'test',cost:0,power:10,range:1,weight:'normal',effect:'damage'} as const;
  expect(validateSkillDefinitions([skill])).toEqual([]);
  expect(validateSkillDefinitions([{...skill,cost:-1}]).join(' ')).toMatch(/cost/);
  expect(validateSkillDefinitions([skill,skill]).join(' ')).toMatch(/Duplicate/);
});
