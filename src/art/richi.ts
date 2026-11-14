import { CLEAR, Pix } from './pix.ts';
import { P } from './palette.ts';
import { RICHI_COLORS, RICHI_ROWS } from './richiSprite.ts';

// Richi, the pursuer. Head, jacket and arms are his own avatar, imported pixel
// for pixel (richiSprite.ts). From that source this file:
//  - trims the hair a little (whole rows/columns of hair only)
//  - simplifies the face (see FACE below)
//  - lifts the avatar's two arms off as cutouts, so they can swing: at the back
//    of a stride they sit exactly where the avatar has them
//  - animates the legs, since the avatar is a single pose

const SRC_W = RICHI_ROWS[0].length;
const SRC_H = RICHI_ROWS.length;
const OX = 3; // where the source sits inside a frame
const OY = 4;
/** rows above this are the upper body (head, jacket) */
const WAIST = 40;
const HIP_X = 28;
/** hair rows / columns dropped to make the head slightly smaller */
const DROP_ROWS = [8, 5, 2];
const DROP_COLS_BACK = [22, 20]; // rows 0..16
const DROP_COL_FRONT = 43; // rows 0..10

/** a few spare columns in front, for the arm at full stretch */
export const RICHI_W = SRC_W + 14;
export const RICHI_H = SRC_H + OY + 1;
export const RICHI_ANCHOR = { x: OX + HIP_X, y: OY + SRC_H };
/** where something held over his head rests, relative to the anchor */
export const RICHI_HEAD = { x: 3, y: -(SRC_H - 5) };

const CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const col = (ch: string) => RICHI_COLORS[CH.indexOf(ch)];
const LEGEND: Record<string, number> = {
  ...Object.fromEntries([...CH].slice(0, RICHI_COLORS.length).map((c) => [c, col(c)])),
  M: 0x8a3f30, // mouth
  G: P.gold, // earring
};

// The avatar's face is realistic: dithered stubble, a small lidded eye, a long
// nose. At game size that reads as creepy, so the features are redrawn simpler
// ("chibi"): one big 3x3 eye with a sparkle, flat skin, a clean beard band, a
// button nose and a small smile. Hair, ear position and outline stay the avatar's.
// These are rows 10..24 of the source from column 24; ' ' keeps the avatar's pixel.
const CHIBI_FACE = true;
const FACE_AT = { row: 10, col: 24 };
const FACE = [
  '         11 11    ',
  '        n     pn  ',
  '       n   ppp  n ',
  ' pp888kppp3333ppn ',
  'ppdk8hppppppppppn ',
  'pdpkhhppppt00pppn ',
  'pppkhhpppp000ppp  ',
  'pppphhpppp000ppp  ',
  ' pGkhhkpppppppppp ',
  '  Ghhhhkppppppppp.',
  '    hhhhkppMpppn..',
  '   hhhhhhhkpMMpp  ',
  '    hhhhhhhhhkpn  ',
  '     hhhhhhhhhh.  ',
  '      99999999.   ',
];

// colours lifted from the avatar itself
const PANTS = [col('0'), col('1'), col('2')];
const SHOE = [col('f'), col('q'), col('r')];
const SHOE_FAR = [col('c'), col('m'), col('q')];
const SOLE = col('c');

type Pt = readonly [number, number];

/** the kicking foot relative to the hip (x) and the ground (y), and how bent the knee is */
const KICK = [
  { x: -9, y: -6, bend: 0.9 },
  { x: 13, y: -7, bend: 0 },
  { x: 11, y: -12, bend: 0.15 },
] as const;

/** where the avatar's two arms sit on its sprite: [first row, last row, first column, end column) */
type Region = readonly (readonly [number, number, number, number])[];
const BACK_ARM: Region = [
  [21, 28, 0, 15],
  [29, 35, 0, 14],
  [36, 37, 0, 13],
];
const FRONT_ARM: Region = [
  [25, 32, 39, SRC_W],
  [33, 33, 35, SRC_W],
  [34, 38, 34, SRC_W],
];

/**
 * One of the avatar's own arms, placed on a frame. With nothing set it lands
 * exactly where the avatar has it. All positions are in the avatar's pixels.
 */
