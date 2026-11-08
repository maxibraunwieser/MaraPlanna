// Strength added to a running plan that already exists: the runs of the plan are never rebuilt. Only the strength sessions of the
// new answers come in, and the stored inputs of the plan change only where strength is concerned.

import type { OnboardingAnswers, PlannedWorkout, TrainingPlan, WeekSummary, WorkoutDraft } from '../types';
import type { GeneratedPlan } from './generate';

export const STRENGTH_DB_KINDS = ['strength_lower', 'strength_upper', 'strength_full', 'core'];

const isStrength = (w: { kind: string }) => STRENGTH_DB_KINDS.includes(w.kind);
/** A strength session that has not happened yet: the one kind of workout that is replaced when strength is set up again. */
const isOpenStrength = (w: PlannedWorkout, today: string) => isStrength(w) && w.status === 'planned' && w.date >= today;

/** The strength sessions of a freshly built plan that join the existing one: on its days, never before today, never on a race day. */
export function strengthSessionsFor(generated: GeneratedPlan, current: PlannedWorkout[], today: string): WorkoutDraft[] {
  const lastDay = current.reduce((m, w) => (w.date > m ? w.date : m), today);
  const raceDays = new Set(current.filter((w) => w.kind === 'race').map((w) => w.date));
  return generated.workouts.filter((w) => isStrength(w) && w.date >= today && w.date <= lastDay && !raceDays.has(w.date));
}

/** The plan as it will be after strength is added: the stored weeks and every stored workout except open strength, plus the new strength. */
export function keepRunPlan(generated: GeneratedPlan, plan: TrainingPlan, current: PlannedWorkout[], today: string): GeneratedPlan {
  const kept = current.filter((w) => !isOpenStrength(w, today));
  const workouts = [...kept, ...strengthSessionsFor(generated, current, today)].sort((a, b) => a.date.localeCompare(b.date));
  return { fitness: plan.fitness, weeks: plan.weeks, workouts, warnings: [] };
}

/** The stored inputs with only the strength part replaced (the running part, and the coach's changes to it, stay as they are). */
export function inputsWithStrength(stored: OnboardingAnswers, answers: OnboardingAnswers): OnboardingAnswers {
  const setup = stored.setup ?? answers.setup;
  return {
    ...stored,
    extras: answers.extras,
    equipment: answers.equipment,
    setup: setup && answers.setup ? { ...setup, runPct: answers.setup.runPct, doubles: answers.setup.doubles, doubleOrder: answers.setup.doubleOrder } : setup,
  };
}

/** The week that is running today (the last one if the plan is over, the first if it has not begun). */
export function currentWeek(weeks: WeekSummary[], today: string): WeekSummary {
  return [...weeks].reverse().find((w) => w.startDate <= today) ?? weeks[0];
}
