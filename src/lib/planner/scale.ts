// Making a planned running session shorter or longer (used when the coach's proposal is applied).
// Warm-up, cool-down and strides stay as they are; the main set changes: reps of interval,
// threshold and fartlek sessions, the distance of everything else.

import type { Paces, Step, WorkoutKind } from '../types';
import { sessionTitle } from './generate';
import { round05, workoutKm, workoutMinutes } from './workouts';

type RunStep = Extract<Step, { type: 'run' }>;

const FIXED = /warm|cool|stride/i;
const REP_KINDS = new Set<WorkoutKind>(['threshold', 'intervals', 'fartlek']);

export interface Scaled {
  steps: Step[];
  title: string;
  distance_km: number;
  duration_min: number;
}

/** Null when the factor would not change anything noticeable (less than 0.4 km). */
export function scaleWorkout(w: { kind: WorkoutKind; title: string; steps: Step[]; distance_km: number | null }, factor: number, paces: Paces): Scaled | null {
  const f = Math.min(1.5, Math.max(0.3, factor));
  const steps = w.steps.map((s) => ({ ...s })) as Step[];
  const main = steps.filter((s): s is RunStep => s.type === 'run' && !FIXED.test(s.label));
  if (!main.length) return null;

  for (const s of main) {
    const reps = s.repeat ?? 1;
    if (REP_KINDS.has(w.kind) && reps > 1) {
      let next = Math.round(reps * f);
      // A small cut should still take one rep away (and a small increase add one).
      if (next === reps && f <= 0.85) next = reps - 1;
      if (next === reps && f >= 1.15) next = reps + 1;
      s.repeat = Math.max(2, Math.min(next, reps + 3));
    } else if (s.distanceKm) {
      s.distanceKm = Math.max(1, round05(s.distanceKm * f));
    } else if (s.durationMin) {
      s.durationMin = Math.max(5, Math.round(s.durationMin * f));
    }
  }

  const distance = round05(workoutKm(steps, paces));
  const before = w.distance_km ?? round05(workoutKm(w.steps, paces));
  if (Math.abs(distance - before) < 0.4) return null;

  let title = w.title;
  if (REP_KINDS.has(w.kind) || w.kind === 'marathon_pace') title = sessionTitle(w.kind, steps);
  else if (w.kind === 'long_mp') {
    const mp = steps.find((s): s is RunStep => s.type === 'run' && s.zone === 'marathon');
    if (mp?.distanceKm) title = `Long run with ${mp.distanceKm} km @ marathon pace`;
  }
  return { steps, title, distance_km: distance, duration_min: Math.round(workoutMinutes(steps, paces)) };
}
