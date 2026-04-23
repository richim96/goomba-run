package game

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
)

type PixelColor uint8

const (
	ColorTransparent PixelColor = iota
	ColorWhite
	ColorBlack
	ColorGray
	ColorGrayDark
	ColorBrownDark
	ColorBrownMid
	ColorBrownLight
	ColorYellow
	ColorSkin
	ColorSkinShadow
	ColorHairBrown
	ColorJacketDark
	ColorJacketLight
	ColorJacketShade
	ColorPants
	ColorPantShadow
	ColorPantLight
	ColorShoes
	ColorShirtTan
)

var colorMap = map[PixelColor]tcell.Color{
	ColorWhite:       tcell.ColorWhite,
	ColorBlack:       tcell.NewRGBColor(16, 13, 12),
	ColorGray:        tcell.NewRGBColor(190, 190, 190),
	ColorGrayDark:    tcell.NewRGBColor(155, 155, 155),
	ColorBrownDark:   tcell.NewRGBColor(96, 46, 10),
	ColorBrownMid:    tcell.NewRGBColor(163, 88, 24),
	ColorBrownLight:  tcell.NewRGBColor(215, 136, 39),
	ColorYellow:      tcell.NewRGBColor(246, 193, 52),
	ColorSkin:        tcell.NewRGBColor(245, 177, 102),
	ColorSkinShadow:  tcell.NewRGBColor(205, 138, 78),
	ColorHairBrown:   tcell.NewRGBColor(58, 31, 17),
	ColorJacketDark:  tcell.NewRGBColor(53, 50, 53),
	ColorJacketLight: tcell.NewRGBColor(186, 180, 175),
	ColorJacketShade: tcell.NewRGBColor(113, 107, 104),
	ColorPants:       tcell.NewRGBColor(28, 26, 29),
	ColorPantShadow:  tcell.NewRGBColor(40, 36, 38),
	ColorPantLight:   tcell.NewRGBColor(67, 63, 66),
	ColorShoes:       tcell.NewRGBColor(242, 230, 214),
	ColorShirtTan:    tcell.NewRGBColor(150, 120, 78),
}

type Sprite struct {
	W      int
	H      int
	Pixels []PixelColor
}

func NewEmptySprite(w, h int) Sprite {
	return Sprite{
		W:      w,
		H:      h,
		Pixels: make([]PixelColor, w*h),
	}
}

func (s Sprite) At(x, y int) PixelColor {
	if x < 0 || y < 0 || x >= s.W || y >= s.H {
		return ColorTransparent
	}
	return s.Pixels[y*s.W+x]
}

func (s *Sprite) Set(x, y int, color PixelColor) {
	if x < 0 || y < 0 || x >= s.W || y >= s.H {
		return
	}
	s.Pixels[y*s.W+x] = color
}

func SpriteFromRunes(width int, rows []string, mapping map[rune]PixelColor) Sprite {
	sprite := NewEmptySprite(width, len(rows))
	for y, row := range rows {
		x := 0
		for _, char := range row {
			if x >= width {
				break
			}
			color, ok := mapping[char]
			if !ok {
				color = ColorTransparent
			}
			sprite.Set(x, y, color)
			x++
		}
	}
	return sprite
}

func cloneSprite(sprite Sprite) Sprite {
	clone := NewEmptySprite(sprite.W, sprite.H)
	copy(clone.Pixels, sprite.Pixels)
	return clone
}

func shiftOpaqueRegion(base Sprite, out *Sprite, x1, y1, x2, y2, dx, dy int) {
	for y := y1; y < y2; y++ {
		for x := x1; x < x2; x++ {
			if base.At(x, y) != ColorTransparent {
				out.Set(x, y, ColorTransparent)
			}
		}
	}

	for y := y1; y < y2; y++ {
		for x := x1; x < x2; x++ {
			color := base.At(x, y)
			if color == ColorTransparent {
				continue
			}
			out.Set(x+dx, y+dy, color)
		}
	}
}

type PixelBuffer struct {
	W      int
	H      int
	Pixels []PixelColor
}

