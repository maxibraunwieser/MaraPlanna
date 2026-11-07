// The exercise catalogue: every exercise the website offers, with what it trains, what it needs and which exercises of the watch
// library it belongs to. Pure data and no imports of app code, so the website, the Edge Function (Deno) and the tests all read it.

import type { Gear, Limitation } from './strength.ts';
import { GROUPS_OF_EXISTING, LIBRARY } from './exerciseLibrary.ts';
import type { ListGroup } from './exerciseListData.ts';

export type Pattern = 'squat' | 'hinge' | 'lunge' | 'glute' | 'calf' | 'push_h' | 'push_v' | 'pull_h' | 'pull_v' | 'delts' | 'arms' | 'core';
export type Role = 'main' | 'accessory' | 'core';
type ExStyle = 'free' | 'machine' | 'body';

export interface CatalogExercise {
  key: string;
  name: string;
  pattern: Pattern;
  style: ExStyle;
  /** Equipment that must all be there ("machines" is also met by a cable machine). */
  needs: Gear[];
  role: Role;
  /** Lowest experience that should do it: 0 new, 1 some, 2 experienced. */
  level: 0 | 1 | 2;
  /** Limitations that make the exercise a poor choice. */
  avoid: Limitation[];
  /** Library id when the watch knows (and can count) the exercise. */
  lib?: string;
  /** Default repetitions (time based or per side); otherwise the goal decides. */
  reps?: string;
  /** Muscle groups of the exercise library (the filter of the lists). */
  groups: ListGroup[];
  /** At least one of these is needed besides `needs` (unless `bodyOk`: it can be done without gear). */
  anyOf?: Gear[];
  bodyOk?: boolean;
  /** false: the plan never picks it by itself (the person can still choose it). */
  plan?: false;
}

const e = (
  key: string, name: string, pattern: Pattern, style: ExStyle, needs: Gear[], role: Role, level: 0 | 1 | 2,
  avoid: Limitation[] = [], lib?: string, reps?: string,
): CatalogExercise => ({ key, name, pattern, style, needs, role, level, avoid, groups: [], ...(lib ? { lib } : {}), ...(reps ? { reps } : {}) });

