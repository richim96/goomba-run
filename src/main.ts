import { Game, H, W } from './game/game.ts';
import { Input } from './game/input.ts';
import { BTN_PAUSE, BTN_SOUND, Renderer } from './game/render.ts';
import { Sound } from './game/audio.ts';
import { buildSprites } from './game/gfx.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;

// Biggest size that fits with every game pixel a whole number of screen pixels,
// so the art stays crisp on any display (2.5x on a retina screen is 5 real pixels).
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  const device = Math.floor(k * dpr);
  const scale = device >= 2 ? device / dpr : Math.max(0.5, k);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
window.addEventListener('resize', fit);
fit();

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

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  if (debug.freeze) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;

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

  while (acc >= STEP) {
    game.update(STEP, input);
    input.endFrame();
    acc -= STEP;
  }
  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