func NewPixelBuffer(w, h int) *PixelBuffer {
	return &PixelBuffer{
		W:      w,
		H:      h,
		Pixels: make([]PixelColor, w*h),
	}
}

func (b *PixelBuffer) Set(x, y int, color PixelColor) {
	if x < 0 || y < 0 || x >= b.W || y >= b.H {
		return
	}
	b.Pixels[y*b.W+x] = color
}

func (b *PixelBuffer) At(x, y int) PixelColor {
	if x < 0 || y < 0 || x >= b.W || y >= b.H {
		return ColorTransparent
	}
	return b.Pixels[y*b.W+x]
}

func DrawSprite(buffer *PixelBuffer, sprite Sprite, x, y int) {
	for yy := 0; yy < sprite.H; yy++ {
		for xx := 0; xx < sprite.W; xx++ {
			color := sprite.At(xx, yy)
			if color == ColorTransparent {
				continue
			}
			buffer.Set(x+xx, y+yy, color)
		}
	}
}

func DrawSpriteScaled(buffer *PixelBuffer, sprite Sprite, x, y int, scale float64) {
	if scale <= 0 {
		return
	}

	w, h := ScaledSpriteSize(sprite, scale)
	for yy := range h {
		srcY := int(float64(yy) / scale)
		if srcY >= sprite.H {
			srcY = sprite.H - 1
		}
		for xx := range w {
			srcX := int(float64(xx) / scale)
			if srcX >= sprite.W {
				srcX = sprite.W - 1
			}
			color := sprite.At(srcX, srcY)
			if color == ColorTransparent {
				continue
			}
			buffer.Set(x+xx, y+yy, color)
		}
	}
}

func ScaledSpriteSize(sprite Sprite, scale float64) (int, int) {
	w := int(float64(sprite.W) * scale)
	h := int(float64(sprite.H) * scale)
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	return w, h
}

type Renderer struct {
	screen tcell.Screen
}

func NewRenderer(screen tcell.Screen) *Renderer {
	return &Renderer{screen: screen}
}

func (r *Renderer) Draw(g *Game) error {
	baseStyle := tcell.StyleDefault.Background(tcell.ColorDefault).Foreground(tcell.ColorWhite)
	r.screen.SetStyle(baseStyle)
	r.screen.Clear()
	r.screen.HideCursor()

	if g.tooSmall {
		r.drawTooSmall()
		r.screen.Show()
		return nil
	}

	r.drawHUD(g)

	buffer := NewPixelBuffer(g.worldW, g.worldH)
	r.drawGround(g, buffer)
	r.drawObstacles(g, buffer)
	r.drawRichi(g, buffer)
	r.drawPlayer(g, buffer)
	r.blit(buffer, g.viewX, g.playfieldTop())
	r.drawOverlay(g)

	r.screen.Show()
	return nil
}

func (r *Renderer) drawHUD(g *Game) {
	left := fmt.Sprintf("Score %05d  Best %05d  Speed %03d  Lives %d", int(g.score), g.bestScore, int(g.speed), g.lives)
	right := g.statusLine()
	style := tcell.StyleDefault.Foreground(tcell.ColorWhite).Background(tcell.ColorDefault)

	r.drawText(0, 0, left, style)
	r.drawRightText(g.cellW-1, 0, right, style)
}

func (r *Renderer) drawTooSmall() {
	style := tcell.StyleDefault.Foreground(tcell.ColorWhite).Background(tcell.ColorDefault)
	w, h := r.screen.Size()
	r.drawCentered(w/2, h/2-1, "Terminal too small", style)
	r.drawCentered(w/2, h/2, "Resize to at least 90x25", style)
	r.drawCentered(w/2, h/2+1, "Q quits", style)
}

func (r *Renderer) drawGround(g *Game, buffer *PixelBuffer) {
	for x := 0; x < buffer.W; x++ {
		buffer.Set(x, g.groundY, ColorGray)
	}

	shift := int(g.scroll) % 16
	for start := -shift; start < buffer.W+16; start += 16 {
		buffer.Set(start, g.groundY+2, ColorGrayDark)
		buffer.Set(start+1, g.groundY+2, ColorGrayDark)
	}
	for start := -(shift/2+7)%13; start < buffer.W+13; start += 13 {
		buffer.Set(start, g.groundY+3, ColorGrayDark)
	}
}

