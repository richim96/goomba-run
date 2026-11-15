// Fairness check, on the page /sim.html while `npm run dev` runs (`npm run sim`
// opens it). A look-ahead bot plays the real run scene: the same Phaser physics
// and rules as the game, without pictures. If even the bot cannot avoid a hit,
// the spawner produced something unfair. It also measures how wide each
// jump-timing window is, which is what a person actually feels as difficulty.
//
//   /sim.html                      -> 6 runs to 2500 m
//   /sim.html?runs=10&meters=4000  -> 10 runs to 4000 m
import Phaser from 'phaser';
import { PLAYER_X, PX_PER_METER } from './game/config.ts';
import { gameConfig } from './game/gameConfig.ts';
import type { RunScene, Snapshot } from './game/RunScene.ts';
import { shell } from './game/shell.ts';

const DT = 1 / 60;
const HORIZON = 100; // frames the bot looks ahead (1.67 s)
const BACK = 56; // frames of grounded history kept for measuring windows

// seeded Math.random: the game's randomness becomes replayable, so a look-ahead
// from a copy sees exactly what the real run will do
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

shell.lite = true;
shell.sfx = new Proxy({}, { get: () => () => undefined }) as never;

let run: RunScene;

/** a moment of a run: the rules' state and the random seed that goes with it */
interface Moment {
  snap: Snapshot;
  seed: number;
}
const now = (): Moment => ({ snap: run.snapshot(), seed });
const go = (m: Moment): void => {
  run.restore(m.snap);
  seed = m.seed;
};
const metersOf = (m: Moment) => Math.floor(m.snap.s.dist / PX_PER_METER);

/** a jump press: starts `at` frames from now (negative = already down), held for `hold` frames */
type Press = { at: number; hold: number };
const HOLDS = [20, 8, 3];

