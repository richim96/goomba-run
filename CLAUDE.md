# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Goomba CLI Runner — a terminal endless runner in Go, rendered via `tcell/v2` using Unicode half-block glyphs (▀ ▄ █) so each terminal cell represents two vertical "pixels".

## Commands

- Run: `go run .`
- Build: `go build -o goomba_cli .`
- Format: `gofmt -w .`
- Vet: `go vet ./...`
- Tidy deps: `go mod tidy`

No test suite exists yet.

Requires Go 1.24+ and a terminal ≥ 90x25 with color + Unicode block support.

## Architecture

Entry point `main.go` creates a `tcell.Screen` and hands it to `game.New(screen).Run()`. All gameplay lives in the `game` package.

Core loop (`game/game.go`):
- Fixed 30 FPS tick via `time.Ticker` (`fixedDT = 1/30`).
- Single select between `input.Events()` channel and ticker; `drainInput` flushes queued input each frame; renderer redraws every iteration.
- State machine: `StateMenu → StatePlaying → StateCaught → StateDead`, plus a `paused` flag and a `tooSmall` flag toggled from `syncLayout` when the terminal shrinks below the minimum.

Coordinate system:
- "World" units are virtual pixels. Terminal cells are `cellW x cellH`; world height is `cellH*2` rows (half-block trick). `syncLayout` recomputes `worldW/worldH/groundY/viewX/viewY` from the aspect ratio `baseWorldW/baseWorldH` and rescales obstacles + actors on resize.
- Player is anchored at `playerAnchorX` (0.4 of world width) via `anchoredPlayerX()`.

Module responsibilities:
- `game/input.go` — goroutine reading tcell events, translating them to `InputEvent` (Jump/Pause/Quit/Resize) on a channel.
- `game/renderer.go` — draws HUD + world each frame, converts world pixels to half-block cells with top/bottom color blending.
- `game/goomba.go` — player sprite + physics (jump, double-jump, kicked-out animation on game over).
- `game/richi.go` — pursuer; its distance behind the player scales with `hits`; full catch sequence in `StateCaught`.
- `game/obstacle.go` — obstacle sprite set, spawning, movement, collision AABB.

Difficulty: `speed = baseSpeed + min(score*0.16, maxSpeedBonus)`; spawn cadence via `nextSpawnDelay()`; 3 lives, each hit brings Richi closer, third hit triggers the caught/kicked sequence that ends once the Goomba exits top-right.

## Conventions

- Keep rendering inside `renderer.go`; gameplay state mutations happen in `game.go` tick functions (`updatePlaying`, `updateCaught`).
- Anything touching screen dimensions should go through `syncLayout` so obstacles/actors rescale consistently on resize.
- New input actions: add an `EventType` in `input.go` and handle it in `handleEvent`.
