# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goomba Run — a browser endless runner. A Goomba flees from Richi; Stingbies and scenery get in the way. TypeScript + Canvas 2D, bundled by Vite into one self-contained `dist/index.html` that runs offline by double-click. No game engine, no runtime dependencies, no asset files: sprites are generated from code and sound is synthesised.

The original Go terminal version (`main.go`, `game/`, `go.mod`) is still in the repo as legacy and is not used by the web game.

## Commands

- Dev server: `npm run dev` (game at `/`, sprite contact sheet at `/art.html`)
- Type-check + build: `npm run build` → `dist/index.html`
- Export sprites as PNG: `npm run art` → `art-export/` (1x, 6x, `palette.json`)

No test suite. Verify changes by playing in the browser. `window.game` exposes the live `Game` for inspection.

## Architecture

`src/main.ts` boots everything: fixed 60 Hz update with an accumulator, one render per animation frame, canvas scaled to the largest whole multiple of 320x180 that fits.

- `src/game/game.ts` — all state and rules. Modes `title → play → caught → over`. Tuning constants are at the top (gravity, jump, speed curve, lives, Richi distances, `DEDICATION`).
- `src/game/render.ts` — draws everything; reads `Game`, never mutates it. Day/sunset/night is a crossfade between `THEMES` in `src/art/scenery.ts`.
- `src/game/input.ts` — keyboard + pointer, exposed as per-frame edges (`jumpPressed`, `jumpHeld`, ...).
- `src/game/audio.ts` — WebAudio sfx and the music loop.
- `src/game/text.ts` — bitmap font rendering with outline/shadow, cached per string.
- `src/game/gfx.ts` — turns art `Pix` data into canvases.

Art lives in `src/art/` and has no DOM dependency, so the game and `scripts/bake.ts` share it:

- `pix.ts` — the painter: shaded `ball`/`blob`, `line`, `rows`, auto `outline`.
- `palette.ts` — every colour, as dark → light ramps.
- `goomba.ts` — the hero; each frame is a `frame(pose)` call, animations are parameter sweeps.
- `richi.ts` + `richiSprite.ts` — Richi is the owner's avatar imported pixel for pixel (`richiSprite.ts` is generated data, do not hand-edit). `richi.ts` keeps the avatar's head and jacket, trims a few hair rows/columns, replaces the arms with forward-reaching "grabby hands" textured from the avatar's own sleeve, and animates the legs (8-frame run).
- `props.ts` — Stingby, obstacles, pickups, particles, HUD hearts.
- `scenery.ts` — ground, hills (320px-periodic), clouds, trees, sky themes.
- `font.ts` — 7px bitmap font.

## Conventions

- Gameplay mutations stay in `game.ts`; drawing stays in `render.ts`.
- World units are pixels of the 320x180 canvas. `GROUND` is the row feet rest on; sprites anchor via `GOOMBA_ANCHOR` / `RICHI_ANCHOR`.
- New obstacle: draw it in `props.ts`, add it to `ObKind` + `OBS` (size and hitbox insets) and to a pattern in `spawnPattern`.
- Richi must look like the avatar: never redraw his head or jacket by eye; change poses in `richi.ts`, or re-import from a new source image.
- Art direction set by the owner: Goomba is always grumpy (brows and fanged frown never change, even when caught); Goomba and Stingby are the only creatures; obstacles are plain scenery without faces.
- The Claude Design canvas with the art boards is fed from `art-export/6x`; re-run `npm run art` and re-upload after changing sprites.
