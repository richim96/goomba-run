import { CLEAR, Pix } from './pix.ts';
import { P } from './palette.ts';
import { RICHI_COLORS, RICHI_ROWS } from './richiSprite.ts';

// Richi, the pursuer. Head and jacket are his own avatar, imported pixel for
// pixel (richiSprite.ts). From that source this file:
//  - trims the hair a little (whole rows/columns of hair only)
//  - simplifies the face (see FACE below)
//  - removes the avatar's pumping arms and draws "grabby hands" reaching forward
//  - animates the legs, since the avatar is a single pose

const SRC_W = RICHI_ROWS[0].length;
const SRC_H = RICHI_ROWS.length;
const OX = 3; // where the source sits inside a frame
const OY = 4;
/** the back of his neck and shoulders without a hood: from row HOOD_FROM, the first column kept */
const HOOD_FROM = 17;
const HOOD_CUT = [19, 19, 19, 19, 19, 19, 18, 17, 16, 15, 14];
/** where the jacket starts: at the back of the neck, and in front below the beard */
const JACKET_ROW = 21;
const JACKET_ROW_FRONT = 25;
/** rows above this are the upper body (head, jacket) */
const WAIST = 40;
const HIP_X = 28;
/** hair rows / columns dropped to make the head slightly smaller */
const DROP_ROWS = [8, 5, 2];
const DROP_COLS_BACK = [22, 20]; // rows 0..16
const DROP_COL_FRONT = 43; // rows 0..10

/** a few spare columns in front, for the punching arm at full stretch */
export const RICHI_W = SRC_W + 10;
/** extra leg length below the avatar's own: the upper body stays, the feet go lower */
const LEG_EXTRA = 3;
export const RICHI_H = SRC_H + OY + 1 + LEG_EXTRA;
export const RICHI_ANCHOR = { x: OX + HIP_X, y: OY + SRC_H + LEG_EXTRA };
/** where something held over his head rests, relative to the anchor */
export const RICHI_HEAD = { x: 3, y: -(SRC_H - 5 + LEG_EXTRA) };
/** where the Goomba's feet go when he holds it in his arms, relative to the anchor */
export const RICHI_HOLD = { x: 16, y: -14 };

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

// ---- outfits ------------------------------------------------------------
// The head is always the avatar's. The clothes can be recoloured: the jacket
// and sleeves are remapped by brightness onto a new ramp (so the avatar's camo
// pattern stays as a tonal texture), trousers and shoes are swapped outright.

type Ramp3 = readonly [number, number, number];

export interface Outfit {
  name: string;
  /** dark -> light; omitted = the avatar's own jacket */
  jacket?: readonly number[];
  /** sleeves, if not the same as the jacket */
  sleeve?: readonly number[];
  /** drawn over the torso, then the hat over the head; (ox, oy) = how far the upper body moved */
  garment?: (s: Pix, ox: number, oy: number) => void;
  hat?: (s: Pix, ox: number, oy: number) => void;
  /** forearms bare: sleeves stop just below the elbow */
  shortSleeves?: boolean;
  /** cut away the avatar's hood bunched behind his neck */
  noHood?: boolean;
  pants?: readonly [number, number, number];
  shoe?: readonly [number, number, number];
}

// Hats and garments are drawn in frame coordinates of a standing frame: the
// crown of his hair is around (35, 8), the hair line at the brow around y 13,
// the torso spans x 17..45 from y 22 to 46, its front is the right side.

/** paint c over the frame's existing pixels inside a rectangle */
function cover(s: Pix, x0: number, y0: number, x1: number, y1: number, c: (x: number, y: number) => number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.over(x, y, c(x, y));
}

/** yellow construction hard hat: a smooth dome with a raised ridge, a rim all round and a short peak in front */
function hardHat(s: Pix, ox: number, oy: number): void {
  const HH: Ramp3 = [0xb87e00, 0xf0b000, 0xffd43a];
  s.blob((x, y) => y <= 11 + oy && ((x - 35 - ox) / 12) ** 2 + ((y - 11 - oy) / 9) ** 2 <= 1, 35 + ox, 8 + oy, 12, 9, HH);
  for (let y = 3; y <= 11; y++) s.over(34 + ox, y + oy, 0xfff0a0); // ridge
  for (let y = 3; y <= 11; y++) s.over(36 + ox, y + oy, HH[0]);
  for (let x = 22; x <= 48; x++) s.set(x + ox, 12 + oy, HH[0]);
  for (let x = 44; x <= 52; x++) {
    s.set(x + ox, 12 + oy, HH[1]);
    s.set(x + ox, 13 + oy, HH[0]);
  }
}

