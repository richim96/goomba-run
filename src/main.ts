import { Game, H, W } from './game/game.ts';
import { Input } from './game/input.ts';
import { BTN_PAUSE, BTN_SOUND, Renderer } from './game/render.ts';
import { Sound } from './game/audio.ts';
import { buildSprites } from './game/gfx.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const sound = new Sound();
try {
  sound.muted = localStorage.getItem('goomba-run.muted') === '1';
} catch {
  /* storage unavailable */
}
const input = new Input(canvas);
const game = new Game(sound);
const sprites = buildSprites();
const renderer = new Renderer(canvas, sprites);
game.muted = sound.muted;

/** how far the last picture was from the previous simulation step (0) to the current one (1) */
let alpha = 1;

/** the canvas bitmap never gets wider than this many real pixels per game pixel (10 = 3200 x 1800) */
const MAX_BITMAP_SCALE = 10;

// The bitmap is drawn at the screen's own resolution, so things can move by one
// real pixel instead of one game pixel. On very large screens it is a whole
// fraction of that (the browser then enlarges it by a whole number), which keeps
// the pixels square and the bitmap a size any graphics chip can fill 60 times a second.
function bitmapScale(device: number): number {
  if (device <= MAX_BITMAP_SCALE) return Math.max(1, device);
  for (let k = MAX_BITMAP_SCALE; k >= 4; k--) if (device % k === 0) return k;
  return device;
}

// Biggest size that fits with every game pixel a whole number of screen pixels,
// so the art stays crisp on any display (2.5x on a retina screen is 5 real pixels).
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  const device = Math.floor(k * dpr);
  const scale = device >= 2 ? device / dpr : Math.max(0.5, k);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  // resizing the bitmap wipes it, so it is redrawn straight away
  renderer.resize(bitmapScale(device));
  renderer.draw(game, alpha);
}
window.addEventListener('resize', fit);
fit();

input.onGesture = () => sound.unlock();
input.onFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
};

function toggleMute(): void {
  sound.setMuted(!sound.muted);
  game.muted = sound.muted;
  try {
    localStorage.setItem('goomba-run.muted', sound.muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// tab icon straight from the sprite, so nothing is fetched
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon) icon.href = sprites.goomba.idle[0].toDataURL();

// For poking at the game from the console. Setting `freeze` hands the clock to
// you: step with `__goomba.game.update(1 / 60, input)` and `__goomba.renderer.draw(game)`.
const debug = { game, renderer, input, sound, freeze: false };
(window as unknown as { __goomba: typeof debug }).__goomba = debug;

// stepping away pauses the run
const autoPause = () => {
  if (game.mode === 'play' && !game.paused && !debug.freeze) game.togglePause();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});
window.addEventListener('blur', autoPause);

const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

// On the website the game saves itself for offline play, so a copy on an
// iPhone Home Screen keeps working without internet. A double-clicked file,
// the Mac app and the dev server skip this.
const onWebsite = location.protocol === 'https:' || location.hostname === 'localhost';
if (import.meta.env.PROD && onWebsite && !location.hostname.endsWith('.invalid') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}

// The rules run at a fixed 60 steps a second; the screen refreshes whenever it
// likes. `ahead` is how far the rules are ahead of the picture: each frame the
// picture's clock moves on by the time that really passed, the rules step until
// they are level with it or just past it, and the renderer draws the moment in
// between. So the picture moves evenly on any screen, and a step that lands a
// hair early or late no longer shows up as a frozen frame followed by a double one.
const STEP = 1 / 60;
/** a frame this close (seconds) to a whole number of half steps counts as exactly that: a 60 or 120 Hz screen */
const IN_STEP = 0.00075;
let last = performance.now();
let ahead = 0;

function frame(now: number): void {
  if (debug.freeze) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // browsers report frame times a little off (some only to the millisecond);
  // on a screen that keeps step with the rules, use the exact step instead
  const halves = Math.round(dt / (STEP / 2));
  const inStep = halves >= 1 && Math.abs(dt - (halves * STEP) / 2) < IN_STEP;
  if (inStep) dt = (halves * STEP) / 2;

  if (input.mutePressed) {
    input.mutePressed = false;
    toggleMute();
  }
  for (const tap of input.taps) {
    if (inside(tap, BTN_SOUND)) toggleMute();
    else if (inside(tap, BTN_PAUSE) && game.mode === 'play') game.togglePause();
    else input.tapJump();
  }
  input.taps.length = 0;
  game.touch = input.touch;

  ahead -= dt;
  while (ahead < 0) {
    renderer.remember(game);
    game.update(STEP, input);
    input.endFrame();
    ahead += STEP;
  }
  // in step with the screen, the picture need not trail the rules at all (60 Hz)
  // or by more than half a step (120 Hz): let any extra lag drain away
  if (inStep) ahead -= Math.min(ahead % (halves % 2 === 0 ? STEP : STEP / 2), STEP * 0.02);
  alpha = 1 - ahead / STEP;
  renderer.draw(game, alpha);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
