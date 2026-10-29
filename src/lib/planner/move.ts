// Moving workouts by hand: what can move, where to, the patches it takes and
// what to warn about.

import type { PlannedWorkout } from '../types';
import { isRunWorkout, type WorkoutPatch } from './adapt';
import { addDays, maxDate, minDate } from './dates';

/** Anything not done yet can move – also missed and skipped sessions – except the race. */
export const canMove = (w: PlannedWorkout) => w.kind !== 'race' && (w.status === 'planned' || w.status === 'missed' || w.status === 'skipped');

/** Days a workout may move to: today up to the day before the race. */
export const moveBounds = (today: string, raceDate: string) => ({ min: today, max: addDays(raceDate, -1) });

export const inBounds = (date: string, b: { min: string; max: string }) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= b.min && date <= b.max;

/** A week of target days around the workout's date (never in the past). */
export function moveDays(w: PlannedWorkout, today: string, raceDate: string): string[] {
  const b = moveBounds(today, raceDate);
  const start = minDate(maxDate(addDays(w.date, -3), b.min), maxDate(b.min, addDays(b.max, -6)));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => d <= b.max);
}

export function movePatch(w: PlannedWorkout, date: string): WorkoutPatch {
  const home = w.original_date ?? w.date;
  return { date, original_date: home === date ? null : home, status: 'planned', status_source: 'auto', note: null };
}

/** The planned run on `date` that could swap into `w`'s day, if both are runs and w's day isn't over. */
export function swapCandidate(workouts: PlannedWorkout[], w: PlannedWorkout, date: string, today: string): PlannedWorkout | null {
  if (!isRunWorkout(w) || w.date < today || date === w.date) return null;
  return workouts.find((o) => o.id !== w.id && o.date === date && o.status === 'planned' && isRunWorkout(o) && o.kind !== 'race') ?? null;
}

export function movePatches(workouts: PlannedWorkout[], w: PlannedWorkout, date: string, today: string, swap: boolean) {
  const out = [{ id: w.id, patch: movePatch(w, date) }];
  const other = swap ? swapCandidate(workouts, w, date, today) : null;
  if (other) out.push({ id: other.id, patch: movePatch(other, w.date) });
  return out;
}

const isHard = (w: PlannedWorkout) => w.key_session || w.kind === 'long' || w.kind === 'long_mp' || w.kind === 'race';

/** Coaching warnings for the week after the move. */
export function moveWarnings(workouts: PlannedWorkout[], patches: { id: string; patch: WorkoutPatch }[]): string[] {
  const after = workouts.map((o) => ({ ...o, ...(patches.find((p) => p.id === o.id)?.patch ?? {}) }));
  const moved = after.find((o) => o.id === patches[0].id);
  if (!moved) return [];
  const active = after.filter((o) => o.id !== moved.id && o.status !== 'skipped' && o.status !== 'missed');
  const warnings: string[] = [];
  const sameDay = active.filter((o) => o.date === moved.date && isRunWorkout(o) && isRunWorkout(moved));
  if (sameDay.length) warnings.push(`"${sameDay[0].title}" is on the same day – that's two runs.`);
  if (isHard(moved)) {
    const next = active.find((o) => isHard(o) && (o.date === addDays(moved.date, -1) || o.date === addDays(moved.date, 1)));
    if (next) warnings.push(`"${next.title}" is the day ${next.date < moved.date ? 'before' : 'after'}. Two hard days in a row raise the injury risk – keep an easy day between them if you can.`);
  }
  return warnings;
}
