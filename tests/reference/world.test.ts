import { describe, expect, it } from 'vitest';
import { newGame, movePlayer, interact, parseMap, reachable, edgeMask, cameraOffset, nearLitLamp, type MapData } from '../../reference/web/src/systems/world.ts';
import { runScript } from '../../reference/web/src/systems/story.ts';
import { decodeSave, encodeSave, SaveStore } from '../../reference/web/src/core/save.ts';
import { maps, scripts, words } from '../../reference/web/src/content.ts';

function dividedMap(): MapData {
  return parseMap({
    id: 'layout.test', name: 'test', width: 9, height: 7,
    rows: ['ttttttttt', 'tgggtgggt', 'tgggtgggt', 'tgggggggt', 'tgggtgggt', 'tgggtgggt', 'ttttttttt'],
    spawn: { x: 1, y: 3 },
    entities: [
      { id: 'hob', kind: 'npc', sprite: 'char.hob', x: 2, y: 1, solid: true, script: 'hob' },
      { id: 'lamp', kind: 'lamp', sprite: 'prop.lamp', x: 7, y: 3, solid: true },
    ],
    required: ['lamp'], exits: [],
  });
}

describe('exploration', () => {
  it('rejects solid terrain, bounds and occupied cells without moving followers', () => {
    const s = newGame(); s.player = { x: 0, y: 0, facing: 'up' };
    const moved = movePlayer(s, maps[s.mapId]!, 'up');
    expect(moved.player).toEqual(s.player); expect(moved.steps).toBe(0);
    s.player = { x: 9, y: 11, facing: 'right' };
    const blocked = movePlayer(s, maps[s.mapId]!, 'right');
    expect(blocked.player.x).toBe(9); expect(blocked.followers).toEqual(s.followers);
  });
  it('updates facing against a wall and followers only on a successful step', () => {
    const s = newGame(); s.followers = [{ x: 7, y: 12 }]; const moved = movePlayer(s, maps[s.mapId]!, 'right');
    expect(moved.player.x).toBe(s.player.x + 1);
    expect(moved.followers[0]).toEqual({ x: s.player.x, y: s.player.y });
    expect(s.steps).toBe(0); expect(moved.steps).toBe(1);
  });
  it('finds the NPC in front and marks a lamp only once', () => {
    const s = newGame(); s.player = { x: 10, y: 12, facing: 'up' };
    expect(interact(s, maps[s.mapId]!).script).toBe('hob');
    s.player = { x: 15, y: 12, facing: 'up' };
    const lit = interact(s, maps[s.mapId]!);
    expect(lit.state.lamps).toEqual(['first_lamp']);
    expect(interact(lit.state, maps[s.mapId]!).state.lamps).toEqual(['first_lamp']);
  });
  it('rejects ragged maps and unknown tile symbols', () => {
    expect(() => parseMap({ ...maps['lantern.test'], rows: ['gg', 'g'] })).toThrow();
    const map = structuredClone(maps['lantern.test']!); map.rows[0] = '?'.repeat(map.width);
    expect(() => parseMap(map)).toThrow();
  });
  it('checks reachable required interactions and four-edge autotiling', () => {
    const map = maps['lantern.test']!;
    expect(reachable(map, map.spawn).has('10,12')).toBe(true);
    expect(edgeMask(['sss', 'sgs', 'sgg'], 1, 1)).toBe(11);
  });
  it('clamps a large map and centers small maps using integer pixels', () => {
    expect(cameraOffset(0, 1000, 480)).toBe(0);
    expect(cameraOffset(950, 1000, 480)).toBe(520);
    expect(cameraOffset(30, 160, 480)).toBe(-160);
  });
  it('measures lamp proximity from its rendered position if a stale override exists', () => {
    const s = newGame(); s.actors.first_lamp = { x: 20, y: 12 }; s.lamps = ['first_lamp'];
    s.player = { x: 20, y: 13, facing: 'up' };
    expect(nearLitLamp(s, maps[s.mapId]!)).toBe(true);
    s.player = { x: 15, y: 12, facing: 'up' };
    expect(nearLitLamp(s, maps[s.mapId]!)).toBe(false);
  });
});

