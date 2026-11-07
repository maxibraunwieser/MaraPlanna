// What each screen of the questionnaire needs, and what is wrong with the answers so far. Errors are keys into the message tables
// (`err.<code>`); a screen may continue when it has none. Optional fields never block.

import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { ageFromBirthDate, hrProblems } from '../hrZones';
import { daysBetween, todayISO } from '../planner/dates';
import { goalProfile, isRaceGoal } from '../planner/goals';
import { RACE_KEY_M, runsRecommendation } from './derive';
import { parqAnswered, unavailableByMinutes } from './catalog';
import type { ScreenId } from './screens';
import type { OnboardingAnswers } from '../types';

export type StepId = ScreenId;
export type FieldErrors = Record<string, string>;

/** Every error code the checks can return; each has a message `err.<code>` in all languages. */
export const ERROR_CODES = [
  'required', 'birthRange', 'heightRange', 'weightRange', 'fatRange', 'choose', 'dateSoon', 'dateFar', 'timeRange', 'weeksRange',
  'restRange', 'maxRange', 'maxBelowRest', 'paceRange', 'negative', 'runsRange', 'pickOne', 'pickLong', 'tooFewRuns',
  'tooManyBlocked', 'longBlocked', 'consent', 'vo2Range', 'liftBoth', 'breakRange', 'sessionsRange', 'severity', 'fewDays', 'runsTooMany',
] as const;

export const WEIGHT_RANGE = [30, 250] as const;
export const HEIGHT_RANGE = [120, 230] as const;
export const AGE_RANGE = [16, 90] as const;

/** Plausible finish times in seconds for a distance (about 2:30 to 12:00 per km). */
export function timeRange(distanceM: number): [number, number] {
  return [Math.round((distanceM / 1000) * 150), Math.round((distanceM / 1000) * 720)];
}

