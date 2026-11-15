// Everything that is not in the world: hearts, score, the two buttons, the
// title screen, the game-over card and the pause veil. It sits on top of the
// run scene and only reads from it.
import Phaser from 'phaser';
import { BTN_H, BTN_W, BTN_Y, DEDICATION, GROUND, H, PAUSE_X, PLAYER_X, SOUND_X, W } from './config.ts';
import { Label } from './label.ts';
import type { RunScene } from './RunScene.ts';
import { shell } from './shell.ts';
import { tex } from './textures.ts';
import { textWidth, type TextOpts } from './text.ts';

const INK = '#2a1810';
const CREAM = '#fff4d8';
const GOLD = '#f8d76a';
const PINK = '#ff7a98';

/** calm blinking for prompts: visible for most of each period */
const blinkOn = (t: number, period = 1.2, share = 0.68) => t % period < period * share;

export class HudScene extends Phaser.Scene {
  private plates!: Phaser.GameObjects.Graphics;
  private veil!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];
  private berry!: Phaser.GameObjects.Image;
  private readonly labels: Label[] = [];
  private n = 0;

  constructor() {
    super('hud');
  }

  create(): void {
    this.plates = this.add.graphics().setDepth(0);
    this.veil = this.add.graphics().setDepth(4);
    for (let i = 0; i < 3; i++) this.hearts.push(this.add.image(5 + i * 12, 5, tex('props', 'heartHud')).setOrigin(0, 0).setDepth(1));
    this.berry = this.add.image(W - 78, 3, tex('props', 'berry')).setOrigin(0, 0).setDepth(1);
    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  private layout(): void {
    const cam = this.cameras.main;
    cam.setPosition(0, 0);
    cam.setSize(this.scale.width, this.scale.height);
    cam.setOrigin(0, 0);
    cam.setZoom(this.scale.width / W);
  }

  /** bitmap text; (x, y) is the top-left / top-centre / top-right of the glyph box */
  private text(str: string, x: number, y: number, o: TextOpts, alpha = 1, depth = 2): void {
    const l = (this.labels[this.n] ??= new Label(this, depth));
    this.n++;
    l.set(str, x, y, o).alpha(alpha);
    l.img.setDepth(depth);
  }

  update(): void {
    const run = this.scene.get('run') as RunScene;
    const s = run.s;
    this.n = 0;
    this.plates.clear();
    this.veil.clear();

    // '@' / '%' are the speaker glyphs, '#' the pause bars
    this.button(SOUND_X, shell.muted ? '%' : '@', shell.muted ? '#b9a9a0' : CREAM);
    if (s.mode === 'play') this.button(PAUSE_X, '#', CREAM);
    if (s.bannerT >= 0) {
      const u = s.bannerT;
      const pop = Math.min(1, u * 8);
      this.text(s.bannerText, W / 2, 44 - Math.round((1 - pop) * 6), { align: 'center', scale: 2, color: GOLD, outline: INK },
        u > 1.3 ? Math.max(0, (1.7 - u) / 0.4) : 1);
    }

    const inRun = s.mode !== 'title';
    this.hearts.forEach((img, i) => {
      const pulse = i === s.lives - 1 && s.lives === 1 && s.mode === 'play' ? Math.round(Math.sin(s.time * 6)) : 0;
      img.setVisible(inRun).setTexture(tex('props', i < s.lives ? 'heartHud' : 'heartEmpty')).setY(5 + pulse);
    });
    const scoring = inRun && s.mode !== 'over';
    this.berry.setVisible(scoring);
    if (scoring) {
      this.text(String(run.score).padStart(5, '0'), W - 6, 6, { align: 'right', scale: 2, color: CREAM, outline: INK });
      this.text(String(s.berries), W - 80, 8, { align: 'right', color: CREAM, outline: INK });
      this.text(`BEST ${s.best}`, W - 6, 24, { align: 'right', color: GOLD, outline: INK });
    }

    if (s.mode === 'title') this.title(run);
    if (s.mode === 'caught' && s.hugging) this.caughtBanner(run);
    if (s.mode === 'over') this.gameOver(run);
    if (s.paused) this.pauseOverlay();

    for (let i = this.n; i < this.labels.length; i++) this.labels[i].hide();
  }

  private title(run: RunScene): void {
    const s = run.s;
    const word = 'GOOMBA RUN';
    // each letter bobs on its own
    let x = W / 2 - (word.length * 6 * 4 - 4) / 2;
    for (let i = 0; i < word.length; i++) {
      const dy = Math.round(Math.sin(s.time * 3 + i * 0.6) * 2);
      const narrow = word[i] === 'I' ? 2 : word[i] === ' ' ? 2 : 0;
      if (word[i] !== ' ') {
        this.text(word[i], x, 30 + dy, { scale: 4, color: i < 6 ? '#eaa862' : CREAM, outline: INK, shadow: '#7a3a20' });
      }
      x += (6 - narrow) * 4;
    }
    this.text("DON'T LET GASPARE CATCH YOU!", W / 2, 72, { align: 'center', color: CREAM, outline: INK });
    if (blinkOn(s.time)) {
      this.text(shell.touch ? 'TAP TO START' : 'PRESS SPACE OR TAP', W / 2, 92, { align: 'center', color: GOLD, outline: INK });
    }
    if (DEDICATION) this.text(`${DEDICATION} <`, W / 2, 108, { align: 'center', color: PINK, outline: INK });
    const help = shell.touch
      ? 'TAP: JUMP   TAP AGAIN IN THE AIR: DOUBLE JUMP'
      : 'SPACE: JUMP x2  P: PAUSE  M: SOUND  F: FULLSCREEN';
    this.text(help, W / 2, H - 12, { align: 'center', color: CREAM, outline: INK });
    if (s.best > 0) this.text(`BEST ${s.best}`, W - 6, 6, { align: 'right', color: GOLD, outline: INK });
    // a little hint arrow over the hero
    const bob = Math.round(Math.sin(s.time * 5) * 2);
    this.text('YOU', PLAYER_X + 1, GROUND - 40 + bob, { align: 'center', color: CREAM, outline: INK });
  }

  private caughtBanner(run: RunScene): void {
    const pop = Math.min(1, (run.s.modeT - 0.5) * 6);
    if (pop <= 0) return;
    this.text('GOTCHA!', W / 2, 40 - Math.round((1 - pop) * 10), {
      align: 'center', scale: 3, color: PINK, outline: INK, shadow: '#7a1a3a',
    });
  }

  private gameOver(run: RunScene): void {
    const s = run.s;
    const w = 168;
    const h = 78;
    const x = W - w - 10;
    const y = 28; // below the HUD buttons
    this.panel(x, y, w, h);
    this.text('GASPARE CAUGHT YOU <', x + w / 2, y + 9, { align: 'center', color: PINK, outline: INK });
    this.text(String(run.score), x + w / 2, y + 23, { align: 'center', scale: 3, color: CREAM, outline: INK });
    this.text(`${run.meters} M   ${s.berries} BERRIES`, x + w / 2, y + 49, { align: 'center', color: CREAM, outline: INK });
    if (s.newBest) {
      if (blinkOn(s.modeT, 0.9, 0.7)) this.text('NEW BEST!', x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
    } else {
      this.text(`BEST ${s.best}`, x + w / 2, y + 61, { align: 'center', color: GOLD, outline: INK });
    }
    if (s.modeT > 0.45 && blinkOn(s.modeT - 0.45)) {
      this.text(shell.touch ? 'TAP TO RUN AGAIN' : 'SPACE OR TAP TO RUN AGAIN', x + w / 2, y + h + 6, {
        align: 'center', color: CREAM, outline: INK,
      });
    }
  }

  private pauseOverlay(): void {
    this.veil.fillStyle(0x1b1430, 0.55);
    this.veil.fillRect(0, 0, W, H);
    this.text('PAUSED', W / 2, 66, { align: 'center', scale: 3, color: CREAM, outline: INK }, 1, 5);
    this.text(shell.touch ? 'TAP TO RESUME' : 'P OR SPACE TO RESUME', W / 2, 98, { align: 'center', color: GOLD, outline: INK }, 1, 5);
  }

  /** a HUD button: a small plate with a double-size glyph centred on it */
  private button(x: number, glyph: string, color: string): void {
    this.panel(x, BTN_Y, BTN_W, BTN_H);
    const w = textWidth(glyph) * 2;
    this.text(glyph, x + Math.round((BTN_W - w) / 2), BTN_Y + 4, { scale: 2, color });
  }

  private panel(x: number, y: number, w: number, h: number): void {
    const g = this.plates;
    g.fillStyle(0x2a1810, 1);
    g.fillRect(x + 2, y, w - 4, h);
    g.fillRect(x, y + 2, w, h - 4);
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(0x5a3420, 1);
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle(0x3c2030, 1);
    g.fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle(0x4a2a3e, 1);
    g.fillRect(x + 3, y + 3, w - 6, 2);
  }
}