describe('story interpreter', () => {
  it('yields dialogue, then applies the flag and takes the later branch', () => {
    let state = newGame(); let pc = 0; let spoken = 0;
    for (let guard = 0; guard < 10; guard++) {
      const r = runScript(scripts.hob!, state, pc, maps[state.mapId]!); state = r.state; pc = r.pc;
      if (r.line) { expect(words[r.line.text]).toBeTruthy(); spoken++; }
      if (r.done) break;
    }
    expect(spoken).toBe(3); expect(state.flags['met_hob']).toBe(true);
    expect(runScript(scripts.hob!, state, 0, maps[state.mapId]!).line?.text).toBe('hob.again');
  });
  it('rejects infinite branches rather than freezing the game', () => {
    expect(() => runScript([{ op: 'if', flag: 'loop', equals: false, goto: 0 }], newGame(), 0, maps['lantern.test']!)).toThrow(/budget/);
  });
  it('moves an actor through a script and leaves caller state intact', () => {
    const s = newGame(); const r = runScript([{ op: 'move', entity: 'hob', x: 12, y: 11 }], s, 0, maps[s.mapId]!);
    expect(r.state.actors.hob).toEqual({ x: 12, y: 11 }); expect(s.actors.hob).toBeUndefined();
    expect(decodeSave(encodeSave(r.state), maps)).toEqual(r.state);
  });
  it.each([
    ['missing', 12, 11], ['first_lamp', 20, 12], ['home', 20, 12],
    ['hob', 8, 12], ['hob', 7, 12], ['hob', 8, 7], ['hob', 28, 10], ['hob', -1, 12],
  ] as const)('rejects an invalid move of %s to %i,%i without changing caller state', (entity, x, y) => {
    const s = newGame(); s.followers = [{ x: 7, y: 12 }];
    const before = structuredClone(s);
    expect(() => runScript([
      { op: 'set', flag: 'must_not_leak', value: true },
      { op: 'move', entity, x, y },
    ], s, 0, maps[s.mapId]!)).toThrow();
    expect(s).toEqual(before);
  });
  it('checks the entire NPC footprint rather than only its anchor tile', () => {
    const s = newGame(); const map = structuredClone(maps[s.mapId]!);
    map.entities.find(e => e.id === 'hob')!.footprint = [3, 2];
    expect(() => runScript([{ op: 'move', entity: 'hob', x: 27, y: 10 }], s, 0, map)).toThrow();
    expect(() => runScript([{ op: 'move', entity: 'hob', x: 1, y: 3 }], s, 0, map)).toThrow();
  });
  it('allows an NPC to stay in place and to reuse a cell vacated earlier in the script', () => {
    const s = newGame();
    const r = runScript([
      { op: 'move', entity: 'hob', x: 10, y: 11 },
      { op: 'move', entity: 'hob', x: 12, y: 11 },
      { op: 'move', entity: 'hob', x: 10, y: 11 },
    ], s, 0, maps[s.mapId]!);
    expect(r.state.actors.hob).toEqual({ x: 10, y: 11 });
  });
  it('rejects a script that leaves a required interaction inaccessible without leaking state', () => {
    const map = dividedMap(); const s = newGame(); s.mapId = map.id; s.player = { ...map.spawn, facing: 'right' };
    const before = structuredClone(s);
    expect(() => runScript([
      { op: 'set', flag: 'must_not_leak', value: true },
      { op: 'move', entity: 'hob', x: 4, y: 3 },
    ], s, 0, map)).toThrow();
    expect(s).toEqual(before);
  });
  it('validates the final script layout after an actor temporarily crosses a narrow passage', () => {
    const map = dividedMap(); const s = newGame(); s.mapId = map.id; s.player = { ...map.spawn, facing: 'right' };
    const r = runScript([
      { op: 'move', entity: 'hob', x: 4, y: 3 },
      { op: 'move', entity: 'hob', x: 2, y: 2 },
    ], s, 0, map);
    expect(decodeSave(encodeSave(r.state), { [map.id]: map }).actors.hob).toEqual({ x: 2, y: 2 });
  });
});

