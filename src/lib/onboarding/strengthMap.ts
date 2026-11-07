// How many strength sessions per week the person wants -> the sessions the plan engine schedules.
// The engine knows lower-body, upper-body and full-body sessions (ids 'lower' | 'upper' | 'full'); other extras (core, mobility,
// cross-training, own workouts) are kept as they are.

import type { ExtraSession } from '../types';

export type StrengthKind = 'lower' | 'upper' | 'full';
export const STRENGTH_KINDS: StrengthKind[] = ['lower', 'upper', 'full'];
export const isStrengthExtra = (e: ExtraSession) => (STRENGTH_KINDS as string[]).includes(e.id) && (STRENGTH_KINDS as string[]).includes(e.type);

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

/** The extra sessions that make up `perWeek` strength sessions (counts per kind). */
export function strengthExtras(perWeek: number): ExtraSession[] {
  const counts = new Map<StrengthKind, number>();
  for (const k of strengthKinds(perWeek)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return STRENGTH_KINDS.flatMap((k) => (counts.has(k) ? [{ id: k, type: k, perWeek: counts.get(k)! }] : []));
}

/** Replaces the strength sessions among `extras` by those for `perWeek`; every other extra stays. */
export function withStrengthSessions(extras: ExtraSession[], perWeek: number): ExtraSession[] {
  return [...strengthExtras(perWeek), ...extras.filter((e) => !isStrengthExtra(e))];
}

/** Strength sessions per week in a list of extras. */
export const strengthPerWeek = (extras: ExtraSession[]): number => extras.filter(isStrengthExtra).reduce((n, e) => n + e.perWeek, 0);

/** The distinct workouts of a week, in order, with how often each is done (four sessions are two workouts, each done twice). */
export function distinctWorkouts(perWeek: number | null): { kind: StrengthKind; times: number }[] {
  const order: StrengthKind[] = [];
  const times = new Map<StrengthKind, number>();
  for (const k of strengthKinds(perWeek ?? 0)) {
    if (!times.has(k)) order.push(k);
    times.set(k, (times.get(k) ?? 0) + 1);
  }
  return order.map((kind) => ({ kind, times: times.get(kind)! }));
}
