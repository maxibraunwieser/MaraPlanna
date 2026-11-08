// The gym side of the planner: an exercise catalogue, workout suggestions that respect the person's goal, level,
// equipment and limitations, and the conversion of a workout ("routine") into plan steps.
//
// The suggestion is rule based (no network, same answer for the same input, fully testable). It is what the "Suggest for me"
// buttons run; the person can change every exercise, set, repetition and weight afterwards.

import { GEAR, LIMITATIONS, exerciseById, type LiftId, type Gear, type LiftingLevel, type Limitation, type Routine, type RoutineExercise, type StrengthGoal, type StrengthPrefs, type TrainKind, type TrainStyle } from '../../supabase/functions/_shared/strength';
import type { Equipment, PlannedWorkout, Step, WeekSummary } from './types';
import { tr, type MsgKey } from './i18n';

export { CATALOG, catalogEntry, type CatalogExercise, type Pattern, type Role } from '../../supabase/functions/_shared/exerciseCatalog';
import { CATALOG, catalogEntry, type CatalogExercise, type Pattern } from '../../supabase/functions/_shared/exerciseCatalog';

/** Label tables read the language of the page when a label is shown, so every call site follows the language switch. */
function live<K extends string>(keys: readonly K[], prefix: string): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(out, k, { enumerable: true, get: () => tr(`${prefix}.${k}` as MsgKey) });
  return out;
}

/** Options with a label and a hint in the language of the page. */
function choices<V extends string>(values: readonly V[], prefix: string): { value: V; readonly label: string; readonly hint: string }[] {
  return values.map((value) => ({
    value,
    get label() {
      return tr(`${prefix}.${value}` as MsgKey);
    },
    get hint() {
      return tr(`${prefix}.${value}.hint` as MsgKey);
    },
  }));
}

export const PATTERN_LABEL = live<Pattern>(['squat', 'hinge', 'lunge', 'glute', 'calf', 'push_h', 'push_v', 'pull_h', 'pull_v', 'delts', 'arms', 'core'], 'sg.pattern');

export type StrengthType = 'lower' | 'upper' | 'full' | 'cali';
export const STRENGTH_TYPES: StrengthType[] = ['lower', 'upper', 'full', 'cali'];
export const TYPE_LABEL = live<StrengthType>(STRENGTH_TYPES, 'sg.type');
export const isStrengthType = (id: string): id is StrengthType => id === 'lower' || id === 'upper' || id === 'full' || id === 'cali';

/** Goal and level wording shown in the questionnaire. */
export const GOALS = choices<StrengthGoal>(['running', 'strong', 'muscle', 'health'], 'sg.goal');
export const LEVELS = choices<LiftingLevel>(['new', 'some', 'experienced'], 'sg.level');
/** What the person trains with; several can be picked. */
export const KINDS = choices<TrainKind>(['free', 'machines', 'bodyweight'], 'sg.kind');
export const GEAR_LABEL = live<Gear>(GEAR, 'sg.gear');
export const LIMITATION_LABEL = live<Limitation>(LIMITATIONS, 'sg.limit');

/** Gear a typical place has, preselected after the person picked how they train. */
export function defaultGear(style: TrainStyle): Gear[] {
  switch (style) {
    case 'free': return ['barbell', 'dumbbell', 'bench', 'rack', 'pullup'];
    case 'machines': return ['machines', 'cable', 'dumbbell', 'bench'];
    case 'mixed': return ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines'];
    case 'bodyweight': return ['bands'];
  }
}

/** Equipment that usually belongs to where the person trains (what they tick in the questionnaire is the starting point). */
export function gearOfLocations(locations: ('gym' | 'homeGym' | 'bodyweight' | 'outdoor')[]): Gear[] {
  const out = new Set<Gear>();
  if (locations.includes('gym')) for (const g of ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'ez', 'smith', 'parallel', 'plate', 'medball', 'abwheel'] as Gear[]) out.add(g);
  if (locations.includes('homeGym')) for (const g of ['dumbbell', 'bench', 'kettlebell', 'bands'] as Gear[]) out.add(g);
  if (locations.includes('outdoor')) for (const g of ['pullup', 'bands', 'parallel', 'post'] as Gear[]) out.add(g);
  if (locations.includes('bodyweight') && out.size === 0) out.add('bands');
  return GEAR.filter((g) => out.has(g));
}

