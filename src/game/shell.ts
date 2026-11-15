// What the page hands to the scenes: sound, input and a few switches.
import type { Sound } from './audio.ts';

/** one frame of player input, as edges */
export interface Controls {
  jumpPressed: boolean;
  jumpHeld: boolean;
  pausePressed: boolean;
}

export const shell = {
  sfx: null as unknown as Sound,
  /** the page's input, or null when something else drives the scene (the fairness simulator) */
  controls: null as (Controls & { endFrame(): void }) | null,
  /** hands the clock to the console: the scene only moves when `advance` is called by hand */
  freeze: false,
  /** rules only: no pictures, effects or scenery (the fairness simulator) */
  lite: false,
  touch: false,
  muted: false,
  /** real pixels per game pixel in the canvas bitmap */
  k: 1,
};
