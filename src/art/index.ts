import type { Pix } from './pix.ts';
import { buildGoomba } from './goomba.ts';
import { buildRichi } from './richi.ts';
import { buildProps } from './props.ts';
import { buildScenery } from './scenery.ts';

export function buildArt() {
  return {
    goomba: buildGoomba(),
    richi: buildRichi(),
    props: buildProps(),
    scenery: buildScenery(),
  };
}

export type Art = ReturnType<typeof buildArt>;

/** flat name -> frames listing, for the contact sheet and the PNG export */
export function artGroups(art: Art = buildArt()): Record<string, Pix[]> {
  const out: Record<string, Pix[]> = {};
  for (const [owner, set] of Object.entries(art)) {
    for (const [name, value] of Object.entries(set as unknown as Record<string, Pix | Pix[]>)) {
      out[`${owner}-${name}`] = Array.isArray(value) ? value : [value];
    }
  }
  return out;
}