/** Equipment class for the plan's other sessions (core, plyometrics) and its default exercise pools. */
export function deriveEquipment(prefs: Pick<StrengthPrefs, 'equipment' | 'gear'>): Equipment {
  if (prefs.equipment === 'bodyweight') return 'bodyweight';
  if (prefs.gear.some((g) => g === 'barbell' || g === 'machines' || g === 'cable')) return 'gym';
  return prefs.gear.includes('dumbbell') ? 'dumbbells' : 'bodyweight';
}

// ---------------------------------------------------------------------------
// What can be suggested
// ---------------------------------------------------------------------------

export interface Setup {
  equipment: TrainStyle | null;
  gear: Gear[];
  avoid: Limitation[];
  goal: StrengthGoal | null;
  level: LiftingLevel | null;
  minutes: number;
  /** Catalogue keys to leave out / to prefer. */
  excluded?: string[];
  favorites?: string[];
  /** Estimated 1RM per lift (kg): gives the barbell exercises a starting weight. */
  lifts?: Partial<Record<LiftId, number>>;
  /** Highest level per movement pattern (where the person is unsure about the basics). */
  levelCaps?: Record<string, 0 | 1 | 2>;
}

/** What a suggestion is made from, out of the person's strength settings. */
export const setupOf = (p: StrengthPrefs): Setup => ({
  equipment: p.equipment, gear: p.gear, avoid: p.avoid, goal: p.goal, level: p.level, minutes: p.minutes,
  excluded: p.excluded, favorites: p.favorites, lifts: p.lifts, levelCaps: p.levelCaps,
});

const LEVEL_INDEX: Record<LiftingLevel, number> = { new: 0, some: 1, experienced: 2 };

/** The answers a suggestion depends on, as text: compare two to see whether a suggested workout is out of date. */
export const setupSignature = (s: Setup): string =>
  JSON.stringify([s.equipment, [...s.gear].sort(), [...s.avoid].sort(), s.goal, s.level, s.minutes, [...(s.excluded ?? [])].sort(), [...(s.favorites ?? [])].sort(), s.lifts ?? {}, s.levelCaps ?? {}]);

import { available, hasGear } from '../../supabase/functions/_shared/exerciseAvailable';

export { available, hasGear };

const SLOTS: Record<StrengthType, Pattern[]> = {
  lower: ['squat', 'hinge', 'lunge', 'glute', 'calf', 'core'],
  upper: ['push_h', 'pull_h', 'push_v', 'pull_v', 'delts', 'core', 'arms'],
  full: ['squat', 'push_h', 'hinge', 'pull_h', 'push_v', 'core'],
  cali: ['pull_v', 'push_h', 'pull_h', 'push_v', 'core', 'core'],
};

/**
 * Calisthenics: upper body and core with the body weight, at a bar and parallel bars (a calisthenics park). Each slot lists its
 * exercises from easy to hard; the person's level picks the start, an excluded exercise or one that does not suit a limitation
 * (shoulder, wrist) falls back to the next easier one. The skill comes first, while the person is fresh.
 */
const CALI_SLOTS: { slot: string; keys: [string, string, string]; alt?: string[] }[] = [
  { slot: 'skill', keys: ['dead_hang', 'l_sit', 'front_lever_progressionen'], alt: ['hollow_hold'] },
  { slot: 'pull_v', keys: ['klimmzuege_einarmig_oder_mit_hilfe', 'pull_up', 'muscle_ups'], alt: ['klimmzuege_untergriff'] },
  { slot: 'dips', keys: ['push_up', 'dips_am_barren_brustbetont', 'dips_am_barren_brustbetont'], alt: ['diamond_push_ups'] },
  { slot: 'pull_h', keys: ['australian_pull_ups', 'inverted_row', 'inverted_row'] },
  { slot: 'push_h', keys: ['push_up', 'diamond_push_ups', 'archer_push_ups'], alt: ['push_up'] },
  { slot: 'push_v', keys: ['pike_push_up', 'pike_push_up', 'handstand_push_ups_an_der_wand'], alt: ['ytw'] },
  { slot: 'core', keys: ['hollow_hold', 'haengendes_beinheben', 'l_sit'], alt: ['plank'] },
];
/** The gear of a calisthenics park; a calisthenics workout always counts on a bar and parallel bars. */
const CALI_GEAR: Gear[] = ['pullup', 'parallel', 'table', 'post'];

