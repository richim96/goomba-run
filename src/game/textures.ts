// The art is drawn by code (src/art); here it becomes Phaser textures.
import Phaser from 'phaser';
import { buildSprites, type Sprites } from './gfx.ts';

let sprites: Sprites | null = null;
const counts = new Map<string, number>();

/** the sprites as plain canvases, for the few things still drawn by hand (tumbling debris, icons) */
export function sourceSprites(): Sprites {
  return (sprites ??= buildSprites());
}

/** texture key of frame `i` of a sprite, e.g. tex('goomba', 'run', 3); the frame wraps round */
export function tex(owner: string, name: string, i = 0): string {
  const n = counts.get(`${owner}-${name}`) ?? 1;
  return `${owner}-${name}-${((i % n) + n) % n}`;
}

export function addCrisp(textures: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement): void {
  if (textures.exists(key)) return;
  textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function registerTextures(textures: Phaser.Textures.TextureManager): void {
  for (const [owner, set] of Object.entries(sourceSprites())) {
    if (set instanceof HTMLCanvasElement) {
      addCrisp(textures, owner, set);
      continue;
    }
    for (const [name, value] of Object.entries(set as Record<string, HTMLCanvasElement | HTMLCanvasElement[]>)) {
      const frames = Array.isArray(value) ? value : [value];
      counts.set(`${owner}-${name}`, frames.length);
      frames.forEach((c, i) => addCrisp(textures, `${owner}-${name}-${i}`, c));
    }
  }
}
