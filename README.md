# Goomba Run

A cute pixel-art endless runner for the browser. You are a (permanently grumpy) Goomba. Richi is chasing you. Don't get caught... or do.

Runs offline from a single HTML file. No install, no server, no internet.

## Play

```bash
npm install
npm run build
```

Then double-click `dist/index.html`. That one file is the whole game: copy or AirDrop it anywhere.

For development: `npm run dev` and open the printed URL (`/art.html` shows every sprite).

## Controls

| Key | Action |
| --- | --- |
| `Space` / `↑` / `W` / tap anywhere | Jump. Hold for a higher jump, press again in the air for a double jump |
| `P` / `Esc` / pause button | Pause (it also pauses by itself when you switch away) |
| `M` / speaker button | Sound on/off |
| `F` | Fullscreen |

## Rules

- 3 hearts. Every hit costs one and lets Richi get closer.
- Stumps, rocks and cacti: jump them. Low Stingby: jump it. High Stingby: stay on the ground.
- The further you get, the more they come in combos: three in a row, a Stingby hiding a cactus, two Stingbies at different heights.
- Strawberries are worth 10 points. A floating heart gives a life back.
- It gets faster, and the day turns to sunset and night as you run.
- Lose the last heart and Richi catches you.

## How it is made

- TypeScript + Canvas 2D, built with Vite into one self-contained file.
- Every sprite is generated from code in `src/art/` (run `npm run art` to export PNGs to `art-export/`).
- Sound effects and music are synthesised with WebAudio.
- `npm run sim` lets a look-ahead bot play the real rules to prove every obstacle combo can be dodged and to measure how tight the jumps are.

The first version of this project was a Go terminal game; that code is still in `main.go` and `game/`.