/** A calisthenics workout for the person's level, time, limitations and exclusions. */
function suggestCali(setup: Setup, now: string | null): Routine {
  const lv = LEVEL_INDEX[setup.level ?? 'new'];
  const ok = (key: string, taken: Set<string>) => {
    const x = catalogEntry(key);
    return !!x && !taken.has(key) && !setup.excluded?.includes(key) && !x.avoid.some((a) => setup.avoid.includes(a));
  };
  const taken = new Set<string>();
  const out: RoutineExercise[] = [];
  // As many exercises (three sets each) as fit into the session length, at least three.
  const fits = () => out.length < 3 || Math.round(5 + (out.length + 1) * 3 * 2.5) <= setup.minutes;
  for (const { keys, alt } of CALI_SLOTS) {
    if (!fits()) break;
    const order = [...keys.slice(0, lv + 1).reverse(), ...(alt ?? [])];
    const key = order.find((k) => ok(k, taken));
    if (!key) continue;
    taken.add(key);
    const x = catalogEntry(key)!;
    const hold = / s$/.test(x.reps ?? '');
    const rx = hold
      ? { sets: 3, reps: lv === 0 ? '15–20 s' : lv === 1 ? '20–30 s' : '30–45 s' }
      : x.pattern === 'core'
        ? { sets: 3, reps: x.reps ?? '8–12' }
        : { sets: 3, reps: lv === 0 ? '5–8' : lv === 1 ? '6–10' : '8–12' };
    out.push({ key: x.key, name: x.name, ...(x.lib ? { id: x.lib } : {}), ...rx, kg: null });
  }
  return { id: 'cali', exercises: out, by: 'suggested', updatedAt: now, basis: setupSignature(setup) };
}

function slotsFor(type: StrengthType, goal: StrengthGoal | null): Pattern[] {
  const base = [...SLOTS[type]];
  if (type === 'lower' && goal === 'running') {
    // calves and single-leg strength matter most for running
    base.splice(3, 2, 'calf', 'glute');
  }
  if (type === 'upper' && (goal === 'muscle' || goal === 'strong')) {
    base.splice(0, base.length, 'push_h', 'pull_h', 'push_v', 'pull_v', 'arms', 'delts', 'core');
  }
  return base;
}

/** How many exercises fit into the session length (about 8–9 minutes each with warm-up sets and rest). */
export function exerciseCount(minutes: number, slots: number): number {
  return Math.max(3, Math.min(slots, Math.round(minutes / 8.5)));
}

/** Sets and repetitions for an exercise: the goal sets the style, the level softens it. */
export function prescribe(x: CatalogExercise, goal: StrengthGoal | null, level: LiftingLevel | null): { sets: number; reps: string } {
  const g = goal ?? 'health';
  const lv = LEVEL_INDEX[level ?? 'new'];
  if (x.role === 'core') return { sets: g === 'health' ? 2 : 3, reps: x.reps ?? '30–45 s' };
  if (x.role === 'accessory') {
    const reps = x.reps ?? (g === 'muscle' ? '10–12' : g === 'health' ? '12–15' : '8–10');
    return { sets: g === 'health' || lv === 0 ? 2 : 3, reps };
  }
  switch (g) {
    case 'running': return lv === 0 ? { sets: 3, reps: '8–10' } : { sets: lv === 1 ? 3 : 4, reps: '4–6' };
    case 'strong': return lv === 0 ? { sets: 3, reps: '8' } : { sets: lv === 1 ? 4 : 5, reps: '5' };
    case 'muscle': return lv === 0 ? { sets: 3, reps: '10' } : { sets: 4, reps: lv === 1 ? '8–10' : '8–12' };
    case 'health': return lv === 0 ? { sets: 2, reps: '12' } : { sets: 3, reps: '10' };
  }
}

/** Which known lift gives a barbell exercise its starting weight, and how much of it (a Romanian deadlift is lighter than a deadlift). */
const LIFT_OF: Record<string, [LiftId, number]> = {
  back_squat: ['squat', 1], deadlift: ['deadlift', 1], rdl_bb: ['deadlift', 0.7], bench_press: ['bench', 1], ohp: ['press', 1], bb_row: ['row', 1],
};

