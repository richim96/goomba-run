package main

import (
	"log"

	"github.com/gdamore/tcell/v2"

	"goomba_cli/game"
)

func main() {
	screen, err := tcell.NewScreen()
	if err != nil {
		log.Fatal(err)
	}

	if err := screen.Init(); err != nil {
		log.Fatal(err)
	}
	defer screen.Fini()

	runner := game.New(screen)
	if err := runner.Run(); err != nil {
		log.Fatal(err)
	}
}
