import { cueDurations, renderCue, type CueId } from '../../../../resources/audio/synth.ts';
import { SoundLimiter } from './limiter.ts';

type MusicVoice = { source: AudioBufferSourceNode; volume: GainNode };

/** Lazily creates Web Audio only from an explicit user gesture. */
export class AudioPlayer {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private readonly buffers = new Map<CueId, AudioBuffer>();
  private readonly limiter = new SoundLimiter();
  private readonly musicVoices = new Set<MusicVoice>();
  private muted = false;
  private wantedMusic: CueId | undefined;
  private currentMusic: CueId | undefined;

  async unlock(): Promise<void> {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;

      // A transparent central range and soft outer knee keep mixed voices below clipping.
      const protection = this.context.createWaveShaper();
      const curve = new Float32Array(2049);
      for (let i = 0; i < curve.length; i++) {
        const x = i / (curve.length - 1) * 2 - 1;
        const magnitude = Math.abs(x);
        const safe = magnitude <= 0.7 ? magnitude : 0.7 + 0.18 * (1 - Math.exp(-(magnitude - 0.7) / 0.09)) / (1 - Math.exp(-0.3 / 0.09));
        curve[i] = Math.sign(x) * safe;
      }
      protection.curve = curve;
      this.master.connect(protection);
      protection.connect(this.context.destination);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (this.hidden) return;
    await this.context.resume();
    this.startWantedMusic();
  }

  play(id: CueId): void {
    const context = this.context;
    if (!context || !this.master || this.muted || this.hidden || context.state !== 'running') return;
    const buffer = this.buffer(id);
    const now = context.currentTime;
    if (!this.limiter.tryStart(id, now, cueDurations[id])) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => source.disconnect();
    source.start(now);
  }

  music(id: CueId): void {
    this.wantedMusic = id;
    this.startWantedMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, now, 0.015);
    }
    if (!muted) this.startWantedMusic();
  }

  private get hidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
  }

  private readonly onVisibilityChange = (): void => {
    const context = this.context;
    if (!context) return;
    if (this.hidden) {
      void context.suspend().catch(() => undefined);
    } else {
      void context.resume().then(() => this.startWantedMusic()).catch(() => undefined);
    }
  };

  private buffer(id: CueId): AudioBuffer {
    const existing = this.buffers.get(id);
    if (existing) return existing;
    const context = this.context;
    if (!context) throw new Error('Audio must be unlocked before creating buffers.');
    // Asset synthesis stays at the verified rate; Web Audio resamples for the device.
    const samples = renderCue(id, 44100);
    const buffer = context.createBuffer(1, samples.length, 44100);
    buffer.getChannelData(0).set(samples);
    this.buffers.set(id, buffer);
    return buffer;
  }

  private startWantedMusic(): void {
    const context = this.context;
    const id = this.wantedMusic;
    if (!id || id === this.currentMusic || !context || !this.master || this.muted || this.hidden || context.state !== 'running') return;
    const buffer = this.buffer(id);
    const now = context.currentTime;
    const crossfadeEnd = now + 0.6;
    for (const voice of this.musicVoices) {
      voice.volume.gain.cancelAndHoldAtTime(now);
      voice.volume.gain.linearRampToValueAtTime(0, crossfadeEnd);
      voice.source.stop(crossfadeEnd);
    }
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    volume.gain.setValueAtTime(0, now);
    volume.gain.linearRampToValueAtTime(0.55, crossfadeEnd);
    source.connect(volume);
    volume.connect(this.master);
    const voice = { source, volume };
    this.musicVoices.add(voice);
    source.onended = () => {
      source.disconnect();
      volume.disconnect();
      this.musicVoices.delete(voice);
    };
    source.start(now);
    this.currentMusic = id;
  }
}
