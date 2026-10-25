import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../src/core/save.ts';
import { validateContent } from '../src/systems/content-check.ts';
import { runScript } from '../src/systems/story.ts';
import { travelTo } from '../src/systems/travel.ts';
import { activeMap, interact, movePlayer, newGame, parseMap, requiredInteractionsReachable, type GameState, type MapData } from '../src/systems/world.ts';

function room(): MapData {
  return parseMap({
    id: 'visibility.room', name: 'room', width: 7, height: 5,
    rows: ['ttttttt', 'tgggggt', 'tgggggt', 'tgggggt', 'ttttttt'], spawn: { x: 1, y: 2 },
    entities: [{ id: 'ella', kind: 'npc', sprite: 'npc', x: 3, y: 2, solid: true, script: 'ella', visibleWhen: { all: ['ella.present'], none: ['ella.left'] } }],
    required: ['ella'], exits: [],
  });
}

function stateFor(map: MapData): GameState {
  return { ...newGame(), mapId: map.id, player: { ...map.spawn, facing: 'right' } };
}

describe('active map views', () => {
  it('hides entities and only their required interactions until their conditions are satisfied', () => {
    const map = room();
    expect(activeMap(map, {}).entities).toEqual([]);
    expect(activeMap(map, {}).required).toEqual([]);
    expect(requiredInteractionsReachable(activeMap(map, {}), map.spawn)).toBe(true);
    expect(activeMap(map, { 'ella.present': true }).entities.map(e => e.id)).toEqual(['ella']);
    expect(activeMap(map, { 'ella.present': true, 'ella.left': true }).entities).toEqual([]);
    expect(map.entities).toHaveLength(1); expect(map.required).toEqual(['ella']);
  });

  it('reuses views by visibility and can restore a hidden entity from a previously filtered view', () => {
    const map = room(); const hidden = activeMap(map, {});
    expect(hidden).not.toBe(map);
    expect(activeMap(map, { unrelated: true })).toBe(hidden);
    expect(activeMap(hidden, { 'ella.present': true })).toBe(map);
    expect(activeMap(activeMap(hidden, { 'ella.present': true }), {})).toBe(hidden);
    const unconditional = { ...map, entities: map.entities.map(({ visibleWhen: _visibleWhen, ...entity }) => entity) };
    expect(activeMap(unconditional, {})).toBe(unconditional);
  });

  it('ignores inherited flags when deciding visibility', () => {
    const flags = Object.create({ 'ella.present': true }) as Record<string, boolean>;
    expect(activeMap(room(), flags).entities).toEqual([]);
  });

  it('lets the player move through and ignore a hidden NPC, then collides after the flag is set', () => {
    const map = room(); const state = stateFor(map); state.player.x = 2;
    expect(movePlayer(state, map, 'right').player.x).toBe(3);
    expect(interact(state, map).script).toBeUndefined();
    state.flags['ella.present'] = true;
    expect(movePlayer(state, map, 'right').player.x).toBe(2);
    expect(interact(state, map).script).toBe('ella');
  });
});

describe('visibility in saves and travel', () => {
  it('keeps hidden NPC coordinates in current actors and remembered maps without adding collision', () => {
    const map = room(); const state = stateFor(map); state.player.x = 3;
    state.actors.ella = { x: 3, y: 2 }; state.actorMemory[map.id] = { ella: { x: 0, y: 0 } };
    expect(decodeSave(encodeSave(state), { [map.id]: map })).toEqual(state);
    state.actors.unknown = { x: 2, y: 2 };
    expect(() => decodeSave(encodeSave(state), { [map.id]: map })).toThrow(/actor/);
  });

  it('validates remembered visible actors using the same flags as the current map', () => {
    const map = room(); const state = stateFor(map);
    state.actorMemory[map.id] = { ella: { x: 0, y: 0 } };
    expect(decodeSave(encodeSave(state), { [map.id]: map }).actorMemory).toEqual(state.actorMemory);
    state.flags['ella.present'] = true;
    expect(() => decodeSave(encodeSave(state), { [map.id]: map })).toThrow(/actor/);
  });

  it('allows a teleport onto a hidden NPC position and rejects it once the NPC is present', () => {
    const map = room(); const state = stateFor(map); const maps = { [map.id]: map };
    expect(travelTo(state, map.id, { x: 3, y: 2 }, maps).changed).toBe(true);
    state.flags['ella.present'] = true;
    expect(travelTo(state, map.id, { x: 3, y: 2 }, maps).changed).toBe(false);
  });
});

describe('story visibility guards', () => {
  it.each(['end', 'say'] as const)('rejects revealing an NPC on the player at %s without leaking flags', ending => {
    const map = room(); const state = stateFor(map); state.player.x = 3; const before = structuredClone(state);
    const command = ending === 'end' ? { op: 'end' as const } : { op: 'say' as const, text: 'line', speaker: 'name', portrait: 'npc' };
    expect(() => runScript([{ op: 'set', flag: 'ella.present', value: true }, command], state, 0, map)).toThrow();
    expect(state).toEqual(before);
  });

  it('checks the final visible layout, allowing a transient reveal to be moved safely before yielding', () => {
    const map = room(); const state = stateFor(map); state.player.x = 3;
    const result = runScript([
      { op: 'set', flag: 'ella.present', value: true },
      { op: 'move', entity: 'ella', x: 4, y: 2 },
      { op: 'end' },
    ], state, 0, activeMap(map, {}));
    expect(result.state.actors.ella).toEqual({ x: 4, y: 2 });
    expect(result.state.flags['ella.present']).toBe(true);
  });

  it('rejects revealing an NPC that blocks the only route to an exit', () => {
    const map = room(); map.rows = ['ttttttt', 'ttttttt', 'tgggggt', 'ttttttt', 'ttttttt']; map.required = [];
    map.exits = [{ pair: 'door', x: 5, y: 2, to: 'elsewhere', at: { x: 1, y: 2 } }];
    expect(() => runScript([{ op: 'set', flag: 'ella.present', value: true }], stateFor(map), 0, map)).toThrow(/Unreachable/);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects reserved flag %s without changing the input', flag => {
    const map = room(); const state = stateFor(map);
    expect(() => runScript([{ op: 'set', flag, value: true }], state, 0, map)).toThrow(/flag/);
    expect(Object.keys(state.flags)).toEqual([]);
    expect(() => runScript([{ op: 'if', flag, equals: false, goto: 1 }, { op: 'end' }], state, 0, map)).toThrow(/flag/);
  });
});

describe('visibility content validation', () => {
  it('checks default visibility while retaining asset and script checks for hidden entities', () => {
    const map = room(); map.entities[0]!.x = 0; map.entities[0]!.y = 0;
    const maps = { [map.id]: map };
    expect(validateContent(maps, { ella: [{ op: 'end' }] }, { room: '房间' }, new Set(['npc']))).toEqual([]);
    expect(validateContent(maps, {}, { room: '房间' }, new Set()).join(' ')).toMatch(/missing sprite/);
  });

  it.each(['__proto__', 'constructor', 'bad flag'])('rejects invalid condition flag %s', flag => {
    const map = room(); map.entities[0]!.visibleWhen = { all: [flag] };
    expect(validateContent({ [map.id]: map }, { ella: [{ op: 'end' }] }, { room: '房间' }, new Set(['npc'])).length).toBeGreaterThan(0);
  });
});
