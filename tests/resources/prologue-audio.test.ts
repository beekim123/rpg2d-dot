import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as Synth from '../../resources/audio/synth.ts';

// Frozen Float32 baselines from the successful G3 verification, before any G4
// composition changes. These are not snapshots produced by the new renderer.
const legacyHashes = {
  confirm: 'ff7952ab0f750020b48b59465e43586ed18b995f9c85a9f3175a204bac1e8910',
  cancel: '14a34b7996eb365d9240e0c2efdd4da8261223173bea30f02ae70a138fa276e3',
  step: '2c5049532f62f77d11a5db38774bdd683134e7462d05e41d537621323f43b80d',
  save: '91b8a0dc0eda1d626e137a3dd00b116b98f9c9c56e0821e6d863879d62d7a0d6',
  deny: '07f667ac74bea4de8776d73a1997257a331b464c969463c866ae0f4ea2a9b9c6',
  lamp: 'f42f0f860d038ac36d3deb802f2f59c43ceeec8cf7edd4df3d8b5cac86b24025',
  test_theme: 'fb303aa1943d3fd640e01f1558d6fe4f1b429388c59acb218c072f0a6f5dc06a',
  battle_theme: '91b0f90226cfdac42043e3a77f3b9c0ced29e8630b2709d3f87223f68149da7e',
  battle_hit: 'a298265e7242aa958a5b8c189d9d3ed14f19914426f18ae37a38a306eb780ae7',
  battle_heal: 'd58bfa027d134eb5cc545065cb193aaec7f4fdcd024477bcc033c5e3d971ee20',
  battle_guard: 'b49ca8c28a63bdefd63d205f5dfba78a31479b04182635409f47cbfe4d7af7fa',
  battle_cast: '65f24dcd6773c070ab65bd36794540ae4208eb2d37a022cea1fcc190f0a2bddb',
  battle_win: '43925ed67d26034c8771061e222a7f64b9f8c85cee0a2b5ba9c0a7260f694903',
  battle_lose: 'c3a491bea9d8323950eb7e8bc5cc7c8320dc2163785f02fade4ac78ae4a755c0',
} as const;

// Independently chosen, complete 4/4 bar counts and expected 22050 Hz lengths.
const compositions = {
  title: { bpm: 84, bars: 12, frames: 756000 },
  lantern_vale: { bpm: 108, bars: 16, frames: 784000 },
  festival: { bpm: 132, bars: 16, frames: 641455 },
  crisis: { bpm: 144, bars: 16, frames: 588000 },
  awakening: { bpm: 120, bars: 12, frames: 529200 },
  battle: { bpm: 144, bars: 16, frames: 588000 },
} as const;
type PrologueId = keyof typeof compositions;
const formalIds = Object.keys(compositions) as PrologueId[];
const oldIds = Object.keys(legacyHashes) as (keyof typeof legacyHashes)[];

function samples(id: PrologueId, rate?: number): Float32Array {
  return Synth.renderCue(id as Synth.CueId, rate);
}
function sha(data: Float32Array): string {
  return createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
}
function rms(data: Float32Array): number {
  let sum = 0;
  for (const value of data) sum += value * value;
  return Math.sqrt(sum / data.length);
}
function measure(data: Float32Array): { finite: boolean; peak: number; rmsDb: number } {
  let peak = 0;
  let finite = true;
  for (const value of data) { peak = Math.max(peak, Math.abs(value)); finite &&= Number.isFinite(value); }
  return { finite, peak, rmsDb: 20 * Math.log10(rms(data)) };
}

describe('formal prologue compositions', () => {
  it('adds six separate music IDs and keeps all fourteen original cues', () => {
    expect(Synth.cues).toHaveLength(20);
    expect(new Set(Synth.cues).size).toBe(20);
    expect(Synth.cues).toEqual(expect.arrayContaining([...oldIds, ...formalIds]));
    for (const id of formalIds) expect(Synth.cueKinds[id as Synth.CueId]).toBe('music');
  });

  it('declares per-cue release rates without changing the old 44100 Hz contract', () => {
    // The optional type allows a clean missing-export red assertion before the
    // implementation exists, rather than an import-time failure.
    const rates = (Synth as typeof Synth & { cueSampleRates?: Readonly<Record<string, number>> }).cueSampleRates;
    expect(rates).toBeDefined();
    expect(Object.keys(rates ?? {}).sort()).toEqual([...oldIds, ...formalIds].sort());
    for (const id of oldIds) expect(rates?.[id]).toBe(44100);
    for (const id of formalIds) expect(rates?.[id]).toBe(22050);
  });

  it.each(oldIds)('%s keeps its pre-G4 Float32 samples exactly', id => {
    expect(sha(Synth.renderCue(id))).toBe(legacyHashes[id]);
  });

  it('closes every formal composition on complete bars at its authored tempo', () => {
    for (const id of formalIds) {
      const expected = compositions[id];
      expect(Synth.cueDurations[id as Synth.CueId]).toBeCloseTo(expected.bars * 4 * 60 / expected.bpm, 9);
    }
  });

  it('renders six distinct deterministic loops with headroom, music RMS and quiet seams', () => {
    const fullHashes = new Set<string>();
    const openingHashes = new Set<string>();
    for (const id of formalIds) {
      const first = samples(id, 22050);
      const repeated = samples(id, 22050);
      expect(first).toBeInstanceOf(Float32Array);
      expect(first.length).toBe(compositions[id].frames);
      expect(44 + first.length * 2).toBeLessThan(2_000_000);
      const hash = sha(first);
      expect(sha(repeated)).toBe(hash);
      fullHashes.add(hash);
      openingHashes.add(sha(first.subarray(0, 22050 * 4)));
      const result = measure(first);
      expect(result.finite).toBe(true);
      expect(result.peak).toBeLessThanOrEqual(10 ** (-1 / 20));
      expect(result.rmsDb).toBeGreaterThanOrEqual(-22);
      expect(result.rmsDb).toBeLessThanOrEqual(-18);
      expect(first[0]).toBe(0);
      expect(first[first.length - 1]).toBe(0);
      expect(Math.abs((first[1] ?? 1) + (first[first.length - 2] ?? 1))).toBeLessThan(0.001);
      if (id === 'awakening') {
        const preparation = rms(first.subarray(0, Math.round(22050 * 1.25)));
        const arrival = rms(first.subarray(22050 * 2, 22050 * 4));
        expect(arrival).toBeGreaterThan(preparation * 1.5);
        expect(20 * Math.log10(arrival)).toBeGreaterThan(-24);
      }
    }
    expect(fullHashes.size).toBe(6);
    expect(openingHashes.size).toBe(6);
  }, 120000);

  it('retains the 44100 Hz default while allowing an explicit rate for a new cue', () => {
    expect(samples('awakening').length).toBe(1058400);
    expect(samples('awakening', 8000).length).toBe(192000);
  }, 30000);
});
