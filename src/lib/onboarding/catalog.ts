// The questionnaire asks in the person's words; the plan engine reads a goal, a level, days and a few counts. These pure functions
// are the translation, so they can be tested without a screen. Everything stored by the questionnaire stays in `setup`; the
// engine's own fields (goal, level, extras, unavailable days ...) are filled in from it by the screens that ask.

import { LIFT_KEYS, type Gear, type Limitation, type LiftId, type LiftingLevel, type StrengthGoal, type TrainKind } from '../../../supabase/functions/_shared/strength';
import { gearOfLocations } from '../strengthPlan';
import { goalProfile, type GoalKind } from '../planner/goals';
import { e1rm } from '../strengthStats';
import { daysBetween } from '../planner/dates';
import type {
  InjuryArea, LiftKey, ParqKey, PrimaryGoal, RunStarted, SetupExtras, SkillKey, SkillLevel, StrengthGoalKind, StrengthXp, TrainLocation, Weekday,
} from '../types';

export const PRIMARY_GOALS: PrimaryGoal[] = ['running', 'strength', 'hybrid', 'lose', 'fitness'];
export const STRENGTH_GOALS: StrengthGoalKind[] = ['maxStrength', 'muscle', 'prevention', 'composition', 'functional'];
export const RUN_STARTED: RunStarted[] = ['never', 'lt6m', 'm6to12', 'y1to3', 'gt3y'];
export const STRENGTH_XP: StrengthXp[] = ['none', 'lt6m', 'm6to24', 'gt2y'];
export const LOCATIONS: TrainLocation[] = ['gym', 'homeGym', 'bodyweight', 'outdoor'];
export const LIFTS: LiftKey[] = [...LIFT_KEYS];
export const SKILLS: SkillKey[] = ['squat', 'deadlift', 'lunge', 'pushup', 'pullup'];
export const PARQ: ParqKey[] = ['heart', 'dizzy', 'chest', 'meds'];
/** Regions of the body for the injury questions (7.2 and 7.4). */
export const REGIONS: InjuryArea[] = ['knee', 'achilles', 'shin', 'hip', 'back', 'shoulder', 'wrist', 'foot', 'other'];
export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
/** Minutes per day the person can offer; 0 = no time that day, 120 = "120 or more" (no limit). */
export const DAY_MINUTES = [0, 30, 45, 60, 90, 120] as const;
/** Session lengths of the strength questions and the number stored (what the planner takes). */
export const STRENGTH_MINUTES = [30, 45, 60, 75] as const;

/** Default share of running for what the person wants most (they can move the slider). */
export const defaultRunPct = (p: PrimaryGoal): number => ({ running: 80, strength: 20, hybrid: 50, lose: 50, fitness: 50 })[p];

/** The goal of the plan when there is no race: a time trial for "get faster at running", a hybrid or a general fitness plan. */
export const noRaceGoal = (p: PrimaryGoal): GoalKind => (p === 'running' ? 'faster' : p === 'strength' || p === 'hybrid' ? 'hybrid' : 'fitness');

/** The primary goal behind an existing plan goal (for people who set up before the questionnaire had it). */
export const primaryOfGoal = (g: GoalKind | undefined): PrimaryGoal =>
  g === 'hybrid' ? 'hybrid' : g === 'fitness' || g === 'comeback' ? 'fitness' : 'running';

/** The plan lengths offered when there is no race date (4, 8, 12, 16 weeks), kept to what the goal allows. */
export const planWeekChoices = (goal: GoalKind, distanceM?: number | null): number[] => {
  const w = goalProfile(goal, distanceM).weeks;
  const choices = [4, 8, 12, 16].filter((n) => n >= w.min && n <= w.max);
  return choices.length ? choices : [w.default];
};

export interface StrengthCount {
  /** Strength sessions per week to plan: the person's choice when they made one, else the recommendation. */
  count: number;
  /** What the planner recommends for these answers. */
  recommended: number;
  /** What the share of running and strength asks for. */
  desired: number;
  /** The most that fit into the week (the free days, and without double days the days without a run), never above four. */
  max: number;
  /** Why the recommendation is below what is asked for: the person lifts little at the moment, or there is no free day. */
  limitedBy: 'now' | 'days' | null;
}

