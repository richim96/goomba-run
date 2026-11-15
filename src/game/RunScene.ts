// The world and its rules. The Goomba, the obstacles and the pickups are
// Arcade Physics bodies; the Goomba really runs to the right through the world
// and the camera goes with it. Modes: title -> play -> caught -> over. Nothing
// teleports between modes: on restart the Goomba drops from Richi's hands and
// he falls behind.
import Phaser from 'phaser';
import { GOOMBA_ANCHOR, GOOMBA_H, GOOMBA_W } from '../art/goomba.ts';
import { RICHI_ANCHOR, RICHI_H, RICHI_HOLD, RICHI_W } from '../art/richi.ts';
import { Backdrop } from './backdrop.ts';
import {
  BERRY_POINTS, BLOW_TIME, COYOTE, DEPTH, DOUBLE_JUMP_V, FALL_GRAVITY, FAR_CHANCE, FAR_TIME, FIST_LEAD, FLAT_H,
  GOOMBA_BODY, GRAVITY, GROUND, H, INVULN, JUMP_BUFFER, JUMP_CUT_V, JUMP_V, KICK_LEAD, KICK_REACH, MAX_FALL, MAX_LIVES,
  OBS, PICKUP_RADIUS, PLAYER_X, PUNCH_ABOVE, PUNCH_REACH, PX_PER_METER, RICHI_X, SMASH_REACH, SPEED_CREEP,
  SPEED_CREEP_FROM, SPEED_CREEP_MAX, SPEED_MAX, SPEED_START, SPEED_TITLE, TOSS_PERIOD, W, type ObKind,
} from './config.ts';
import { Fx } from './fx.ts';
import { Label } from './label.ts';
import { shell, type Controls } from './shell.ts';
import { sourceSprites, tex } from './textures.ts';

export type Mode = 'title' | 'play' | 'caught' | 'over';
type GoombaAnim = 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'hurt' | 'love';
type RichiAnim = 'run' | 'kick' | 'smash' | 'wind' | 'punch' | 'hug';
type PImage = Phaser.Physics.Arcade.Image;
type Body = Phaser.Physics.Arcade.Body;

const INK = '#2a1810';
const CREAM = '#fff4d8';
/** side of the game-resolution canvas that tumbling debris is turned on, so it keeps the same chunky pixels as everything else */
const SCRATCH = 96;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** every plain number and flag of a run; positions of bodies live on the bodies */
function freshState() {
  return {
    mode: 'title' as Mode,
    paused: false,
    /** seconds since the current mode started */
    modeT: 0,
    time: 0,
    speed: 0,
    /** px run in this run */
    dist: 0,
    /** left edge of the view in the world; never reset mid-session so the backdrop does not jump */
    scrollX: 0,
    dayClock: 0,
    shake: 0,
    hitstop: 0,
    berries: 0,
    best: 0,
    newBest: false,
    lives: MAX_LIVES,
    berryStreak: 0,
    berryStreakT: 0,
    /** where the Goomba is on the screen */
    gScreen: PLAYER_X,
    grounded: true,
    airJumps: 1,
    coyote: 0,
    buffer: 0,
    invuln: 0,
    hurtT: 0,
    landT: 0,
    runT: 0,
    stepT: 0,
    /** where Richi is on the screen */
    rScreen: RICHI_X[3],
    rT: 0,
    /** seconds left of the pose he holds after a kick / after throwing his fist */
    kickT: 0,
    fistT: 0,
    fistBlow: 'punch' as 'punch' | 'slam',
    /** something is about to reach his foot / his fist: he winds up */
    kickSoon: false,
    fistSoon: false,
    /** ... and that something is flying high (a punch) rather than low (a smash) */
    fistSoonHigh: false,
    hugging: false,
    /** 0..1 while Richi lifts the Goomba into his arms */
    hugT: 0,
    hugFromX: PLAYER_X,
    /** seconds since the Goomba settled in his hands */
    tossT: 0,
    heartT: 0,
    /** big centred message (distance milestones) and its age in seconds; -1 = none */
    bannerText: '',
    bannerT: -1,
    nextMilestone: 100,
    lowHints: 2,
    nextSpawn: 0,
    heartCooldown: 0,
    goombaAnim: 'idle' as GoombaAnim,
    goombaFrame: 0,
    richiAnim: 'run' as RichiAnim,
    richiFrame: 0,
  };
}
export type State = ReturnType<typeof freshState>;

interface Ob {
  kind: ObKind;
  baseY: number;
  t: number;
  phase: number;
  hint?: string;
  img: PImage;
  label?: Label;
}

interface Pickup {
  kind: 'berry' | 'heart';
  /** resting height; the picture bobs around it */
  y: number;
  t: number;
  img: PImage;
}

/** something Richi has dealt with: it can no longer hurt anyone, it only has to leave. Lives on the screen. */
interface Debris {
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
  img: Phaser.GameObjects.Image;
  canvas?: Phaser.Textures.CanvasTexture;
}

/** everything the rules need to carry on from a moment (the fairness simulator looks ahead from copies) */
export interface Snapshot {
  s: State;
  g: { x: number; y: number; vy: number; on: boolean };
  obs: { kind: ObKind; x: number; y: number; baseY: number; t: number; phase: number; hint?: string }[];
  picks: { kind: 'berry' | 'heart'; x: number; y: number; t: number }[];
}

