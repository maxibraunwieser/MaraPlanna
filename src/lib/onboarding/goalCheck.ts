// Reality check of the goal: is the goal time within reach with the fitness the person has and the weeks they have?
// The numbers come from the plan engine (the same projection the plan uses), so the check never disagrees with the plan.

import { marathonTargets, peakVolume, profileOf } from '../planner/generate';
import { daysBetween, todayISO } from '../planner/dates';
import { goalProfile } from '../planner/goals';
import type { FitnessAssessment, OnboardingAnswers } from '../types';

export interface GoalCheck {
  /** Time the person is projected to run over the plan's distance by the end of the plan. */
  predictedS: number;
  /** easy: the goal is slower than the projection; realistic; ambitious; stretch: a big stretch. */
  verdict: 'none' | 'easy' | 'realistic' | 'ambitious' | 'stretch';
  /** A realistic range around the projection, in seconds. */
  range: [number, number];
  /** Goal pace in seconds per km (null without a time goal). */
  goalPaceS: number | null;
  /** Too little time for this distance with the current volume. */
  tooShort: boolean;
  weeks: number;
}

export function checkGoal(a: OnboardingAnswers, fitness: Pick<FitnessAssessment, 'vdot' | 'weeklyKm'>, today: string = todayISO()): GoalCheck | null {
  const profile = profileOf(a);
  if (!profile.race || !profile.distanceM) return null;
  const weeks = Math.max(0, Math.floor(daysBetween(today, a.raceDate) / 7));
  const t = marathonTargets(a, fitness.vdot, peakVolume(a, fitness.weeklyKm), today);
  const predicted = t.predicted;
  const range: [number, number] = [Math.round(predicted * 0.98), Math.round(predicted * 1.03)];
  let verdict: GoalCheck['verdict'] = 'none';
  if (a.goalType === 'time' && a.goalTimeS) {
    const ratio = predicted / a.goalTimeS;
    verdict = ratio >= 1.08 ? 'stretch' : ratio >= 1.025 ? 'ambitious' : ratio <= 0.95 ? 'easy' : 'realistic';
  }
  // Time needed: the long races want several weeks, and more of them when the person runs little.
  const min = goalProfile(a.goal, a.raceDistanceM).weeks.min;
  const tooShort = weeks < min || (profile.distanceM >= 40_000 && weeks < 12 && fitness.weeklyKm < 25) || (profile.distanceM >= 20_000 && weeks < 8 && fitness.weeklyKm < 15);
  return {
    predictedS: predicted,
    verdict,
    range,
    goalPaceS: a.goalType === 'time' && a.goalTimeS ? a.goalTimeS / (profile.distanceM / 1000) : null,
    tooShort,
    weeks,
  };
}
