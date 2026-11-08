// The week of the setup: "plan for me" (the planner places runs and strength around the days the person cannot train) and the
// manual week (the person says per day: run, strength, both or rest). Both end in the same `DayTemplate[]` the plan engine reads.
//
// Rules the planner keeps (and the manual week is checked against, as warnings):
//  - hard runs (quality sessions and the long run) are not on consecutive days,
//  - heavy leg work is not the day before the long run or a hard run, and not on the long-run day,
//  - strength goes preferably on a hard-run day or on an easy day that is not the day before the long run,
//  - at least one day without anything, unless the person chose to run on all seven days.

import type { DayTemplate, ExtraSession, Level, OnboardingAnswers, Weekday } from '../types';
import { chooseLayout, type WeekLayout } from './layout';
import { extraLoad, placeExtras, type DayType } from './extras';
import { qualityFor, solveAroundRuns, solveWeek, type WeekModelInput, type WeekSolution } from './weekModel';
import { strengthMinutesOf } from '../onboarding/catalog';
import { STRENGTH_KINDS, isStrengthExtra, strengthKinds, withStrengthSessions, type StrengthKind } from '../onboarding/strengthMap';

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const circularGap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

export type DayState = 'rest' | 'run' | 'strength' | 'both';

export interface WeekInput {
  /** Strength sessions may share a day with a run (double days). */
  sameDay?: boolean;
  /** The days the person likes to run on. */
  preferred?: Weekday[];
  runDays: number;
  /** null = the planner picks the long-run day (the day with the most time). */
  longDay: Weekday | null;
  unavailable: Weekday[];
  level: Level;
  /** The extra sessions to place (strength first, then core, mobility and so on). */
  extras: ExtraSession[];
  /** Minutes per weekday (null = not answered, 120 = no limit); the sessions have to fit into them. */
  minutes?: (number | null)[];
  /** Minutes of a strength session. */
  strengthMin?: number;
}

function emptyWeek(): DayTemplate[] {
  return Array.from({ length: 7 }, () => ({ run: 'rest' as const, extras: [] as string[] }));
}

function fromLayout(layout: WeekLayout): { week: DayTemplate[]; dayType: DayType[] } {
  const week = emptyWeek();
  const dayType = Array<DayType>(7).fill('rest');
  for (const d of layout.runDays) {
    week[d].run = 'easy';
    dayType[d] = 'easy';
  }
  for (const d of layout.quality) {
    week[d].run = 'quality';
    dayType[d] = 'quality';
  }
  for (const d of layout.recoveryDays) {
    week[d].run = 'recovery';
    dayType[d] = 'recovery';
  }
  week[layout.longDay].run = 'long';
  dayType[layout.longDay] = 'long';
  return { week, dayType };
}

/** The long-run day, moved to the nearest day the person can train when the chosen one is blocked. */
export function usableLongDay(longDay: Weekday, unavailable: Weekday[]): Weekday {
  if (!unavailable.includes(longDay)) return longDay;
  const free = ALL_DAYS.filter((d) => !unavailable.includes(d));
  return (free.sort((a, b) => circularGap(a, longDay) - circularGap(b, longDay) || b - a)[0] ?? longDay) as Weekday;
}

/** The strength sessions of a list of extras, one entry per session of the week (leg work first). */
export function strengthOf(extras: ExtraSession[]): StrengthKind[] {
  const out: StrengthKind[] = [];
  for (const e of extras) if (isStrengthExtra(e)) for (let i = 0; i < e.perWeek; i++) out.push(e.id as StrengthKind);
  return out.sort((x, y) => STRENGTH_KINDS.indexOf(x) - STRENGTH_KINDS.indexOf(y));
}

/**
 * Plan for me. The weekly structure model (weekModel.ts) places the runs and the strength sessions from the time per weekday;
 * the other extras (core, mobility, cross-training) go on the lightest days that already carry a session.
 * Returns the week, how many of the wanted extra sessions found no day and the solution with the reasons.
 */