const REFLECT = 0xdfe6ea;
const REFLECT_DARK = 0x9aa4ac;
/** a tool belt at the waist with a pouch at the back */
function toolBelt(s: Pix, ox: number, oy: number): void {
  for (let x = 17; x <= 45; x++) {
    s.over(x + ox, 43 + oy, 0x5a3418);
    s.over(x + ox, 44 + oy, 0x3e2410);
  }
  s.set(36 + ox, 43 + oy, P.gold);
  s.rect(17 + ox, 44 + oy, 6, 5, 0x7a4a22);
  s.rect(17 + ox, 44 + oy, 6, 1, 0x5a3418);
}

export const RICHI_OUTFITS: readonly Outfit[] = [
  { name: 'original' },
  {
    // 3b: yellow rain jacket with a zip and toggles, navy trousers, black wellies
    name: 'hardhat-raincoat',
    jacket: [0x7a5a04, 0xb48a10, 0xe0b420, 0xf6d24a, 0xfff08a],
    pants: [0x161e33, 0x222d4a, 0x34436a],
    shoe: [0x101012, 0x26262c, 0x46464e],
    garment(s, ox, oy) {
      cover(s, 38 + ox, 26 + oy, 38 + ox, 44 + oy, () => 0x7a5a04);
      for (const y of [31, 37]) cover(s, 39 + ox, y + oy, 40 + ox, y + oy, () => 0x4a3418);
    },
    hat: hardHat,
  },
  {
    // short-sleeved grey T-shirt under an orange hi-vis vest with silver stripes, jeans, tan work boots
    name: 'hivis-vest',
    jacket: [0x8a2e04, 0xc2440a, 0xec6418, 0xff8a3a, 0xffae70],
    sleeve: [0x4a4f58, 0x6e747e, 0x8e949e, 0xaab0ba, 0xc8ccd2],
    shortSleeves: true,
    pants: [0x1e2a44, 0x2c3e62, 0x46608a],
    shoe: [0x8a5a20, 0xb47a34, 0xd8a050],
    garment(s, ox, oy) {
      // two reflective bands round the vest and a strap over the shoulder
      for (const y of [33, 39]) {
        cover(s, 18 + ox, y + oy, 44 + ox, y + oy, (x) => (s.get(x, y + oy) === P.outline ? P.outline : REFLECT));
        cover(s, 18 + ox, y + 1 + oy, 44 + ox, y + 1 + oy, (x) => (s.get(x, y + 1 + oy) === P.outline ? P.outline : REFLECT_DARK));
      }
      cover(s, 30 + ox, 28 + oy, 31 + ox, 33 + oy, () => REFLECT);
    },
    hat: hardHat,
  },
  {
    // one-piece orange work coveralls with a dark belt, chest pocket and reflective cuffs, black boots
    name: 'coveralls',
    jacket: [0x8a3a04, 0xb85410, 0xe0742a, 0xf49450, 0xffb880],
    pants: [0xa04a0c, 0xd0661c, 0xf08a3e],
    shoe: [0x101012, 0x26262c, 0x46464e],
    garment(s, ox, oy) {
      for (let x = 17; x <= 45; x++) s.over(x + ox, 43 + oy, 0x2a2a30);
      s.set(37 + ox, 43 + oy, 0x9aa4ac);
      // zip and a chest pocket with a pen in it
      cover(s, 38 + ox, 26 + oy, 38 + ox, 42 + oy, () => 0x8a3a04);
      cover(s, 32 + ox, 29 + oy, 36 + ox, 33 + oy, (_x, y) => (y === 29 + oy ? 0x8a3a04 : 0xb85410));
      s.set(33 + ox, 28 + oy, 0x2c6a9a);
      // a reflective band round each leg, above the boots
      cover(s, 14 + ox, 54 + oy, 46 + ox, 54 + oy, (x) => (s.get(x, 54 + oy) === P.outline ? P.outline : REFLECT));
    },
    hat: hardHat,
  },
  {
    // red check flannel with the sleeves rolled up, tool belt with a satchel, jeans, tan work boots
    name: 'flannel-toolbelt',
    noHood: true,
    jacket: [0x4a0e10, 0x7a1a1c, 0xa82a2a, 0xcc4a40, 0xe87a6a],
    shortSleeves: true,
    pants: [0x1e2a44, 0x2c3e62, 0x46608a],
    shoe: [0x8a5a20, 0xb47a34, 0xd8a050],
    garment(s, ox, oy) {
      const shirt = new Set(outfit.jacket);
      cover(s, 17 + ox, 26 + oy, 45 + ox, 42 + oy, (x, y) => {
        const cur = s.get(x, y);
        return ((x - ox) % 5 === 0 || (y - oy) % 5 === 0) && shirt.has(cur) ? 0x2a0608 : cur;
      });
      toolBelt(s, ox, oy);
    },
    hat: hardHat,
  },
  {
    // long hi-vis work coat down to the knees with two reflective bands, dark trousers, black wellies
    name: 'long-coat',
    jacket: [0x6a6a04, 0xa0a010, 0xcfd02a, 0xe6e858, 0xf6f8a0],
    pants: [0x1a1a20, 0x2a2a32, 0x3e3e48],
    shoe: [0x101012, 0x26262c, 0x46464e],
    garment(s, ox, oy) {
      const C = [0xa0a010, 0xcfd02a, 0xe6e858];
      // the skirt of the coat, flaring out over the thighs, slit at the front
      for (let y = 42; y <= 53; y++) {
        const spread = Math.round((y - 42) / 3);
        for (let x = 17 - spread; x <= 42 + spread; x++) {
          if (x >= 36 + spread && y > 47) continue;
          const edge = x === 17 - spread || x === 42 + spread || y === 53;
          s.set(x + ox, y + oy, edge ? P.outline : x < 24 ? C[0] : C[1]);
        }
      }
      for (const y of [34, 49]) {
        for (let x = 12; x <= 48; x++) {
          const cur = s.get(x + ox, y + oy);
          if (cur !== -1 && cur !== P.outline) s.set(x + ox, y + oy, REFLECT);
        }
      }
      cover(s, 38 + ox, 26 + oy, 38 + ox, 47 + oy, () => 0x6a6a04);
    },
    hat: hardHat,
  },
];