let debrisSerial = 0;

export class RunScene extends Phaser.Scene {
  s: State = freshState();
  goomba!: Phaser.Physics.Arcade.Sprite;
  obstacles: Ob[] = [];
  pickups: Pickup[] = [];
  private debris: Debris[] = [];

  private obGroup!: Phaser.Physics.Arcade.Group;
  private pickGroup!: Phaser.Physics.Arcade.Group;
  private readonly obPool: PImage[] = [];
  private readonly pickPool: PImage[] = [];
  private readonly pickOf = new WeakMap<object, Pickup>();
  /** set by the physics step: the Goomba's body is touching an obstacle / these pickups */
  private hitPending = false;
  private readonly touched = new Set<Pickup>();

  private fx!: Fx;
  private backdrop?: Backdrop;
  private shadows?: Phaser.GameObjects.Graphics;
  private richi?: Phaser.GameObjects.Image;
  private holdArm?: Phaser.GameObjects.Image;
  private heartSpark?: Phaser.GameObjects.Image;

  constructor() {
    super('run');
  }

  get meters(): number {
    return Math.floor(this.s.dist / PX_PER_METER);
  }

  get score(): number {
    return this.meters + this.s.berries * BERRY_POINTS;
  }

  private get body(): Body {
    return this.goomba.body as Body;
  }

  /** where the Goomba's feet are, on the screen */
  get gx(): number {
    return this.goomba.x - this.s.scrollX;
  }

  get gy(): number {
    return this.goomba.y;
  }

  create(): void {
    // the scene steps the physics itself (`advance`), so rules and bodies move as one
    this.physics.disableUpdate();
    const world = this.physics.world;
    world.setBounds(-1e6, -4000, 1e9, 4000 + GROUND);
    world.setBoundsCollision(false, false, false, true);

    this.obGroup = this.physics.add.group({ allowGravity: false, classType: Phaser.Physics.Arcade.Image });
    this.pickGroup = this.physics.add.group({ allowGravity: false, classType: Phaser.Physics.Arcade.Image });

    this.goomba = this.physics.add
      .sprite(PLAYER_X, GROUND, tex('goomba', 'idle'))
      .setOrigin(GOOMBA_ANCHOR.x / GOOMBA_W, GOOMBA_ANCHOR.y / GOOMBA_H)
      .setDepth(DEPTH.goomba);
    this.body.setSize(GOOMBA_BODY.w, GOOMBA_BODY.h, false);
    this.body.setOffset(GOOMBA_ANCHOR.x - GOOMBA_BODY.w / 2, GOOMBA_ANCHOR.y - GOOMBA_BODY.h);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(1e6, MAX_FALL);

    this.physics.add.overlap(this.goomba, this.obGroup, () => {
      this.hitPending = true;
    });
    this.physics.add.overlap(this.goomba, this.pickGroup, (_g, p) => {
      const rec = this.pickOf.get(p);
      if (rec) this.touched.add(rec);
    });

    this.fx = new Fx(this, shell.lite);
    if (!shell.lite) {
      this.backdrop = new Backdrop(this);
      this.shadows = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.shadows);
      const origin = [RICHI_ANCHOR.x / RICHI_W, RICHI_ANCHOR.y / RICHI_H] as const;
      this.richi = this.add.image(0, GROUND, tex('richi', 'run')).setOrigin(...origin).setDepth(DEPTH.richi);
      this.holdArm = this.add.image(0, GROUND, tex('richi', 'holdArm')).setOrigin(...origin).setDepth(DEPTH.holdArm).setVisible(false);
      this.heartSpark = this.add.image(0, 0, tex('props', 'sparkle', 1)).setOrigin(0, 0).setDepth(DEPTH.pickups).setVisible(false);
    }

    if (!shell.lite) {
      try {
        this.s.best = Number(localStorage.getItem('goomba-run.best') ?? 0) || 0;
      } catch {
        this.s.best = 0;
      }
    }

    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  /** the picture is `k` real pixels per game pixel, so things can sit between game pixels */
  private layout(): void {
    const cam = this.cameras.main;
    cam.setPosition(0, 0);
    cam.setSize(this.scale.width, this.scale.height);
    cam.setOrigin(0, 0);
    cam.setZoom(this.scale.width / W);
  }

  update(_time: number, delta: number): void {
    if (!shell.freeze && shell.controls) this.advance(Math.min(0.05, delta / 1000), shell.controls);
    if (!shell.lite) this.present();
  }

  // ---- flow -------------------------------------------------------------

  private setMode(m: Mode): void {
    this.s.mode = m;
    this.s.modeT = 0;
  }

