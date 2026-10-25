export const cues = [
  'confirm', 'cancel', 'step', 'save', 'deny', 'lamp', 'test_theme',
  'battle_theme', 'battle_hit', 'battle_heal', 'battle_guard', 'battle_cast', 'battle_win', 'battle_lose',
] as const;
export type CueId = (typeof cues)[number];
export type CueKind = 'music' | 'effect';

type Timbre = 'warm' | 'bell' | 'sine' | 'pluck' | 'step' | 'pulse' | 'kick' | 'snare' | 'hat' | 'impact' | 'shield';
type Note = { start: number; duration: number; midi: number; gain: number; timbre: Timbre; slide?: number };

/** Use the cue's role, rather than a special case for one track, to choose RMS measurement. */
export const cueKinds: Readonly<Record<CueId, CueKind>> = {
  confirm: 'effect', cancel: 'effect', step: 'effect', save: 'effect', deny: 'effect', lamp: 'effect',
  test_theme: 'music', battle_theme: 'music', battle_hit: 'effect', battle_heal: 'effect',
  battle_guard: 'effect', battle_cast: 'effect', battle_win: 'effect', battle_lose: 'effect',
};

export const cueDurations: Readonly<Record<CueId, number>> = {
  confirm: 0.21, cancel: 0.2, step: 0.09, save: 0.6, deny: 0.24, lamp: 0.7, test_theme: 8,
  battle_theme: 16, battle_hit: 0.22, battle_heal: 0.72, battle_guard: 0.48,
  battle_cast: 0.52, battle_win: 1.25, battle_lose: 1.35,
};

const soundNotes: Readonly<Record<Exclude<CueId, 'test_theme' | 'battle_theme'>, readonly Note[]>> = {
  confirm: [
    { start: 0, duration: 0.1, midi: 72, gain: 0.7, timbre: 'warm' },
    { start: 0.08, duration: 0.13, midi: 79, gain: 1, timbre: 'warm' },
  ],
  cancel: [
    { start: 0, duration: 0.1, midi: 72, gain: 0.8, timbre: 'warm' },
    { start: 0.08, duration: 0.12, midi: 67, gain: 1, timbre: 'warm' },
  ],
  step: [{ start: 0, duration: 0.09, midi: 43, gain: 1, timbre: 'step', slide: -7 }],
  save: [
    { start: 0, duration: 0.3, midi: 72, gain: 0.7, timbre: 'bell' },
    { start: 0.12, duration: 0.3, midi: 76, gain: 0.7, timbre: 'bell' },
    { start: 0.24, duration: 0.36, midi: 83, gain: 1, timbre: 'bell' },
  ],
  deny: [
    { start: 0, duration: 0.14, midi: 55, gain: 0.75, timbre: 'warm', slide: -2 },
    { start: 0.1, duration: 0.14, midi: 52, gain: 1, timbre: 'warm', slide: -3 },
  ],
  lamp: [
    { start: 0, duration: 0.35, midi: 67, gain: 0.65, timbre: 'bell' },
    { start: 0.1, duration: 0.4, midi: 74, gain: 0.7, timbre: 'bell' },
    { start: 0.2, duration: 0.5, midi: 79, gain: 1, timbre: 'bell' },
  ],
  battle_hit: [
    { start: 0, duration: 0.18, midi: 50, gain: 1, timbre: 'impact', slide: -16 },
    { start: 0.025, duration: 0.095, midi: 79, gain: 0.26, timbre: 'pulse', slide: -7 },
  ],
  battle_heal: [
    { start: 0, duration: 0.4, midi: 72, gain: 0.65, timbre: 'bell' },
    { start: 0.12, duration: 0.4, midi: 76, gain: 0.7, timbre: 'bell' },
    { start: 0.24, duration: 0.48, midi: 81, gain: 0.85, timbre: 'bell' },
    { start: 0.24, duration: 0.48, midi: 60, gain: 0.25, timbre: 'sine' },
  ],
  battle_guard: [
    { start: 0, duration: 0.35, midi: 55, gain: 0.8, timbre: 'shield' },
    { start: 0.045, duration: 0.435, midi: 74, gain: 0.55, timbre: 'shield' },
  ],
  battle_cast: [
    { start: 0, duration: 0.2, midi: 60, gain: 0.5, timbre: 'pulse', slide: 7 },
    { start: 0.08, duration: 0.16, midi: 67, gain: 0.55, timbre: 'pulse' },
    { start: 0.14, duration: 0.17, midi: 74, gain: 0.6, timbre: 'pulse' },
    { start: 0.19, duration: 0.33, midi: 79, gain: 0.8, timbre: 'bell' },
  ],
  battle_win: [
    { start: 0, duration: 0.19, midi: 72, gain: 0.7, timbre: 'pulse' },
    { start: 0.16, duration: 0.19, midi: 76, gain: 0.7, timbre: 'pulse' },
    { start: 0.32, duration: 0.19, midi: 79, gain: 0.7, timbre: 'pulse' },
    { start: 0.52, duration: 0.73, midi: 86, gain: 0.65, timbre: 'bell' },
    { start: 0.52, duration: 0.73, midi: 67, gain: 0.38, timbre: 'warm' },
    { start: 0.52, duration: 0.73, midi: 57, gain: 0.3, timbre: 'sine' },
  ],
  battle_lose: [
    { start: 0, duration: 0.46, midi: 67, gain: 0.65, timbre: 'warm' },
    { start: 0.28, duration: 0.5, midi: 63, gain: 0.6, timbre: 'warm' },
    { start: 0.58, duration: 0.77, midi: 62, gain: 0.65, timbre: 'sine' },
    { start: 0.58, duration: 0.77, midi: 43, gain: 0.35, timbre: 'sine' },
  ],
};

