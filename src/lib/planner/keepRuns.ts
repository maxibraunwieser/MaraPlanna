// Strength added to a running plan that already exists and stays as it is. The runs are taken from the database, never rebuilt:
//  - the usual week of the stored plan (which weekday has the long run, the hard runs, the easy runs) is read from its workouts,
//  - the strength days are chosen around that week by the same rules as a new plan (weekModel.ts),
//  - then every week of the stored plan gets its strength sessions on those days, checked against the runs of that very week
//    (a run the coach moved, a recovery week, the race week): a session that would break a rule there moves to another day of
//    the week or is left out. No run is moved, changed or created; only the strength part of the stored inputs changes.

import type { Routine } from '../../../supabase/functions/_shared/strength';
import type { DayTemplate, OnboardingAnswers, PlannedWorkout, RunSlot, TrainingPlan, WeekSummary, Weekday, WorkoutDraft, WorkoutKind } from '../types';
import { addDays, mondayOf } from './dates';
import { EXTRA_INFO, extraLoad, extraSession, extrasForWeek } from './extras';
import type { GeneratedPlan } from './generate';
import { aroundRuns, weekInputOf } from './week';
import { daySuitability, type DayKind } from './weekModel';

export const STRENGTH_DB_KINDS: WorkoutKind[] = ['strength_lower', 'strength_upper', 'strength_full', 'strength_cali', 'core'];

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const STRENGTH_IDS = ['lower', 'upper', 'full', 'cali'];
/** How many weeks ahead the usual week of the stored plan is read from. */
const WEEKS_READ = 6;

const isStrength = (w: { kind: string }) => (STRENGTH_DB_KINDS as string[]).includes(w.kind);
/** A strength session that has not happened yet: the one kind of workout that is replaced when strength is set up again. */
const isOpenStrength = (w: PlannedWorkout, today: string) => isStrength(w) && w.status === 'planned' && w.date >= today;

/** The run slot of a stored workout (null for everything that is not a run; the race is its own case). */
export function runSlotOf(kind: WorkoutKind): RunSlot | 'race' | null {
  switch (kind) {
    case 'long':
    case 'long_mp':
      return 'long';
    case 'threshold':
    case 'intervals':
    case 'marathon_pace':
    case 'fartlek':
      return 'quality';
    case 'recovery':
      return 'recovery';
    case 'easy':
    case 'shakeout':
      return 'easy';
    case 'race':
      return 'race';
    default:
      return null;
  }
}

const HARDNESS: Record<RunSlot | 'race', number> = { rest: 0, recovery: 1, easy: 2, quality: 3, long: 4, race: 5 };
const harder = <T extends RunSlot | 'race'>(a: T, b: T): T => (HARDNESS[b] > HARDNESS[a] ? b : a);

/** The hardest run on each date of the stored plan. */
function runsByDate(current: PlannedWorkout[]): Map<string, RunSlot | 'race'> {
  const out = new Map<string, RunSlot | 'race'>();
  for (const w of current) {
    const slot = runSlotOf(w.kind);
    if (slot) out.set(w.date, harder(out.get(w.date) ?? 'rest', slot));
  }
  return out;
}

/**
 * The usual week of the stored plan: for each weekday the run it has most often in the coming weeks (the race week left out),
 * with exactly one long run. Null when the plan has no runs.
 */
export function storedRunWeek(current: PlannedWorkout[], today: string): DayTemplate[] | null {
  const byDate = runsByDate(current);
  if (!byDate.size) return null;
  const raceWeeks = new Set([...byDate].filter(([, s]) => s === 'race').map(([d]) => mondayOf(d)));
  const allWeeks = [...new Set([...byDate.keys()].map(mondayOf))].filter((m) => !raceWeeks.has(m)).sort();
  const coming = allWeeks.filter((m) => addDays(m, 6) >= today);
  const weeks = (coming.length ? coming : allWeeks).slice(0, WEEKS_READ);
  if (!weeks.length) return null;

  const counts = ALL_DAYS.map(() => new Map<RunSlot, number>());
  for (const monday of weeks) {
    for (const d of ALL_DAYS) {
      const s = byDate.get(addDays(monday, d)) ?? 'rest';
      const slot: RunSlot = s === 'race' ? 'long' : s;
      counts[d].set(slot, (counts[d].get(slot) ?? 0) + 1);
    }
  }
  const pick = (m: Map<RunSlot, number>): RunSlot => [...m].sort((a, b) => b[1] - a[1] || HARDNESS[b[0]] - HARDNESS[a[0]])[0][0];
  const week: DayTemplate[] = counts.map((m) => ({ run: pick(m), extras: [] }));

  // Exactly one long run: the weekday that has it most often.
  const longs = ALL_DAYS.map((d) => counts[d].get('long') ?? 0);
  const longDay = longs.indexOf(Math.max(...longs));
  week.forEach((d, i) => {
    if (i !== longDay && d.run === 'long') d.run = 'easy';
  });
  if (longs[longDay] > 0) week[longDay].run = 'long';
  return week;
}

const strengthIdsOf = (week: DayTemplate[]) => week.flatMap((d) => d.extras.filter((id) => STRENGTH_IDS.includes(id))).sort().join(',');
const runsOf = (week: DayTemplate[]) => week.map((d) => d.run).join(',');

