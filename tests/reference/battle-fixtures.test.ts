import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildMathFixtures} from '../../tools/qa/battle-fixtures.ts';

describe('shared battle oracle', () => {
  it('records hand-calculated vulnerability, recall and final rounding', () => {
    const fixture=buildMathFixtures();
    for(const [id,value] of [['damage_astral',80],['damage_body',120],['damage_recalled',56],['damage_round_once',21]] as const){
      expect(fixture.cases.find(c=>c.id===id)?.expected).toEqual({ok:true,value});
    }
  });
  it('records shield consumption followed by lethal shared HP and an extinguished repeat', () => {
    const fixture=buildMathFixtures();
    const replay=fixture.replays.find(r=>r.id==='shield_then_ko')!;
    expect(replay.steps.map(s=>s.expected)).toMatchObject([
      {ok:true,value:{damage:0,absorbed:10,actor:{hp:20,shield:5,mode:'manifested'}}},
      {ok:true,value:{damage:20,absorbed:5,actor:{hp:0,shield:0,mode:'extinguished',astral:null}}},
      {ok:true,value:{damage:0,absorbed:0,actor:{hp:0}}},
      {ok:false},
    ]);
  });
  it('keeps the checked-in oracle reproducible, including reference source hashes', () => {
    expect(JSON.parse(readFileSync('tests/fixtures/battle/math.json','utf8'))).toEqual(buildMathFixtures());
  });
});
