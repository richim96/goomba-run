package game

import "github.com/gdamore/tcell/v2"

type InputEventType int

const (
	EventJump InputEventType = iota
	EventQuit
	EventPause
	EventResize
)

type InputEvent struct {
	Type InputEventType
}

type Input struct {
	screen tcell.Screen
	events chan InputEvent
	quit   chan struct{}
}

func NewInput(screen tcell.Screen) *Input {
	return &Input{
		screen: screen,
		events: make(chan InputEvent, 128),
		quit:   make(chan struct{}),
	}
}

func (i *Input) Start() {
	rawEvents := make(chan tcell.Event, 128)
	go i.screen.ChannelEvents(rawEvents, i.quit)
	go i.loop(rawEvents)
}

func (i *Input) Stop() {
	select {
	case <-i.quit:
	default:
		close(i.quit)
	}
}

func (i *Input) Events() <-chan InputEvent {
	return i.events
}

func (i *Input) loop(rawEvents <-chan tcell.Event) {
	defer close(i.events)

	for event := range rawEvents {
		switch typed := event.(type) {
		case *tcell.EventResize:
			i.push(InputEvent{Type: EventResize})
		case *tcell.EventKey:
			i.handleKey(typed)
		}
	}
}

func (i *Input) handleKey(event *tcell.EventKey) {
	switch event.Key() {
	case tcell.KeyCtrlC:
		i.push(InputEvent{Type: EventQuit})
	case tcell.KeyEscape:
		i.push(InputEvent{Type: EventPause})
	case tcell.KeyRune:
		switch event.Rune() {
		case ' ':
			i.push(InputEvent{Type: EventJump})
		case 'q', 'Q':
			i.push(InputEvent{Type: EventQuit})
		}
	}
}

func (i *Input) push(event InputEvent) {
	select {
	case i.events <- event:
	default:
	}
}
