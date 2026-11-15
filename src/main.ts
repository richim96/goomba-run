import Phaser from 'phaser';
import { Sound } from './game/audio.ts';
import { BTN_PAUSE, BTN_SOUND, H, W } from './game/config.ts';
import { gameConfig } from './game/gameConfig.ts';
import { Input } from './game/input.ts';
import type { RunScene } from './game/RunScene.ts';
import { shell } from './game/shell.ts';
import { sourceSprites } from './game/textures.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const sound = new Sound();
try {
  sound.muted = localStorage.getItem('goomba-run.muted') === '1';
} catch {
  /* storage unavailable */
}
const input = new Input(canvas);
shell.sfx = sound;
shell.controls = input;
shell.muted = sound.muted;

const game = new Phaser.Game(gameConfig({ type: Phaser.WEBGL, canvas }));
const run = () => game.scene.getScene('run') as RunScene | null;

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
// The scenes' cameras zoom by the same number, so sprites keep their chunky
// pixels but can sit between game pixels.
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  const device = Math.floor(k * dpr);
  const scale = device >= 2 ? device / dpr : Math.max(0.5, k);
  shell.k = bitmapScale(device);
  game.scale.resize(W * shell.k, H * shell.k);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
window.addEventListener('resize', fit);
game.events.once(Phaser.Core.Events.READY, fit);

input.onGesture = () => sound.unlock();
input.onFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
};

function toggleMute(): void {
  sound.setMuted(!sound.muted);
  shell.muted = sound.muted;
  try {
    localStorage.setItem('goomba-run.muted', sound.muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// tab icon straight from the sprite, so nothing is fetched
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon) icon.href = sourceSprites().goomba.idle[0].toDataURL();

// For poking at the game from the console. Setting `shell.freeze` hands the
// clock to you: step with `__goomba.run.advance(1 / 60, __goomba.input)`; the
// next picture shows the result.
const debug = {
  game, input, sound, shell,
  get run() {
    return run();
  },
};
(window as unknown as { __goomba: typeof debug }).__goomba = debug;

// stepping away pauses the run
const autoPause = () => {
  const r = run();
  if (r && r.s.mode === 'play' && !r.s.paused && !shell.freeze) r.togglePause();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});
window.addEventListener('blur', autoPause);

const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

// before the scenes move: taps go to the HUD buttons or count as a jump
game.events.on(Phaser.Core.Events.PRE_STEP, () => {
  if (input.mutePressed) {
    input.mutePressed = false;
    toggleMute();
  }
  for (const tap of input.taps) {
    if (inside(tap, BTN_SOUND)) toggleMute();
    else if (inside(tap, BTN_PAUSE) && run()?.s.mode === 'play') run()?.togglePause();
    else input.tapJump();
  }
  input.taps.length = 0;
  shell.touch = input.touch;
});
// ... and after them the per-frame edges are spent
game.events.on(Phaser.Core.Events.POST_STEP, () => {
  if (!shell.freeze) input.endFrame();
});

// On the website the game saves itself for offline play, so a copy on an
// iPhone Home Screen or a Mac Dock keeps working without internet. A
// double-clicked file and the dev server skip this.
const onWebsite = location.protocol === 'https:' || location.hostname === 'localhost';
if (import.meta.env.PROD && onWebsite && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}
