import { describe, expect, it } from 'vitest';
import { actionInterval, applySharedDamage, calculateDamage, manhattan, orderTimeline, rating, rescheduleActor, tetherFactor } from '../../reference/web/src/battle/math.ts';
import type { BattleActor, DamageInput } from '../../reference/web/src/battle/model.ts';

function actor(overrides: Partial<BattleActor> = {}): BattleActor {
  return {
    id: 'finn', team: 'player', order: 0, body: { x: 2, y: 2 }, astral: { x: 3, y: 2 },
    kind: 'close', mode: 'manifested', hp: 100, maxHp: 100, will: 10, maxWill: 20,
    shield: 0, chart: { pow: 60, spd: 60, rch: 20, end: 40, prc: 40, pot: 80 }, reach: 2, readyAt: 100,
    ...overrides,
  };
}

const baseDamage: DamageInput = {
  power: 100, attackerPower: 40, defenderEndurance: 50, distance: 1, reach: 5, target: 'astral',
};

describe('battle ratings and grid distances', () => {
  it.each([
    [0, 'E'], [19, 'E'], [20, 'D'], [39, 'D'], [40, 'C'], [59, 'C'],
    [60, 'B'], [74, 'B'], [75, 'A'], [89, 'A'], [90, 'S'], [100, 'S'],
  ] as const)('rates %i as %s at a documented boundary', (value, expected) => {
    expect(rating(value)).toBe(expected);
  });
  it.each([-1, 101, 40.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid chart value %s', value => {
    expect(() => rating(value)).toThrow(RangeError);
  });
  it('uses cardinal steps, including coincident and reversed positions', () => {
    expect(manhattan({ x: 2, y: 3 }, { x: 7, y: 1 })).toBe(7);
    expect(manhattan({ x: 7, y: 1 }, { x: 2, y: 3 })).toBe(7);
    expect(manhattan({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(0);
  });
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid grid coordinate %s', value => {
    expect(() => manhattan({ x: value, y: 0 }, { x: 1, y: 1 })).toThrow(RangeError);
  });
});

describe('deterministic damage and tether range', () => {
  it.each([
    [0, 1, 1], [1, 1, 1], [1, 2, 1], [2, 2, 0.6],
    [3, 5, 1], [4, 5, 0.8], [5, 5, 0.6], [2, 4, 1], [3, 4, 0.8], [4, 4, 0.6],
  ])('uses tether factor %s,%s → %s', (distance, reach, expected) => {
    expect(tetherFactor(distance!, reach!)).toBeCloseTo(expected!, 12);
  });
  it.each([[0, 0], [2, 1], [-1, 2], [1, -1], [1.5, 2], [1, Number.NaN], [Number.POSITIVE_INFINITY, 2]])(
    'rejects an impossible or invalid tether %s,%s', (distance, reach) => {
      expect(() => tetherFactor(distance!, reach!)).toThrow(RangeError);
      expect(() => calculateDamage({ ...baseDamage, distance: distance!, reach: reach! })).toThrow(RangeError);
    },
  );
  it('applies body vulnerability, recall protection and opening once', () => {
    // 100 × (0.6 + 40/100) × (1 - 50/250) = 80.
    expect(calculateDamage(baseDamage)).toBe(80);
    expect(calculateDamage({ ...baseDamage, target: 'body' })).toBe(120);
    expect(calculateDamage({ ...baseDamage, target: 'body', recalled: true })).toBe(56);
    expect(calculateDamage({ ...baseDamage, openingMultiplier: 1.5 })).toBe(120);
    expect(calculateDamage({ ...baseDamage, distance: 5 })).toBe(48);
  });
  it('rounds only the final damage, preserving intermediate fractions', () => {
    // 11 × 1.23 × 0.8 × 1.5 × 1.5 × 0.852 = 20.749608, not 22.
    expect(calculateDamage({ power: 11, attackerPower: 63, defenderEndurance: 37, distance: 4, reach: 5, target: 'body', openingMultiplier: 1.5 })).toBe(21);
    expect(calculateDamage({ ...baseDamage, power: 0 })).toBe(0);
  });
  it.each([
    { power: -1 }, { power: Number.NaN }, { attackerPower: 101 }, { defenderEndurance: -1 },
    { openingMultiplier: -1 }, { openingMultiplier: Number.POSITIVE_INFINITY }, { openingMultiplier: null },
    { recalled: true }, { target: 'missing' },
  ])('rejects malformed damage input %j', invalid => {
    expect(() => calculateDamage({ ...baseDamage, ...invalid } as DamageInput)).toThrow(RangeError);
  });
  it('produces the same damage and leaves the request unchanged on repeated calls', () => {
    const input = Object.freeze({ ...baseDamage });
    expect(calculateDamage(input)).toBe(80); expect(calculateDamage(input)).toBe(80);
    expect(input).toEqual(baseDamage);
  });
});

describe('shared health damage settlement', () => {
  it.each(['close', 'remote'] as const)('shares body and astral HP for %s without multiplying damage again', kind => {
    const input = actor({ kind });
    const body = applySharedDamage(input, 'body', 30);
    const astral = applySharedDamage(input, 'astral', 30);
    expect(body.damage).toBe(30); expect(body.actor.hp).toBe(70);
    expect(astral.damage).toBe(30); expect(astral.actor.hp).toBe(70);
    expect(input.hp).toBe(100);
  });
  it('spends the shield before HP and caps reported damage at remaining health', () => {
    const input = actor({ hp: 20, shield: 15 });
    const partial = applySharedDamage(input, 'astral', 10);
    expect(partial).toMatchObject({ damage: 0, absorbed: 10, actor: { hp: 20, shield: 5 } });
    const lethal = applySharedDamage(partial.actor, 'body', 100);
    expect(lethal).toMatchObject({ damage: 20, absorbed: 5, actor: { hp: 0, shield: 0, mode: 'extinguished', astral: null } });
    expect(input).toMatchObject({ hp: 20, shield: 15, mode: 'manifested' });
  });
  it('keeps an already defeated body extinguished under repeated damage', () => {
    const defeated = applySharedDamage(actor(), 'body', 100).actor;
    const repeated = applySharedDamage(defeated, 'body', 25);
    expect(repeated).toMatchObject({ damage: 0, absorbed: 0, actor: { hp: 0, mode: 'extinguished', astral: null } });
  });
  it('damages a recalled body without exposing a nonexistent astral target', () => {
    const recalled = actor({ mode: 'recalled', astral: null });
    expect(applySharedDamage(recalled, 'body', 7).actor.hp).toBe(93);
    expect(() => applySharedDamage(recalled, 'astral', 7)).toThrow(RangeError);
  });
  it.each(['auto', 'swarm', 'set', 'field'] as const)('rejects %s instead of applying shared HP semantics', kind => {
    expect(() => applySharedDamage(actor({ kind }), 'body', 5)).toThrow(RangeError);
    expect(() => applySharedDamage(actor({ kind }), 'astral', 5)).toThrow(RangeError);
  });
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid settled damage %s without mutation', amount => {
    const input = actor(); const before = structuredClone(input);
    expect(() => applySharedDamage(input, 'body', amount)).toThrow(RangeError);
    expect(input).toEqual(before);
  });
  it('rejects invalid actor resources and inconsistent manifestation', () => {
    for (const input of [actor({ hp: -1 }), actor({ hp: 101 }), actor({ shield: Number.NaN }), actor({ will: 21 }), actor({ astral: null })]) {
      expect(() => applySharedDamage(input, 'body', 5)).toThrow(RangeError);
    }
  });
  it('returns an independent actor snapshot including nested positions and chart', () => {
    const input = actor(); const result = applySharedDamage(input, 'body', 0);
    result.actor.body.x = 9; result.actor.chart.pow = 0;
    expect(input.body.x).toBe(2); expect(input.chart.pow).toBe(60);
  });
});

