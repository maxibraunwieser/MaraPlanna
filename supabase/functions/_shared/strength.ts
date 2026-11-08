// Strength training for the MaraPlanna watch app: the exercise library, the user's strength settings and
// the "strength" part of the watch feed. No imports of other app code, so it runs in the Edge Function
// (Deno) and in the app's tests (Node).
//
// Nothing about the person is fixed on the watch: wrist, equipment, weight unit and the exercise list
// come from the website (profiles.strength) through the feed. The library below only describes what exists.

import type { CalStep, CalWorkout } from './calendar.ts';
import { TUNED, moveOf, type Move2 } from './exerciseMoves.ts';
import { CATALOG, catalogEntry, type CatalogExercise } from './exerciseCatalog.ts';
import { exerciseName } from './content.ts';
import { LIBRARY } from './exerciseLibrary.ts';
import { available } from './exerciseAvailable.ts';
import type { ListGroup } from './exerciseListData.ts';

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/** Movement families: what a wrist sensor can tell apart. The exact exercise is resolved from the plan. */
export type Family = 'push_h' | 'push_v' | 'pull_h' | 'pull_v' | 'curl' | 'triceps' | 'squat' | 'hinge' | 'lunge' | 'pushup' | 'glute' | 'calf' | 'delts' | 'core' | 'leg_iso';

export const FAMILIES: Record<Family, { en: string; de: string }> = {
  push_h: { en: 'Horizontal press', de: 'Drücken waagerecht' },
  push_v: { en: 'Overhead press', de: 'Drücken senkrecht' },
  pull_h: { en: 'Row', de: 'Rudern' },
  pull_v: { en: 'Vertical pull', de: 'Ziehen senkrecht' },
  curl: { en: 'Curl', de: 'Curl' },
  triceps: { en: 'Triceps', de: 'Trizeps' },
  squat: { en: 'Squat', de: 'Kniebeuge' },
  hinge: { en: 'Hip hinge', de: 'Kreuzheben' },
  lunge: { en: 'Lunge', de: 'Ausfallschritt' },
  pushup: { en: 'Push-up', de: 'Liegestütz' },
  glute: { en: 'Hip thrust', de: 'Hüftheben' },
  calf: { en: 'Calf raise', de: 'Wadenheben' },
  delts: { en: 'Raise / fly', de: 'Heben / Fliegende' },
  core: { en: 'Core', de: 'Rumpf' },
  leg_iso: { en: 'Leg curl / extension', de: 'Beinbeuger / -strecker' },
};

/** How well a watch on the wrist can recognise the movement (the hand has to move on its own path). */
export type Detect = 'good' | 'medium' | 'poor';
export type Equipment = 'free' | 'machine' | 'body';

/**
 * How the watch counts: `auto` = from the movement of the wrist (the hand moves on its own path), `assist` = it tries, but the hand moves
 * little or not on its own (machines, bodyweight on the floor), so the set always has to be confirmed and starts from the plan's
 * target when nothing was counted, `time` = a hold (plank): a timer, no counting.
 */
export type CountMode = 'auto' | 'assist' | 'time';
export const COUNT_CODE: Record<CountMode, number> = { auto: 0, assist: 1, time: 2 };

export interface Exercise {
  id: string;
  en: string;
  /** Name shown on the watch (short, no special glyphs the watch font lacks). */
  de: string;
  family: Family;
  equipment: Equipment;
  detect: Detect;
  count: CountMode;
  /** Defaults for a new session. */
  sets: number;
  reps: number;
  restS: number;
  /** Part of the first version of the library (pre-selected until the user decides). */
  starter: boolean;
  /** Lower-case fragments of plan exercise names that mean this exercise (see matchExercise). */
  aliases: string[];
}