export function autoWeek(input: WeekInput): { week: DayTemplate[]; unplaced: number; longDay: Weekday; solution: WeekSolution } {
  return withOtherExtras(input, solveWeek(modelInput(input)));
}

/**
 * The week of a running plan that exists and stays as it is: the runs keep their days and kinds, and the strength sessions (then
 * the other extras) are placed around them by the same rules as "plan for me".
 */
export function aroundRuns(runWeek: DayTemplate[], input: WeekInput): { week: DayTemplate[]; unplaced: number; longDay: Weekday; solution: WeekSolution } {
  return withOtherExtras(input, solveAroundRuns(modelInput(input), runWeek));
}

function modelInput(input: WeekInput): WeekModelInput {
  const { unavailable, level, extras } = input;
  const free = ALL_DAYS.filter((d) => !unavailable.includes(d));
  const runDays = Math.max(1, Math.min(input.runDays, free.length));
  return {
    free,
    minutes: input.minutes ?? [],
    runs: runDays,
    longDay: input.longDay === null ? null : usableLongDay(input.longDay, unavailable),
    preferred: input.preferred ?? [],
    quality: qualityFor(level, runDays),
    level,
    strength: strengthOf(extras),
    strengthMin: input.strengthMin ?? 40,
    sameDay: input.sameDay !== false,
  };
}

/** The other extras (core, mobility, cross-training) on the lightest days that already carry a session. */
function withOtherExtras(input: WeekInput, solution: WeekSolution): { week: DayTemplate[]; unplaced: number; longDay: Weekday; solution: WeekSolution } {
  const { unavailable, extras } = input;
  const free = ALL_DAYS.filter((d) => !unavailable.includes(d));
  const week = solution.week;
  const dayType = week.map((d): DayType => (d.run === 'rest' ? 'rest' : d.run));
  const others = expand(extras.filter((e) => !isStrengthExtra(e)));
  const blocked = [...new Set<Weekday>([...unavailable, ...solution.restDays])];
  const placed = placeExtras(dayType, others, free, blocked, input.sameDay !== false);
  for (const { extra, day } of placed) week[day].extras.push(extra.id);
  return { week, unplaced: solution.unplaced + others.length - placed.length, longDay: solution.longDay, solution };
}

/** One entry per occurrence in the week, leg work first (it picks its day first). */
function expand(extras: ExtraSession[]): ExtraSession[] {
  const out: ExtraSession[] = [];
  for (const e of extras) for (let i = 0; i < e.perWeek; i++) out.push(e);
  const order = { legs: 0, cross: 1, light: 2 } as const;
  return out.sort((a, b) => order[extraLoad(a)] - order[extraLoad(b)]);
}

/** The week the person drew: per day run, strength, both or rest. Run types and the strength kinds are placed by the rules. */
export function manualWeek(states: DayState[], longDay: Weekday, level: Level, otherExtras: ExtraSession[] = []): DayTemplate[] {
  const runDays = ALL_DAYS.filter((d) => states[d] === 'run' || states[d] === 'both');
  const strengthDays = ALL_DAYS.filter((d) => states[d] === 'strength' || states[d] === 'both');
  const week = emptyWeek();
  if (!runDays.length) {
    assignStrength(week, strengthDays, otherExtras);
    return week;
  }
  const long = runDays.includes(longDay) ? longDay : (runDays[runDays.length - 1] as Weekday);
  const layout = chooseLayout(runDays, runDays.length, long, qualityFor(level, runDays.length));
  const { week: runWeek, dayType } = fromLayout(layout);
  assignStrength(runWeek, strengthDays, otherExtras, dayType);
  return runWeek;
}