// Original 120 BPM, four-bar phrase. C–E–G rises; the last D remains unresolved.
const melody = [72, 76, 79, 81, 79, 76, 74, 76, 77, 81, 79, 76, 74, 76, 79, 74] as const;
const bass = [48, 55, 45, 52, 53, 48, 43, 50] as const;
const chords = [[60, 64, 67, 64], [57, 60, 64, 60], [53, 57, 60, 57], [55, 57, 62, 57]] as const;

function themeNotes(): Note[] {
  const notes: Note[] = [];
  melody.forEach((midi, beat) => notes.push({ start: beat * 0.5, duration: 0.48, midi, gain: 0.72, timbre: 'warm' }));
  bass.forEach((midi, beat) => notes.push({ start: beat, duration: 0.94, midi, gain: 0.45, timbre: 'sine' }));
  chords.forEach((chord, bar) => {
    for (let eighth = 0; eighth < 8; eighth++) {
      notes.push({ start: bar * 2 + eighth * 0.25, duration: 0.24, midi: chord[eighth % 4] ?? 60, gain: 0.2, timbre: 'pluck' });
    }
  });
  return notes;
}

// Eight original bars at 120 BPM: each tuple is [MIDI pitch, eighth-note count].
// The M0 C–E–G rise becomes a clipped call, answered higher in bars five through eight.
const battleMelody = [
  [[72, 1], [76, 1], [79, 2], [81, 1], [79, 1], [76, 2]],
  [[79, 1], [76, 1], [74, 2], [76, 2], [79, 2]],
  [[77, 1], [81, 1], [79, 2], [76, 1], [77, 1], [81, 2]],
  [[74, 1], [76, 1], [79, 2], [81, 1], [79, 1], [74, 2]],
  [[72, 1], [76, 1], [79, 1], [84, 1], [83, 1], [81, 1], [79, 2]],
  [[81, 1], [79, 1], [76, 2], [79, 1], [76, 1], [74, 2]],
  [[77, 1], [81, 1], [84, 2], [81, 1], [79, 1], [76, 2]],
  [[74, 1], [76, 1], [79, 1], [81, 1], [79, 2], [74, 2]],
] as const;

function battleThemeNotes(): Note[] {
  const notes: Note[] = [];
  const roots = [48, 45, 53, 43] as const;
  const bassSteps = [0, 0, 12, 7, 0, 7, 12, 7] as const;
  battleMelody.forEach((phrase, bar) => {
    let start = bar * 2;
    for (const [midi, eighths] of phrase) {
      notes.push({ start, duration: eighths * 0.25 - 0.025, midi, gain: 0.6, timbre: 'pulse' });
      start += eighths * 0.25;
    }
    const root = roots[bar % 4] ?? 48;
    const chord = chords[bar % 4] ?? chords[0];
    for (let eighth = 0; eighth < 8; eighth++) {
      const onset = bar * 2 + eighth * 0.25;
      notes.push({ start: onset, duration: 0.21, midi: root + (bassSteps[eighth] ?? 0), gain: 0.42, timbre: 'sine' });
      notes.push({ start: onset, duration: 0.19, midi: chord[eighth % 4] ?? 60, gain: 0.14, timbre: 'pluck' });
      if (eighth % 4 === 0) notes.push({ start: onset, duration: 0.16, midi: 43, gain: 0.36, timbre: 'kick', slide: -20 });
      if (eighth % 4 === 2) notes.push({ start: onset, duration: 0.12, midi: 50, gain: 0.18, timbre: 'snare', slide: -5 });
      if (eighth % 2 === 1) notes.push({ start: onset, duration: 0.055, midi: 92, gain: 0.055, timbre: 'hat' });
    }
  });
  return notes;
}

function randomSequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000 * 2 - 1;
  };
}

function smoothEdge(position: number): number {
  const x = Math.max(0, Math.min(1, position));
  return x * x * (3 - 2 * x);
}

function addNote(output: Float32Array, sampleRate: number, note: Note, index: number): void {
  const offset = Math.round(note.start * sampleRate);
  const length = Math.round(note.duration * sampleRate);
  const baseFrequency = 440 * 2 ** ((note.midi - 69) / 12);
  const noise = randomSequence(0x41535452 ^ (index + 1) * 0x45d9f3b);
  const percussion = note.timbre === 'kick' || note.timbre === 'snare' || note.timbre === 'hat' || note.timbre === 'impact';
  const attack = Math.min(percussion ? 0.002 : 0.012, note.duration * 0.15) * sampleRate;
  const release = Math.min(0.055, note.duration * 0.3) * sampleRate;
  let phase = 0;
  let filteredNoise = 0;
  for (let i = 0; i < length && offset + i < output.length; i++) {
    const fraction = i / Math.max(1, length - 1);
    const frequency = baseFrequency * 2 ** (((note.slide ?? 0) * fraction) / 12);
    const fundamental = Math.sin(phase);
    let wave: number;
    switch (note.timbre) {
      case 'sine': wave = fundamental; break;
      case 'warm': wave = fundamental + 0.13 * Math.sin(phase * 3) + 0.035 * Math.sin(phase * 5); break;
      case 'bell': wave = Math.sin(phase + 0.9 * Math.exp(-5 * fraction) * Math.sin(phase * 2)); break;
      case 'pluck': wave = (fundamental + 0.2 * Math.sin(phase * 2)) * Math.exp(-3.2 * fraction); break;
      case 'pulse': wave = fundamental + 0.26 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 5) + 0.06 * Math.sin(phase * 7); break;
      case 'kick': wave = fundamental * Math.exp(-5 * fraction); break;
      case 'snare':
        filteredNoise += 0.35 * (noise() - filteredNoise);
        wave = (0.25 * fundamental + 0.9 * filteredNoise) * Math.exp(-4 * fraction);
        break;
      case 'hat': {
        const sample = noise();
        filteredNoise += 0.3 * (sample - filteredNoise);
        wave = (sample - filteredNoise) * Math.exp(-5 * fraction);
        break;
      }
      case 'impact':
        filteredNoise += 0.45 * (noise() - filteredNoise);
        wave = (0.65 * fundamental + 0.8 * filteredNoise) * Math.exp(-4.5 * fraction);
        break;
      case 'shield': wave = (Math.sin(phase + 1.7 * Math.exp(-4 * fraction) * Math.sin(phase * 2.6)) + 0.18 * Math.sin(phase * 3.5)) * Math.exp(-1.7 * fraction); break;
      case 'step':
        filteredNoise += 0.18 * (noise() - filteredNoise);
        wave = (0.6 * fundamental + 0.7 * filteredNoise) * Math.exp(-3 * fraction);
        break;
    }
    const envelope = smoothEdge(i / attack) * smoothEdge((length - 1 - i) / release);
    const target = offset + i;
    output[target] = (output[target] ?? 0) + wave * envelope * note.gain;
    phase += 2 * Math.PI * frequency / sampleRate;
  }
}

/** Pure, deterministic mono synthesis shared by Web Audio and the offline checker. */
export function renderCue(id: CueId, sampleRate = 44100): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new RangeError('Audio sample rate must be an integer from 8000 to 96000 Hz.');
  }
  if (!cues.includes(id)) throw new RangeError(`Unknown audio cue: ${id}`);
  const output = new Float32Array(Math.round(cueDurations[id] * sampleRate));
  const notes = id === 'test_theme' ? themeNotes() : id === 'battle_theme' ? battleThemeNotes() : soundNotes[id];
  notes.forEach((note, index) => addNote(output, sampleRate, note, index));

  const music = cueKinds[id] === 'music';
  const edgeLength = sampleRate * (music ? 0.02 : 0.006);
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < output.length; i++) {
    const sample = (output[i] ?? 0) * smoothEdge(i / edgeLength) * smoothEdge((output.length - 1 - i) / edgeLength);
    output[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / output.length);
  const targetRms = 10 ** ((music ? -20 : -18) / 20);
  const gain = Math.min(targetRms / rms, 10 ** (-1.05 / 20) / peak);
  for (let i = 0; i < output.length; i++) output[i] = (output[i] ?? 0) * gain;
  // Positive zero at both boundaries makes the loop seam explicit in reports.
  output[0] = 0;
  output[output.length - 1] = 0;
  return output;
}
