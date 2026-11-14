import { Game, H, W } from './game/game.ts';
import { Input } from './game/input.ts';
import { Renderer } from './game/render.ts';
import { Sound } from './game/audio.ts';
import { buildSprites } from './game/gfx.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;

// Largest crisp scale that fits the window (whole numbers whenever there is room).
function fit(): void {
  const k = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = k >= 2 ? Math.floor(k) : Math.max(0.5, k);
  canvas.style.width = `${Math.round(W * scale)}px`;
  canvas.style.height = `${Math.round(H * scale)}px`;
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
input.onFirstGesture = () => sound.unlock();
const game = new Game(sound);
const sprites = buildSprites();
const renderer = new Renderer(canvas, sprites);

// tab icon straight from the sprite, so nothing is fetched
const icon = document.createElement('link');
icon.rel = 'icon';
icon.href = sprites.goomba.idle[0].toDataURL();
document.head.append(icon);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play' && !game.paused) game.togglePause();
});

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;

  if (input.mutePressed) {
    input.mutePressed = false;
    sound.setMuted(!sound.muted);
    try {
      localStorage.setItem('goomba-run.muted', sound.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  if (input.taps.length > 0) input.tapJump();

  while (acc >= STEP) {
    game.update(STEP, input);
    input.endFrame();
    acc -= STEP;
  }
  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for poking at the game from the console
(window as unknown as { game: Game }).game = game;
