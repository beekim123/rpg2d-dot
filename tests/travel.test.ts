import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../src/core/save.ts';
import { validateContent } from '../src/systems/content-check.ts';
import { runScript } from '../src/systems/story.ts';
import { travelTo, tryMapExit } from '../src/systems/travel.ts';
import { interact, movePlayer, newGame, parseMap, type GameState, type MapData } from '../src/systems/world.ts';

function connectedMaps(): Record<string, MapData> {
  const a = parseMap({
    id: 'room.a', name: 'room', width: 7, height: 5,
    rows: ['ttttttt', 'tgggggt', 'tgggggt', 'tgggggt', 'ttttttt'], spawn: { x: 1, y: 2 },
    entities: [
      { id: 'a.npc', kind: 'npc', sprite: 'npc', x: 3, y: 1, solid: true },
      { id: 'a.lamp', kind: 'lamp', sprite: 'lamp', x: 3, y: 3, solid: true },
    ], required: ['a.lamp'], exits: [{ pair: 'rooms', x: 5, y: 2, to: 'room.b', at: { x: 2, y: 2 } }],
  });
  const b = parseMap({
    id: 'room.b', name: 'room', width: 7, height: 5,
    rows: ['ttttttt', 'tgggggt', 'tgggggt', 'tgggggt', 'ttttttt'], spawn: { x: 1, y: 2 },
    entities: [{ id: 'b.lamp', kind: 'lamp', sprite: 'lamp', x: 3, y: 3, solid: true }],
    required: ['b.lamp'], exits: [{ pair: 'rooms', x: 1, y: 2, to: 'room.a', at: { x: 4, y: 2 } }],
  });
  return { [a.id]: a, [b.id]: b };
}

function atRoom(map: MapData): GameState {
  return { ...newGame(), mapId: map.id, player: { ...map.spawn, facing: 'right' } };
}

const contentErrors = (maps: Record<string, MapData>) => validateContent(maps, {}, { room: '房间' }, new Set(['npc', 'lamp']));

describe('map travel', () => {
  it('retains lamp and NPC changes through departure, return, and save/load', () => {
    const maps = connectedMaps(); const a = maps['room.a']!;
    let state = atRoom(a); state.player = { x: 3, y: 2, facing: 'down' };
    state = interact(state, a).state;
    state = runScript([{ op: 'move', entity: 'a.npc', x: 4, y: 1 }], state, 0, a).state;
    state.followers = [{ x: 2, y: 2 }];
    state = movePlayer(movePlayer(state, a, 'right'), a, 'right');
    const before = structuredClone(state); const result = tryMapExit(state, maps);
    expect(result.changed).toBe(true);
    expect(state).toEqual(before);
    expect(result.state).toMatchObject({ mapId: 'room.b', player: { x: 2, y: 2, facing: 'right' }, followers: [], actors: {}, lamps: ['a.lamp'], actorMemory: { 'room.a': { 'a.npc': { x: 4, y: 1 } } }, steps: 2 });
    const away = decodeSave(encodeSave(result.state), maps);
    const returned = tryMapExit(movePlayer(away, maps['room.b']!, 'left'), maps);
    expect(returned.changed).toBe(true);
    expect(returned.state).toMatchObject({ mapId: 'room.a', player: { x: 4, y: 2, facing: 'left' }, actors: { 'a.npc': { x: 4, y: 1 } }, lamps: ['a.lamp'] });
    expect(decodeSave(encodeSave(returned.state), maps)).toEqual(returned.state);
  });

  it('leaves an off-exit state untouched', () => {
    const maps = connectedMaps(); const state = atRoom(maps['room.a']!);
    expect(tryMapExit(state, maps)).toEqual({ state, changed: false });
  });

  it.each([
    ['constructor', 2, 2], ['missing', 2, 2], ['room.b', 0, 0], ['room.a', 3, 1], ['room.b', 1.5, 2],
  ] as const)('rejects unsafe travel to %s at %i,%i without changing its input', (mapId, x, y) => {
    const maps = connectedMaps(); const state = atRoom(maps['room.a']!); const before = structuredClone(state);
    const result = travelTo(state, mapId, { x, y }, maps);
    expect(result.changed).toBe(false); expect(result.state).toBe(state); expect(result.reason).toBeTruthy(); expect(state).toEqual(before);
  });

  it('uses current actors for a scripted move within the same map', () => {
    const maps = connectedMaps(); const state = atRoom(maps['room.a']!);
    state.actors = { 'a.npc': { x: 4, y: 1 } }; state.actorMemory = { 'room.a': { 'a.npc': { x: 2, y: 1 } } };
    const result = travelTo(state, 'room.a', { x: 2, y: 2 }, maps);
    expect(result.changed).toBe(true); expect(result.state.actors).toEqual({ 'a.npc': { x: 4, y: 1 } });
  });

  it('rejects a broken pair and a destination memory blocking its arrival', () => {
    const maps = connectedMaps(); const state = atRoom(maps['room.b']!); state.player = { x: 1, y: 2, facing: 'left' };
    state.actorMemory = { 'room.a': { 'a.npc': { x: 4, y: 2 } } };
    expect(tryMapExit(state, maps).changed).toBe(false);
    state.actorMemory = {}; maps['room.a']!.exits[0]!.pair = 'broken';
    expect(tryMapExit(state, maps).changed).toBe(false);
  });
});

