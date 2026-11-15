// The Phaser game both the page and the fairness simulator start from.
import Phaser from 'phaser';
import { BootScene } from './BootScene.ts';
import { GRAVITY, H, W } from './config.ts';
import { HudScene } from './HudScene.ts';
import { RunScene } from './RunScene.ts';

export function gameConfig(extra: Phaser.Types.Core.GameConfig): Phaser.Types.Core.GameConfig {
  return {
    width: W,
    height: H,
    // Crisp pixels, but not `pixelArt`: that would also pin every sprite to whole
    // game pixels, and motion is drawn finer than the art (see main.ts).
    antialias: false,
    antialiasGL: false,
    roundPixels: false,
    backgroundColor: '#1b1430',
    banner: false,
    // sound is synthesised by audio.ts and input comes from input.ts (the whole page, not only the canvas)
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.NONE, width: W, height: H },
    // one physics step per picture, as long as the frame really took: smooth on any screen
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY }, fixedStep: false, useTree: false } },
    fps: { min: 20 },
    scene: [BootScene, RunScene, HudScene],
    ...extra,
  };
}
