// Fairness check. A look-ahead bot plays the real game rules (no rendering).
// If even the bot cannot avoid a hit, the spawner produced something unfair.
// It also measures how wide each jump-timing window is, which is what a human
// actually feels as difficulty.
//
//   npm run sim            -> 6 runs to 2500 m
//   npm run sim -- 10 4000 -> 10 runs to 4000 m
import { Game, PLAYER_X } from '../src/game/game.ts';

const DT = 1 / 60;
const HORIZON = 100; // frames the bot looks ahead (1.67 s)
const BACK = 56; // frames of grounded history kept for measuring windows

// seeded Math.random: the game's randomness becomes replayable, so a look-ahead
// on a copy sees exactly what the real run will do
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const sound: Any = new Proxy({}, { get: () => () => undefined });

/** a jump press: starts `at` frames from now (negative = already down), held for `hold` frames */
type Press = { at: number; hold: number };
const HOLDS = [20, 8, 3];

function clone(g: Game): Game {
  const c = Object.create(Game.prototype) as Any;
  for (const [k, v] of Object.entries(g as Any)) {
    if (k === 'particles' || k === 'decos') c[k] = [];
    else if (Array.isArray(v)) c[k] = v.map((o) => (o && typeof o === 'object' ? { ...o } : o));
    else if (v && typeof v === 'object' && k !== 'sound') c[k] = { ...v };
    else c[k] = v;
  }
  return c as Game;
}

function step(g: Game, pressed: boolean, held: boolean): void {
  g.update(DT, { jumpPressed: pressed, jumpHeld: held, pausePressed: false, mutePressed: false } as Any);
}

function inputAt(plan: Press[], f: number): [boolean, boolean] {
  let pressed = false;
  let held = false;
  for (const p of plan) {
    if (f === p.at) pressed = true;
    if (f >= p.at && f < p.at + p.hold) held = true;
  }
  return [pressed, held];
}

/** frame of the first hit when `plan` is played on a copy, or -1 */
function firstHit(g: Game, plan: Press[], frames: number): number {
  const save = seed;
  const c = clone(g);
  const lives = c.lives;
  let hit = -1;
  for (let f = 0; f < frames; f++) {
    const [p, h] = inputAt(plan, f);
    step(c, p, h);
    if (c.lives < lives) {
      hit = f;
      break;
    }
  }
  seed = save;
  return hit;
}

/** plays `plan` on a copy until the Goomba is back on the ground after its last press */
function untilLanding(g: Game, plan: Press[], frames: number): { ok: boolean; at: number; state: Game } {
  const c = clone(g);
  const lives = c.lives;
  const last = Math.max(...plan.map((p) => p.at));
  for (let f = 0; f < frames; f++) {
    const [p, h] = inputAt(plan, f);
    step(c, p, h);
    if (c.lives < lives) return { ok: false, at: f, state: c };
    if (f > last + 2 && c.grounded) return { ok: true, at: f + 1, state: c };
  }
  return { ok: true, at: frames, state: c };
}

/** depth-first search for a set of presses that survives the whole horizon */
function findPlan(g: Game, depth: number, horizon: number, ongoing: Press[]): Press[] | null {
  const idle = firstHit(g, ongoing, horizon);
  if (idle < 0) return ongoing;
  if (depth === 0) return null;

  const S = seed;
  const bases = ongoing.length ? [ongoing, []] : [ongoing]; // keep holding, or let go now
  const singles: { plan: Press[]; t0: number }[] = [];
  const doubles: Press[][] = [];
  for (const base of bases) {
    for (let t0 = Math.min(idle, horizon - 1); t0 >= Math.max(0, idle - 55); t0--) {
      for (const hold of HOLDS) {
        const one = [...base, { at: t0, hold }];
        seed = S;
        if (untilLanding(g, one, horizon).ok) singles.push({ plan: one, t0 });
        if (t0 % 2 === 0 && hold !== 3) {
          for (const d of [6, 10, 14, 18, 24]) {
            for (const hold2 of [20, 5]) {
              const two = [...one, { at: t0 + d, hold: hold2 }];
              seed = S;
              if (untilLanding(g, two, horizon).ok) doubles.push(two);
            }
          }
        }
      }
    }
  }
  // Most natural first: single jumps that actually clear the threat, from the
  // middle of their window; then hops that only buy time; then double jumps.
  const clears = singles.filter((c) => {
    seed = S;
    return firstHit(g, c.plan, idle + 16) < 0;
  });
  const others = singles.filter((c) => !clears.includes(c));
  const mid = clears.length ? clears.map((c) => c.t0).sort((a, b) => a - b)[clears.length >> 1] : 0;
  clears.sort((a, b) => Math.abs(a.t0 - mid) - Math.abs(b.t0 - mid));
  const ordered = [...clears.map((c) => c.plan), ...doubles.slice(0, 12), ...others.map((c) => c.plan), ...doubles.slice(12)];
  let tries = 0;
  for (const plan of ordered) {
    if (++tries > 40) break;
    seed = S;
    const land = untilLanding(g, plan, horizon);
    const rest = findPlan(land.state, depth - 1, horizon - land.at, []);
    if (rest) {
      seed = S;
      return [...plan, ...rest.map((p) => ({ at: p.at + land.at, hold: p.hold }))];
    }
  }
  seed = S;
  return null;
}

