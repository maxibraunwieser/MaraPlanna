// Workouts in the plan: which planned sessions belong to a workout, the sessions of a workout the person added themselves (once
// on a date or as a weekly series), and moving a session (only this one, or this one and every later one of its series).
// Pure functions; the Strength page writes what they return.

import { isOwnRoutine, type Routine, type RoutineSchedule } from '../../supabase/functions/_shared/strength';
import { addDays, daysBetween, mondayOf, weekdayOf } from './planner/dates';
import { routineMinutes, routineSteps } from './strengthPlan';
import type { PlannedWorkout, TrainingPlan, Weekday, WeekSummary, WorkoutDraft } from './types';

/** The planner's kinds of strength session that have a workout of their own. */
const PLANNER_KINDS = ['lower', 'upper', 'full', 'cali'];

/** The workout a planned session belongs to: a workout of the person's own ('own-…'), a planner kind ('lower' …) or none. */
export function routineIdOf(w: Pick<PlannedWorkout, 'kind' | 'routine_id'>): string | null {
  if (w.routine_id) return w.routine_id;
  const kind = w.kind.startsWith('strength_') ? w.kind.slice('strength_'.length) : null;
  return kind && PLANNER_KINDS.includes(kind) ? kind : null;
}

/** The planned sessions of a workout (all of them; the caller filters by date and status). */
export const sessionsOf = (workouts: PlannedWorkout[], routineId: string): PlannedWorkout[] => workouts.filter((w) => routineIdOf(w) === routineId);

/** The last day of the plan: race day, or the last day with something planned. */
export function planEnd(plan: Pick<TrainingPlan, 'race_date'>, workouts: Pick<PlannedWorkout, 'date'>[]): string {
  const last = workouts.reduce((m, w) => (w.date > m ? w.date : m), '');
  return plan.race_date && plan.race_date >= last ? plan.race_date : last || plan.race_date;
}

/** The dates of a schedule from `from` to `to` (both included). */
export function scheduleDates(s: RoutineSchedule, from: string, to: string): string[] {
  if (s.mode === 'once') return s.date >= from && s.date <= to ? [s.date] : [];
  const out: string[] = [];
  const start = s.from > from ? s.from : from;
  const end = s.until && s.until < to ? s.until : to;
  for (let d = start; d <= end; d = addDays(d, 1)) if (s.days.includes(weekdayOf(d))) out.push(d);
  return out;
}

/** The week of the plan a date falls into. */
export function weekOfDate(weeks: WeekSummary[], date: string): WeekSummary | null {
  const monday = mondayOf(date);
  return weeks.find((w) => mondayOf(w.startDate) === monday) ?? null;
}

/**
 * The sessions of a workout of the person's own from `from` to the end of the plan: on the days of its schedule, lighter in
 * recovery and taper weeks, never on a day that already has a session of the same workout.
 */
export function ownSessions(routine: Routine, plan: Pick<TrainingPlan, 'race_date' | 'weeks'>, workouts: PlannedWorkout[], from: string): WorkoutDraft[] {
  if (!routine.schedule || !isOwnRoutine(routine.id) || !routine.exercises.length) return [];
  const end = planEnd(plan, workouts);
  const taken = new Set(sessionsOf(workouts, routine.id).map((w) => w.date));
  return scheduleDates(routine.schedule, from, end).flatMap((date) => {
    const week = weekOfDate(plan.weeks, date);
    if (!week || taken.has(date)) return [];
    const light = week.recovery || week.phase === 'taper';
    return [{
      routine_id: routine.id,
      date,
      week: week.week,
      phase: week.phase,
      kind: 'custom' as const,
      title: routine.name || 'Own workout',
      steps: routineSteps(routine, light),
      distance_km: null,
      duration_min: routineMinutes(routine, light),
      key_session: false,
    }];
  });
}

export type MoveScope = 'one' | 'series';

/**
 * Moving a planned session to another date. "one": only this session (its first date is kept, as when the coach moves one).
 * "series": this one and every later planned session of the same workout on the same weekday move by the same number of days
 * (none past the end of the plan).
 */
export function movePatches(workouts: PlannedWorkout[], w: PlannedWorkout, date: string, scope: MoveScope, end: string): { id: string; date: string; original_date: string | null }[] {
  const one = (x: PlannedWorkout, to: string) => {
    const home = x.original_date ?? x.date;
    return { id: x.id, date: to, original_date: home === to ? null : home };
  };
  if (date === w.date) return [];
  const id = routineIdOf(w);
  if (scope === 'one' || !id) return [one(w, date)];
  const delta = daysBetween(w.date, date);
  const day = weekdayOf(w.date);
  return sessionsOf(workouts, id)
    .filter((x) => x.status === 'planned' && x.date >= w.date && weekdayOf(x.date) === day)
    .flatMap((x) => {
      const to = addDays(x.date, delta);
      return to <= end ? [{ id: x.id, date: to, original_date: null }] : [];
    });
}

/** The weekdays of a series after one of them moved (kept sorted, no doubles). */
export function movedDays(days: number[], from: Weekday, to: Weekday): Weekday[] {
  return [...new Set(days.map((d) => (d === from ? to : d)))].sort((a, b) => a - b) as Weekday[];
}

/** The weekdays a planner kind is on in the coming weeks (for keeping a moved series when the plan is rebuilt). */
export function weekdaysOf(workouts: PlannedWorkout[], routineId: string, from: string): Weekday[] {
  return [...new Set(sessionsOf(workouts, routineId).filter((w) => w.status === 'planned' && w.date >= from).map((w) => weekdayOf(w.date)))].sort((a, b) => a - b);
}
