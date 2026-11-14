import { inEllipse, Pix } from './pix.ts';
import { P } from './palette.ts';

// The hero: a Goomba, drawn fresh in this game's own pixel style. Big brown
// mushroom head with the face on it (grumpy brows, two little fangs), small
// tan body, dark shoes. Faces right, and is much sweeter than it looks.

export const GOOMBA_W = 30;
export const GOOMBA_H = 30;
/** x of the body centre and y of the ground line inside every frame */
export const GOOMBA_ANCHOR = { x: 15, y: 28 };

type Eyes = 'open' | 'blink' | 'hurt' | 'down';

interface Pose {
  /** whole body offset up (px) */
  lift?: number;
  /** head offset relative to body (negative = up) */
  headDy?: number;
  /** squash: + wider/shorter, - taller/thinner */
  squash?: number;
  nearX?: number;
  nearY?: number;
  farX?: number;
  farY?: number;
  lean?: number;
  eyes?: Eyes;
  bigBlush?: boolean;
}

function frame(p: Pose): Pix {
  const s = new Pix(GOOMBA_W, GOOMBA_H);
  const cx = GOOMBA_ANCHOR.x;
  const gy = GOOMBA_ANCHOR.y;
  const lift = p.lift ?? 0;
  const sq = p.squash ?? 0;
  const lean = p.lean ?? 0;
  const bx = cx + lean;

  // far foot (behind body)
  foot(s, cx - 4 + (p.farX ?? 0), gy - 2 + (p.farY ?? 0), P.footFar);

  // body: a stubby tan stalk, barely peeking out under the head
  const by = gy - 4.4 - lift + sq * 0.2;
  s.ball(bx, by, 4.8 + sq * 0.4, 2.8, P.body, { bands: [-0.2, 0.3] });

  // near foot (in front)
  foot(s, cx + 4 + (p.nearX ?? 0), gy - 2 + (p.nearY ?? 0), P.foot);

  // head: narrow dome on top, bulging cheeks below
  const hy = by - 7.4 + (p.headDy ?? 0) + sq * 0.6;
  const hx = bx + 0.5;
  const topRx = 8.4 + sq * 0.5;
  const topRy = 7 - sq * 0.5;
  const lowRx = 11.3 + sq * 0.9;
  const lowRy = 5.5 - sq * 0.3;
  s.blob(
    (x, y) => inEllipse(x, y, hx, hy - 2.3, topRx, topRy) || inEllipse(x, y, hx, hy + 1.8, lowRx, lowRy),
    hx,
    hy - 0.9,
    lowRx,
    7.8,
    P.cap,
    { bands: [-0.3, 0.3, 0.6] },
  );

  face(
    s,
    Math.round(hx + 1),
    Math.round(hy),
    p.eyes ?? 'open',
    p.bigBlush ?? false,
  );

  s.outline(P.outline);
  return s;
}

function foot(s: Pix, x: number, y: number, ramp: readonly number[]): void {
  s.ball(x, y + 0.4, 3.9, 2.2, ramp, { bands: [-0.1, 0.45] });
}

/** tall oval eye, 4x5 with the corners knocked off */
function eyeWhite(s: Pix, ex: number, top: number, h: number): void {
  s.rect(ex, top, 4, h, P.white);
  for (const [dx, dy] of [
    [0, 0],
    [3, 0],
    [0, h - 1],
    [3, h - 1],
  ])
    s.set(ex + dx, top + dy, P.cap[1]);
}

