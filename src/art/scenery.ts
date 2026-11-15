import { CLEAR, Pix, rng } from './pix.ts';
import { P } from './palette.ts';

// Backdrop pieces. Hills and ground are 320px-periodic so they tile seamlessly.

export const TILE_W = 320;

export interface SkyTheme {
  /** top -> horizon colours */
  sky: readonly number[];
  far: readonly number[];
  near: readonly number[];
  /** tint laid over the playfield (colour, alpha) */
  tint: readonly [number, number];
  stars: number;
}

export const THEMES: Record<'day' | 'sunset' | 'night', SkyTheme> = {
  day: {
    sky: [0x5fb4ee, 0x7cc6f4, 0x9ed8f8, 0xc2e8fb, 0xe2f5fc, 0xfdf3dc],
    far: [0x7fb8c4, 0x9ccfd0, 0xbfe3d6],
    near: [0x3f9a58, 0x5fb85e, 0x8fd670],
    // a pale haze over the backdrop: the scenery was more colourful than the cast and
    // the cactus almost the colour of the hills, which the owner found uncomfortable to
    // read. This strength puts the scenery below the cast without changing sky brightness.
    tint: [0xc8dcec, 0.32],
    stars: 0,
  },
  sunset: {
    sky: [0x5a4a9c, 0x8a5aa8, 0xc86a9a, 0xf08a7a, 0xf8b070, 0xfdd98a],
    far: [0x8a5a90, 0xa8709a, 0xd08a9c],
    near: [0x3a6a5a, 0x4f8a5c, 0x7fae62],
    // the same haze in the evening's own colour: a dusty peach (was a thin orange glaze)
    tint: [0xe4c4b8, 0.45],
    stars: 0.25,
  },
  night: {
    sky: [0x141038, 0x1c1a50, 0x262a6a, 0x34408a, 0x4a5aa2, 0x6a78b4],
    far: [0x2a3068, 0x364080, 0x4a589a],
    near: [0x1e4a52, 0x2a6258, 0x3f8062],
    // ... and at night a muted slate blue (was a thin, strong indigo)
    tint: [0x464c60, 0.78],
    stars: 1,
  },
};

function ridge(x: number, seed: number, amp: number): number {
  const k = (Math.PI * 2 * x) / TILE_W;
  return (
    amp *
    (0.55 * Math.sin(k * 2 + seed) + 0.3 * Math.sin(k * 5 + seed * 2.3) + 0.15 * Math.sin(k * 9 + seed * 4.1))
  );
}

export function hills(ramp: readonly number[], kind: 'far' | 'near'): Pix {
  const h = kind === 'far' ? 64 : 46;
  const s = new Pix(TILE_W, h);
  const amp = kind === 'far' ? 13 : 7;
  const base = kind === 'far' ? 18 : 14;
  const seed = kind === 'far' ? 1.7 : 4.2;
  const r = rng(kind === 'far' ? 5 : 9);
  const top: number[] = [];
  for (let x = 0; x < TILE_W; x++) {
    const y0 = Math.round(base + ridge(x, seed, amp));
    top.push(y0);
    for (let y = y0; y < h; y++) {
      const d = y - y0;
      s.set(x, y, d < 2 ? ramp[2] : d > 16 + ((x * 7) % 5) ? ramp[0] : ramp[1]);
    }
  }
  // soft texture: scattered dashes
  for (let i = 0; i < (kind === 'far' ? 90 : 140); i++) {
    const x = Math.floor(r() * TILE_W);
    const y = top[x] + 4 + Math.floor(r() * (h - top[x] - 5));
    const c = r() < 0.5 ? ramp[0] : ramp[2];
    s.over(x, y, c);
    s.over((x + 1) % TILE_W, y, c);
  }
  if (kind === 'near') {
    // baked-in tiny trees along the ridge
    for (let i = 0; i < 11; i++) {
      const x = Math.floor(r() * (TILE_W - 12)) + 6;
      const y = top[x];
      const big = r() < 0.5;
      const rr = big ? 4 : 3;
      s.rect(x, y - 3, 1, 4, ramp[0]);
      s.ball(x + 0.5, y - 3 - rr, rr, rr, [ramp[0], ramp[1], ramp[2]], { bands: [-0.15, 0.4] });
    }
  }
  return s;
}