describe('versioned saves', () => {
  it('round trips flags, position and lit lamps', () => {
    const s = newGame(); s.lamps.push('first_lamp'); s.flags.met_hob = true;
    expect(decodeSave(encodeSave(s), maps)).toEqual(s);
  });
  it('rejects corrupted, future-version and blocked-position saves', () => {
    expect(() => decodeSave('{broken', maps)).toThrow();
    expect(() => decodeSave(JSON.stringify({ ...newGame(), version: 99 }), maps)).toThrow();
    const s = newGame(); s.player = { x: 10, y: 11, facing: 'up' };
    expect(() => decodeSave(JSON.stringify(s), maps)).toThrow();
    expect(() => decodeSave(JSON.stringify({ ...newGame(), lamps: ['missing'] }), maps)).toThrow();
  });
  it('migrates a v0 save and reports unavailable storage', () => {
    const old = { version: 0, mapId: 'lantern.test', x: 8, y: 12, flags: { met_hob: true } };
    expect(decodeSave(JSON.stringify(old), maps).player.x).toBe(8);
    const store = new SaveStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, maps);
    expect(store.save(1, newGame()).ok).toBe(false);
    expect(store.load(1).ok).toBe(false);
  });
  it.each(['first_lamp', 'home'])('rejects saved position overrides for non-NPC %s', (id) => {
    const s = newGame(); s.actors[id] = { x: 20, y: 12 };
    expect(() => decodeSave(encodeSave(s), maps)).toThrow();
  });
  it('rejects an NPC saved inside a building footprint', () => {
    const s = newGame(); s.actors.hob = { x: 8, y: 7 };
    expect(() => decodeSave(encodeSave(s), maps)).toThrow();
  });
  it('rejects overlapping NPC overrides in their final layout', () => {
    const s = newGame(); const map = structuredClone(maps[s.mapId]!);
    map.entities.push({ id: 'visitor', kind: 'npc', sprite: 'char.hob', x: 20, y: 12, solid: true });
    s.actors = { hob: { x: 12, y: 11 }, visitor: { x: 12, y: 11 } };
    expect(() => decodeSave(encodeSave(s), { [map.id]: map })).toThrow();
  });
  it('rejects an NPC footprint overlapping a party member', () => {
    const s = newGame(); const map = structuredClone(maps[s.mapId]!);
    map.entities.find(e => e.id === 'hob')!.footprint = [3, 2];
    s.actors.hob = { x: 8, y: 13 };
    expect(() => decodeSave(encodeSave(s), { [map.id]: map })).toThrow();
  });
  it('rejects a final actor layout that blocks the only route to a required interaction', () => {
    const map = dividedMap(); const s = newGame(); s.mapId = map.id; s.player = { ...map.spawn, facing: 'right' };
    s.actors.hob = { x: 4, y: 3 };
    expect(() => decodeSave(encodeSave(s), { [map.id]: map })).toThrow();
  });
  it('uses the moved required NPC position when checking interaction reachability', () => {
    const map = dividedMap(); map.rows[3] = 'tgggtgggt'; map.required = ['hob'];
    map.entities.find(e => e.id === 'hob')!.x = 6;
    const s = newGame(); s.mapId = map.id; s.player = { ...map.spawn, facing: 'right' };
    s.actors.hob = { x: 2, y: 2 };
    expect(decodeSave(encodeSave(s), { [map.id]: map }).actors.hob).toEqual({ x: 2, y: 2 });
  });
  it('isolates three manual slots from autosave and refuses invalid slots', () => {
    const data = new Map<string,string>(); const store = new SaveStore({ getItem: k => data.get(k) ?? null, setItem: (k,v) => { data.set(k,v); } }, maps);
    const s = newGame(); expect(store.save(0,s).ok).toBe(true); s.steps = 5; store.save(1,s);
    const auto = store.load(0); const manual = store.load(1);
    expect(auto.ok && auto.state.steps).toBe(0); expect(manual.ok && manual.state.steps).toBe(5);
    expect(store.save(4,s).ok).toBe(false);
  });
});
