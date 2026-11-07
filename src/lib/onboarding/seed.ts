// Starting points of the setup: a new account gets neutral blanks (and units by the browser's language); a returning user
// editing their answers gets what they saved, with the newer questions answered from the older ones where that is possible.

import { normalizePrefs, type StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import { isRaceGoal } from '../planner/goals';
import type { GarminConnection, OnboardingAnswers, Profile, RaceKey, SetupExtras, Weekday } from '../types';
import { EXPERIENCE_OF_LEVEL, RACE_KEY_M, applyPersonal } from './derive';
import { strengthPerWeek } from './strengthMap';
import { primaryOfGoal } from './catalog';

const nearestRace = (distanceM: number): RaceKey =>
  (Object.keys(RACE_KEY_M) as RaceKey[]).reduce((best, k) => (Math.abs(RACE_KEY_M[k] - distanceM) < Math.abs(RACE_KEY_M[best] - distanceM) ? k : best), '5k' as RaceKey);

/** A new account: nothing chosen yet (no goal, no date), modest running numbers, metric units (they can be changed on the screen). */
export function blankStart(profile: Profile | null, today: string): { answers: OnboardingAnswers; strength: StrengthPrefs } {
  const base = normalizeAnswers(profile?.onboarding ?? null);
  const answers: OnboardingAnswers = {
    ...base,
    units: 'km',
    goal: undefined,
    raceDate: '',
    planWeeks: null,
    currentWeeklyKm: 20,
    longestRecentRunKm: 8,
    runDaysPerWeek: 3,
    setup: { ...base.setup!, name: base.setup!.name || profile?.display_name || '', runsNow: 3, runsWanted: 3, heightUnit: 'm', weightUnit: 'kg', longRunAny: true, runDaysMode: 'auto' },
    extras: [],
  };
  const strength = normalizePrefs(profile?.strength);
  return { answers: applyPersonal(answers, today), strength: { ...strength, weightUnit: 'kg', perWeek: null } };
}

/** A user who finished the setup before: their answers, plus answers to the questions that did not exist then. */
export function editStart(profile: Profile, connection: GarminConnection | null, today: string): { answers: OnboardingAnswers; strength: StrengthPrefs } {
  const a = normalizeAnswers(profile.onboarding);
  const s = a.setup!;
  const strength = normalizePrefs(profile.strength);
  const setup = {
    ...s,
    name: s.name || profile.display_name || '',
    racesDone: s.racesDone.length || !a.recentRace ? s.racesDone : [{ distance: nearestRace(a.recentRace.distanceM), pbS: a.recentRace.timeS || null }],
    experience: s.experience ?? EXPERIENCE_OF_LEVEL[a.level],
    // Answers saved before the units were chosen separately follow the unit of the distances (or the strength page's weight unit).
    heightUnit: profile.onboarding?.setup?.heightUnit ?? (a.units === 'mi' ? ('ft' as const) : ('m' as const)),
    weightUnit: profile.onboarding?.setup?.weightUnit ?? (strength.savedAt ? strength.weightUnit : a.units === 'mi' ? ('lb' as const) : ('kg' as const)),
    gender: s.gender ?? (a.sex === 'male' ? 'male' : a.sex === 'female' ? 'female' : a.sex === 'other' ? 'diverse' : null),
    runsWanted: s.runsWanted ?? a.runDaysPerWeek,
    garmin: s.garmin ?? (connection?.status === 'connected' ? ('connected' as const) : ('manual' as const)),
    hrSource: { ...s.hrSource, max: s.hrSource.max ?? (a.maxHr ? ('manual' as const) : null) },
  };
  // Answers saved before goals existed were for a marathon.
  const goal = a.goal ?? 'marathon';
  const strengthN = strength.perWeek ?? strengthPerWeek(a.extras);
  const racing = isRaceGoal(goal) && !a.planWeeks;
  const best = setup.racesDone.filter((r) => r.pbS).sort((x, y) => RACE_KEY_M[y.distance] - RACE_KEY_M[x.distance])[0];
  // The questions the questionnaire has gained since: answered from the older answers where that is possible. Consent and the
  // health check are never guessed: they are asked.
  const gained: Partial<SetupExtras> = {
    primary: s.primary ?? primaryOfGoal(goal),
    runPct: s.primary ? s.runPct : strengthN > 0 ? Math.round((100 * a.runDaysPerWeek) / (a.runDaysPerWeek + strengthN)) : 100,
    hasRace: s.hasRace ?? racing,
    runStarted: s.runStarted ?? ({ new: 'lt6m', some: 'm6to12', long: 'gt3y' } as const)[setup.experience ?? 'some'],
    intervals: s.intervals ?? ({ easy: 'never', mixed: 'rare', structured: 'regular' } as const)[setup.intensity],
    surfaces: s.surfaces.length ? s.surfaces : s.surface ? [s.surface] : [],
    refRace: s.refRace ?? (best ? { distance: best.distance, timeS: best.pbS, date: a.recentRace?.date ?? null } : null),
    strengthXp: s.strengthXp ?? (strength.level ? ({ new: 'lt6m', some: 'm6to24', experienced: 'gt2y' } as const)[strength.level] : null),
    locations: s.locations.length ? s.locations : strength.styles.length === 1 && strength.styles[0] === 'bodyweight' ? ['bodyweight'] : strength.styles.length ? ['gym'] : [],
    strengthNow: s.strengthNow ?? (strength.savedAt ? strengthN : null),
    daysAvail: ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !s.unavailableDays.includes(d)),
    // days without time were the days the person could not train
    minutesPerDay: s.minutesPerDay.map((m, d) => (s.unavailableDays.includes(d as Weekday) ? 0 : m)),
    hasGarmin: s.hasGarmin ?? (connection?.status === 'connected' ? true : null),
    injuriesNow: s.injuriesNow ?? s.injuryAreas.length > 0,
  };
  const answers = applyPersonal({ ...a, goal, setup: { ...setup, ...gained } }, today);
  return {
    answers,
    strength: { ...strength, perWeek: strengthN, weightUnit: strength.savedAt ? strength.weightUnit : answers.units === 'mi' ? 'lb' : 'kg' },
  };
}