func (r *Renderer) drawObstacles(g *Game, buffer *PixelBuffer) {
	for _, obstacle := range g.obstacles {
		sp := obstacle.CurSprite()
		y := g.groundY - sp.H
		if obstacle.BaseY != 0 {
			y = obstacle.BaseY
		}
		DrawSprite(buffer, sp, int(obstacle.X), y)
	}
}

func (r *Renderer) drawPlayer(g *Game, buffer *PixelBuffer) {
	DrawSprite(buffer, g.player.Sprite(), g.player.X, int(g.player.Y))
}

func (r *Renderer) drawRichi(g *Game, buffer *PixelBuffer) {
	if !g.richi.Visible(g.hits, g.state) {
		return
	}
	DrawSpriteScaled(buffer, g.richi.Sprite(), int(g.richi.X), int(g.richi.Y), g.richi.Scale)
}

func (r *Renderer) drawOverlay(g *Game) {
	style := tcell.StyleDefault.Foreground(tcell.ColorWhite).Background(tcell.ColorDefault)
	centerX := g.viewX + g.worldW/2
	centerY := g.playfieldTop() + g.playfieldRows()/3

	if g.paused {
		r.drawCentered(centerX, centerY, "PAUSED", style)
		r.drawCentered(centerX, centerY+1, "Press ESC to resume", style)
		return
	}

	switch g.state {
	case StateMenu:
		r.drawCentered(centerX, centerY-1, "GOOMBA RUN", style)
		r.drawCentered(centerX, centerY+1, "Press SPACE to start", style)
		r.drawCentered(centerX, centerY+3, "Press Q to quit", style)
	case StateCaught:
		r.drawCentered(centerX, centerY, "RICHI GOT YOU!", style)
	case StateDead:
		r.drawCentered(centerX, centerY-1, "GAME OVER", style)
		r.drawCentered(centerX, centerY+1, fmt.Sprintf("Score %05d  Best %05d", g.finalScore, g.bestScore), style)
		r.drawCentered(centerX, centerY+2, "Press SPACE to restart", style)
	}
}

func (r *Renderer) blit(buffer *PixelBuffer, xOffset, yOffset int) {
	rows := (buffer.H + 1) / 2
	for cellY := range rows {
		for x := 0; x < buffer.W; x++ {
			top := buffer.At(x, cellY*2)
			bottom := buffer.At(x, cellY*2+1)
			ch, style := styledHalfBlock(top, bottom)
			r.screen.SetContent(xOffset+x, yOffset+cellY, ch, nil, style)
		}
	}
}

func styledHalfBlock(top, bottom PixelColor) (rune, tcell.Style) {
	base := tcell.StyleDefault.Background(tcell.ColorDefault)

	switch {
	case top == ColorTransparent && bottom == ColorTransparent:
		return ' ', base
	case top != ColorTransparent && bottom == ColorTransparent:
		return '▀', base.Foreground(colorMap[top])
	case top == ColorTransparent && bottom != ColorTransparent:
		return '▄', base.Foreground(colorMap[bottom])
	case top == bottom:
		return '█', base.Foreground(colorMap[top])
	default:
		return '▀', base.Foreground(colorMap[top]).Background(colorMap[bottom])
	}
}

func (r *Renderer) drawText(x, y int, text string, style tcell.Style) {
	for index, char := range text {
		r.screen.SetContent(x+index, y, char, nil, style)
	}
}

func (r *Renderer) drawRightText(rightX, y int, text string, style tcell.Style) {
	start := max(rightX - len([]rune(text)) + 1, 0)
	r.drawText(start, y, text, style)
}

func (r *Renderer) drawCentered(x, y int, text string, style tcell.Style) {
	start := max(x - len([]rune(text))/2, 0)
	r.drawText(start, y, text, style)
}
