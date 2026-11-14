// Tiny pixel-art painter. Pure data (no DOM) so the same code feeds the game
// (ImageData) and the PNG bake script (node).

export const CLEAR = -1;

export type Ramp = readonly number[]; // dark -> light, 0xRRGGBB

export interface ShadeOpts {
  /** light direction, pointing toward the light (default top-left) */
  lx?: number;
  ly?: number;
  /** thresholds between ramp steps, ascending; length = ramp.length - 1 */
  bands?: readonly number[];
}

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Int32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Int32Array(w * h).fill(CLEAR);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.d[y * this.w + x] : CLEAR;
  }

  set(x: number, y: number, c: number): this {
    x = Math.round(x);
    y = Math.round(y);
    if (this.inside(x, y)) this.d[y * this.w + x] = c;
    return this;
  }

  /** set only where a pixel already exists (optionally only over given colours) */
  over(x: number, y: number, c: number, only?: readonly number[]): this {
    x = Math.round(x);
    y = Math.round(y);
    const cur = this.get(x, y);
    if (cur === CLEAR) return this;
    if (only && !only.includes(cur)) return this;
    this.d[y * this.w + x] = c;
    return this;
  }

  px(points: readonly (readonly [number, number])[], c: number): this {
    for (const [x, y] of points) this.set(x, y, c);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  /** rows of characters mapped through a legend; ' ' and '.' are skipped */
  rows(x: number, y: number, rows: readonly string[], legend: Record<string, number>): this {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === ' ' || ch === '.') return;
        const c = legend[ch];
        if (c !== undefined) this.set(x + i, y + j, c);
      });
    });
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1): this {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick, c);
    }
    return this;
  }

  /** round-ish brush centred on (x, y) */
  dot(x: number, y: number, size: number, c: number): this {
    if (size <= 1) return this.set(x, y, c);
    const r = size / 2;
    const x0 = Math.floor(x - r);
    const y0 = Math.floor(y - r);
    for (let j = y0; j <= y0 + size + 1; j++) {
      for (let i = x0; i <= x0 + size + 1; i++) {
        const dx = i + 0.5 - (x + 0.5);
        const dy = j + 0.5 - (y + 0.5);
        if (dx * dx + dy * dy <= r * r + 0.3) this.set(i, j, c);
      }
    }
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
    this.eachInEllipse(cx, cy, rx, ry, (x, y) => this.set(x, y, c));
    return this;
  }

  /** ellipse shaded with a colour ramp: lit from the top-left, darker toward the rim */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, o: ShadeOpts = {}): this {
    this.eachInEllipse(cx, cy, rx, ry, (x, y, nx, ny) => this.set(x, y, shade(nx, ny, ramp, o)));
    return this;
  }

  /** any shape (test gets pixel centres), shaded as if it were the ellipse (cx, cy, rx, ry) */
  blob(
    test: (x: number, y: number) => boolean,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ramp: Ramp,
    o: ShadeOpts = {},
  ): this {
    for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) {
      for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
        if (!test(x + 0.5, y + 0.5)) continue;
        this.set(x, y, shade((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry, ramp, o));
      }
    }
    return this;
  }

  private eachInEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fn: (x: number, y: number, nx: number, ny: number) => void,
  ): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) fn(x, y, nx, ny);
      }
    }
  }

  /** 1px outline around everything opaque (sprite needs a 1px empty margin) */
  outline(c: number, diagonal = false): this {
    const src = this.d.slice();
    const at = (x: number, y: number) => (this.inside(x, y) ? src[y * this.w + x] : CLEAR);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) !== CLEAR) continue;
        let touch =
          at(x - 1, y) !== CLEAR || at(x + 1, y) !== CLEAR || at(x, y - 1) !== CLEAR || at(x, y + 1) !== CLEAR;
        if (!touch && diagonal) {
          touch =
            at(x - 1, y - 1) !== CLEAR ||
            at(x + 1, y - 1) !== CLEAR ||
            at(x - 1, y + 1) !== CLEAR ||
            at(x + 1, y + 1) !== CLEAR;
        }
        if (touch) this.d[y * this.w + x] = c;
      }
    }
    return this;
  }

  replace(from: number, to: number): this {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] === from) this.d[i] = to;
    return this;
  }

  /** every opaque pixel becomes c (used for hit flashes and silhouettes) */
  tint(c: number): Pix {
    const out = new Pix(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) out.d[i] = this.d[i] === CLEAR ? CLEAR : c;
    return out;
  }

  stamp(src: Pix, dx: number, dy: number): this {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.d[y * src.w + x];
        if (c !== CLEAR) this.set(dx + x, dy + y, c);
      }
    }
    return this;
  }

  flip(): Pix {
    const out = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    }
    return out;
  }

  clone(): Pix {
    const out = new Pix(this.w, this.h);
    out.d.set(this.d);
    return out;
  }

  /** tight bounding box of opaque pixels: [x, y, w, h] */
  bounds(): [number, number, number, number] {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.d[y * this.w + x] === CLEAR) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }

  rgba(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i];
      if (c === CLEAR) continue;
      out[i * 4] = (c >> 16) & 255;
      out[i * 4 + 1] = (c >> 8) & 255;
      out[i * 4 + 2] = c & 255;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}

function shade(nx: number, ny: number, ramp: Ramp, o: ShadeOpts): number {
  const bands = o.bands ?? defaultBands(ramp.length);
  const lit = nx * (o.lx ?? -0.55) + ny * (o.ly ?? -0.75);
  const v = lit * 0.7 + (1 - Math.min(1, nx * nx + ny * ny)) * 0.3;
  let i = 0;
  while (i < bands.length && v >= bands[i]) i++;
  return ramp[i];
}

/** point-in-ellipse helper for blob() tests */
export function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function defaultBands(n: number): number[] {
  if (n === 2) return [0.05];
  if (n === 3) return [-0.2, 0.38];
  if (n === 4) return [-0.22, 0.3, 0.56];
  return Array.from({ length: n - 1 }, (_, i) => -0.3 + (i * 0.9) / (n - 1));
}

/** deterministic PRNG so generated art is identical on every run */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
