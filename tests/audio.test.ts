import { describe, expect, it } from 'vitest';
import { cues, renderCue } from '../src/audio/synth.ts';
import { SoundLimiter } from '../src/audio/limiter.ts';

function measure(samples: Float32Array): { peak: number; rmsDb: number; finite: boolean } {
  let sumSquares = 0;
  let peak = 0;
  let finite = true;
  for (const sample of samples) {
    finite &&= Number.isFinite(sample);
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  return { peak, rmsDb: 20 * Math.log10(Math.sqrt(sumSquares / samples.length)), finite };
}

describe('deterministic code-synthesized cues', () => {
  it.each(['confirm', 'cancel', 'step', 'save', 'deny', 'lamp', 'test_theme'] as const)(
    '%s renders audible, repeatable samples with headroom and no boundary clicks',
    (id) => {
      const first = renderCue(id);
      const second = renderCue(id);
      expect(cues).toContain(id);
      expect(first).toBeInstanceOf(Float32Array);
      expect(first.length).toBeGreaterThan(1000);
      expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);
      const { peak, rmsDb, finite } = measure(first);
      expect(finite).toBe(true);
      expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20));
      expect(rmsDb).toBeGreaterThanOrEqual(id === 'test_theme' ? -22 : -21);
      expect(rmsDb).toBeLessThanOrEqual(id === 'test_theme' ? -18 : -15);
      expect(first[0]).toBe(0);
      expect(first[first.length - 1]).toBe(0);
      expect(Math.abs(first[1] ?? 1)).toBeLessThan(0.001);
      expect(Math.abs(first[first.length - 2] ?? 1)).toBeLessThan(0.001);
    },
  );

  it('keeps the four-bar test theme eight seconds long at supported sample rates', () => {
    for (const sampleRate of [22050, 44100, 48000]) {
      expect(renderCue('test_theme', sampleRate).length).toBe(sampleRate * 8);
    }
  });

  it('rejects invalid sample rates before allocating buffers', () => {
    for (const sampleRate of [0, -1, 7999, 44100.5, 96001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => renderCue('confirm', sampleRate)).toThrow(RangeError);
    }
  });

  it('rejects unknown cue ids rather than playing another sound', () => {
    expect(() => renderCue('missing' as 'confirm')).toThrow(RangeError);
  });
});

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