/** the outfit the game uses */
export const RICHI_OUTFIT = RICHI_OUTFITS.find((o) => o.name === 'flannel-toolbelt')!;

// colours lifted from the avatar itself, unless the outfit replaces them
let PANTS: readonly number[] = [];
let SHOE: readonly number[] = [];
let SHOE_FAR: readonly number[] = [];
let SOLE = 0;
let outfit: Outfit = RICHI_OUTFIT;

function lum(c: number): number {
  return 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
}
/** a greyish pixel: the jacket and its camo, not skin, hair browns or the tan shirt */
function neutral(c: number): boolean {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const hi = Math.max(r, g, b);
  return hi < 24 || (hi - Math.min(r, g, b)) / hi < 0.42;
}
/** an avatar jacket colour on the outfit's ramp, by brightness */
function recolour(c: number, ramp: readonly number[] | undefined = outfit.jacket): number {
  if (!ramp) return c;
  const t = Math.min(1, Math.pow(lum(c) / 235, 0.6));
  return ramp[Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1)))];
}
function farShade(r: readonly number[]): number[] {
  return [darken(r[0], 0.8), r[0], r[1]];
}

function wear(o: Outfit): void {
  outfit = o;
  PANTS = o.pants ?? [col('0'), col('1'), col('2')];
  SHOE = o.shoe ?? [col('f'), col('q'), col('r')];
  SHOE_FAR = o.shoe ? farShade(o.shoe) : [col('c'), col('m'), col('q')];
  SOLE = o.shoe ? darken(o.shoe[0], 0.7) : col('c');
  const sl = o.sleeve ?? o.jacket;
  CAMO = CAMO_SRC.map((row) => row.map((c) => (sl && neutral(c) ? recolour(c, sl) : c)));
  cache = null;
}

type Pt = readonly [number, number];
type Arms = 'reach' | 'up' | 'smashUp' | 'smashDown' | 'wind' | 'punch' | 'hold';

/** the kicking foot relative to the hip (x) and the ground (y), and how bent the knee is */
const KICK = [
  { x: -9, y: -6, bend: 0.9 },
  { x: 13, y: -7, bend: 0 },
  { x: 11, y: -12, bend: 0.15 },
] as const;

