import { CLEAR, Pix } from './pix.ts';
import { P } from './palette.ts';

// Obstacles, pickups, particles and HUD icons. Stingby is the only creature here;
// stumps, rocks and cacti are plain scenery.

function stump(): Pix {
  const s = new Pix(22, 19);
  const g = 17; // last row of the sprite body
  for (let x = 4; x <= 17; x++) {
    const t = (x - 4) / 13;
    const c = t < 0.12 ? P.wood[0] : t < 0.5 ? P.wood[2] : t < 0.82 ? P.wood[1] : P.wood[0];
    for (let y = 6; y <= g; y++) s.set(x, y, c);
  }
  // roots
  s.px(
    [
      [3, g],
      [2, g],
      [3, g - 1],
      [18, g],
      [19, g],
      [18, g - 1],
    ],
    P.wood[1],
  );
  // bark grooves
  s.px(
    [
      [7, 13],
      [7, 14],
      [12, 15],
      [12, 16],
      [15, 11],
      [15, 12],
    ],
    P.wood[0],
  );
  s.px(
    [
      [9, 15],
      [9, 16],
    ],
    P.wood[3],
  );
  // cut top with a growth ring
  s.ball(11, 5.5, 7.6, 3, P.woodTop, { bands: [-0.3, 0.3] });
  s.px(
    [
      [8, 5],
      [9, 4],
      [10, 4],
      [11, 4],
      [12, 4],
      [13, 5],
      [12, 6],
      [11, 6],
      [10, 6],
      [9, 6],
    ],
    P.woodTop[0],
  );
  // little sprout
  s.px(
    [
      [16, 3],
      [17, 2],
      [18, 2],
    ],
    P.leaf[1],
  );
  s.set(18, 1, P.leaf[2]);
  return s.outline(P.outline);
}

function rock(): Pix {
  const s = new Pix(24, 16);
  s.ball(9, 10, 7, 5.6, P.stone, { bands: [-0.25, 0.25, 0.55] });
  s.ball(15, 9, 7, 6.4, P.stone, { bands: [-0.25, 0.25, 0.55] });
  for (let y = 15; y < s.h; y++) for (let x = 0; x < s.w; x++) s.d[y * s.w + x] = CLEAR;
  // moss
  s.px(
    [
      [12, 3],
      [13, 3],
      [14, 3],
      [15, 3],
      [16, 3],
      [11, 4],
      [12, 4],
      [17, 4],
    ],
    P.grass[2],
  );
  s.px(
    [
      [13, 4],
      [14, 4],
      [18, 5],
    ],
    P.grass[1],
  );
  // crack
  s.px(
    [
      [6, 8],
      [7, 9],
      [7, 10],
    ],
    P.stone[0],
  );
  return s.outline(P.outline);
}

