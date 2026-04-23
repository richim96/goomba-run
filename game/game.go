package game

import (
	"math"
	"math/rand"
	"time"

	"github.com/gdamore/tcell/v2"
)

type State int

const (
	StateMenu State = iota
	StatePlaying
	StateCaught
	StateDead
)

const (
	tickRate        = 30
	fixedDT         = 1.0 / tickRate
	scoreRate       = 10.0
	baseSpeed       = 48.0
	maxSpeedBonus   = 44.0
	minScreenWidth  = 90
	minScreenHeight = 25
	hudLines        = 2
	playerAnchorX   = 0.4
	baseWorldW      = 90
	baseWorldH      = 46
)

type Game struct {
	screen   tcell.Screen
	input    *Input
	renderer *Renderer
	rng      *rand.Rand

	state    State
	paused   bool
	quit     bool
	tooSmall bool

	cellW   int
	cellH   int
	worldW  int
	worldH  int
	groundY int
	viewX   int
	viewY   int

	score      float64
	bestScore  int
	finalScore int
	lives      int
	hits       int
	speed      float64
	scroll     float64
	tickCount  int
	spawnTimer float64
	catchTimer float64

	player      Goomba
	richi       Richi
	obstacleSet []Sprite
	obstacles   []Obstacle
}

func (g *Game) anchoredPlayerX() int {
	anchoredPlayerX := max(
		int(math.Round(float64(g.worldW)*playerAnchorX))-g.player.Width()/2,
		8,
	)
	maxPlayerX := g.worldW - g.player.Width() - 4
	if anchoredPlayerX > maxPlayerX {
		anchoredPlayerX = maxPlayerX
	}
	return anchoredPlayerX
}

func New(screen tcell.Screen) *Game {
	return &Game{
		screen:      screen,
		input:       NewInput(screen),
		renderer:    NewRenderer(screen),
		rng:         rand.New(rand.NewSource(time.Now().UnixNano())),
		speed:       baseSpeed,
		player:      NewGoomba(),
		richi:       NewRichi(),
		obstacleSet: ObstacleSprites(),
	}
}

func (g *Game) Run() error {
	g.syncLayout(true)
	g.reset(StateMenu)

	g.input.Start()
	defer g.input.Stop()

	ticker := time.NewTicker(time.Second / tickRate)
	defer ticker.Stop()

	if err := g.renderer.Draw(g); err != nil {
		return err
	}

	for !g.quit {
		select {
		case event, ok := <-g.input.Events():
			if !ok {
				return nil
			}
			g.handleEvent(event)
		case <-ticker.C:
			g.tick(fixedDT)
		}

		g.drainInput()

		if err := g.renderer.Draw(g); err != nil {
			return err
		}
	}

	return nil
}

func (g *Game) drainInput() {
	for {
		select {
		case event, ok := <-g.input.Events():
			if !ok {
				g.quit = true
				return
			}
			g.handleEvent(event)
		default:
			return
		}
	}
}

func (g *Game) handleEvent(event InputEvent) {
	switch event.Type {
	case EventQuit:
		g.quit = true
	case EventPause:
		g.togglePause()
	case EventResize:
		g.syncLayout(false)
		g.screen.Sync()
	case EventJump:
		g.handleJump()
	}
}

func (g *Game) handleJump() {
	if g.tooSmall {
		return
	}
	if g.paused {
		return
	}

	switch g.state {
	case StateMenu, StateDead:
		g.reset(StatePlaying)
	case StatePlaying:
		g.player.JumpPress()
	}
}

func (g *Game) reset(state State) {
	g.state = state
	g.paused = false
	g.score = 0
	g.finalScore = 0
	g.lives = 3
	g.hits = 0
	g.speed = baseSpeed
	g.scroll = 0
	g.tickCount = 0
	g.spawnTimer = g.nextSpawnDelay()
	g.catchTimer = 0
	g.obstacles = nil
	playerX := g.anchoredPlayerX()
	g.player.Reset(playerX, g.groundY)
	g.richi.Reset(playerX, g.groundY)
}

