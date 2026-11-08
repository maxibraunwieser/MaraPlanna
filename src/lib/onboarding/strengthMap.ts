// How many strength sessions per week the person wants -> the sessions the plan engine schedules.
// The engine knows lower-body, upper-body, full-body and calisthenics sessions (ids 'lower' | 'upper' | 'full' | 'cali'); other
// extras (core, mobility, cross-training, own workouts) are kept as they are. Calisthenics is upper body and core with the body
// weight (bar and parallel bars); it is chosen as part of the weekly number ("of those, calisthenics") and is no leg day.

import type { ExtraSession } from '../types';

export type StrengthKind = 'lower' | 'upper' | 'full' | 'cali';
export const STRENGTH_KINDS: StrengthKind[] = ['lower', 'upper', 'full', 'cali'];
export const isStrengthExtra = (e: ExtraSession) => (STRENGTH_KINDS as string[]).includes(e.id) && (STRENGTH_KINDS as string[]).includes(e.type);
/** Heavy leg work (the rules about the day before the long run and hard runs apply to it). */
export const isLegKind = (k: string) => k === 'lower' || k === 'full';

/** The kinds of the sessions of one week, e.g. 2 -> lower + upper. Four or more repeat lower and upper twice. */
export function strengthKinds(perWeek: number): StrengthKind[] {
  switch (Math.max(0, Math.min(4, Math.round(perWeek)))) {
    case 0: return [];
    case 1: return ['full'];
    case 2: return ['lower', 'upper'];
    case 3: return ['lower', 'upper', 'full'];
    default: return ['lower', 'upper', 'lower', 'upper'];
  }
}

/** Calisthenics sessions per week in a list of extras. */
export const caliOf = (extras: ExtraSession[]): number => extras.filter((e) => e.id === 'cali' && e.type === 'cali').reduce((n, e) => n + e.perWeek, 0);

/** The kinds of one week when `cali` of the `perWeek` sessions are calisthenics (the rest as before). */
export function weekKinds(perWeek: number, cali = 0): StrengthKind[] {
  const n = Math.max(0, Math.min(4, Math.round(perWeek)));
  const c = Math.max(0, Math.min(n, Math.round(cali)));
  return [...strengthKinds(n - c), ...Array<StrengthKind>(c).fill('cali')];
}

/** The extra sessions that make up `perWeek` strength sessions, `cali` of them calisthenics (counts per kind). */
export function strengthExtras(perWeek: number, cali = 0): ExtraSession[] {
  const counts = new Map<StrengthKind, number>();
  for (const k of weekKinds(perWeek, cali)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return STRENGTH_KINDS.flatMap((k) => (counts.has(k) ? [{ id: k, type: k, perWeek: counts.get(k)! }] : []));
}

/** Replaces the strength sessions among `extras` by those for `perWeek` (the calisthenics share stays unless given); every other extra stays. */
export function withStrengthSessions(extras: ExtraSession[], perWeek: number, cali = caliOf(extras)): ExtraSession[] {
  return [...strengthExtras(perWeek, cali), ...extras.filter((e) => !isStrengthExtra(e))];
}

/** Strength sessions per week in a list of extras. */
export const strengthPerWeek = (extras: ExtraSession[]): number => extras.filter(isStrengthExtra).reduce((n, e) => n + e.perWeek, 0);

/** The distinct workouts of a week, in order, with how often each is done (four sessions are two workouts, each done twice). */
export function distinctWorkouts(perWeek: number | null, cali = 0): { kind: StrengthKind; times: number }[] {
  const order: StrengthKind[] = [];
  const times = new Map<StrengthKind, number>();
  for (const k of weekKinds(perWeek ?? 0, cali)) {
    if (!times.has(k)) order.push(k);
    times.set(k, (times.get(k) ?? 0) + 1);
  }
  return order.map((kind) => ({ kind, times: times.get(kind)! }));
}