/** A working weight for the sets: the estimated 1RM at the repetitions of the first set, a little below (rounded to 2.5 kg). */
export function startingWeight(x: CatalogExercise, reps: string, lifts: Partial<Record<LiftId, number>> | undefined): number | null {
  const link = LIFT_OF[x.key];
  const e1rm = link ? lifts?.[link[0]] : undefined;
  const top = reps.match(/\d+/g);
  if (!link || !e1rm || !top) return null;
  const n = parseInt(top[0], 10);
  const kg = (e1rm * link[1] / (1 + n / 30)) * 0.9;
  return kg >= 5 ? Math.round(kg / 2.5) * 2.5 : null;
}

function toRoutineExercise(x: CatalogExercise, goal: StrengthGoal | null, level: LiftingLevel | null, lifts?: Partial<Record<LiftId, number>>): RoutineExercise {
  const rx = prescribe(x, goal, level);
  return { key: x.key, name: x.name, ...(x.lib ? { id: x.lib } : {}), ...rx, kg: startingWeight(x, rx.reps, lifts) };
}

/** Best exercise for a movement pattern for this person; null when nothing fits. */
function pick(pattern: Pattern, setup: Setup, taken: Set<string>): CatalogExercise | null {
  const lv = LEVEL_INDEX[setup.level ?? 'new'];
  const cap = setup.levelCaps?.[pattern];
  // the plan picks only the proven core exercises; the rest of the library is for choosing by hand
  const fits = (x: CatalogExercise, top: number) => x.plan !== false && x.pattern === pattern && !taken.has(x.key) && x.level <= top && available(x, setup);
  // A pattern the person is unsure about stays with the easier versions (unless nothing easy is available).
  let list = CATALOG.filter((x) => fits(x, cap === undefined ? lv : Math.min(lv, cap)));
  if (!list.length) list = CATALOG.filter((x) => fits(x, lv));
  if (!list.length) return null;
  // Main lifts first, the one closest to the person's level; accessory versions only where no main lift fits the slot.
  const score = (x: CatalogExercise) => (x.role === 'main' ? 4 : 0) - Math.abs(x.level - lv) * (x.role === 'main' ? 1 : 0.5) + (x.lib ? 2 : 0) + (setup.favorites?.includes(x.key) ? 5 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0];
}

/** A workout for one kind of session, built from the person's goal, level, equipment, limitations and time. */
export function suggestRoutine(type: StrengthType, setup: Setup, now: string | null = null): Routine {
  if (type === 'cali') return suggestCali({ ...setup, gear: [...new Set([...setup.gear, ...CALI_GEAR])] }, now);
  const slots = slotsFor(type, setup.goal);
  const want = exerciseCount(setup.minutes, slots.length);
  const taken = new Set<string>();
  const out: RoutineExercise[] = [];
  for (const pattern of slots) {
    if (out.length >= want) break;
    const x = pick(pattern, setup, taken);
    if (!x) continue;
    taken.add(x.key);
    out.push(toRoutineExercise(x, setup.goal, setup.level, setup.lifts));
  }
  // Always give the person something to do, even with very little equipment.
  if (out.length < 3) {
    const fallback: Setup = { ...setup, equipment: 'bodyweight', gear: [] };
    for (const pattern of slots) {
      if (out.length >= 3) break;
      const x = pick(pattern, fallback, taken);
      if (x) {
        taken.add(x.key);
        out.push(toRoutineExercise(x, setup.goal, setup.level, setup.lifts));
      }
    }
  }
  return { id: type, exercises: out, by: 'suggested', updatedAt: now, basis: setupSignature(setup) };
}

/** Suggestions for several kinds at once, keeping what the person already wrote themselves. */
export function suggestAll(types: StrengthType[], setup: Setup, existing: Routine[] = [], now: string | null = null): Routine[] {
  return types.map((t) => {
    const mine = existing.find((r) => r.id === t);
    return mine && mine.by === 'own' && mine.exercises.length ? mine : suggestRoutine(t, setup, now);
  });
}

/** Other exercises that do the same job (same movement pattern) and fit the person. */
export function alternatives(current: RoutineExercise, setup: Setup): CatalogExercise[] {
  const x = catalogEntry(current.key);
  if (!x) return [];
  const lv = LEVEL_INDEX[setup.level ?? 'new'];
  return CATALOG.filter((o) => o.pattern === x.pattern && o.key !== x.key && o.level <= lv + 1 && available(o, setup));
}