  startRun(): void {
    const s = this.s;
    this.setMode('play');
    s.paused = false;
    s.speed = SPEED_START;
    s.dist = 0;
    s.berries = 0;
    s.newBest = false;
    s.lives = MAX_LIVES;
    // No teleporting: the Goomba drops from wherever it is (Richi's hands, after
    // a catch) and bolts, and Richi falls behind from where he stands.
    this.body.enable = true;
    this.body.reset(this.goomba.x, this.goomba.y);
    s.grounded = this.goomba.y >= GROUND;
    s.airJumps = 1;
    s.invuln = 0;
    s.hurtT = 0;
    s.kickT = 0;
    s.fistT = 0;
    s.hugging = false;
    s.hugT = 0;
    this.fx.clear();
    // whatever was left standing goes up in a puff
    for (const o of this.obstacles) {
      const x = o.img.x - s.scrollX;
      if (x < W) this.puff(x + OBS[o.kind].w / 2 + 6, o.img.y + OBS[o.kind].h / 2, 5);
      this.releaseOb(o);
    }
    for (const d of this.debris) {
      if (d.flat) this.puff(d.x + 6, d.y, 4);
      this.releaseDebris(d);
    }
    for (const p of this.pickups) this.releasePick(p);
    this.obstacles = [];
    this.debris = [];
    this.pickups = [];
    this.hitPending = false;
    this.touched.clear();
    s.nextSpawn = 170;
    s.nextMilestone = 100;
    s.bannerT = -1;
    s.heartCooldown = 0;
    shell.sfx.start();
    shell.sfx.music(true);
  }

  togglePause(): void {
    if (this.s.mode !== 'play') return;
    this.s.paused = !this.s.paused;
    shell.sfx.music(!this.s.paused);
  }

  // ---- one step of the rules ----------------------------------------------

  /** moves the game on by `dt` seconds */
  advance(dt: number, c: Controls): void {
    const s = this.s;
    if (c.pausePressed) this.togglePause();
    if (s.paused) {
      if (c.jumpPressed) this.togglePause();
      return;
    }
    if (s.hitstop > 0) {
      s.hitstop -= dt;
      return;
    }

    s.time += dt;
    s.modeT += dt;
    s.shake = Math.max(0, s.shake - dt * 14);
    if (s.bannerT >= 0) {
      s.bannerT += dt;
      if (s.bannerT > 1.7) s.bannerT = -1;
    }

    switch (s.mode) {
      case 'title':
        s.speed = SPEED_TITLE;
        if (c.jumpPressed) this.startRun();
        break;
      case 'play':
        this.beforeStep(dt, c);
        break;
      case 'caught':
        this.caught(dt);
        break;
      case 'over':
        s.speed = 0;
        this.hugBounce(dt, 0.4);
        if (c.jumpPressed && s.modeT > 0.45) this.startRun();
        break;
    }

    s.scrollX += s.speed * dt;
    s.dayClock += dt;

    // the physics step: gravity, the ground, and what the Goomba's body touches
    if (this.body.enable) this.body.velocity.x = (s.scrollX + s.gScreen - this.goomba.x) / dt;
    this.physics.world.update(0, dt * 1000);
    this.physics.world.postUpdate();
    if (!this.body.enable) this.goomba.x = s.scrollX + s.gScreen;

    if (s.mode === 'play') this.afterStep();
    else if (s.mode === 'caught' && !s.hugging) s.grounded = this.body.onFloor();
    this.hitPending = false;
    this.touched.clear();

    this.backdrop?.update(dt, s.speed, s.scrollX);
    this.updateRichi(dt);
    this.updateDebris(dt);
    this.fx.update(dt, s.speed);
    this.animate(dt);
  }

  private beforeStep(dt: number, c: Controls): void {
    const s = this.s;
    const body = this.body;
    const m = s.dist / PX_PER_METER;
    s.speed =
      SPEED_START +
      (SPEED_MAX - SPEED_START) * (1 - Math.exp(-m / 380)) +
      Math.min(SPEED_CREEP_MAX, Math.max(0, m - SPEED_CREEP_FROM) * SPEED_CREEP);
    s.dist += s.speed * dt;
    s.gScreen += (PLAYER_X - s.gScreen) * Math.min(1, dt * 8);
    shell.sfx.tempo((s.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START));
    if (m >= s.nextMilestone) {
      s.bannerText = `${s.nextMilestone} M`;
      s.bannerT = 0;
      s.nextMilestone += s.nextMilestone >= 500 ? 250 : 100;
      shell.sfx.milestone();
    }

    // --- jump -------------------------------------------------------------
    s.buffer = c.jumpPressed ? JUMP_BUFFER : s.buffer - dt;
    s.coyote = s.grounded ? COYOTE : s.coyote - dt;
    if (s.buffer > 0) {
      if (s.coyote > 0) {
        body.velocity.y = JUMP_V;
        s.grounded = false;
        s.coyote = 0;
        s.buffer = 0;
        s.airJumps = 1;
        shell.sfx.jump();
        this.puff(this.gx - 4, GROUND - 2, 3);
      } else if (s.airJumps > 0) {
        body.velocity.y = DOUBLE_JUMP_V;
        s.airJumps--;
        s.buffer = 0;
        shell.sfx.doubleJump();
        for (let i = 0; i < 4; i++) {
          this.fx.add({
            kind: 'sparkle', x: this.gx + rand(-8, 8), y: this.gy - rand(0, 8),
            vx: rand(-30, 10), vy: rand(10, 50), life: 0, max: rand(0.25, 0.45), variant: 0,
          });
        }
      }
    }
    if (!s.grounded) {
      if (!c.jumpHeld && body.velocity.y < JUMP_CUT_V) body.velocity.y = JUMP_CUT_V;
    } else {
      // running dust
      s.stepT -= dt * (s.speed / SPEED_START);
      if (s.stepT <= 0) {
        s.stepT = 0.22;
        this.puff(this.gx - 8, GROUND - 1, 1);
      }
    }
    // it comes down faster than it went up
    body.gravity.y = body.velocity.y > 0 ? GRAVITY * (FALL_GRAVITY - 1) : 0;

    s.invuln = Math.max(0, s.invuln - dt);
    s.hurtT = Math.max(0, s.hurtT - dt);
    s.landT = Math.max(0, s.landT - dt);
    s.berryStreakT -= dt;
    if (s.berryStreakT <= 0) s.berryStreak = 0;
    s.heartCooldown -= dt;

    // --- world --------------------------------------------------------------
    if (s.dist >= s.nextSpawn) this.spawnPattern(m);
    for (const o of this.obstacles) {
      o.t += dt;
      if (o.kind === 'stingby') {
        o.img.y = o.baseY + Math.sin(o.t * 5 + o.phase) * 3;
        // past the Goomba: the warning has done its job (Richi deals with the rest)
        if (o.img.x - s.scrollX + OBS.stingby.w < s.gScreen - 10) o.hint = undefined;
      }
    }
    for (const p of this.pickups) p.t += dt;
  }

