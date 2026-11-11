// Âm thanh sân vận động cho mini game Sút phạt đền, tổng hợp bằng Web Audio (không tải file âm thanh):
//   · nền: tiếng khán đài rì rào (nhiễu hồng lọc dải giọng nói, to nhỏ chậm) + giọng đám đông rất nhỏ;
//   · bóng chạm lưới "phập", dội cột / xà "keng", thủ môn bắt "bộp";
//   · KHÔNG có tiếng khán giả phản ứng khi vào / không vào (hò reo, vỗ tay, "ồồ"): người dùng bỏ ngày 2026-11-11, đừng thêm lại;
//   · chạm bóng: tiếng "bụp" ngắn.
// Trình duyệt chỉ cho phát sau thao tác của người chơi nên start() phải gọi trong sự kiện bấm (nút Bắt đầu / SÚT).
// Không có AudioContext (test, trình duyệt cũ) thì mọi hàm không làm gì.
type Ctx = AudioContext;
const AudioCtor = (): (new () => AudioContext) | null => typeof window === 'undefined' ? null : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext ?? null);

// Nhiễu hồng (Paul Kellet) dài vài giây, lặp được.
function pinkNoise(ctx: Ctx, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
    b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
  }
  return buffer;
}
// Đường bao âm lượng: lên tới peak sau attack, giữ, rồi tắt dần.
function envelope(param: AudioParam, t: number, peak: number, attack: number, hold: number, release: number) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(.0001, t + attack + hold + release);
}