interface Pose {
  /** leg cycle angle; undefined = standing */
  stride?: number;
  /** the near leg kicks: 0 cocked back, 1 striking, 2 following through */
  kick?: 0 | 1 | 2;
  /** upper body shifted forward, in px: he leans into a punch (negative = leaning back) */
  lean?: number;
  arms: Arms;
  wobble?: number;
  lift?: number;
  /** draw only the near arm (to lay over something he holds) */
  nearArmOnly?: boolean;
}

/** the avatar's own fist, reused at the end of every sleeve */
/**
 * The avatar's other hand, from its back-swung arm: the back of the hand, with no
 * finger creases. Flipped to point forward, it is the near hand of the grabby
 * pair, so the two hands do not look like the same one twice.
 */
function backHandStamp(): Pix {
  const s = new Pix(7, 6);
  s.rows(
    0,
    0,
    RICHI_ROWS.slice(31, 37).map((r) => r.slice(3, 10)),
    LEGEND,
  );
  return s.flip();
}

function fistStamp(): Pix {
  const s = new Pix(7, 8);
  s.rows(
    0,
    0,
    RICHI_ROWS.slice(26, 34).map((r) => r.slice(42, 49)),
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
  // back arm and hand
  for (let y = 21; y <= 28; y++) erase(y, 0, 15);
  for (let y = 29; y <= 35; y++) erase(y, 0, 14);
  for (let y = 36; y <= 37; y++) erase(y, 0, 13);
  // front arm and fist
  for (let y = 25; y <= 32; y++) erase(y, 39, SRC_W);
  erase(33, 35, SRC_W);
  for (let y = 34; y <= 38; y++) erase(y, 34, SRC_W);

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
  // no hood: everything behind the line of his neck and back goes, above the shoulders
  if (outfit.noHood) {
    HOOD_CUT.forEach((cut, i) => {
      for (let x = 0; x < cut; x++) s.set(x, HOOD_FROM + i, CLEAR);
    });
  }
  // the jacket: below the hair at the back, below the beard in front
  if (outfit.jacket) {
    for (let y = JACKET_ROW; y < WAIST; y++) {
      for (let x = 0; x < SRC_W; x++) {
        if (y < JACKET_ROW_FRONT && x >= 24) continue;
        const c = s.get(x, y);
        if (c !== CLEAR && neutral(c)) s.set(x, y, recolour(c));
      }
    }
  }
  return s;
}

/** a patch of the avatar's own sleeve, used to texture the redrawn arms */
const CAMO_SRC = RICHI_ROWS.slice(23, 29).map((r) => [...r.slice(7, 20)].map(col));
let CAMO = CAMO_SRC;
const MARK = 0xff00ff; // scratch colour, always replaced below

function darken(c: number, k: number): number {
  return (
    (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)
  );
}

function sleeve(s: Pix, a: Pt, b: Pt, far: boolean): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  s.line(a[0], a[1], b[0], b[1], MARK, 5);
  // wrap the camo patch along the sleeve
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

/** shoulder to elbow, and elbow to fist */
const HALF_ARM = 11.5;

/** where the elbow of a fist pulled in close goes: the lower of the two ways the arm can fold */
function folded(sh: Pt, hand: Pt): Pt | undefined {
  const d = Math.hypot(hand[0] - sh[0], hand[1] - sh[1]);
  if (d >= HALF_ARM * 2) return undefined;
  const h = Math.sqrt(HALF_ARM ** 2 - (d / 2) ** 2);
  const px = (-(hand[1] - sh[1]) / d) * h;
  const py = ((hand[0] - sh[0]) / d) * h;
  const mx = (sh[0] + hand[0]) / 2;
  const my = (sh[1] + hand[1]) / 2;
  return py > 0 ? [mx + px, my + py] : [mx - px, my - py];
}

/** shoulder to fist, straight or by way of an elbow */
function arm(s: Pix, sh: Pt, hand: Pt, far: boolean, fist: Pix, elbow?: Pt): void {
  const from = elbow ?? sh;
  const len = Math.hypot(hand[0] - from[0], hand[1] - from[1]);
  const wrist: Pt = [hand[0] - ((hand[0] - from[0]) / len) * 3, hand[1] - ((hand[1] - from[1]) / len) * 3];
  const joints = elbow ? [sh, elbow, wrist] : [sh, wrist];
  if (!far) {
    // rim against the jacket
    for (let i = 1; i < joints.length; i++) s.line(joints[i - 1][0], joints[i - 1][1], joints[i][0], joints[i][1], P.outline, 7);
  }
  for (let i = 1; i < joints.length; i++) sleeve(s, joints[i - 1], joints[i], far);
  if (outfit.shortSleeves) bareForearm(s, joints, far);
  s.stamp(fist, hand[0] - 3, hand[1] - Math.round(fist.h / 2));
}

const FOREARM: Ramp3 = [0xa66736, 0xd39457, 0xe4a260];

/** the sleeve ends a little past the elbow: skin from there to the wrist, with a turned-up cuff */
function bareForearm(s: Pix, joints: Pt[], far: boolean): void {
  const lens = joints.slice(1).map((p, i) => Math.hypot(p[0] - joints[i][0], p[1] - joints[i][1]));
  let left = lens.reduce((a, b) => a + b, 0) * 0.5;
  let i = 0;
  while (i < lens.length - 1 && left > lens[i]) left -= lens[i++];
  const t = Math.min(1, left / (lens[i] || 1));
  const cut: Pt = [joints[i][0] + (joints[i + 1][0] - joints[i][0]) * t, joints[i][1] + (joints[i + 1][1] - joints[i][1]) * t];
  const path = [cut, ...joints.slice(i + 1)];
  const skin = far ? FOREARM.map((c) => darken(c, 0.78)) : FOREARM;
  for (let k = 1; k < path.length; k++) s.line(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1], skin[1], 4);
  for (let k = 1; k < path.length; k++) s.line(path[k - 1][0], path[k - 1][1] - 1, path[k][0], path[k][1] - 1, skin[2], 1);
  // cuff: a band of the sleeve's darkest colour where the sleeve stops
  const c = (outfit.sleeve ?? outfit.jacket ?? [P.outline])[1];
  s.dot(cut[0], cut[1], 5, far ? darken(c, 0.78) : c);
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
  s.line(hip[0], hip[1], knee[0], knee[1], c, 6);
  s.line(knee[0], knee[1], ankle[0], ankle[1], c, 5);
  if (!far) {
    // a soft highlight down the front of the leg, as on the avatar
    s.line(hip[0] + 3, hip[1] + 1, knee[0] + 2, knee[1], PANTS[2], 2);
    s.line(knee[0] + 2, knee[1], ankle[0] + 1, ankle[1] - 1, PANTS[2], 1);
  }
  shoe(s, ankle, far);
}

