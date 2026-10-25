import { describe, expect, it } from 'vitest';
import { viewportScale, FixedClock, SceneStack } from '../src/core/runtime.ts';

describe('integer viewport', () => {
  it('fits 1080p with 4x logical pixels and never uses fractional scale', () => {
    expect(viewportScale(1920, 1080)).toBe(4);
    expect(viewportScale(1000, 600)).toBe(2);
    expect(viewportScale(320, 240)).toBe(1);
  });
});
it('fixed clock caps catch-up after a hidden tab and resumes without a jump', () => {
  const clock = new FixedClock();
  expect(clock.advance(0)).toBe(0);
  expect(clock.advance(1000 / 30)).toBe(2);
  expect(clock.advance(10000)).toBe(5);
  expect(clock.advance(10000)).toBe(0);
});
it('scene overlays return to the prior scene without losing it', () => {
  const scenes = new SceneStack('title');
  scenes.replace('map'); scenes.push('dialogue');
  expect(scenes.current).toBe('dialogue');
  scenes.pop(); expect(scenes.current).toBe('map');
  scenes.pop(); expect(scenes.current).toBe('map');
});
