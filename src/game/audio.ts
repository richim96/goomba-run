// All sound is synthesised with WebAudio: no audio files, works offline.

type Wave = OscillatorType;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// 4 bars of eighth notes over C - G - Am - F
const LEAD = [
  76, 79, 84, 79, 76, 79, 84, 0,
  74, 79, 83, 79, 74, 79, 83, 0,
  76, 81, 84, 81, 76, 81, 84, 88,
  77, 81, 84, 81, 79, 77, 76, 74,
];
const BASS_ROOTS = [48, 43, 45, 41];
const STEP = 60 / 138 / 2;

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextStep = 0;
  private nextTime = 0;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
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

  private noise(dur: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  jump(): void {
    this.tone('square', 360, 640, 0.13, 0.07);
  }
  doubleJump(): void {
    this.tone('square', 520, 940, 0.13, 0.07);
    this.tone('triangle', 1040, 1560, 0.1, 0.05, 0.03);
  }
  land(): void {
    this.tone('triangle', 160, 90, 0.06, 0.08);
  }
  berry(streak = 0): void {
    const base = 84 + Math.min(streak, 7);
    this.tone('square', midi(base), midi(base), 0.06, 0.06);
    this.tone('square', midi(base + 7), midi(base + 7), 0.09, 0.06, 0.055);
  }
  heart(): void {
    [72, 76, 79, 84].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.14, 0.11, i * 0.07));
  }
  hit(): void {
    this.tone('sawtooth', 260, 60, 0.28, 0.11);
    this.noise(0.14, 0.12);
  }
  start(): void {
    [60, 64, 67, 72].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.1, 0.06, i * 0.06));
  }
  caught(): void {
    // "aww" slide, then a sweet little cadence
    this.tone('triangle', 520, 300, 0.3, 0.12);
    [67, 72, 76, 79, 84].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.22, 0.1, 0.4 + i * 0.11));
    [48, 55].forEach((n, i) => this.tone('triangle', midi(n), midi(n), 0.5, 0.1, 0.4 + i * 0.33));
  }

  music(on: boolean): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
    if (on && this.musicTimer === null) {
      this.nextStep = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.musicTimer = window.setInterval(() => this.schedule(), 60);
    } else if (!on && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    // if the tab was asleep, skip ahead instead of machine-gunning the backlog
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const i = this.nextStep % LEAD.length;
      const delay = this.nextTime - this.ctx.currentTime;
      const lead = LEAD[i];
      if (lead) this.tone('square', midi(lead), midi(lead), STEP * 0.9, 0.022, delay, this.musicGain);
      const root = BASS_ROOTS[Math.floor(i / 8)];
      const b = [root, 0, root + 12, 0, root, 0, root + 12, root + 7][i % 8];
      if (b) this.tone('triangle', midi(b), midi(b), STEP * 1.4, 0.07, delay, this.musicGain);
      this.nextStep++;
      this.nextTime += STEP;
    }
  }
}
