// Sky, sun and moon, clouds, hills, ground and scenery, with the haze that
// keeps them quieter than the cast. Day, sunset and night crossfade.
import Phaser from 'phaser';
import { THEMES, TILE_W, type SkyTheme } from '../art/scenery.ts';
import { hex } from '../art/palette.ts';
import { DEPTH, GROUND, H, W } from './config.ts';
import { tex } from './textures.ts';

// day -> sunset -> night -> sunset(dawn) -> day
const CYCLE: (keyof typeof THEMES)[] = ['day', 'day', 'sunset', 'night', 'night', 'sunset'];
const SEGMENT = 16; // seconds per step

// 4x4 ordered-dither thresholds, for the sky gradient
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function mix(a: number, b: number, t: number): number {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t);
  const g = lerp((a >> 8) & 255, (b >> 8) & 255, t);
  const bl = lerp(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

type DecoKind = 'tree0' | 'tree1' | 'bush' | 'flower0' | 'flower1' | 'flower2' | 'flower3' | 'tuft';
const DECO_TEX: Record<DecoKind, string> = {
  tree0: 'scenery-trees-0', tree1: 'scenery-trees-1', bush: 'scenery-bush-0', tuft: 'scenery-tuft-0',
  flower0: 'scenery-flowers-0', flower1: 'scenery-flowers-1', flower2: 'scenery-flowers-2', flower3: 'scenery-flowers-3',
};

interface Cloud {
  x: number;
  y: number;
  speed: number;
  img: Phaser.GameObjects.Image;
}

type Img = Phaser.GameObjects.Image;

export class Backdrop {
  private readonly sky: Phaser.Textures.CanvasTexture;
  private skyKey = '';
  private readonly stars: Phaser.GameObjects.Graphics;
  private readonly starSpots: { x: number; y: number; phase: number }[] = [];
  private readonly sun: Img;
  private readonly moon: Img;
  private readonly clouds: Cloud[] = [];
  /** [theme A copies, theme B copies] for the far and the near hills */
  private readonly far: Img[][];
  private readonly near: Img[][];
  private readonly ground: Img[] = [];
  private readonly groundW: number;
  private readonly tint: Phaser.GameObjects.Rectangle;
  /** scenery standing in the world */
  private decos: Img[] = [];
  /** world x where the next piece of scenery goes */
  private nextDeco = 0;

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const add = (key: string, depth: number) => scene.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.sky = scene.textures.createCanvas('sky', W, H)!;
    this.sky.setFilter(Phaser.Textures.FilterMode.NEAREST);
    add('sky', DEPTH.sky);
    this.stars = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.stars);
    for (let i = 0; i < 46; i++) this.starSpots.push({ x: (i * 73 + 11) % W, y: (i * 37 + 5) % 96, phase: i * 1.7 });
    this.sun = add('scenery-sun-0', DEPTH.sun).setX(196);
    this.moon = add('scenery-moon-0', DEPTH.sun).setX(60);
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: rand(0, W), y: rand(8, 62), speed: rand(3, 8), img: add(tex('scenery', 'clouds', i), DEPTH.clouds) });
    }
    const strip = (depth: number, y: number) => [0, 1].map((layer) => [0, 1].map(() => add('__DEFAULT', depth + layer).setY(y)));
    this.far = strip(DEPTH.farHills, GROUND - 58);
    this.near = strip(DEPTH.nearHills, GROUND - 40);
    this.groundW = scene.textures.get('scenery-ground-0').getSourceImage().width;
    for (let i = 0; i < Math.ceil(W / this.groundW) + 1; i++) this.ground.push(add('scenery-ground-0', DEPTH.ground).setY(GROUND - 2));
    this.tint = scene.add.rectangle(-8, -8, W + 16, H + 16, 0xffffff, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.tint);
    for (let x = 10; x < W + 60; x += rand(26, 70)) this.spawnDeco(x);
    this.nextDeco = W + 40;
  }

  private spawnDeco(x: number): void {
    const r = Math.random();
    const kind: DecoKind =
      r < 0.14 ? 'tree0' : r < 0.24 ? 'tree1' : r < 0.42 ? 'bush' : r < 0.8 ? pick(['flower0', 'flower1', 'flower2', 'flower3'] as const) : 'tuft';
    const back = kind.startsWith('tree') || kind === 'bush';
    const img = this.scene.add.image(x, 0, DECO_TEX[kind]).setOrigin(0, 0).setDepth(back ? DEPTH.decoBack : DEPTH.decoFront);
    img.setY(GROUND + 2 - img.height);
    this.decos.push(img);
  }

  /** moves what drifts and plants new scenery ahead; `scrollX` is the left edge of the view in the world */
  update(dt: number, speed: number, scrollX: number): void {
    this.decos = this.decos.filter((d) => {
      if (d.x - scrollX > -50) return true;
      d.destroy();
      return false;
    });
    while (scrollX + W + 40 >= this.nextDeco) {
      this.spawnDeco(this.nextDeco);
      this.nextDeco += rand(26, 80);
    }
    for (const c of this.clouds) {
      c.x -= (c.speed + speed * 0.06) * dt;
      if (c.x < -70) {
        c.x = W + rand(10, 60);
        c.y = rand(8, 62);
        c.img.setTexture(tex('scenery', 'clouds', Math.floor(rand(0, 3))));
      }
    }
  }

  present(dayClock: number, time: number, scroll: number): void {
    const pos = (dayClock / SEGMENT) % CYCLE.length;
    const i0 = Math.floor(pos);
    const nameA = CYCLE[i0];
    const nameB = CYCLE[(i0 + 1) % CYCLE.length];
    const A = THEMES[nameA];
    const B = THEMES[nameB];
    const raw = pos - i0;
    const t = raw * raw * (3 - 2 * raw);

    this.drawSky(A, B, t);

    const starA = lerp(A.stars, B.stars, t);
    this.stars.clear();
    if (starA > 0.02) {
      for (const st of this.starSpots) {
        this.stars.fillStyle(0xffffff, starA * (0.55 + 0.45 * Math.sin(time * 2 + st.phase)));
        this.stars.fillRect(st.x, st.y, 1, 1);
      }
    }

    // sun and moon ride on how "day" or "night" it is
    const dayness = lerp(nameA === 'day' ? 1 : 0, nameB === 'day' ? 1 : 0, t);
    const nightness = lerp(nameA === 'night' ? 1 : 0, nameB === 'night' ? 1 : 0, t);
    this.sun.setY(lerp(120, 18, dayness));
    this.moon.setY(lerp(130, 16, nightness)).setVisible(nightness > 0.01);
    for (const c of this.clouds) c.img.setPosition(c.x, c.y).setAlpha(lerp(0.95, 0.5, nightness));

    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
    this.strip(this.far[0], `scenery-far${cap(nameA)}-0`, scroll * 0.12, 1);
    this.strip(this.far[1], `scenery-far${cap(nameB)}-0`, scroll * 0.12, t);
    this.strip(this.near[0], `scenery-near${cap(nameA)}-0`, scroll * 0.3, 1);
    this.strip(this.near[1], `scenery-near${cap(nameB)}-0`, scroll * 0.3, t);

    const off = ((scroll % this.groundW) + this.groundW) % this.groundW;
    this.ground.forEach((g, i) => g.setX(i * this.groundW - off));

    // the haze over the backdrop only, so the cast stays readable
    const tintA = lerp(A.tint[1], B.tint[1], t);
    this.tint.setFillStyle(mix(A.tint[1] > 0 ? A.tint[0] : B.tint[0], B.tint[1] > 0 ? B.tint[0] : A.tint[0], t), tintA);
  }

  private strip(copies: Img[], key: string, scroll: number, alpha: number): void {
    const off = ((scroll % TILE_W) + TILE_W) % TILE_W;
    copies.forEach((img, i) => {
      if (img.texture.key !== key) img.setTexture(key);
      img.setX(i * TILE_W - off).setAlpha(alpha).setVisible(alpha > 0.004);
    });
  }

  private drawSky(A: SkyTheme, B: SkyTheme, t: number): void {
    const q = Math.round(t * 48);
    const key = `${A.sky[0]}-${B.sky[0]}-${q}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const c = this.sky.context;
    const n = A.sky.length;
    const cols = A.sky.map((a, i) => hex(mix(a, B.sky[i], q / 48)));
    const top = 0;
    const bottom = GROUND - 8;
    const band = (bottom - top) / n;
    for (let i = 0; i < n; i++) {
      const y0 = Math.round(top + i * band);
      const y1 = Math.round(top + (i + 1) * band);
      c.fillStyle = cols[i];
      c.fillRect(0, y0, W, y1 - y0);
    }
    c.fillStyle = cols[n - 1];
    c.fillRect(0, bottom, W, H - bottom);
    // ordered dithering across each band edge: a soft pixel-art gradient
    const half = 5;
    for (let i = 0; i < n - 1; i++) {
      const edge = Math.round(top + (i + 1) * band);
      for (let y = edge - half; y < edge + half; y++) {
        const amount = (y - (edge - half) + 0.5) / (half * 2); // 0 = band i, 1 = band i + 1
        const above = y < edge;
        c.fillStyle = cols[above ? i + 1 : i];
        for (let x = 0; x < W; x++) {
          const next = (BAYER[(x & 3) + ((y & 3) << 2)] + 0.5) / 16 < amount;
          if (next === above) c.fillRect(x, y, 1, 1);
        }
      }
    }
    this.sky.refresh();
  }
}