export const EXERCISES: Exercise[] = [
  { id: 'pushup', en: 'Push-up', de: 'Liegestütz', family: 'pushup', equipment: 'body', detect: 'good', count: 'auto', sets: 3, reps: 10, restS: 60, starter: true, aliases: ['push-up', 'pushup', 'push up'] },
  { id: 'bench_press', en: 'Bench press', de: 'Bankdrücken', family: 'push_h', equipment: 'free', detect: 'medium', count: 'auto', sets: 3, reps: 8, restS: 120, starter: true, aliases: ['bench press', 'floor press', 'chest press', 'dumbbell bench'] },
  { id: 'shoulder_press', en: 'Shoulder press', de: 'Schulterdrücken', family: 'push_v', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 8, restS: 90, starter: true, aliases: ['shoulder press', 'overhead press', 'military press'] },
  { id: 'row', en: 'Row', de: 'Rudern', family: 'pull_h', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 10, restS: 90, starter: true, aliases: ['row'] },
  { id: 'bicep_curl', en: 'Biceps curl', de: 'Bizepscurl', family: 'curl', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 12, restS: 60, starter: true, aliases: ['curl'] },
  { id: 'squat', en: 'Squat', de: 'Kniebeuge', family: 'squat', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 8, restS: 120, starter: true, aliases: ['squat'] },
  { id: 'deadlift', en: 'Deadlift', de: 'Kreuzheben', family: 'hinge', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 5, restS: 150, starter: true, aliases: ['deadlift', 'good morning'] },
  { id: 'lunge', en: 'Lunge', de: 'Ausfallschritt', family: 'lunge', equipment: 'free', detect: 'medium', count: 'auto', sets: 3, reps: 10, restS: 90, starter: true, aliases: ['lunge', 'split squat', 'step-up', 'step up'] },
  { id: 'pull_up', en: 'Pull-up', de: 'Klimmzug', family: 'pull_v', equipment: 'body', detect: 'good', count: 'auto', sets: 3, reps: 6, restS: 120, starter: true, aliases: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chin up'] },
  { id: 'triceps_ext', en: 'Triceps extension', de: 'Trizepsdrücken', family: 'triceps', equipment: 'free', detect: 'good', count: 'auto', sets: 3, reps: 12, restS: 60, starter: false, aliases: ['triceps', 'skull crusher', 'dip'] },
  { id: 'lat_pulldown', en: 'Lat pulldown', de: 'Latzug', family: 'pull_v', equipment: 'machine', detect: 'medium', count: 'auto', sets: 3, reps: 10, restS: 90, starter: false, aliases: ['pulldown', 'pull-down'] },
  { id: 'leg_press', en: 'Leg press', de: 'Beinpresse', family: 'squat', equipment: 'machine', detect: 'poor', count: 'assist', sets: 3, reps: 10, restS: 120, starter: false, aliases: ['leg press'] },
];

/**
 * The other exercises of the website's catalogue: a library entry each (id = catalogue key), so the plan, the watch and the
 * recognition know them. Name on the watch, family, how well the wrist can follow it and how it is counted.
 */
const MORE: { key: string; de: string; family: Family; equipment: Equipment; detect: Detect; count: CountMode; reps: number; restS: number; aliases?: string[] }[] = [
  { key: 'kb_swing', de: 'Kettlebell-Swing', family: 'hinge', equipment: 'free', detect: 'good', count: 'auto', reps: 15, restS: 60, aliases: ['swing'] },
  { key: 'sl_rdl', de: 'Einbeiniges Kreuzheben', family: 'hinge', equipment: 'body', detect: 'medium', count: 'auto', reps: 8, restS: 75 },
  { key: 'leg_curl', de: 'Beinbeuger', family: 'leg_iso', equipment: 'machine', detect: 'poor', count: 'assist', reps: 12, restS: 75, aliases: ['leg curl'] },
  { key: 'leg_ext', de: 'Beinstrecker', family: 'leg_iso', equipment: 'machine', detect: 'poor', count: 'assist', reps: 12, restS: 75, aliases: ['leg extension'] },
  { key: 'hip_thrust', de: 'Hip Thrust', family: 'glute', equipment: 'free', detect: 'medium', count: 'auto', reps: 10, restS: 90, aliases: ['hip thrust'] },
  { key: 'hip_thrust_db', de: 'Hip Thrust Kurzhantel', family: 'glute', equipment: 'free', detect: 'medium', count: 'auto', reps: 12, restS: 75 },
  { key: 'glute_bridge', de: 'Glute Bridge einbeinig', family: 'glute', equipment: 'body', detect: 'poor', count: 'assist', reps: 12, restS: 60, aliases: ['glute bridge'] },
  { key: 'calf_machine', de: 'Wadenheben Maschine', family: 'calf', equipment: 'machine', detect: 'poor', count: 'assist', reps: 15, restS: 60, aliases: ['calf raise'] },
  { key: 'calf_db', de: 'Wadenheben Hantel', family: 'calf', equipment: 'free', detect: 'poor', count: 'assist', reps: 15, restS: 60 },
  { key: 'calf_body', de: 'Wadenheben', family: 'calf', equipment: 'body', detect: 'poor', count: 'assist', reps: 15, restS: 60 },
  { key: 'pike_push_up', de: 'Pike-Liegestütz', family: 'pushup', equipment: 'body', detect: 'medium', count: 'auto', reps: 8, restS: 75 },
  { key: 'band_pulldown', de: 'Band-Latzug', family: 'pull_v', equipment: 'free', detect: 'medium', count: 'auto', reps: 12, restS: 60 },
  { key: 'lateral_raise', de: 'Seitheben', family: 'delts', equipment: 'free', detect: 'good', count: 'auto', reps: 12, restS: 60, aliases: ['lateral raise', 'side raise'] },
  { key: 'face_pull', de: 'Face Pull', family: 'delts', equipment: 'machine', detect: 'medium', count: 'auto', reps: 12, restS: 60, aliases: ['face pull'] },
  { key: 'reverse_fly', de: 'Reverse Fly', family: 'delts', equipment: 'free', detect: 'medium', count: 'auto', reps: 12, restS: 60, aliases: ['reverse fly'] },
  { key: 'reverse_pec_deck', de: 'Reverse Butterfly', family: 'delts', equipment: 'machine', detect: 'medium', count: 'auto', reps: 12, restS: 60, aliases: ['pec deck'] },
  { key: 'ytw', de: 'Y-T-W Heben', family: 'delts', equipment: 'body', detect: 'poor', count: 'assist', reps: 8, restS: 45, aliases: ['y-t-w'] },
  { key: 'band_pull_apart', de: 'Band Pull-Apart', family: 'delts', equipment: 'free', detect: 'medium', count: 'auto', reps: 15, restS: 45, aliases: ['pull-apart'] },
  { key: 'plank', de: 'Plank', family: 'core', equipment: 'body', detect: 'poor', count: 'time', reps: 45, restS: 45, aliases: ['plank', 'hollow hold'] },
  { key: 'side_plank', de: 'Seitstütz', family: 'core', equipment: 'body', detect: 'poor', count: 'time', reps: 30, restS: 45, aliases: ['side plank', 'copenhagen'] },
  { key: 'dead_bug', de: 'Dead Bug', family: 'core', equipment: 'body', detect: 'medium', count: 'auto', reps: 10, restS: 45, aliases: ['dead bug'] },
  { key: 'bird_dog', de: 'Bird Dog', family: 'core', equipment: 'body', detect: 'poor', count: 'assist', reps: 10, restS: 45, aliases: ['bird dog'] },
  { key: 'pallof', de: 'Pallof Press', family: 'core', equipment: 'free', detect: 'medium', count: 'auto', reps: 10, restS: 45, aliases: ['pallof'] },
  { key: 'pallof_cable', de: 'Pallof Press Kabel', family: 'core', equipment: 'machine', detect: 'medium', count: 'auto', reps: 10, restS: 45 },
  { key: 'hanging_knee', de: 'Beinheben hängend', family: 'core', equipment: 'body', detect: 'medium', count: 'auto', reps: 10, restS: 60, aliases: ['knee raise', 'leg raise'] },
];
for (const m of MORE) {
  EXERCISES.push({ id: m.key, en: catalogEntry(m.key)?.name ?? m.key, de: m.de, family: m.family, equipment: m.equipment, detect: m.detect, count: m.count, sets: 3, reps: m.reps, restS: m.restS, starter: false, aliases: m.aliases ?? [] });
}

// the library of docs/uebungen/liste.txt: a watch entry each (id = catalogue key)
for (const l of LIBRARY) {
  EXERCISES.push({
    id: l.key, en: l.en, de: l.de, family: l.family, equipment: l.need.concat(l.any).some((g) => g === 'machines' || g === 'cable') && !l.need.concat(l.any).some((g) => g === 'dumbbell' || g === 'barbell') ? 'machine' : l.need.length + l.any.length === 0 ? 'body' : 'free',
    detect: l.mode === 'auto' ? 'medium' : 'poor', count: l.mode, sets: 3, reps: l.hold ? 30 : 10, restS: l.hold ? 45 : 60, starter: false, aliases: [],
  });
}

/** The library entry a catalogue exercise belongs to: the one it is linked to (all squats are "squat"), else its own. */
export const libraryIdOf = (x: CatalogExercise): string => x.lib ?? x.key;

/** The catalogue exercise a plan step stands for: by key, else by its (English) name; null for a name the catalogue does not have. */
export function catalogOfStep(s: { name: string; key?: string }): CatalogExercise | null {
  if (s.key) {
    const hit = catalogEntry(s.key);
    if (hit) return hit;
  }
  const n = s.name.trim().toLowerCase();
  return CATALOG.find((x) => x.name.toLowerCase() === n) ?? null;
}

export const exerciseById = (id: string): Exercise | undefined => EXERCISES.find((e) => e.id === id);

/** Order in a session: big lifts first, small ones last. */
const FAMILY_ORDER: Family[] = ['squat', 'hinge', 'push_h', 'pull_h', 'push_v', 'pull_v', 'pushup', 'lunge', 'curl', 'triceps'];
export const sessionOrder = (ids: string[]): string[] =>
  [...ids].sort((a, b) => FAMILY_ORDER.indexOf(exerciseById(a)?.family ?? 'curl') - FAMILY_ORDER.indexOf(exerciseById(b)?.family ?? 'curl'));

/** Plan exercise name → library id (null if the library has no match). More specific aliases win. */
export function matchExercise(name: string): string | null {
  const n = name.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const e of EXERCISES) {
    for (const a of e.aliases) {
      if (n.includes(a) && (!best || a.length > best.len)) best = { id: e.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// The user's settings (profiles.strength)
// ---------------------------------------------------------------------------

/** What the user wants from strength training; shapes sets, reps and the exercises that are suggested. */
export type StrengthGoal = 'running' | 'strong' | 'muscle' | 'health';
export type LiftingLevel = 'new' | 'some' | 'experienced';
/** Equipment the user can use (the catalogue in src/lib/strengthPlan.ts says what each exercise needs). */
export type Gear = 'barbell' | 'dumbbell' | 'bench' | 'rack' | 'pullup' | 'cable' | 'machines' | 'kettlebell' | 'bands' | 'trx' | 'box' | 'ez' | 'smith' | 'parallel' | 'medball' | 'plate' | 'sandbag' | 'sled' | 'abwheel' | 'anchor' | 'table' | 'post';
/** Body parts that make some exercises a bad idea; suggestions steer around them. */
export type Limitation = 'knee' | 'back' | 'shoulder' | 'wrist';
export type TrainStyle = 'free' | 'machines' | 'mixed' | 'bodyweight';
/** What the person trains with (several can be picked); `equipment` is derived from it. */
export type TrainKind = 'free' | 'machines' | 'bodyweight';
export const TRAIN_KINDS: TrainKind[] = ['free', 'machines', 'bodyweight'];

/** The single class the planner works with: free weights and machines together are "mixed". */
export function styleOf(kinds: TrainKind[]): TrainStyle | null {
  if (!kinds.length) return null;
  const free = kinds.includes('free');
  const machines = kinds.includes('machines');
  if (free && machines) return 'mixed';
  if (free) return 'free';
  if (machines) return 'machines';
  return 'bodyweight';
}

/** Saved before several could be picked: the old single choice becomes the list ("both" = free weights and machines). */
export function kindsOf(style: TrainStyle | null): TrainKind[] {
  switch (style) {
    case 'free': return ['free'];
    case 'machines': return ['machines'];
    case 'mixed': return ['free', 'machines'];
    case 'bodyweight': return ['bodyweight'];
    default: return [];
  }
}

export const GEAR: Gear[] = ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'bands', 'trx', 'box', 'ez', 'smith', 'parallel', 'medball', 'plate', 'sandbag', 'sled', 'abwheel', 'anchor', 'table', 'post'];

/** Known lifts (estimated one-repetition maximum in kg) and the highest exercise level per movement pattern, from the questionnaire. */
export const LIFT_KEYS = ['squat', 'deadlift', 'bench', 'press', 'row'] as const;
export type LiftId = (typeof LIFT_KEYS)[number];
export type TrainStyleId = 'full' | 'split' | 'upperlower' | 'any';
export const LIMITATIONS: Limitation[] = ['knee', 'back', 'shoulder', 'wrist'];

/** One exercise of a workout: what, how many sets, which repetitions and (optionally) the working weight. */
export interface RoutineExercise {
  /** Catalogue key (src/lib/strengthPlan.ts); '' for an exercise the user typed. */
  key: string;
  name: string;
  /** Library id (see EXERCISES) when the watch knows the exercise. */
  id?: string;
  sets: number;
  /** "8", "8–10" or "45 s" */
  reps: string;
  /** Working weight in kg; null or missing = not set yet. */
  kg?: number | null;
  /** Rest between sets in seconds. */
  restS?: number;
  note?: string;
}

/** A workout the user repeats (one per kind of strength session: lower, upper or full body). */
export interface Routine {
  /** The id of the extra session it belongs to: 'lower', 'upper', 'full' or 'cali'. */
  id: string;
  /** Own name ("Strength A – Lower body & core"); missing = the default name of its kind. */
  name?: string;
  exercises: RoutineExercise[];
  /** suggested = filled by the planner's suggestion, own = picked or changed by the user. */
  by: 'suggested' | 'own';
  updatedAt: string | null;
  /** For a suggested workout: the answers it was built for, so it is rebuilt when they change. */
  basis?: string;
}

export interface StrengthPrefs {
  wrist: 'left' | 'right' | null;
  /** Several can be picked; `equipment` follows from them (see styleOf). */
  styles: TrainKind[];
  equipment: TrainStyle | null;
  /** Strength sessions per week (0 to 4, 4 = four or more); null until answered. */
  perWeek: number | null;
  /** Library ids the user does (free training on the watch, changing the exercise); kept in step with the workouts. */
  exercises: string[];
  weightUnit: 'kg' | 'lb';
  /** Close a set by itself when the watch is sure; otherwise it always asks. */
  autoConfirm: boolean;
  /** Allow raw sensor data of the sets to be stored to improve the recognition. Off until the user says yes. */
  shareData: boolean;
  /** Show the animated figure of the next exercise on the watch while resting. */
  animation: boolean;
  /** Why the user trains strength, how experienced they are, how long a session may take. */
  goal: StrengthGoal | null;
  level: LiftingLevel | null;
  minutes: number;
  gear: Gear[];
  avoid: Limitation[];
  /** Catalogue keys the person does not want, and ones they like (suggestions prefer those). */
  excluded: string[];
  favorites: string[];
  /** Estimated 1RM per lift in kg: starting weights of the suggested workouts. */
  lifts: Partial<Record<LiftId, number>>;
  /** Highest exercise level (0 beginner … 2 experienced) per movement pattern where the person is unsure; others are not capped. */
  levelCaps: Record<string, 0 | 1 | 2>;
  trainStyle: TrainStyleId | null;
  routines: Routine[];
  savedAt: string | null;
}

export const EMPTY_PREFS: StrengthPrefs = {
  wrist: null, styles: [], equipment: null, perWeek: null, exercises: [], weightUnit: 'kg', autoConfirm: true, shareData: false, animation: true,
  goal: null, level: null, minutes: 45, gear: [], avoid: [], excluded: [], favorites: [], lifts: {}, levelCaps: {}, trainStyle: null, routines: [], savedAt: null,
};

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
const listOf = <T extends string>(v: unknown, list: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => oneOf(x, list) !== null))] : []);

