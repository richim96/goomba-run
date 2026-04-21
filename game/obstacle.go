package game

import "math"

type Obstacle struct {
	X      float64
	Sprite Sprite
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
	return Rect{
		X: int(math.Round(o.X)),
		Y: groundY - o.Sprite.H,
		W: o.Sprite.W,
		H: o.Sprite.H,
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
		if obstacle.X+float64(obstacle.Sprite.W) >= 0 {
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

	sprite := g.obstacleSet[g.rng.Intn(len(g.obstacleSet))]
	obstacle := Obstacle{
		X:      float64(g.worldW + 4 + g.rng.Intn(10)),
		Sprite: sprite,
	}
	g.obstacles = append(g.obstacles, obstacle)
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
		if obstacle.X < float64(g.worldW+obstacle.Sprite.W) {
			next = append(next, obstacle)
		}
	}
	g.obstacles = next
}

func (g *Game) scaleObstacles(prevWorldW, worldW int) {
	if prevWorldW <= 0 || worldW <= 0 || prevWorldW == worldW {
		return
	}

	scale := float64(worldW) / float64(prevWorldW)
	for index := range g.obstacles {
		g.obstacles[index].X *= scale
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
	}
}

func smallCactusSprite() Sprite {
	return SpriteFromRunes(8, []string{
		"...##...",
		"..####..",
		"..####..",
		".#####..",
		"#######.",
		"..####..",
		"..####..",
		"..####..",
		".#####..",
		"........",
	}, whitePalette())
}

func wideCactusSprite() Sprite {
	return SpriteFromRunes(14, []string{
		"...##.....##..",
		"..####...####.",
		"..####...####.",
		".#####...#####",
		"##############",
		"..####...####.",
		"..####...####.",
		"..####...####.",
		".#####...#####",
		"..............",
	}, whitePalette())
}

func tallCactusSprite() Sprite {
	return SpriteFromRunes(10, []string{
		"...##.....",
		"..####....",
		"..####....",
		"..####....",
		".#####....",
		"######..##",
		"..####.###",
		"..####.##.",
		"..####....",
		"..####....",
		".#####....",
		"..........",
	}, whitePalette())
}

func whitePalette() map[rune]PixelColor {
	return map[rune]PixelColor{
		'.': ColorTransparent,
		'#': ColorWhite,
	}
}
