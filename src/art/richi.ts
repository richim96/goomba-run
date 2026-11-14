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
/** rows above this are the upper body (head, jacket) */
const WAIST = 40;
const HIP_X = 28;
/** hair rows / columns dropped to make the head slightly smaller */
const DROP_ROWS = [8, 5, 2];
const DROP_COLS_BACK = [22, 20]; // rows 0..16
const DROP_COL_FRONT = 43; // rows 0..10

export const RICHI_W = SRC_W + 6;
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
type Arms = 'reach' | 'up';

interface Pose {
  /** leg cycle angle; undefined = standing */
  stride?: number;
  tuck?: boolean;
  arms: Arms;
  wobble?: number;
  lift?: number;
}

/** the avatar's own fist, reused at the end of every sleeve */
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
  return s;
}

/** a patch of the avatar's own sleeve, used to texture the redrawn arms */
const CAMO = RICHI_ROWS.slice(23, 29).map((r) => [...r.slice(7, 20)].map(col));
const MARK = 0xff00ff; // scratch colour, always replaced below

function darken(c: number, k: number): number {
  return (
    (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)
  );
}

function arm(s: Pix, sh: Pt, hand: Pt, far: boolean, fist: Pix): void {
  const len = Math.hypot(hand[0] - sh[0], hand[1] - sh[1]);
  const ux = (hand[0] - sh[0]) / len;
  const uy = (hand[1] - sh[1]) / len;
  const wrist: Pt = [hand[0] - ux * 3, hand[1] - uy * 3];
  if (!far) s.line(sh[0], sh[1], wrist[0], wrist[1], P.outline, 7); // rim against the jacket
  s.line(sh[0], sh[1], wrist[0], wrist[1], MARK, 5);
  // wrap the camo patch along the sleeve
  const tw = CAMO[0].length;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.d[y * s.w + x] !== MARK) continue;
      const along = Math.round((x - sh[0]) * ux + (y - sh[1]) * uy);
      const across = Math.round(-(x - sh[0]) * uy + (y - sh[1]) * ux) + 3;
      const m = ((along % (tw * 2)) + tw * 2) % (tw * 2);
      const tx = m < tw ? m : tw * 2 - 1 - m; // ping-pong so the patch never shows a seam
      const ty = Math.max(0, Math.min(CAMO.length - 1, across));
      const c = CAMO[ty][tx];
      s.d[y * s.w + x] = far ? darken(c, 0.72) : c;
    }
  }
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

let cache: { upper: Pix; fist: Pix } | null = null;

function frame(p: Pose): Pix {
  cache ??= { upper: upperBody(), fist: fistStamp() };
  const { upper, fist } = cache;
  const s = new Pix(RICHI_W, RICHI_H);
  const lift = p.lift ?? 0;
  const dy = OY - lift; // upper-body offset
  const hip: Pt = [OX + HIP_X, dy + WAIST + 1];
  const ground = OY + SRC_H - 5; // ankle row of a planted foot
  const w = p.wobble ?? 0;

  // shoulders and hands, in frame coordinates
  const nearSh: Pt = [OX + 21, dy + 27];
  const farSh: Pt = [OX + 29, dy + 25];
  let nearHand: Pt;
  let farHand: Pt;
  if (p.arms === 'reach') {
    nearHand = [OX + 43, dy + 32 + w];
    farHand = [OX + 46, dy + 25 - w];
  } else {
    nearHand = [OX + 16, dy + 7];
    farHand = [OX + 40, dy + 7];
  }

  // feet: the foot swinging forward is the one in the air
  let near: Pt;
  let far: Pt;
  let nearBend = 0;
  let farBend = 0;
  if (p.tuck) {
    near = [hip[0] + 6, ground - 8];
    far = [hip[0] - 8, ground - 6];
    nearBend = 1;
    farBend = 0.3;
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
  arm(s, farSh, farHand, true, fist);
  leg(s, [hip[0] + 2, hip[1]], far, farBend, true);
  leg(s, [hip[0] - 1, hip[1]], near, nearBend, false);
  s.ball(hip[0], hip[1] + 1, 8, 4.5, [PANTS[0], PANTS[1]], { bands: [0.1] });
  for (let y = 0; y < upper.h; y++) {
    for (let x = 0; x < upper.w; x++) {
      const c = upper.get(x, y);
      if (c !== CLEAR) s.set(OX + x, dy + y, c);
    }
  }
  arm(s, nearSh, nearHand, false, fist);

  return s.outline(P.outline);
}

export interface RichiArt {
  run: Pix[];
  jump: Pix;
  hug: Pix[];
}

export function buildRichi(): RichiArt {
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
    jump: frame({ tuck: true, arms: 'reach', wobble: -1 }),
    hug: [frame({ arms: 'up' }), frame({ arms: 'up', lift: 2 })],
  };
}
