import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildSkillFixtures} from '../../tools/qa/battle-skill-fixtures.ts';
it('locks hand-calculated marks, collision deduplication and defeat priority',()=>{
  const f=buildSkillFixtures();const last=(id:string)=>f.replays.find(r=>r.id===id)!.steps.at(-1)!.expected;
  expect(last('marks_cap_and_detonate').state.actors[1]).toMatchObject({hp:201,lampMarks:0});
  expect(last('same_owner_collision').state.actors[1]!.hp).toBe(71);
  expect(last('wall_collision').state.actors[1]!.hp).toBe(61);
  expect(last('two_owner_collision').state.actors.map(a=>a.hp)).toEqual([100,61,90]);
  expect(last('simultaneous_ko_loses').state.phase).toBe('lost');
  expect(last('floor_hit_counts').state.phase).toBe('won');
  expect(last('full_shield_no_hit').state.phase).toBe('active');
});
it('verifies skill fixture provenance and exact serialized state/events',()=>{
  expect(JSON.parse(readFileSync('tests/fixtures/battle/skills.json','utf8'))).toEqual(buildSkillFixtures());
});
