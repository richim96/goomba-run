// Dev-only contact sheet: every sprite, enlarged. Open /art.html while `npm run dev` runs.
import { artGroups } from './art/index.ts';
import type { Pix } from './art/pix.ts';

const params = new URLSearchParams(location.search);
const only = params.get('only');
const scale = Number(params.get('scale') ?? 6);
const root = document.getElementById('root')!;

function toCanvas(p: Pix, k: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d')!.putImageData(new ImageData(p.rgba() as Uint8ClampedArray<ArrayBuffer>, p.w, p.h), 0, 0);
  c.style.width = `${p.w * k}px`;
  c.style.height = `${p.h * k}px`;
  return c;
}

for (const [name, sprites] of Object.entries(artGroups())) {
  if (only && !name.startsWith(only)) continue;
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<h2>${name}</h2>`;
  const row = document.createElement('div');
  row.className = 'row';
  for (const s of sprites) row.append(toCanvas(s, s.w > 200 ? Math.min(scale, 3) : scale));
  g.append(row);
  root.append(g);
}
