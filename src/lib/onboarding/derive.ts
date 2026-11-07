// From the answers of the setup to the fields the plan engine reads, and back where that makes sense.
// The setup asks in the person's words (experience, races done, how often they run); the engine wants a level, a recent race,
// a long run, a race date. These functions are the only place that translates.

import { addDays, daysBetween, mondayOf, todayISO } from '../planner/dates';
import { RACE_DISTANCES, goalProfile, isRaceGoal, type GoalKind } from '../planner/goals';
import { ageFromBirthDate, estimateMaxHr } from '../hrZones';
import type { Level, OnboardingAnswers, RaceKey } from '../types';

export const RACE_KEY_M: Record<RaceKey, number> = { '5k': 5000, '10k': 10_000, half: 21_097, marathon: 42_195 };

/** Frequency that suits a goal, for the hint and the default: [lowest sensible, recommended, highest sensible]. */
export function runsRecommendation(goal: GoalKind, level: Level): [number, number, number] {
  const rec = (n: number) => Math.min(n, 6);
  switch (goal) {
    case 'marathon': return [3, rec(level === 'beginner' ? 4 : 5), 6];
    case 'half': return [3, rec(level === 'beginner' ? 3 : 4), 6];
    case 'race10k': case 'faster': return [3, level === 'beginner' ? 3 : 4, 6];
    case 'race5k': return [2, 3, 5];
    case 'hybrid': return [2, 3, 5];
    case 'fitness': return [2, 3, 4];
    case 'comeback': return [2, 3, 4];
  }
}

/** Strength sessions per week that suit a goal: [lowest, highest], for the hint. */
export function strengthRecommendation(goal: GoalKind): [number, number] {
  switch (goal) {
    case 'marathon': case 'half': return [1, 2];
    case 'race10k': case 'race5k': case 'faster': return [1, 2];
    case 'hybrid': return [2, 4];
    case 'fitness': return [2, 3];
    case 'comeback': return [1, 2];
  }
}

/** The end of a plan with no date: the Sunday of the last of `weeks` weeks counted from the Monday of the week of `today`. */
export function endDateForWeeks(weeks: number, today: string = todayISO()): string {
  return addDays(mondayOf(today), weeks * 7 - 1);
}

export interface GoalInput {
  goal: GoalKind;
  /** Distance for "get faster"; the race goals have their own. */
  distanceM?: number | null;
  /** A race date, or null = no date yet. */
  date: string | null;
  weeks: number | null;
  mode: 'finish' | 'time';
  timeS: number | null;
  raceName?: string;
}

/** Writes the goal into the fields of the engine (race date, distance, time goal). */
export function applyGoal(a: OnboardingAnswers, g: GoalInput, today: string = todayISO()): OnboardingAnswers {
  const profile = goalProfile(g.goal, g.distanceM);
  const race = isRaceGoal(g.goal);
  const weeks = g.weeks ?? profile.weeks.default;
  // A race date is the end of the plan; without one the plan runs for the chosen number of weeks.
  const end = race && g.date ? g.date : endDateForWeeks(weeks, today);
  return {
    ...a,
    goal: g.goal,
    raceDistanceM: profile.distanceM,
    planWeeks: race && g.date ? null : weeks,
    raceDate: end,
    raceName: g.raceName ?? a.raceName,
    goalType: race && g.mode === 'time' && g.timeS ? 'time' : 'finish',
    goalTimeS: race && g.mode === 'time' ? g.timeS : null,
  };
}

/** Reads the goal back out of the answers (for the form). */
export function readGoal(a: OnboardingAnswers): GoalInput {
  return {
    goal: a.goal ?? 'marathon',
    distanceM: a.raceDistanceM ?? null,
    date: a.planWeeks ? null : a.raceDate,
    weeks: a.planWeeks ?? null,
    mode: a.goalType,
    timeS: a.goalTimeS,
    raceName: a.raceName,
  };
}

/** How long the person has been running -> the level the engine uses. */
export const LEVEL_OF_EXPERIENCE = { new: 'beginner', some: 'intermediate', long: 'advanced' } as const satisfies Record<'new' | 'some' | 'long', Level>;
export const EXPERIENCE_OF_LEVEL: Record<Level, 'new' | 'some' | 'long'> = { beginner: 'new', intermediate: 'some', advanced: 'long' };

/** Experience words of the setup -> level and years the engine uses. */
export const LEVEL_YEARS: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 3 };

/** Races the person has run -> the number of marathons and the best result to anchor the paces. */
export function applyRaces(a: OnboardingAnswers): OnboardingAnswers {
  const done = a.setup?.racesDone ?? [];
  const marathons = done.some((r) => r.distance === 'marathon') ? Math.max(1, a.marathonsCompleted) : 0;
  // The longest distance with a result is the most telling for pace; the result is only used when it has a time.
  const withTime = done.filter((r) => r.pbS && r.pbS > 0).sort((x, y) => RACE_KEY_M[y.distance] - RACE_KEY_M[x.distance]);
  const best = withTime[0];
  return {
    ...a,
    marathonsCompleted: marathons,
    recentRace: best ? { distanceM: RACE_KEY_M[best.distance], timeS: best.pbS!, date: a.recentRace?.date ?? null } : null,
  };
}

/** Age, injury flag and the estimated maximum heart rate from the personal answers. */
export function applyPersonal(a: OnboardingAnswers, today: string = todayISO()): OnboardingAnswers {
  const s = a.setup!;
  const age = ageFromBirthDate(s.birthDate, today);
  const next: OnboardingAnswers = { ...a, age, injuryProne: s.injuryAreas.length > 0 };
  // Without a measured maximum heart rate (Garmin or typed), the estimate from age stands in and is marked as such.
  if (!next.maxHr || s.hrSource.max === 'estimated') {
    next.maxHr = age ? estimateMaxHr(age) : null;
    next.setup = { ...s, hrSource: { ...s.hrSource, max: age ? 'estimated' : null } };
  }
  return next;
}

/** Days until the plan ends, and how many full weeks that is. */
export function weeksUntil(a: OnboardingAnswers, today: string = todayISO()): number {
  return Math.max(0, Math.floor(daysBetween(today, a.raceDate) / 7));
}

export { RACE_DISTANCES };