interface Limb {
  /** back: the whole sleeve swung behind him; front: the forearm and fist out in front */
  cut: 'back' | 'front';
  /** flip left-right around this column first */
  mirror?: number;
  /** then turn around `pivot`: positive swings a hanging arm backward */
  deg?: number;
  pivot?: Pt;
  dx?: number;
  dy?: number;
  /** shade it (1 = as on the avatar) */
  dark?: number;
  /** front only: the sleeve is drawn again this many px further back, to bridge a long reach */
  reach?: number;
}

/** near: drawn over the body. far: drawn behind it, so it hides as it slides back */
interface Limbs {
  near?: Limb;
  far?: Limb;
}

const SHOULDER: Pt = [18, 23];
/** the far fist, showing behind his back while that arm is drawn back */
const PEEK: Limb = { cut: 'front', mirror: 28, dark: 0.8, dy: 1 };

/**
 * Grabby hands. Both of the avatar's sleeves, flipped to point forward, reach
 * out and down toward the Goomba: the near one lower, the far one higher and
 * coming from behind his chest. `paw` (-1..1) rocks them against each other, so
 * the hands take turns grabbing instead of being held out stiff.
 */
function grabbing(paw: number): Limbs {
  return {
    near: { cut: 'back', mirror: 25, deg: -4 - 8 * paw, pivot: [27, 25], dx: Math.round(paw), dy: 5 },
    far: { cut: 'back', mirror: 26, deg: -17 + 6 * paw, pivot: [28, 24], dx: -Math.round(paw), dy: 2, dark: 0.85 },
  };
}

// A blow with the near fist: cocked back while the far hand keeps reaching, then
// thrown straight ahead (punch) or low in front of him (slam) as the far arm
// swings back.
const WIND: Limbs = { near: { cut: 'back', deg: 20, pivot: SHOULDER, dy: -1 }, far: grabbing(0).far };
const PUNCH: Limbs = { near: { cut: 'front', dx: 8, dy: -4, reach: 4 }, far: PEEK };
const SLAM: Limbs = { near: { cut: 'front', deg: 30, pivot: [36, 33], dx: 5, dy: 7, reach: 3 }, far: PEEK };

/**
 * One foot through a stride. On the ground (first half) it travels back under
 * him. In the air it first kicks up behind him and only then drives forward, so
 * the passing leg is tucked rather than marching straight up and down.
 */
function step(a: number): { x: number; lift: number } {
  const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (t < Math.PI) return { x: Math.cos(t) * 9, lift: 0 };
  const u = (t - Math.PI) / Math.PI;
  return { x: -9 + 18 * u ** 1.8, lift: Math.sin(Math.PI * u ** 0.75) };
}

interface Pose {
  /** leg cycle angle; undefined = standing */
  stride?: number;
  /** the near leg kicks: 0 cocked back, 1 striking, 2 following through */
  kick?: 0 | 1 | 2;
  /** the avatar's own arms, or 'up': both raised to hold the Goomba overhead */
  arms: Limbs | 'up';
  lift?: number;
  /** upper body shifted forward, in px: he leans into a blow (negative = leaning back) */
  lean?: number;
}

/** the avatar's front fist: [first row, end row, first column, end column) */
const FIST = [26, 34, 42, 49] as const;

/** the avatar's own fist, on its own: it stays upright however its sleeve is turned */
function fistStamp(): Pix {
  const s = new Pix(FIST[3] - FIST[2], FIST[1] - FIST[0]);
  s.rows(
    0,
    0,
    RICHI_ROWS.slice(FIST[0], FIST[1]).map((r) => r.slice(FIST[2], FIST[3])),
    LEGEND,
  );
  return s;
}