func (g *Game) syncLayout(forceReset bool) {
	prevWorldW := g.worldW
	prevWorldH := g.worldH
	g.cellW, g.cellH = g.screen.Size()
	g.tooSmall = g.cellW < minScreenWidth || g.cellH < minScreenHeight
	availableRows := max(1, g.cellH-hudLines)
	availableW := max(1, g.cellW)
	availableH := availableRows * 2
	targetAspect := float64(baseWorldW) / float64(baseWorldH)

	worldW := availableW
	worldH := int(math.Round(float64(worldW) / targetAspect))
	if worldH > availableH {
		worldH = availableH
		worldW = int(math.Round(float64(worldH) * targetAspect))
	}

	g.worldW = max(1, worldW)
	g.worldH = max(8, worldH)
	usedRows := (g.worldH + 1) / 2
	g.viewX = max(0, (g.cellW-g.worldW)/2)
	g.viewY = max(0, (availableRows-usedRows)/2)
	g.groundY = g.worldH - 6
	anchoredPlayerX := g.anchoredPlayerX()

	if forceReset {
		g.player.Reset(anchoredPlayerX, g.groundY)
		g.richi.Reset(anchoredPlayerX, g.groundY)
		return
	}

	if prevWorldW > 0 && prevWorldH > 0 {
		g.scaleObstacles(prevWorldW, g.worldW, prevWorldH, g.worldH)
	}

	if g.player.Kicked && prevWorldW > 0 && prevWorldH > 0 {
		xScale := float64(g.worldW) / float64(prevWorldW)
		yScale := float64(g.worldH) / float64(prevWorldH)
		g.player.X = int(math.Round(float64(g.player.X) * xScale))
		g.player.xPos = float64(g.player.X)
		g.player.Y *= yScale
	} else {
		g.player.ClampToGround(anchoredPlayerX, g.groundY)
	}

	g.richi.ClampToGround(anchoredPlayerX, g.groundY, g.worldW, g.hits, g.state == StateCaught)
	g.trimObstacles()
}

func (g *Game) tick(dt float64) {
	if g.tooSmall {
		return
	}
	if g.paused {
		return
	}

	g.tickCount++

	switch g.state {
	case StatePlaying:
		g.updatePlaying(dt)
	case StateCaught:
		g.updateCaught(dt)
	}
}

func (g *Game) updatePlaying(dt float64) {
	g.score += dt * scoreRate
	scoreInt := int(g.score)
	if scoreInt > g.bestScore {
		g.bestScore = scoreInt
	}

	g.speed = baseSpeed + math.Min(g.score*0.16, maxSpeedBonus)
	g.scroll += g.speed * dt

	g.player.Update(dt, g.groundY, g.tickCount)
	g.richi.Update(dt, g.tickCount, g.player.X, g.groundY, g.worldW, g.hits, false)
	g.updateObstacles(dt)

	if hitIndex := g.collideIndex(); hitIndex >= 0 {
		g.removeObstacle(hitIndex)
		g.registerHit()
	}
}

func (g *Game) updateCaught(dt float64) {
	g.catchTimer += dt
	g.scroll += g.speed * 0.35 * dt
	g.player.Update(dt, g.groundY, g.tickCount)
	g.richi.Update(dt, g.tickCount, g.player.X, g.groundY, g.worldW, g.hits, true)

	if g.catchTimer >= 0.28 && !g.player.Kicked {
		g.player.Kick(220, -320)
	}

	if g.player.Kicked {
		rightGone := g.player.X > g.worldW+g.player.Width()+12
		topGone := g.player.Y+float64(g.player.Height()) < -12
		// End only once Goomba exits via the top-right direction.
		if rightGone && topGone {
			g.state = StateDead
			return
		}
	}

	if g.catchTimer >= 2.2 {
		g.state = StateDead
	}
}

func (g *Game) registerHit() {
	g.lives--
	if g.lives < 0 {
		g.lives = 0
	}
	g.hits = 3 - g.lives

	if g.lives <= 0 {
		g.state = StateCaught
		g.catchTimer = 0
		g.finalScore = int(g.score)
		g.obstacles = nil
		if g.finalScore > g.bestScore {
			g.bestScore = g.finalScore
		}
	}
}

func (g *Game) playFieldRows() int {
	return (g.worldH + 1) / 2
}

func (g *Game) playFieldTop() int {
	return hudLines + g.viewY
}

func (g *Game) statusLine() string {
	if g.paused {
		return "Paused. ESC resumes, Q quits"
	}

	switch g.state {
	case StateMenu:
		return "Avoid obstacles and don't get caught by Richi!"
	case StatePlaying:
		return "SPACE jumps, ESC pauses, press SPACE again in air for a double jump, Q quits"
	case StateCaught:
		return "Richi caught up from behind..."
	case StateDead:
		return "Caught. SPACE restarts, Q quits"
	default:
		return ""
	}
}

func (g *Game) togglePause() {
	if g.tooSmall {
		return
	}
	if g.state != StatePlaying && g.state != StateCaught {
		return
	}
	g.paused = !g.paused
}
