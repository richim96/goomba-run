# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goomba Run — a browser endless runner. A Goomba flees from Richi; Stingbies and scenery get in the way. TypeScript + Canvas 2D, bundled by Vite into one self-contained `dist/index.html` and played online at `https://richim96.github.io/goomba-run/`. No game engine, no runtime dependencies, no asset files: sprites are generated from code and sound is synthesised.

## Commands

- Dev server: `npm run dev` (game at `/`, sprite contact sheet at `/art.html`)
- Type-check + build: `npm run build` → `dist/index.html`
- Icons: `npm run icons` → `public/icons/` (runs as part of `build`)
- Export sprites as PNG: `npm run art` → `art-export/` (1x, 6x, `palette.json`)
- Fairness simulator: `npm run sim` (or `npm run sim -- <runs> <metres>`). A look-ahead bot plays the real `Game` class headlessly. It fails if any moment has no way out, and prints the jump timing windows per distance. **Run it after touching spawning, speed, physics or hitboxes**; keep the tightest window at 5 frames or more.

No unit tests. Verify changes by playing in the browser. `window.__goomba` exposes `{ game, renderer, input, sound, freeze }`; set `freeze = true` and call `game.update(1 / 60, input)` + `renderer.draw(game)` yourself to inspect a sequence frame by frame (the preview pane throttles real-time play when it is in the background).

## Architecture

`src/main.ts` boots everything: fixed 60 Hz update, one render per animation frame, canvas scaled to the largest whole multiple of 320x180 that fits. Motion is drawn finer than the art (the owner got headaches from the judder of whole-game-pixel steps): the canvas bitmap has a whole number of real pixels per game pixel (`bitmapScale`, `Renderer.resize`), and each frame draws the moment between the last two steps (`renderer.remember(game)` before every `game.update`, then `renderer.draw(game, alpha)`). So `canvas.width` is not 320; use `W`/`H`.

