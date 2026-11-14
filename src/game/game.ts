import type { Input } from './input.ts';
import type { Sound } from './audio.ts';
import { RICHI_HEAD } from '../art/richi.ts';

// ---- tuning -------------------------------------------------------------

export const W = 320;
export const H = 180;
/** y of the ground surface (feet rest here) */
export const GROUND = 148;
export const PLAYER_X = 112;

const GRAVITY = 1500;
const JUMP_V = -430;
const DOUBLE_JUMP_V = -370;
const JUMP_CUT_V = -170; // releasing early clamps upward speed to this
const MAX_FALL = 640;
const COYOTE = 0.09;
const JUMP_BUFFER = 0.12;

const SPEED_START = 100;
const SPEED_MAX = 225;
const PX_PER_METER = 14;
const MAX_LIVES = 3;
const INVULN = 1.5;
const BERRY_POINTS = 10;

/** where Richi runs for each number of hearts left */
const RICHI_X = [PLAYER_X - 8, 62, 30, 2];

/** dedication shown on the title screen, e.g. 'FOR GIULIA' */
export const DEDICATION = '';

// ---- types --------------------------------------------------------------

export type Mode = 'title' | 'play' | 'caught' | 'over';
export type ObKind = 'stump' | 'rock' | 'cactus' | 'stingby';

interface ObDef {
  w: number;
  h: number;
  /** hitbox insets: left, top, right, bottom */
  inset: [number, number, number, number];
  extraSpeed: number;
}

const OBS: Record<ObKind, ObDef> = {
  stump: { w: 22, h: 19, inset: [5, 6, 5, 0], extraSpeed: 0 },
  rock: { w: 24, h: 16, inset: [5, 5, 5, 0], extraSpeed: 0 },
  cactus: { w: 20, h: 27, inset: [6, 5, 6, 0], extraSpeed: 0 },
  stingby: { w: 30, h: 26, inset: [6, 7, 5, 5], extraSpeed: 38 },
};

export interface Obstacle {
  kind: ObKind;
  x: number;
  y: number;
  baseY: number;
  t: number;
  phase: number;
}

export interface Pickup {
  kind: 'berry' | 'heart';
  x: number;
  y: number;
  t: number;
}

export interface Particle {
  kind: 'dust' | 'sparkle' | 'heart' | 'text';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  variant: number;
  text?: string;
}

export interface Deco {
  kind: 'tree0' | 'tree1' | 'bush' | 'flower0' | 'flower1' | 'flower2' | 'flower3' | 'tuft';
  x: number;
}

export interface Cloud {
  variant: number;
  x: number;
  y: number;
  speed: number;
}

type GoombaAnim = 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'hurt' | 'love';
type RichiAnim = 'idle' | 'run' | 'jump' | 'hug';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ---- game ---------------------------------------------------------------

export class Game {
  mode: Mode = 'title';
  paused = false;
  /** seconds since the current mode started */
  modeT = 0;
  time = 0;

  // world
  speed = 0;
  dist = 0;
  /** total scroll in px, never reset mid-session so the backdrop does not jump */
  scroll = 0;
  dayClock = 0;
  shake = 0;
  hitstop = 0;

  // score
  berries = 0;
  best = 0;
  newBest = false;
  lives = MAX_LIVES;
  private berryStreak = 0;
  private berryStreakT = 0;

  // goomba
  gx = PLAYER_X;
  gy = GROUND;
  private gvy = 0;
  grounded = true;
  private airJumps = 1;
  private coyote = 0;
  private buffer = 0;
  invuln = 0;
  private hurtT = 0;
  private landT = 0;
  private runT = 0;
  private stepT = 0;
  goombaAnim: GoombaAnim = 'idle';
  goombaFrame = 0;

  // richi
  rx = RICHI_X[3];
  ry = GROUND;
  private rvy = 0;
  private rT = 0;
  richiAnim: RichiAnim = 'idle';
  richiFrame = 0;
  hugging = false;
  private heartT = 0;

  // things
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  decos: Deco[] = [];
  clouds: Cloud[] = [];
  private nextSpawn = 0;
  private nextDeco = 0;
  private heartCooldown = 0;

  private readonly sound: Sound;