/** Puts the strength kinds on the chosen days: leg sessions where legs have a day to recover, upper body on the others. */
function assignStrength(week: DayTemplate[], days: Weekday[], others: ExtraSession[], dayType: DayType[] = Array<DayType>(7).fill('rest')) {
  if (!days.length) return;
  const kinds: StrengthKind[] = strengthKinds(days.length);
  // Fewer than the picked days can never happen (4 or more all get a kind): repeat the pattern.
  while (kinds.length < days.length) kinds.push(kinds[kinds.length % 4]);
  const legsFit = (d: number) => {
    const next = dayType[(d + 1) % 7];
    let s = 0;
    if (dayType[d] === 'long') s -= 100;
    if (next === 'long') s -= 60;
    if (next === 'quality') s -= 40;
    if (dayType[d] === 'quality') s += 10;
    if (dayType[d] === 'recovery') s -= 10;
    return s;
  };
  const byFit = [...days].sort((a, b) => legsFit(b) - legsFit(a) || a - b);
  const legs = kinds.filter((k) => k !== 'upper');
  const upper = kinds.filter((k) => k === 'upper');
  const order = [...legs, ...upper];
  byFit.forEach((d, i) => week[d].extras.push(order[i]));
  // Other extras (core, mobility, cross-training) go on the lightest days that already have a session; a day the person
  // marked as rest stays free.
  const easy = ALL_DAYS.filter((d) => week[d].run === 'easy' || week[d].run === 'recovery');
  const strengthOnly = ALL_DAYS.filter((d) => week[d].run === 'rest' && week[d].extras.length > 0);
  const spots = [...easy, ...strengthOnly];
  let n = 0;
  for (const e of others) for (let i = 0; i < e.perWeek && n < spots.length * 2; i++, n++) {
    const d = spots[n % Math.max(1, spots.length)];
    if (d !== undefined && !week[d].extras.includes(e.id)) week[d].extras.push(e.id);
  }
}

/** The state per day of an existing week (for the manual editor). */
export function statesOf(week: DayTemplate[], strengthIds: string[] = ['lower', 'upper', 'full']): DayState[] {
  return week.map((d) => {
    const run = d.run !== 'rest';
    const strength = d.extras.some((id) => strengthIds.includes(id));
    return run && strength ? 'both' : run ? 'run' : strength ? 'strength' : 'rest';
  });
}

export type WeekIssueKey =
  | 'noLong' | 'fewRuns'
  | 'hardBackToBack' | 'qualityBeforeLong' | 'legsBeforeLong' | 'legsOnLong' | 'noRest'
  | 'runsMismatch' | 'strengthMismatch' | 'unplaced';
export interface WeekIssue {
  key: WeekIssueKey;
  severity: 'error' | 'warn';
  params?: Record<string, number>;
}

/** What is wrong with a week. Errors stop the setup (the engine needs a long run); everything else is a warning. */
export function weekIssues(
  week: DayTemplate[],
  ctx: { extras: ExtraSession[]; runsWanted: number | null; strengthWanted: number | null; lowestRuns?: number },
): WeekIssue[] {
  const out: WeekIssue[] = [];
  const runDays = ALL_DAYS.filter((d) => week[d].run !== 'rest');
  const longDays = ALL_DAYS.filter((d) => week[d].run === 'long');
  if (longDays.length !== 1) out.push({ key: 'noLong', severity: 'error' });
  if (runDays.length < 2) out.push({ key: 'fewRuns', severity: 'error', params: { n: 2 } });
  else if (ctx.lowestRuns && runDays.length < ctx.lowestRuns) out.push({ key: 'fewRuns', severity: 'warn', params: { n: ctx.lowestRuns } });

  const hard = ALL_DAYS.filter((d) => week[d].run === 'quality' || week[d].run === 'long');
  if (hard.some((d, i) => hard.slice(i + 1).some((e) => circularGap(d, e) === 1))) out.push({ key: 'hardBackToBack', severity: 'warn' });

  const legs = new Set(ctx.extras.filter((e) => extraLoad(e) === 'legs').map((e) => e.id));
  const long = longDays[0];
  if (long !== undefined) {
    const before = ((long + 6) % 7) as Weekday;
    if (week[before].run === 'quality') out.push({ key: 'qualityBeforeLong', severity: 'warn' });
    if (week[before].extras.some((id) => legs.has(id))) out.push({ key: 'legsBeforeLong', severity: 'warn' });
    if (week[long].extras.some((id) => legs.has(id))) out.push({ key: 'legsOnLong', severity: 'warn' });
  }
  const empty = ALL_DAYS.filter((d) => week[d].run === 'rest' && !week[d].extras.length);
  if (!empty.length && runDays.length < 7) out.push({ key: 'noRest', severity: 'warn' });

  if (ctx.runsWanted !== null && runDays.length !== ctx.runsWanted) out.push({ key: 'runsMismatch', severity: 'warn', params: { have: runDays.length, want: ctx.runsWanted } });
  const strengthIds = ['lower', 'upper', 'full'];
  const strengthDays = week.filter((d) => d.extras.some((id) => strengthIds.includes(id))).length;
  if (ctx.strengthWanted !== null && strengthDays !== Math.min(ctx.strengthWanted, 7)) out.push({ key: 'strengthMismatch', severity: 'warn', params: { have: strengthDays, want: ctx.strengthWanted } });
  return out;
}

