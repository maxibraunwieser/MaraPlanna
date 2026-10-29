// Which sessions still happen during a break. Kept apart from breaks.ts so the
// generator can use it without an import cycle.

import type { PlanBreak, PlannedWorkout, WorkoutKind } from '../types';
import { isRunWorkout } from './workouts';

const LIGHT_EXTRAS: WorkoutKind[] = ['strength_upper', 'core', 'mobility'];
const EASY_RUNS: WorkoutKind[] = ['easy', 'recovery', 'shakeout'];

/** Does a session still happen during the break? */
export function keepDuring(w: Pick<PlannedWorkout, 'kind' | 'key_session'>, b: Pick<PlanBreak, 'kind' | 'mode'>): boolean {
  if (b.mode === 'easy') return isRunWorkout(w) ? !w.key_session && EASY_RUNS.includes(w.kind) : LIGHT_EXTRAS.includes(w.kind);
  return b.kind !== 'sick' && LIGHT_EXTRAS.includes(w.kind);
}

/** A newly generated session that falls into a break and doesn't fit it. */
export const blockedByBreak = (breaks: PlanBreak[], date: string, w: Pick<PlannedWorkout, 'kind' | 'key_session'>) =>
  breaks.some((b) => date >= b.from && date <= b.to && !keepDuring(w, b));
