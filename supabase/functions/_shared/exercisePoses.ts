// How each exercise looks as an animated figure (side view, facing right): the data for the watch and the website.
// No imports, so it runs in the Edge Function (Deno), in the app's tests (Node) and in the figure preview.
//
// A move is a few key poses. The figure is a skeleton (hip, torso, head, two arms, two legs); every pose gives the
// absolute angles of the segments in degrees:
//   torso   from straight up, + leans forward (toward the way the figure faces)
//   head    relative to the torso, + tilts forward
//   arm     angle of upper arm and forearm from straight down, + swings forward (180 = straight up)
//   leg     angle of thigh and shank from straight down, + swings forward; foot: 0 = flat, + toes down
// The near side is drawn in front; the far leg has its own angles (a lunge needs them), the far arm copies the near arm.
// One point stays where it is (the pin), so feet do not slide and hands stay on the bar. Units are centimetres,
// y up from the floor. The renderer (garmin-runapp/source/strength/Figure.mc, tools/figure_preview.py) interprets this.

/** Equipment drawn with the figure. */
export type Equip =
  | 'bb' // barbell in the hands, seen end-on: plate ring around the near wrist
  | 'bbs' // barbell on the back (shoulders)
  | 'db' // dumbbell in the hand, end-on
  | 'dbv' // one dumbbell held upright with both hands (overhead triceps extension)
  | 'bench'
  | 'rack' // upright post of a rack, next to the bench or the lifter
  | 'bar' // pull-up bar with its frame
  | 'pull' // lat pulldown machine with the cable to the hands
  | 'lp'; // leg press: seat back, rails and the sled the feet push

export type Pin = 'foot' | 'toe' | 'hand' | 'hip';

/** torso, head, upper arm, forearm, thigh, shank, foot, far thigh, far shank (degrees) */
export type PoseFrame = [number, number, number, number, number, number, number, number, number];

export interface Move {
  /** Which point stays put and where (x, y in cm, y up from the floor; foot and toe: the sole on the floor, y is ignored). */
  pin: [Pin, number, number];
  equip: Equip[];
  /** Key poses; the animation goes through them and back again. */
  frames: PoseFrame[];
  /** Time of one repetition (out and back) in milliseconds. */
  ms: number;
  /** The part of the picture to show, [left, top, right, bottom] in cm (y down, the floor is 0), found with tools/figure_preview.py --views. */
  view: [number, number, number, number];
}

// Same order as the pose: torso, head, upper arm, forearm, thigh, shank, foot, far thigh, far shank.
export const MOVES: Record<string, Move> = {
  squat: {
    pin: ['foot', 0, 0],
    equip: ['bbs', 'rack'],
    frames: [
      [4, 0, -30, 165, 2, -2, 0, 2, -2],
      [42, -20, -30, 165, 98, -30, 0, 98, -30],
    ],
    ms: 3600,
    view: [-50, -172, 35, 4],
  },
  bench_press: {
    pin: ['hip', 0, 56],
    equip: ['bb', 'bench', 'rack'],
    frames: [
      [-90, 0, 30, 176, 85, -5, 0, 85, -5],
      [-90, 0, 172, 178, 85, -5, 0, 85, -5],
    ],
    ms: 3200,
    view: [-102, -153, 64, 4],
  },
  shoulder_press: {
    pin: ['foot', 0, 0],
    equip: ['bb'],
    frames: [
      [-2, 0, -8, 170, 1, -1, 0, 1, -1],
      [-4, 0, 172, 176, 1, -1, 0, 1, -1],
    ],
    ms: 3000,
    view: [-27, -220, 56, 4],
  },
  row: {
    pin: ['foot', 0, 0],
    equip: ['bb'],
    frames: [
      [68, -28, 2, 0, 22, -14, 0, 22, -14],
      [66, -28, -125, 6, 22, -14, 0, 22, -14],
    ],
    ms: 3000,
    view: [-23, -134, 64, 4],
  },
  bicep_curl: {
    pin: ['foot', 0, 0],
    equip: ['db'],
    frames: [
      [1, 0, 2, 0, 1, -1, 0, 1, -1],
      [1, 0, 12, 150, 1, -1, 0, 1, -1],
    ],
    ms: 2800,
    view: [-18, -172, 46, 4],
  },
  deadlift: {
    pin: ['foot', 0, 0],
    equip: ['bb'],
    frames: [
      [58, -22, -4, 0, 62, -16, 0, 62, -16],
      [2, 0, -2, 0, 2, -1, 0, 2, -1],
    ],
    ms: 3600,
    view: [-44, -172, 38, 4],
  },
  lunge: {
    pin: ['foot', 0, 0],
    equip: ['db'],
    frames: [
      [3, 0, 2, 0, 12, -4, 0, -14, -12],
      [3, 0, 2, 0, 88, -6, 0, -24, -104],
    ],
    ms: 3400,
    view: [-112, -170, 25, 10],
  },
  pull_up: {
    pin: ['hand', 0, 205],
    equip: ['bar'],
    frames: [
      [-2, 8, 178, 178, 8, -28, 20, 8, -28],
      [-8, -6, 6, 177, -4, -38, 20, -4, -38],
    ],
    ms: 3600,
    view: [-61, -237, 64, 4],
  },
  pushup: {
    pin: ['toe', 0, 0],
    equip: [],
    frames: [
      [80, -30, 4, 0, -80, -80, 72, -80, -80],
      [86, -30, 70, 8, -84, -84, 72, -84, -84],
    ],
    ms: 2600,
    view: [-10, -66, 172, 26],
  },
  triceps_ext: {
    pin: ['foot', 0, 0],
    equip: ['dbv'],
    frames: [
      [1, 0, 176, 178, 1, -1, 0, 1, -1],
      [1, 6, 176, 340, 1, -1, 0, 1, -1],
    ],
    ms: 3000,
    view: [-42, -206, 25, 4],
  },
  lat_pulldown: {
    pin: ['hip', 0, 50],
    equip: ['pull'],
    frames: [
      [-10, 0, 172, 176, 86, -4, 0, 86, -4],
      [-16, 0, -12, 158, 86, -4, 0, 86, -4],
    ],
    ms: 3200,
    view: [-31, -222, 64, 6],
  },
  leg_press: {
    pin: ['hip', 0, 40],
    equip: ['lp'],
    frames: [
      [-50, 0, 40, 40, 138, 40, -130, 138, 40],
      [-50, 0, 40, 40, 62, 60, -130, 62, 60],
    ],
    ms: 3600,
    view: [-64, -95, 114, 30],
  },
};

// ---------------------------------------------------------------------------
// For the watch feed
// ---------------------------------------------------------------------------

export const EQUIP_BITS: Record<Equip, number> = { bb: 1, bbs: 2, db: 4, dbv: 8, bench: 16, rack: 32, bar: 64, pull: 128, lp: 256 };
const PIN_INDEX: Record<Pin, number> = { foot: 0, toe: 1, hand: 2, hip: 3 };

/** A move as the watch gets it: pin kind (0 foot, 1 toe, 2 hand, 3 hip), pin x and y, equipment bits, time, view box, key poses. */
export interface FeedMove {
  p: number;
  x: number;
  y: number;
  q: number;
  ms: number;
  v: number[];
  k: PoseFrame[];
}

export function feedMove(m: Move): FeedMove {
  return { p: PIN_INDEX[m.pin[0]], x: m.pin[1], y: m.pin[2], q: m.equip.reduce((n, e) => n | EQUIP_BITS[e], 0), ms: m.ms, v: m.view, k: m.frames };
}