const keyList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]{1,40}$/.test(x)))].slice(0, 80) : []);

function liftMap(v: unknown): Partial<Record<LiftId, number>> {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Partial<Record<LiftId, number>> = {};
  for (const k of LIFT_KEYS) {
    const n = Number(r[k]);
    if (Number.isFinite(n) && n > 0 && n < 1000) out[k] = Math.round(n * 10) / 10;
  }
  return out;
}

function capMap(v: unknown): Record<string, 0 | 1 | 2> {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: Record<string, 0 | 1 | 2> = {};
  for (const [k, x] of Object.entries(r)) if (/^[a-z_]{1,12}$/.test(k) && (x === 0 || x === 1 || x === 2)) out[k] = x;
  return out;
}

function normalizeRoutine(raw: unknown): Routine | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const exercises = (Array.isArray(r.exercises) ? r.exercises : []).flatMap((e): RoutineExercise[] => {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 60) : '';
    if (!name) return [];
    const sets = Number(x.sets);
    const kg = Number(x.kg);
    const rest = Number(x.restS);
    return [{
      key: typeof x.key === 'string' ? x.key : '',
      name,
      ...(typeof x.id === 'string' && exerciseById(x.id) ? { id: x.id } : {}),
      sets: Number.isFinite(sets) ? Math.max(1, Math.min(10, Math.round(sets))) : 3,
      reps: typeof x.reps === 'string' && x.reps.trim() ? x.reps.trim().slice(0, 14) : '10',
      ...(Number.isFinite(kg) && kg > 0 ? { kg: Math.round(kg * 100) / 100 } : {}),
      ...(Number.isFinite(rest) && rest >= 10 ? { restS: Math.min(600, Math.round(rest)) } : {}),
      ...(typeof x.note === 'string' && x.note.trim() ? { note: x.note.trim().slice(0, 80) } : {}),
    }];
  });
  return {
    id: r.id,
    ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 50) } : {}),
    exercises: exercises.slice(0, 14),
    by: r.by === 'own' ? 'own' : 'suggested',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    ...(typeof r.basis === 'string' && r.by !== 'own' ? { basis: r.basis.slice(0, 200) } : {}),
  };
}

