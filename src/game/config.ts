// Every tuning number of the game, in one place. World units are pixels of the
// 320x180 picture.

export const W = 320;
export const H = 180;
/** y of the ground surface (feet rest here) */
export const GROUND = 148;
/** where the Goomba runs on the screen */
export const PLAYER_X = 112;

// ---- jump -------------------------------------------------------------------

export const GRAVITY = 1500;
/** gravity is this much stronger on the way down, so a jump has weight instead of hanging */
export const FALL_GRAVITY = 1.5;
export const JUMP_V = -430;
export const DOUBLE_JUMP_V = -370;
/** releasing early clamps upward speed to this (the shortest tap still makes a real hop) */
export const JUMP_CUT_V = -230;
export const MAX_FALL = 640;
export const COYOTE = 0.09;
export const JUMP_BUFFER = 0.12;

// ---- run --------------------------------------------------------------------

export const SPEED_TITLE = 26;
export const SPEED_START = 105;
/** reached around 1200 m; after that it only creeps up */
export const SPEED_MAX = 220;
export const SPEED_CREEP_FROM = 1200; // metres
export const SPEED_CREEP = 0.03; // px/s per metre past that
export const SPEED_CREEP_MAX = 60;
export const PX_PER_METER = 14;
export const MAX_LIVES = 3;
export const INVULN = 1.5;
export const BERRY_POINTS = 10;

// ---- Richi (Gaspare on screen) ----------------------------------------------

// He clears his own path: scenery gets kicked away, Stingbies get punched away
// (the high ones) or smashed flat (the low ones).
export const KICK_REACH = 20; // px ahead of him where his foot connects
export const PUNCH_REACH = 24; // ... where his fist lands at full stretch
export const SMASH_REACH = 18; // ... and where it comes down, low in front of him
export const KICK_LEAD = 0.1; // seconds of wind-up before the blow lands
export const FIST_LEAD = 0.16;
/** a Stingby flying above this line is punched, one below it is smashed */
export const PUNCH_ABOVE = GROUND - 40;
export const BLOW_TIME = 0.2; // how long he holds the pose afterwards
/** chance a kicked thing sails off to the horizon; otherwise it flips over and drops off the screen */
export const FAR_CHANCE = { stump: 0.5, rock: 0.3, cactus: 0.65 };
/** seconds a kicked thing takes to shrink into the distance */
export const FAR_TIME = 0.85;
/** height of the flattened Stingby sprite */
export const FLAT_H = 14;
/** seconds per rock from side to side while he holds the Goomba */
export const TOSS_PERIOD = 1.15;
/** where Richi runs on the screen for each number of hearts left */
export const RICHI_X = [PLAYER_X - 8, 62, 30, 2];

/** dedication shown on the title screen, e.g. 'FOR GIULIA' */
export const DEDICATION = '';

// ---- bodies -----------------------------------------------------------------

/** the Goomba's body, measured from its feet (x is centred on it) */
export const GOOMBA_BODY = { w: 20, h: 20 };

export type ObKind = 'stump' | 'rock' | 'cactus' | 'stingby';

export interface ObDef {
  w: number;
  h: number;
  /** body insets from the sprite: left, top, right, bottom */
  inset: [number, number, number, number];
  /** how far in from its left edge Richi's blow lands */
  strike: number;
  extraSpeed: number;
}

// Bodies sit a few pixels inside the art (rounded corners, wings, leaves), so a
// hit happens where the two drawings visibly meet.
export const OBS: Record<ObKind, ObDef> = {
  stump: { w: 22, h: 19, inset: [3, 3, 3, 0], strike: 5, extraSpeed: 0 },
  rock: { w: 24, h: 16, inset: [3, 4, 3, 0], strike: 5, extraSpeed: 0 },
  cactus: { w: 20, h: 27, inset: [5, 3, 5, 0], strike: 6, extraSpeed: 0 },
  stingby: { w: 30, h: 26, inset: [5, 6, 5, 5], strike: 6, extraSpeed: 38 },
};

/** a pickup is collected when the Goomba's body touches a circle of this radius around it */
export const PICKUP_RADIUS = 5;

// ---- HUD --------------------------------------------------------------------

// The two HUD buttons, in game pixels: a plate big enough for a thumb, and a
// tap area that reaches a little past it (to the top edge and between the two).
export const BTN_W = 24;
export const BTN_H = 22;
export const BTN_Y = 1;
export const PAUSE_X = 135;
export const SOUND_X = 161;
export const BTN_PAUSE = { x: PAUSE_X - 3, y: 0, w: BTN_W + 4, h: BTN_Y + BTN_H + 4 };
export const BTN_SOUND = { x: SOUND_X - 1, y: 0, w: BTN_W + 4, h: BTN_Y + BTN_H + 4 };

/** drawing order, back to front */
export const DEPTH = {
  sky: 0, stars: 1, sun: 2, clouds: 3, farHills: 4, nearHills: 6, decoBack: 8, ground: 9, decoFront: 10, tint: 11,
  shadows: 12, debrisBack: 13, richi: 14, obstacles: 15, hints: 16, pickups: 17, goomba: 18, holdArm: 19,
  debrisFront: 20, fx: 21,
};