  private afterStep(): void {
    const s = this.s;
    if (!s.grounded && this.body.onFloor()) {
      s.grounded = true;
      s.airJumps = 1;
      s.landT = 0.09;
      shell.sfx.land();
      this.puff(this.gx - 6, GROUND - 2, 2);
      this.puff(this.gx + 6, GROUND - 2, 2);
    }

    if (this.hitPending && s.invuln <= 0) this.hit();
    for (const p of this.touched) {
      const i = this.pickups.indexOf(p);
      if (i < 0) continue;
      this.pickups.splice(i, 1);
      this.collect(p);
      this.releasePick(p);
    }

    this.obstacles = this.obstacles.filter((o) => {
      if (o.img.x - s.scrollX > -40) return true;
      this.releaseOb(o);
      return false;
    });
    this.pickups = this.pickups.filter((p) => {
      if (p.img.x - s.scrollX > -20) return true;
      this.releasePick(p);
      return false;
    });
  }

  private hit(): void {
    const s = this.s;
    s.lives--;
    s.invuln = INVULN;
    s.hurtT = 0.4;
    s.shake = 5;
    s.hitstop = 0.07;
    shell.sfx.hit();
    for (let i = 0; i < 5; i++) {
      this.fx.add({
        kind: 'sparkle', x: this.gx + rand(-6, 6), y: this.gy - rand(6, 18),
        vx: rand(-70, 70), vy: rand(-90, -20), life: 0, max: rand(0.3, 0.5), variant: 0,
      });
    }
    if (s.lives <= 0) {
      this.setMode('caught');
      shell.sfx.music(false);
      this.finishScore();
    } else if (s.grounded) {
      // ouch-hop: knocked off its feet for a moment
      this.body.velocity.y = -210;
      s.grounded = false;
      s.coyote = 0;
    }
  }

  private finishScore(): void {
    const s = this.s;
    if (this.score > s.best) {
      s.best = this.score;
      s.newBest = true;
      if (shell.lite) return;
      try {
        localStorage.setItem('goomba-run.best', String(s.best));
      } catch {
        /* private mode: just keep it in memory */
      }
    }
  }

  private collect(p: Pickup): void {
    const s = this.s;
    const x = p.img.x - s.scrollX;
    if (p.kind === 'berry') {
      s.berries++;
      s.berryStreak = s.berryStreakT > 0 ? s.berryStreak + 1 : 0;
      s.berryStreakT = 0.6;
      shell.sfx.berry(s.berryStreak);
      this.floatText(`+${BERRY_POINTS}`, x, p.y - 6);
    } else {
      shell.sfx.heart();
      if (s.lives < MAX_LIVES) {
        s.lives++;
        this.floatText('<', x, p.y - 8);
      } else {
        s.berries += 5;
        this.floatText(`+${BERRY_POINTS * 5}`, x, p.y - 8);
      }
      for (let i = 0; i < 6; i++) this.heartBurst(x, p.y);
    }
    for (let i = 0; i < 4; i++) {
      this.fx.add({
        kind: 'sparkle', x: x + rand(-5, 5), y: p.y + rand(-5, 5),
        vx: rand(-40, 40), vy: rand(-60, -10), life: 0, max: rand(0.25, 0.45), variant: 0,
      });
    }
  }

