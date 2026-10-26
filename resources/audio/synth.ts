export const cues = [
  'confirm', 'cancel', 'step', 'save', 'deny', 'lamp', 'test_theme',
  'battle_theme', 'battle_hit', 'battle_heal', 'battle_guard', 'battle_cast', 'battle_win', 'battle_lose',
  'title', 'lantern_vale', 'festival', 'crisis', 'awakening', 'battle',
] as const;
export type CueId = (typeof cues)[number];
export type CueKind = 'music' | 'effect';
export type PrologueCueId = 'title' | 'lantern_vale' | 'festival' | 'crisis' | 'awakening' | 'battle';

type Timbre = 'warm' | 'bell' | 'sine' | 'pluck' | 'step' | 'pulse' | 'kick' | 'snare' | 'hat' | 'impact' | 'shield' | 'flute';
type Note = { start: number; duration: number; midi: number; gain: number; timbre: Timbre; slide?: number };

/** Use the cue's role, rather than a special case for one track, to choose RMS measurement. */
export const cueKinds: Readonly<Record<CueId, CueKind>> = {
  confirm: 'effect', cancel: 'effect', step: 'effect', save: 'effect', deny: 'effect', lamp: 'effect',
  test_theme: 'music', battle_theme: 'music', battle_hit: 'effect', battle_heal: 'effect',
  battle_guard: 'effect', battle_cast: 'effect', battle_win: 'effect', battle_lose: 'effect',
  title: 'music', lantern_vale: 'music', festival: 'music', crisis: 'music', awakening: 'music', battle: 'music',
};

/** Release rates are explicit; renderCue's historical default remains 44100 Hz. */
export const cueSampleRates: Readonly<Record<CueId, number>> = {
  confirm: 44100, cancel: 44100, step: 44100, save: 44100, deny: 44100, lamp: 44100,
  test_theme: 44100, battle_theme: 44100, battle_hit: 44100, battle_heal: 44100,
  battle_guard: 44100, battle_cast: 44100, battle_win: 44100, battle_lose: 44100,
  title: 22050, lantern_vale: 22050, festival: 22050, crisis: 22050, awakening: 22050, battle: 22050,
};

export const cueDurations: Readonly<Record<CueId, number>> = {
  confirm: 0.21, cancel: 0.2, step: 0.09, save: 0.6, deny: 0.24, lamp: 0.7, test_theme: 8,
  battle_theme: 16, battle_hit: 0.22, battle_heal: 0.72, battle_guard: 0.48,
  battle_cast: 0.52, battle_win: 1.25, battle_lose: 1.35,
  title: 12 * 4 * 60 / 84, lantern_vale: 16 * 4 * 60 / 108,
  festival: 16 * 4 * 60 / 132, crisis: 16 * 4 * 60 / 144,
  awakening: 12 * 4 * 60 / 120, battle: 16 * 4 * 60 / 144,
};

