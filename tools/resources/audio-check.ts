import { createHash } from 'node:crypto';
import { cues, cueKinds, renderCue } from '../../resources/audio/synth.ts';

const sampleRate = 44100;
let failed = false;
const report = cues.map((id) => {
  const music = cueKinds[id] === 'music';
  const samples = renderCue(id, sampleRate);
  const second = renderCue(id, sampleRate);
  const bytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const repeated = Buffer.from(second.buffer, second.byteOffset, second.byteLength);
  const deterministic = bytes.equals(repeated);
  let peak = 0;
  let firstActive = 0;
  let lastActive = samples.length - 1;
  if (!music) {
    while (firstActive < lastActive && Math.abs(samples[firstActive] ?? 0) < 0.0001) firstActive++;
    while (lastActive > firstActive && Math.abs(samples[lastActive] ?? 0) < 0.0001) lastActive--;
  }
  let sumSquares = 0;
  let finite = true;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    finite &&= Number.isFinite(sample);
    peak = Math.max(peak, Math.abs(sample));
    if (i >= firstActive && i <= lastActive) sumSquares += sample * sample;
  }
  const rmsDb = 20 * Math.log10(Math.sqrt(sumSquares / (lastActive - firstActive + 1)));
  const peakDb = 20 * Math.log10(peak);
  const first = samples[0] ?? 0;
  const last = samples[samples.length - 1] ?? 0;
  const seam = Math.abs(first - last);
  const slope = Math.abs(((samples[1] ?? 0) - first) - (last - (samples[samples.length - 2] ?? 0)));
  const target = music ? -20 : -18;
  const tolerance = music ? 2 : 3;
  const passed = deterministic && finite && peakDb <= -1 && Math.abs(rmsDb - target) <= tolerance && seam < 0.001 && slope < 0.001;
  failed ||= !passed;
  return {
    cue: id, kind: cueKinds[id], seconds: (samples.length / sampleRate).toFixed(2), deterministic,
    'peak dBFS': peakDb.toFixed(2), 'RMS dBFS': rmsDb.toFixed(2),
    seam: seam.toExponential(2), slope: slope.toExponential(2),
    sha256: createHash('sha256').update(bytes).digest('hex'), result: passed ? 'PASS' : 'FAIL',
  };
});

console.log('ASTRA audio check · 44100 Hz mono · deterministic Float32 samples · RMS (not LUFS)');
console.table(report);
if (failed) {
  console.error('Audio validation failed; do not accept or commit these cues.');
  process.exitCode = 1;
} else {
  console.log(`PASS: ${cues.length} cues meet determinism, peak, RMS and boundary requirements. Listening review remains separate.`);
}
