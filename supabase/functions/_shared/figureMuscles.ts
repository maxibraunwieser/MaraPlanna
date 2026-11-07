// Which muscles an exercise trains, finely enough to colour them on the figure, and where each muscle sits on the body.
// The same table is in the watch (garmin-runapp/source/strength/Figure.mc, OVERLAY): website and watch draw the same picture.
// No imports of app code: it runs in the Edge Function (Deno), in the tests (Node) and in the website.

import type { Pattern } from './exerciseCatalog.ts';

export const MUSCLE_IDS = ['chest', 'back', 'traps', 'delts', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'lowback', 'hipflex', 'adductors'] as const;
export type FineMuscle = (typeof MUSCLE_IDS)[number];

export const bitOf = (m: FineMuscle): number => 1 << MUSCLE_IDS.indexOf(m);
export const maskOf = (ms: readonly FineMuscle[]): number => ms.reduce((a, m) => a | bitOf(m), 0);
export const musclesIn = (mask: number): FineMuscle[] => MUSCLE_IDS.filter((m) => (mask & bitOf(m)) !== 0);

/**
 * Where a muscle sits: [segment, from, to, side from, side to] (from/to along the segment, 0..1; sides across it, -1 = back
 * edge, +1 = front edge, for a limb from its upper end to its lower end, "front" is the side the figure faces).
 * Segments: 0 trunk, 1 thigh, 2 shin, 3 upper arm, 4 forearm, 5 shoulder (disc), 6 buttock (disc).
 */
export const OVERLAY: Record<FineMuscle, number[]> = {
  chest: [0, 0.58, 0.93, 0.05, 1.0],
  back: [0, 0.3, 0.88, -1.0, -0.05],
  traps: [0, 0.78, 1.0, -1.0, 0.4],
  delts: [5, 0, 0, 0, 0],
  biceps: [3, 0.15, 0.85, 0.1, 1.0],
  triceps: [3, 0.12, 0.85, -1.0, -0.1],
  forearms: [4, 0.05, 0.82, -0.9, 0.9],
  quads: [1, 0.08, 0.86, 0.0, 1.0],
  hamstrings: [1, 0.1, 0.86, -1.0, 0.0],
  glutes: [6, 0, 0, 0, 0],
  calves: [2, 0.08, 0.64, -1.0, 0.1],
  abs: [0, 0.1, 0.5, 0.1, 1.0],
  lowback: [0, 0.0, 0.4, -1.0, -0.1],
  hipflex: [1, 0.0, 0.32, 0.0, 1.0],
  adductors: [1, 0.05, 0.56, -0.55, 0.65],
};

/** The coarse muscles of the website (exerciseInfo.ts) and where each of them is on the figure. */
export type CoarseMuscle = 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'core';
const OF_COARSE: Record<CoarseMuscle, FineMuscle> = {
  quads: 'quads', hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves', chest: 'chest', back: 'back', shoulders: 'delts', biceps: 'biceps', triceps: 'triceps', core: 'abs',
};

/** The muscles of a movement pattern, the main one first; exercises that differ are in MUSCLES_OWN. */
export const MUSCLES_OF_PATTERN: Record<Pattern, CoarseMuscle[]> = {
  squat: ['quads', 'glutes'],
  hinge: ['hamstrings', 'glutes'],
  lunge: ['quads', 'glutes'],
  glute: ['glutes', 'hamstrings'],
  calf: ['calves'],
  push_h: ['chest', 'triceps', 'shoulders'],
  push_v: ['shoulders', 'triceps'],
  pull_h: ['back', 'biceps'],
  pull_v: ['back', 'biceps'],
  delts: ['shoulders'],
  arms: ['biceps'],
  core: ['core'],
};

export const MUSCLES_OWN: Record<string, CoarseMuscle[]> = {
  deadlift: ['hamstrings', 'glutes', 'back'],
  kb_swing: ['glutes', 'hamstrings'],
  leg_curl: ['hamstrings'],
  leg_ext: ['quads'],
  face_pull: ['shoulders', 'back'],
  reverse_fly: ['shoulders', 'back'],
  reverse_pec_deck: ['shoulders', 'back'],
  ytw: ['shoulders', 'back'],
  band_pull_apart: ['shoulders', 'back'],
  incline_db: ['chest', 'shoulders', 'triceps'],
  pushdown: ['triceps'],
  oh_triceps: ['triceps'],
  dips: ['triceps', 'chest'],
  bb_curl: ['biceps'],
  db_curl: ['biceps'],
  cable_curl: ['biceps'],
  band_pulldown: ['back', 'biceps'],
};

/** Main and secondary muscles (masks) of library exercises, registered by exerciseLibrary.ts. */
export const FINE_OWN: Record<string, { p: number; s: number }> = {};

/** Finer muscles that the coarse list does not name (added to the secondary ones; `p` to the main ones). */
const EXTRA: Record<string, { p?: FineMuscle[]; s?: FineMuscle[] }> = {
  deadlift: { s: ['lowback', 'traps', 'forearms'] },
  rdl_bb: { s: ['lowback'] },
  rdl_db: { s: ['lowback'] },
  sl_rdl: { s: ['lowback'] },
  bb_row: { s: ['lowback', 'traps'] },
  db_row: { s: ['traps'] },
  cable_row: { s: ['traps'] },
  chest_row: { s: ['traps'] },
  inverted_row: { s: ['traps'] },
  trx_row: { s: ['traps'] },
  pull_up: { s: ['forearms'] },
  assisted_pull_up: { s: ['forearms'] },
  face_pull: { s: ['traps'] },
  reverse_fly: { s: ['traps'] },
  reverse_pec_deck: { s: ['traps'] },
  ytw: { s: ['traps', 'lowback'] },
  band_pull_apart: { s: ['traps'] },
  ohp: { s: ['traps', 'abs'] },
  kb_swing: { s: ['lowback', 'forearms'] },
  hanging_knee: { p: ['abs', 'hipflex'], s: ['forearms'] },
  plank: { s: ['delts', 'glutes'] },
  side_plank: { s: ['delts', 'glutes'] },
  push_up: { s: ['abs'] },
  pike_push_up: { s: ['abs'] },
  glute_bridge: { s: ['lowback'] },
  hip_thrust: { s: ['lowback'] },
  hip_thrust_db: { s: ['lowback'] },
  step_up: { s: ['adductors'] },
  bulgarian: { s: ['hipflex', 'adductors'] },
  reverse_lunge: { s: ['adductors'] },
  reverse_lunge_db: { s: ['adductors'] },
  leg_press: { s: ['adductors'] },
  back_squat: { s: ['lowback', 'adductors'] },
  goblet_squat: { s: ['abs', 'adductors'] },
};

/** Main and secondary muscles of a catalogue exercise as bit masks (see MUSCLE_IDS). */
export function fineMuscles(key: string, pattern: Pattern): { p: number; s: number } {
  if (FINE_OWN[key]) return FINE_OWN[key];
  const coarse = MUSCLES_OWN[key] ?? MUSCLES_OF_PATTERN[pattern];
  const fine = coarse.map((c) => OF_COARSE[c]);
  const extra = EXTRA[key];
  const p = maskOf([fine[0], ...(extra?.p ?? [])]);
  const s = maskOf([...fine.slice(1), ...(extra?.s ?? [])]) & ~p;
  return { p, s };
}
