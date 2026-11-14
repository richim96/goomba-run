// Keyboard + pointer input, exposed as per-frame edges.
import { H, W } from './game.ts';

export class Input {
  jumpPressed = false;
  jumpHeld = false;
  pausePressed = false;
  mutePressed = false;
  /** pointer presses in game coordinates; the shell decides if one hit a HUD button */
  taps: { x: number; y: number }[] = [];
  /** true once a finger (not a mouse) has been used */
  touch = false;
  /** called inside every user gesture (browsers only allow audio to start there) */
  onGesture: (() => void) | null = null;
  /** called inside the key handler, as fullscreen also needs a live gesture */
  onFullscreen: (() => void) | null = null;

  private keysDown = new Set<string>();
  private pointerDown = false;

  constructor(canvas: HTMLCanvasElement) {
    const jumpKeys = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
    const gesture = () => this.onGesture?.();

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      gesture();
      if (jumpKeys.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.jumpPressed = true;
        this.keysDown.add(e.code);
      } else if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyM' || e.code === 'KeyF') {
        // swallowed even on repeat, so a native wrapper never beeps for the game's own keys
        e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'KeyM') this.mutePressed = true;
        else if (e.code === 'KeyF') this.onFullscreen?.();
        else this.pausePressed = true;
      }
      this.sync();
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.sync();
    });

    // anywhere on the page counts, not just the canvas: the letterbox is a fine place to tap
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      gesture();
      if (e.pointerType === 'touch') this.touch = true;
      const r = canvas.getBoundingClientRect();
      this.taps.push({
        // game pixels, whatever the size of the canvas bitmap
        x: ((e.clientX - r.left) / r.width) * W,
        y: ((e.clientY - r.top) / r.height) * H,
      });
      this.pointerDown = true;
      this.sync();
    });
    const up = () => {
      this.pointerDown = false;
      this.sync();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // iOS only treats these as gestures that may start audio
    window.addEventListener('touchend', gesture);
    window.addEventListener('click', gesture);
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      up();
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** a tap that the HUD did not consume counts as a jump */
  tapJump(): void {
    this.jumpPressed = true;
  }

  endFrame(): void {
    this.jumpPressed = false;
    this.pausePressed = false;
    this.mutePressed = false;
  }

  private sync(): void {
    this.jumpHeld = this.keysDown.size > 0 || this.pointerDown;
  }
}