/** Accepts whatever is in the database and returns clean settings (unknown ids dropped). */
export function normalizePrefs(raw: unknown): StrengthPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = Array.isArray(r.exercises) ? r.exercises.filter((x): x is string => typeof x === 'string' && !!exerciseById(x)) : [];
  const minutes = Number(r.minutes);
  const perWeek = Number(r.perWeek);
  // Saves from before several kinds could be picked only have `equipment`: it becomes the list.
  const styles = Array.isArray(r.styles) ? listOf(r.styles, TRAIN_KINDS) : kindsOf(oneOf(r.equipment, ['free', 'machines', 'mixed', 'bodyweight'] as const));
  return {
    wrist: r.wrist === 'left' || r.wrist === 'right' ? r.wrist : null,
    styles,
    equipment: styleOf(styles),
    perWeek: r.perWeek !== null && r.perWeek !== undefined && Number.isFinite(perWeek) ? Math.max(0, Math.min(4, Math.round(perWeek))) : null,
    exercises: [...new Set(ids)],
    weightUnit: r.weightUnit === 'lb' ? 'lb' : 'kg',
    autoConfirm: r.autoConfirm !== false,
    shareData: r.shareData === true,
    animation: r.animation !== false,
    goal: oneOf(r.goal, ['running', 'strong', 'muscle', 'health'] as const),
    level: oneOf(r.level, ['new', 'some', 'experienced'] as const),
    minutes: Number.isFinite(minutes) ? Math.max(20, Math.min(120, Math.round(minutes))) : 45,
    gear: listOf(r.gear, GEAR),
    avoid: listOf(r.avoid, LIMITATIONS),
    excluded: keyList(r.excluded),
    favorites: keyList(r.favorites),
    lifts: liftMap(r.lifts),
    levelCaps: capMap(r.levelCaps),
    trainStyle: oneOf(r.trainStyle, ['full', 'split', 'upperlower', 'any'] as const),
    routines: (Array.isArray(r.routines) ? r.routines : []).flatMap((x) => normalizeRoutine(x) ?? []).slice(0, 6),
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : null,
  };
}

