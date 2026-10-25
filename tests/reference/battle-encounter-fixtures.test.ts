import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildEncounterFixtures} from '../../tools/qa/battle-encounter-fixtures.ts';
it('pins fixed targeting and shield/recall/replacement damage forecasts',()=>{
  const f=buildEncounterFixtures()['intents.json']!;const replay=(id:string)=>f.replays.find(r=>r.id===id)!;
  expect(replay('intermediate_path_blocked').steps[0]!.expected.encounter.intents.foe!.reason).toBe('plan_blocked');
  expect(replay('collision_forecast').expectedInitial.intents.foe!.expectedDamage).toBe(39);
  expect(replay('target_defeated_by_other_enemy').steps[0]!.expected.encounter.intents.foe2!.reason).toBe('target_unavailable');
  expect(replay('guard_forecast').expectedInitial.intents.foe!.expectedDamage).toBe(14);
  expect(replay('guard_forecast').steps[0]!.expected.encounter.intents.foe!.expectedDamage).toBe(0);
  expect(replay('recall_forecast').steps[0]!.expected.encounter.intents.foe!.expectedDamage).toBe(7);
  expect(replay('point_replacement').steps[3]!.expected.encounter.intents.foe!.expectedDamage).toBe(10);
  expect(replay('unit_out_of_range').steps[0]!.expected.encounter.intents.foe!.reason).toBe('outside_skill_range');
});
it('reproduces the intent and genuine win/loss route oracles without changing expected output',()=>{
  for(const [file,fixture] of Object.entries(buildEncounterFixtures()))expect(JSON.parse(readFileSync('tests/fixtures/battle/'+file,'utf8'))).toEqual(fixture);
});