  private caught(dt: number): void {
    const s = this.s;
    s.speed = Math.max(0, s.speed - dt * 420);
    if (!s.hugging) {
      // the Goomba plops back to the ground by itself; obstacles drift off so the hug has a clear stage
      this.body.gravity.y = 0;
      for (const o of this.obstacles) (o.img.body as Body).velocity.x = -60 - OBS[o.kind].extraSpeed;
      for (const p of this.pickups) (p.img.body as Body).velocity.x = -60;
      const arrived = s.grounded && Math.abs(s.rScreen - RICHI_X[0]) < 2.5;
      if (arrived || s.modeT > 3) {
        s.hugging = true;
        s.hugT = 0;
        s.tossT = 0;
        s.hugFromX = s.gScreen;
        this.body.enable = false;
        this.goomba.y = GROUND;
        s.grounded = true;
        for (const p of this.pickups) this.releasePick(p);
        this.pickups = [];
        shell.sfx.caught();
        // a burst of hearts above them, spread out so they do not pile up on his face
        for (let i = 0; i < 10; i++) this.heartBurst(s.gScreen + rand(-18, 18), GROUND - 58 - rand(0, 26));
      }
    } else {
      s.hugT = Math.min(1, s.hugT + dt / 0.3);
      this.hugBounce(dt, 0.14);
      if (s.modeT > 2.7) {
        this.setMode('over');
        if (s.newBest) {
          shell.sfx.newBest();
          for (let i = 0; i < 14; i++) {
            this.fx.add({
              kind: 'sparkle', x: W - 94 + rand(-70, 70), y: 30 + rand(0, 60),
              vx: rand(-20, 20), vy: rand(-50, -10), life: 0, max: rand(0.5, 1), variant: 0,
            });
          }
        }
      }
    }
  }

  /** scooped up from the ground and held tight in his arms: no escape, he only rocks it gently, hearts drifting up */
  private hugBounce(dt: number, heartEvery: number): void {
    const s = this.s;
    if (s.hugT >= 1) s.tossT += dt;
    const k = 1 - (1 - s.hugT) ** 3;
    const sway = s.hugT >= 1 && this.tossPhase() >= 0.5 ? 1 : 0;
    s.gScreen = s.hugFromX + (s.rScreen + RICHI_HOLD.x - s.hugFromX) * k;
    this.goomba.y = GROUND + RICHI_HOLD.y * k - sway;
    s.heartT -= dt;
    if (s.heartT <= 0) {
      s.heartT = heartEvery;
      this.heartBurst(s.gScreen + rand(-10, 10), this.goomba.y - 16);
    }
  }

  /** 0..1 through the current rock while he holds it */
  private tossPhase(): number {
    return (this.s.tossT % TOSS_PERIOD) / TOSS_PERIOD;
  }

  // ---- spawning ---------------------------------------------------------

  private spawnPattern(m: number): void {
    const s = this.s;
    const x = s.scrollX + W + 24;
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
      if (s.lowHints > 0) {
        o.hint = 'STAY LOW!';
        s.lowHints--;
      }
      return o;
    };
    switch (choice) {
      case 'ground': {
        const o = this.addObstacle(groundKind(), x);
        if (Math.random() < 0.6) this.berryArc(x + OBS[o.kind].w / 2, 3);
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
        highBee(x);
        for (let i = 0; i < 3; i++) this.addPickup('berry', x + i * 16, GROUND - 9, i * 0.2);
        break;
      }
      case 'duckHop': {
        // stay low under the Stingby, then hop what was hiding behind it
        highBee(x);
        const o = this.addObstacle(groundKind(), x + 34);
        this.berryArc(x + 34 + OBS[o.kind].w / 2, 3);
        extraGap = 50;
        break;
      }
      case 'twoBees': {
        // one to jump and one to stay under, in either order, about half a second apart
        const apart = (s.speed + OBS.stingby.extraSpeed) * 0.55;
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
    const gap = s.speed * gapTime + extraGap;
    s.nextSpawn = s.dist + gap;

    // a floating heart, sometimes, when a life is missing
    if (s.lives < MAX_LIVES && s.heartCooldown <= 0 && Math.random() < 0.3) {
      this.addPickup('heart', x + gap * 0.5, GROUND - 74, 0);
      s.heartCooldown = 14;
    }
  }

  private addObstacle(kind: ObKind, x: number, y?: number): Ob {
    const baseY = y ?? GROUND + 1 - OBS[kind].h;
    return this.putObstacle(kind, x, baseY, baseY, 0, Math.random() * 6);
  }

  private putObstacle(kind: ObKind, x: number, y: number, baseY: number, t: number, phase: number, hint?: string): Ob {
    const d = OBS[kind];
    const key = tex('props', kind);
    let img = this.obPool.pop();
    if (img) {
      img.setTexture(key);
      img.enableBody(true, x, y, true, true);
    } else {
      img = (this.obGroup.create(x, y, key) as PImage).setOrigin(0, 0).setDepth(DEPTH.obstacles);
    }
    const body = img.body as Body;
    body.setSize(d.w - d.inset[0] - d.inset[2], d.h - d.inset[1] - d.inset[3], false);
    body.setOffset(d.inset[0], d.inset[1]);
    body.setVelocity(-d.extraSpeed, 0);
    const o: Ob = { kind, baseY, t, phase, hint, img };
    this.obstacles.push(o);
    return o;
  }

  private releaseOb(o: Ob): void {
    o.label?.destroy();
    o.label = undefined;
    o.img.disableBody(true, true);
    this.obPool.push(o.img);
  }

  private addPickup(kind: 'berry' | 'heart', x: number, y: number, t: number): void {
    const key = tex('props', kind);
    let img = this.pickPool.pop();
    if (img) {
      img.setTexture(key);
      img.enableBody(true, x, y, true, true);
    } else {
      img = (this.pickGroup.create(x, y, key) as PImage).setDepth(DEPTH.pickups);
    }
    (img.body as Body).setCircle(PICKUP_RADIUS, img.width / 2 - PICKUP_RADIUS, img.height / 2 - PICKUP_RADIUS);
    const p: Pickup = { kind, y, t, img };
    this.pickOf.set(img, p);
    this.pickups.push(p);
  }

  private releasePick(p: Pickup): void {
    p.img.disableBody(true, true);
    this.pickPool.push(p.img);
  }

  /** berries along the arc of a jump centred on cx */
  private berryArc(cx: number, n: number, lift = 0): void {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      this.addPickup('berry', cx + u * 20, GROUND - 46 - lift + u * u * 12, i * 0.15);
    }
  }