/**
 * The week of the stored plan with the strength days on it: the one the person arranged (when it still fits the runs and the
 * number of sessions), otherwise the strength days chosen around the runs. Null when the plan has no runs.
 */
export function keptWeekFor(a: OnboardingAnswers, current: PlannedWorkout[], today: string, extras = a.extras): { week: DayTemplate[]; unplaced: number } | null {
  const runWeek = storedRunWeek(current, today);
  if (!runWeek) return null;
  const auto = aroundRuns(runWeek, weekInputOf({ ...a, extras }, extras));
  const own = a.setup?.keptWeek;
  if (own?.length === 7 && runsOf(own) === runsOf(runWeek) && strengthIdsOf(own) === strengthIdsOf(auto.week)) return { week: own, unplaced: auto.unplaced };
  return { week: auto.week, unplaced: auto.unplaced };
}

/** A strength session dragged to another day of the kept week (never onto the long run, a day without time or a day with one). */
export function moveKeptStrength(week: DayTemplate[], from: Weekday, to: Weekday, unavailable: Weekday[]): DayTemplate[] {
  const id = week[from].extras.find((x) => STRENGTH_IDS.includes(x));
  if (!id || from === to || unavailable.includes(to) || week[to].run === 'long' || week[to].extras.some((x) => STRENGTH_IDS.includes(x))) return week;
  return week.map((d, i) => (i === from ? { ...d, extras: d.extras.filter((_, j) => j !== d.extras.indexOf(id)) } : i === to ? { ...d, extras: [...d.extras, id] } : d));
}

/**
 * The strength sessions for the weeks of the stored plan, from today to its last day. Each session goes on its day of the kept
 * week when the runs of that week allow it, else on the best other day of the same week, else it is left out. Rules: never on
 * the day of the long run or the race, never on a day without time, one per day, leg work never the day before the long run, a
 * hard run or the race and never on the day next to other leg work, and no run and strength on one day when doubles are off.
 */
export function keptStrengthSessions(plan: TrainingPlan, current: PlannedWorkout[], answers: OnboardingAnswers, routines: Routine[] | undefined, week: DayTemplate[], today: string): WorkoutDraft[] {
  const runs = runsByDate(current);
  const lastDay = current.reduce((m, w) => (w.date > m ? w.date : m), today);
  const taken = new Set(current.filter((w) => isStrength(w) && !isOpenStrength(w, today)).map((w) => w.date));
  const unavailable = new Set(answers.setup?.unavailableDays ?? []);
  const doubles = answers.setup?.doubles !== false;
  const legDates = new Set<string>();
  const out: WorkoutDraft[] = [];
  const slot = (date: string) => runs.get(date) ?? 'rest';

  for (const w of plan.weeks) {
    const monday = mondayOf(w.startDate);
    if (addDays(monday, 6) < today || monday > lastDay) continue;
    const dates = ALL_DAYS.map((d) => addDays(monday, d));
    const raceWeek = dates.some((d) => slot(d) === 'race');
    const kinds = dates.map((d): DayKind => {
      const s = slot(d);
      return s === 'race' ? 'long' : s;
    });
    const pool = new Map<string, Weekday[]>();
    ALL_DAYS.forEach((d) => week[d].extras.forEach((id) => pool.set(id, [...(pool.get(id) ?? []), d])));

    for (const extra of extrasForWeek(answers.extras, w.phase, w.recovery, raceWeek)) {
      if (!(STRENGTH_DB_KINDS as string[]).includes(EXTRA_INFO[extra.type].kind)) continue;
      const legs = extraLoad(extra) === 'legs';
      const fits = (d: Weekday) => {
        const date = dates[d];
        const s = slot(date);
        if (date < today || date > lastDay || taken.has(date) || unavailable.has(d)) return false;
        if (s === 'long' || s === 'race' || (!doubles && s !== 'rest')) return false;
        if (legs) {
          const next = slot(addDays(date, 1));
          if (next === 'long' || next === 'race' || next === 'quality') return false;
          if (legDates.has(addDays(date, 1)) || legDates.has(addDays(date, -1))) return false;
        }
        return true;
      };
      const preferred = pool.get(extra.id) ?? [];
      const score = (d: Weekday) => daySuitability(legs ? 'lower' : 'upper', d, kinds);
      const others = ALL_DAYS.filter((d) => !preferred.includes(d)).sort((x, y) => score(y) - score(x) || x - y);
      const day = [...preferred, ...others].find(fits);
      if (day === undefined) continue;
      const i = preferred.indexOf(day);
      if (i >= 0) pool.set(extra.id, preferred.filter((_, j) => j !== i));
      const date = dates[day];
      taken.add(date);
      if (legs) legDates.add(date);
      const s = extraSession(extra, w.phase, w.recovery, answers.equipment, routines?.find((r) => r.id === extra.id));
      out.push({ date, week: w.week, phase: w.phase, kind: s.kind, title: s.title, steps: s.steps, distance_km: null, duration_min: s.duration_min, key_session: false });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** The plan as it will be after strength is added: the stored weeks, fitness and every stored workout except open strength, plus the new strength. */
export function keepRunPlan(plan: TrainingPlan, current: PlannedWorkout[], sessions: WorkoutDraft[], today: string): GeneratedPlan {
  const kept = current.filter((w) => !isOpenStrength(w, today));
  const workouts = [...kept, ...sessions].sort((a, b) => a.date.localeCompare(b.date));
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
