// All sound is synthesised with WebAudio: no audio files, works offline.

type Wave = OscillatorType;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// The tune: 16 bars of eighth notes in C major (A A' B B'). 0 lets the previous
// note ring. Strong beats always land on a chord tone, so it cannot sour.
// prettier-ignore
const LEAD = [
  76, 0, 79, 0, 84, 0, 79, 76,   74, 0, 79, 0, 83, 0, 79, 74,
  72, 0, 76, 0, 81, 0, 76, 72,   81, 79, 77, 0, 81, 0, 84, 0,
  76, 0, 79, 0, 84, 0, 88, 0,    86, 0, 83, 0, 79, 0, 83, 86,
  84, 0, 81, 0, 77, 0, 81, 0,    83, 0, 86, 0, 79, 81, 83, 0,
  84, 0, 0, 83, 81, 0, 76, 0,    83, 0, 0, 81, 79, 0, 76, 0,
  81, 0, 0, 79, 77, 0, 81, 0,    79, 0, 76, 0, 72, 0, 76, 79,
  81, 0, 84, 0, 89, 0, 84, 81,   83, 0, 86, 0, 91, 0, 86, 83,
  84, 0, 79, 0, 76, 0, 79, 0,    84, 0, 0, 0, 79, 81, 83, 0,
];
// bass root for each bar:  C   G   Am  F   C   G   F   G   Am  Em  F   C   F   G   C   C
const ROOTS = [48, 43, 45, 41, 48, 43, 41, 43, 45, 40, 41, 48, 41, 43, 48, 48];
const BPM_SLOW = 132;
const BPM_FAST = 158;
/** overall loudness; a limiter after it keeps overlapping sounds from clipping */
const VOLUME = 2.2;

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private nextStep = 0;
  private nextTime = 0;
  private tempoK = 0;

  /** call from any user gesture: creates the context, or wakes it if the browser suspended it */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : VOLUME, this.ctx.currentTime, 0.02);
  }

  /** 0 = start of a run, 1 = flat out: the music speeds up with the chase */
  tempo(k: number): void {
    this.tempoK = Math.max(0, Math.min(1, k));
  }

  private tone(wave: Wave, f0: number, f1: number, dur: number, vol: number, delay = 0, out?: AudioNode): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out ?? this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, delay = 0, out?: AudioNode): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out ?? this.master);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  // ---- effects ------------------------------------------------------------

  jump(): void {
    this.tone('square', 360, 640, 0.13, 0.1);
  }
  doubleJump(): void {
    this.tone('square', 520, 940, 0.13, 0.1);
    this.tone('triangle', 1040, 1560, 0.1, 0.08, 0.03);
  }
  land(): void {
    this.tone('triangle', 160, 90, 0.06, 0.1);
  }
  berry(streak = 0): void {
    const base = 84 + Math.min(streak, 7);
    this.tone('square', midi(base), midi(base), 0.06, 0.08);
    this.tone('square', midi(base + 7), midi(base + 7), 0.09, 0.08, 0.055);
  }
  heart(): void {
    [72, 76, 79, 84].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.14, 0.11, i * 0.07));
  }
  hit(): void {
    this.tone('sawtooth', 260, 60, 0.28, 0.11);
    this.noise(0.14, 0.12, 'lowpass', 1800);
  }
  start(): void {
    [60, 64, 67, 72].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.1, 0.08, i * 0.06));
  }
  milestone(): void {
    this.tone('triangle', midi(79), midi(79), 0.12, 0.1);
    this.tone('triangle', midi(84), midi(84), 0.2, 0.1, 0.09);
  }
  caught(): void {
    // "aww" slide, then a sweet little cadence
    this.tone('triangle', 520, 300, 0.3, 0.12);
    [67, 72, 76, 79, 84].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.22, 0.1, 0.4 + i * 0.11));
    [48, 55].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.5, 0.1, 0.4 + i * 0.33));
  }
  newBest(): void {
    [72, 76, 79, 84, 79, 84, 88].forEach((n, i) =>
      this.tone('square', midi(n), midi(n), i === 6 ? 0.5 : 0.1, 0.05, i * 0.085),
    );
    this.tone('triangle', midi(48), midi(48), 0.7, 0.1, 0.5);
  }

  // ---- music --------------------------------------------------------------

  music(on: boolean): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.08);
    if (on && this.musicTimer === null) {
      this.nextStep = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      this.musicTimer = window.setInterval(() => this.schedule(), 50);
    } else if (!on && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** queue every note that starts in the next 200 ms */
  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    const out = this.musicGain;
    // if the tab was asleep, skip ahead instead of machine-gunning the backlog
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const step = 60 / (BPM_SLOW + (BPM_FAST - BPM_SLOW) * this.tempoK) / 2;
      const i = this.nextStep % LEAD.length;
      const beat = i % 8;
      const delay = Math.max(0, this.nextTime - this.ctx.currentTime);

      const note = LEAD[i];
      if (note) {
        let len = 1;
        while (len < 4 && LEAD[(i + len) % LEAD.length] === 0) len++;
        const f = midi(note);
        this.tone('triangle', f, f, step * len * 0.95, 0.05, delay, out);
        this.tone('square', f, f, step * 0.5, 0.009, delay, out);
      }

      const root = ROOTS[Math.floor(i / 8)];
      const bass = [root, 0, root + 12, 0, root, 0, root + 12, root + 7][beat];
      if (bass) this.tone('triangle', midi(bass), midi(bass), step * 1.5, 0.075, delay, out);

      if (beat === 0 || beat === 4) this.tone('sine', 120, 45, 0.11, 0.11, delay, out);
      else if (beat === 2 || beat === 6) this.noise(0.07, 0.028, 'bandpass', 1800, delay, out);
      else this.noise(0.025, 0.012, 'highpass', 7000, delay, out);

      this.nextStep++;
      this.nextTime += step;
    }
  }
}