/** Library ids on the watch: the exercises picked for free training plus everything in the person's workouts. */
export const watchExercises = (p: StrengthPrefs): string[] => [
  ...new Set([...p.exercises, ...p.routines.flatMap((r) => r.exercises.flatMap((x) => (x.id && exerciseById(x.id) ? [x.id] : [])))]),
];

/** The watch only starts strength training once these questions are answered on the website. */
export const prefsReady = (p: StrengthPrefs): boolean => !!p.savedAt && !!p.wrist && !!p.equipment && watchExercises(p).length > 0;

// ---------------------------------------------------------------------------
// Watch feed
// ---------------------------------------------------------------------------

export interface FeedExercise {
  /** Library id ('' if the plan names an exercise the library does not have). */
  i: string;
  /** Name on the watch. */
  n: string;
  /** Family id ('' without library entry). */
  f: string;
  /** Sets and target repetitions (0 for a hold). */
  s: number;
  r: number;
  /** Weight of the last time, in the user's unit. */
  k?: number;
  /** Rest between sets in seconds. */
  rest: number;
  /** Key of its animated figure in `an` (the catalogue key: a goblet squat and a back squat look different). */
  a?: string;
  /** How it is counted: 0 from the movement, 1 the watch tries but always asks, 2 a hold with a timer. */
  m: number;
  /** Seconds to hold (only for a hold). */
  h?: number;
}

/** One strength session of the day. */
export interface FeedSession {
  id: string;
  /** Title on the watch. */
  t: string;
  /** Kind: lower, upper, full or core. */
  c: string;
  ex: FeedExercise[];
}

export interface StrengthFeed {
  /** The day the sessions are for (YYYY-MM-DD): the watch ignores a feed of another day. */
  d?: string;
  ready: boolean;
  /** Wrist: l or r. */
  w: 'l' | 'r' | null;
  /** Weight unit. */
  u: 'kg' | 'lb';
  auto: boolean;
  share: boolean;
  /** The user's own exercise list (free training, changing the exercise on the watch). */
  ex: { i: string; n: string; f: string; a?: string; m: number; h?: number }[];
  /** Today's first strength session (older watch apps read this). */
  today: { id: string; t: string; ex: FeedExercise[] } | null;
  /** All of today's strength sessions: the person picks which one on the watch. */
  sess: FeedSession[];
  /** What each exercise of the person felt like on the wrist so far (see signaturesOf), by library id. */
  sig?: Record<string, number[]>;
  /** Animated figures by animation key for the exercises above; missing when the user turned animations off. */
  an?: Record<string, Move2>;
}