export function validateStep(step: ScreenId, a: OnboardingAnswers, strength: StrengthPrefs, today: string = todayISO()): FieldErrors {
  const e: FieldErrors = {};
  const s = a.setup!;
  switch (step) {
    case 'consent':
      if (!s.consent.health) e.consent = 'consent';
      break;
    case 'name': {
      if (!s.name.trim()) e.name = 'required';
      if (!s.birthDate) e.birthDate = 'required';
      else {
        const age = ageFromBirthDate(s.birthDate, today);
        if (age === null || age < AGE_RANGE[0] || age > AGE_RANGE[1]) e.birthDate = 'birthRange';
      }
      break;
    }
    case 'gender':
      if (!s.gender) e.gender = 'choose';
      break;
    case 'body': {
      if (s.heightCm === null) e.heightCm = 'required';
      else if (s.heightCm < HEIGHT_RANGE[0] || s.heightCm > HEIGHT_RANGE[1]) e.heightCm = 'heightRange';
      if (s.weightKg === null) e.weightKg = 'required';
      else if (s.weightKg < WEIGHT_RANGE[0] || s.weightKg > WEIGHT_RANGE[1]) e.weightKg = 'weightRange';
      if (s.bodyFatPct !== null && (s.bodyFatPct < 3 || s.bodyFatPct > 60)) e.bodyFat = 'fatRange';
      break;
    }
    case 'goal':
      if (!s.primary) e.goal = 'required';
      break;
    case 'raceDetails': {
      const goal = a.goal;
      if (!goal || !isRaceGoal(goal)) {
        e.distance = 'choose';
        break;
      }
      const days = daysBetween(today, a.raceDate);
      if (!a.raceDate) e.date = 'required';
      else if (days < 14) e.date = 'dateSoon';
      else if (days > 7 * 60) e.date = 'dateFar';
      break;
    }
    case 'raceTime': {
      const goal = a.goal;
      if (goal && isRaceGoal(goal) && a.goalType === 'time') {
        if (!a.goalTimeS) e.time = 'required';
        else {
          const [lo, hi] = timeRange(goalProfile(goal, a.raceDistanceM).distanceM ?? 42_195);
          if (a.goalTimeS < lo || a.goalTimeS > hi) e.time = 'timeRange';
        }
      }
      break;
    }
    case 'planLength': {
      const goal = a.goal;
      if (goal && a.planWeeks) {
        const w = goalProfile(goal, a.raceDistanceM).weeks;
        if (a.planWeeks < w.min || a.planWeeks > w.max) e.weeks = 'weeksRange';
      } else if (goal && !isRaceGoal(goal)) e.weeks = 'required';
      break;
    }
    case 'hasGarmin':
      if (s.hasGarmin === null) e.hasGarmin = 'choose';
      break;
    case 'garminConnect':
      if (!s.garmin) e.garmin = 'choose';
      break;
    case 'runExperience':
      if (!s.runStarted) e.runStarted = 'required';
      break;
    case 'runVolume': {
      if (s.runsNow < 0 || s.runsNow > 14) e.runsNow = 'runsRange';
      if (a.currentWeeklyKm < 0) e.weeklyKm = 'negative';
      if (s.peakKm !== null && s.peakKm < 0) e.peakKm = 'negative';
      if (a.longestRecentRunKm < 0) e.longest = 'negative';
      break;
    }
    case 'runReference': {
      const r = s.refRace;
      if (r && !s.refNone) {
        if (r.timeS === null || r.timeS <= 0) e.time = 'required';
        else {
          const [lo, hi] = timeRange(RACE_KEY_M[r.distance]);
          if (r.timeS < lo || r.timeS > hi) e.time = 'timeRange';
        }
      }
      if (s.easyPaceS !== null && (s.easyPaceS < 180 || s.easyPaceS > 720)) e.easyPace = 'paceRange';
      break;
    }
    case 'runHeart': {
      for (const p of hrProblems(s.restingHr, a.maxHr)) e[p === 'maxBelowRest' ? 'maxHr' : p === 'restRange' ? 'restingHr' : 'maxHr'] = p;
      if (s.vo2max !== null && (s.vo2max < 20 || s.vo2max > 90)) e.vo2max = 'vo2Range';
      break;
    }
    case 'strExperience':
      if (!s.strengthXp) e.strengthXp = 'required';
      break;
    case 'strWhere':
      if (!s.locations.length) e.locations = 'pickOne';
      break;
    case 'strEquipment':
      if ((s.locations.includes('gym') || s.locations.includes('homeGym')) && !strength.gear.length) e.gear = 'pickOne';
      break;
    case 'strFrequency':
      if (s.strengthNow === null) e.strengthNow = 'required';
      else if (s.strengthNow < 0 || s.strengthNow > 7) e.strengthNow = 'runsRange';
      break;
    case 'strWrist':
      if (!strength.wrist) e.wrist = 'required';
      break;
    case 'dayMinutes': {
      const free = 7 - unavailableByMinutes(s.minutesPerDay, s.restDays).length;
      if (free < 2) e.days = 'fewDays';
      break;
    }
    case 'runDays': {
      if (a.runDaysPerWeek < 2 || a.runDaysPerWeek > 7) e.runs = 'runsRange';
      else if (a.runDaysPerWeek > 7 - s.unavailableDays.length) e.runs = 'runsTooMany';
      if (!s.longRunAny && s.unavailableDays.includes(a.longRunDay)) e.longDay = 'longBlocked';
      break;
    }
    case 'runPlan':
    case 'strengthPlan': {
      if (a.scheduleMode === 'custom') {
        const week = a.customWeek;
        if (!week) e.week = 'required';
        else {
          if (week.filter((d) => d.run === 'long').length !== 1) e.longDay = 'pickLong';
          if (week.filter((d) => d.run !== 'rest').length < 2) e.runs = 'tooFewRuns';
        }
      }
      break;
    }
    case 'breaks': {
      s.breaks.forEach((b, i) => {
        if (!b.from || !b.to) e[`break.${i}`] = 'required';
        else if (b.to < b.from || b.to < today) e[`break.${i}`] = 'breakRange';
      });
      break;
    }
    case 'injuryNow':
      if (s.injuriesNow === null) e.injuriesNow = 'choose';
      break;
    case 'injuryRegions': {
      if (!s.injuryAreas.length) e.areas = 'pickOne';
      for (const area of s.injuryAreas) {
        const d = s.injuryDetail[area];
        if (d && (d.severity < 0 || d.severity > 10)) e[`severity.${area}`] = 'severity';
      }
      break;
    }
    case 'parq':
      if (!parqAnswered(s.parq)) e.parq = 'required';
      break;
    default:
      break;
  }
  return e;
}

/** Softer hints for a screen (shown, never blocking): message keys with parameters. */
export function stepHints(step: ScreenId, a: OnboardingAnswers): { key: string; params?: Record<string, string | number> }[] {
  const out: { key: string; params?: Record<string, string | number> }[] = [];
  const goal = a.goal ?? 'marathon';
  if (step === 'runDays' && a.setup) {
    const [lo] = runsRecommendation(goal, a.level);
    if (a.runDaysPerWeek < lo) out.push({ key: 'hint.fewRuns', params: { n: lo } });
  }
  return out;
}