- `src/game/game.ts` — all state and rules. Modes `title → play → caught → over`. Tuning constants are at the top (gravity, jump, speed curve, lives, Richi distances, `DEDICATION`). `spawnPattern` holds the obstacle patterns, each unlocked at a distance. Nothing teleports between modes: on restart the Goomba drops from Richi's hands and he falls behind. Richi never jumps: whatever reaches him leaves `obstacles` and becomes harmless `debris` (`strike`): scenery is kicked (`far` shrinks away to the horizon, `drop` flips and falls off the bottom of the screen, odds per kind in `FAR_CHANCE`), a Stingby flying high (above `PUNCH_ABOVE`) is punched away (`far`), a low one is smashed flat (`squash`) and left on the ground.
- `src/game/render.ts` — draws everything; reads `Game`, never mutates it. Anything that moves is placed with `snap(ex(thing))` / `snap(ey(thing))` (in-between position, on the screen's pixel grid), never `Math.round(thing.x)`; text that travels with something uses `textAt`. Day/sunset/night is a crossfade between `THEMES` in `src/art/scenery.ts`.
- `src/game/input.ts` — keyboard + pointer (anywhere on the page), exposed as per-frame edges (`jumpPressed`, `jumpHeld`, ...). `main.ts` routes taps to the HUD buttons (`BTN_PAUSE`, `BTN_SOUND` in `render.ts`) or to a jump.
- `src/game/audio.ts` — WebAudio sfx and a slow 32-bar tune in G major (soft voices through a low-pass filter; the owner found the first, faster tune repetitive and shrill and asked for a cosy autumn feel) whose tempo follows the run speed a little. Levels were checked with an analyser (no clipping), not by ear.
- `src/game/text.ts` — bitmap font rendering with outline/shadow, cached per string.
- `src/game/gfx.ts` — turns art `Pix` data into canvases.

Art lives in `src/art/` and has no DOM dependency, so the game and `scripts/bake.ts` share it:

- `pix.ts` — the painter: shaded `ball`/`blob`, `line`, `rows`, auto `outline`.
- `palette.ts` — every colour, as dark → light ramps.
- `goomba.ts` — the hero; each frame is a `frame(pose)` call, animations are parameter sweeps.
- `richi.ts` + `richiSprite.ts` — the pursuer, called Gaspare on screen since 2026-11-15 (the code still says `richi`). He is the owner's avatar imported pixel for pixel (`richiSprite.ts` is generated data, do not hand-edit). `richi.ts` keeps the avatar's hair and jacket, trims a few hair rows/columns, redraws the face simpler (the `FACE` patch; the owner found the realistic face creepy, `CHIBI_FACE = false` restores it), replaces the arms with forward-reaching "grabby hands" textured from the avatar's own sleeve, and animates the legs (8-frame run, 3-frame kick). Blows: `smash` (both fists up, then down, feet planted) for a low Stingby; `wind` and `punch` (one fist cocked back, then thrown, drawn once per run frame) for a high one. These are the versions the owner chose after rejecting every later rework of the arms and legs: do not restyle them unasked. Outfits go on top of the drawing without changing it: `RICHI_OUTFITS` recolour the jacket (by brightness, so the camo stays as texture), sleeves, trousers and shoes, and add a `hat` and a `garment` (vest quilting, apron, scarf...) drawn in frame coordinates; the game wears `RICHI_OUTFIT`. The owner rejected redrawn replacement chasers as "terrible" and plain recolours as not enough: keep this sprite and change clothes and hats only.
- `props.ts` — Stingby, obstacles, pickups, particles, HUD hearts.
- `scenery.ts` — ground, hills (320px-periodic), clouds, trees, sky themes.
- `font.ts` — 7px bitmap font.

## Shipping

The game is played online only, at `https://richim96.github.io/goomba-run/`, published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. The owner decided this (2026-11-15): do not document or suggest building it locally to play (`npm` build, a double-clicked or emailed `dist/index.html`). Saving the website as an app is wanted and documented in the README: Safari's File → Add to Dock on a Mac, Share → Add to Home Screen on iPhone/iPad; `public/manifest.webmanifest` + `public/sw.js` (network first, cache fallback) make the saved copy work offline after the first visit. `main.ts` registers the service worker only in production builds served over HTTPS or localhost. The address is public, which the owner chose knowingly.

`scripts/make-icons.ts` draws every icon from the Goomba sprite in pure node (web PNGs into `public/icons/`).

There is no native Mac app any more: the owner removed it (a Swift + WKWebView wrapper in `native/mac/`, built into `release/`) because it had to be rebuilt and redistributed for every change, while the website updates everyone on the next push. Do not add it back.

## Conventions

- Gameplay mutations stay in `game.ts`; drawing stays in `render.ts`.
- World units are pixels of the 320x180 canvas. `GROUND` is the row feet rest on; sprites anchor via `GOOMBA_ANCHOR` / `RICHI_ANCHOR`.
- New obstacle: draw it in `props.ts`, add it to `ObKind` + `OBS` (size and hitbox insets) and to a pattern in `spawnPattern`.
- Richi must look like the avatar: never redraw his head or jacket by eye; change poses in `richi.ts`, or re-import from a new source image.
- Keep the backdrop quieter than the cast: every theme's `tint` in `THEMES` (`scenery.ts`) is a haze laid over sky, hills, scenery and ground, behind the actors (day 32%, sunset 45%, night 78%). The owner found the game uncomfortable to look at when the scenery was as colourful as the Goomba and obstacles, and approved the haze; do not weaken it, and check new scenery or sky colours against it.
- Keep blinking slow and soft: prompts use `blinkOn` in `render.ts` (about once a second), the hit flicker fades instead of vanishing, eye blinks are rare. The owner found fast blinking unpleasant.
- The catch: Gaspare holds the Goomba trapped in his arms against his belly (`RICHI_HOLD` in `richi.ts`, `hugBounce` in `game.ts`), rocking gently, no tossing; his near arm is drawn again over the Goomba (`holdArm`). The Goomba keeps its plain scowl (`idle` frame 0). The owner asked for this on 2026-11-15 instead of the old toss-and-catch loop.
- Do not add or change on-screen wording, jokes or names without asking; the owner rejected rotating game-over lines. The game-over card says `GASPARE CAUGHT YOU <` and nothing else.
- Art direction set by the owner: Goomba is always grumpy (brows and fanged frown never change, even when caught); Goomba and Stingby are the only creatures; obstacles are plain scenery without faces.
- The Claude Design canvas with the art boards ("Goomba Run Art") is fed from `art-export/6x`; re-run `npm run art` and re-upload after changing sprites. The owner reviews art there: put new or changed sprites on the board, do not only describe them. The canvas is part of the game's design and is mirrored in `design/` (boards, `canvas.json`, every image): after changing the canvas, copy the changed boards and images there in the same change. Keep one board per topic; every character, Gaspare included, belongs on the Cast board.