/** head + jacket from the avatar: arms removed, hair trimmed */
function upperBody(): Pix {
  const rows = RICHI_ROWS.slice(0, WAIST).map((r) => [...r]);
  const erase = (y: number, from: number, to: number) => {
    for (let x = from; x < to; x++) rows[y][x] = '.';
  };
  for (const [y0, y1, x0, x1] of [...BACK_ARM, ...FRONT_ARM]) {
    for (let y = y0; y <= y1; y++) erase(y, x0, x1);
  }

  if (CHIBI_FACE) {
    FACE.forEach((line, j) => {
      [...line].forEach((ch, i) => {
        if (ch !== ' ') rows[FACE_AT.row + j][FACE_AT.col + i] = ch;
      });
    });
  }

  // trim hair columns: back of the head moves in, the quiff moves back
  for (let y = 0; y <= 16; y++) {
    if (y <= 10) {
      rows[y].splice(DROP_COL_FRONT, 1);
      rows[y].push('.');
    }
    for (const x of DROP_COLS_BACK) rows[y].splice(x, 1);
    rows[y].unshift('.', '.');
  }
  // trim hair rows: everything above drops down
  for (const y of DROP_ROWS) rows.splice(y, 1);
  for (let i = 0; i < DROP_ROWS.length; i++) rows.unshift(new Array<string>(SRC_W).fill('.'));

  const s = new Pix(SRC_W, WAIST);
  s.rows(
    0,
    0,
    rows.map((r) => r.join('')),
    LEGEND,
  );
  return s;
}

/** one of the avatar's arms on its own, still in the avatar's coordinates */
function cutout(region: Region): Pix {
  const s = new Pix(SRC_W, WAIST);
  for (const [y0, y1, x0, x1] of region) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x < x1; x++) {
        const c = LEGEND[RICHI_ROWS[y][x]];
        if (c !== undefined) s.set(x, y, c);
      }
    }
  }
  return s;
}

/**
 * Draws a cutout arm. (ox, oy) is where the avatar's top-left corner sits in the
 * frame. `rim` outlines it wherever it crosses something already drawn, so an
 * arm swung across the jacket does not melt into it.
 */
function limb(s: Pix, cut: Pix, fist: Pix, l: Limb, ox: number, oy: number, rim: boolean): void {
  const th = ((l.deg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const [px, py] = l.pivot ?? [0, 0];
  const dx = l.dx ?? 0;
  const dy = l.dy ?? 0;
  // A turned or stretched front arm keeps its fist upright: the sleeve is drawn
  // without it and the fist is stamped where its centre ends up.
  const loose = l.cut === 'front' && l.mirror === undefined && (!!l.deg || !!l.reach);
  const inFist = (x: number, y: number) => y >= FIST[0] && y < FIST[1] && x >= FIST[2] && x < FIST[3];
  const hits = new Map<number, number>();
  for (const back of l.reach ? [l.reach, 0] : [0]) {
    for (let Y = 0; Y < s.h; Y++) {
      for (let X = 0; X < s.w; X++) {
        // from the frame back to the avatar: undo the shift, the turn, the flip
        const x = X + 0.5 - ox - dx + back;
        const y = Y + 0.5 - oy - dy;
        const rx = px + (x - px) * cos + (y - py) * sin;
        const ry = py - (x - px) * sin + (y - py) * cos;
        const sx = Math.floor(l.mirror === undefined ? rx : 2 * l.mirror - rx);
        const sy = Math.floor(ry);
        if (loose && inFist(sx, sy)) continue;
        const c = cut.get(sx, sy);
        if (c !== CLEAR) hits.set(Y * s.w + X, l.dark ? darken(c, l.dark) : c);
      }
    }
  }
  if (loose) {
    const cx = (FIST[2] + FIST[3]) / 2;
    const cy = (FIST[0] + FIST[1]) / 2;
    const fx = Math.round(ox + dx + px + (cx - px) * cos - (cy - py) * sin - fist.w / 2);
    const fy = Math.round(oy + dy + py + (cx - px) * sin + (cy - py) * cos - fist.h / 2);
    for (let y = 0; y < fist.h; y++) {
      for (let x = 0; x < fist.w; x++) {
        const c = fist.get(x, y);
        if (c !== CLEAR && s.inside(fx + x, fy + y)) hits.set((fy + y) * s.w + fx + x, c);
      }
    }
  }
  if (rim) {
    for (const i of hits.keys()) {
      const X = i % s.w;
      const Y = (i - X) / s.w;
      for (const [nx, ny] of [[X - 1, Y], [X + 1, Y], [X, Y - 1], [X, Y + 1]]) {
        if (!hits.has(ny * s.w + nx) && s.get(nx, ny) !== CLEAR) s.set(nx, ny, P.outline);
      }
    }
  }
  for (const [i, c] of hits) s.d[i] = c;
}

/** a patch of the avatar's own sleeve, used to texture the redrawn arms */
const CAMO = RICHI_ROWS.slice(23, 29).map((r) => [...r.slice(7, 20)].map(col));
const MARK = 0xff00ff; // scratch colour, always replaced below

function darken(c: number, k: number): number {
  return (
    (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)
  );
}

/** a sleeve from a to b, the camo patch wrapped along it */
function sleeve(s: Pix, a: Pt, b: Pt, far: boolean): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  s.line(a[0], a[1], b[0], b[1], MARK, 5);
  const tw = CAMO[0].length;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.d[y * s.w + x] !== MARK) continue;
      const along = Math.round((x - a[0]) * ux + (y - a[1]) * uy);
      const across = Math.round(-(x - a[0]) * uy + (y - a[1]) * ux) + 3;
      const m = ((along % (tw * 2)) + tw * 2) % (tw * 2);
      const tx = m < tw ? m : tw * 2 - 1 - m; // ping-pong so the patch never shows a seam
      const ty = Math.max(0, Math.min(CAMO.length - 1, across));
      const c = CAMO[ty][tx];
      s.d[y * s.w + x] = far ? darken(c, 0.72) : c;
    }
  }
}