  // ---- richi ------------------------------------------------------------

  private updateRichi(dt: number): void {
    const s = this.s;
    const pace = Math.max(0, Math.min(1, (s.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START)));
    s.rT += dt * (s.mode === 'title' ? 0.7 : 1.4 + 0.6 * pace);
    if (s.hugging) return;

    let target: number;
    let follow = 2.4;
    if (s.mode === 'title') target = 34;
    else if (s.mode === 'caught') {
      target = RICHI_X[0];
      follow = 7;
    } else if (s.mode === 'over') target = s.rScreen;
    else target = RICHI_X[s.lives] + Math.sin(s.time * 1.7) * 3;
    s.rScreen += (target - s.rScreen) * Math.min(1, dt * follow);

    // He never breaks stride for what is in his way: whatever reaches him is
    // kicked off (scenery), punched away or smashed (Stingbies), and stops being
    // an obstacle.
    s.kickT = Math.max(0, s.kickT - dt);
    s.fistT = Math.max(0, s.fistT - dt);
    s.kickSoon = false;
    s.fistSoon = false;
    if (s.mode !== 'play' && s.mode !== 'caught') return;
    const left: Ob[] = [];
    for (const o of this.obstacles) {
      const d = OBS[o.kind];
      const bee = o.kind === 'stingby';
      const reach = !bee ? KICK_REACH : o.baseY < PUNCH_ABOVE ? PUNCH_REACH : SMASH_REACH;
      const gap = o.img.x - s.scrollX + d.strike - (s.rScreen + reach);
      if (gap <= 0) {
        this.strike(o);
        continue;
      }
      if (gap < (s.speed + d.extraSpeed) * (bee ? FIST_LEAD : KICK_LEAD) + 4) {
        if (bee) {
          s.fistSoon = true;
          s.fistSoonHigh = o.baseY < PUNCH_ABOVE;
        } else s.kickSoon = true;
      }
      left.push(o);
    }
    this.obstacles = left;
  }

  /** Richi's foot or fist lands on o: it turns into harmless debris */
  private strike(o: Ob): void {
    const s = this.s;
    const d = OBS[o.kind];
    const ox = o.img.x - s.scrollX;
    const cx = ox + d.w / 2;
    const cy = o.img.y + d.h / 2;
    let at = cy;
    if (o.kind === 'stingby' && o.baseY < PUNCH_ABOVE) {
      // flying high: one straight punch and it is gone over the hills
      s.fistT = BLOW_TIME;
      s.fistBlow = 'punch';
      this.addDebris(o.kind, 'far', cx, cy, rand(120, 170), rand(-170, -140), rand(1.6, 2.4));
      shell.sfx.punch();
    } else if (o.kind === 'stingby') {
      s.fistT = BLOW_TIME;
      s.fistBlow = 'slam';
      this.addDebris(o.kind, 'squash', cx, cy, 0, 620, 0);
      shell.sfx.smash();
    } else {
      s.kickT = BLOW_TIME;
      at = GROUND - 9;
      // on his way to the catch everything goes far, so nothing tumbles across the hug
      const far = s.mode === 'caught' || Math.random() < FAR_CHANCE[o.kind];
      if (far) this.addDebris(o.kind, 'far', cx, cy, rand(70, 130), rand(-215, -190), rand(1.4, 2.2));
      else this.addDebris(o.kind, 'drop', cx, cy, rand(25, 70), rand(-260, -210), -rand(1.1, 1.7));
      shell.sfx.kick(far);
    }
    const x = ox + d.strike;
    this.fx.add({ kind: 'impact', x, y: at, vx: 0, vy: 0, life: 0, max: 0.14, variant: 0 });
    for (let i = 0; i < 3; i++) {
      this.fx.add({
        kind: 'sparkle', x: x + rand(-3, 5), y: at + rand(-5, 5),
        vx: rand(-10, 90), vy: rand(-90, -20), life: 0, max: rand(0.25, 0.4), variant: 0,
      });
    }
    this.releaseOb(o);
  }