export interface StrengthFeedInput {
  prefs: StrengthPrefs;
  /** Sessions of today. */
  workouts: CalWorkout[];
  /** Last weight per exercise id, in kg. */
  lastKg: Record<string, number>;
  /** Learned signatures per library id (signaturesOf). */
  sigs?: Record<string, number[]>;
  /** Today, YYYY-MM-DD. */
  date?: string;
}

const STRENGTH_KINDS = new Set(['strength_upper', 'strength_lower', 'strength_full', 'strength_cali', 'core', 'custom']);
const KIND_OF: Record<string, string> = { strength_upper: 'upper', strength_lower: 'lower', strength_full: 'full', strength_cali: 'cali', core: 'core', custom: 'custom' };
/** The most animations one feed carries (each is a few hundred bytes; the watch keeps the feed in memory). */
const MAX_ANIMATIONS = 14;
const KG_PER_LB = 0.45359237;
const TITLE_MAX = 26;
const NAME_MAX = 22;

/** Characters the watch font may not have (umlauts stay, they are in the fonts). */
const clean = (s: string) => s.replace(/[^\x20-\x7eÄÖÜäöüß]/g, '').trim();

/** First number of a rep text such as "8", "8–10" or "5 / side"; 0 if there is none or it is a time (seconds). */
export function repTarget(reps: string): number {
  if (/\bs\b|sec|min/i.test(reps)) return 0;
  const m = /\d+/.exec(reps);
  return m ? Math.min(99, parseInt(m[0], 10)) : 0;
}

/** Seconds of a hold such as "45 s", "30–45 s / side" or "2 min"; 0 if the text is not a time. */
export function holdTarget(reps: string): number {
  const m = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(s|sec|min)\b/i.exec(reps);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Math.min(600, /min/i.test(m[3]) ? n * 60 : n);
}

/** A name that fits the watch: the German name without the part in brackets, cut at the end of a word. */
export function watchName(en: string): string {
  const de = exerciseName(en, 'de').replace(/\s*\([^)]*\)/g, '').trim();
  const cleaned = clean(de);
  if (cleaned.length <= NAME_MAX) return cleaned;
  const cut = cleaned.slice(0, NAME_MAX + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 10 ? cut.slice(0, space) : cut.slice(0, NAME_MAX)).trim();
}

export const toUnit = (kg: number, unit: 'kg' | 'lb'): number => {
  const v = unit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 2) / 2;
};
export const toKg = (v: number, unit: 'kg' | 'lb'): number => Math.round((unit === 'lb' ? v * KG_PER_LB : v) * 100) / 100;

/** The figure shown for a library exercise when the plan names no catalogue exercise (free training): the typical one. */
const ANIM_OF_LIB: Record<string, string> = {};
for (const [key] of Object.entries(TUNED)) {
  const c = catalogEntry(key);
  if (c) ANIM_OF_LIB[libraryIdOf(c)] ??= key;
}
export const animKeyOfLib = (id: string): string | undefined => ANIM_OF_LIB[id] ?? (catalogEntry(id) && moveOf(id) ? id : undefined);

/** One exercise of a session the way the watch gets it. */
function feedExercise(step: Extract<CalStep, { type: 'exercise' }>, input: StrengthFeedInput): FeedExercise {
  const unit = input.prefs.weightUnit;
  const cat = catalogOfStep(step);
  const id = ('id' in step && typeof step.id === 'string' && exerciseById(step.id) ? step.id : null) ?? (cat ? libraryIdOf(cat) : null) ?? matchExercise(step.name);
  const lib = id ? exerciseById(id) : undefined;
  const planned = 'kg' in step && typeof step.kg === 'number' && step.kg > 0 ? step.kg : undefined;
  // The weight of the last time wins; the workout's own target is the start before anything was logged.
  const kg = (id ? input.lastKg[id] : undefined) ?? planned;
  const hold = lib?.count === 'time' ? holdTarget(step.reps) || lib.reps : 0;
  // The figure of the catalogue exercise; a plan name the catalogue does not have gets the typical figure of its library entry.
  const key = cat?.key ?? (lib ? animKeyOfLib(lib.id) : undefined);
  return {
    i: lib?.id ?? '',
    n: cat ? watchName(cat.name) : lib ? lib.de : clean(step.name).slice(0, NAME_MAX),
    f: lib?.family ?? '',
    s: Math.max(1, Math.min(10, step.sets || 1)),
    r: hold ? 0 : repTarget(step.reps) || lib?.reps || 0,
    ...(kg && !hold ? { k: toUnit(kg, unit) } : {}),
    rest: lib?.restS ?? 90,
    ...(key && moveOf(key) ? { a: key } : {}),
    m: lib ? COUNT_CODE[lib.count] : 1,
    ...(hold ? { h: hold } : {}),
  };
}