/** a straight raised arm, shoulder to fist (only for holding the Goomba overhead) */
function arm(s: Pix, sh: Pt, hand: Pt, far: boolean, fist: Pix): void {
  const len = Math.hypot(hand[0] - sh[0], hand[1] - sh[1]);
  const wrist: Pt = [hand[0] - ((hand[0] - sh[0]) / len) * 3, hand[1] - ((hand[1] - sh[1]) / len) * 3];
  if (!far) s.line(sh[0], sh[1], wrist[0], wrist[1], P.outline, 7); // rim against the jacket
  sleeve(s, sh, wrist, far);
  s.stamp(fist, hand[0] - 3, hand[1] - 4);
}

function shoe(s: Pix, ankle: Pt, far: boolean): void {
  const ramp = far ? SHOE_FAR : SHOE;
  const cx = ankle[0] + 3;
  const cy = ankle[1] + 2;
  s.ball(cx, cy, 6.4, 2.8, ramp, { bands: [-0.2, 0.3] });
  for (const dx of [0, 2, 4]) {
    s.over(ankle[0] + dx + 1, ankle[1] + 2, PANTS[2], ramp);
    s.over(ankle[0] + dx + 2, ankle[1] + 1, PANTS[2], ramp);
  }
  for (let x = cx - 6; x <= cx + 6; x++) s.over(x, cy + 2, SOLE, ramp);
}

function leg(s: Pix, hip: Pt, ankle: Pt, bend: number, far: boolean): void {
  const c = far ? PANTS[0] : PANTS[1];
  const knee: Pt = [(hip[0] + ankle[0]) / 2 + 2.5 + bend * 3.5, (hip[1] + ankle[1]) / 2 - 1 - bend * 2];
  s.line(hip[0], hip[1], knee[0], knee[1], c, 8);
  s.line(knee[0], knee[1], ankle[0], ankle[1], c, 6);
  if (!far) {
    // a soft highlight down the front of the leg, as on the avatar
    s.line(hip[0] + 3, hip[1] + 1, knee[0] + 2, knee[1], PANTS[2], 2);
    s.line(knee[0] + 2, knee[1], ankle[0] + 1, ankle[1] - 1, PANTS[2], 1);
  }
  shoe(s, ankle, far);
}

let cache: { upper: Pix; fist: Pix; back: Pix; front: Pix } | null = null;