/** Exercises to pick from when adding one: everything the person can do, grouped by pattern by the caller. */
export function pickable(setup: Setup, taken: string[]): CatalogExercise[] {
  return CATALOG.filter((x) => !taken.includes(x.key) && available(x, setup));
}

export const fromCatalog = (x: CatalogExercise, setup: Pick<Setup, 'goal' | 'level'> & Partial<Pick<Setup, 'lifts'>>): RoutineExercise => toRoutineExercise(x, setup.goal, setup.level, setup.lifts);

/** An exercise the person typed: matched to the catalogue (and the watch library) by name where possible. */
export function customExercise(name: string): RoutineExercise {
  const typed = name.trim().slice(0, 60);
  const clean = typed.charAt(0).toUpperCase() + typed.slice(1);
  const hit = CATALOG.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  return hit ? { key: hit.key, name: hit.name, ...(hit.lib ? { id: hit.lib } : {}), sets: 3, reps: hit.reps ?? '10', kg: null } : { key: '', name: clean, sets: 3, reps: '10', kg: null };
}

// ---------------------------------------------------------------------------
// Routine -> plan
// ---------------------------------------------------------------------------

/** Steps of a session in the plan. In recovery and taper weeks one set less ("deload"). */
export function routineSteps(r: Routine, deload = false): Step[] {
  return r.exercises.map((x): Step => ({
    type: 'exercise',
    name: x.name,
    sets: deload ? Math.max(2, x.sets - 1) : x.sets,
    reps: x.reps,
    ...(x.id && exerciseById(x.id) ? { id: x.id } : {}),
    ...(x.key ? { key: x.key } : {}),
    ...(x.kg && x.kg > 0 ? { kg: x.kg } : {}),
    ...(x.restS ? { restS: x.restS } : {}),
    ...(x.note || deload ? { note: [x.note, deload ? 'lighter week: one set less' : ''].filter(Boolean).join(' · ') } : {}),
  }));
}

/** Rest between sets: the person's own, else the library's, else by the kind of exercise. */
export function restOf(x: RoutineExercise): number {
  if (x.restS) return x.restS;
  const lib = x.id ? exerciseById(x.id) : undefined;
  if (lib) return lib.restS;
  const role = catalogEntry(x.key)?.role;
  return role === 'core' ? 45 : role === 'accessory' ? 75 : 90;
}

/** Minutes of a session: warm-up plus about two and a half minutes per set (including the rest). */
export function routineMinutes(r: Routine, deload = false): number {
  const sets = r.exercises.reduce((n, x) => n + (deload ? Math.max(2, x.sets - 1) : x.sets), 0);
  return Math.round(5 + sets * 2.5);
}

export const routineKind = (id: string): PlannedWorkout['kind'] | null => (isStrengthType(id) ? (`strength_${id}` as PlannedWorkout['kind']) : null);

/** Library ids of the exercises in the workouts (the watch's list for free training). */
export function libraryIds(routines: Routine[]): string[] {
  return [...new Set(routines.flatMap((r) => r.exercises.flatMap((x) => (x.id && exerciseById(x.id) ? [x.id] : []))))];
}

/**
 * New steps for the sessions of the plan that have not happened yet, after the person changed a workout. Sessions that
 * are done, skipped or missed stay as they were.
 */
export function routinePatches(
  workouts: PlannedWorkout[],
  routines: Routine[],
  weeks: WeekSummary[],
  today: string,
): { id: string; steps: Step[]; duration_min: number }[] {
  const out: { id: string; steps: Step[]; duration_min: number }[] = [];
  for (const w of workouts) {
    if (w.status !== 'planned' || w.date < today) continue;
    const id = w.kind.startsWith('strength_') ? w.kind.slice('strength_'.length) : null;
    const routine = id ? routines.find((r) => r.id === id) : undefined;
    if (!routine || !routine.exercises.length) continue;
    const deload = weeks.find((x) => x.week === w.week)?.recovery === true || w.phase === 'taper';
    const steps = routineSteps(routine, deload);
    if (JSON.stringify(steps) !== JSON.stringify(w.steps)) out.push({ id: w.id, steps, duration_min: routineMinutes(routine, deload) });
  }
  return out;
}