let cache: { upper: Pix; fist: Pix; fistBack: Pix; backHand: Pix } | null = null;

function frame(p: Pose): Pix {
  cache ??= { upper: upperBody(), fist: fistStamp(), fistBack: fistStamp().flip(), backHand: backHandStamp() };
  const { upper, fist } = cache;
  const s = new Pix(RICHI_W, RICHI_H);
  const lift = p.lift ?? 0;
  const dy = OY - lift; // upper-body offset
  const hip: Pt = [OX + HIP_X, dy + WAIST + 1];
  const ground = OY + SRC_H - 5 + LEG_EXTRA; // ankle row of a planted foot
  const w = p.wobble ?? 0;

  // shoulders and hands, in frame coordinates
  const lean = p.lean ?? 0;
  const nearSh: Pt = [OX + 21 + lean, dy + 27];
  const farSh: Pt = [OX + 29 + lean, dy + 25];
  let nearHand: Pt;
  let farHand: Pt | null;
  let nearElbow: Pt | undefined;
  if (p.arms === 'reach') {
    nearHand = [OX + 43, dy + 32 + w];
    farHand = [OX + 46, dy + 25 - w];
  } else if (p.arms === 'up') {
    nearHand = [OX + 16, dy + 7];
    farHand = [OX + 40, dy + 7];
  } else if (p.arms === 'smashUp') {
    // both fists raised over his head, ready to come down
    nearHand = [OX + 20, dy + 5];
    farHand = [OX + 36, dy + 4];
  } else if (p.arms === 'hold') {
    // arms wrapped round something held against his belly: the near arm goes in front of it
    nearHand = [OX + 41, dy + 44];
    farHand = [OX + 46, dy + 36];
  } else if (p.arms === 'smashDown') {
    // ... and slammed down in front of him
    nearHand = [OX + 39, dy + 43];
    farHand = [OX + 43, dy + 40];
  } else if (p.arms === 'wind') {
    // the near fist cocked back beside his head, the far one still out in front
    nearHand = [nearSh[0] - 10, nearSh[1] - 9];
    nearElbow = folded(nearSh, nearHand);
    farHand = [OX + 45, dy + 27];
  } else {
    // the punch: thrown straight ahead, the far arm drawn back behind him
    nearHand = [nearSh[0] + 26, nearSh[1] - 4];
    farHand = null;
  }

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
    const a = p.stride;
    nearBend = Math.max(0, -Math.sin(a));
    farBend = Math.max(0, Math.sin(a));
    near = [hip[0] - 2 + Math.cos(a) * 9, ground - nearBend * 7];
    far = [hip[0] - 2 - Math.cos(a) * 9, ground - farBend * 7];
  }

  // back to front
  if (farHand) arm(s, farSh, farHand, true, fist);
  leg(s, [hip[0] + 2, hip[1]], far, farBend, true);
  leg(s, [hip[0] - 1, hip[1]], near, nearBend, false);
  s.ball(hip[0], hip[1] + 1, 7, 4, [PANTS[0], PANTS[1]], { bands: [0.1] });
  for (let y = 0; y < upper.h; y++) {
    for (let x = 0; x < upper.w; x++) {
      const c = upper.get(x, y);
      if (c !== CLEAR) s.set(OX + x + lean, dy + y, c);
    }
  }
  outfit.garment?.(s, lean, -lift);
  outfit.hat?.(s, lean, -lift);
  // a fist raised on the back side of his head turns to face the way it is reaching
  const raised = p.arms === 'up' || p.arms === 'smashUp' || p.arms === 'smashDown';
  const nearFist = p.arms === 'reach' || p.arms === 'hold' ? cache.backHand : raised ? cache.fistBack : fist;
  if (p.nearArmOnly) {
    // just the near arm, drawn again over whatever he is holding
    const a = new Pix(RICHI_W, RICHI_H);
    arm(a, nearSh, nearHand, false, nearFist, nearElbow);
    return a.outline(P.outline);
  }
  arm(s, nearSh, nearHand, false, nearFist, nearElbow);

  return s.outline(P.outline);
}