export function ground(): Pix {
  const w = 64;
  const h = 34;
  const s = new Pix(w, h);
  const r = rng(21);
  for (let x = 0; x < w; x++) {
    for (let y = 2; y < h; y++) {
      let c: number;
      if (y < 4) c = P.grass[3];
      else if (y < 7) c = P.grass[2];
      else if (y < 9) c = P.grass[1];
      else if (y < 10) c = P.dirt[0];
      else if (y < 22) c = P.dirt[2];
      else c = P.dirt[1];
      s.set(x, y, c);
    }
    // grass blades poking up and hanging over the dirt
    if (x % 4 === 1) s.set(x, 1, P.grass[3]);
    if (x % 8 === 5) {
      s.set(x, 1, P.grass[2]);
      s.set(x, 0, P.grass[3]);
    }
    if (x % 5 === 2) s.set(x, 9, P.grass[1]);
    if (x % 7 === 3) {
      s.set(x, 9, P.grass[1]);
      s.set(x, 10, P.grass[0]);
    }
  }
  // grass shading flecks
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * w);
    s.set(x, 4 + Math.floor(r() * 3), r() < 0.5 ? P.grass[3] : P.grass[1]);
  }
  // pebbles and specks in the dirt
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * (w - 3));
    const y = 12 + Math.floor(r() * (h - 14));
    const c = r() < 0.5 ? P.dirt[3] : P.dirt[1];
    s.set(x, y, c);
    s.set(x + 1, y, c);
    if (r() < 0.35) s.set(x, y + 1, P.dirt[0]);
  }
  for (let i = 0; i < 5; i++) {
    const x = 4 + Math.floor(r() * (w - 10));
    const y = 14 + Math.floor(r() * 12);
    s.rect(x, y, 3, 2, P.dirt[3]);
    s.set(x + 3, y + 1, P.dirt[0]);
    s.rect(x, y + 2, 3, 1, P.dirt[0]);
  }
  return s;
}

export function cloud(variant: number): Pix {
  const specs: [number, number, [number, number, number, number][]][] = [
    [
      44,
      18,
      [
        [10, 12, 8, 5],
        [20, 9, 9, 8],
        [31, 11, 9, 6],
        [22, 13, 16, 4],
      ],
    ],
    [
      30,
      13,
      [
        [8, 9, 6, 4],
        [15, 7, 7, 6],
        [22, 9, 6, 4],
      ],
    ],
    [
      58,
      20,
      [
        [12, 14, 9, 5],
        [24, 10, 10, 9],
        [36, 9, 9, 8],
        [46, 13, 9, 6],
        [30, 15, 20, 4],
      ],
    ],
  ];
  const [w, h, balls] = specs[variant];
  const s = new Pix(w, h);
  for (const [cx, cy, rx, ry] of balls) s.ball(cx, cy, rx, ry, P.cloud, { bands: [-0.42, 0.1] });
  // flat belly
  for (let y = h - 2; y < h; y++) for (let x = 0; x < w; x++) s.d[y * w + x] = CLEAR;
  return s;
}

export function sun(): Pix {
  const s = new Pix(30, 30);
  // dithered halo
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      const d = Math.hypot(x + 0.5 - 15, y + 0.5 - 15);
      if (d < 14 && d >= 10 && (x + y) % 2 === 0) s.set(x, y, 0xfff0b0);
    }
  }
  s.ball(15, 15, 10, 10, [0xf8c84a, 0xffe07a, 0xfff4b8], { bands: [-0.3, 0.3] });
  return s;
}

export function moon(): Pix {
  const s = new Pix(22, 22);
  s.ball(11, 11, 9, 9, [0xc8cfe8, 0xe8ecfa, 0xffffff], { bands: [-0.3, 0.35] });
  // bite out a crescent
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < 22; x++) {
      if (Math.hypot(x + 0.5 - 15.5, y + 0.5 - 8.5) < 7.6) s.d[y * 22 + x] = CLEAR;
    }
  }
  return s;
}

