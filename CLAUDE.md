# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goomba Run — a browser endless runner. A Goomba flees from Richi; Stingbies and scenery get in the way. TypeScript + Canvas 2D, bundled by Vite into one self-contained `dist/index.html` that runs offline by double-click. No game engine, no runtime dependencies, no asset files: sprites are generated from code and sound is synthesised.

## Commands

- Dev server: `npm run dev` (game at `/`, sprite contact sheet at `/art.html`)
- Type-check + build: `npm run build` → `dist/index.html`
- Export sprites as PNG: `npm run art` → `art-export/` (1x, 6x, `palette.json`)
- Fairness simulator: `npm run sim` (or `npm run sim -- <runs> <metres>`). A look-ahead bot plays the real `Game` class headlessly. It fails if any moment has no way out, and prints the jump timing windows per distance. **Run it after touching spawning, speed, physics or hitboxes**; keep the tightest window at 5 frames or more.

No unit tests. Verify changes by playing in the browser. `window.__goomba` exposes `{ game, renderer, input, sound, freeze }`; set `freeze = true` and call `game.update(1 / 60, input)` + `renderer.draw(game)` yourself to inspect a sequence frame by frame (the preview pane throttles real-time play when it is in the background).

## Architecture

`src/main.ts` boots everything: fixed 60 Hz update with an accumulator, one render per animation frame, canvas scaled to the largest whole multiple of 320x180 that fits.

- `src/game/game.ts` — all state and rules. Modes `title → play → caught → over`. Tuning constants are at the top (gravity, jump, speed curve, lives, Richi distances, `DEDICATION`). `spawnPattern` holds the obstacle patterns, each unlocked at a distance. Nothing teleports between modes: on restart the Goomba drops from Richi's hands and he falls behind.
- `src/game/render.ts` — draws everything; reads `Game`, never mutates it. Day/sunset/night is a crossfade between `THEMES` in `src/art/scenery.ts`.
- `src/game/input.ts` — keyboard + pointer (anywhere on the page), exposed as per-frame edges (`jumpPressed`, `jumpHeld`, ...). `main.ts` routes taps to the HUD buttons (`BTN_PAUSE`, `BTN_SOUND` in `render.ts`) or to a jump.
- `src/game/audio.ts` — WebAudio sfx and a 16-bar music loop whose tempo follows the run speed. Levels were checked with an analyser (no clipping), not by ear.
- `src/game/text.ts` — bitmap font rendering with outline/shadow, cached per string.
- `src/game/gfx.ts` — turns art `Pix` data into canvases.

Art lives in `src/art/` and has no DOM dependency, so the game and `scripts/bake.ts` share it:

- `pix.ts` — the painter: shaded `ball`/`blob`, `line`, `rows`, auto `outline`.
- `palette.ts` — every colour, as dark → light ramps.
- `goomba.ts` — the hero; each frame is a `frame(pose)` call, animations are parameter sweeps.
- `richi.ts` + `richiSprite.ts` — Richi is the owner's avatar imported pixel for pixel (`richiSprite.ts` is generated data, do not hand-edit). `richi.ts` keeps the avatar's hair and jacket, trims a few hair rows/columns, redraws the face simpler (the `FACE` patch; the owner found the realistic face creepy, `CHIBI_FACE = false` restores it), replaces the arms with forward-reaching "grabby hands" textured from the avatar's own sleeve, and animates the legs (8-frame run).
- `props.ts` — Stingby, obstacles, pickups, particles, HUD hearts.
- `scenery.ts` — ground, hills (320px-periodic), clouds, trees, sky themes.
- `font.ts` — 7px bitmap font.

## Conventions

- Gameplay mutations stay in `game.ts`; drawing stays in `render.ts`.
- World units are pixels of the 320x180 canvas. `GROUND` is the row feet rest on; sprites anchor via `GOOMBA_ANCHOR` / `RICHI_ANCHOR`.
- New obstacle: draw it in `props.ts`, add it to `ObKind` + `OBS` (size and hitbox insets) and to a pattern in `spawnPattern`.
- Richi must look like the avatar: never redraw his head or jacket by eye; change poses in `richi.ts`, or re-import from a new source image.
- Keep blinking slow and soft: prompts use `blinkOn` in `render.ts` (about once a second), the hit flicker fades instead of vanishing, eye blinks are rare. The owner found fast blinking unpleasant.
- The catch celebration is a toss-and-catch loop (`TOSS_*` constants in `game.ts`, Goomba `love` frames 0-4).
- Do not add or change on-screen wording, jokes or names without asking; the owner rejected rotating game-over lines. The game-over card says `RICHI CAUGHT YOU <` and nothing else.
- Art direction set by the owner: Goomba is always grumpy (brows and fanged frown never change, even when caught); Goomba and Stingby are the only creatures; obstacles are plain scenery without faces.
- The Claude Design canvas with the art boards is fed from `art-export/6x`; re-run `npm run art` and re-upload after changing sprites.
