import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildMovementFixtures} from '../../tools/qa/battle-movement-fixtures.ts';

it('records actual movement paths, deterministic tether pull and undo',()=>{
  const replay=buildMovementFixtures().replays.find(r=>r.id==='movement_and_turns')!;
  expect(replay).toBeDefined();
  expect(replay.steps[3]!.expected.events).toMatchObject([{type:'move',path:[{x:1,y:2},{x:1,y:3},{x:1,y:4}]},{type:'tether_pull',to:{x:1,y:2}}]);
  expect(replay.steps[5]!.expected.state.actors[0]!.body).toEqual({x:1,y:2});
});
it('keeps manifestation after undo and refuses another free manifestation',()=>{
  const replay=buildMovementFixtures().replays.find(r=>r.id==='manifest_once')!;
  expect(replay).toBeDefined();
  const undo=replay.steps[6]!.expected;
  expect(undo.state.actors[0]!.astral).toEqual({x:2,y:2});
  expect(undo.state.manifestUsed).toBe(true);
  expect(replay.steps[7]!.expected.ok).toBe(false);
});
it('reproduces complete states, ordered events and reachable endpoint previews',()=>{
  expect(JSON.parse(readFileSync('tests/fixtures/battle/movement.json','utf8'))).toEqual(buildMovementFixtures());
});
