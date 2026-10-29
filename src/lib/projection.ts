// Marathon projection over time, to show progress:
// - training-based: Tanda 2011 from the 8 weeks of running before each Sunday;
// - plan: the race-day projection from VDOT, as it stood after each update
//   (the number in the dashboard header).

import type { Activity, TrainingPlan } from './types';
import { tandaProjection } from './analysis';
import { addDays, mondayOf } from './planner/dates';
import { marathonTargets } from './planner/generate';

export interface ProjectionPoint {
  date: string;
  tandaS: number | null;
  planS: number | null;
}

export interface ProjectionHistory {
  points: ProjectionPoint[];
  goalS: number | null;
  planStart: string;
  current: { tandaS: number | null; planS: number };
  /** Change since the plan started (negative = faster). */
  tandaChangeS: number | null;
  planChangeS: number;
  /** What moved the training-based estimate: 8-week km/week and average pace, at plan start and now. */
  drivers: { kmStart: number; kmNow: number; paceStart: number; paceNow: number } | null;
}

/** The plan's race-day projection on `date`: the value after the last VDOT update up to then. */
export function planProjectionAt(plan: TrainingPlan, date: string): number | null {
  if (date < plan.start_date) return null;
  const history = [...plan.fitness.history].sort((a, b) => a.date.localeCompare(b.date));
  const last = history[history.length - 1];
  const entry = [...history].reverse().find((h) => h.date <= date) ?? history[0];
  if (!entry || entry === last) return plan.fitness.predictedMarathonS;
  return marathonTargets(plan.inputs, entry.vdot, plan.fitness.peakWeeklyKm, entry.date).predicted;
}

export function projectionHistory(plan: TrainingPlan, activities: Activity[], today: string): ProjectionHistory {
  // Weekly points (Sundays) from 8 weeks before the plan until today.
  const firstSunday = addDays(mondayOf(plan.start_date), -1 - 7 * 8);
  const dates: string[] = [];
  for (let d = firstSunday; d < today; d = addDays(d, 7)) dates.push(d);
  dates.push(today);

  let points = dates.map((date) => ({ date, tandaS: tandaProjection(activities, date)?.seconds ?? null, planS: planProjectionAt(plan, date) }));
  // Drop leading weeks without any estimate.
  const firstUseful = points.findIndex((p) => p.tandaS !== null || p.planS !== null);
  points = firstUseful < 0 ? [] : points.slice(firstUseful);

  const atStart = points.find((p) => p.date >= addDays(plan.start_date, -1)) ?? null;
  const firstTandaPoint = points.find((p) => p.date >= addDays(plan.start_date, -1) && p.tandaS !== null) ?? null;
  const firstTanda = firstTandaPoint?.tandaS ?? null;
  const currentTanda = points.length ? points[points.length - 1].tandaS : null;
  const firstPlan = atStart?.planS ?? planProjectionAt(plan, plan.start_date) ?? plan.fitness.predictedMarathonS;

  const before = firstTandaPoint ? tandaProjection(activities, firstTandaPoint.date) : null;
  const now = tandaProjection(activities, today);
  return {
    points,
    goalS: plan.inputs.goalType === 'time' ? plan.inputs.goalTimeS : null,
    planStart: plan.start_date,
    current: { tandaS: currentTanda, planS: plan.fitness.predictedMarathonS },
    tandaChangeS: firstTanda !== null && currentTanda !== null ? currentTanda - firstTanda : null,
    planChangeS: plan.fitness.predictedMarathonS - firstPlan,
    drivers: before && now ? { kmStart: before.weeklyKm, kmNow: now.weeklyKm, paceStart: before.paceS, paceNow: now.paceS } : null,
  };
}
