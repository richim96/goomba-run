import { buildArt, type Art } from '../art/index.ts';
import { Pix } from '../art/pix.ts';

export type Img = HTMLCanvasElement;

type Canvased<T> = T extends Pix ? Img : T extends readonly Pix[] ? Img[] : { [K in keyof T]: Canvased<T[K]> };

export function toCanvas(p: Pix): Img {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(p.rgba() as Uint8ClampedArray<ArrayBuffer>, p.w, p.h), 0, 0);
  return c;
}

function convert(v: unknown): unknown {
  if (v instanceof Pix) return toCanvas(v);
  if (Array.isArray(v)) return v.map(convert);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x)]));
  }
  return v;
}

export type Sprites = Canvased<Art> & { goombaFlash: Img };

export function buildSprites(): Sprites {
  const art = buildArt();
  const sprites = convert(art) as Canvased<Art>;
  return { ...sprites, goombaFlash: toCanvas(art.goomba.hurt.tint(0xffffff)) };
}
