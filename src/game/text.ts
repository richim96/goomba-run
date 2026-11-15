import { FONT_H, glyph, textWidth } from '../art/font.ts';

export interface TextOpts {
  color?: string;
  scale?: number;
  align?: 'left' | 'center' | 'right';
  outline?: string;
  shadow?: string;
}

const cache = new Map<string, HTMLCanvasElement>();

function render(text: string, o: TextOpts): HTMLCanvasElement {
  const k = o.scale ?? 1;
  const pad = o.outline || o.shadow ? 1 : 0;
  const c = document.createElement('canvas');
  c.width = (textWidth(text) + pad * 2) * k;
  c.height = (FONT_H + pad * 2 + (o.shadow ? 1 : 0)) * k;
  const ctx = c.getContext('2d')!;
  const pass = (dx: number, dy: number, color: string) => {
    ctx.fillStyle = color;
    let x = pad;
    for (const ch of text) {
      const g = glyph(ch);
      for (let j = 0; j < g.length; j++) {
        for (let i = 0; i < g[j].length; i++) {
          if (g[j][i] === '1') ctx.fillRect((x + i + dx) * k, (pad + j + dy) * k, k, k);
        }
      }
      x += g[0].length + 1;
    }
  };
  if (o.shadow) for (const dx of [-1, 0, 1]) pass(dx, 2, o.shadow);
  if (o.outline) {
    for (const [dx, dy] of [
      [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
    ]) pass(dx, dy, o.outline);
  }
  pass(0, 0, o.color ?? '#ffffff');
  return c;
}

/** the picture of a piece of bitmap text, and where its top-left corner goes when (x, y) is the top-left / top-centre / top-right of the glyph box */
export function textImage(text: string, x: number, y: number, o: TextOpts = {}): { img: HTMLCanvasElement; key: string; left: number; top: number } {
  const key = `${text}|${o.color}|${o.scale}|${o.outline}|${o.shadow}`;
  let img = cache.get(key);
  if (!img) {
    if (cache.size > 400) cache.clear();
    img = render(text, o);
    cache.set(key, img);
  }
  const k = o.scale ?? 1;
  const pad = (o.outline || o.shadow ? 1 : 0) * k;
  const w = textWidth(text) * k;
  const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  return { img, key, left: left - pad, top: y - pad };
}

export { textWidth };