export function buildStrengthFeed(input: StrengthFeedInput): StrengthFeed {
  const { prefs } = input;
  const unit = prefs.weightUnit;
  const ready = prefsReady(prefs);

  // Today's sessions: every strength session that is not skipped, each with its exercises.
  const sess: FeedSession[] = input.workouts
    .filter((w) => STRENGTH_KINDS.has(w.kind) && w.status !== 'skipped' && w.steps.some((s) => s.type === 'exercise'))
    .flatMap((w) => {
      const rows = w.steps.flatMap((s: CalStep): FeedExercise[] => (s.type === 'exercise' ? [feedExercise(s, input)] : []));
      return rows.length ? [{ id: w.id, t: clean(w.title).slice(0, TITLE_MAX), c: KIND_OF[w.kind] ?? 'custom', ex: rows.slice(0, 12) }] : [];
    })
    .slice(0, 4);
  const first = sess[0];
  const today = first ? { id: first.id, t: first.t, ex: first.ex } : null;

  // The person's own list (free training and changing an exercise on the watch): today's exercises first, then the rest.
  const todays = sess.flatMap((x) => x.ex);
  const own: StrengthFeed['ex'] = sessionOrder(watchExercises(prefs)).flatMap((id) => {
    const e = exerciseById(id);
    const a = animKeyOfLib(id);
    return e ? [{ i: e.id, n: e.de, f: e.family, m: COUNT_CODE[e.count], ...(a ? { a } : {}), ...(e.count === 'time' ? { h: e.reps } : {}) }] : [];
  });
  const ex: StrengthFeed['ex'] = [...own];
  for (const t of todays) if (t.i && !ex.some((x) => x.i === t.i)) ex.push({ i: t.i, n: t.n, f: t.f, m: t.m, ...(t.a ? { a: t.a } : {}), ...(t.h ? { h: t.h } : {}) });

  const feed: StrengthFeed = {
    ...(input.date ? { d: input.date } : {}),
    ready, w: prefs.wrist === 'left' ? 'l' : prefs.wrist === 'right' ? 'r' : null, u: unit, auto: prefs.autoConfirm, share: prefs.shareData,
    ex: ex.slice(0, 24), today, sess,
  };
  // What each exercise felt like on the wrist so far: only for the exercises the watch knows today.
  if (input.sigs) {
    const sig: Record<string, number[]> = {};
    for (const x of [...todays, ...ex]) if (x.i && input.sigs[x.i] && !sig[x.i]) sig[x.i] = input.sigs[x.i];
    if (Object.keys(sig).length) feed.sig = sig;
  }
  if (prefs.animation) {
    const an: Record<string, Move2> = {};
    // the exercises of today's sessions first (their figures show while resting), then the person's other exercises
    const wanted = [...todays.flatMap((e) => (e.a ? [e.a] : [])), ...ex.flatMap((e) => (e.a ? [e.a] : []))];
    for (const key of wanted) {
      if (Object.keys(an).length >= MAX_ANIMATIONS) break;
      const m = key && !an[key] ? moveOf(key) : null;
      if (m) an[key] = m;
    }
    if (Object.keys(an).length) feed.an = an;
  }
  return feed;
}

