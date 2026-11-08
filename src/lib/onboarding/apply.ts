// What a changed answer does to the rest: the screens of the questionnaire call these, so the plan engine's fields (goal, level,
// run days, strength sessions, free days) always follow the answers. Pure functions on a model of both parts of the setup.

import { styleOf, type StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { exerciseName } from '../../../supabase/functions/_shared/content';
import { applyAutoWeek, applyManualWeek, autoWeek, statesOf, usableLongDay, weekInputOf, type DayState } from '../planner/week';
import { withStrengthSessions } from './strengthMap';
import { isRaceGoal, type GoalKind } from '../planner/goals';
import { CATALOG } from '../strengthPlan';
import type { OnboardingAnswers, PrimaryGoal, RaceKey, SetupExtras, TrainLocation, Weekday } from '../types';
import {
  defaultRunPct, gearFor, intensityOf, keysInText, kindsOfLocations, levelCapsOf, liftingLevelOf, liftsToE1rm, limitationsOf, noRaceGoal,
  planWeekChoices, runExperienceOf, strengthCount, strengthGoalOf, strengthMinutesOf, unavailableByMinutes, ALL_DAYS, RUN_YEARS, type StrengthCount,
} from './catalog';
import { LEVEL_OF_EXPERIENCE, applyGoal, applyPersonal, applyRaces, type GoalInput } from './derive';
import type { IntervalXp, RunStarted, Surface } from '../types';

export interface Model {
  a: OnboardingAnswers;
  strength: StrengthPrefs;
}

const withSetup = (m: Model, patch: Partial<SetupExtras>): Model => ({ ...m, a: { ...m.a, setup: { ...m.a.setup!, ...patch } } });

/** Writes a goal into the engine's fields; the plan length stays when it is still possible for the new goal. */
function goalPatch(a: OnboardingAnswers, goal: GoalKind, today: string, over: Partial<GoalInput> = {}): OnboardingAnswers {
  const keep = a.planWeeks && planWeekChoices(goal, a.raceDistanceM).includes(a.planWeeks) ? a.planWeeks : null;
  return applyGoal(a, { goal, distanceM: goal === 'faster' ? (a.raceDistanceM ?? 10_000) : null, date: null, weeks: keep, mode: 'finish', timeS: null, ...over }, today);
}

/** What they want most: sets the share of running and, without a race, the goal of the plan. */
export function setPrimary(m: Model, primary: PrimaryGoal, today: string): Model {
  const s = m.a.setup!;
  let next = withSetup(m, {
    primary,
    strengthWanted: null,
    runPct: defaultRunPct(primary),
    secondaryGoal: primary === 'lose' ? 'weight' : s.secondaryGoal === 'weight' ? null : s.secondaryGoal,
  });
  const racing = s.hasRace === true && !!next.a.goal && isRaceGoal(next.a.goal);
  if (!racing) next = { ...next, a: goalPatch(next.a, noRaceGoal(primary), today) };
  return refresh(next);
}

/** The slider: share of running in the training, 0–100. Without any running there is no race to prepare for. */
export function setRunPct(m: Model, pct: number, today: string): Model {
  const runPct = Math.max(0, Math.min(100, Math.round(pct)));
  const next = withSetup(m, { runPct, strengthWanted: null });
  return refresh(runPct <= 0 && m.a.setup!.hasRace ? setHasRace(next, false, today) : next);
}

/** "Do you have a race?" Yes starts with no distance chosen; no puts the plan on the goal of the primary choice. */
export function setHasRace(m: Model, yes: boolean, today: string): Model {
  const s = m.a.setup!;
  let next = withSetup(m, { hasRace: yes, timeUnknown: false });
  if (yes) {
    // Switching to "yes" starts without a distance (a time trial from the main goal is not a race the person named).
    if (s.hasRace !== true) next = { ...next, a: { ...next.a, goal: undefined, planWeeks: null, raceDate: '', goalType: 'finish', goalTimeS: null } };
  } else {
    next = { ...next, a: goalPatch(next.a, noRaceGoal(s.primary ?? 'fitness'), today) };
  }
  return next;
}

/** The race distance: a race goal, or "other" = a time trial over a distance. The date stays when only the distance changed. */
export function setRaceKind(m: Model, kind: GoalKind, today: string): Model {
  const a = m.a;
  const hadDate = !!a.goal && isRaceGoal(a.goal) && !a.planWeeks && !!a.raceDate;
  const n = applyGoal(a, { goal: kind, distanceM: kind === 'faster' ? (a.raceDistanceM ?? 10_000) : null, date: null, weeks: null, mode: 'finish', timeS: null }, today);
  return { ...m, a: { ...n, planWeeks: null, raceDate: hadDate ? a.raceDate : '' } };
}

/** Plan length when there is no race date. */
export function setPlanWeeks(m: Model, weeks: number, today: string): Model {
  const g = m.a.goal ?? noRaceGoal(m.a.setup!.primary ?? 'fitness');
  return { ...m, a: applyGoal(m.a, { goal: g, distanceM: g === 'faster' ? (m.a.raceDistanceM ?? 10_000) : null, date: null, weeks, mode: 'finish', timeS: null }, today) };
}

/** The week with the runs only (what the person sees before the strength questions). */
export function runOnlyWeek(a: OnboardingAnswers) {
  return autoWeek(weekInputOf(a, withStrengthSessions(a.extras, 0)));
}

/** How many strength sessions go next to the runs for these answers. */
export function strengthPlanOf(a: OnboardingAnswers): StrengthCount {
  const s = a.setup!;
  return strengthCount({ runs: a.runDaysPerWeek, runPct: s.runPct, strengthNow: s.strengthNow, strengthWanted: s.strengthWanted, freeDays: 7 - s.unavailableDays.length, doubles: s.doubles });
}

/**
 * Everything the time and frequency answers decide: the days without time, the number of runs, the long-run day and, once the
 * strength questions have been reached, the number of strength sessions. The week is planned again (a drawn week is dropped,
 * because the answers it was drawn for have changed).
 */
export function refresh(m: Model): Model {
  const s = m.a.setup!;
  const unavailable = unavailableByMinutes(s.minutesPerDay, s.restDays);
  const free = ALL_DAYS.filter((d) => !unavailable.includes(d));
  const runs = Math.min(Math.max(2, Math.min(7, s.runsWanted ?? m.a.runDaysPerWeek)), Math.max(2, free.length));
  const longRunDay = usableLongDay(m.a.longRunDay, unavailable);
  const base: OnboardingAnswers = { ...m.a, runDaysPerWeek: runs, longRunDay, setup: { ...s, unavailableDays: unavailable, daysAvail: free, runsWanted: s.runsWanted ?? runs } };
  const strengthN = s.runPct >= 100 ? 0 : m.strength.perWeek === null ? 0 : strengthPlanOf(base).count;
  return {
    a: applyAutoWeek(base, strengthN),
    strength: { ...m.strength, perWeek: s.runPct >= 100 ? 0 : m.strength.perWeek === null ? null : strengthN },
  };
}

/** The strength questions are answered: plan the strength sessions next to the runs. */
export function applyStrengthPlan(m: Model): Model {
  const count = m.a.setup!.runPct >= 100 ? 0 : strengthPlanOf(m.a).count;
  return { a: applyAutoWeek(m.a, count), strength: { ...m.strength, perWeek: count } };
}

/** How much time the person has on a weekday (0 = none, null = not answered). */
export function setMinutes(m: Model, day: Weekday, minutes: number | null): Model {
  return refresh(withSetup(m, { minutesPerDay: m.a.setup!.minutesPerDay.map((x, i) => (i === day ? minutes : x)) }));
}

/** Runs per week, the days they like to run on and the long-run day (or "any day"). */
export function setRunSettings(m: Model, patch: Partial<Pick<SetupExtras, 'runsWanted' | 'runDays' | 'runDaysMode' | 'longRunAny'>> & { longDay?: Weekday }): Model {
  const { longDay, ...rest } = patch;
  // Naming days is choosing them yourself.
  const base = withSetup(m, rest.runDays && !rest.runDaysMode ? { ...rest, runDaysMode: 'manual' } : rest);
  return refresh(longDay === undefined ? base : { ...base, a: { ...base.a, longRunDay: longDay, setup: { ...base.a.setup!, longRunAny: false } } });
}

/** Strength answers that change how many strength sessions fit: how much the person lifts now and whether days may be shared. */
export const setStrengthTime = (m: Model, patch: Partial<Pick<SetupExtras, 'strengthNow' | 'doubles'>>): Model => refresh(withSetup(m, { ...patch, strengthWanted: null }));

/** The number of strength sessions per week the person chose in the plan (null = back to the recommendation). */
export function setStrengthWanted(m: Model, n: number | null): Model {
  return applyStrengthPlan(withSetup(m, { strengthWanted: n }));
}

/** How many of the week's strength sessions are calisthenics (the total stays; the week is planned again). */
export function setCaliWanted(m: Model, n: number): Model {
  const total = m.strength.perWeek ?? 0;
  const a = { ...m.a, extras: withStrengthSessions(m.a.extras, total, Math.max(0, Math.min(total, n))) };
  // A drawn week keeps its days; only which strength session goes where is decided again.
  if (a.scheduleMode === 'custom' && a.customWeek) {
    const long = a.customWeek.findIndex((d) => d.run === 'long');
    return { a: applyManualWeek(a, statesOf(a.customWeek), (long >= 0 ? long : a.longRunDay) as Weekday), strength: m.strength };
  }
  return { a: applyAutoWeek(a, total), strength: m.strength };
}

/** A run is dragged to another day: the days the person likes to run on become the new set (the planner keeps to them). */
export function moveRunDay(m: Model, from: Weekday, to: Weekday): Model {
  const week = runOnlyWeek(m.a).week;
  const days = ALL_DAYS.filter((d) => week[d].run !== 'rest');
  if (!days.includes(from) || days.includes(to) || m.a.setup!.unavailableDays.includes(to)) return m;
  const wasLong = week[from].run === 'long';
  const next = withSetup(m, { runDays: [...days.filter((d) => d !== from), to].sort() as Weekday[], runDaysMode: 'manual' });
  return refresh(wasLong ? setRunSettings(next, { longDay: to }) : next);
}

/** A run or a strength session is dragged to another day of the week (the week becomes a drawn one). */
export function moveInWeek(m: Model, item: 'run' | 'strength', from: Weekday, to: Weekday): Model {
  const a = m.a;
  const custom = a.scheduleMode === 'custom' && !!a.customWeek;
  const week = custom ? a.customWeek! : autoWeek(weekInputOf(a, withStrengthSessions(a.extras, m.strength.perWeek ?? 0))).week;
  const states = statesOf(week);
  const has = (st: DayState, k: 'run' | 'strength') => (k === 'run' ? st === 'run' || st === 'both' : st === 'strength' || st === 'both');
  if (!has(states[from], item) || has(states[to], item) || a.setup!.unavailableDays.includes(to)) return m;
  const without = (st: DayState): DayState => (item === 'run' ? (st === 'both' ? 'strength' : 'rest') : st === 'both' ? 'run' : 'rest');
  const with_ = (st: DayState): DayState => (item === 'run' ? (st === 'strength' ? 'both' : 'run') : st === 'run' ? 'both' : 'strength');
  states[from] = without(states[from]);
  states[to] = with_(states[to]);
  const long = week.findIndex((d) => d.run === 'long') as Weekday;
  const next = applyManualWeek(a, states, item === 'run' && from === long ? to : long);
  return { a: next, strength: { ...m.strength, perWeek: states.filter((x) => x === 'strength' || x === 'both').length } };
}

/** Where the person trains: the kinds of training and the usual equipment of those places (which they then adjust). */
export function setLocations(m: Model, locations: TrainLocation[]): Model {
  const styles = kindsOfLocations(locations);
  return { a: { ...m.a, setup: { ...m.a.setup!, locations } }, strength: { ...m.strength, styles, equipment: styleOf(styles), gear: gearFor(locations) } };
}

export function setRunStarted(m: Model, v: RunStarted): Model {
  const experience = runExperienceOf(v);
  return { ...m, a: { ...m.a, level: LEVEL_OF_EXPERIENCE[experience], yearsRunning: RUN_YEARS[v], setup: { ...m.a.setup!, runStarted: v, experience } } };
}

export const setIntervals = (m: Model, v: IntervalXp): Model => withSetup(m, { intervals: v, intensity: intensityOf(v) });

export const setSurfaces = (m: Model, list: Surface[]): Model => withSetup(m, { surfaces: list, surface: list[0] ?? null });

/** The reference result (distance, time, date) anchors the training paces; "none" clears it. */
export function setRefRace(m: Model, ref: { distance: RaceKey; timeS: number | null; date: string | null } | null, none = false): Model {
  const racesDone = ref && ref.timeS ? [{ distance: ref.distance, pbS: ref.timeS }] : [];
  const a = applyRaces({ ...m.a, setup: { ...m.a.setup!, refRace: none ? null : ref, refNone: none, racesDone: none ? [] : racesDone } });
  return { ...m, a: a.recentRace && ref?.date ? { ...a, recentRace: { ...a.recentRace, date: ref.date } } : a };
}

const NAMES = CATALOG.map((x) => ({ key: x.key, en: x.name, de: exerciseName(x.name, 'de') }));

/** What is derived from the answers in the strength settings: level, joints to spare, goal, weights, caps, exclusions. */
export function syncStrength(p: StrengthPrefs, s: SetupExtras): StrengthPrefs {
  const next: StrengthPrefs = { ...p, weightUnit: s.weightUnit, avoid: limitationsOf(s), lifts: liftsToE1rm(s.lifts), levelCaps: levelCapsOf(s.skills), trainStyle: s.trainStyle };
  if (s.strengthXp) next.level = liftingLevelOf(s.strengthXp);
  if (s.minutesPerDay.some((v) => v !== null)) next.minutes = strengthMinutesOf(s.minutesPerDay, s.unavailableDays);
  if (s.primary || s.strengthGoals.length) next.goal = strengthGoalOf(s);
  next.excluded = [...new Set([...s.excluded, ...keysInText(s.excludedNote, NAMES)])];
  next.favorites = [...new Set([...s.favorites, ...keysInText(s.favoritesNote, NAMES)])].filter((k) => !next.excluded.includes(k));
  return JSON.stringify(next) === JSON.stringify(p) ? p : next;
}

/** Garmin values the person wants to enter themselves: the badges go and so do the values they replaced. */
export function clearGarminValues(a: OnboardingAnswers): OnboardingAnswers {
  const s = a.setup!;
  const from = new Set(s.fromGarmin);
  const next: OnboardingAnswers = { ...a, setup: { ...s, hrSource: { ...s.hrSource }, fromGarmin: [] } };
  if (from.has('restingHr')) {
    next.setup!.restingHr = null;
    next.setup!.hrSource.rest = null;
  }
  if (from.has('maxHr')) {
    next.maxHr = null;
    next.setup!.hrSource.max = null;
  }
  if (from.has('weeklyKm')) next.currentWeeklyKm = 20;
  if (from.has('runsNow')) next.setup!.runsNow = 3;
  if (from.has('longest')) next.longestRecentRunKm = 8;
  return next;
}

/** Everything the questionnaire derives, applied after a change (the shell calls this on every update). */
export function settle(m: Model, today: string): Model {
  const a = applyPersonal(m.a, today);
  return { a, strength: syncStrength(m.strength, a.setup!) };
}

