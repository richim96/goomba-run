// Exports every sprite as PNG strips (1x and 6x) plus the palette, into art-export/.
// Run with: npm run art
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { artGroups } from '../src/art/index.ts';
import { P } from '../src/art/palette.ts';
import { Pix } from '../src/art/pix.ts';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

function png(p: Pix, scale: number): Buffer {
  const w = p.w * scale;
  const h = p.h * scale;
  const src = p.rgba();
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4;
      raw.set(src.subarray(s, s + 4), row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
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
