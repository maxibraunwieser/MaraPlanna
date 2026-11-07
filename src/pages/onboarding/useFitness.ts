import { useMemo } from 'react';
import { useData } from '../../lib/data';
import { applyPersonal, applyRaces } from '../../lib/onboarding/derive';
import { checkGoal, type GoalCheck } from '../../lib/onboarding/goalCheck';
import { assessFitness } from '../../lib/planner/fitness';
import type { FitnessAssessment, OnboardingAnswers } from '../../lib/types';

/** The fitness snapshot the plan will be built on, from the answers so far plus whatever Garmin knows. */
export function useFitness(a: OnboardingAnswers): { fitness: FitnessAssessment; check: GoalCheck | null; informed: boolean } {
  const { activities, metrics, connection, today } = useData();
  const garmin = a.setup?.garmin === 'connected' ? (connection?.profile ?? null) : null;
  const sig = JSON.stringify([a.goal, a.raceDate, a.planWeeks, a.raceDistanceM, a.goalType, a.goalTimeS, a.level, a.currentWeeklyKm, a.longestRecentRunKm, a.maxHr, a.setup?.racesDone, a.setup?.easyPaceS, a.setup?.restingHr, a.age]);
  return useMemo(() => {
    const answers = applyRaces(applyPersonal(a, today));
    const use = a.setup?.garmin === 'connected';
    const fitness = assessFitness({ answers, activities: use ? activities : [], metrics: use ? metrics : [], garmin, today });
    const check = a.goal ? checkGoal(answers, fitness, today) : null;
    // "Informed": the projection rests on something the person or Garmin told us, not on the average runner.
    return { fitness, check, informed: !fitness.vdotSource.startsWith('a typical') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, activities, metrics, garmin, today]);
}
