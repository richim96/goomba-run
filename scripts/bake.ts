// Exports every sprite as PNG strips (1x and 6x) plus the palette, into art-export/.
// Run with: npm run art
import { mkdirSync, writeFileSync } from 'node:fs';
import { artGroups } from '../src/art/index.ts';
import { P } from '../src/art/palette.ts';
import { Pix } from '../src/art/pix.ts';
import { encodePng } from './png.ts';

function png(p: Pix, scale: number): Buffer {
  const w = p.w * scale;
  const h = p.h * scale;
  const src = p.rgba();
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4;
      out.set(src.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return encodePng(w, h, out);
}

/** frames side by side, 2px apart */
function strip(frames: Pix[]): Pix {
  const gap = frames.length > 1 ? 2 : 0;
  const w = frames.reduce((a, f) => a + f.w, 0) + gap * (frames.length - 1);
  const h = Math.max(...frames.map((f) => f.h));
  const out = new Pix(w, h);
  let x = 0;
  for (const f of frames) {
    out.stamp(f, x, h - f.h);
    x += f.w + gap;
  }
  return out;
}

const out = new URL('../art-export/', import.meta.url).pathname;
mkdirSync(out + '1x', { recursive: true });
mkdirSync(out + '6x', { recursive: true });
let n = 0;
for (const [name, frames] of Object.entries(artGroups())) {
  const s = strip(frames);
  writeFileSync(`${out}1x/${name}.png`, png(s, 1));
  writeFileSync(`${out}6x/${name}.png`, png(s, s.w > 200 ? 3 : 6));
  n++;
}
const palette = Object.fromEntries(
  Object.entries(P).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map((c: number) => '#' + c.toString(16).padStart(6, '0'))]),
);
writeFileSync(out + 'palette.json', JSON.stringify(palette, null, 1));
console.log(`wrote ${n} sprite strips to art-export/`);