/**
 * Strength sessions per week next to the runs.
 *  - The share of running and strength asks for a number (at least one with a strength share, at most four).
 *  - What the person already does is kept (up to three): going from three sessions to one would be a step back, not a plan.
 *    Runners gain from two to three sessions a week (Rønnestad & Mujika 2014, Berryman et al. 2018).
 *  - It never jumps more than two above what the person lifts now.
 *  - Without double days only the days without a run take a session.
 * A number the person chose in the plan wins over the recommendation, within what fits.
 */
export function strengthCount(input: { runs: number; runPct: number; strengthNow: number | null; strengthWanted?: number | null; freeDays: number; doubles: boolean | null }): StrengthCount {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const runs = Math.max(1, input.runs);
  const none = input.runPct >= 100;
  const desired = none ? 0 : input.runPct <= 0 ? 4 : clamp(Math.round((runs * (100 - input.runPct)) / input.runPct), 1, 4);
  const habit = Math.min(input.strengthNow ?? 0, 3);
  const capNow = (input.strengthNow ?? 0) + 2;
  const capDays = input.doubles === false ? Math.max(0, input.freeDays - runs) : input.freeDays;
  const max = none ? 0 : Math.min(4, capDays);
  const ask = Math.max(desired, habit);
  const recommended = none ? 0 : Math.max(0, Math.min(ask, capNow, max));
  const limitedBy = recommended >= ask ? null : max <= capNow ? 'days' : 'now';
  const count = none ? 0 : input.strengthWanted === null || input.strengthWanted === undefined ? recommended : clamp(input.strengthWanted, 0, max);
  return { count, recommended, desired, max, limitedBy };
}

/** Length of a strength session from the time the person has: the middle of their days, as one of the lengths the planner uses. */
export function strengthMinutesOf(minutes: (number | null)[], unavailable: Weekday[]): number {
  const values = ALL_DAYS.filter((d) => !unavailable.includes(d)).map((d) => Math.min(minutes[d] ?? 60, 90)).sort((x, y) => x - y);
  const median = values.length ? values[Math.floor(values.length / 2)] : 60;
  return median <= 37 ? 30 : median <= 52 ? 45 : median <= 67 ? 60 : 75;
}

/** How long the person has been running -> the experience the engine uses and the years that go with it. */
export const runExperienceOf = (s: RunStarted): 'new' | 'some' | 'long' => (s === 'never' || s === 'lt6m' ? 'new' : s === 'gt3y' ? 'long' : 'some');
export const RUN_YEARS: Record<RunStarted, number> = { never: 0, lt6m: 0.25, m6to12: 0.75, y1to3: 2, gt3y: 4 };

/** Intervals and tempo runs -> how structured their running is. */
export const intensityOf = (x: 'never' | 'rare' | 'regular'): 'easy' | 'mixed' | 'structured' => (x === 'never' ? 'easy' : x === 'rare' ? 'mixed' : 'structured');

export const liftingLevelOf = (xp: StrengthXp): LiftingLevel => (xp === 'none' || xp === 'lt6m' ? 'new' : xp === 'm6to24' ? 'some' : 'experienced');

/** What they train with, from where they train. */
export function kindsOfLocations(locations: TrainLocation[]): TrainKind[] {
  const out = new Set<TrainKind>();
  if (locations.includes('gym')) {
    out.add('free');
    out.add('machines');
  }
  if (locations.includes('homeGym')) out.add('free');
  if (locations.includes('bodyweight') || locations.includes('outdoor')) out.add('bodyweight');
  return (['free', 'machines', 'bodyweight'] as TrainKind[]).filter((k) => out.has(k));
}

/** Equipment that is preselected for the places where the person trains. */
export const gearFor = (locations: TrainLocation[]): Gear[] => gearOfLocations(locations);

