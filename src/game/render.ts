import { DEDICATION, FAR_TIME, GROUND, H, PLAYER_X, W, type Debris, type Deco, type Game } from './game.ts';
import type { Img, Sprites } from './gfx.ts';
<<<<<<< HEAD
import { drawText, type TextOpts } from './text.ts';
=======
import { drawText, textWidth } from './text.ts';
>>>>>>> main
import { THEMES, TILE_W, type SkyTheme } from '../art/scenery.ts';
import { GOOMBA_ANCHOR } from '../art/goomba.ts';
import { RICHI_ANCHOR } from '../art/richi.ts';
import { hex } from '../art/palette.ts';

const INK = '#2a1810';
const CREAM = '#fff4d8';
const GOLD = '#f8d76a';
const PINK = '#ff7a98';

// day -> sunset -> night -> sunset(dawn) -> day
const CYCLE: (keyof typeof THEMES)[] = ['day', 'day', 'sunset', 'night', 'night', 'sunset'];
const SEGMENT = 16; // seconds per step

// The two HUD buttons, in game pixels: a plate big enough for a thumb, and a
// tap area that reaches a little past it (to the top edge and between the two).
const BTN_W = 24;
const BTN_H = 22;
const BTN_Y = 1;
const PAUSE_X = 135;
const SOUND_X = 161;
export const BTN_PAUSE = { x: PAUSE_X - 3, y: 0, w: BTN_W + 4, h: BTN_Y + BTN_H + 4 };
export const BTN_SOUND = { x: SOUND_X - 1, y: 0, w: BTN_W + 4, h: BTN_Y + BTN_H + 4 };

// 4x4 ordered-dither thresholds, for the sky gradient
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** calm blinking for prompts: visible for most of each period */
const blinkOn = (t: number, period = 1.2, share = 0.68) => t % period < period * share;

