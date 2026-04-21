package game

import "math"

const (
	gravity            = 320.0
	jumpVelocity       = -118.0
	doubleJumpVelocity = -112.0
	runFrameTicks      = 4
)

type Goomba struct {
	X        int
	xPos     float64
	Y        float64
	VY       float64
	FlyVX    float64
	Grounded bool
	Kicked   bool

	doubleJumpReady bool
	frame           int
	frames          []Sprite
}

func NewGoomba() Goomba {
	frames := goombaRunFrames()
	return Goomba{
		Grounded: true,
		frames:   frames,
	}
}

func (g *Goomba) Reset(x, groundY int) {
	g.X = x
	g.xPos = float64(x)
	g.Y = float64(groundY - g.Height())
	g.VY = 0
	g.FlyVX = 0
	g.Grounded = true
	g.Kicked = false
	g.doubleJumpReady = true
	g.frame = 0
}

func (g *Goomba) ClampToGround(x, groundY int) {
	g.X = x
	g.xPos = float64(x)
	floor := float64(groundY - g.Height())
	if g.Grounded || g.Y > floor {
		g.Y = floor
		g.VY = 0
		g.FlyVX = 0
		g.Grounded = true
		g.Kicked = false
		g.doubleJumpReady = true
	}
}

func (g *Goomba) JumpPress() {
	if g.Kicked {
		return
	}

	if g.Grounded {
		g.VY = jumpVelocity
		g.Grounded = false
		g.doubleJumpReady = true
		return
	}

	if g.doubleJumpReady {
		g.VY = doubleJumpVelocity
		g.doubleJumpReady = false
	}
}

func (g *Goomba) Kick(vx, vy float64) {
	g.Kicked = true
	g.Grounded = false
	g.doubleJumpReady = false
	g.FlyVX = vx
	g.VY = vy
	g.xPos = float64(g.X)
}

func (g *Goomba) Update(dt float64, groundY int, ticks int) {
	if g.Kicked {
		g.xPos += g.FlyVX * dt
		g.X = int(math.Round(g.xPos))
		g.VY += gravity * dt
		g.Y += g.VY * dt
		g.frame = 0
		return
	}

	if g.Grounded {
		g.xPos = float64(g.X)
		g.frame = (ticks / runFrameTicks) % len(g.frames)
		return
	}

	g.VY += gravity * dt
	g.Y += g.VY * dt

	floor := float64(groundY - g.Height())
	if g.Y >= floor {
		g.Y = floor
		g.VY = 0
		g.Grounded = true
		g.doubleJumpReady = true
		g.frame = (ticks / runFrameTicks) % len(g.frames)
		return
	}

	g.Grounded = false
	g.frame = 0
}

func (g Goomba) Sprite() Sprite {
	return g.frames[g.frame]
}

func (g Goomba) Width() int {
	return g.frames[0].W
}

func (g Goomba) Height() int {
	return g.frames[0].H
}

func (g Goomba) Bounds() Rect {
	return Rect{
		X: g.X,
		Y: int(math.Round(g.Y)),
		W: g.Width(),
		H: g.Height(),
	}
}

func goombaRunFrames() []Sprite {
	palette := map[rune]PixelColor{
		'.': ColorTransparent,
		'd': ColorBrownDark,
		'm': ColorBrownMid,
		'l': ColorBrownLight,
		'w': ColorWhite,
		'k': ColorBlack,
		'y': ColorYellow,
	}

	frameA := SpriteFromRunes(16, []string{
		".....dmmmmd.....",
		"...dmmmmmmmmm...",
		"..dmmmmmmmwkddd.",
		"dmmmmmmmmmwwkmd.",
		"dmmmmmyymmmmmmmd",
		"dddddmyyyyyyyyyy",
		".ddddddddddddd..",
		".dddddd...ddddd.",
	}, palette)

	frameB := cloneSprite(frameA)
	shiftOpaqueRegion(frameA, &frameB, 0, 6, 7, 8, 1, 0)
	shiftOpaqueRegion(frameA, &frameB, 9, 6, 16, 8, -1, 0)

	return []Sprite{frameA, frameB}
}
