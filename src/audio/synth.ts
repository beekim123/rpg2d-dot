export const cues = ['confirm', 'cancel', 'step', 'save', 'deny', 'lamp', 'test_theme'] as const;
export type CueId = (typeof cues)[number];

type Timbre = 'warm' | 'bell' | 'sine' | 'pluck' | 'step';
type Note = { start: number; duration: number; midi: number; gain: number; timbre: Timbre; slide?: number };

export const cueDurations: Readonly<Record<CueId, number>> = {
  confirm: 0.21, cancel: 0.2, step: 0.09, save: 0.6, deny: 0.24, lamp: 0.7, test_theme: 8,
};

const soundNotes: Readonly<Record<Exclude<CueId, 'test_theme'>, readonly Note[]>> = {
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
  const attack = Math.min(0.012, note.duration * 0.15) * sampleRate;
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
  const notes = id === 'test_theme' ? themeNotes() : soundNotes[id];
  notes.forEach((note, index) => addNote(output, sampleRate, note, index));

  const edgeLength = sampleRate * (id === 'test_theme' ? 0.02 : 0.006);
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < output.length; i++) {
    const sample = (output[i] ?? 0) * smoothEdge(i / edgeLength) * smoothEdge((output.length - 1 - i) / edgeLength);
    output[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / output.length);
  const targetRms = 10 ** ((id === 'test_theme' ? -20 : -18) / 20);
  const gain = Math.min(targetRms / rms, 10 ** (-1.05 / 20) / peak);
  for (let i = 0; i < output.length; i++) output[i] = (output[i] ?? 0) * gain;
  // Positive zero at both boundaries makes the loop seam explicit in reports.
  output[0] = 0;
  output[output.length - 1] = 0;
  return output;
}