describe('integer action timeline', () => {
  it.each([[0, 140], [20, 125], [40, 110], [60, 100], [75, 90], [90, 80]])(
    'maps speed %s to normal interval %s', (speed, expected) => expect(actionInterval(speed!, 'normal')).toBe(expected),
  );
  it('rounds weighted intervals once, including half ticks', () => {
    expect(actionInterval(20, 'light')).toBe(88); // 125 × .7 = 87.5
    expect(actionInterval(20, 'heavy')).toBe(163); // 125 × 1.3 = 162.5
    expect(actionInterval(90, 'light')).toBe(56);
    expect(() => actionInterval(60, 'invalid' as 'normal')).toThrow(RangeError);
  });
  it('orders time, team, party order and ASCII id without changing the original array', () => {
    const input = [
      actor({ id: 'enemy', team: 'enemy', order: 0 }), actor({ id: 'a', order: 1 }),
      actor({ id: 'A', order: 1 }), actor({ id: 'first', order: 0 }), actor({ id: 'early', readyAt: 99, team: 'enemy' }),
    ];
    const before = structuredClone(input);
    expect(orderTimeline(input).map(entry => entry.id)).toEqual(['early', 'first', 'A', 'a', 'enemy']);
    expect(input).toEqual(before);
  });
  it('preserves complete ties and retains defeated entries for the engine to filter', () => {
    const first = actor({ hp: 90 }); const second = actor({ hp: 80 });
    const defeated = actor({ id: 'defeated', hp: 0, mode: 'extinguished', astral: null, readyAt: 0 });
    expect(orderTimeline([first, second, defeated])).toEqual([defeated, first, second]);
  });
  it('reschedules a copy from its prior ready tick using its speed', () => {
    const input = actor({ readyAt: 80, chart: { ...actor().chart, spd: 20 } });
    const next = rescheduleActor(input, 'heavy');
    expect(next.readyAt).toBe(243); expect(input.readyAt).toBe(80);
    next.chart.spd = 100; expect(input.chart.spd).toBe(20);
  });
  it('rejects invalid clocks, order and rescheduling a defeated actor', () => {
    expect(() => orderTimeline([actor({ readyAt: Number.NaN })])).toThrow(RangeError);
    expect(() => orderTimeline([actor({ order: -1 })])).toThrow(RangeError);
    expect(() => rescheduleActor(actor({ hp: 0, mode: 'extinguished', astral: null }), 'normal')).toThrow(RangeError);
    expect(() => rescheduleActor(actor({ readyAt: Number.MAX_SAFE_INTEGER }), 'normal')).toThrow(RangeError);
  });
});