export function tree(kind: 'green' | 'blossom'): Pix {
  const s = new Pix(34, 44);
  const g = 42;
  const ramp =
    kind === 'green' ? [P.grass[0], P.grass[1], P.grass[2], P.grass[3]] : [P.pink[0], P.pink[1], P.pink[2], 0xffe6ee];
  // trunk
  for (let y = 24; y <= g; y++) {
    const wide = y > g - 3 ? 1 : 0;
    for (let x = 14 - wide; x <= 18 + wide; x++) s.set(x, y, x < 16 ? P.wood[2] : x < 18 ? P.wood[1] : P.wood[0]);
  }
  s.line(16, 28, 21, 23, P.wood[1], 2);
  // canopy
  const balls: [number, number, number][] = [
    [10, 19, 8],
    [23, 18, 8.5],
    [16, 11, 9.5],
    [16.5, 21, 8],
  ];
  for (const [cx, cy, r] of balls) s.ball(cx, cy, r, r * 0.92, ramp, { bands: [-0.28, 0.2, 0.52] });
  const r = rng(kind === 'green' ? 3 : 8);
  for (let i = 0; i < 16; i++) {
    const x = 4 + Math.floor(r() * 26);
    const y = 4 + Math.floor(r() * 22);
    s.over(x, y, r() < 0.5 ? ramp[3] : ramp[0], ramp);
  }
  if (kind === 'green') {
    // a few apples
    for (const [x, y] of [
      [9, 20],
      [22, 14],
      [18, 23],
    ])
      s.over(x, y, P.berry[1], ramp);
  }
  return s.outline(P.outline);
}

export function bush(): Pix {
  const s = new Pix(24, 14);
  const ramp = [P.grass[0], P.grass[1], P.grass[2], P.grass[3]];
  s.ball(7, 9, 5.6, 4.6, ramp, { bands: [-0.25, 0.2, 0.52] });
  s.ball(16.5, 9.5, 6, 4.4, ramp, { bands: [-0.25, 0.2, 0.52] });
  s.ball(12, 7, 6, 5.4, ramp, { bands: [-0.25, 0.2, 0.52] });
  for (let y = 13; y < 14; y++) for (let x = 0; x < 24; x++) s.d[y * 24 + x] = CLEAR;
  for (const [x, y] of [
    [8, 8],
    [14, 6],
    [17, 10],
  ])
    s.set(x, y, P.berry[2]);
  return s.outline(P.outline);
}

export function flower(variant: number): Pix {
  const s = new Pix(7, 9);
  const petal = [P.pink[1], P.white, P.star[1], 0xb48af0][variant % 4];
  const core = variant % 4 === 2 ? P.berry[2] : P.star[1];
  s.rect(3, 4, 1, 4, P.grass[1]);
  s.set(2, 6, P.grass[2]);
  s.set(4, 5, P.grass[2]);
  s.px(
    [
      [3, 1],
      [2, 2],
      [4, 2],
      [3, 3],
    ],
    petal,
  );
  s.set(3, 2, core);
  return s.outline(P.outline);
}

export function tuft(): Pix {
  const s = new Pix(9, 6);
  s.px(
    [
      [1, 4],
      [2, 3],
      [2, 4],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
      [6, 3],
      [6, 4],
      [7, 4],
    ],
    P.grass[2],
  );
  s.px(
    [
      [3, 4],
      [5, 4],
      [5, 2],
    ],
    P.grass[1],
  );
  return s.outline(P.grass[0]);
}

export function buildScenery() {
  return {
    ground: ground(),
    clouds: [cloud(0), cloud(1), cloud(2)],
    sun: sun(),
    moon: moon(),
    trees: [tree('green'), tree('blossom')],
    bush: bush(),
    flowers: [flower(0), flower(1), flower(2), flower(3)],
    tuft: tuft(),
    farDay: hills(THEMES.day.far, 'far'),
    farSunset: hills(THEMES.sunset.far, 'far'),
    farNight: hills(THEMES.night.far, 'far'),
    nearDay: hills(THEMES.day.near, 'near'),
    nearSunset: hills(THEMES.sunset.near, 'near'),
    nearNight: hills(THEMES.night.near, 'near'),
  };
}
