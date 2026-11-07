// The poses and equipment of every exercise of the catalogue (see exerciseArt.ts for how they are drawn).
// A = start, B = end. Frame coordinates: the hip of frame A is (0, 0), y points down; equipment is placed in that space.

import { armTo, legTo, type ExerciseArt, type Item, type Pose } from './exerciseArt.ts';

const UP = -90;
const DOWN = 90;

/** Standing, arms hanging. */
const stand: Pose = { torso: UP, ...legTo(0, 33), ua: DOWN, fa: DOWN };
const hang = { ua: DOWN, fa: DOWN };

// ---- equipment
/** The bar seen from its end: a plate at the hands. */
const barAtHands: Item[] = [{ k: 'circle', x: 0, y: 0, r: 6.5, at: 'hand', c: 'accent' }];
const dbAtHands: Item[] = [{ k: 'circle', x: 0, y: 0, r: 4, at: 'hand', c: 'gear' }];
const gripAtHands: Item[] = [{ k: 'circle', x: 0, y: 0, r: 2.6, at: 'hand', c: 'gear' }];
/** A bar the person hangs from or holds (drawn across the picture). */
const barAcross: Item[] = [{ k: 'line', x1: -15, y1: 0, x2: 15, y2: 0, w: 2.6, at: 'hand', c: 'gear' }];
/** A flat bench under a lying figure. */
const flatBench = (x1 = -40, x2 = 8, y = 4): Item[] => [{ k: 'stand', x1, x2, y, h: 4 }];
/** Seat and back of a machine, for a figure sitting upright (hip at the origin). */
const seat = (lean = 0): Item[] => [
  { k: 'line', x1: -3, y1: 4, x2: 14, y2: 4, w: 4, c: 'light', at: 'hip' },
  { k: 'line', x1: -5 - lean, y1: 6, x2: -6 - lean * 2.2, y2: -28, w: 4, c: 'light', at: 'hip' },
];

