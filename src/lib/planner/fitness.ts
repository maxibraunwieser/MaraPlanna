// Turns questionnaire answers + Garmin history into a fitness snapshot.

import type { Activity, DailyMetric, FitnessAssessment, GarminProfile, Level, OnboardingAnswers } from '../types';
import { daysBetween } from './dates';
import { vdotFromHeartRate, vdotFromRace } from './vdot';

const DEFAULT_VDOT: Record<Level, number> = { beginner: 34, intermediate: 41, advanced: 48 };

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const isRun = (a: Activity) => a.sport === 'run' && (a.distance_m ?? 0) > 500;
const inWindow = (date: string, today: string, days: number) => {
  const age = daysBetween(date, today);
  return age >= 0 && age < days;
};

export function estimateMaxHr(answers: OnboardingAnswers, garmin: GarminProfile | null, activities: Activity[], today: string): number | null {
  if (answers.maxHr) return answers.maxHr;
  if (garmin?.maxHr) return garmin.maxHr;
  const observed = Math.max(0, ...activities.filter((a) => a.max_hr && inWindow(a.local_date, today, 365)).map((a) => a.max_hr!));
  const formula = answers.age ? Math.round(208 - 0.7 * answers.age) : 0;
  const best = Math.max(observed, formula);
  return best >= 150 ? best : null;
}

export function estimateRestingHr(metrics: DailyMetric[], garmin: GarminProfile | null, today: string): number | null {
  const recent = metrics.filter((m) => m.resting_hr && inWindow(m.date, today, 14)).map((m) => m.resting_hr!);
  return median(recent) ?? garmin?.restingHr ?? null;
}

/** VDOT estimate from heart rate on recent steady runs (median, needs ≥3 runs). */
export function heartRateVdot(runs: Activity[], restingHr: number | null, maxHr: number | null) {
  if (!restingHr || !maxHr) return { vdot: null as number | null, count: 0 };
  const estimates = runs
    .filter((r) => (r.distance_m ?? 0) >= 4000 && (r.moving_s ?? r.duration_s ?? 0) >= 1200 && r.avg_hr && !(r.sub_type ?? '').includes('trail'))
    .map((r) => vdotFromHeartRate(r.distance_m!, r.moving_s ?? r.duration_s!, r.avg_hr!, restingHr, maxHr))
    .filter((v): v is number => v !== null);
  return { vdot: estimates.length >= 3 ? median(estimates) : null, count: estimates.length };
}

/** Lower bound: treat the second-best recent run as if it were a race effort. */
export function paceFloorVdot(runs: Activity[]): number | null {
  const efforts = runs
    .filter((r) => (r.distance_m ?? 0) >= 5000 && (r.moving_s ?? r.duration_s))
    .map((r) => vdotFromRace(r.distance_m!, r.moving_s ?? r.duration_s!))
    .sort((a, b) => b - a);
  if (efforts.length < 2) return null;
  return efforts[1];
}

export function assessFitness(input: {
  answers: OnboardingAnswers;
  activities: Activity[];
  metrics: DailyMetric[];
  garmin: GarminProfile | null;
  today: string;
}): FitnessAssessment {
  const { answers, activities, metrics, garmin, today } = input;
  const runs = activities.filter(isRun);
  const runs28 = runs.filter((r) => inWindow(r.local_date, today, 28));
  const runs42 = runs.filter((r) => inWindow(r.local_date, today, 42));

  // Weekly volume: prefer watch data when there is enough of it.
  const oldest = activities.reduce<string | null>((min, a) => (!min || a.local_date < min ? a.local_date : min), null);
  const coveredDays = oldest ? Math.min(28, Math.max(7, daysBetween(oldest, today) + 1)) : 28;
  const useGarmin = runs28.length >= 4;
  const garminWeeklyKm = runs28.reduce((s, r) => s + (r.distance_m ?? 0) / 1000, 0) / (coveredDays / 7);
  const weeklyKm = useGarmin ? garminWeeklyKm : answers.currentWeeklyKm;
  const longestRunKm = useGarmin
    ? Math.max(...runs42.map((r) => (r.distance_m ?? 0) / 1000))
    : answers.longestRecentRunKm;

  const maxHr = estimateMaxHr(answers, garmin, activities, today);
  const restingHr = estimateRestingHr(metrics, garmin, today);

  // VDOT, best source first.
  let vdot: number;
  let vdotSource: string;
  const race = answers.recentRace;
  const raceFresh = race && (!race.date || daysBetween(race.date, today) <= 180);
  const hr = heartRateVdot(runs42, restingHr, maxHr);
  const garminVo2 =
    [...runs]
      .filter((r) => r.vo2max && inWindow(r.local_date, today, 60))
      .sort((a, b) => b.local_date.localeCompare(a.local_date))[0]?.vo2max ?? garmin?.vo2max ?? null;

  if (race && raceFresh) {
    vdot = vdotFromRace(race.distanceM, race.timeS);
    vdotSource = 'your recent race result';
  } else if (hr.vdot) {
    vdot = hr.vdot;
    vdotSource = `heart rate & pace on ${hr.count} recent Garmin runs`;
  } else if (garminVo2) {
    vdot = garminVo2 * 0.95;
    vdotSource = 'your Garmin VO2max';
  } else {
    vdot = DEFAULT_VDOT[answers.level];
    vdotSource = `a typical ${answers.level} runner (connect Garmin or add a race result to personalise)`;
  }

  const floor = paceFloorVdot(runs.filter((r) => inWindow(r.local_date, today, 60)));
  if (floor && floor > vdot + 0.5) {
    vdot = floor;
    vdotSource += ' – raised, your recent runs were faster';
  }

  return {
    vdot: Math.round(Math.min(85, Math.max(25, vdot)) * 10) / 10,
    vdotSource,
    weeklyKm: Math.round(weeklyKm * 10) / 10,
    weeklyKmSource: useGarmin ? 'garmin' : 'answers',
    longestRunKm: Math.round(longestRunKm * 10) / 10,
    runsPerWeek: Math.round((runs28.length / (coveredDays / 7)) * 10) / 10,
    restingHr,
    maxHr,
    runsAnalysed: runs42.length,
  };
}
