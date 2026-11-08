// What an exercise trains, and what to show first when the person looks for an exercise: the muscles of their workout.

import { tr, type MsgKey } from './i18n';
import { MUSCLES_OF_PATTERN, MUSCLES_OWN } from '../../supabase/functions/_shared/figureMuscles';
import type { ListGroup } from '../../supabase/functions/_shared/exerciseListData';
import type { Gear } from '../../supabase/functions/_shared/strength';
import { exName } from './strengthFormat';
import { CATALOG, available, catalogEntry, type CatalogExercise, type Setup } from './strengthPlan';

export type Muscle = 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'core';
export const MUSCLES: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core'];

/** Label in the language of the page (read when shown). */
export const muscleLabel = (m: Muscle): string => tr(`sg.muscle.${m}` as MsgKey);

const OF_PATTERN = MUSCLES_OF_PATTERN;
const OWN = MUSCLES_OWN;

export const musclesOfExercise = (x: Pick<CatalogExercise, 'key' | 'pattern'>): Muscle[] => OWN[x.key] ?? OF_PATTERN[x.pattern];
export const musclesOf = (key: string): Muscle[] => {
  const x = catalogEntry(key);
  return x ? musclesOfExercise(x) : [];
};
export const primaryMuscle = (x: Pick<CatalogExercise, 'key' | 'pattern'>): Muscle => musclesOfExercise(x)[0];

export interface Library {
  /** The exercises that train the same muscles as the workout (or the exercise being swapped), the most fitting first. */
  same: CatalogExercise[];
  /** Everything else the person can do, by muscle. */
  others: { muscle: Muscle; items: CatalogExercise[] }[];
}

/**
 * All the exercises the person can do with what they train with (place, machines, equipment, what needs care, what they left
 * out), the ones for the muscles in `focus` first.
 */
/** The muscle groups of the library in the order of the list. */
export const LIST_GROUPS: ListGroup[] = ['chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'hipflexors', 'calisthenics', 'fullbody', 'bandfull'];

/** The gear an exercise can be done with (what it needs and the alternatives). */
export const gearsOf = (x: Pick<CatalogExercise, 'needs' | 'anyOf'>): Gear[] => [...x.needs, ...(x.anyOf ?? [])];

/** An exercise that needs no gear (or can be done without). */
export const needsNoGear = (x: Pick<CatalogExercise, 'needs' | 'anyOf' | 'bodyOk'>): boolean => x.needs.length === 0 && (!x.anyOf?.length || !!x.bodyOk);

export function library(setup: Setup, opts: { taken?: string[]; focus: Muscle[]; query?: string; muscle?: Muscle | null; group?: ListGroup | null; gear?: Gear | 'none' | null }): Library {
  const q = (opts.query ?? '').trim().toLowerCase();
  const taken = opts.taken ?? [];
  const list = CATALOG.filter((x) => !taken.includes(x.key) && available(x, setup))
    .filter((x) => !opts.muscle || musclesOfExercise(x).includes(opts.muscle))
    .filter((x) => !opts.group || x.groups.includes(opts.group))
    .filter((x) => !opts.gear || (opts.gear === 'none' ? needsNoGear(x) : gearsOf(x).includes(opts.gear)))
    // Found by its name in either language, the movement or a muscle it trains.
    .filter((x) => !q || `${x.name} ${exName(x.name)} ${tr(`sg.pattern.${x.pattern}` as MsgKey)} ${musclesOfExercise(x).map(muscleLabel).join(' ')}`.toLowerCase().includes(q));
  const role = (x: CatalogExercise) => (x.role === 'main' ? 0 : x.role === 'accessory' ? 1 : 2);
  const rank = (x: CatalogExercise) => opts.focus.indexOf(primaryMuscle(x));
  const same = list
    .filter((x) => opts.focus.includes(primaryMuscle(x)))
    .sort((a, b) => rank(a) - rank(b) || role(a) - role(b) || a.level - b.level);
  const rest = list.filter((x) => !opts.focus.includes(primaryMuscle(x)));
  const others = MUSCLES.map((muscle) => ({ muscle, items: rest.filter((x) => primaryMuscle(x) === muscle).sort((a, b) => role(a) - role(b) || a.level - b.level) })).filter((g) => g.items.length);
  return { same, others };
}

/** The exercise a plan step or a routine entry stands for (by key, else by its English name). */
export const catalogOf = (x: { key?: string; name: string }): CatalogExercise | undefined => (x.key ? catalogEntry(x.key) : undefined) ?? CATALOG.find((c) => c.name.toLowerCase() === x.name.toLowerCase());

export type MuscleLoad = 'primary' | 'secondary';

/**
 * What a workout trains: each exercise counts fully for its main muscle and half for the others, weighted by its sets. The
 * muscles with at least 60 % of the most-trained one are the main ones of the workout, the rest are worked as well.
 */
export function workoutMuscles(exercises: { key?: string; name: string; sets?: number }[]): Partial<Record<Muscle, MuscleLoad>> {
  const score = new Map<Muscle, number>();
  for (const x of exercises) {
    const c = catalogOf(x);
    if (!c) continue;
    const sets = Math.max(1, x.sets ?? 3);
    musclesOfExercise(c).forEach((m, i) => score.set(m, (score.get(m) ?? 0) + sets * (i === 0 ? 1 : 0.5)));
  }
  const top = Math.max(0, ...score.values());
  const out: Partial<Record<Muscle, MuscleLoad>> = {};
  for (const m of MUSCLES) {
    const v = score.get(m) ?? 0;
    if (v > 0) out[m] = v >= top * 0.6 ? 'primary' : 'secondary';
  }
  return out;
}