function step(pressed: boolean, held: boolean): void {
  run.advance(DT, { jumpPressed: pressed, jumpHeld: held, pausePressed: false });
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

/** frame of the first hit when `plan` is played from `m`, or -1 */
function firstHit(m: Moment, plan: Press[], frames: number): number {
  go(m);
  const lives = run.s.lives;
  for (let f = 0; f < frames; f++) {
    const [p, h] = inputAt(plan, f);
    step(p, h);
    if (run.s.lives < lives) return f;
  }
  return -1;
}

/** plays `plan` from `m` until the Goomba is back on the ground after its last press */
function untilLanding(m: Moment, plan: Press[], frames: number): { ok: boolean; at: number; state: Moment } {
  go(m);
  const lives = run.s.lives;
  const last = Math.max(...plan.map((p) => p.at));
  for (let f = 0; f < frames; f++) {
    const [p, h] = inputAt(plan, f);
    step(p, h);
    if (run.s.lives < lives) return { ok: false, at: f, state: now() };
    if (f > last + 2 && run.s.grounded) return { ok: true, at: f + 1, state: now() };
  }
  return { ok: true, at: frames, state: now() };
}

/** depth-first search for a set of presses that survives the whole horizon */
function findPlan(m: Moment, depth: number, horizon: number, ongoing: Press[]): Press[] | null {
  const idle = firstHit(m, ongoing, horizon);
  if (idle < 0) return ongoing;
  if (depth === 0) return null;

  const bases = ongoing.length ? [ongoing, []] : [ongoing]; // keep holding, or let go now
  const singles: { plan: Press[]; t0: number }[] = [];
  const doubles: Press[][] = [];
  for (const base of bases) {
    for (let t0 = Math.min(idle, horizon - 1); t0 >= Math.max(0, idle - 55); t0--) {
      for (const hold of HOLDS) {
        const one = [...base, { at: t0, hold }];
        if (untilLanding(m, one, horizon).ok) singles.push({ plan: one, t0 });
        if (t0 % 2 === 0 && hold !== 3) {
          for (const d of [6, 10, 14, 18, 24]) {
            for (const hold2 of [20, 5]) {
              const two = [...one, { at: t0 + d, hold: hold2 }];
              if (untilLanding(m, two, horizon).ok) doubles.push(two);
            }
          }
        }
      }
    }
  }
  // Most natural first: single jumps that actually clear the threat, from the
  // middle of their window; then hops that only buy time; then double jumps.
  const clears = singles.filter((c) => firstHit(m, c.plan, idle + 16) < 0);
  const others = singles.filter((c) => !clears.includes(c));
  const mid = clears.length ? clears.map((c) => c.t0).sort((a, b) => a - b)[clears.length >> 1] : 0;
  clears.sort((a, b) => Math.abs(a.t0 - mid) - Math.abs(b.t0 - mid));
  const ordered = [...clears.map((c) => c.plan), ...doubles.slice(0, 12), ...others.map((c) => c.plan), ...doubles.slice(12)];
  let tries = 0;
  for (const plan of ordered) {
    if (++tries > 40) break;
    const land = untilLanding(m, plan, horizon);
    const rest = findPlan(land.state, depth - 1, horizon - land.at, []);
    if (rest) return [...plan, ...rest.map((p) => ({ at: p.at + land.at, hold: p.hold }))];
  }
  return null;
}

interface Jump {
  m: number;
  speed: number;
  /** press frames, counted from when the Goomba was free to jump, that clear the threat with one plain jump */
  window: number;
  what: string;
}

function describe(m: Moment): string {
  const { s, obs } = m.snap;
  return obs
    .map((o) => ({ o, x: o.x - s.scrollX }))
    .filter(({ x }) => x > PLAYER_X - 40 && x < PLAYER_X + 260)
    .map(({ o, x }) => `${o.kind}@${Math.round(x - PLAYER_X)}${o.kind === 'stingby' ? (o.baseY < 100 ? 'hi' : 'lo') : ''}`)
    .join(' ');
}

/** how many press frames would have worked, starting from the earliest moment the Goomba stood free */
function windowFrom(m: Moment): number {
  const idle = firstHit(m, [], HORIZON);
  if (idle < 0) return 99;
  let n = 0;
  for (let t0 = idle; t0 >= Math.max(0, idle - 55); t0--) {
    if (HOLDS.some((hold) => firstHit(m, [{ at: t0, hold }], idle + 16) < 0)) n++;
  }
  return n;
}

function playRun(fresh: Snapshot, seed0: number, maxMeters: number) {
  go({ snap: fresh, seed: seed0 });
  step(true, true);
  let cur = now();
  let plan: Press[] = [];
  let pf = 0;
  let hits = 0;
  let airJumps = 0;
  let frames = 0;
  const jumps: Jump[] = [];
  const unavoidable: string[] = [];
  let free: Moment[] = [];

  while (cur.snap.s.mode === 'play' && metersOf(cur) < maxMeters) {
    const s = cur.snap.s;
    let ahead = plan.map((p) => ({ at: p.at - pf, hold: p.hold })).filter((p) => p.at + p.hold > 0);
    if (s.invuln <= 0 && firstHit(cur, ahead, HORIZON) >= 0) {
      const found = findPlan(cur, 2, HORIZON, ahead.filter((p) => p.at < 0));
      if (found) ahead = found;
      else unavoidable.push(`${metersOf(cur)} m, ${Math.round(s.speed)} px/s, ${s.grounded ? 'ground' : 'air'}: ${describe(cur)}`);
      plan = ahead;
      pf = 0;
    }
    const [p, h] = inputAt(plan, pf);
    if (s.grounded && !h && !p) {
      free.push(cur);
      if (free.length > BACK) free.shift();
    } else if (p && s.grounded) {
      const from = free[0] ?? cur;
      const window = windowFrom(from);
      if (window < 99) jumps.push({ m: metersOf(cur), speed: s.speed, window, what: describe(from) });
      free = [];
    } else {
      if (p) airJumps++;
      free = [];
    }
    go(cur);
    step(p, h);
    if (run.s.lives < s.lives) hits++;
    cur = now();
    pf++;
    frames++;
  }
  const end = cur.snap.s;
  return {
    meters: metersOf(cur), score: metersOf(cur) + end.berries * 10, hits, airJumps, jumps, unavoidable,
    seconds: frames * DT, caught: end.mode !== 'play',
  };
}

const out = document.getElementById('out')!;
const lines: string[] = [];
const say = (line: string) => {
  lines.push(line);
  out.textContent = lines.join('\n');
};
const pause = () => new Promise((r) => setTimeout(r, 0));

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const runs = Number(params.get('runs') ?? 6);
  const maxMeters = Number(params.get('meters') ?? 2500);

  const game = new Phaser.Game(gameConfig({ type: Phaser.HEADLESS, parent: document.body }));
  await new Promise((r) => game.events.once(Phaser.Core.Events.READY, r));
  game.loop.stop();
  // a few steps by hand bring the run scene up; after that only the bot moves it
  for (let i = 0; i < 6 && !(game.scene.getScene('run') as RunScene | null)?.goomba; i++) game.headlessStep(i * 16, 16);
  run = game.scene.getScene('run') as RunScene;
  const fresh = run.snapshot();

  lines.length = 0;
  const all: Jump[] = [];
  let unavoidable = 0;
  let hits = 0;
  const t0 = performance.now();
  for (let r = 0; r < runs; r++) {
    say(`run ${r + 1} of ${runs}…`);
    await pause();
    const res = playRun(fresh, 1000 + r * 7919, maxMeters);
    lines.pop();
    all.push(...res.jumps);
    unavoidable += res.unavoidable.length;
    hits += res.hits;
    say(
      `run ${r + 1}: ${res.meters} m in ${res.seconds.toFixed(0)} s, score ${res.score}, ` +
        `${res.jumps.length} jumps, ${res.airJumps} double jumps, bot hits ${res.hits}${res.caught ? ' (caught)' : ''}`,
    );
    for (const u of res.unavoidable.slice(0, 6)) say(`   no way out at ${u}`);
  }

  say('\njump timing windows (frames at 60 fps; under 5 is too tight for a person)');
  say('distance     jumps/run  min  10th pct  median  under 5');
  const col = (v: number | string, n: number) => String(v).padStart(n);
  for (let lo = 0; lo < maxMeters; lo += 250) {
    const w = all.filter((t) => t.m >= lo && t.m < lo + 250).map((t) => t.window).sort((x, y) => x - y);
    if (!w.length) continue;
    say(
      `${col(lo, 4)}-${String(lo + 250).padEnd(5)}${col((w.length / runs).toFixed(1), 10)}${col(w[0], 5)}` +
        `${col(w[Math.floor(w.length * 0.1)], 10)}${col(w[w.length >> 1], 8)}${col(w.filter((v) => v < 5).length, 9)}`,
    );
  }
  say('\ntightest jumps:');
  for (const t of [...all].sort((a, b) => a.window - b.window).slice(0, 8)) {
    say(`  ${t.window} frames at ${t.m} m, ${Math.round(t.speed)} px/s: ${t.what}`);
  }
  say(`\ntotal: ${hits} bot hits, ${unavoidable} moments with no way out, over ${runs} runs (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  if (unavoidable > 0) out.classList.add('bad');
  (window as unknown as { __simDone: boolean }).__simDone = true;
}

void main();