export interface RichiArt {
  run: Pix[];
  /** wind-up, strike, follow-through */
  kick: Pix[];
  /** for a low Stingby: both fists raised, both fists slammed down */
  smash: Pix[];
  // for a high Stingby, one frame per run frame so his legs never stop
  /** fist cocked back */
  wind: Pix[];
  /** thrown straight ahead */
  punch: Pix[];
  /** the Goomba trapped in his arms against his belly */
  hug: Pix[];
  /** the near arm of each hug frame on its own, drawn over the Goomba */
  holdArm: Pix[];
}

/** run frame i's legs and bob, with other arms on top */
function striding(i: number, pose: Omit<Pose, 'stride'>): Pix {
  const a = (i / 8) * Math.PI * 2;
  return frame({ stride: a, lift: Math.round((1 - Math.abs(Math.cos(a))) * 2), ...pose });
}

export function buildRichi(o: Outfit = RICHI_OUTFIT): RichiArt {
  wear(o);
  const run: Pix[] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    run.push(
      frame({
        stride: a,
        arms: 'reach',
        // body rises as the feet pass under it; hands bounce a beat behind
        lift: Math.round((1 - Math.abs(Math.cos(a))) * 2),
        wobble: Math.round(Math.sin(a * 2 - 0.8) * 1.2),
      }),
    );
  }
  return {
    run,
    kick: [
      frame({ kick: 0, arms: 'reach' }),
      frame({ kick: 1, arms: 'reach', lift: 1, wobble: -1 }),
      frame({ kick: 2, arms: 'reach', lift: 1 }),
    ],
    smash: [frame({ stride: 0, arms: 'smashUp', lift: 1 }), frame({ stride: 0, arms: 'smashDown', lift: -1 })],
    wind: run.map((_, i) => striding(i, { arms: 'wind', lean: -1 })),
    punch: run.map((_, i) => striding(i, { arms: 'punch', lean: 3 })),
    hug: [frame({ arms: 'hold' }), frame({ arms: 'hold', lift: 1 })],
    holdArm: [frame({ arms: 'hold', nearArmOnly: true }), frame({ arms: 'hold', lift: 1, nearArmOnly: true })],
  };
}
