// Draws every app icon from the Goomba sprite. Pure node, no image tools.
//   node scripts/make-icons.ts -> public/icons/*.png (website, iPhone/iPad Home Screen, Mac Dock)
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildGoomba, GOOMBA_ANCHOR } from '../src/art/goomba.ts';
import { THEMES } from '../src/art/scenery.ts';
import { P } from '../src/art/palette.ts';
import { encodePng } from './png.ts';

const S = 1024;

interface Shape {
  /** margin around the artwork (macOS draws its icons inside one) */
  INSET: number;
  /** corner radius; 0 = full square, for iPhone and Android, which cut their own shape */
  RADIUS: number;
  /** screen pixels per sprite pixel */
  K: number;
}
const ROUNDED: Shape = { INSET: 100, RADIUS: 185, K: 22 };
const SQUARE: Shape = { INSET: 0, RADIUS: 0, K: 20 };

/** the icon at 1024x1024: the Goomba on a patch of the game's sky and grass */
function master({ INSET, RADIUS, K }: Shape): Uint8Array {
  const SIDE = S - INSET * 2;
  const GROUND_Y = INSET + Math.round((SIDE * 0.8) / K) * K;
  const px = new Uint8Array(S * S * 4);
  const inShape = (x: number, y: number): boolean => {
    const lx = x - INSET;
    const ly = y - INSET;
    if (lx < 0 || ly < 0 || lx >= SIDE || ly >= SIDE) return false;
    const dx = lx < RADIUS ? RADIUS - lx : lx >= SIDE - RADIUS ? lx - (SIDE - RADIUS - 1) : 0;
    const dy = ly < RADIUS ? RADIUS - ly : ly >= SIDE - RADIUS ? ly - (SIDE - RADIUS - 1) : 0;
    return dx * dx + dy * dy <= RADIUS * RADIUS;
  };
  const put = (x: number, y: number, c: number): void => {
    if (!inShape(x, y)) return;
    const i = (y * S + x) * 4;
    px[i] = (c >> 16) & 255;
    px[i + 1] = (c >> 8) & 255;
    px[i + 2] = c & 255;
    px[i + 3] = 255;
  };

  // backdrop: banded day sky, then grass and dirt, snapped to the sprite's pixel size
  const sky = THEMES.day.sky;
  for (let y = INSET; y < INSET + SIDE; y++) {
    const row = INSET + Math.floor((y - INSET) / K) * K;
    let c: number;
    if (row < GROUND_Y) c = sky[Math.min(sky.length - 1, Math.floor(((row - INSET) / (GROUND_Y - INSET)) * sky.length))];
    else if (row < GROUND_Y + K) c = P.grass[3];
    else if (row < GROUND_Y + K * 3) c = P.grass[2];
    else if (row < GROUND_Y + K * 4) c = P.grass[1];
    else c = P.dirt[2];
    for (let x = INSET; x < INSET + SIDE; x++) put(x, y, c);
  }

  // the hero, standing on the grass line
  const goomba = buildGoomba().idle[0];
  const left = Math.round(S / 2 - GOOMBA_ANCHOR.x * K);
  const top = GROUND_Y + K - GOOMBA_ANCHOR.y * K;
  for (let sy = 0; sy < goomba.h; sy++) {
    for (let sx = 0; sx < goomba.w; sx++) {
      const c = goomba.get(sx, sy);
      if (c < 0) continue;
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) put(left + sx * K + i, top + sy * K + j, c);
    }
  }
  return px;
}

/** area-average downscale (alpha-weighted, so the transparent corners do not darken the edge) */
function resize(src: Uint8Array, to: number): Uint8Array {
  if (to === S) return src;
  const out = new Uint8Array(to * to * 4);
  const r = S / to;
  for (let ty = 0; ty < to; ty++) {
    for (let tx = 0; tx < to; tx++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      let n = 0;
      for (let y = Math.floor(ty * r); y < Math.floor((ty + 1) * r); y++) {
        for (let x = Math.floor(tx * r); x < Math.floor((tx + 1) * r); x++) {
          const i = (y * S + x) * 4;
          const a = src[i + 3];
          rs += src[i] * a;
          gs += src[i + 1] * a;
          bs += src[i + 2] * a;
          as += a;
          n++;
        }
      }
      const o = (ty * to + tx) * 4;
      if (as > 0) {
        out[o] = Math.round(rs / as);
        out[o + 1] = Math.round(gs / as);
        out[o + 2] = Math.round(bs / as);
        out[o + 3] = Math.round(as / n);
      }
    }
  }
  return out;
}

const rounded = master(ROUNDED);
const square = master(SQUARE);
const png = (src: Uint8Array, size: number) => encodePng(size, size, resize(src, size));

const web = new URL('../public/icons/', import.meta.url).pathname;
mkdirSync(web, { recursive: true });
writeFileSync(web + 'icon-192.png', png(rounded, 192));
writeFileSync(web + 'icon-512.png', png(rounded, 512));
writeFileSync(web + 'icon-maskable-512.png', png(square, 512));
writeFileSync(web + 'apple-touch-icon.png', png(square, 180));
console.log('wrote 4 icons');