function face(s: Pix, x: number, y0: number, eyes: Eyes, bigBlush: boolean): void {
  const y = y0 - 1; // eye centre row
  // eyes are 4 wide and sit close together: L..L+3 and R..R+3, 1px apart
  const L = x - 5;
  const R = x;
  switch (eyes) {
    case 'open':
      for (const ex of [L, R]) {
        eyeWhite(s, ex, y - 2, 5);
        s.rect(ex + 1, y - 1, 2, 3, P.ink);
        s.set(ex + 1, y - 1, P.white);
      }
      break;
    case 'down':
      for (const ex of [L, R]) {
        eyeWhite(s, ex, y - 2, 5);
        s.rect(ex + 1, y, 2, 2, P.ink);
      }
      break;
    case 'blink':
      s.rect(L, y + 1, 4, 1, P.ink);
      s.rect(R, y + 1, 4, 1, P.ink);
      break;
    case 'hurt': // > <
      s.px(
        [
          [L, y - 2],
          [L + 1, y - 1],
          [L + 2, y],
          [L + 1, y + 1],
          [L, y + 2],
        ],
        P.ink,
      );
      s.px(
        [
          [R + 3, y - 2],
          [R + 2, y - 1],
          [R + 1, y],
          [R + 2, y + 1],
          [R + 3, y + 2],
        ],
        P.ink,
      );
      break;
  }

  // brows: thick, swept down to the middle, with a flick at the outer tip
  const top = y - 5;
  s.px(
    [
      [L - 2, top - 1],
      [L - 1, top],
      [L, top],
      [L, top + 1],
      [L + 1, top + 1],
      [L + 2, top + 1],
      [L + 2, top + 2],
      [L + 3, top + 2],
      [L + 4, top + 2],
      [L + 4, top + 3],
    ],
    P.ink,
  );
  s.px(
    [
      [R + 5, top - 1],
      [R + 4, top],
      [R + 3, top],
      [R + 3, top + 1],
      [R + 2, top + 1],
      [R + 1, top + 1],
      [R + 1, top + 2],
      [R, top + 2],
      [R - 1, top + 2],
      [R - 1, top + 3],
    ],
    P.ink,
  );

  if (bigBlush) {
    s.rect(L - 3, y + 3, 3, 2, P.blush);
    s.rect(R + 4, y + 3, 3, 2, P.blush);
  }

  // wide frown, a fang standing up at each corner (outside the eyes)
  const my = y + 5;
  const ml = x - 6;
  const mr = x + 4;
  s.rect(ml, my, mr - ml + 1, 1, P.mouth);
  s.set(ml - 1, my + 1, P.mouth);
  s.set(mr + 1, my + 1, P.mouth);
  s.px(
    [
      [ml, my - 1],
      [ml + 1, my - 1],
      [ml, my - 2],
      [mr, my - 1],
      [mr - 1, my - 1],
      [mr, my - 2],
    ],
    P.white,
  );
}

export interface GoombaArt {
  idle: Pix[];
  run: Pix[];
  jump: Pix;
  fall: Pix;
  land: Pix;
  hurt: Pix;
  love: Pix[];
}

export function buildGoomba(): GoombaArt {
  // Waddle: the foot that swings forward is the one in the air, and the body
  // rises as the feet pass under it.
  const run: Pix[] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    run.push(
      frame({
        lift: Math.round(Math.abs(Math.sin(a)) * 1.5),
        nearX: Math.round(Math.cos(a) * 3.4),
        nearY: -Math.round(Math.max(0, -Math.sin(a)) * 2.6),
        farX: Math.round(Math.cos(a + Math.PI) * 3.4),
        farY: -Math.round(Math.max(0, Math.sin(a)) * 2.6),
        lean: 1,
      }),
    );
  }

  // Always grumpy: the brows and the fanged frown never change, whatever happens.
  return {
    idle: [frame({}), frame({ squash: 0.6, headDy: 1 }), frame({ eyes: 'blink' })],
    run,
    jump: frame({ lift: 2, squash: -1, nearX: -2, nearY: -1, farX: 1, farY: -1, lean: 1 }),
    fall: frame({ lift: 1, squash: -0.5, headDy: -2, nearX: 2, farX: -2, lean: 1, eyes: 'down' }),
    land: frame({ squash: 1.5, headDy: 1, nearX: 2, farX: -2, lean: 1, eyes: 'blink' }),
    hurt: frame({ squash: 0.8, headDy: -1, nearX: 2, farX: -3, eyes: 'hurt' }),
    // caught: still scowling, but blushing.
    // 0 held, 1 squashed on the catch, 2 tossed up, 3 coming down, 4 a slow blink
    love: [
      frame({ bigBlush: true }),
      frame({ bigBlush: true, squash: 1.3, headDy: 1, nearX: 1, farX: -1 }),
      frame({ bigBlush: true, squash: -1, lift: 2, nearX: -2, nearY: -1, farX: 1, farY: -1 }),
      frame({ bigBlush: true, squash: -0.5, lift: 1, headDy: -2, nearX: 2, farX: -2, eyes: 'down' }),
      frame({ bigBlush: true, eyes: 'blink' }),
    ],
  };
}