/** The muscle groups of the library in the order of the list: the watch asks for one at a time. */
export const WATCH_GROUPS: ListGroup[] = ['chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'hipflexors', 'calisthenics', 'fullbody', 'bandfull'];

/**
 * The exercises of a muscle group that the person can do with what they train with, the way the watch gets them (free training:
 * pick one on the watch). A request per group: all exercises together would be too much for the memory of the watch.
 */
export function libraryRows(prefs: StrengthPrefs, group: string, lastKg: Record<string, number> = {}): FeedExercise[] {
  if (!WATCH_GROUPS.includes(group as ListGroup)) return [];
  const setup = { equipment: prefs.equipment, gear: prefs.gear, avoid: prefs.avoid, excluded: prefs.excluded };
  const input = { prefs, workouts: [], lastKg } as StrengthFeedInput;
  return CATALOG.filter((x) => x.groups.includes(group as ListGroup) && available(x, setup))
    .map((x) => feedExercise({ type: 'exercise', name: x.name, key: x.key, sets: 3, reps: x.reps ?? '' } as Extract<CalStep, { type: 'exercise' }>, input));
}

/** The part of the strength feed that goes with the run feed (small: the run feed is stored as one value on the watch). */
export interface StrengthLite {
  ready: boolean;
  w: 'l' | 'r' | null;
  u: 'kg' | 'lb';
  auto: boolean;
  share: boolean;
}

export const strengthLite = (prefs: StrengthPrefs): StrengthLite => ({
  ready: prefsReady(prefs), w: prefs.wrist === 'left' ? 'l' : prefs.wrist === 'right' ? 'r' : null, u: prefs.weightUnit, auto: prefs.autoConfirm, share: prefs.shareData,
});

/** The sessions of today and their figures are a separate request; the figures are the biggest part and have a size limit (a value on the watch holds 8 KB). */
export const FIGURES_MAX_BYTES = 6500;
export function capFigures(feed: StrengthFeed, maxBytes = FIGURES_MAX_BYTES): StrengthFeed {
  if (!feed.an) return feed;
  const an: Record<string, Move2> = {};
  let size = 2;
  for (const [k, m] of Object.entries(feed.an)) {
    const n = JSON.stringify(m).length + k.length + 6;
    if (size + n > maxBytes) continue;
    an[k] = m;
    size += n;
  }
  return { ...feed, an: Object.keys(an).length ? an : undefined };
}

// ---------------------------------------------------------------------------
// What an exercise feels like on the wrist (learned from the person's own confirmed sets)
// ---------------------------------------------------------------------------

/**
 * Per set the watch measures six numbers (after its six counting numbers, in `diag.g`): seconds per repetition (in tenths), the
 * size of the movement (mg), the share of the movement along gravity (%), and the direction of gravity on the wrist (three
 * numbers, 100 = level). A signature of an exercise is the median and the spread of these over the person's last confirmed sets.
 */
export const SIGNATURE_FEATURES = 6;
/** Position of the features in `diag.g` (the counting numbers come first). */
export const SIGNATURE_AT = 6;
/** Confirmed sets needed before the history says anything about an exercise. */
export const SIGNATURE_MIN = 3;
const SIGNATURE_MAX_SETS = 24;

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** [n, medians..., spreads...] per library id; exercises with fewer than SIGNATURE_MIN confirmed sets have none. */
export function signaturesOf(rows: { exercise_id: string | null; source?: string | null; wrist?: string | null; diag: unknown }[], wrist: 'left' | 'right' | null): Record<string, number[]> {
  const by = new Map<string, number[][]>();
  for (const r of rows) {
    if (!r.exercise_id || !exerciseById(r.exercise_id)) continue;
    if (wrist && r.wrist && r.wrist !== wrist) continue;
    const g = r.diag && typeof r.diag === 'object' ? (r.diag as { g?: unknown }).g : null;
    if (!Array.isArray(g) || g.length < SIGNATURE_AT + SIGNATURE_FEATURES) continue;
    const f = g.slice(SIGNATURE_AT, SIGNATURE_AT + SIGNATURE_FEATURES);
    if (!f.every((x) => typeof x === 'number' && Number.isFinite(x))) continue;
    const list = by.get(r.exercise_id) ?? [];
    if (list.length < SIGNATURE_MAX_SETS) list.push(f as number[]);
    by.set(r.exercise_id, list);
  }
  const out: Record<string, number[]> = {};
  for (const [id, list] of by) {
    if (list.length < SIGNATURE_MIN) continue;
    const med: number[] = [];
    const spread: number[] = [];
    for (let k = 0; k < SIGNATURE_FEATURES; k++) {
      const col = list.map((f) => f[k]);
      const m = median(col);
      med.push(Math.round(m));
      // median absolute deviation, scaled like a standard deviation
      spread.push(Math.round(1.4826 * median(col.map((x) => Math.abs(x - m)))));
    }
    out[id] = [list.length, ...med, ...spread];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upload from the watch (POST /watch/strength)
// ---------------------------------------------------------------------------

/** One set as the watch sends it: position in the training, library id (or '' with a name), repetitions, weight in the
 *  user's unit, confidence 0-100, source, seconds from the start of the training, duration in seconds, counter measurements. */
export interface UploadedSet {
  i: number; e?: string; n?: string; r: number; k?: number; c?: number; m?: string; t?: number; d?: number; g?: number[];
}

export interface StrengthRow {
  user_id: string;
  session_key: string;
  idx: number;
  workout_id: string | null;
  local_date: string;
  started_at: string;
  duration_s: number | null;
  exercise_id: string | null;
  exercise_name: string | null;
  reps: number;
  weight_kg: number | null;
  source: 'plan' | 'pick' | 'auto';
  confidence: number | null;
  wrist: 'left' | 'right' | null;
  diag: Record<string, unknown> | null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Rows for the table from the body the watch posts; anything unusable is dropped. Weights come in the user's unit. */
export function strengthRows(userId: string, body: Record<string, unknown>, wrist: 'left' | 'right' | null): { rows: StrengthRow[] } | { error: string } {
  const started = Number(body.started);
  const sets = Array.isArray(body.sets) ? (body.sets as UploadedSet[]).slice(0, 200) : [];
  if (!Number.isFinite(started) || started <= 0 || !sets.length) return { error: 'No sets to save.' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? '')) ? String(body.date) : new Date(started * 1000).toISOString().slice(0, 10);
  const unit = body.unit === 'lb' ? 'lb' : 'kg';
  const workoutId = typeof body.workout === 'string' && /^[0-9a-f-]{36}$/.test(body.workout) ? body.workout : null;
  const session = body.diag && typeof body.diag === 'object' ? (body.diag as Record<string, unknown>) : null;
  const rows = sets.flatMap((s): StrengthRow[] => {
    if (!isNum(s.i) || !isNum(s.r)) return [];
    const id = typeof s.e === 'string' && exerciseById(s.e) ? s.e : null;
    const g = Array.isArray(s.g) ? s.g.filter(isNum).slice(0, 16) : null;
    const diag = { ...(g ? { g } : {}), ...(Math.round(s.i) === 0 && session ? { s: session } : {}) };
    return [{
      user_id: userId,
      session_key: String(Math.round(started)),
      idx: Math.round(s.i),
      workout_id: workoutId,
      local_date: date,
      started_at: new Date((started + (isNum(s.t) ? s.t : 0)) * 1000).toISOString(),
      duration_s: isNum(s.d) ? Math.round(s.d) : null,
      exercise_id: id,
      exercise_name: id ? null : String(s.n ?? '').slice(0, 40) || null,
      reps: Math.max(0, Math.min(999, Math.round(s.r))),
      weight_kg: isNum(s.k) && s.k > 0 ? toKg(s.k, unit) : null,
      source: s.m === 'pick' || s.m === 'auto' ? s.m : 'plan',
      confidence: isNum(s.c) ? Math.max(0, Math.min(100, Math.round(s.c))) : null,
      wrist,
      diag: Object.keys(diag).length ? diag : null,
    }];
  });
  return rows.length ? { rows } : { error: 'No valid sets.' };
}
