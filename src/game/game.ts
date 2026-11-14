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

const SPEED_START = 105;
/** reached around 1200 m; after that it only creeps up */
const SPEED_MAX = 220;
const SPEED_CREEP_FROM = 1200; // metres
const SPEED_CREEP = 0.03; // px/s per metre past that
const SPEED_CREEP_MAX = 60;
const PX_PER_METER = 14;
const MAX_LIVES = 3;
const INVULN = 1.5;
const BERRY_POINTS = 10;
// Richi clears his own path: scenery gets kicked away, Stingbies get punched
// away (the high ones) or smashed flat (the low ones)
const KICK_REACH = 20; // px ahead of him where his foot connects
const PUNCH_REACH = 24; // ... where his fist lands at full stretch
const SMASH_REACH = 18; // ... and where it comes down, low in front of him
const KICK_LEAD = 0.1; // seconds of wind-up before the blow lands
const FIST_LEAD = 0.16;
/** a Stingby flying above this line is punched, one below it is smashed */
const PUNCH_ABOVE = GROUND - 40;
const BLOW_TIME = 0.2; // how long he holds the pose afterwards
/** chance a kicked thing sails off to the horizon; otherwise it flips over and drops off the screen */
const FAR_CHANCE = { stump: 0.5, rock: 0.3, cactus: 0.65 };
/** seconds a kicked thing takes to shrink into the distance */
export const FAR_TIME = 0.85;
/** height of the flattened Stingby sprite */
const FLAT_H = 14;
// the catch celebration: Richi tosses the Goomba up and catches it, over and over
const TOSS_PERIOD = 1.15; // seconds per toss
const TOSS_AIR = 0.6; // share of that spent in the air
const TOSS_HEIGHT = 18; // px

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
  hint?: string;
}

/** something Richi has dealt with: it can no longer hurt anyone, it only has to leave */
export interface Debris {
  kind: ObKind;
  /** far: shrinks away to the horizon (kicked scenery, punched Stingbies); drop: flips and falls off the screen; squash: a flattened Stingby */
  fate: 'far' | 'drop' | 'squash';
  /** centre */
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  /** turns per second */
  spin: number;
  /** a squashed Stingby that has reached the ground */
  flat: boolean;
}

export interface Pickup {
  kind: 'berry' | 'heart';
  x: number;
  y: number;
  t: number;
}

export interface Particle {
  kind: 'dust' | 'sparkle' | 'heart' | 'text' | 'impact' | 'twinkle';
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
type RichiAnim = 'run' | 'kick' | 'smash' | 'wind' | 'punch' | 'hug';

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
  private rT = 0;
  /** seconds left of the pose he holds after a kick / after throwing his fist */
  private kickT = 0;
  private fistT = 0;
  private fistBlow: 'punch' | 'slam' = 'punch';
  /** something is about to reach his foot / his fist: he winds up */
  private kickSoon = false;
  private fistSoon = false;
  /** ... and that something is flying high (a punch) rather than low (a smash) */
  private fistSoonHigh = false;
  richiAnim: RichiAnim = 'run';
  richiFrame = 0;
  hugging = false;
  /** 0..1 while Richi lifts the Goomba overhead */
  private hugT = 0;
  private hugFromX = PLAYER_X;
  /** seconds since the Goomba settled in his hands */
  private tossT = 0;
  private heartT = 0;

  // messages
  /** big centred message (distance milestones) and its age in seconds */
  banner: { text: string; t: number } | null = null;
  private nextMilestone = 100;
  private lowHints = 2;
  /** set by the shell so the HUD can show the right wording and sound state */
  touch = false;
  muted = false;