describe('multi-map saves', () => {
  it('migrates v1 actors and progress without discarding them', () => {
    const maps = connectedMaps();
    const old = { ...atRoom(maps['room.a']!), version: 1, actors: { 'a.npc': { x: 4, y: 1 } }, lamps: ['a.lamp'], flags: { met: true }, steps: 12 };
    const migrated = decodeSave(JSON.stringify(old), maps);
    expect(migrated).toMatchObject({ version: 2, actorMemory: {}, actors: old.actors, flags: old.flags, steps: 12, lamps: old.lamps });
  });

  it('migrates v0 position and flags to the latest version', () => {
    const maps = connectedMaps();
    expect(decodeSave(JSON.stringify({ version: 0, mapId: 'room.a', x: 2, y: 2, flags: { met: true } }), maps))
      .toMatchObject({ version: 2, actorMemory: {}, player: { x: 2, y: 2, facing: 'down' }, flags: { met: true } });
  });

  it('accepts lamps from every known map and rejects unknown or duplicate lamp ids', () => {
    const maps = connectedMaps(); const state = atRoom(maps['room.b']!);
    state.lamps = ['a.lamp', 'b.lamp'];
    expect(decodeSave(encodeSave(state), maps).lamps).toEqual(['a.lamp', 'b.lamp']);
    for (const lamps of [['a.lamp', 'a.lamp'], ['missing']]) {
      expect(() => decodeSave(JSON.stringify({ ...state, lamps }), maps)).toThrow(/lamps/);
    }
  });

  it('rejects a prototype name masquerading as a known map', () => {
    const maps = connectedMaps();
    expect(() => decodeSave(JSON.stringify({ ...atRoom(maps['room.a']!), mapId: 'constructor' }), maps)).toThrow(/map/);
  });

  it('round trips remembered actors independently from the current map actors', () => {
    const maps = connectedMaps(); const actorMemory = { 'room.a': { 'a.npc': { x: 4, y: 1 } } };
    const decoded = decodeSave(JSON.stringify({ ...atRoom(maps['room.b']!), actorMemory }), maps);
    expect(decoded).toMatchObject({ actors: {}, actorMemory });
  });

  it.each([
    [{ constructor: {} }],
    [{ 'room.a': { missing: { x: 4, y: 1 } } }],
    [{ 'room.a': { 'a.npc': { x: 0, y: 0 } } }],
    [{ 'room.a': { 'a.npc': { x: 4, y: 2 } } }],
  ] as const)('rejects invalid remembered maps, NPCs, terrain, and entry occupancy: %j', actorMemory => {
    const maps = connectedMaps();
    expect(() => decodeSave(JSON.stringify({ ...atRoom(maps['room.b']!), actorMemory }), maps)).toThrow();
  });
});

describe('exit validation', () => {
  it('accepts a reciprocal pair of reachable exits', () => {
    expect(contentErrors(connectedMaps())).toEqual([]);
  });

  it('rejects a pair with more than two endpoints and a landing far from its counterpart', () => {
    const maps = connectedMaps(); maps['room.a']!.exits.push({ ...maps['room.a']!.exits[0]!, x: 4, y: 1 });
    expect(contentErrors(maps).join(' ')).toMatch(/pair/);
    maps['room.a']!.exits.pop(); maps['room.a']!.exits[0]!.at = { x: 5, y: 1 };
    expect(contentErrors(maps).join(' ')).toMatch(/exit|landing/);
  });

  it('validates optional terrain sprite references', () => {
    const maps = connectedMaps(); maps['room.a']!.terrain = { path: 'missing.floor' };
    expect(contentErrors(maps)).toContain('missing sprite missing.floor');
  });

  it.each(['source', 'destination', 'target', 'pair'] as const)('rejects an invalid exit %s', problem => {
    const maps = connectedMaps(); const exit = maps['room.a']!.exits[0]!;
    if (problem === 'source') exit.x = 0;
    if (problem === 'destination') exit.to = 'constructor';
    if (problem === 'target') exit.at = { x: 0, y: 0 };
    if (problem === 'pair') maps['room.b']!.exits[0]!.to = 'room.b';
    expect(contentErrors(maps).length).toBeGreaterThan(0);
  });

  it('rejects an unreachable exit even when all required interactions remain reachable', () => {
    const maps = connectedMaps(); maps['room.a']!.rows[2] = 'tgggtgt';
    maps['room.a']!.rows[1] = 'tgggttt'; maps['room.a']!.rows[3] = 'tgggttt';
    expect(contentErrors(maps).join(' ')).toMatch(/exit|map/);
  });

  it('rejects a story actor blocking the only passage to an exit and leaves its input unchanged', () => {
    const map = parseMap({
      id: 'narrow', name: 'room', width: 9, height: 5,
      rows: ['ttttttttt', 'tgggtgggt', 'tgggggggt', 'tgggtgggt', 'ttttttttt'], spawn: { x: 1, y: 2 },
      entities: [{ id: 'npc', kind: 'npc', sprite: 'npc', x: 2, y: 1, solid: true }],
      required: [], exits: [{ pair: 'narrow', x: 7, y: 2, to: 'room.a', at: { x: 5, y: 2 } }],
    });
    const state = atRoom(map); const before = structuredClone(state);
    expect(() => runScript([{ op: 'move', entity: 'npc', x: 4, y: 2 }], state, 0, map)).toThrow(/Unreachable/);
    expect(state).toEqual(before);
  });
});