export class CrowdAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private running = false;

  constructor(muted = false) { this.muted = muted; }

  // Tạo (lần đầu) và bật tiếng khán đài nền; gọi trong sự kiện bấm của người chơi.
  start() {
    const Ctor = AudioCtor();
    if (!Ctor) return;
    if (!this.ctx) {
      try { this.ctx = new Ctor(); } catch { return; }
      const ctx = this.ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(ctx.destination);
      this.noise = pinkNoise(ctx, 4);
      this.buildAmbience();
    }
    void this.ctx.resume().catch(() => {});
    this.running = true;
    if (this.ambience) { const t = this.ctx.currentTime; this.ambience.gain.cancelScheduledValues(t); this.ambience.gain.setTargetAtTime(.9, t, .6); }
  }
  // Tắt dần tiếng nền (rời trang / tab ẩn); start() để bật lại.
  pause() {
    if (!this.ctx || !this.ambience) return;
    this.running = false;
    this.ambience.gain.setTargetAtTime(0, this.ctx.currentTime, .25);
    const ctx = this.ctx;
    setTimeout(() => { if (!this.running && ctx.state === 'running') void ctx.suspend().catch(() => {}); }, 900);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, .08);
  }
  dispose() { this.running = false; void this.ctx?.close().catch(() => {}); this.ctx = null; }

  private buildAmbience() {
    const ctx = this.ctx!, out = ctx.createGain();
    out.gain.value = 0; out.connect(this.master!); this.ambience = out;
    // Rì rào: nhiễu hồng lọc dải giọng nói, âm lượng lên xuống chậm.
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 650; band.Q.value = .55;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 2400;
    const level = ctx.createGain(); level.gain.value = .34;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain(); lfo.frequency.value = .13; lfoGain.gain.value = .1; lfo.connect(lfoGain).connect(level.gain);
    src.connect(band).connect(low).connect(level).connect(out);
    src.start(); lfo.start();
    // Giọng đám đông rất nhỏ (nhiều giọng trầm qua bộ lọc nguyên âm) cho có chất "người".
    const voices = this.voices(ctx.currentTime, 10, [140, 240], [[500, 5], [1100, 7]], .06, Infinity);
    voices.connect(out);
  }

  // Nhiều giọng răng cưa lệch nhau, rung nhẹ, qua các bộ lọc nguyên âm (formant). duration = Infinity để chạy mãi.
  private voices(t: number, count: number, range: [number, number], formants: [number, number][], level: number, duration: number, glide = 1) {
    const ctx = this.ctx!, mix = ctx.createGain(); mix.gain.value = level;
    const bus = ctx.createGain(); bus.gain.value = 1 / Math.sqrt(count);
    for (const [freq, q] of formants) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; bus.connect(f).connect(mix); }
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator(), vib = ctx.createOscillator(), vibGain = ctx.createGain();
      const base = range[0] + Math.random() * (range[1] - range[0]);
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(base, t);
      if (glide !== 1 && Number.isFinite(duration)) osc.frequency.exponentialRampToValueAtTime(base * glide, t + duration * .8);
      vib.frequency.value = 4.5 + Math.random() * 2.5; vibGain.gain.value = base * .015; vib.connect(vibGain).connect(osc.frequency);
      osc.connect(bus); osc.start(t); vib.start(t);
      if (Number.isFinite(duration)) { osc.stop(t + duration + .1); vib.stop(t + duration + .1); }
    }
    return mix;
  }
  private noiseBurst(t: number, filter: { type: BiquadFilterType; from: number; to: number; q: number }, peak: number, attack: number, hold: number, release: number, buffer = this.noise) {
    const ctx = this.ctx!, src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filter.type; f.Q.value = filter.q;
    f.frequency.setValueAtTime(filter.from, t); f.frequency.exponentialRampToValueAtTime(filter.to, t + attack + hold * .5);
    const g = ctx.createGain(); envelope(g.gain, t, peak, attack, hold, release);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 2); src.stop(t + attack + hold + release + .1);
  }

  // Tiếng chân chạm bóng.
  kick() {
    if (!this.ctx || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(48, t + .14);
    envelope(g.gain, t, .55, .004, .02, .16);
    osc.connect(g).connect(this.master!); osc.start(t); osc.stop(t + .3);
    this.noiseBurst(t, { type: 'bandpass', from: 900, to: 700, q: 1.2 }, .1, .002, .008, .05);
  }
  // Bóng chạm lưới: tiếng "phập" trầm + lưới rung nhẹ (nhiễu chỉ ở dải thấp, ngắn).
  netHit() {
    if (!this.ctx || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(115, t); osc.frequency.exponentialRampToValueAtTime(55, t + .2);
    envelope(g.gain, t, .5, .004, .03, .22); osc.connect(g).connect(this.master!); osc.start(t); osc.stop(t + .35);
    this.noiseBurst(t, { type: 'lowpass', from: 900, to: 350, q: .7 }, .3, .006, .05, .35);
  }
  // Dội cột / xà: tiếng "keng" kim loại ngân (các họa âm không hài hòa tắt dần).
  postHit() {
    if (!this.ctx || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    ([[520, .32, 1.3], [1342, .2, .95], [2416, .11, .6], [3610, .05, .4]] as const).forEach(([freq, peak, decay]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; envelope(g.gain, t, peak, .002, .01, decay);
      osc.connect(g).connect(this.master!); osc.start(t); osc.stop(t + decay + .1);
    });
    this.noiseBurst(t, { type: 'bandpass', from: 2500, to: 2500, q: 2 }, .08, .001, .005, .03);
  }
  // Thủ môn bắt / đẩy bóng: tiếng "bộp" găng tay.
  save() {
    if (!this.ctx || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(170, t); osc.frequency.exponentialRampToValueAtTime(80, t + .12);
    envelope(g.gain, t, .4, .003, .02, .12); osc.connect(g).connect(this.master!); osc.start(t); osc.stop(t + .25);
    this.noiseBurst(t, { type: 'bandpass', from: 900, to: 650, q: 1.1 }, .4, .002, .02, .1);
  }
}

export const PENALTY_SOUND_KEY = 'fco-penalty-sound';
export const savedPenaltyMute = () => { try { return localStorage.getItem(PENALTY_SOUND_KEY) === 'off'; } catch { return false; } };
export const savePenaltyMute = (muted: boolean) => { try { localStorage.setItem(PENALTY_SOUND_KEY, muted ? 'off' : 'on'); } catch { /* chỉ nhớ trong phiên này */ } };