const BASE: CatalogExercise[] = [
  // legs: squat
  e('back_squat', 'Back squat', 'squat', 'free', ['barbell', 'rack'], 'main', 1, ['back'], 'squat'),
  e('goblet_squat', 'Goblet squat', 'squat', 'free', ['dumbbell'], 'main', 0, [], 'squat'),
  e('leg_press', 'Leg press', 'squat', 'machine', ['machines'], 'main', 0, [], 'leg_press'),
  e('tempo_squat', 'Tempo squat (3 s down)', 'squat', 'body', [], 'main', 0, [], 'squat'),
  // legs: hinge
  e('deadlift', 'Deadlift', 'hinge', 'free', ['barbell'], 'main', 2, ['back'], 'deadlift'),
  e('rdl_bb', 'Romanian deadlift', 'hinge', 'free', ['barbell'], 'main', 1, ['back'], 'deadlift'),
  e('rdl_db', 'Dumbbell Romanian deadlift', 'hinge', 'free', ['dumbbell'], 'main', 0, [], 'deadlift'),
  e('kb_swing', 'Kettlebell swing', 'hinge', 'free', ['kettlebell'], 'main', 1, ['back']),
  e('sl_rdl', 'Single-leg Romanian deadlift', 'hinge', 'body', [], 'main', 1),
  e('leg_curl', 'Lying leg curl', 'hinge', 'machine', ['machines'], 'accessory', 0),
  // legs: single leg
  e('bulgarian', 'Bulgarian split squat', 'lunge', 'free', ['dumbbell', 'bench'], 'main', 1, ['knee'], 'lunge'),
  e('reverse_lunge_db', 'Dumbbell reverse lunge', 'lunge', 'free', ['dumbbell'], 'main', 0, [], 'lunge'),
  e('reverse_lunge', 'Reverse lunge', 'lunge', 'body', [], 'main', 0, [], 'lunge'),
  e('step_up', 'Dumbbell step-up', 'lunge', 'free', ['dumbbell', 'bench'], 'accessory', 0, ['knee'], 'lunge'),
  e('box_step_up', 'Box step-up', 'lunge', 'body', ['box'], 'accessory', 0, ['knee'], 'lunge'),
  e('leg_ext', 'Leg extension', 'lunge', 'machine', ['machines'], 'accessory', 0, ['knee']),
  // legs: glutes and calves
  e('hip_thrust', 'Barbell hip thrust', 'glute', 'free', ['barbell', 'bench'], 'accessory', 1),
  e('hip_thrust_db', 'Dumbbell hip thrust', 'glute', 'free', ['dumbbell', 'bench'], 'accessory', 0),
  e('glute_bridge', 'Single-leg glute bridge', 'glute', 'body', [], 'accessory', 0),
  e('calf_machine', 'Standing calf raise', 'calf', 'machine', ['machines'], 'accessory', 0, [], undefined, '12–15'),
  e('calf_db', 'Single-leg calf raise (holding DB)', 'calf', 'free', ['dumbbell'], 'accessory', 0, [], undefined, '12–15'),
  e('calf_body', 'Single-leg calf raise', 'calf', 'body', [], 'accessory', 0, [], undefined, '12–15'),
  // push
  e('bench_press', 'Bench press', 'push_h', 'free', ['barbell', 'bench'], 'main', 1, ['shoulder'], 'bench_press'),
  e('db_bench', 'Dumbbell bench press', 'push_h', 'free', ['dumbbell', 'bench'], 'main', 0, [], 'bench_press'),
  e('db_floor_press', 'Dumbbell floor press', 'push_h', 'free', ['dumbbell'], 'main', 0, [], 'bench_press'),
  e('chest_press', 'Chest press machine', 'push_h', 'machine', ['machines'], 'main', 0, [], 'bench_press'),
  e('push_up', 'Push-up', 'push_h', 'body', [], 'main', 0, ['wrist'], 'pushup'),
  e('incline_db', 'Incline dumbbell press', 'push_h', 'free', ['dumbbell', 'bench'], 'accessory', 1, [], 'bench_press'),
  e('ohp', 'Overhead press', 'push_v', 'free', ['barbell'], 'main', 1, ['shoulder'], 'shoulder_press'),
  e('db_shoulder_press', 'Dumbbell shoulder press', 'push_v', 'free', ['dumbbell'], 'main', 0, ['shoulder'], 'shoulder_press'),
  e('shoulder_press_m', 'Shoulder press machine', 'push_v', 'machine', ['machines'], 'main', 0, ['shoulder'], 'shoulder_press'),
  e('pike_push_up', 'Pike push-up', 'push_v', 'body', [], 'main', 1, ['shoulder', 'wrist']),
  // pull
  e('bb_row', 'Barbell row', 'pull_h', 'free', ['barbell'], 'main', 1, ['back'], 'row'),
  e('db_row', 'One-arm dumbbell row', 'pull_h', 'free', ['dumbbell'], 'main', 0, [], 'row'),
  e('cable_row', 'Seated cable row', 'pull_h', 'machine', ['cable'], 'main', 0, [], 'row'),
  e('chest_row', 'Chest-supported row machine', 'pull_h', 'machine', ['machines'], 'main', 0, [], 'row'),
  e('inverted_row', 'Inverted row (table or bar)', 'pull_h', 'body', [], 'main', 1, [], 'row'),
  e('trx_row', 'Suspension row (TRX)', 'pull_h', 'body', ['trx'], 'main', 0, [], 'row'),
  e('pull_up', 'Pull-up', 'pull_v', 'body', ['pullup'], 'main', 1, [], 'pull_up'),
  e('lat_pulldown', 'Lat pulldown', 'pull_v', 'machine', ['machines'], 'main', 0, [], 'lat_pulldown'),
  e('assisted_pull_up', 'Assisted pull-up machine', 'pull_v', 'machine', ['machines'], 'main', 0, [], 'pull_up'),
  e('band_pulldown', 'Band pull-down', 'pull_v', 'free', ['bands'], 'accessory', 0),
  // shoulders and arms
  e('lateral_raise', 'Lateral raise', 'delts', 'free', ['dumbbell'], 'accessory', 0, ['shoulder'], undefined, '12–15'),
  e('face_pull', 'Face pull', 'delts', 'machine', ['cable'], 'accessory', 0, [], undefined, '12–15'),
  e('reverse_fly', 'Reverse fly', 'delts', 'free', ['dumbbell'], 'accessory', 0, [], undefined, '12–15'),
  e('reverse_pec_deck', 'Reverse pec deck', 'delts', 'machine', ['machines'], 'accessory', 0, [], undefined, '12–15'),
  e('ytw', 'Y-T-W raises', 'delts', 'body', [], 'accessory', 0, [], undefined, '8 each'),
  e('band_pull_apart', 'Band pull-apart', 'delts', 'free', ['bands'], 'accessory', 0, [], undefined, '15'),
  e('db_curl', 'Dumbbell curl', 'arms', 'free', ['dumbbell'], 'accessory', 0, [], 'bicep_curl', '10–12'),
  e('bb_curl', 'Barbell curl', 'arms', 'free', ['barbell'], 'accessory', 0, ['wrist'], 'bicep_curl', '10–12'),
  e('cable_curl', 'Cable curl', 'arms', 'machine', ['cable'], 'accessory', 0, [], 'bicep_curl', '10–12'),
  e('pushdown', 'Triceps pushdown', 'arms', 'machine', ['cable'], 'accessory', 0, [], 'triceps_ext', '10–12'),
  e('oh_triceps', 'Overhead triceps extension', 'arms', 'free', ['dumbbell'], 'accessory', 0, ['shoulder'], 'triceps_ext', '10–12'),
  e('dips', 'Dips', 'arms', 'body', [], 'accessory', 1, ['shoulder', 'wrist'], 'triceps_ext', '8–10'),
  // core
  e('plank', 'Plank', 'core', 'body', [], 'core', 0, [], undefined, '45 s'),
  e('side_plank', 'Side plank', 'core', 'body', [], 'core', 0, [], undefined, '30 s / side'),
  e('dead_bug', 'Dead bug', 'core', 'body', [], 'core', 0, [], undefined, '10 / side'),
  e('bird_dog', 'Bird dog', 'core', 'body', [], 'core', 0, [], undefined, '10 / side'),
  e('pallof', 'Pallof press', 'core', 'free', ['bands'], 'core', 0, [], undefined, '10 / side'),
  e('pallof_cable', 'Cable Pallof press', 'core', 'machine', ['cable'], 'core', 0, [], undefined, '10 / side'),
  e('hanging_knee', 'Hanging knee raise', 'core', 'body', ['pullup'], 'core', 1, [], undefined, '10–12'),
];