  constructor(sound: Sound) {
    this.sound = sound;
    try {
      this.best = Number(localStorage.getItem('goomba-run.best') ?? 0) || 0;
    } catch {
      this.best = 0;
    }
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ variant: i % 3, x: rand(0, W), y: rand(8, 62), speed: rand(3, 8) });
    }
    for (let x = 10; x < W + 60; x += rand(26, 70)) this.spawnDeco(x);
    this.nextDeco = 0;
  }

  get meters(): number {
    return Math.floor(this.dist / PX_PER_METER);
  }

  get score(): number {
    return this.meters + this.berries * BERRY_POINTS;
  }

  // ---- flow -------------------------------------------------------------

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
  }

  startRun(): void {
    this.setMode('play');
    this.paused = false;
    this.speed = SPEED_START;
    this.dist = 0;
    this.berries = 0;
    this.newBest = false;
    this.lives = MAX_LIVES;
    this.gy = GROUND;
    this.gvy = 0;
    this.grounded = true;
    this.airJumps = 1;
    this.invuln = 0;
    this.hurtT = 0;
    this.rx = Math.min(this.rx, -30);
    this.ry = GROUND;
    this.rvy = 0;
    this.hugging = false;
    this.obstacles = [];
    this.pickups = [];
    this.particles = [];
    this.nextSpawn = 170;
    this.heartCooldown = 0;
    this.sound.start();
    this.sound.music(true);
  }

  togglePause(): void {
    if (this.mode !== 'play') return;
    this.paused = !this.paused;
    this.sound.music(!this.paused);
  }

  // ---- update -----------------------------------------------------------

  update(dt: number, input: Input): void {
    if (input.pausePressed) this.togglePause();
    if (this.paused) {
      if (input.jumpPressed) this.togglePause();
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    this.time += dt;
    this.modeT += dt;
    this.shake = Math.max(0, this.shake - dt * 14);

    switch (this.mode) {
      case 'title':
        this.speed = 26;
        if (input.jumpPressed) this.startRun();
        break;
      case 'play':
        this.updatePlay(dt, input);
        break;
      case 'caught':
        this.updateCaught(dt);
        break;
      case 'over':
        this.speed = 0;
        this.hugBounce(dt, 0.4);
        if (input.jumpPressed && this.modeT > 0.45) this.startRun();
        break;
    }

    this.scroll += this.speed * dt;
    this.dayClock += dt;
    this.updateBackdrop(dt);
    this.updateRichi(dt);
    this.updateParticles(dt);
    this.animate(dt);
  }

  private updatePlay(dt: number, input: Input): void {
    const m = this.dist / PX_PER_METER;
    this.speed = SPEED_START + (SPEED_MAX - SPEED_START) * (1 - Math.exp(-m / 420));
    this.dist += this.speed * dt;

    // --- jump -------------------------------------------------------------
    this.buffer = input.jumpPressed ? JUMP_BUFFER : this.buffer - dt;
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    if (this.buffer > 0) {
      if (this.coyote > 0) {
        this.gvy = JUMP_V;
        this.grounded = false;
        this.coyote = 0;
        this.buffer = 0;
        this.airJumps = 1;
        this.sound.jump();
        this.puff(this.gx - 4, GROUND - 2, 3);
      } else if (this.airJumps > 0) {
        this.gvy = DOUBLE_JUMP_V;
        this.airJumps--;
        this.buffer = 0;
        this.sound.doubleJump();
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            kind: 'sparkle', x: this.gx + rand(-8, 8), y: this.gy - rand(0, 8),
            vx: rand(-30, 10), vy: rand(10, 50), life: 0, max: rand(0.25, 0.45), variant: 0,
          });
        }
      }
    }
    if (!this.grounded) {
      if (!input.jumpHeld && this.gvy < JUMP_CUT_V) this.gvy = JUMP_CUT_V;
      this.gvy = Math.min(MAX_FALL, this.gvy + GRAVITY * dt);
      this.gy += this.gvy * dt;
      if (this.gy >= GROUND) {
        this.gy = GROUND;
        this.gvy = 0;
        this.grounded = true;
        this.airJumps = 1;
        this.landT = 0.09;
        this.sound.land();
        this.puff(this.gx - 6, GROUND - 2, 2);
        this.puff(this.gx + 6, GROUND - 2, 2);
      }
    } else {
      // running dust
      this.stepT -= dt * (this.speed / SPEED_START);
      if (this.stepT <= 0) {
        this.stepT = 0.22;
        this.puff(this.gx - 8, GROUND - 1, 1);
      }
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.berryStreakT -= dt;
    if (this.berryStreakT <= 0) this.berryStreak = 0;
    this.heartCooldown -= dt;

    // --- world --------------------------------------------------------------
    if (this.dist >= this.nextSpawn) this.spawnPattern(m);
    this.moveThings(dt);

    // --- collisions ---------------------------------------------------------
    const px0 = this.gx - 6;
    const px1 = this.gx + 6;
    const py0 = this.gy - 17;
    const py1 = this.gy - 1;
    if (this.invuln <= 0) {
      for (const o of this.obstacles) {
        const d = OBS[o.kind];
        const x0 = o.x + d.inset[0];
        const y0 = o.y + d.inset[1];
        const x1 = o.x + d.w - d.inset[2];
        const y1 = o.y + d.h - d.inset[3];
        if (px0 < x1 && px1 > x0 && py0 < y1 && py1 > y0) {
          this.hit();
          break;
        }
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dx = p.x - this.gx;
      const dy = p.y - (this.gy - 10);
      if (dx * dx + dy * dy < 13 * 13) {
        this.pickups.splice(i, 1);
        this.collect(p);
      }
    }
  }

  private hit(): void {
    this.lives--;
    this.invuln = INVULN;
    this.hurtT = 0.4;
    this.shake = 5;
    this.hitstop = 0.07;
    this.sound.hit();
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        kind: 'sparkle', x: this.gx + rand(-6, 6), y: this.gy - rand(6, 18),
        vx: rand(-70, 70), vy: rand(-90, -20), life: 0, max: rand(0.3, 0.5), variant: 0,
      });
    }
    if (this.lives <= 0) {
      this.setMode('caught');
      this.sound.music(false);
      this.finishScore();
    }
  }

  private finishScore(): void {
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      try {
        localStorage.setItem('goomba-run.best', String(this.best));
      } catch {
        /* private mode: just keep it in memory */
      }
    }
  }

  private collect(p: Pickup): void {
    if (p.kind === 'berry') {
      this.berries++;
      this.berryStreak = this.berryStreakT > 0 ? this.berryStreak + 1 : 0;
      this.berryStreakT = 0.6;
      this.sound.berry(this.berryStreak);
      this.floatText(`+${BERRY_POINTS}`, p.x, p.y - 6);
    } else {
      this.sound.heart();
      if (this.lives < MAX_LIVES) {
        this.lives++;
        this.floatText('<', p.x, p.y - 8);
      } else {
        this.berries += 5;
        this.floatText(`+${BERRY_POINTS * 5}`, p.x, p.y - 8);
      }
      for (let i = 0; i < 6; i++) this.heartBurst(p.x, p.y);
    }
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        kind: 'sparkle', x: p.x + rand(-5, 5), y: p.y + rand(-5, 5),
        vx: rand(-40, 40), vy: rand(-60, -10), life: 0, max: rand(0.25, 0.45), variant: 0,
      });
    }
  }

  private updateCaught(dt: number): void {
    this.speed = Math.max(0, this.speed - dt * 420);
    // goomba plops back to the ground
    if (!this.hugging) {
      if (!this.grounded) {
        this.gvy = Math.min(MAX_FALL, this.gvy + GRAVITY * dt);
        this.gy += this.gvy * dt;
        if (this.gy >= GROUND) {
          this.gy = GROUND;
          this.grounded = true;
        }
      }
      // obstacles drift off so the hug has a clear stage
      for (const o of this.obstacles) o.x -= (this.speed + 60) * dt;
      for (const p of this.pickups) p.x -= (this.speed + 60) * dt;
      if (this.grounded && Math.abs(this.rx - RICHI_X[0]) < 2.5 && this.ry >= GROUND) {
        this.hugging = true;
        this.pickups = [];
        this.sound.caught();
        for (let i = 0; i < 10; i++) this.heartBurst(this.gx, this.gy - 30);
      }
    } else {
      this.hugBounce(dt, 0.14);
      if (this.modeT > 2.3) this.setMode('over');
    }
  }

  /** Richi bounces with the Goomba held overhead, hearts drifting up */
  private hugBounce(dt: number, heartEvery: number): void {
    const hop = Math.abs(Math.sin(this.time * 6)) * 3;
    this.ry = GROUND - hop;
    this.gx = this.rx + RICHI_HEAD.x;
    this.gy = this.ry + RICHI_HEAD.y;
    this.heartT -= dt;
    if (this.heartT <= 0) {
      this.heartT = heartEvery;
      this.heartBurst(this.gx + rand(-10, 10), this.gy - 16);
    }
  }

  // ---- spawning ---------------------------------------------------------

  private spawnPattern(m: number): void {
    const x = W + 24;
    const options: [string, number][] = [
      ['ground', 5],
      ['stingbyLow', m > 60 ? 2.5 : 0],
      ['pair', m > 140 ? 1.6 : 0],
      ['stingbyHigh', m > 180 ? 1.8 : 0],
    ];
    let roll = Math.random() * options.reduce((a, [, w]) => a + w, 0);
    let choice = 'ground';
    for (const [name, w] of options) {
      roll -= w;
      if (roll < 0) {
        choice = name;
        break;
      }
    }

    let extraGap = 0;
    const groundKind = () => pick<ObKind>(m < 40 ? ['stump', 'rock'] : ['stump', 'rock', 'cactus']);
    switch (choice) {
      case 'ground': {
        const o = this.addObstacle(groundKind(), x);
        if (Math.random() < 0.6) this.berryArc(o.x + OBS[o.kind].w / 2, 3);
        break;
      }
      case 'pair': {
        const a = this.addObstacle(pick<ObKind>(['stump', 'rock']), x);
        this.addObstacle(pick<ObKind>(['stump', 'rock', 'cactus']), x + OBS[a.kind].w + 6);
        this.berryArc(x + 26, 3, 8);
        extraGap = 40;
        break;
      }
      case 'stingbyLow': {
        this.addObstacle('stingby', x, GROUND - 27);
        break;
      }
      case 'stingbyHigh': {
        // hovers at jump height: stay on the ground, snack on the berries below
        const o = this.addObstacle('stingby', x, GROUND - 58);
        for (let i = 0; i < 3; i++) this.pickups.push({ kind: 'berry', x: o.x + i * 16, y: GROUND - 9, t: i * 0.2 });
        break;
      }
    }

    const gapTime = 1.5 - Math.min(m / 500, 1) * 0.7 + Math.random() * 0.8;
    const gap = this.speed * gapTime + extraGap;
    this.nextSpawn = this.dist + gap;

    // a floating heart, sometimes, when a life is missing
    if (this.lives < MAX_LIVES && this.heartCooldown <= 0 && Math.random() < 0.3) {
      this.pickups.push({ kind: 'heart', x: x + gap * 0.5, y: GROUND - 74, t: 0 });
      this.heartCooldown = 14;
    }
  }

  private addObstacle(kind: ObKind, x: number, y?: number): Obstacle {
    const d = OBS[kind];
    const baseY = y ?? GROUND + 1 - d.h;
    const o: Obstacle = { kind, x, y: baseY, baseY, t: 0, phase: Math.random() * 6 };
    this.obstacles.push(o);
    return o;
  }

  /** berries along the arc of a jump centred on cx */
  private berryArc(cx: number, n: number, lift = 0): void {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      this.pickups.push({ kind: 'berry', x: cx + u * 20, y: GROUND - 46 - lift + u * u * 12, t: i * 0.15 });
    }
  }

  private moveThings(dt: number): void {
    for (const o of this.obstacles) {
      o.t += dt;
      o.x -= (this.speed + OBS[o.kind].extraSpeed) * dt;
      if (o.kind === 'stingby') o.y = o.baseY + Math.sin(o.t * 5 + o.phase) * 3;
    }
    this.obstacles = this.obstacles.filter((o) => o.x > -40);
    for (const p of this.pickups) {
      p.t += dt;
      p.x -= this.speed * dt;
    }
    this.pickups = this.pickups.filter((p) => p.x > -20);
  }

  private spawnDeco(x: number): void {
    const r = Math.random();
    const kind: Deco['kind'] =
      r < 0.14 ? 'tree0' : r < 0.24 ? 'tree1' : r < 0.42 ? 'bush' : r < 0.8 ? pick(['flower0', 'flower1', 'flower2', 'flower3'] as const) : 'tuft';
    this.decos.push({ kind, x });
  }

  private updateBackdrop(dt: number): void {
    const dx = this.speed * dt;
    for (const d of this.decos) d.x -= dx;
    this.decos = this.decos.filter((d) => d.x > -50);
    this.nextDeco -= dx;
    if (this.nextDeco <= 0) {
      this.spawnDeco(W + 40);
      this.nextDeco = rand(26, 80);
    }
    for (const c of this.clouds) {
      c.x -= (c.speed + this.speed * 0.06) * dt;
      if (c.x < -70) {
        c.x = W + rand(10, 60);
        c.y = rand(8, 62);
        c.variant = Math.floor(rand(0, 3));
      }
    }
  }

  // ---- richi ------------------------------------------------------------

  private updateRichi(dt: number): void {
    this.rT += dt;
    if (this.hugging) return;

    let target: number;
    let follow = 2.4;
    if (this.mode === 'title') target = 34;
    else if (this.mode === 'caught') {
      target = RICHI_X[0];
      follow = 7;
    } else if (this.mode === 'over') target = this.rx;
    else target = RICHI_X[this.lives] + Math.sin(this.time * 1.7) * 3;
    this.rx += (target - this.rx) * Math.min(1, dt * follow);

    // hop over anything on the ground
    if (this.ry >= GROUND && this.mode === 'play') {
      for (const o of this.obstacles) {
        if (o.kind === 'stingby') continue;
        const lead = 30 + this.speed * 0.12;
        if (o.x < this.rx + lead + 10 && o.x + OBS[o.kind].w > this.rx + 4) {
          this.rvy = -400;
          break;
        }
      }
    }
    if (this.rvy !== 0 || this.ry < GROUND) {
      this.rvy += GRAVITY * dt;
      this.ry += this.rvy * dt;
      if (this.ry >= GROUND) {
        this.ry = GROUND;
        this.rvy = 0;
      }
    }
  }

  // ---- particles ----------------------------------------------------------

  private puff(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'dust', x: x + rand(-3, 3), y: y + rand(-2, 1),
        vx: rand(-34, -6), vy: rand(-22, -4), life: 0, max: rand(0.22, 0.4), variant: 0,
      });
    }
  }

  private heartBurst(x: number, y: number): void {
    this.particles.push({
      kind: 'heart', x, y, vx: rand(-26, 26), vy: rand(-60, -24),
      life: 0, max: rand(0.7, 1.2), variant: Math.random() < 0.5 ? 0 : 1,
    });
  }

  private floatText(text: string, x: number, y: number): void {
    this.particles.push({ kind: 'text', x, y, vx: 0, vy: -34, life: 0, max: 0.7, variant: 0, text });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.x += (p.vx - (p.kind === 'text' ? 0 : this.speed * 0.5)) * dt;
      p.y += p.vy * dt;
      if (p.kind === 'heart') p.x += Math.sin((p.life + p.max) * 9) * 14 * dt;
      if (p.kind === 'sparkle') p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ---- animation ----------------------------------------------------------

  private animate(dt: number): void {
    // goomba
    if (this.mode === 'title') {
      this.goombaAnim = 'idle';
      const k = Math.floor(this.time * 3) % 8;
      this.goombaFrame = k === 7 ? 2 : k % 2;
    } else if (this.hugging || this.mode === 'over') {
      this.goombaAnim = 'love';
      this.goombaFrame = Math.floor(this.time * 5) % 2;
    } else if (this.mode === 'caught' || this.hurtT > 0) {
      this.goombaAnim = 'hurt';
      this.goombaFrame = 0;
    } else if (!this.grounded) {
      this.goombaAnim = this.gvy < 60 ? 'jump' : 'fall';
      this.goombaFrame = 0;
    } else if (this.landT > 0) {
      this.goombaAnim = 'land';
      this.goombaFrame = 0;
    } else {
      this.goombaAnim = 'run';
      this.runT += dt * (0.7 + this.speed / 180);
      this.goombaFrame = Math.floor(this.runT * 15);
    }

    // richi
    if (this.hugging || this.mode === 'over') {
      this.richiAnim = 'hug';
      this.richiFrame = Math.floor(this.time * 5) % 2;
    } else if (this.mode === 'title') {
      this.richiAnim = 'idle';
      this.richiFrame = Math.floor(this.time * 2.2) % 5 === 4 ? 1 : 0;
    } else if (this.ry < GROUND) {
      this.richiAnim = 'jump';
      this.richiFrame = 0;
    } else {
      this.richiAnim = 'run';
      this.richiFrame = Math.floor(this.rT * 13);
    }
  }
}