function mix(a: number, b: number, t: number): number {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t);
  const g = lerp((a >> 8) & 255, (b >> 8) & 255, t);
  const bl = lerp(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

interface Star {
  x: number;
  y: number;
  phase: number;
}

/** anything with a place in the world */
type Spot = { x: number; y?: number };

/** side of the game-resolution canvas that tumbling debris is turned on before it goes to the screen */
const SCRATCH = 96;
/** something that moved further than this in one step was put somewhere else, not moved: no in-between picture */
const TELEPORT = 24;

// Motion is drawn finer than the art. The canvas bitmap has `k` real pixels per
// game pixel, so sprites keep their chunky pixels but can sit between game
// pixels, and each frame shows the moment between the last two simulation steps
// that the screen is actually at. Whole-game-pixel steps at 60 Hz made the
// scrolling judder and the scenery slip against the ground.
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly s: Sprites;
  private readonly sky: HTMLCanvasElement;
  private skyKey = '';
  private readonly stars: Star[] = [];
  private readonly scratch: CanvasRenderingContext2D;
  /** real pixels per game pixel in the canvas bitmap */
  private k = 1;
  /** how far the picture is from the previous simulation step (0) to the current one (1) */
  private alpha = 1;
  /** where everything was one simulation step ago */
  private readonly was = new WeakMap<object, { x: number; y: number }>();
  private wasScroll: number | undefined;
  private wasGx: number | undefined;
  private wasGy: number | undefined;
  private wasRx: number | undefined;

  constructor(canvas: HTMLCanvasElement, sprites: Sprites) {
    this.ctx = canvas.getContext('2d')!;
    this.s = sprites;
    this.sky = document.createElement('canvas');
    this.sky.width = W;
    this.sky.height = H;
    const scratch = document.createElement('canvas');
    scratch.width = SCRATCH;
    scratch.height = SCRATCH;
    this.scratch = scratch.getContext('2d')!;
    this.scratch.imageSmoothingEnabled = false;
    for (let i = 0; i < 46; i++) {
      this.stars.push({ x: (i * 73 + 11) % W, y: (i * 37 + 5) % 96, phase: i * 1.7 });
    }
    this.resize(1);
  }

  /** sets the bitmap to `k` real pixels per game pixel (a whole number); this clears the canvas */
  resize(k: number): void {
    const canvas = this.ctx.canvas;
    this.k = k;
    if (canvas.width !== W * k || canvas.height !== H * k) {
      canvas.width = W * k;
      canvas.height = H * k;
    }
  }

  /** call right before every `game.update`: notes where everything is, so `draw` can show the moment between two steps */
  remember(g: Game): void {
    this.wasScroll = g.scroll;
    this.wasGx = g.gx;
    this.wasGy = g.gy;
    this.wasRx = g.rx;
    const lists: readonly (readonly Spot[])[] = [g.obstacles, g.pickups, g.decos, g.clouds, g.debris, g.particles];
    for (const list of lists) {
      for (const e of list) {
        const p = this.was.get(e);
        if (p) {
          p.x = e.x;
          p.y = e.y ?? 0;
        } else {
          this.was.set(e, { x: e.x, y: e.y ?? 0 });
        }
      }
    }
  }

  /** a value on its way from where it was one step ago to where it is now */
  private between(now: number, before: number | undefined): number {
    if (this.alpha >= 1 || before === undefined || Math.abs(now - before) > TELEPORT) return now;
    return before + (now - before) * this.alpha;
  }

  private ex(e: Spot): number {
    return this.between(e.x, this.was.get(e)?.x);
  }

  private ey(e: Spot & { y: number }): number {
    return this.between(e.y, this.was.get(e)?.y);
  }

  /** the nearest place on the screen's own pixel grid (in game pixels), so sprites stay crisp */
  private snap(v: number): number {
    return Math.round(v * this.k) / this.k;
  }

  /** how far into a repeating strip of `width` a scroll position is, on the screen's pixel grid */
  private wrap(scroll: number, width: number): number {
    return (Math.round(scroll * this.k) % (width * this.k)) / this.k;
  }

  /** bitmap text that travels with something in the world, placed as finely as the thing itself */
  private textAt(text: string, x: number, y: number, o: TextOpts): void {
    const ctx = this.ctx;
    const sx = this.snap(x);
    const sy = this.snap(y);
    ctx.save();
    ctx.translate(sx - Math.floor(sx), sy - Math.floor(sy));
    drawText(ctx, text, Math.floor(sx), Math.floor(sy), o);
    ctx.restore();
  }

  /** `alpha`: how far the picture is from the previous simulation step (0) to the current one (1) */
  draw(g: Game, alpha = 1): void {
    const ctx = this.ctx;
    this.alpha = alpha;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const scroll = this.between(g.scroll, this.wasScroll);
    const gx = this.between(g.gx, this.wasGx);
    const gy = this.between(g.gy, this.wasGy);
    const rx = this.between(g.rx, this.wasRx);
    ctx.save();
    if (g.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * g.shake), Math.round((Math.random() - 0.5) * g.shake));
    }

    // --- time of day ---------------------------------------------------------
    const pos = (g.dayClock / SEGMENT) % CYCLE.length;
    const i0 = Math.floor(pos);
    const nameA = CYCLE[i0];
    const nameB = CYCLE[(i0 + 1) % CYCLE.length];
    const A = THEMES[nameA];
    const B = THEMES[nameB];
    const raw = pos - i0;
    const t = raw * raw * (3 - 2 * raw);

    this.drawSky(A, B, t);
    ctx.drawImage(this.sky, 0, 0);

    const starA = lerp(A.stars, B.stars, t);
    if (starA > 0.02) {
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(g.time * 2 + st.phase);
        ctx.globalAlpha = starA * tw;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(st.x, st.y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // sun and moon ride on how "day" or "night" it is
    const dayness = lerp(nameA === 'day' ? 1 : 0, nameB === 'day' ? 1 : 0, t);
    const nightness = lerp(nameA === 'night' ? 1 : 0, nameB === 'night' ? 1 : 0, t);
    ctx.drawImage(this.s.scenery.sun, 196, this.snap(lerp(120, 18, dayness)));
    if (nightness > 0.01) ctx.drawImage(this.s.scenery.moon, 60, this.snap(lerp(130, 16, nightness)));

    for (const c of g.clouds) {
      ctx.globalAlpha = lerp(0.95, 0.5, nightness);
      ctx.drawImage(this.s.scenery.clouds[c.variant], this.snap(this.ex(c)), this.snap(this.ey(c)));
    }
    ctx.globalAlpha = 1;

    const farKey = { day: 'farDay', sunset: 'farSunset', night: 'farNight' } as const;
    const nearKey = { day: 'nearDay', sunset: 'nearSunset', night: 'nearNight' } as const;
    this.tile(this.s.scenery[farKey[nameA]], scroll * 0.12, GROUND - 58, 1);
    this.tile(this.s.scenery[farKey[nameB]], scroll * 0.12, GROUND - 58, t);
    this.tile(this.s.scenery[nearKey[nameA]], scroll * 0.3, GROUND - 40, 1);
    this.tile(this.s.scenery[nearKey[nameB]], scroll * 0.3, GROUND - 40, t);

    // --- ground plane --------------------------------------------------------
    for (const d of g.decos) if (d.kind.startsWith('tree') || d.kind === 'bush') this.deco(d);
    const ground = this.s.scenery.ground;
    const off = this.wrap(scroll, ground.width);
    for (let x = -off; x < W; x += ground.width) ctx.drawImage(ground, x, GROUND - 2);
    for (const d of g.decos) if (!d.kind.startsWith('tree') && d.kind !== 'bush') this.deco(d);

    // evening / night tint over the backdrop only, so the cast stays readable
    const tintA = lerp(A.tint[1], B.tint[1], t);
    if (tintA > 0.005) {
      ctx.globalAlpha = tintA;
      ctx.fillStyle = hex(mix(A.tint[1] > 0 ? A.tint[0] : B.tint[0], B.tint[1] > 0 ? B.tint[0] : A.tint[0], t));
      ctx.fillRect(-8, -8, W + 16, H + 16);
      ctx.globalAlpha = 1;
    }

    // --- actors ---------------------------------------------------------------
    this.shadow(gx, 9, g.hugging ? 0 : Math.max(0.25, 1 - (GROUND - g.gy) / 70));
    this.shadow(rx, 17, 1);

    // what Richi kicked into the distance or flattened stays behind the cast
    for (const d of g.debris) if (d.fate !== 'drop') this.debris(d);

    // richi
    const rFrames = this.s.richi[g.richiAnim];
    ctx.drawImage(rFrames[g.richiFrame % rFrames.length], this.snap(rx) - RICHI_ANCHOR.x, GROUND - RICHI_ANCHOR.y);

    for (const o of g.obstacles) {
      const ox = this.ex(o);
      const oy = this.ey(o);
      if (o.kind === 'stingby') {
        const f = Math.floor(o.t * 14) % 2;
        this.shadow(ox + 15, 7, 0.5);
        ctx.drawImage(this.s.props.stingby[f], this.snap(ox), this.snap(oy));
        if (o.hint) {
          this.textAt(o.hint, ox + 15, oy + 31, { align: 'center', color: CREAM, outline: INK });
        }
      } else {
        ctx.drawImage(this.s.props[o.kind], this.snap(ox), this.snap(oy));
      }
    }

    for (const p of g.pickups) {
      const bob = Math.round(Math.sin(g.time * 5 + p.t * 6) * 2);
      const img = p.kind === 'berry' ? this.s.props.berry : this.s.props.heart;
      const px = this.ex(p);
      const py = this.ey(p);
      ctx.drawImage(img, this.snap(px - img.width / 2), this.snap(py - img.height / 2) + bob);
      if (p.kind === 'heart' && Math.floor(g.time * 6) % 3 === 0) {
        ctx.drawImage(this.s.props.sparkle[1], this.snap(px + 3), this.snap(py - 9) + bob);
      }
    }

    // goomba: after a hit it fades in and out (gently, about 3 times a second) instead of vanishing
    const faded = g.invuln > 0 && g.mode === 'play' && Math.floor(g.time * 6.5) % 2 === 0;
    const gFrames = this.s.goomba[g.goombaAnim];
    let gImg: Img = Array.isArray(gFrames) ? gFrames[g.goombaFrame % gFrames.length] : gFrames;
    if (g.hitstop > 0) gImg = this.s.goombaFlash;
    ctx.globalAlpha = faded ? 0.4 : 1;
    ctx.drawImage(gImg, this.snap(gx) - GOOMBA_ANCHOR.x, this.snap(gy) - GOOMBA_ANCHOR.y);
    ctx.globalAlpha = 1;

    // ... and what he kicked over tumbles past in front of everything
    for (const d of g.debris) if (d.fate === 'drop') this.debris(d);

    this.particles(g);
    ctx.restore();

    this.hud(g);
    if (g.mode === 'title') this.title(g);
    if (g.mode === 'caught' && g.hugging) this.caughtBanner(g);
    if (g.mode === 'over') this.gameOver(g);
    if (g.paused) this.pauseOverlay(g);
  }

  // ---- pieces ---------------------------------------------------------------

  private drawSky(A: SkyTheme, B: SkyTheme, t: number): void {
    const q = Math.round(t * 48);
    const key = `${A.sky[0]}-${B.sky[0]}-${q}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const c = this.sky.getContext('2d')!;
    const n = A.sky.length;
    const cols = A.sky.map((a, i) => hex(mix(a, B.sky[i], q / 48)));
    const top = 0;
    const bottom = GROUND - 8;
    const band = (bottom - top) / n;
    for (let i = 0; i < n; i++) {
      const y0 = Math.round(top + i * band);
      const y1 = Math.round(top + (i + 1) * band);
      c.fillStyle = cols[i];
      c.fillRect(0, y0, W, y1 - y0);
    }
    c.fillStyle = cols[n - 1];
    c.fillRect(0, bottom, W, H - bottom);
    // ordered dithering across each band edge: a soft pixel-art gradient
    const half = 5;
    for (let i = 0; i < n - 1; i++) {
      const edge = Math.round(top + (i + 1) * band);
      for (let y = edge - half; y < edge + half; y++) {
        const amount = (y - (edge - half) + 0.5) / (half * 2); // 0 = band i, 1 = band i + 1
        const above = y < edge;
        c.fillStyle = cols[above ? i + 1 : i];
        for (let x = 0; x < W; x++) {
          const next = (BAYER[(x & 3) + ((y & 3) << 2)] + 0.5) / 16 < amount;
          if (next === above) c.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  private tile(img: Img, scroll: number, y: number, alpha: number): void {
    if (alpha <= 0.004) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const off = this.wrap(scroll, TILE_W);
    for (let x = -off; x < W; x += TILE_W) ctx.drawImage(img, x, y);
    ctx.globalAlpha = 1;
  }

  private deco(d: Deco): void {
    const sc = this.s.scenery;
    const img: Img =
      d.kind === 'tree0' ? sc.trees[0]
      : d.kind === 'tree1' ? sc.trees[1]
      : d.kind === 'bush' ? sc.bush
      : d.kind === 'tuft' ? sc.tuft
      : sc.flowers[Number(d.kind.slice(-1))];
    this.ctx.drawImage(img, this.snap(this.ex(d)), GROUND + 2 - img.height);
  }

  private shadow(x: number, half: number, k: number): void {
    if (k <= 0) return;
    const ctx = this.ctx;
    const w = Math.round(half * k);
    const cx = this.snap(x);
    ctx.fillStyle = 'rgba(30, 50, 30, 0.28)';
    ctx.fillRect(cx - w + 2, GROUND, (w - 2) * 2, 1);
    ctx.fillRect(cx - w, GROUND + 1, w * 2, 2);
    ctx.fillRect(cx - w + 2, GROUND + 3, (w - 2) * 2, 1);
  }

  private debris(d: Debris): void {
    const ctx = this.ctx;
    const dx = this.ex(d);
    const dy = this.ey(d);
    if (d.fate === 'squash') {
      const flat = this.s.props.stingbyFlat;
      ctx.drawImage(flat, this.snap(dx - flat.width / 2), this.snap(dy - flat.height / 2));
      return;
    }
    const img = d.kind === 'stingby' ? this.s.props.stingby[0] : this.s.props[d.kind];
    // far: shrinks to a speck; drop: grows a little, as if it tumbled toward the camera
    const u = Math.min(1, d.t / FAR_TIME);
    const scale = d.fate === 'far' ? 1 - 0.86 * u ** 0.8 : 1 + Math.min(0.35, d.t * 0.6);
    // the tumble turns in 16 steps, so the pixels stay crisp
    const angle = (Math.round(d.spin * d.t * 16) / 16) * Math.PI * 2;
    // turned and resized at game resolution, so it keeps the same chunky pixels as everything else
    const s = this.scratch;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, SCRATCH, SCRATCH);
    s.translate(SCRATCH / 2, SCRATCH / 2);
    s.rotate(angle);
    s.scale(scale, scale);
    s.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.drawImage(s.canvas, this.snap(dx) - SCRATCH / 2, this.snap(dy) - SCRATCH / 2);
  }

  private particles(g: Game): void {
    const ctx = this.ctx;
    for (const p of g.particles) {
      const u = p.life / p.max;
      const px = this.ex(p);
      const py = this.ey(p);
      if (p.kind === 'dust') {
        const img = this.s.props.dust[Math.min(2, Math.floor(u * 3))];
        ctx.globalAlpha = 0.85 - u * 0.5;
        ctx.drawImage(img, this.snap(px - 4), this.snap(py - 4));
      } else if (p.kind === 'sparkle') {
        const img = this.s.props.sparkle[Math.floor(u * 4) % 4];
        ctx.drawImage(img, this.snap(px - 3), this.snap(py - 3));
      } else if (p.kind === 'impact') {
        const img = this.s.props.impact[u < 0.45 ? 0 : 1];
        ctx.drawImage(img, this.snap(px - 8), this.snap(py - 8));
      } else if (p.kind === 'twinkle') {
        const img = this.s.props.sparkle[Math.min(3, Math.floor(u * 4))];
        ctx.drawImage(img, this.snap(px - 3), this.snap(py - 3));
      } else if (p.kind === 'heart') {
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.drawImage(this.s.props.miniHeart[p.variant], this.snap(px - 2), this.snap(py - 2));
      } else if (p.text) {
        ctx.globalAlpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        this.textAt(p.text, px, py, { align: 'center', color: p.text === '<' ? PINK : GOLD, outline: INK });
      }
      ctx.globalAlpha = 1;
    }
  }

  private hud(g: Game): void {
    const ctx = this.ctx;
    // '@' / '%' are the speaker glyphs, '#' the pause bars
    this.button(SOUND_X, g.muted ? '%' : '@', g.muted ? '#b9a9a0' : CREAM);
    if (g.mode === 'play') this.button(PAUSE_X, '#', CREAM);
    if (g.banner) {
      const u = g.banner.t;
      const pop = Math.min(1, u * 8);
      ctx.globalAlpha = u > 1.3 ? Math.max(0, (1.7 - u) / 0.4) : 1;
      drawText(ctx, g.banner.text, W / 2, 44 - Math.round((1 - pop) * 6), {
        align: 'center', scale: 2, color: GOLD, outline: INK,
      });
      ctx.globalAlpha = 1;
    }
    if (g.mode === 'title') return;
    for (let i = 0; i < 3; i++) {
      const img = i < g.lives ? this.s.props.heartHud : this.s.props.heartEmpty;
      const pulse = i === g.lives - 1 && g.lives === 1 && g.mode === 'play' ? Math.round(Math.sin(g.time * 6)) : 0;
      ctx.drawImage(img, 5 + i * 12, 5 + pulse);
    }
    if (g.mode === 'over') return;
    drawText(ctx, String(g.score).padStart(5, '0'), W - 6, 6, { align: 'right', scale: 2, color: CREAM, outline: INK });
    ctx.drawImage(this.s.props.berry, W - 78, 3);
    drawText(ctx, String(g.berries), W - 80, 8, { align: 'right', color: CREAM, outline: INK });
    drawText(ctx, `BEST ${g.best}`, W - 6, 24, { align: 'right', color: GOLD, outline: INK });
  }

  private title(g: Game): void {
    const ctx = this.ctx;
    const word = 'GOOMBA RUN';
    // each letter bobs on its own
    let x = W / 2 - (word.length * 6 * 4 - 4) / 2;
    for (let i = 0; i < word.length; i++) {
      const dy = Math.round(Math.sin(g.time * 3 + i * 0.6) * 2);
      const narrow = word[i] === 'I' ? 2 : word[i] === ' ' ? 2 : 0;
      drawText(ctx, word[i], x, 30 + dy, { scale: 4, color: i < 6 ? '#eaa862' : CREAM, outline: INK, shadow: '#7a3a20' });
      x += (6 - narrow) * 4;
    }
    drawText(ctx, "DON'T LET RICHI CATCH YOU!", W / 2, 72, { align: 'center', color: CREAM, outline: INK });
    if (blinkOn(g.time)) {
      drawText(ctx, g.touch ? 'TAP TO START' : 'PRESS SPACE OR TAP', W / 2, 92, {
        align: 'center', color: GOLD, outline: INK,
      });
    }
    if (DEDICATION) drawText(ctx, `${DEDICATION} <`, W / 2, 108, { align: 'center', color: PINK, outline: INK });
    const help = g.touch
      ? 'TAP: JUMP   TAP AGAIN IN THE AIR: DOUBLE JUMP'
      : 'SPACE: JUMP x2  P: PAUSE  M: SOUND  F: FULLSCREEN';
    drawText(ctx, help, W / 2, H - 12, { align: 'center', color: CREAM, outline: INK });
    if (g.best > 0) drawText(ctx, `BEST ${g.best}`, W - 6, 6, { align: 'right', color: GOLD, outline: INK });
    // a little hint arrow over the hero
    const bob = Math.round(Math.sin(g.time * 5) * 2);
    drawText(ctx, 'YOU', PLAYER_X + 1, GROUND - 40 + bob, { align: 'center', color: CREAM, outline: INK });
  }

  private caughtBanner(g: Game): void {
    const pop = Math.min(1, (g.modeT - 0.5) * 6);
    if (pop <= 0) return;
    drawText(this.ctx, 'GOTCHA!', W / 2, 40 - Math.round((1 - pop) * 10), {
      align: 'center', scale: 3, color: PINK, outline: INK, shadow: '#7a1a3a',
    });
  }

  private gameOver(g: Game): void {
    const ctx = this.ctx;
    const w = 168;
    const h = 78;
    const x = W - w - 10;
    const y = 18;
    this.panel(x, y, w, h);
    drawText(ctx, 'RICHI CAUGHT YOU <', x + w / 2, y + 9, { align: 'center', color: PINK, outline: INK });
    drawText(ctx, String(g.score), x + w / 2, y + 23, { align: 'center', scale: 3, color: CREAM, outline: INK });
    drawText(ctx, `${g.meters} M   ${g.berries} BERRIES`, x + w / 2, y + 49, { align: 'center', color: CREAM, outline: INK });
    if (g.newBest) {
      if (blinkOn(g.modeT, 0.9, 0.7)) {
        drawText(ctx, 'NEW BEST!', x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
      }
    } else {
      drawText(ctx, `BEST ${g.best}`, x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
    }
    if (g.modeT > 0.45 && blinkOn(g.modeT - 0.45)) {
      drawText(ctx, g.touch ? 'TAP TO RUN AGAIN' : 'SPACE OR TAP TO RUN AGAIN', x + w / 2, y + h + 6, {
        align: 'center', color: CREAM, outline: INK,
      });
    }
  }

  private pauseOverlay(g: Game): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(27, 20, 48, 0.55)';
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'PAUSED', W / 2, 66, { align: 'center', scale: 3, color: CREAM, outline: INK });
    drawText(ctx, g.touch ? 'TAP TO RESUME' : 'P OR SPACE TO RESUME', W / 2, 98, {
      align: 'center', color: GOLD, outline: INK,
    });
  }

  /** a HUD button: a small plate with a double-size glyph centred on it */
  private button(x: number, glyph: string, color: string): void {
    this.panel(x, BTN_Y, BTN_W, BTN_H);
    const w = textWidth(glyph) * 2;
    drawText(this.ctx, glyph, x + Math.round((BTN_W - w) / 2), BTN_Y + 4, { scale: 2, color });
  }

  private panel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = INK;
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#5a3420';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#3c2030';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#4a2a3e';
    ctx.fillRect(x + 3, y + 3, w - 6, 2);
  }
}
