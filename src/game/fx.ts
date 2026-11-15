// Dust, sparkles, hearts, impact stars and floating score text. They live on
// the screen, not in the world: a puff drifts back at half the run speed.
import Phaser from 'phaser';
import { DEPTH } from './config.ts';
import { Label } from './label.ts';
import { tex } from './textures.ts';

const INK = '#2a1810';
const GOLD = '#f8d76a';
const PINK = '#ff7a98';

export interface Particle {
  kind: 'dust' | 'sparkle' | 'heart' | 'text' | 'impact' | 'twinkle';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  variant: number;
  text?: string;
}

export class Fx {
  private list: { p: Particle; img?: Phaser.GameObjects.Image; label?: Label }[] = [];
  private readonly spare: Phaser.GameObjects.Image[] = [];

  private readonly scene: Phaser.Scene;
  /** nothing is shown (the fairness simulator) */
  private readonly off: boolean;

  constructor(scene: Phaser.Scene, off: boolean) {
    this.scene = scene;
    this.off = off;
  }

  add(p: Particle): void {
    if (this.off) return;
    if (p.kind === 'text') {
      this.list.push({ p, label: new Label(this.scene, DEPTH.fx) });
      return;
    }
    const img = this.spare.pop() ?? this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.fx);
    this.list.push({ p, img: img.setVisible(false).setAlpha(1) });
  }

  clear(): void {
    for (const e of this.list) this.release(e);
    this.list = [];
  }

  private release(e: { img?: Phaser.GameObjects.Image; label?: Label }): void {
    if (e.img) this.spare.push(e.img.setVisible(false));
    e.label?.destroy();
  }

  update(dt: number, speed: number): void {
    if (this.off) return;
    for (const { p } of this.list) {
      p.life += dt;
      const pinned = p.kind === 'text' || p.kind === 'impact' || p.kind === 'twinkle';
      p.x += (p.vx - (pinned ? 0 : speed * 0.5)) * dt;
      p.y += p.vy * dt;
      if (p.kind === 'heart') p.x += Math.sin((p.life + p.max) * 9) * 14 * dt;
      if (p.kind === 'sparkle') p.vy += 160 * dt;
    }
    this.list = this.list.filter((e) => {
      if (e.p.life < e.p.max) return true;
      this.release(e);
      return false;
    });
  }

  present(): void {
    for (const { p, img, label } of this.list) {
      const u = p.life / p.max;
      if (label) {
        label.set(p.text ?? '', p.x, p.y, { align: 'center', color: p.text === '<' ? PINK : GOLD, outline: INK }, false);
        label.alpha(u > 0.6 ? (1 - u) / 0.4 : 1);
      } else if (img) {
        let key: string;
        let off = 3;
        let alpha = 1;
        if (p.kind === 'dust') {
          key = tex('props', 'dust', Math.min(2, Math.floor(u * 3)));
          off = 4;
          alpha = 0.85 - u * 0.5;
        } else if (p.kind === 'sparkle') key = tex('props', 'sparkle', Math.floor(u * 4) % 4);
        else if (p.kind === 'impact') {
          key = tex('props', 'impact', u < 0.45 ? 0 : 1);
          off = 8;
        } else if (p.kind === 'twinkle') key = tex('props', 'sparkle', Math.min(3, Math.floor(u * 4)));
        else {
          key = tex('props', 'miniHeart', p.variant);
          off = 2;
          alpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        }
        if (img.texture.key !== key) img.setTexture(key);
        img.setPosition(p.x - off, p.y - off).setAlpha(alpha).setVisible(true);
      }
    }
  }
}