interface Jump {
  m: number;
  speed: number;
  /** press frames, counted from when the Goomba was free to jump, that clear the threat with one plain jump */
  window: number;
  what: string;
}

function describe(g: Game): string {
  return g.obstacles
    .filter((o) => o.x > PLAYER_X - 40 && o.x < PLAYER_X + 260)
    .map((o) => `${o.kind}@${Math.round(o.x - PLAYER_X)}${o.kind === 'stingby' ? (o.baseY < 100 ? 'hi' : 'lo') : ''}`)
    .join(' ');
}

/** how many press frames would have worked, starting from the earliest state the Goomba stood free */
function windowFrom(state: Game, stateSeed: number): number {
  const save = seed;
  seed = stateSeed;
  const idle = firstHit(state, [], HORIZON);
  let n = 99;
  if (idle >= 0) {
    n = 0;
    for (let t0 = idle; t0 >= Math.max(0, idle - 55); t0--) {
      seed = stateSeed;
      if (HOLDS.some((hold) => firstHit(state, [{ at: t0, hold }], idle + 16) < 0)) n++;
    }
  }
  seed = save;
  return n;
}

function playRun(seed0: number, maxMeters: number) {
  seed = seed0;
  const g = new Game(sound);
  step(g, true, true);
  let plan: Press[] = [];
  let pf = 0;
  let hits = 0;
  let airJumps = 0;
  let frames = 0;
  const jumps: Jump[] = [];
  const unavoidable: string[] = [];
  let free: { state: Game; seed: number }[] = [];

  while (g.mode === 'play' && g.meters < maxMeters) {
    let cur = plan.map((p) => ({ at: p.at - pf, hold: p.hold })).filter((p) => p.at + p.hold > 0);
    if (g.invuln <= 0 && firstHit(g, cur, HORIZON) >= 0) {
      const found = findPlan(g, 2, HORIZON, cur.filter((p) => p.at < 0));
      if (found) cur = found;
      else unavoidable.push(`${g.meters} m, ${Math.round(g.speed)} px/s, ${g.grounded ? 'ground' : 'air'}: ${describe(g)}`);
      plan = cur;
      pf = 0;
    }
    const [p, h] = inputAt(plan, pf);
    if (g.grounded && !h && !p) {
      free.push({ state: clone(g), seed });
      if (free.length > BACK) free.shift();
    } else if (p && g.grounded) {
      const from = free[0] ?? { state: clone(g), seed };
      const window = windowFrom(from.state, from.seed);
      if (window < 99) jumps.push({ m: g.meters, speed: g.speed, window, what: describe(from.state) });
      free = [];
    } else {
      if (p) airJumps++;
      free = [];
    }
    const lives = g.lives;
    step(g, p, h);
    if (g.lives < lives) hits++;
    pf++;
    frames++;
  }
  return { meters: g.meters, score: g.score, hits, airJumps, jumps, unavoidable, seconds: frames * DT, caught: g.mode !== 'play' };
}

const runs = Number(process.argv[2] ?? 6);
const maxMeters = Number(process.argv[3] ?? 2500);
const all: Jump[] = [];
let unavoidable = 0;
let hits = 0;
for (let r = 0; r < runs; r++) {
  const out = playRun(1000 + r * 7919, maxMeters);
  all.push(...out.jumps);
  unavoidable += out.unavoidable.length;
  hits += out.hits;
  console.log(
    `run ${r + 1}: ${out.meters} m in ${out.seconds.toFixed(0)} s, score ${out.score}, ` +
      `${out.jumps.length} jumps, ${out.airJumps} double jumps, bot hits ${out.hits}${out.caught ? ' (caught)' : ''}`,
  );
  for (const u of out.unavoidable.slice(0, 6)) console.log(`   no way out at ${u}`);
}

console.log('\njump timing windows (frames at 60 fps; under 5 is too tight for a person)');
console.log('distance     jumps/run  min  10th pct  median  under 5');
for (let lo = 0; lo < maxMeters; lo += 250) {
  const w = all.filter((t) => t.m >= lo && t.m < lo + 250).map((t) => t.window).sort((x, y) => x - y);
  if (!w.length) continue;
  const col = (v: number | string, n: number) => String(v).padStart(n);
  console.log(
    `${col(lo, 4)}-${String(lo + 250).padEnd(5)}${col((w.length / runs).toFixed(1), 10)}${col(w[0], 5)}` +
      `${col(w[Math.floor(w.length * 0.1)], 10)}${col(w[w.length >> 1], 8)}${col(w.filter((v) => v < 5).length, 9)}`,
  );
}
const tightest = [...all].sort((a, b) => a.window - b.window).slice(0, 8);
console.log('\ntightest jumps:');
for (const t of tightest) console.log(`  ${t.window} frames at ${t.m} m, ${Math.round(t.speed)} px/s: ${t.what}`);

console.log(`\ntotal: ${hits} bot hits, ${unavoidable} moments with no way out, over ${runs} runs`);
if (unavoidable > 0) process.exitCode = 1;