/** The inputs of the automatic week from the answers. */
export function weekInputOf(a: OnboardingAnswers, extras: ExtraSession[] = a.extras): WeekInput {
  const s = a.setup;
  // Days the person has no time for, and days outside the list of days the engine may use.
  const unavailable = ALL_DAYS.filter((d) => s?.unavailableDays.includes(d) || (a.availableDays.length > 0 && !a.availableDays.includes(d)));
  return {
    runDays: a.runDaysPerWeek,
    // "Any day" = the planner picks the day with the most time.
    longDay: s?.longRunAny ? null : a.longRunDay,
    unavailable,
    level: a.level,
    extras,
    sameDay: s?.doubles !== false,
    // The days the person named only count when they chose to set the days themselves.
    preferred: s?.runDaysMode === 'manual' ? s.runDays : [],
    minutes: s?.minutesPerDay,
    strengthMin: s ? strengthMinutesOf(s.minutesPerDay, unavailable) : undefined,
  };
}

/** "Plan for me": the answers get the days the planner would use (the plan engine places them again each week). */
export function applyAutoWeek(a: OnboardingAnswers, strengthPerWeek: number): OnboardingAnswers {
  const unavailable = a.setup?.unavailableDays ?? [];
  const extras = withStrengthSessions(a.extras, strengthPerWeek);
  // The long-run day follows the model when the planner picks it, else it is the person's day (moved if it has no time).
  const availableDays = ALL_DAYS.filter((d) => !unavailable.includes(d));
  const longRunDay = a.setup?.longRunAny ? autoWeek(weekInputOf({ ...a, extras, availableDays }, extras)).longDay : usableLongDay(a.longRunDay, unavailable);
  return {
    ...a,
    scheduleMode: 'auto',
    customWeek: null,
    extras,
    longRunDay,
    availableDays,
    // The wanted number of runs stays as asked; blocked days only limit what fits (the engine and finalize() clamp it).
  };
}

/** The drawn week: the extras follow the number of strength days, the run days and the long-run day follow the drawing. */
export function applyManualWeek(a: OnboardingAnswers, states: DayState[], longDay: Weekday): OnboardingAnswers {
  const strengthDays = states.filter((s) => s === 'strength' || s === 'both').length;
  const others = a.extras.filter((e) => !isStrengthExtra(e));
  const customWeek = manualWeek(states, longDay, a.level, others);
  return {
    ...a,
    scheduleMode: 'custom',
    customWeek,
    extras: withStrengthSessions(others, strengthDays),
    longRunDay: (customWeek.findIndex((d) => d.run === 'long') >= 0 ? customWeek.findIndex((d) => d.run === 'long') : longDay) as Weekday,
    availableDays: ALL_DAYS.filter((d) => customWeek[d].run !== 'rest'),
    runDaysPerWeek: Math.max(1, customWeek.filter((d) => d.run !== 'rest').length),
  };
}
