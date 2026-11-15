// Turns the code-drawn art into textures, then hands over to the game.
import Phaser from 'phaser';
import { shell } from './shell.ts';
import { registerTextures } from './textures.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    registerTextures(this.textures);
    if (!shell.lite) this.scene.launch('hud');
    this.scene.start('run');
  }
}
