# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goomba Run — a browser endless runner. A Goomba flees from Richi; Stingbies and scenery get in the way. TypeScript + Phaser 4 (Arcade Physics), bundled by Vite into one self-contained `dist/index.html` (about 1.4 MB) and played online at `https://richim96.github.io/goomba-run/`. Phaser is the only runtime dependency. No asset files: sprites are generated from code and sound is synthesised. The owner chose Phaser (2026-11-15) because the game will grow (platforms, levels, more enemies); it was plain Canvas 2D before. Do not move rules back out of Phaser.

## Commands

- Dev server: `npm run dev` (game at `/`, sprite contact sheet at `/art.html`)
- Type-check + build: `npm run build` → `dist/index.html`
- Icons: `npm run icons` → `public/icons/` (runs as part of `build`)
- Export sprites as PNG: `npm run art` → `art-export/` (1x, 6x, `palette.json`)
- Fairness simulator: `npm run sim` opens `/sim.html` on the dev server (`/sim.html?runs=10&meters=4000` for more; the default 6 runs to 2500 m take about a minute). A look-ahead bot plays the real `RunScene` (same Phaser physics and rules, no pictures) from copies of a moment (`snapshot` / `restore`). It reports any moment with no way out and prints the jump timing windows per distance. It is a browser page because Phaser needs a DOM; there is no command-line version. **Run it after touching spawning, speed, physics or bodies**; keep the tightest window at 5 frames or more. Anything added to the rules' state must go through `snapshot` / `restore` or the bot's look-ahead goes wrong.

No unit tests. Verify changes by playing in the browser. `window.__goomba` exposes `{ game, run, input, sound, shell }` (`game` is the Phaser game, `run` the `RunScene`); set `shell.freeze = true` and call `run.advance(1 / 60, { jumpPressed, jumpHeld, pausePressed })` yourself to inspect a sequence step by step, then `game.loop.step(performance.now())` to draw it (the preview pane does not run animation frames while it is in the background, so the scenes do not even start there until you step the loop by hand a few times).

## Architecture

`src/main.ts` creates the Phaser game (`src/game/gameConfig.ts`) on the page's canvas and owns everything about the page: canvas size, mute, fullscreen, auto-pause, tap routing, the service worker. Scenes: `BootScene` (art into textures) starts `RunScene` (the world) with `HudScene` on top.

Motion is drawn finer than the art (the owner got headaches from the judder of whole-game-pixel steps): the canvas bitmap has a whole number of real pixels per game pixel (`bitmapScale` in `main.ts`, `shell.k`), and each scene's camera zooms by that number from the top-left, so sprites keep chunky pixels but sit between game pixels. For this the config sets `antialias: false` and `roundPixels: false` instead of `pixelArt: true` (which would snap sprites to whole game pixels). Physics is not a fixed 60 Hz step: `RunScene` steps the Arcade world itself once per picture by the real frame time (`advance`, `physics.disableUpdate()`), which is what keeps motion even on any screen. Do not switch to Arcade's `fixedStep` without adding in-between drawing. Positions are world coordinates, 320x180 game pixels on screen: use `W`/`H`, never the canvas size.