const soundNotes: Readonly<Record<Exclude<CueId, 'test_theme' | 'battle_theme' | PrologueCueId>, readonly Note[]>> = {
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

// Formal prologue scores are independent of the two preserved test themes.
// Every tuple is [MIDI pitch, eighth-note count]; -1 is a deliberate rest.
type Phrase = readonly (readonly [number, number])[];
const starSong: readonly Phrase[] = [
  [[72, 2], [76, 1], [79, 1], [81, 2], [79, 2]],
  [[76, 2], [74, 1], [76, 1], [79, 2], [74, 2]],
  [[77, 2], [81, 2], [79, 1], [76, 1], [77, 2]],
  [[74, 2], [76, 1], [79, 1], [81, 1], [79, 1], [74, 2]],
];
const starReply: readonly Phrase[] = [
  [[76, 2], [79, 1], [84, 1], [83, 2], [81, 2]],
  [[79, 2], [81, 2], [76, 2], [74, 2]],
  [[77, 1], [81, 1], [84, 2], [81, 2], [79, 2]],
  [[86, 2], [84, 1], [81, 1], [79, 2], [74, 2]],
];
const starReturn: readonly Phrase[] = [
  [[72, 2], [76, 1], [79, 1], [84, 2], [83, 1], [81, 1]],
  [[79, 3], [76, 1], [74, 2], [76, 2]],
  [[77, 1], [79, 1], [81, 2], [79, 2], [76, 2]],
  [[74, 2], [79, 1], [81, 1], [74, 4]],
];
const titleBridge: readonly Phrase[] = [
  [[-1, 1], [76, 1], [79, 2], [83, 2], [81, 2]],
  [[79, 3], [76, 1], [74, 2], [76, 2]],
  [[77, 2], [81, 1], [84, 1], [83, 2], [79, 2]],
  [[81, 2], [79, 2], [76, 2], [74, 2]],
];
const villageReply: readonly Phrase[] = [
  [[-1, 1], [76, 1], [79, 2], [76, 1], [74, 1], [72, 2]],
  [[76, 1], [79, 1], [83, 2], [79, 1], [76, 1], [74, 2]],
  [[77, 2], [-1, 1], [81, 1], [79, 2], [77, 2]],
  [[76, 1], [74, 1], [79, 2], [76, 2], [74, 2]],
];
const festivalBridge: readonly Phrase[] = [
  [[-1, 2], [79, 1], [83, 1], [86, 2], [83, 2]],
  [[81, 2], [76, 1], [79, 1], [84, 2], [81, 2]],
  [[77, 1], [81, 1], [86, 2], [-1, 1], [84, 1], [81, 2]],
  [[79, 2], [81, 1], [79, 1], [76, 2], [74, 2]],
];
const crisisCall: readonly Phrase[] = [
  [[72, 1], [75, 1], [79, 2], [-1, 1], [75, 1], [74, 2]],
  [[72, 1], [-1, 1], [75, 1], [74, 1], [70, 2], [74, 2]],
  [[77, 1], [80, 1], [79, 2], [75, 1], [-1, 1], [77, 2]],
  [[74, 1], [75, 1], [79, 2], [77, 1], [75, 1], [74, 2]],
];
const crisisAnswer: readonly Phrase[] = [
  [[72, 1], [75, 1], [79, 1], [84, 1], [82, 2], [80, 2]],
  [[79, 2], [77, 1], [75, 1], [74, 2], [-1, 2]],
  [[77, 1], [80, 1], [84, 2], [82, 1], [80, 1], [79, 2]],
  [[75, 1], [74, 1], [79, 2], [-1, 1], [75, 1], [74, 2]],
];
const crisisLow: readonly Phrase[] = [
  [[60, 2], [63, 2], [-1, 1], [67, 1], [70, 2]],
  [[68, 2], [67, 2], [63, 2], [62, 2]],
  [[65, 2], [-1, 1], [68, 1], [67, 2], [63, 2]],
  [[62, 2], [63, 1], [67, 1], [62, 4]],
];
const crisisReturn: readonly Phrase[] = [
  [[72, 1], [75, 1], [79, 2], [80, 1], [79, 1], [75, 2]],
  [[79, 1], [77, 1], [75, 2], [74, 1], [75, 1], [79, 2]],
  [[77, 1], [80, 1], [84, 2], [80, 1], [79, 1], [75, 2]],
  [[74, 2], [79, 1], [75, 1], [74, 4]],
];
const awakeningCall: readonly Phrase[] = [
  [[-1, 6], [72, 1], [76, 1]],
  [[79, 2], [81, 2], [84, 2], [83, 2]],
  [[79, 2], [76, 1], [74, 1], [76, 2], [79, 2]],
  [[74, 2], [76, 1], [79, 1], [81, 1], [79, 1], [74, 2]],
];
const battleCall: readonly Phrase[] = [
  [[72, 1], [76, 1], [79, 1], [81, 1], [79, 2], [76, 1], [79, 1]],
  [[79, 1], [76, 1], [74, 2], [-1, 1], [76, 1], [79, 2]],
  [[77, 1], [81, 1], [79, 1], [76, 1], [77, 2], [81, 1], [79, 1]],
  [[74, 1], [76, 1], [79, 1], [81, 1], [79, 2], [74, 2]],
];
const battleAnswer: readonly Phrase[] = [
  [[76, 1], [79, 1], [83, 2], [86, 1], [84, 1], [83, 2]],
  [[81, 1], [84, 1], [83, 1], [79, 1], [76, 2], [74, 2]],
  [[77, 1], [81, 1], [86, 2], [84, 1], [81, 1], [79, 2]],
  [[79, 1], [-1, 1], [81, 1], [79, 1], [76, 2], [74, 2]],
];
const battleBreak: readonly Phrase[] = [
  [[69, 2], [72, 1], [76, 1], [-1, 2], [74, 2]],
  [[65, 2], [69, 2], [72, 1], [69, 1], [67, 2]],
  [[62, 1], [65, 1], [69, 2], [72, 2], [76, 2]],
  [[74, 2], [-1, 1], [79, 1], [81, 2], [74, 2]],
];
const prologueScores: Readonly<Record<PrologueCueId, readonly Phrase[]>> = {
  title: [...starSong, ...titleBridge, ...starReturn],
  lantern_vale: [...starSong, ...villageReply, ...starReply, ...starReturn],
  festival: [...starSong, ...starReply, ...festivalBridge, ...starReturn],
  crisis: [...crisisCall, ...crisisAnswer, ...crisisLow, ...crisisReturn],
  awakening: [...awakeningCall, ...starReply, ...starReturn],
  battle: [...battleCall, ...battleAnswer, ...battleBreak, ...starReturn],
};
const prologueTempos: Readonly<Record<PrologueCueId, number>> = {
  title: 84, lantern_vale: 108, festival: 132, crisis: 144, awakening: 120, battle: 144,
};
// Root bass followed by four chord/colour tones. The final G/G5 bars retain D.
const prologueChords = {
  C: [48, 60, 64, 67, 74], Am: [45, 57, 60, 64, 71],
  F: [41, 53, 57, 60, 67], G: [43, 55, 57, 62, 67],
  Em: [40, 52, 55, 59, 62], Dm: [38, 50, 53, 57, 64],
  Cm: [48, 60, 63, 67, 74], Ab: [44, 56, 60, 63, 70],
  Eb: [39, 51, 55, 58, 65], Fm: [41, 53, 56, 60, 67], G5: [43, 55, 62, 67, 74],
} as const;
type Harmony = keyof typeof prologueChords;
const prologueHarmony: Readonly<Record<PrologueCueId, readonly Harmony[]>> = {
  title: ['C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'F', 'Dm', 'G'],
  lantern_vale: ['C', 'Am', 'F', 'G', 'C', 'Em', 'Dm', 'G', 'Am', 'F', 'C', 'G', 'C', 'Am', 'F', 'G'],
  festival: ['C', 'F', 'Am', 'G', 'C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'F', 'Am', 'G'],
  crisis: ['Cm', 'Ab', 'Fm', 'G5', 'Cm', 'Eb', 'Ab', 'G5', 'Cm', 'Ab', 'Fm', 'G5', 'Cm', 'Ab', 'Fm', 'G5'],
  awakening: ['C', 'C', 'Am', 'G', 'F', 'Am', 'Dm', 'G', 'C', 'F', 'Dm', 'G'],
  battle: ['C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'Am', 'F', 'G'],
};

function isPrologueCue(id: CueId): id is PrologueCueId {
  return id === 'title' || id === 'lantern_vale' || id === 'festival' || id === 'crisis' || id === 'awakening' || id === 'battle';
}

function prologueNotes(id: PrologueCueId): Note[] {
  const notes: Note[] = [];
  const beat = 60 / prologueTempos[id];
  const total = cueDurations[id];
  const put = (at: number, beats: number, midi: number, gain: number, timbre: Timbre, slide?: number): void => {
    const start = at * beat;
    const duration = Math.min(beats * beat, total - start);
    if (midi < 0 || duration <= 0) return;
    notes.push({ start, duration, midi, gain, timbre, ...(slide === undefined ? {} : { slide }) });
  };
  const phrase = (bar: number, line: Phrase, timbre: Timbre, gain: number, doubled = false): void => {
    let at = bar * 4;
    for (const [midi, eighths] of line) {
      const beats = eighths / 2;
      put(at, beats * (timbre === 'pluck' ? 0.82 : 0.94), midi, gain, timbre);
      if (doubled && midi >= 0) put(at, beats * 0.91, midi - 12, gain * 0.2, 'warm');
      at += beats;
    }
  };
  prologueScores[id].forEach((line, bar) => {
    const at = bar * 4;
    if (id === 'awakening' && bar === 0) {
      // One two-second bar of preparation only. The C/E pickup starts at 1.5 s;
      // the G response and full ensemble arrive at precisely 2 s, not mid-scene.
      put(0, 2.9, 60, 0.055, 'bell');
      put(0, 2.9, 48, 0.035, 'sine');
      put(2.5, 0.25, 80, 0.025, 'hat');
      put(3, 0.3, 50, 0.06, 'snare', -3);
      put(3.5, 0.35, 53, 0.09, 'snare', -3);
      phrase(bar, line, 'warm', 0.18);
      return;
    }
    const middle = bar >= 4 && bar < 8;
    const thin = (id === 'festival' || id === 'crisis' || id === 'battle') && bar >= 8 && bar < 12;
    const finalSection = bar >= prologueScores[id].length - 4;
    const driving = id === 'crisis' || id === 'awakening' || id === 'battle';
    const lead: Timbre = id === 'title' ? (middle ? 'bell' : 'flute')
      : id === 'lantern_vale' ? (middle ? 'pluck' : 'flute')
      : id === 'festival' ? (thin ? 'flute' : 'bell')
      : thin ? 'pluck' : id === 'awakening' && middle ? 'warm' : 'pulse';
    const leadGain = id === 'title' ? 0.42 : id === 'lantern_vale' ? 0.38
      : id === 'festival' ? 0.36 : thin ? 0.29 : id === 'awakening' ? 0.5 : 0.43;
    phrase(bar, line, lead, leadGain, id === 'awakening' || (id === 'battle' && finalSection));

    const harmony = prologueChords[prologueHarmony[id][bar] ?? 'G'];
    const root = harmony[0];
    const tones = harmony.slice(1);
    // Chord voicing and density change with sections; there is no repeated
    // four-bar PCM block or sample pasted underneath a new cue name.
    const padGain = id === 'title' ? 0.055 : id === 'lantern_vale' ? 0.032 : thin ? 0.055 : 0.045;
    for (let voice = 0; voice < 3; voice++) {
      put(at + voice * 0.035, 3.78 - voice * 0.035, tones[voice] ?? 60, padGain, 'warm');
    }
    if (driving && !thin) {
      const bassPattern = [0, 0, 7, 12, 0, 7, 12, 7] as const;
      bassPattern.forEach((interval, eighth) => put(at + eighth / 2, 0.43, root + interval, id === 'awakening' ? 0.36 : 0.3, 'sine'));
    } else {
      put(at, 1.85, root, thin ? 0.22 : 0.28, 'sine');
      put(at + 2, 1.85, root + 7, thin ? 0.19 : 0.25, 'sine');
    }
    const spacing = (id === 'title' && middle) || thin ? 1 : 0.5;
    const arpOrder = bar % 2 === 0 ? [0, 2, 1, 3, 2, 1, 3, 1] : [0, 1, 2, 3, 1, 2, 3, 2];
    for (let tick = 0; tick * spacing < 4; tick++) {
      const pitch = tones[arpOrder[tick] ?? 0] ?? 60;
      put(at + tick * spacing, spacing * 0.83, pitch + (id === 'festival' ? 12 : 0), thin ? 0.075 : 0.115, 'pluck');
    }
    if (id === 'title') {
      if (bar % 2 === 0) put(at + 0.5, 1.4, (tones[2] ?? 67) + 12, 0.06, 'bell');
    } else if (id === 'lantern_vale') {
      // A quiet flute response appears between the plucked middle-section calls.
      if (middle) put(at + 2.5, 0.8, (tones[1] ?? 64) + 12, 0.12, 'flute');
      put(at, 0.23, 43, 0.065, 'kick', -18);
      put(at + 2, 0.2, 43, 0.045, 'kick', -16);
      put(at + 3, 0.16, 50, 0.025, 'snare', -4);
    } else if (thin) {
      // The third section makes room: sustained low pulse, sparse bell answer.
      put(at, 0.35, 43, id === 'crisis' ? 0.18 : 0.1, 'kick', -18);
      put(at + 2.5, 1.1, (tones[2] ?? 67) + 12, id === 'crisis' ? 0.045 : 0.07, 'bell');
    } else {
      const kickGain = id === 'festival' ? 0.15 : id === 'awakening' ? 0.32 : 0.26;
      const snareGain = id === 'festival' ? 0.075 : 0.12;
      for (const quarter of [0, 2]) put(at + quarter, 0.29, 43, kickGain, 'kick', -20);
      for (const quarter of [1, 3]) put(at + quarter, 0.23, 50, snareGain, 'snare', -5);
      for (const eighth of [1, 3, 5, 7]) put(at + eighth / 2, 0.12, 92, id === 'festival' ? 0.027 : 0.035, 'hat');
      if (finalSection && bar % 2 === 0) put(at + 0.5, 0.65, (line[0]?.[0] ?? 72) + 12, 0.07, 'bell');
      if (bar % 4 === 3 && !finalSection) {
        put(at + 3.5, 0.2, 50, snareGain * 0.7, 'snare', -4);
        put(at + 3.75, 0.2, 53, snareGain * 0.55, 'snare', -6);
      }
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
      case 'flute': wave = (fundamental + 0.11 * Math.sin(phase * 2) + 0.025 * Math.sin(phase * 3)) * (0.96 + 0.04 * Math.sin(2 * Math.PI * 5.2 * i / sampleRate)); break;
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
  const notes = id === 'test_theme' ? themeNotes() : id === 'battle_theme' ? battleThemeNotes() : isPrologueCue(id) ? prologueNotes(id) : soundNotes[id];
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
