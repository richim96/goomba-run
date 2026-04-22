package game

import "math"

type Obstacle struct {
	X      float64
	BaseY  int // 0 = ground-anchored (groundY - sprite.H); else absolute top-Y in world pixels
	Frames []Sprite
	frame  int
}

func (o Obstacle) CurSprite() Sprite {
	return o.Frames[o.frame]
}

type Rect struct {
	X int
	Y int
	W int
	H int
}

func (r Rect) Intersects(other Rect) bool {
	return r.X < other.X+other.W &&
		r.X+r.W > other.X &&
		r.Y < other.Y+other.H &&
		r.Y+r.H > other.Y
}

func (o Obstacle) Bounds(groundY int) Rect {
	sp := o.CurSprite()
	y := groundY - sp.H
	if o.BaseY != 0 {
		y = o.BaseY
	}
	return Rect{
		X: int(math.Round(o.X)),
		Y: y,
		W: sp.W,
		H: sp.H,
	}
}

func (g *Game) updateObstacles(dt float64) {
	g.spawnTimer -= dt
	if g.spawnTimer <= 0 {
		g.spawnObstacle()
		g.spawnTimer = g.nextSpawnDelay()
	}

	next := g.obstacles[:0]
	for _, obstacle := range g.obstacles {
		obstacle.X -= g.speed * dt
		if len(obstacle.Frames) > 1 {
			obstacle.frame = (g.tickCount / 7) % len(obstacle.Frames)
		}
		if obstacle.X+float64(obstacle.Frames[0].W) >= 0 {
			next = append(next, obstacle)
		}
	}
	g.obstacles = next
}

func (g *Game) spawnObstacle() {
	if len(g.obstacles) > 0 {
		last := g.obstacles[len(g.obstacles)-1]
		minGap := 18 + g.speed*0.14
		if float64(g.worldW)-last.X < minGap {
			return
		}
	}

	x := float64(g.worldW + 4 + g.rng.Intn(10))

	// 30% chance of bird once score is high enough
	if g.score > 15 && g.rng.Float64() < 0.30 {
		frames := birdFrames()
		// two fly heights: low (just above standing player) or high (forces double-jump)
		var baseY int
		if g.rng.Intn(2) == 0 {
			baseY = g.groundY - g.player.Height() - 10
		} else {
			baseY = g.groundY - g.player.Height() - 20
		}
		if baseY < 2 {
			baseY = 2
		}
		g.obstacles = append(g.obstacles, Obstacle{X: x, BaseY: baseY, Frames: frames})
		return
	}

	sprite := g.obstacleSet[g.rng.Intn(len(g.obstacleSet))]
	g.obstacles = append(g.obstacles, Obstacle{X: x, Frames: []Sprite{sprite}})
}

func (g *Game) nextSpawnDelay() float64 {
	delay := 1.45 - math.Min(g.score*0.003, 0.65)
	delay += g.rng.Float64() * 0.45
	if delay < 0.55 {
		return 0.55
	}
	return delay
}

func (g *Game) trimObstacles() {
	if len(g.obstacles) == 0 {
		return
	}

	next := g.obstacles[:0]
	for _, obstacle := range g.obstacles {
		if obstacle.X < float64(g.worldW+obstacle.Frames[0].W) {
			next = append(next, obstacle)
		}
	}
	g.obstacles = next
}

func (g *Game) scaleObstacles(prevWorldW, worldW, prevWorldH, worldH int) {
	if prevWorldW <= 0 || worldW <= 0 || prevWorldW == worldW {
		return
	}

	xScale := float64(worldW) / float64(prevWorldW)
	yScale := 1.0
	if prevWorldH > 0 {
		yScale = float64(worldH) / float64(prevWorldH)
	}
	for index := range g.obstacles {
		g.obstacles[index].X *= xScale
		if g.obstacles[index].BaseY != 0 {
			g.obstacles[index].BaseY = int(math.Round(float64(g.obstacles[index].BaseY) * yScale))
		}
	}
}

func (g *Game) collideIndex() int {
	playerBox := g.player.Bounds()
	for index, obstacle := range g.obstacles {
		if playerBox.Intersects(obstacle.Bounds(g.groundY)) {
			return index
		}
	}
	return -1
}

func (g *Game) removeObstacle(index int) {
	if index < 0 || index >= len(g.obstacles) {
		return
	}
	g.obstacles = append(g.obstacles[:index], g.obstacles[index+1:]...)
}

func ObstacleSprites() []Sprite {
	return []Sprite{
		smallCactusSprite(),
		wideCactusSprite(),
		tallCactusSprite(),
		clusterCactusSprite(),
	}
}

func grayPalette() map[rune]PixelColor {
	return map[rune]PixelColor{
		'.': ColorTransparent,
		'#': ColorGray,
		'@': ColorGrayDark,
	}
}

// smallCactusSprite — single slim cactus, Chrome-dino style
func smallCactusSprite() Sprite {
	return SpriteFromRunes(7, []string{
		"...#...",
		"...#...",
		".#.#...",
		".####..",
		"...#...",
		"...#...",
		"...#...",
		"...#...",
		"...#...",
		".......",
	}, grayPalette())
}

// wideCactusSprite — two slim cacti side by side
func wideCactusSprite() Sprite {
	return SpriteFromRunes(13, []string{
		"...#.....#...",
		"...#.....#...",
		".#.#.....#.#.",
		".####...####.",
		"...#.....#...",
		"...#.....#...",
		"...#.....#...",
		"...#.....#...",
		"...#.....#...",
		".............",
	}, grayPalette())
}

// tallCactusSprite — single tall cactus with two arms
func tallCactusSprite() Sprite {
	return SpriteFromRunes(9, []string{
		"....#....",
		"....#....",
		"....#....",
		".#..#....",
		".####....",
		"....#..#.",
		"....####.",
		"....#....",
		"....#....",
		"....#....",
		"....#....",
		"....#....",
		".........",
	}, grayPalette())
}

// clusterCactusSprite — three slim cacti at varying heights
func clusterCactusSprite() Sprite {
	return SpriteFromRunes(15, []string{
		"....#..........",
		"....#..........",
		".#..#.....#....",
		".####....##....",
		"....#...#.#....",
		"....#...####...",
		"....#.....#....",
		"....#.....#....",
		"....#.....#....",
		"...............",
	}, grayPalette())
}

// birdFrames — two-frame pterodactyl animation
func birdFrames() []Sprite {
	p := grayPalette()

	// wings up
	up := SpriteFromRunes(14, []string{
		"#...........#.",
		"##.........##.",
		"##############",
		"..####..####..",
		"....####......",
		"....#..#......",
	}, p)

	// wings down
	down := SpriteFromRunes(14, []string{
		"....#..#......",
		"....####......",
		"..####..####..",
		"##############",
		"##.........##.",
		"#...........#.",
	}, p)

	return []Sprite{up, down}
}
