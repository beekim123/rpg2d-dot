import { describe, expect, it } from 'vitest';
import { cues, cueKinds, renderCue } from '../src/audio/synth.ts';
import { SoundLimiter } from '../src/audio/limiter.ts';

function measure(samples: Float32Array, activeOnly = false): { peak: number; rmsDb: number; finite: boolean } {
  let sumSquares = 0;
  let peak = 0;
  let finite = true;
  let first = 0;
  let last = samples.length - 1;
  if (activeOnly) {
    while (first < last && Math.abs(samples[first] ?? 0) < 0.0001) first++;
    while (last > first && Math.abs(samples[last] ?? 0) < 0.0001) last--;
  }
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    finite &&= Number.isFinite(sample);
    peak = Math.max(peak, Math.abs(sample));
    if (i >= first && i <= last) sumSquares += sample * sample;
  }
  return { peak, rmsDb: 20 * Math.log10(Math.sqrt(sumSquares / (last - first + 1))), finite };
}

describe('deterministic code-synthesized cues', () => {
  it.each([
    'confirm', 'cancel', 'step', 'save', 'deny', 'lamp', 'test_theme',
    'battle_theme', 'battle_hit', 'battle_heal', 'battle_guard', 'battle_cast', 'battle_win', 'battle_lose',
  ] as const)(
    '%s renders audible, repeatable samples with headroom and no boundary clicks',
    (id) => {
      expect(cues).toContain(id);
      const first = renderCue(id);
      const second = renderCue(id);
      expect(first).toBeInstanceOf(Float32Array);
      expect(first.length).toBeGreaterThan(1000);
      expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);
      const music = cueKinds[id] === 'music';
      const { peak, rmsDb, finite } = measure(first, !music);
      expect(finite).toBe(true);
      expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20));
      expect(rmsDb).toBeGreaterThanOrEqual(music ? -22 : -21);
      expect(rmsDb).toBeLessThanOrEqual(music ? -18 : -15);
      expect(first[0]).toBe(0);
      expect(first[first.length - 1]).toBe(0);
      expect(Math.abs(first[1] ?? 1)).toBeLessThan(0.001);
      expect(Math.abs(first[first.length - 2] ?? 1)).toBeLessThan(0.001);
    },
  );

  it('identifies both loops for full-buffer music measurement and battle stingers as effects', () => {
    expect(cueKinds).toMatchObject({
      test_theme: 'music', battle_theme: 'music',
      battle_hit: 'effect', battle_heal: 'effect', battle_guard: 'effect',
      battle_cast: 'effect', battle_win: 'effect', battle_lose: 'effect',
    });
  });

  it('keeps the battle theme an eight-bar, sixteen-second loop', () => {
    expect(cues).toContain('battle_theme');
    expect(renderCue('battle_theme').length).toBe(44100 * 16);
  });

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
