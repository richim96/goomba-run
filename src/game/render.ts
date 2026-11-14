import { DEDICATION, GROUND, H, PLAYER_X, W, type Deco, type Game } from './game.ts';
import type { Img, Sprites } from './gfx.ts';
import { drawText } from './text.ts';
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly s: Sprites;
  private readonly sky: HTMLCanvasElement;
  private skyKey = '';
  private readonly stars: Star[] = [];

  constructor(canvas: HTMLCanvasElement, sprites: Sprites) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.s = sprites;
    this.sky = document.createElement('canvas');
    this.sky.width = W;
    this.sky.height = H;
    for (let i = 0; i < 46; i++) {
      this.stars.push({ x: (i * 73 + 11) % W, y: (i * 37 + 5) % 96, phase: i * 1.7 });
    }
  }

  draw(g: Game): void {
    const ctx = this.ctx;
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
    ctx.drawImage(this.s.scenery.sun, 236, Math.round(lerp(120, 14, dayness)));
    if (nightness > 0.01) ctx.drawImage(this.s.scenery.moon, 60, Math.round(lerp(130, 16, nightness)));

    for (const c of g.clouds) {
      ctx.globalAlpha = lerp(0.95, 0.5, nightness);
      ctx.drawImage(this.s.scenery.clouds[c.variant], Math.round(c.x), Math.round(c.y));
    }
    ctx.globalAlpha = 1;

    const farKey = { day: 'farDay', sunset: 'farSunset', night: 'farNight' } as const;
    const nearKey = { day: 'nearDay', sunset: 'nearSunset', night: 'nearNight' } as const;
    this.tile(this.s.scenery[farKey[nameA]], g.scroll * 0.12, GROUND - 58, 1);
    this.tile(this.s.scenery[farKey[nameB]], g.scroll * 0.12, GROUND - 58, t);
    this.tile(this.s.scenery[nearKey[nameA]], g.scroll * 0.3, GROUND - 40, 1);
    this.tile(this.s.scenery[nearKey[nameB]], g.scroll * 0.3, GROUND - 40, t);

    // --- ground plane --------------------------------------------------------
    for (const d of g.decos) if (d.kind.startsWith('tree') || d.kind === 'bush') this.deco(d);
    const ground = this.s.scenery.ground;
    const off = Math.floor(g.scroll) % ground.width;
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
    this.shadow(g.gx, 9, g.hugging ? 0 : Math.max(0.25, 1 - (GROUND - g.gy) / 70));
    this.shadow(g.rx, 17, 1);

    for (const o of g.obstacles) {
      if (o.kind === 'stingby') {
        const f = Math.floor(o.t * 14) % 2;
        this.shadow(o.x + 15, 7, 0.5);
        ctx.drawImage(this.s.props.stingby[f], Math.round(o.x), Math.round(o.y));
      } else {
        ctx.drawImage(this.s.props[o.kind], Math.round(o.x), Math.round(o.y));
      }
    }

    for (const p of g.pickups) {
      const bob = Math.round(Math.sin(g.time * 5 + p.t * 6) * 2);
      const img = p.kind === 'berry' ? this.s.props.berry : this.s.props.heart;
      ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height / 2) + bob);
      if (p.kind === 'heart' && Math.floor(g.time * 6) % 3 === 0) {
        ctx.drawImage(this.s.props.sparkle[1], Math.round(p.x + 3), Math.round(p.y - 9) + bob);
      }
    }

    // richi
    const rFrames = this.s.richi[g.richiAnim];
    const rImg: Img = Array.isArray(rFrames) ? rFrames[g.richiFrame % rFrames.length] : rFrames;
    ctx.drawImage(rImg, Math.round(g.rx) - RICHI_ANCHOR.x, Math.round(g.ry) - RICHI_ANCHOR.y);

    // goomba (blinks while invulnerable)
    const blink = g.invuln > 0 && g.mode === 'play' && Math.floor(g.time * 16) % 2 === 0;
    if (!blink) {
      const gFrames = this.s.goomba[g.goombaAnim];
      let gImg: Img = Array.isArray(gFrames) ? gFrames[g.goombaFrame % gFrames.length] : gFrames;
      if (g.hitstop > 0) gImg = this.s.goombaFlash;
      ctx.drawImage(gImg, Math.round(g.gx) - GOOMBA_ANCHOR.x, Math.round(g.gy) - GOOMBA_ANCHOR.y);
    }

    this.particles(g);
    ctx.restore();

    this.hud(g);
    if (g.mode === 'title') this.title(g);
    if (g.mode === 'caught' && g.hugging) this.caughtBanner(g);
    if (g.mode === 'over') this.gameOver(g);
    if (g.paused) this.pauseOverlay();
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
      // two dithered rows blend each band into the next
      if (i < n - 1) {
        c.fillStyle = cols[i + 1];
        for (let x = 0; x < W; x += 2) {
          c.fillRect(x, y1 - 2, 1, 1);
          c.fillRect(x + 1, y1 - 1, 1, 1);
          if (x % 4 === 0) c.fillRect(x + 2, y1 - 3, 1, 1);
        }
      }
    }
    c.fillStyle = cols[n - 1];
    c.fillRect(0, bottom, W, H - bottom);
  }

  private tile(img: Img, scroll: number, y: number, alpha: number): void {
    if (alpha <= 0.004) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const off = Math.floor(scroll) % TILE_W;
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
    this.ctx.drawImage(img, Math.round(d.x), GROUND + 2 - img.height);
  }

  private shadow(x: number, half: number, k: number): void {
    if (k <= 0) return;
    const ctx = this.ctx;
    const w = Math.round(half * k);
    ctx.fillStyle = 'rgba(30, 50, 30, 0.28)';
    ctx.fillRect(Math.round(x) - w + 2, GROUND, (w - 2) * 2, 1);
    ctx.fillRect(Math.round(x) - w, GROUND + 1, w * 2, 2);
    ctx.fillRect(Math.round(x) - w + 2, GROUND + 3, (w - 2) * 2, 1);
  }

  private particles(g: Game): void {
    const ctx = this.ctx;
    for (const p of g.particles) {
      const u = p.life / p.max;
      if (p.kind === 'dust') {
        const img = this.s.props.dust[Math.min(2, Math.floor(u * 3))];
        ctx.globalAlpha = 0.85 - u * 0.5;
        ctx.drawImage(img, Math.round(p.x - 4), Math.round(p.y - 4));
      } else if (p.kind === 'sparkle') {
        const img = this.s.props.sparkle[Math.floor(u * 4) % 4];
        ctx.drawImage(img, Math.round(p.x - 3), Math.round(p.y - 3));
      } else if (p.kind === 'heart') {
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.drawImage(this.s.props.miniHeart[p.variant], Math.round(p.x - 2), Math.round(p.y - 2));
      } else if (p.text) {
        ctx.globalAlpha = u > 0.6 ? (1 - u) / 0.4 : 1;
        drawText(ctx, p.text, p.x, p.y, { align: 'center', color: p.text === '<' ? PINK : GOLD, outline: INK });
      }
      ctx.globalAlpha = 1;
    }
  }

  private hud(g: Game): void {
    const ctx = this.ctx;
    if (g.mode === 'title') return;
    for (let i = 0; i < 3; i++) {
      const img = i < g.lives ? this.s.props.heartHud : this.s.props.heartEmpty;
      const pulse = i === g.lives - 1 && g.lives === 1 && g.mode === 'play' ? Math.round(Math.sin(g.time * 10)) : 0;
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
    if (Math.floor(g.time * 2.2) % 2 === 0) {
      drawText(ctx, 'PRESS SPACE OR TAP', W / 2, 92, { align: 'center', scale: 1, color: GOLD, outline: INK });
    }
    if (DEDICATION) drawText(ctx, `${DEDICATION} <`, W / 2, 108, { align: 'center', color: PINK, outline: INK });
    drawText(ctx, 'SPACE: JUMP x2   P: PAUSE   M: SOUND', W / 2, H - 12, { align: 'center', color: CREAM, outline: INK });
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
      if (Math.floor(g.time * 4) % 2 === 0) {
        drawText(ctx, 'NEW BEST!', x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
      }
    } else {
      drawText(ctx, `BEST ${g.best}`, x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
    }
    if (g.modeT > 0.45 && Math.floor(g.time * 2.2) % 2 === 0) {
      drawText(ctx, 'SPACE OR TAP TO RUN AGAIN', x + w / 2, y + h + 6, { align: 'center', color: CREAM, outline: INK });
    }
  }

  private pauseOverlay(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(27, 20, 48, 0.55)';
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'PAUSED', W / 2, 66, { align: 'center', scale: 3, color: CREAM, outline: INK });
    drawText(ctx, 'P OR SPACE TO RESUME', W / 2, 98, { align: 'center', color: GOLD, outline: INK });
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
