# Goomba Run

A cute pixel-art endless runner for the browser. You are a (permanently grumpy) Goomba. Gaspare is chasing you. Don't get caught... or do.

## Play

**https://richim96.github.io/goomba-run/**

Open the link in a browser. To keep it as an app:

- **Mac:** open it in Safari, then File → Add to Dock (macOS 14 or later).
- **iPhone and iPad:** open it in Safari, then Share → Add to Home Screen.

It gets its own icon, runs in its own window or full screen, and keeps working without internet after the first visit. Every push to `main` republishes it (`.github/workflows/pages.yml`), so a saved copy picks up the latest version the next time it is opened online.

## Controls

| Key | Action |
| --- | --- |
| `Space` / `↑` / `W` / tap anywhere | Jump. Hold for a higher jump, press again in the air for a double jump |
| `P` / `Esc` / pause button | Pause (it also pauses by itself when you switch away) |
| `M` / speaker button | Sound on/off |
| `F` | Fullscreen |

## Rules

- 3 hearts. Every hit costs one and lets Gaspare get closer.
- Stumps, rocks and cacti: jump them. Low Stingby: jump it. High Stingby: stay on the ground.
- The further you get, the more they come in combos: three in a row, a Stingby hiding a cactus, two Stingbies at different heights.
- Strawberries are worth 10 points. A floating heart gives a life back.
- It gets faster, and the day turns to sunset and night as you run.
- Lose the last heart and Gaspare catches you.

## How it is made

- TypeScript + Canvas 2D, built with Vite into one self-contained file.
- Every sprite is generated from code in `src/art/` (run `npm run art` to export PNGs to `art-export/`).
- Sound effects and music are synthesised with WebAudio.
- `npm run sim` lets a look-ahead bot play the real rules to prove every obstacle combo can be dodged and to measure how tight the jumps are.
