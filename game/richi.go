package game

import "math"

const richiFrameTicks = 8

type Richi struct {
	X     float64
	Y     float64
	Scale float64

	frame  int
	frames []Sprite
}

func NewRichi() Richi {
	return Richi{
		Scale:  1.0,
		frames: richiRunFrames(),
	}
}

func (r *Richi) Reset(playerX, groundY int) {
	r.Scale = 1.0
	w, h := ScaledSpriteSize(r.frames[0], r.Scale)
	r.X = float64(-w - 12)
	r.Y = float64(groundY - h)
	r.frame = 0
}

func (r *Richi) ClampToGround(playerX, groundY, worldW, hits int, caught bool) {
	active := hits > 0 || caught
	w, h := ScaledSpriteSize(r.frames[0], r.Scale)
	if !active {
		r.X = float64(-w - 12)
	} else {
		_, targetX := richiStage(hits, caught, playerX, worldW, r.frames[0].W)
		r.X = targetX
	}
	r.Y = float64(groundY - h)
}

func (r *Richi) Update(dt float64, ticks, playerX, groundY, worldW, hits int, caught bool) {
	targetScale, targetX := richiStage(hits, caught, playerX, worldW, r.frames[0].W)
	active := hits > 0 || caught

	if !active {
		w, h := ScaledSpriteSize(r.frames[0], r.Scale)
		r.X += (float64(-w-12) - r.X) * math.Min(1, dt*6)
		r.Y = float64(groundY - h)
		return
	}

	r.Scale += (targetScale - r.Scale) * math.Min(1, dt*5)
	_, h := ScaledSpriteSize(r.frames[0], r.Scale)
	follow := 3.0
	if caught {
		follow = 6.0
	}
	r.X += (targetX - r.X) * math.Min(1, dt*follow)
	r.Y = float64(groundY - h)
	r.frame = (ticks / richiFrameTicks) % len(r.frames)
}

func (r Richi) Visible(hits int, state State) bool {
	return hits > 0 || state == StateCaught || state == StateDead
}

func (r Richi) Sprite() Sprite {
	return r.frames[r.frame]
}

func richiStage(hits int, caught bool, playerX, worldW, richiWidth int) (float64, float64) {
	if caught || hits >= 3 {
		return 1.0, float64(worldW/2 - richiWidth/2)
	}
	if hits == 2 {
		return 1.0, float64(int(math.Round(float64(worldW)*0.2)) - richiWidth/2)
	}
	if hits == 1 {
		return 1.0, float64(int(math.Round(float64(worldW)*0.1)) - richiWidth/2)
	}
	return 1.0, 48
}

func richiRunFrames() []Sprite {
	palette := map[rune]PixelColor{
		'.': ColorTransparent,
		'H': ColorBlack,
		'h': ColorHairBrown,
		'S': ColorSkin,
		's': ColorSkinShadow,
		'W': ColorWhite,
		'K': ColorBlack,
		'J': ColorJacketLight,
		'j': ColorJacketDark,
		'd': ColorJacketShade,
		'P': ColorPants,
		'p': ColorPantShadow,
		'q': ColorPantLight,
		'Q': ColorShoes,
		't': ColorShirtTan,
	}

	frameA := SpriteFromRunes(48, []string{
		"..........................K.KKKK.KK.KK..........",
		".....................KPKKPKKKKKPKKKhKKKKPK......",
		"...................KKKPKKKKKKKKKKKKKKKKKKKKKK...",
		"..................KKPKKKKKKKKKKKKKKKKKKKKKKKKKK.",
		"..................KPKKKKKKKKKKKKKKKKKKKKKKKKKK..",
		"..................KKKKKKKKhhhhhsSSSKKKStKKKKK...",
		"....................KKKKStthttsSSSsKKKhsK.......",
		"..................KKKKKKSSthstSSSSSWPKSSK.......",
		"...............KKKKKKKKKKKKtsssSSSSSsSSStK......",
		"........KKKptppppqJKKKhhKKhtqttttttShstKK.......",
		".......KJJJJpppjjpppJjKhhhKttthhKKqqttK.........",
		".....KJppPjJJppjJJJppJqjKhhqhttKKKKKKK....KhsSSK",
		"....KKpjJKKptKKKKKKKPJPPKKhttttKKhhKppK.KKsKKttS",
		"....KStKKKKKK...KKKttJJtKKKssstKhKJPPpKKpKKtqhsS",
		"...KSSSSStqK..KKdjKKPdjpKKtssttKKpKKqKKtKKKKKKK.",
		".....KKshKK..KKKKpPJJJjKKsttstqqKKKKKPKKKKKKK...",
		"..............KKKPjPpKKqqqttKKKKKKKK.KKKKK......",
		".....KK........KKKKKKKKKKKKKKPPPPPPPPK..........",
		"...KQpJJKPKPKKKKKKKKKKKKKKKKKKKPPPPPPPPK........",
		"..KJKJtKPKPKPKKKKKKKKKKKK...KKKKKKPPPPPPKK......",
		".KJPKPqKKKKKKKKKKKKKKK.........KKKKKKPPKKKKKJJJK",
		".tQPjJttKKKKKKKKKKK.............KKKKKKKKqJJJJJJJ",
		".tJtJtKK..........................KKKKKJJPPJJJhh",
		"..KKKK..............................KttJPJJhhPPP",
	}, palette)

	frameB := cloneSprite(frameA)
	shiftOpaqueRegion(frameA, &frameB, 31, 18, 48, 24, -1, -1)
	shiftOpaqueRegion(frameA, &frameB, 0, 16, 16, 24, 1, 1)
	shiftOpaqueRegion(frameA, &frameB, 35, 10, 48, 17, 1, 0)

	return []Sprite{frameA, frameB}
}