export const ART: Record<string, ExerciseArt> = {
  // ---------------------------------------------------------------- squat
  back_squat: {
    pin: 'foot',
    a: { ...stand, ...armTo(3, -1, -1) },
    b: { torso: -60, ...legTo(18, 19), ...armTo(3, -1, -1) },
    gear: [{ k: 'circle', x: -1, y: -3, r: 6.5, at: 'shoulder', c: 'accent' }],
  },
  goblet_squat: {
    pin: 'foot',
    a: { ...stand, ...armTo(9, -4, -1) },
    b: { torso: -72, ...legTo(16, 20), ...armTo(9, -2, -1) },
    gear: dbAtHands,
  },
  leg_press: {
    pin: 'hip',
    a: { torso: -140, ...legTo(30, -12), ua: 60, fa: 20 },
    b: { torso: -140, ...legTo(13, -13), ua: 60, fa: 20 },
    gear: [
      { k: 'line', x1: -3, y1: 2.6, x2: -21, y2: -12.8, w: 4, c: 'light', at: 'hip' },
      { k: 'line', x1: -3, y1: 3.6, x2: 11, y2: 4, w: 4, c: 'light', at: 'hip' },
      { k: 'line', x1: 6, y1: -13, x2: 6, y2: 11, w: 3, c: 'gear', at: 'ankle' },
    ],
  },
  tempo_squat: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: -66, ...legTo(17, 20), ua: 0, fa: 0 },
  },

  // ---------------------------------------------------------------- hinge
  deadlift: {
    pin: 'foot',
    a: { torso: -38, ...legTo(8, 26), ...hang },
    b: { ...stand },
    gear: barAtHands,
  },
  rdl_bb: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: -18, ...legTo(4, 31), ...hang },
    gear: barAtHands,
  },
  rdl_db: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: -18, ...legTo(4, 31), ...hang },
    gear: dbAtHands,
  },
  kb_swing: {
    pin: 'foot',
    a: { torso: -32, ...legTo(10, 28), ...armTo(-3, 21) },
    b: { ...stand, ...armTo(22, -2) },
    gear: [
      { k: 'circle', x: 1, y: 4, r: 5, at: 'hand', c: 'gear' },
      { k: 'circle', x: 1, y: 4, r: 2, at: 'hand', c: 'light' },
    ],
  },
  sl_rdl: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: -6, ...legTo(3, 31), ...hang, th2: 188, sh2: 188, ft2: 100 },
  },
  leg_curl: {
    pin: 'hip',
    a: { torso: 0, th: 180, sh: 180, ft: 180, ua: 20, fa: 20 },
    b: { torso: 0, th: 180, sh: 250, ft: 250, ua: 20, fa: 20 },
    gear: [{ k: 'rect', x: -38, y: 5, w: 70, h: 4, c: 'light' }],
  },

  // ---------------------------------------------------------------- single leg
  reverse_lunge: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: UP, th: 0, sh: 90, th2: 130, sh2: 192, ft2: 80, ...hang },
  },
  reverse_lunge_db: {
    pin: 'foot',
    a: { ...stand },
    b: { torso: UP, th: 0, sh: 90, th2: 130, sh2: 192, ft2: 80, ...hang },
    gear: dbAtHands,
  },
  bulgarian: {
    pin: 'foot',
    a: { torso: UP, ...legTo(4, 31), ...legTo2(-26, 15), ...hang },
    b: { torso: UP, th: 0, sh: 90, ...legTo2(-13, -1), ...hang },
    gear: [{ k: 'stand', x1: -36, x2: -18, y: 17, h: 3 }, ...dbAtHands],
  },
  step_up: {
    pin: 'foot',
    a: { torso: -75, ...legTo(10, 16), ...legTo2(-3, 33), ...hang },
    b: { torso: UP, ...legTo(0, 33), th2: -8, sh2: 90, ...hang },
    gear: [{ k: 'rect', x: -8, y: 18, w: 34, h: 18, c: 'light' }, ...dbAtHands],
  },
  box_step_up: {
    pin: 'foot',
    a: { torso: -75, ...legTo(10, 16), ...legTo2(-3, 33), ...hang },
    b: { torso: UP, ...legTo(0, 33), th2: -8, sh2: 90, ...hang },
    gear: [{ k: 'rect', x: -8, y: 18, w: 34, h: 18, c: 'light' }],
  },
  leg_ext: {
    pin: 'hip',
    a: { torso: -96, th: 0, sh: 92, ua: 80, fa: 60 },
    b: { torso: -96, th: 0, sh: -8, ua: 80, fa: 60 },
    gear: [...seat(), { k: 'circle', x: 3, y: 0, r: 3, at: 'ankle', c: 'accent' }],
  },

  // ---------------------------------------------------------------- glutes and calves
  hip_thrust: {
    pin: 'foot',
    a: { torso: -153, ...legTo(18, 6), ua: 0, fa: 0 },
    b: { torso: -178, ...legTo(17, 16), ua: 0, fa: 0 },
    gear: [{ k: 'stand', x1: -50, x2: -20, y: -6, h: 4 }, { k: 'circle', x: 0, y: -2, r: 7, at: 'hip', c: 'accent' }],
  },
  hip_thrust_db: {
    pin: 'foot',
    a: { torso: -153, ...legTo(18, 6), ua: 0, fa: 0 },
    b: { torso: -178, ...legTo(17, 16), ua: 0, fa: 0 },
    gear: [{ k: 'stand', x1: -50, x2: -20, y: -6, h: 4 }, { k: 'circle', x: 0, y: -2, r: 4.5, at: 'hip', c: 'gear' }],
  },
  glute_bridge: {
    pin: 'foot',
    a: { torso: 180, ...legTo(18, 0), th2: -30, sh2: -30, ua: 60, fa: 60 },
    b: { torso: 138, ...legTo(14, 16), th2: -30, sh2: -30, ua: 60, fa: 60 },
  },
  calf_machine: {
    pin: 'foot',
    a: { ...stand, ft: 0 },
    b: { ...stand, ft: 60 },
    gear: [{ k: 'rect', x: -6, y: -4, w: 12, h: 5, at: 'shoulder', c: 'accent' }, { k: 'line', x1: -9, y1: -1, x2: -9, y2: 40, w: 3, c: 'light', at: 'shoulder' }],
  },
  calf_db: {
    pin: 'foot',
    a: { ...stand, ft: 0, th2: 95, sh2: 170, ft2: 70 },
    b: { ...stand, ft: 60, th2: 95, sh2: 170, ft2: 70 },
    gear: dbAtHands,
  },
  calf_body: {
    pin: 'foot',
    a: { ...stand, ft: 0, th2: 95, sh2: 170, ft2: 70 },
    b: { ...stand, ft: 60, th2: 95, sh2: 170, ft2: 70 },
  },

  // ---------------------------------------------------------------- push
  bench_press: {
    pin: 'hip',
    a: { torso: 180, th: -8, sh: 95, ua: UP, fa: UP },
    b: { torso: 180, th: -8, sh: 95, ua: 8, fa: UP },
    gear: [...flatBench(), ...barAtHands],
  },
  db_bench: {
    pin: 'hip',
    a: { torso: 180, th: -8, sh: 95, ua: UP, fa: UP },
    b: { torso: 180, th: -8, sh: 95, ua: 8, fa: UP },
    gear: [...flatBench(), ...dbAtHands],
  },
  db_floor_press: {
    pin: 'hip',
    a: { torso: 180, ...legTo(17, 0), ua: UP, fa: UP },
    b: { torso: 180, ...legTo(17, 0), ua: 4, fa: UP },
    gear: dbAtHands,
  },
  chest_press: {
    pin: 'hip',
    a: { torso: -92, th: 0, sh: 90, ...armTo(10, 3, -1) },
    b: { torso: -92, th: 0, sh: 90, ...armTo(22, 0, -1) },
    gear: [...seat(), { k: 'circle', x: 0, y: 0, r: 2.8, at: 'hand', c: 'gear' }],
  },
  push_up: {
    pin: 'foot',
    a: { torso: -24, th: 156, sh: 156, ft: 70, ua: DOWN, fa: DOWN },
    b: { torso: -8, th: 172, sh: 172, ft: 70, ...armTo(-4.5, 7.7, 1) },
  },
  incline_db: {
    pin: 'hip',
    a: { torso: -140, th: -8, sh: 95, ua: UP, fa: UP },
    b: { torso: -140, th: -8, sh: 95, ua: 20, fa: UP },
    gear: [
      { k: 'line', x1: -3, y1: 3, x2: -22, y2: -13, w: 4, c: 'light', at: 'hip' },
      { k: 'line', x1: -3, y1: 4, x2: 12, y2: 4, w: 4, c: 'light', at: 'hip' },
      ...dbAtHands,
    ],
  },
  ohp: {
    pin: 'foot',
    a: { ...stand, ...armTo(4, -3, -1) },
    b: { ...stand, ...armTo(0, -23) },
    gear: barAtHands,
  },
  db_shoulder_press: {
    pin: 'foot',
    a: { ...stand, ...armTo(4, -3, -1) },
    b: { ...stand, ...armTo(0, -23) },
    gear: dbAtHands,
  },
  shoulder_press_m: {
    pin: 'hip',
    a: { torso: -94, th: 0, sh: 90, ...armTo(5, -3, -1) },
    b: { torso: -94, th: 0, sh: 90, ...armTo(0, -23) },
    gear: [...seat(), { k: 'circle', x: 0, y: 0, r: 2.8, at: 'hand', c: 'gear' }],
  },
  pike_push_up: {
    pin: 'foot',
    a: { torso: 24, ...legTo(-20, 26), ua: 70, fa: 70 },
    b: { torso: 40, ...legTo(-20, 26), ...armTo(2, 14, -1) },
  },

  // ---------------------------------------------------------------- pull
  bb_row: {
    pin: 'foot',
    a: { torso: -22, ...legTo(-2, 31), ...hang },
    b: { torso: -22, ...legTo(-2, 31), ...armTo(2, 12, -1) },
    gear: barAtHands,
  },
  db_row: {
    pin: 'foot',
    a: { torso: -12, ...legTo(-2, 31), ...hang, ua2: 75, fa2: 75 },
    b: { torso: -12, ...legTo(-2, 31), ...armTo(2, 12, -1), ua2: 75, fa2: 75 },
    gear: [{ k: 'stand', x1: 8, x2: 34, y: 14, h: 4 }, ...dbAtHands],
  },
  cable_row: {
    pin: 'hip',
    a: { torso: -72, th: -6, sh: 80, ...armTo(22, 4) },
    b: { torso: -92, th: -6, sh: 80, ...armTo(6, 9, -1) },
    gear: [...seat(), { k: 'to', x: 70, y: 6, c: 'gear' }],
  },
  chest_row: {
    pin: 'hip',
    a: { torso: -62, th: 0, sh: 90, ...armTo(17, 12) },
    b: { torso: -62, th: 0, sh: 90, ...armTo(4, 8, -1) },
    gear: [...seat(), { k: 'line', x1: 12, y1: -22, x2: 8, y2: 2, w: 5, c: 'light', at: 'hip' }, { k: 'circle', x: 0, y: 0, r: 2.8, at: 'hand', c: 'gear' }],
  },
  inverted_row: {
    pin: 'foot',
    a: { torso: -12, th: 168, sh: 168, ft: -70, ua: UP, fa: UP },
    b: { torso: -12, th: 168, sh: 168, ft: -70, ...armTo(0, -8, -1) },
    gear: gripAtHands,
  },
  trx_row: {
    pin: 'foot',
    a: { torso: -28, th: 152, sh: 152, ft: -70, ...armTo(2, -22) },
    b: { torso: -28, th: 152, sh: 152, ft: -70, ...armTo(0, -9, -1) },
    gear: [{ k: 'to', x: 14, y: -60, c: 'accent' }],
  },
  pull_up: {
    pin: 'hand',
    hang: true,
    a: { torso: UP, th: 90, sh: 100, ua: UP, fa: UP },
    b: { torso: -95, th: 100, sh: 125, ...armTo(4, -7, 1) },
    gear: barAcross,
  },
  assisted_pull_up: {
    pin: 'hand',
    hang: true,
    a: { torso: UP, th: 90, sh: 100, ua: UP, fa: UP },
    b: { torso: -95, th: 100, sh: 125, ...armTo(4, -7, 1) },
    gear: [...barAcross, { k: 'rect', x: -9, y: 6, w: 18, h: 3, at: 'knee', c: 'light' }],
  },
  lat_pulldown: {
    pin: 'hip',
    a: { torso: -86, th: -6, sh: 85, ...armTo(2, -23) },
    b: { torso: -96, th: -6, sh: 85, ...armTo(8, 4, -1) },
    gear: [...seat(), { k: 'to', x: 8, y: -52, c: 'gear' }, { k: 'line', x1: 0, y1: -6, x2: 14, y2: -6, w: 3, c: 'light', at: 'knee' }],
  },
  band_pulldown: {
    pin: 'foot',
    a: { ...stand, ...armTo(10, -21) },
    b: { ...stand, ...armTo(5, 10, -1) },
    gear: [{ k: 'to', x: 14, y: -50, c: 'accent' }],
  },

  // ---------------------------------------------------------------- shoulders and arms
  lateral_raise: {
    pin: 'foot',
    a: { ...stand },
    b: { ...stand, ua: -8, fa: -8 },
    gear: dbAtHands,
  },
  face_pull: {
    pin: 'foot',
    a: { ...stand, ...armTo(22, -2) },
    b: { ...stand, ...armTo(7, -8, 1) },
    gear: [{ k: 'to', x: 52, y: -22, c: 'gear' }],
  },
  reverse_fly: {
    pin: 'foot',
    a: { torso: -18, ...legTo(-2, 31), ...hang },
    b: { torso: -18, ...legTo(-2, 31), ua: 25, fa: 10 },
    gear: dbAtHands,
  },
  reverse_pec_deck: {
    pin: 'hip',
    a: { torso: -78, th: 0, sh: 90, ua: 0, fa: 0 },
    b: { torso: -78, th: 0, sh: 90, ua: 30, fa: 25 },
    gear: [...seat(), { k: 'line', x1: 10, y1: -26, x2: 6, y2: 0, w: 5, c: 'light', at: 'hip' }],
  },
  ytw: {
    pin: 'hip',
    a: { torso: 0, th: 180, sh: 180, ft: 180, ua: DOWN, fa: DOWN },
    b: { torso: 0, th: 180, sh: 180, ft: 180, ua: -25, fa: -25 },
    gear: [{ k: 'rect', x: -34, y: 5, w: 52, h: 4, c: 'light' }],
  },
  band_pull_apart: {
    pin: 'foot',
    a: { ...stand, ...armTo(22, 1) },
    b: { ...stand, ...armTo(16, 6, -1) },
    gear: [{ k: 'circle', x: 0, y: 0, r: 2.4, at: 'hand', c: 'accent' }],
  },
  db_curl: {
    pin: 'foot',
    a: { ...stand },
    b: { ...stand, ua: 96, fa: -62 },
    gear: dbAtHands,
  },
  bb_curl: {
    pin: 'foot',
    a: { ...stand },
    b: { ...stand, ua: 96, fa: -62 },
    gear: [{ k: 'circle', x: 0, y: 0, r: 5.5, at: 'hand', c: 'accent' }],
  },
  cable_curl: {
    pin: 'foot',
    a: { ...stand },
    b: { ...stand, ua: 96, fa: -62 },
    gear: [{ k: 'to', x: 24, y: 30, c: 'gear' }],
  },
  pushdown: {
    pin: 'foot',
    a: { torso: -84, ...legTo(0, 33), ua: 92, fa: -20 },
    b: { torso: -84, ...legTo(0, 33), ua: 92, fa: 88 },
    gear: [{ k: 'to', x: 8, y: -52, c: 'gear' }],
  },
  oh_triceps: {
    pin: 'foot',
    a: { ...stand, ua: -88, fa: 140 },
    b: { ...stand, ua: -88, fa: -88 },
    gear: dbAtHands,
  },
  dips: {
    pin: 'hand',
    hang: true,
    a: { torso: UP, th: 95, sh: 150, ua: DOWN, fa: DOWN },
    b: { torso: -80, th: 95, sh: 150, ...armTo(-3, 10, -1) },
    gear: barAcross,
  },

  // ---------------------------------------------------------------- core
  plank: {
    pin: 'foot',
    still: true,
    a: { torso: -12, th: 168, sh: 168, ft: 70, ua: DOWN, fa: 0 },
    b: { torso: -12, th: 168, sh: 168, ft: 70, ua: DOWN, fa: 0 },
  },
  side_plank: {
    pin: 'foot',
    still: true,
    a: { torso: -20, th: 160, sh: 160, ft: 70, ua: DOWN, fa: DOWN },
    b: { torso: -20, th: 160, sh: 160, ft: 70, ua: DOWN, fa: DOWN },
  },
  dead_bug: {
    pin: 'hip',
    a: { torso: 180, th: UP, sh: 0, ua: UP, fa: UP },
    b: { torso: 180, th: UP, sh: 0, ua: UP, fa: UP, ua2: 180, fa2: 180, th2: 0, sh2: 0 },
  },
  bird_dog: {
    pin: 'hip',
    a: { torso: -4, th: 90, sh: 180, ft: 180, ua: DOWN, fa: DOWN },
    b: { torso: -4, th: 90, sh: 180, ft: 180, ua: DOWN, fa: DOWN, ua2: 0, fa2: 0, th2: 180, sh2: 180, ft2: 180 },
  },
  pallof: {
    pin: 'foot',
    a: { ...stand, ...armTo(10, -3, -1) },
    b: { ...stand, ...armTo(22, -2) },
    gear: [{ k: 'to', x: 46, y: -12, c: 'accent' }],
  },
  pallof_cable: {
    pin: 'foot',
    a: { ...stand, ...armTo(10, -3, -1) },
    b: { ...stand, ...armTo(22, -2) },
    gear: [{ k: 'to', x: 46, y: -12, c: 'gear' }],
  },
  hanging_knee: {
    pin: 'hand',
    hang: true,
    a: { torso: UP, th: 90, sh: 90, ua: UP, fa: UP },
    b: { torso: -100, th: -5, sh: 100, ua: UP, fa: UP },
    gear: barAcross,
  },
};

/** The leg that does not stand on the ground (far leg) put with its ankle at (dx, dy) from the hip. */
function legTo2(dx: number, dy: number): { th2: number; sh2: number } {
  const { th, sh } = legTo(dx, dy);
  return { th2: th, sh2: sh };
}