  private addDebris(kind: ObKind, fate: Debris['fate'], x: number, y: number, vx: number, vy: number, spin: number): void {
    if (shell.lite) return;
    let img: Phaser.GameObjects.Image;
    let canvas: Phaser.Textures.CanvasTexture | undefined;
    if (fate === 'squash') {
      img = this.add.image(x, y, tex('props', 'stingbyFlat'));
    } else {
      canvas = this.textures.createCanvas(`debris-${debrisSerial++}`, SCRATCH, SCRATCH)!;
      canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
      canvas.context.imageSmoothingEnabled = false;
      img = this.add.image(x, y, canvas.key);
    }
    // what he kicked into the distance or flattened stays behind the cast; what he kicked over tumbles past in front
    img.setScrollFactor(0).setDepth(fate === 'drop' ? DEPTH.debrisFront : DEPTH.debrisBack);
    this.debris.push({ kind, fate, x, y, vx, vy, t: 0, spin, flat: false, img, canvas });
  }

  private releaseDebris(d: Debris): void {
    d.img.destroy();
    if (d.canvas) this.textures.remove(d.canvas.key);
  }

  private updateDebris(dt: number): void {
    const s = this.s;
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
        d.x -= s.speed * dt;
        continue;
      }
      // far: it loses its sideways speed as it heads into the distance; drop: a short pop up, then down and out
      if (d.fate === 'far') d.vx -= d.vx * Math.min(1, dt * 2);
      d.vy += (d.fate === 'far' ? 330 : 1000) * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.fate === 'far' && d.t >= FAR_TIME) {
        this.fx.add({ kind: 'twinkle', x: d.x, y: d.y, vx: 0, vy: 0, life: 0, max: 0.36, variant: 0 });
      }
    }
    this.debris = this.debris.filter((d) => {
      const keep = d.fate === 'far' ? d.t < FAR_TIME : d.fate === 'drop' ? d.y < H + 40 : d.x > -30;
      if (!keep) this.releaseDebris(d);
      return keep;
    });
  }

  // ---- effects ------------------------------------------------------------

  private puff(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.fx.add({
        kind: 'dust', x: x + rand(-3, 3), y: y + rand(-2, 1),
        vx: rand(-34, -6), vy: rand(-22, -4), life: 0, max: rand(0.22, 0.4), variant: 0,
      });
    }
  }

  private heartBurst(x: number, y: number): void {
    this.fx.add({
      kind: 'heart', x, y, vx: rand(-26, 26), vy: rand(-60, -24),
      life: 0, max: rand(0.7, 1.2), variant: Math.random() < 0.5 ? 0 : 1,
    });
  }

  private floatText(text: string, x: number, y: number): void {
    this.fx.add({ kind: 'text', x, y, vx: 0, vy: -34, life: 0, max: 0.7, variant: 0, text });
  }

  // ---- animation ----------------------------------------------------------

  private animate(dt: number): void {
    const s = this.s;
    const pace = Math.max(0, Math.min(1, (s.speed - SPEED_START) / (SPEED_MAX + SPEED_CREEP_MAX - SPEED_START)));

    // goomba: 8-frame waddle, 1.6 strides a second at the start up to 2.4 flat out
    if (s.mode === 'title') {
      s.goombaAnim = 'run';
      s.runT += dt * 0.75;
      s.goombaFrame = Math.floor(s.runT * 8);
    } else if (s.hugging || s.mode === 'over') {
      // trapped: just its usual scowl, stuck in his arms
      s.goombaAnim = 'idle';
      s.goombaFrame = 0;
    } else if (s.mode === 'caught' || s.hurtT > 0) {
      s.goombaAnim = 'hurt';
      s.goombaFrame = 0;
    } else if (!s.grounded) {
      s.goombaAnim = this.body.velocity.y < 60 ? 'jump' : 'fall';
      s.goombaFrame = 0;
    } else if (s.landT > 0) {
      s.goombaAnim = 'land';
      s.goombaFrame = 0;
    } else {
      s.goombaAnim = 'run';
      s.runT += dt * (1.6 + 0.8 * pace);
      s.goombaFrame = Math.floor(s.runT * 8);
    }

    // richi
    if (s.hugging || s.mode === 'over') {
      s.richiAnim = 'hug';
      // a slow rock from side to side, the Goomba going with him
      s.richiFrame = s.hugT >= 1 && this.tossPhase() >= 0.5 ? 1 : 0;
    } else if (s.fistT > 0 && s.fistT >= s.kickT) {
      // his legs keep running under a punch; for a smash he plants his feet
      s.richiAnim = s.fistBlow === 'punch' ? 'punch' : 'smash';
      s.richiFrame = s.fistBlow === 'punch' ? Math.floor(s.rT * 8) : 1;
    } else if (s.kickT > 0) {
      s.richiAnim = 'kick';
      s.richiFrame = s.kickT > BLOW_TIME * 0.45 ? 1 : 2;
    } else if (s.fistSoon) {
      s.richiAnim = s.fistSoonHigh ? 'wind' : 'smash';
      s.richiFrame = s.fistSoonHigh ? Math.floor(s.rT * 8) : 0;
    } else if (s.kickSoon) {
      s.richiAnim = 'kick';
      s.richiFrame = 0;
    } else {
      s.richiAnim = 'run';
      s.richiFrame = Math.floor(s.rT * 8);
    }
  }

  // ---- the picture ----------------------------------------------------------

  /** puts every picture where the rules say it is; changes nothing in the game */
  present(): void {
    const s = this.s;
    const cam = this.cameras.main;
    const k = cam.zoom;
    // the view follows the Goomba through the world; a hit rattles it
    const shake = () => (s.shake > 0 ? Math.round((Math.random() - 0.5) * s.shake) * k : 0);
    cam.setPosition(shake(), shake());
    cam.setScroll(s.scrollX, 0);

    this.backdrop?.present(s.dayClock, s.time, s.scrollX);

    const sh = this.shadows!;
    sh.clear();
    this.shadow(sh, this.gx, 9, s.hugging ? 0 : Math.max(0.25, 1 - (GROUND - this.gy) / 70));
    this.shadow(sh, s.rScreen, 17, 1);

    const richiKey = tex('richi', s.richiAnim, s.richiFrame);
    this.richi!.setTexture(richiKey).setX(s.scrollX + s.rScreen);
    // holding it: his near arm wraps round the front
    this.holdArm!.setVisible(s.richiAnim === 'hug').setTexture(tex('richi', 'holdArm', s.richiFrame)).setX(s.scrollX + s.rScreen);

    for (const o of this.obstacles) {
      if (o.kind === 'stingby') {
        o.img.setTexture(tex('props', 'stingby', Math.floor(o.t * 14)));
        this.shadow(sh, o.img.x - s.scrollX + 15, 7, 0.5);
      }
      if (o.hint) {
        o.label ??= new Label(this, DEPTH.hints, false);
        o.label.set(o.hint, o.img.x + 15, o.img.y + 31, { align: 'center', color: CREAM, outline: INK }, false);
      } else if (o.label) {
        o.label.destroy();
        o.label = undefined;
      }
    }

    let spark = false;
    for (const p of this.pickups) {
      const bob = Math.round(Math.sin(s.time * 5 + p.t * 6) * 2);
      p.img.y = p.y + bob;
      if (p.kind === 'heart' && Math.floor(s.time * 6) % 3 === 0) {
        spark = true;
        this.heartSpark!.setPosition(p.img.x + 3, p.y - 9 + bob);
      }
    }
    this.heartSpark!.setVisible(spark);

    // goomba: after a hit it fades in and out (gently, about 3 times a second) instead of vanishing
    const faded = s.invuln > 0 && s.mode === 'play' && Math.floor(s.time * 6.5) % 2 === 0;
    this.goomba.setTexture(s.hitstop > 0 ? 'goombaFlash' : tex('goomba', s.goombaAnim, s.goombaFrame)).setAlpha(faded ? 0.4 : 1);

    for (const d of this.debris) this.presentDebris(d);
    this.fx.present();
  }

  private shadow(g: Phaser.GameObjects.Graphics, x: number, half: number, k: number): void {
    if (k <= 0) return;
    const w = Math.round(half * k);
    g.fillStyle(0x1e321e, 0.28);
    g.fillRect(x - w + 2, GROUND, (w - 2) * 2, 1);
    g.fillRect(x - w, GROUND + 1, w * 2, 2);
    g.fillRect(x - w + 2, GROUND + 3, (w - 2) * 2, 1);
  }

  private presentDebris(d: Debris): void {
    d.img.setPosition(d.x, d.y);
    if (!d.canvas) return;
    const sprites = sourceSprites().props;
    const src = d.kind === 'stingby' ? sprites.stingby[0] : sprites[d.kind];
    // far: shrinks to a speck; drop: grows a little, as if it tumbled toward the camera
    const u = Math.min(1, d.t / FAR_TIME);
    const scale = d.fate === 'far' ? 1 - 0.86 * u ** 0.8 : 1 + Math.min(0.35, d.t * 0.6);
    // the tumble turns in 16 steps, so the pixels stay crisp
    const angle = (Math.round(d.spin * d.t * 16) / 16) * Math.PI * 2;
    const c = d.canvas.context;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SCRATCH, SCRATCH);
    c.translate(SCRATCH / 2, SCRATCH / 2);
    c.rotate(angle);
    c.scale(scale, scale);
    c.drawImage(src, -src.width / 2, -src.height / 2);
    d.canvas.refresh();
  }

  // ---- copies of a moment (fairness simulator) --------------------------------

  snapshot(): Snapshot {
    return {
      s: { ...this.s },
      g: { x: this.goomba.x, y: this.goomba.y, vy: this.body.velocity.y, on: this.body.enable },
      obs: this.obstacles.map((o) => ({ kind: o.kind, x: o.img.x, y: o.img.y, baseY: o.baseY, t: o.t, phase: o.phase, hint: o.hint })),
      picks: this.pickups.map((p) => ({ kind: p.kind, x: p.img.x, y: p.y, t: p.t })),
    };
  }

  restore(n: Snapshot): void {
    this.s = { ...n.s };
    for (const o of this.obstacles) this.releaseOb(o);
    for (const p of this.pickups) this.releasePick(p);
    this.obstacles = [];
    this.pickups = [];
    for (const o of n.obs) this.putObstacle(o.kind, o.x, o.y, o.baseY, o.t, o.phase, o.hint);
    for (const p of n.picks) this.addPickup(p.kind, p.x, p.y, p.t);
    this.body.enable = n.g.on;
    this.body.reset(n.g.x, n.g.y);
    this.body.velocity.y = n.g.vy;
    this.hitPending = false;
    this.touched.clear();
  }
}
