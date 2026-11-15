// Bitmap text as a Phaser image. The glyphs are drawn by text.ts; each label
// owns one texture that is swapped when its wording changes.
import Phaser from 'phaser';
import { textImage, type TextOpts } from './text.ts';

let serial = 0;

export class Label {
  readonly img: Phaser.GameObjects.Image;
  private readonly key = `label-${serial++}`;
  private shown = '';

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, depth: number, fixed = true) {
    this.scene = scene;
    this.img = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(depth).setVisible(false);
    if (fixed) this.img.setScrollFactor(0);
  }

  /** shows `text` with (x, y) as the top-left / top-centre / top-right of the glyph box; `whole` keeps it on whole game pixels */
  set(text: string, x: number, y: number, o: TextOpts = {}, whole = true): this {
    const t = textImage(text, x, y, o);
    if (t.key !== this.shown) {
      this.shown = t.key;
      const textures = this.scene.textures;
      if (textures.exists(this.key)) textures.remove(this.key);
      textures.addCanvas(this.key, t.img)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.img.setTexture(this.key);
    }
    this.img.setPosition(whole ? Math.round(t.left) : t.left, whole ? Math.round(t.top) : t.top).setVisible(true);
    return this;
  }

  hide(): this {
    this.img.setVisible(false);
    return this;
  }

  alpha(a: number): this {
    this.img.setAlpha(a);
    return this;
  }

  destroy(): void {
    this.img.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