  // things
  obstacles: Obstacle[] = [];
  debris: Debris[] = [];
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
    // No teleporting: the Goomba drops from wherever it is (Richi's hands, after
    // a catch) and bolts, and Richi falls behind from where he stands.
    this.grounded = this.gy >= GROUND;
    this.gvy = 0;
    this.airJumps = 1;
    this.invuln = 0;
    this.hurtT = 0;
    this.kickT = 0;
    this.fistT = 0;
    this.hugging = false;
    this.hugT = 0;
    this.particles = [];
    // whatever was left standing goes up in a puff
    for (const o of this.obstacles) {
      if (o.x < W) this.puff(o.x + OBS[o.kind].w / 2 + 6, o.y + OBS[o.kind].h / 2, 5);
    }
    for (const d of this.debris) if (d.flat) this.puff(d.x + 6, d.y, 4);
    this.obstacles = [];
    this.debris = [];
    this.pickups = [];
    this.nextSpawn = 170;
    this.nextMilestone = 100;
    this.banner = null;
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
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 1.7) this.banner = null;
    }

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
    this.updateDebris(dt);
    this.updateParticles(dt);
    this.animate(dt);
  }

  private updatePlay(dt: number, input: Input): void {
    const m = this.dist / PX_PER_METER;
    this.speed =
      SPEED_START +
      (SPEED_MAX - SPEED_START) * (1 - Math.exp(-m / 380)) +
      Math.min(SPEED_CREEP_MAX, Math.max(0, m - SPEED_CREEP_FROM) * SPEED_CREEP);
    this.dist += this.speed * dt;
    this.gx += (PLAYER_X - this.gx) * Math.min(1, dt * 8);
    this.sound.tempo((this.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START));
    if (m >= this.nextMilestone) {
      this.banner = { text: `${this.nextMilestone} M`, t: 0 };
      this.nextMilestone += this.nextMilestone >= 500 ? 250 : 100;
      this.sound.milestone();
    }

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
    } else if (this.grounded) {
      // ouch-hop: knocked off its feet for a moment
      this.gvy = -210;
      this.grounded = false;
      this.coyote = 0;
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
      const arrived = this.grounded && Math.abs(this.rx - RICHI_X[0]) < 2.5;
      if (arrived || this.modeT > 3) {
        this.hugging = true;
        this.hugT = 0;
        this.tossT = 0;
        this.hugFromX = this.gx;
        this.gy = GROUND;
        this.grounded = true;
        this.pickups = [];
        this.sound.caught();
        // a burst of hearts above them, spread out so they do not pile up on his face
        for (let i = 0; i < 10; i++) this.heartBurst(this.gx + rand(-18, 18), GROUND - 58 - rand(0, 26));
      }
    } else {
      this.hugT = Math.min(1, this.hugT + dt / 0.3);
      this.hugBounce(dt, 0.14);
      if (this.modeT > 2.7) {
        this.setMode('over');
        if (this.newBest) {
          this.sound.newBest();
          for (let i = 0; i < 14; i++) {
            this.particles.push({
              kind: 'sparkle', x: W - 94 + rand(-70, 70), y: 30 + rand(0, 60),
              vx: rand(-20, 20), vy: rand(-50, -10), life: 0, max: rand(0.5, 1), variant: 0,
            });
          }
        }
      }
    }
  }

  /** Richi bounces with the Goomba held overhead, hearts drifting up */
  private hugBounce(dt: number, heartEvery: number): void {
    // scooped up from the ground into his raised hands, then tossed and caught
    let up = 0;
    if (this.hugT >= 1) {
      this.tossT += dt;
      const u = this.tossPhase();
      if (u < TOSS_AIR) up = 4 * TOSS_HEIGHT * (u / TOSS_AIR) * (1 - u / TOSS_AIR);
    }
    const k = 1 - (1 - this.hugT) ** 3;
    this.gx = this.hugFromX + (this.rx + RICHI_HEAD.x - this.hugFromX) * k;
    this.gy = GROUND + RICHI_HEAD.y * k - up;
    this.heartT -= dt;
    if (this.heartT <= 0) {
      this.heartT = heartEvery;
      this.heartBurst(this.gx + rand(-10, 10), this.gy - 16);
    }
  }

  /** 0..1 through the current toss: in the air until TOSS_AIR, then resting in his hands */
  private tossPhase(): number {
    return (this.tossT % TOSS_PERIOD) / TOSS_PERIOD;
  }

  // ---- spawning ---------------------------------------------------------

  private spawnPattern(m: number): void {
    const x = W + 24;
    // each pattern unlocks at a distance, so a run keeps showing something new
    const options: [string, number][] = [
      ['ground', 5],
      ['stingbyLow', m > 60 ? 2.5 : 0],
      ['pair', m > 140 ? 1.6 : 0],
      ['stingbyHigh', m > 180 ? 1.8 : 0],
      ['duckHop', m > 450 ? 1.4 : 0],
      ['triple', m > 700 ? 1.1 : 0],
      ['twoBees', m > 950 ? 1.2 : 0],
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
    const small = () => pick<ObKind>(['stump', 'rock']);
    const groundKind = () => pick<ObKind>(m < 40 ? ['stump', 'rock'] : ['stump', 'rock', 'cactus']);
    const highBee = (at: number) => {
      const o = this.addObstacle('stingby', at, GROUND - 58);
      if (this.lowHints > 0) {
        o.hint = 'STAY LOW!';
        this.lowHints--;
      }
      return o;
    };
    switch (choice) {
      case 'ground': {
        const o = this.addObstacle(groundKind(), x);
        if (Math.random() < 0.6) this.berryArc(o.x + OBS[o.kind].w / 2, 3);
        break;
      }
      case 'pair': {
        const a = this.addObstacle(small(), x);
        this.addObstacle(groundKind(), x + OBS[a.kind].w + 6);
        this.berryArc(x + 26, 3, 8);
        extraGap = 40;
        break;
      }
      case 'triple': {
        // a long jump: three in a row, only once the run is fast enough to clear them
        let at = x;
        for (let i = 0; i < 3; i++) at += OBS[this.addObstacle(small(), at).kind].w + 4;
        this.berryArc((x + at) / 2, 5, 10);
        extraGap = 70;
        break;
      }
      case 'stingbyLow': {
        this.addObstacle('stingby', x, GROUND - 27);
        break;
      }
      case 'stingbyHigh': {
        // hovers at jump height: stay on the ground, snack on the berries below
        const o = highBee(x);
        for (let i = 0; i < 3; i++) this.pickups.push({ kind: 'berry', x: o.x + i * 16, y: GROUND - 9, t: i * 0.2 });
        break;
      }
      case 'duckHop': {
        // stay low under the Stingby, then hop what was hiding behind it
        highBee(x);
        const o = this.addObstacle(groundKind(), x + 34);
        this.berryArc(o.x + OBS[o.kind].w / 2, 3);
        extraGap = 50;
        break;
      }
      case 'twoBees': {
        // one to jump and one to stay under, in either order, about half a second apart
        const apart = (this.speed + OBS.stingby.extraSpeed) * 0.55;
        const lowFirst = Math.random() < 0.5;
        this.addObstacle('stingby', lowFirst ? x : x + apart, GROUND - 27);
        highBee(lowFirst ? x + apart : x);
        extraGap = apart;
        break;
      }
    }

    // breathing room shrinks over the first 1400 m, and gets more regular
    const late = Math.min(1, m / 1400);
    const gapTime = 1.45 - 0.7 * late + Math.random() * (0.8 - 0.35 * late);
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
      if (o.kind === 'stingby') {
        o.y = o.baseY + Math.sin(o.t * 5 + o.phase) * 3;
        // past the Goomba: the warning has done its job (Richi deals with the rest)
        if (o.x + OBS.stingby.w < this.gx - 10) o.hint = undefined;
      }
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
    const pace = Math.max(0, Math.min(1, (this.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START)));
    this.rT += dt * (this.mode === 'title' ? 0.7 : 1.4 + 0.6 * pace);
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

    // He never breaks stride for what is in his way: whatever reaches him is
    // kicked off (scenery), punched away or smashed (Stingbies), and stops being
    // an obstacle.
    this.kickT = Math.max(0, this.kickT - dt);
    this.fistT = Math.max(0, this.fistT - dt);
    this.kickSoon = false;
    this.fistSoon = false;
    if (this.mode !== 'play' && this.mode !== 'caught') return;
    const left: Obstacle[] = [];
    for (const o of this.obstacles) {
      const d = OBS[o.kind];
      const bee = o.kind === 'stingby';
      const reach = !bee ? KICK_REACH : o.baseY < PUNCH_ABOVE ? PUNCH_REACH : SMASH_REACH;
      const gap = o.x + d.inset[0] - (this.rx + reach);
      if (gap <= 0) {
        this.strike(o);
        continue;
      }
      if (gap < (this.speed + d.extraSpeed) * (bee ? FIST_LEAD : KICK_LEAD) + 4) {
        if (bee) {
          this.fistSoon = true;
          this.fistSoonHigh = o.baseY < PUNCH_ABOVE;
        }
        else this.kickSoon = true;
      }
      left.push(o);
    }
    this.obstacles = left;
  }

  /** Richi's foot or fist lands on o: it turns into harmless debris */
  private strike(o: Obstacle): void {
    const d = OBS[o.kind];
    const cx = o.x + d.w / 2;
    const cy = o.y + d.h / 2;
    let at = cy;
    if (o.kind === 'stingby' && o.baseY < PUNCH_ABOVE) {
      // flying high: one straight punch and it is gone over the hills
      this.fistT = BLOW_TIME;
      this.fistBlow = 'punch';
      this.debris.push({ kind: o.kind, fate: 'far', x: cx, y: cy, vx: rand(120, 170), vy: rand(-170, -140), t: 0, spin: rand(1.6, 2.4), flat: false });
      this.sound.punch();
    } else if (o.kind === 'stingby') {
      this.fistT = BLOW_TIME;
      this.fistBlow = 'slam';
      this.debris.push({ kind: o.kind, fate: 'squash', x: cx, y: cy, vx: 0, vy: 620, t: 0, spin: 0, flat: false });
      this.sound.smash();
    } else {
      this.kickT = BLOW_TIME;
      at = GROUND - 9;
      // on his way to the catch everything goes far, so nothing tumbles across the hug
      const far = this.mode === 'caught' || Math.random() < FAR_CHANCE[o.kind];
      this.debris.push(
        far
          ? { kind: o.kind, fate: 'far', x: cx, y: cy, vx: rand(70, 130), vy: rand(-215, -190), t: 0, spin: rand(1.4, 2.2), flat: false }
          : { kind: o.kind, fate: 'drop', x: cx, y: cy, vx: rand(25, 70), vy: rand(-260, -210), t: 0, spin: -rand(1.1, 1.7), flat: false },
      );
      this.sound.kick(far);
    }
    const x = o.x + d.inset[0];
    this.particles.push({ kind: 'impact', x, y: at, vx: 0, vy: 0, life: 0, max: 0.14, variant: 0 });
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        kind: 'sparkle', x: x + rand(-3, 5), y: at + rand(-5, 5),
        vx: rand(-10, 90), vy: rand(-90, -20), life: 0, max: rand(0.25, 0.4), variant: 0,
      });
    }
  }

  private updateDebris(dt: number): void {
    for (const d of this.debris) {
      d.t += dt;
      if (d.fate === 'squash') {
        // driven into the ground, then left behind as the world scrolls on
        if (!d.flat) {
          d.y += d.vy * dt;
          if (d.y >= GROUND + 1 - FLAT_H / 2) {
            d.y = GROUND + 1 - FLAT_H / 2;
            d.flat = true;
            this.puff(d.x - 6, GROUND - 2, 2);
            this.puff(d.x + 12, GROUND - 2, 2);
          }
        }
        d.x -= this.speed * dt;
        continue;
      }
      // far: it loses its sideways speed as it heads into the distance; drop: a short pop up, then down and out
      if (d.fate === 'far') d.vx -= d.vx * Math.min(1, dt * 2);
      d.vy += (d.fate === 'far' ? 330 : 1000) * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.fate === 'far' && d.t >= FAR_TIME) {
        this.particles.push({ kind: 'twinkle', x: d.x, y: d.y, vx: 0, vy: 0, life: 0, max: 0.36, variant: 0 });
      }
    }
    this.debris = this.debris.filter((d) =>
      d.fate === 'far' ? d.t < FAR_TIME : d.fate === 'drop' ? d.y < H + 40 : d.x > -30,
    );
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
      const pinned = p.kind === 'text' || p.kind === 'impact' || p.kind === 'twinkle';
      p.x += (p.vx - (pinned ? 0 : this.speed * 0.5)) * dt;
      p.y += p.vy * dt;
      if (p.kind === 'heart') p.x += Math.sin((p.life + p.max) * 9) * 14 * dt;
      if (p.kind === 'sparkle') p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  // ---- animation ----------------------------------------------------------

  private animate(dt: number): void {
    const pace = Math.max(0, Math.min(1, (this.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START)));

    // goomba: 8-frame waddle, 1.6 strides a second at the start up to 2.4 flat out
    if (this.mode === 'title') {
      this.goombaAnim = 'run';
      this.runT += dt * 0.75;
      this.goombaFrame = Math.floor(this.runT * 8);
    } else if (this.hugging || this.mode === 'over') {
      // frames: 0 held, 1 squashed on the catch, 2 going up, 3 coming down, 4 blink
      this.goombaAnim = 'love';
      const u = this.tossPhase();
      const settled = this.hugT >= 1;
      if (!settled) this.goombaFrame = 0;
      else if (u < TOSS_AIR * 0.5) this.goombaFrame = 2;
      else if (u < TOSS_AIR) this.goombaFrame = 3;
      else if (u < TOSS_AIR + 0.1) this.goombaFrame = 1;
      // an unhurried blink, once every third toss
      else if (Math.floor(this.tossT / TOSS_PERIOD) % 3 === 2 && u > 0.84 && u < 0.94) this.goombaFrame = 4;
      else this.goombaFrame = 0;
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
      this.runT += dt * (1.6 + 0.8 * pace);
      this.goombaFrame = Math.floor(this.runT * 8);
    }

    // richi
    if (this.hugging || this.mode === 'over') {
      this.richiAnim = 'hug';
      // he stretches up for the throw, then stands and waits for the catch
      this.richiFrame = this.hugT >= 1 && this.tossPhase() < 0.14 ? 1 : 0;
    } else if (this.fistT > 0 && this.fistT >= this.kickT) {
      // his legs keep running under a punch; for a smash he plants his feet
      this.richiAnim = this.fistBlow === 'punch' ? 'punch' : 'smash';
      this.richiFrame = this.fistBlow === 'punch' ? Math.floor(this.rT * 8) : 1;
    } else if (this.kickT > 0) {
      this.richiAnim = 'kick';
      this.richiFrame = this.kickT > BLOW_TIME * 0.45 ? 1 : 2;
    } else if (this.fistSoon) {
      this.richiAnim = this.fistSoonHigh ? 'wind' : 'smash';
      this.richiFrame = this.fistSoonHigh ? Math.floor(this.rT * 8) : 0;
    } else if (this.kickSoon) {
      this.richiAnim = 'kick';
      this.richiFrame = 0;
    } else {
      this.richiAnim = 'run';
      this.richiFrame = Math.floor(this.rT * 8);
    }
  }
}
