// Keyboard + pointer input, exposed as per-frame edges.

export class Input {
  jumpPressed = false;
  jumpHeld = false;
  pausePressed = false;
  mutePressed = false;
  /** pointer taps in game coordinates (for the on-screen buttons) */
  taps: { x: number; y: number }[] = [];
  onFirstGesture: (() => void) | null = null;

  private keysDown = new Set<string>();
  private pointerDown = false;

  constructor(canvas: HTMLCanvasElement) {
    const jumpKeys = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      this.gesture();
      if (jumpKeys.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.jumpPressed = true;
        this.keysDown.add(e.code);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) this.pausePressed = true;
      } else if (e.code === 'KeyM') {
        if (!e.repeat) this.mutePressed = true;
      }
      this.sync();
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.sync();
    });
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.gesture();
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * canvas.width;
      const y = ((e.clientY - r.top) / r.height) * canvas.height;
      this.taps.push({ x, y });
      this.pointerDown = true;
      this.sync();
    });
    const up = () => {
      this.pointerDown = false;
      this.sync();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      up();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** a tap that the UI did not consume counts as a jump */
  tapJump(): void {
    this.jumpPressed = true;
  }

  endFrame(): void {
    this.jumpPressed = false;
    this.pausePressed = false;
    this.mutePressed = false;
    this.taps.length = 0;
  }

  private sync(): void {
    this.jumpHeld = this.keysDown.size > 0 || this.pointerDown;
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      this.onFirstGesture();
      this.onFirstGesture = null;
    }
  }
}