/** Joints the strength suggestions steer around: where it hurts now and what keeps coming back. */
export function limitationsOf(s: Pick<SetupExtras, 'injuriesNow' | 'injuryAreas' | 'injuriesPast'>): Limitation[] {
  const areas: InjuryArea[] = [...(s.injuriesNow === false ? [] : s.injuryAreas), ...s.injuriesPast];
  const map: Partial<Record<InjuryArea, Limitation>> = { knee: 'knee', back: 'back', shoulder: 'shoulder', wrist: 'wrist' };
  return [...new Set(areas.flatMap((a) => (map[a] ? [map[a]!] : [])))];
}

/** Why the person lifts, as the strength planner wants it. */
export function strengthGoalOf(s: Pick<SetupExtras, 'strengthGoals' | 'primary'>): StrengthGoal {
  const g = s.strengthGoals;
  if (g.includes('prevention') && (s.primary === 'running' || s.primary === 'hybrid' || !s.primary)) return 'running';
  if (g.includes('maxStrength')) return 'strong';
  if (g.includes('muscle') || g.includes('composition')) return 'muscle';
  if (g.includes('prevention')) return 'running';
  if (g.includes('functional')) return 'health';
  switch (s.primary) {
    case 'strength': return 'muscle';
    case 'lose': case 'fitness': return 'health';
    default: return 'running';
  }
}

/** Per movement pattern the highest exercise level, where the person said they are unsure; "ok" caps at intermediate, "sure" does not cap. */
export function levelCapsOf(skills: Partial<Record<SkillKey, SkillLevel>>): Record<string, 0 | 1 | 2> {
  const pattern: Record<SkillKey, string> = { squat: 'squat', deadlift: 'hinge', lunge: 'lunge', pushup: 'push_h', pullup: 'pull_v' };
  const out: Record<string, 0 | 1 | 2> = {};
  for (const k of SKILLS) {
    const v = skills[k];
    if (v === 'unsure') out[pattern[k]] = 0;
    else if (v === 'ok') out[pattern[k]] = 1;
  }
  return out;
}

/** Known lifts (weight × repetitions) -> an estimated one-repetition maximum per lift. */
export function liftsToE1rm(lifts: Partial<Record<LiftKey, { kg: number | null; reps: number | null }>>): Partial<Record<LiftId, number>> {
  const out: Partial<Record<LiftId, number>> = {};
  for (const k of LIFTS) {
    const l = lifts[k];
    const v = l?.kg && l.reps ? e1rm(l.kg, Math.min(12, l.reps)) : null;
    if (v) out[k] = Math.round(v * 10) / 10;
  }
  return out;
}

/** The days a person cannot train: the days without time plus the ones that have to stay free. */
export const unavailableByMinutes = (minutes: (number | null)[], rest: Weekday[]): Weekday[] => ALL_DAYS.filter((d) => minutes[d] === 0 || rest.includes(d));

/** The long run on "any day": the weekend if it is free, else the last free day. */
export function anyLongDay(free: Weekday[]): Weekday {
  if (free.includes(6)) return 6;
  if (free.includes(5)) return 5;
  return free[free.length - 1] ?? 6;
}

/** Catalogue keys named in a free text ("Burpees, Deadlift"): matched against the English and the German names. */
export function keysInText(text: string, names: { key: string; en: string; de: string }[]): string[] {
  const parts = text.toLowerCase().split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.length >= 3);
  return names.filter((n) => parts.some((p) => n.en.toLowerCase().includes(p) || n.de.toLowerCase().includes(p))).map((n) => n.key);
}

export const parqFlagged = (p: Partial<Record<ParqKey, boolean>>): boolean => PARQ.some((k) => p[k] === true);
export const parqAnswered = (p: Partial<Record<ParqKey, boolean>>): boolean => PARQ.every((k) => typeof p[k] === 'boolean');

/** Does a date fall into one of the breaks (inclusive)? */
export const inBreak = (date: string, breaks: { from: string; to: string }[]): boolean => breaks.some((b) => b.from && b.to && date >= b.from && date <= b.to);

/** A break with its length in days (a break of one day is from = to). */
export const breakDays = (b: { from: string; to: string }): number => (b.from && b.to ? daysBetween(b.from, b.to) + 1 : 0);