const DEFAULT_GROUP: Record<Pattern, ListGroup> = { squat: 'quads', hinge: 'hamstrings', lunge: 'quads', glute: 'glutes', calf: 'calves', push_h: 'chest', push_v: 'shoulders', pull_h: 'back', pull_v: 'back', delts: 'shoulders', arms: 'biceps', core: 'core' };
const FREE_WEIGHTS: Gear[] = ['barbell', 'dumbbell', 'kettlebell', 'ez', 'plate', 'medball', 'sandbag', 'smith', 'sled'];

/** How the person trains for the exercise: free weights, machines or the body (bands count as free, as before). */
function styleOf(gear: Gear[]): ExStyle {
  if (gear.some((g) => FREE_WEIGHTS.includes(g) || g === 'bands')) return 'free';
  if (gear.some((g) => g === 'machines' || g === 'cable')) return 'machine';
  return 'body';
}

/** Every exercise: the first ones of the website, then the library of docs/uebungen/liste.txt. */
export const CATALOG: CatalogExercise[] = [
  ...BASE.map((x) => ({ ...x, groups: GROUPS_OF_EXISTING[x.key] ?? [DEFAULT_GROUP[x.pattern]] })),
  ...LIBRARY.map((l): CatalogExercise => {
    const all = [...l.need, ...l.any];
    return {
      key: l.key, name: l.en, pattern: l.pattern, style: styleOf(all), needs: l.need as Gear[], role: l.pattern === 'core' ? 'core' : 'accessory', level: l.level,
      avoid: l.avoid, ...(l.hold ? { reps: '30 s' } : {}), groups: l.groups, ...(l.any.length ? { anyOf: l.any as Gear[], bodyOk: l.body } : {}), plan: false,
    };
  }),
];

export const catalogEntry = (key: string): CatalogExercise | undefined => CATALOG.find((x) => x.key === key);
