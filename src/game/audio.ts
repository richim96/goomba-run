// All sound is synthesised with WebAudio: no audio files, works offline.

type Wave = OscillatorType;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// The tune: a slow, cosy walk in G major, 32 bars of eighth notes (A A' B A').
// 0 lets the previous note ring. It stays in the middle of the keyboard with
// long notes and rests, and every strong beat lands on a chord tone.
// prettier-ignore
const A_START = [
  71, 0, 0, 74, 0, 0, 71, 0,   69, 0, 0, 0, 66, 0, 69, 0,
  67, 0, 0, 71, 0, 0, 67, 0,   64, 0, 0, 0, 67, 0, 64, 0,
  62, 0, 67, 0, 71, 0, 0, 0,   69, 0, 0, 66, 69, 0, 0, 0,
];
// prettier-ignore
const LEAD = [
  ...A_START,   67, 0, 64, 0, 67, 0, 72, 0,   69, 0, 0, 0, 0, 0, 0, 0, // A  : ends open, on D
  ...A_START,   67, 0, 64, 0, 72, 0, 71, 0,   67, 0, 0, 0, 0, 0, 0, 0, // A' : comes home to G
  76, 0, 0, 74, 0, 71, 0, 0,   72, 0, 0, 0, 64, 0, 67, 0,              // B  : a little higher and wistful
  74, 0, 0, 71, 0, 67, 0, 0,   69, 0, 0, 0, 0, 0, 66, 0,
  67, 0, 71, 0, 76, 0, 0, 0,   74, 0, 72, 0, 0, 0, 67, 0,
  69, 0, 0, 71, 0, 0, 69, 0,   66, 0, 0, 0, 0, 0, 0, 0,
  ...A_START,   67, 0, 64, 0, 72, 0, 71, 0,   67, 0, 0, 0, 0, 0, 0, 0, // A'
];
// one chord per bar: [bass note, three notes for the soft plucked pattern]
const G = [43, 55, 59, 62];
const D = [50, 54, 57, 62];
const D_F = [42, 54, 57, 62]; // D with F sharp in the bass, to step down smoothly
const EM = [40, 52, 55, 59];
const C = [48, 52, 55, 60];
const A_CHORDS = [G, D_F, EM, C, G, D];
const CHORDS = [
  ...A_CHORDS, C, D,
  ...A_CHORDS, C, G,
  EM, C, G, D, EM, C, D, D,
  ...A_CHORDS, C, G,
];
const BPM_SLOW = 136;
const BPM_FAST = 168;
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
      // the music goes through a low-pass filter: it takes the sharp edge off
      const warm = this.ctx.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 1700;
      warm.Q.value = 0.4;
      this.musicGain.connect(warm);
      warm.connect(this.master);
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
  /** Richi boots something out of his way: a thump, then it whistles off (up and away, or down and out) */
  kick(far: boolean): void {
    this.tone('triangle', 190, 70, 0.08, 0.08);
    this.noise(0.04, 0.04, 'highpass', 2600);
    if (far) this.tone('sine', 700, 1900, 0.3, 0.022, 0.03);
    else this.tone('sine', 900, 260, 0.34, 0.022, 0.03);
  }
  /** ... punches a Stingby over the hills */
  punch(): void {
    this.tone('square', 250, 90, 0.07, 0.07);
    this.noise(0.05, 0.05, 'highpass', 2200);
    this.tone('sine', 800, 2100, 0.3, 0.022, 0.03);
  }
  /** ... or flattens one */
  smash(): void {
    this.tone('square', 210, 55, 0.11, 0.07);
    this.noise(0.09, 0.08, 'lowpass', 900);
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
    this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.08);
    if (on && this.musicTimer === null) {
      this.nextStep = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      this.musicTimer = window.setInterval(() => this.schedule(), 50);
    } else if (!on && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** a soft note for the music: eases in, holds, then fades, instead of the clicky game blips */
  private soft(wave: Wave, note: number, dur: number, vol: number, delay: number, cents = 0): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midi(note);
    osc.detune.value = cents;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.03, dur * 0.3);
    g.gain.setTargetAtTime(0, t + dur * 0.75, dur * 0.18);
    osc.connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur * 1.8 + 0.1);
  }

  /** queue every note that starts in the next 200 ms */
  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    // if the tab was asleep, skip ahead instead of machine-gunning the backlog
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const step = 60 / (BPM_SLOW + (BPM_FAST - BPM_SLOW) * this.tempoK) / 2;
      const i = this.nextStep % LEAD.length;
      const beat = i % 8;
      const delay = Math.max(0, this.nextTime - this.ctx.currentTime);
      const [bass, low, mid, high] = CHORDS[Math.floor(i / 8)];

      // melody: two slightly detuned voices, which sounds warmer than one
      const note = LEAD[i];
      if (note) {
        let len = 1;
        while (len < 8 && LEAD[(i + len) % LEAD.length] === 0) len++;
        this.soft('triangle', note, step * len, 0.075, delay, -5);
        this.soft('sine', note, step * len, 0.04, delay, 6);
      }

      // a quiet plucked pattern underneath, like a small guitar
      const pluck = [low, mid, high, mid, low, high, mid, high][beat];
      this.soft('triangle', pluck, step * 1.6, beat % 2 === 0 ? 0.03 : 0.02, delay);

      // bass: one long note per half bar
      if (beat === 0) this.soft('sine', bass, step * 4, 0.1, delay);
      else if (beat === 4) this.soft('sine', bass, step * 3.5, 0.07, delay);

      this.nextStep++;
      this.nextTime += step;
    }
  }
}