- `src/game/config.ts` — every tuning number (gravity, jump, speed curve, lives, Richi distances, `DEDICATION`), the obstacle table `OBS` (size, body insets), HUD button rectangles and the drawing order `DEPTH`.
- `src/game/RunScene.ts` — the world and all rules. Modes `title → play → caught → over`. The Goomba, obstacles and pickups are Arcade bodies; the ground is the world's bottom bound. The Goomba really runs right through the world (`s.scrollX` is the left edge of the view, the camera follows it); obstacles stand still in the world, Stingbies fly left. Plain rule state lives in one flat object `s` (so the simulator can copy it); bodies hold positions. `advance(dt, controls)` = rules before the step, one physics step, rules after it (landing, hits and pickups flagged by overlap callbacks, culling), then Richi, debris, effects, animation frames. `present()` only places pictures. `spawnPattern` holds the obstacle patterns, each unlocked at a distance. Nothing teleports between modes: on restart the Goomba drops from Richi's hands and he falls behind. Richi is not a body: he sits at a screen distance per heart lost and never jumps: whatever reaches him leaves `obstacles` and becomes harmless screen-space `debris` (`strike`): scenery is kicked (`far` shrinks away to the horizon, `drop` flips and falls off the bottom of the screen, odds per kind in `FAR_CHANCE`), a Stingby flying high (above `PUNCH_ABOVE`) is punched away (`far`), a low one is smashed flat (`squash`) and left on the ground. Tumbling debris is turned at game resolution on a small canvas texture so its pixels stay chunky.
- `src/game/HudScene.ts` — hearts, score, buttons, title screen, game-over card, pause veil. Reads `RunScene`, never changes it.
- `src/game/backdrop.ts` — sky (a dithered canvas texture), sun, moon, clouds, hills, ground, scenery and the haze. Day/sunset/night is a crossfade between `THEMES` in `src/art/scenery.ts`. Scenery stands in the world; the rest is pinned to the screen (`setScrollFactor(0)`) and offset by the scroll.
- `src/game/fx.ts` — dust, sparkles, hearts, impact stars, floating score text (screen space, pooled images).
- `src/game/label.ts` + `text.ts` — bitmap font text with outline/shadow as Phaser images.
- `src/game/textures.ts` + `gfx.ts` — turn art `Pix` data into canvases and register them as textures; `tex('goomba', 'run', 3)` is the key of a frame.
- `src/game/input.ts` — keyboard + pointer (anywhere on the page, which is why Phaser's own input is switched off), exposed as per-frame edges (`jumpPressed`, `jumpHeld`, ...). `main.ts` routes taps to the HUD buttons (`BTN_PAUSE`, `BTN_SOUND`) or to a jump.
- `src/game/shell.ts` — what the page hands the scenes: sound, controls, `freeze`, `lite` (rules only, for the simulator), `touch`, `muted`.
- `src/game/audio.ts` — WebAudio sfx and a slow 32-bar tune in G major (soft voices through a low-pass filter; the owner found the first, faster tune repetitive and shrill and asked for a cosy autumn feel) whose tempo follows the run speed a little. Levels were checked with an analyser (no clipping), not by ear. Phaser's own audio is off.

Feel, tuned 2026-11-15 after the owner said movement and collisions felt off: bodies sit only 3 to 5 px inside the art (before, a hit registered with half the Goomba inside a rock), gravity is `FALL_GRAVITY` times stronger on the way down, and the shortest tap still makes a 22 px hop (`JUMP_CUT_V`).

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

- Gameplay mutations stay in `RunScene.advance` and what it calls; `present()`, `HudScene`, `backdrop.ts` and `fx.ts` only draw.
- World units are pixels of the 320x180 picture. `GROUND` is the row feet rest on; sprites anchor via `GOOMBA_ANCHOR` / `RICHI_ANCHOR`.
- New obstacle: draw it in `props.ts`, add it to `ObKind` + `OBS` in `config.ts` (size and body insets) and to a pattern in `spawnPattern`.
- Richi must look like the avatar: never redraw his head or jacket by eye; change poses in `richi.ts`, or re-import from a new source image.
- Keep the backdrop quieter than the cast: every theme's `tint` in `THEMES` (`scenery.ts`) is a haze laid over sky, hills, scenery and ground, behind the actors (day 32%, sunset 45%, night 78%). The owner found the game uncomfortable to look at when the scenery was as colourful as the Goomba and obstacles, and approved the haze; do not weaken it, and check new scenery or sky colours against it.
- Keep blinking slow and soft: prompts use `blinkOn` in `HudScene.ts` (about once a second), the hit flicker fades instead of vanishing, eye blinks are rare. The owner found fast blinking unpleasant.
- The catch: Gaspare holds the Goomba trapped in his arms against his belly (`RICHI_HOLD` in `richi.ts`, `hugBounce` in `RunScene.ts`), rocking gently, no tossing; his near arm is drawn again over the Goomba (`holdArm`). The Goomba keeps its plain scowl (`idle` frame 0). The owner asked for this on 2026-11-15 instead of the old toss-and-catch loop.
- Do not add or change on-screen wording, jokes or names without asking; the owner rejected rotating game-over lines. The game-over card says `GASPARE CAUGHT YOU <` and nothing else.
- Art direction set by the owner: Goomba is always grumpy (brows and fanged frown never change, even when caught); Goomba and Stingby are the only creatures; obstacles are plain scenery without faces.
- The Claude Design canvas with the art boards ("Goomba Run Art") is fed from `art-export/6x`; re-run `npm run art` and re-upload after changing sprites. The owner reviews art there: put new or changed sprites on the board, do not only describe them. The canvas is part of the game's design and is mirrored in `design/` (boards, `canvas.json`, every image): after changing the canvas, copy the changed boards and images there in the same change. Keep one board per topic; every character, Gaspare included, belongs on the Cast board.
