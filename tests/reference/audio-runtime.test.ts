import {describe,expect,it} from 'vitest';
import {SoundLimiter} from '../../reference/web/src/audio/limiter.ts';

describe('sound admission uses the audio clock', () => {
  it('admits at most six overlapping effects and reclaims an ended slot', () => {
    const limiter = new SoundLimiter();
    for (const id of ['one', 'two', 'three', 'four', 'five', 'six']) {
      expect(limiter.tryStart(id, 0, 0.3)).toBe(true);
    }
    expect(limiter.tryStart('seventh', 0.1, 0.3)).toBe(false);
    expect(limiter.tryStart('seventh', 0.3, 0.3)).toBe(true);
  });

  it('suppresses a repeated effect for 70 ms without reserving rejected attempts', () => {
    const limiter = new SoundLimiter();
    expect(limiter.tryStart('confirm', 0, 0.01)).toBe(true);
    expect(limiter.tryStart('confirm', 0.069, 0.01)).toBe(false);
    expect(limiter.tryStart('confirm', 0.07, 0.01)).toBe(true);
  });

  it('does not postpone an effect rejected while all voices were occupied', () => {
    const limiter = new SoundLimiter();
    for (const id of ['one', 'two', 'three', 'four', 'five', 'six']) {
      expect(limiter.tryStart(id, 2, 0.01)).toBe(true);
    }
    expect(limiter.tryStart('next', 2.005, 0.01)).toBe(false);
    expect(limiter.tryStart('next', 2.011, 0.01)).toBe(true);
  });
});