function frame(p: Pose): Pix {
  cache ??= { upper: upperBody(), fist: fistStamp(), back: cutout(BACK_ARM), front: cutout(FRONT_ARM) };
  const { upper, fist } = cache;
  const cuts = cache;
  const s = new Pix(RICHI_W, RICHI_H);
  const lift = p.lift ?? 0;
  const lean = p.lean ?? 0;
  const dy = OY - lift; // upper-body offset
  const hip: Pt = [OX + HIP_X, dy + WAIST + 1];
  const ground = OY + SRC_H - 5; // ankle row of a planted foot
  const arms = p.arms;
  /** an arm left exactly where the avatar has it joins the jacket without a seam */
  const moved = (l: Limb) => !!(l.mirror || l.deg || l.dx || l.dy);

  // feet: the foot swinging forward is the one in the air
  let near: Pt;
  let far: Pt;
  let nearBend = 0;
  let farBend = 0;
  if (p.kick !== undefined) {
    // he kicks without breaking stride: the far foot stays planted
    const k = KICK[p.kick];
    near = [hip[0] + k.x, ground + k.y];
    nearBend = k.bend;
    far = [hip[0] - 3, ground];
  } else if (p.stride === undefined) {
    near = [hip[0] - 4, ground];
    far = [hip[0] + 3, ground];
  } else {
    const n = step(p.stride);
    const f = step(p.stride + Math.PI);
    nearBend = n.lift;
    farBend = f.lift;
    near = [hip[0] - 2 + n.x, ground - n.lift * 9];
    far = [hip[0] - 2 + f.x, ground - f.lift * 9];
  }

  // back to front
  if (arms === 'up') arm(s, [OX + 29, dy + 25], [OX + 40, dy + 7], true, fist);
  else if (arms.far) limb(s, cuts[arms.far.cut], fist, arms.far, OX + lean, dy, false);
  leg(s, [hip[0] + 2, hip[1]], far, farBend, true);
  leg(s, [hip[0] - 1, hip[1]], near, nearBend, false);
  s.ball(hip[0], hip[1] + 1, 8, 4.5, [PANTS[0], PANTS[1]], { bands: [0.1] });
  for (let y = 0; y < upper.h; y++) {
    for (let x = 0; x < upper.w; x++) {
      const c = upper.get(x, y);
      if (c !== CLEAR) s.set(OX + x + lean, dy + y, c);
    }
  }
  if (arms === 'up') arm(s, [OX + 21, dy + 27], [OX + 16, dy + 7], false, fist);
  else if (arms.near) limb(s, cuts[arms.near.cut], fist, arms.near, OX + lean, dy, moved(arms.near));

  return s.outline(P.outline);
}

export interface RichiArt {
  /** the run, both hands out to grab */
  run: Pix[];
  /** wind-up, strike, follow-through */
  kick: Pix[];
  // blows with the near fist, one frame per run frame so his legs never stop
  /** fist cocked back */
  wind: Pix[];
  /** thrown straight ahead */
  punch: Pix[];
  /** driven down in front of his feet */
  slam: Pix[];
  hug: Pix[];
}

export function buildRichi(): RichiArt {
  const N = 8;
  /** the run cycle with something else going on up top; the body rises as the feet pass under it */
  const running = (pose: (lift: number, a: number) => Omit<Pose, 'stride'>): Pix[] =>
    Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return frame({ stride: a, ...pose(Math.round((1 - Math.abs(Math.cos(a))) * 2), a) });
    });
  // the hands paw in time with the legs, a touch behind them
  const paw = (a: number) => Math.round(Math.sin(a - 0.3) * 2) / 2;
  return {
    run: running((lift, a) => ({ arms: grabbing(paw(a)), lift, lean: 3 })),
    // he kicks with his hands still out, thrown up a little for balance
    kick: [
      frame({ kick: 0, arms: grabbing(-1), lean: 3 }),
      frame({ kick: 1, arms: grabbing(1), lift: 1, lean: 2 }),
      frame({ kick: 2, arms: grabbing(0.5), lift: 1, lean: 2 }),
    ],
    wind: running((lift) => ({ arms: WIND, lift, lean: 1 })),
    punch: running((lift) => ({ arms: PUNCH, lift, lean: 3 })),
    slam: running((lift) => ({ arms: SLAM, lift: lift - 2, lean: 3 })),
    hug: [frame({ arms: 'up' }), frame({ arms: 'up', lift: 2 })],
  };
}
