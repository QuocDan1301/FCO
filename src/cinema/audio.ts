import { AUDIO_ENABLED } from '../config';
import { asset } from '../asset';

const paths = {
  crowd: asset('/assets/cinema-crowd.wav'), cue: asset('/assets/cinema-cue.wav'), gate: asset('/assets/cinema-gate.wav'), impact: asset('/assets/cinema-impact.wav'), cheer: asset('/assets/cinema-cheer.wav'),
};
let context: AudioContext | undefined;
const cached = new Map<string, AudioBuffer>();
export function unlockCinemaAudio(enabled: boolean) {
  if (!AUDIO_ENABLED || !enabled) return;
  try { context ??= new AudioContext(); void context.resume().catch(() => {}); } catch { /* Thiết bị không có âm thanh vẫn chơi được. */ }
}
export class OpeningAudio {
  private gain?: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private active = true;
  private lastPhase = -1;
  private enabled = false;
  private ambientStarted = false;
  constructor() {
    if (!AUDIO_ENABLED) return;
    try {
      context ??= new AudioContext();
      this.gain = context.createGain(); this.gain.gain.value = 0;
      const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -18; limiter.ratio.value = 5;
      this.gain.connect(limiter); limiter.connect(context.destination);
      void Promise.all(Object.entries(paths).map(async ([key, url]) => {
        if (cached.has(key)) return;
        const response = await fetch(url); const bytes = await response.arrayBuffer();
        const buffer = await context!.decodeAudioData(bytes); cached.set(key, buffer);
      })).then(() => { if (this.active && this.enabled && this.lastPhase < 9) this.ambient(); }).catch(() => {});
    } catch { /* Âm thanh không chặn hoạt cảnh. */ }
  }
  private play(key: keyof typeof paths, volume = 1, loop = false) {
    if (!context || !this.gain || !this.active || !cached.has(key)) return;
    const source = context.createBufferSource(); const gain = context.createGain();
    source.buffer = cached.get(key)!; source.loop = loop; gain.gain.value = volume;
    source.connect(gain); gain.connect(this.gain); this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }
  private ambient() { if (!this.ambientStarted && cached.has('crowd')) { this.ambientStarted = true; this.play('crowd', .45, true); } }
  setEnabled(enabled: boolean) {
    enabled = AUDIO_ENABLED && enabled;
    this.enabled = enabled;
    if (!context || !this.gain) return;
    this.gain.gain.setTargetAtTime(enabled && !document.hidden && this.lastPhase !== 6 ? .55 : 0, context.currentTime, .08);
    if (enabled) { void context.resume().catch(() => {}); if (this.lastPhase < 9) this.ambient(); }
  }
  cue(phase: number) {
    if (!AUDIO_ENABLED) return;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    if (phase === 6) {
      // Le silence avant le reveal est une vraie coupure du fond sonore.
      if (context && this.gain) this.gain.gain.setTargetAtTime(0, context.currentTime, .06);
      return;
    }
    this.setEnabled(this.enabled);
    if ([2, 3, 4, 5].includes(phase)) this.play('cue', .6);
    if (phase === 7) this.play('gate', .75);
    if (phase === 9) { this.play('impact', .65); this.play('cheer', .75); }
  }
  dispose() { this.active = false; this.sources.forEach(source => { try { source.stop(); } catch { /* Déjà terminé. */ } }); this.sources.clear(); this.gain?.disconnect(); }
}