function cactus(): Pix {
  const s = new Pix(20, 27);
  const g = 25;
  // arms
  s.line(6, 15, 3, 15, P.cactus[1], 3);
  s.line(3, 15, 3, 10, P.cactus[1], 3);
  s.line(14, 17, 17, 17, P.cactus[0], 3);
  s.line(17, 17, 17, 13, P.cactus[1], 3);
  s.set(2, 10, P.cactus[2]);
  s.set(2, 11, P.cactus[2]);
  // trunk
  s.ball(10, 20, 4.7, 17, P.cactus, { bands: [-0.3, 0.1, 0.42] });
  for (let y = g + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.d[y * s.w + x] = CLEAR;
  // ribs / spines
  for (let y = 6; y <= g - 1; y += 3) {
    s.over(8, y, P.cactus[3]);
    s.over(12, y + 1, P.cactus[0]);
  }
  // flower
  s.px(
    [
      [9, 2],
      [11, 2],
      [10, 1],
      [10, 3],
    ],
    P.pink[1],
  );
  s.set(10, 2, P.star[1]);
  return s.outline(P.outline);
}

function stingby(flap: number): Pix {
  const s = new Pix(30, 26);
  // little leaf wings, flat on the downbeat and lifted on the upbeat
  if (flap === 0) {
    s.ball(8, 5, 4.2, 1.6, P.wing, { bands: [0.1] });
    s.ball(25, 8, 4.2, 1.6, P.wing, { bands: [0.1] });
  } else {
    s.ball(7.5, 3.5, 3.4, 2.4, P.wing, { bands: [0.1] });
    s.ball(25.5, 6, 3.4, 2.4, P.wing, { bands: [0.1] });
  }
  // black legs with round feet
  s.line(14, 20, 12, 23, P.ink, 1);
  s.rect(10, 23, 3, 2, P.ink);
  s.line(20, 20, 20, 23, P.ink, 1);
  s.rect(19, 23, 3, 2, P.ink);
  // round fuzzy body
  s.ball(17, 14, 8.2, 7.2, P.bee, { bands: [-0.25, 0.4] });
  // brown bands wrapping the back
  for (let y = 5; y <= 22; y++) {
    const bow = Math.round(Math.abs(y - 14) * 0.18);
    for (const x of [17, 18, 19]) s.over(x - bow, y, x === 19 ? P.beeStripe[0] : P.beeStripe[1], P.bee);
    for (const x of [23, 24, 25]) s.over(x - bow, y, P.beeStripe[0], P.bee);
  }
  // huge white eyes, looking at the runner; the front one overlaps the back one
  const eyeRamp = [0xd8dce8, P.white];
  s.ball(15.5, 9.5, 3.6, 4.4, eyeRamp, { bands: [-0.42] });
  s.ellipse(9.5, 10, 4.5, 5.3, P.outline);
  s.ball(9.5, 10, 3.6, 4.4, eyeRamp, { bands: [-0.42] });
  s.rect(8, 9, 2, 3, P.ink);
  s.set(8, 9, P.white);
  s.rect(14, 9, 2, 3, P.ink);
  s.set(14, 9, P.white);
  // the black sting: a cone below the eyes, pointing at the runner
  const cone: [number, number, number][] = [
    [14, 10, 13],
    [15, 8, 13],
    [16, 6, 12],
    [17, 4, 11],
    [18, 3, 8],
  ];
  for (const [y, x0, x1] of cone) for (let x = x0; x <= x1; x++) s.set(x, y, P.ink);
  s.px(
    [
      [10, 15],
      [9, 16],
      [8, 16],
    ],
    0x55556a,
  );
  return s.outline(P.outline);
}

function berry(): Pix {
  const s = new Pix(13, 15);
  s.ball(6.5, 8, 4.6, 4.4, P.berry, { bands: [-0.28, 0.2, 0.55] });
  // pointed bottom
  s.rect(5, 12, 3, 1, P.berry[0]);
  s.set(6, 13, P.berry[0]);
  // seeds
  s.px(
    [
      [5, 7],
      [8, 8],
      [6, 10],
      [4, 9],
      [8, 11],
    ],
    P.star[2],
  );
  // leaves
  s.rect(4, 3, 6, 1, P.leaf[1]);
  s.px(
    [
      [3, 4],
      [6, 4],
      [7, 4],
      [10, 4],
      [5, 2],
      [8, 2],
    ],
    P.leaf[1],
  );
  s.set(6, 2, P.leaf[2]);
  s.set(7, 1, P.leaf[0]);
  return s.outline(P.outline);
}

const HEART_ROWS = [
  '.22...22.',
  '2432.2222',
  '243222222',
  '233222222',
  '222222221',
  '.2222221.',
  '..22221..',
  '...221...',
  '....1....',
];

function heartShape(ramp: readonly number[]): Pix {
  const s = new Pix(11, 11);
  s.rows(1, 1, HEART_ROWS, { '1': ramp[0], '2': ramp[1], '3': ramp[2], '4': ramp[3] });
  return s.outline(P.outline);
}

function miniHeart(c: number, hi: number): Pix {
  const s = new Pix(5, 5);
  s.rows(0, 0, ['11.11', '12111', '11111', '.111.', '..1..'], { '1': c, '2': hi });
  return s;
}

function sparkle(i: number): Pix {
  const s = new Pix(7, 7);
  const c = P.star[2];
  if (i === 0) {
    s.set(3, 3, c);
  } else if (i === 1) {
    s.px(
      [
        [3, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [3, 4],
      ],
      c,
    );
  } else {
    s.px(
      [
        [3, 0],
        [3, 1],
        [3, 5],
        [3, 6],
        [0, 3],
        [1, 3],
        [5, 3],
        [6, 3],
      ],
      P.star[1],
    );
    s.px(
      [
        [3, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [3, 4],
      ],
      c,
    );
  }
  return s;
}

function dust(i: number): Pix {
  const s = new Pix(9, 9);
  const r = [1.6, 2.6, 3.4][i];
  s.ball(4.5, 4.5, r, r, [0xd9cdb8, 0xf4ecdc, 0xffffff], { bands: [-0.1, 0.45] });
  if (i === 2) {
    // breaking apart
    s.d[4 * 9 + 4] = CLEAR;
    s.d[5 * 9 + 4] = CLEAR;
    s.d[4 * 9 + 5] = CLEAR;
    s.d[3 * 9 + 3] = CLEAR;
  }
  return s;
}

export function buildProps() {
  const flash = (p: Pix) => p.tint(P.white);
  return {
    stump: stump(),
    rock: rock(),
    cactus: cactus(),
    stingby: [stingby(0), stingby(1)],
    berry: berry(),
    heart: heartShape(P.heart),
    heartHud: heartShape(P.heart),
    heartEmpty: heartShape([0x3a2a44, 0x4a3656, 0x4a3656, 0x4a3656]),
    miniHeart: [miniHeart(P.heart[1], P.heart[3]), miniHeart(P.pink[1], P.pink[2])],
    sparkle: [sparkle(0), sparkle(1), sparkle(2), sparkle(1)],
    dust: [dust(0), dust(1), dust(2)],
    berryFlash: flash(berry()),
  };
}
