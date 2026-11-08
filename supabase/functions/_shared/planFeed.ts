// "Trainingsplan" and "Absolviert" of the MaraPlanna Run app: the steps of every planned session of this and next
// week, and the recent finished sessions (runs from the activities, strength trainings from the watch's sets) with
// their numbers. Kept apart from the main feed (runFeed.ts) so the small watches only load it when they show these
// pages. Shared by the "watch" Edge Function and the tests.

import type { CalPaces, CalStep, CalWorkout } from './calendar.ts';
import { paceRange, stepName } from './runFeed.ts';
import { exerciseById } from './strength.ts';
import { daysBetween, glyphs, mondayOf } from './watchFeed.ts';

const TITLE_MAX = 26;
const FEED_DAYS = 14;
/** Finished sessions sent: runs and strength trainings of the last weeks, newest first. */
export const DONE_RUNS = 10;
export const DONE_STRENGTH = 3;
/** How far back the finished sessions are looked up (the function's queries use it). */
export const DONE_WEEKS = 4;
const MAX_STEPS = 12;

const round1 = (n: number) => Math.round(n * 10) / 10;
const RUNS = new Set(['easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout', 'race']);

/** One step of a planned session, repeats not written out. */
export interface PlanStep {
  /** "Einlaufen", "Interval", an exercise name … */
  n: string;
  /** Metres or seconds per repetition. */
  d?: number;
  s?: number;
  /** Repetitions (only when more than one) and the recovery between them. */
  r?: number;
  rd?: number;
  rs?: number;
  /** Target pace range in s/km (fast, slow); missing = by feel. */
  lo?: number;
  hi?: number;
  /** Strength exercise: "3 × 8". */
  x?: string;
}

/** One planned session for the detail page. */
export interface PlanDay {
  /** Days after the Monday of `start`. */
  i: number;
  t: string;
  k?: number;
  /** Planned minutes. */
  m?: number;
  /** c = completed, p = planned, x = skipped */
  s: 'c' | 'p' | 'x';
  st?: PlanStep[];
}

/** One finished session. Runs have k/s/h/e/te; strength trainings have x (exercise lines). */
export interface DoneItem {
  /** Days after the Monday of `start` (negative = earlier weeks). */
  i: number;
  t: string;
  /** Start time, epoch seconds: the watch hides its own copy of the run once the server has it. */
  ts: number;
  /** Run: km, seconds, average heart rate, climb in m, aerobic training effect, planned km. */
  k?: number;
  s?: number;
  h?: number;
  e?: number;
  te?: number;
  pk?: number;
  /** Strength: exercise name + "3 × 8 · 60 kg" per exercise. */
  x?: [string, string][];
}

export interface PlanFeed {
  v: 1;
  /** Monday of the week all `i` count from. */
  start: string;
  days: PlanDay[];
  done: DoneItem[];
}

const length = (km?: number, min?: number) => (km ? { d: Math.round(km * 1000) } : min ? { s: Math.round(min * 60) } : {});

/** Plan steps → compact steps; paces from the plan's zones, strides and recoveries by feel. */
export function planSteps(steps: CalStep[], paces: CalPaces | null): PlanStep[] {
  const out: PlanStep[] = [];
  for (const s of steps) {
    if (s.type === 'exercise') {
      out.push({ n: glyphs(s.name).slice(0, 24), x: `${s.sets} × ${s.reps}` });
      continue;
    }
    const stride = s.label.startsWith('Strides');
    const reps = s.repeat ?? 1;
    const rec = reps > 1 ? length(s.recoveryKm, s.recoveryMin) : {};
    const target = paces && !stride ? paceRange(paces, s.zone) : null;
    out.push({
      n: stride ? 'Steigerung' : stepName(s.label),
      ...length(s.distanceKm, s.durationMin),
      ...(reps > 1 ? { r: reps } : {}),
      ...('d' in rec ? { rd: rec.d } : 's' in rec ? { rs: rec.s } : {}),
      ...(target ? { lo: target[0], hi: target[1] } : {}),
    });
  }
  return out.slice(0, MAX_STEPS);
}

/** The sessions of this and next week with their steps, same order as the main feed's `days`. */
export function planDays(workouts: CalWorkout[], start: string, paces: CalPaces | null): PlanDay[] {
  return workouts
    .map((w) => ({ w, i: daysBetween(start, w.date) }))
    .filter(({ i }) => i >= 0 && i < FEED_DAYS)
    .sort((a, b) => a.i - b.i || Number(b.w.key_session) - Number(a.w.key_session))
    .map(({ w, i }): PlanDay => {
      const km = RUNS.has(w.kind) && w.distance_km ? round1(w.distance_km) : undefined;
      const st = planSteps(w.steps ?? [], paces);
      return {
        i,
        t: glyphs(w.title).slice(0, TITLE_MAX),
        ...(km ? { k: km } : {}),
        ...(w.duration_min ? { m: Math.round(w.duration_min) } : {}),
        s: w.status === 'skipped' ? 'x' : w.status === 'completed' || w.status === 'partial' ? 'c' : 'p',
        ...(st.length ? { st } : {}),
      };
    });
}

export interface DoneActivity {
  id: string;
  name: string | null;
  start_time: string;
  local_date: string;
  duration_s: number | null;
  moving_s: number | null;
  distance_m: number | string | null;
  avg_hr: number | null;
  elevation_gain_m: number | string | null;
  aerobic_te: number | string | null;
}
/** The planned session a run was matched to (planned_workouts.activity_id). */
export interface DoneLink {
  activity_id: string;
  title: string;
  distance_km: number | string | null;
}
export interface DoneSet {
  session_key: string;
  local_date: string;
  idx: number;
  exercise_id: string | null;
  exercise_name: string | null;
  reps: number;
  weight_kg: number | string | null;
}

const epoch = (iso: string) => Math.round(new Date(iso).getTime() / 1000);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Finished runs, newest first; titled after the planned session they were matched to, else after the activity. */
export function doneRuns(activities: DoneActivity[], links: DoneLink[], start: string): DoneItem[] {
  const byActivity = new Map(links.map((l) => [l.activity_id, l]));
  return [...activities]
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, DONE_RUNS)
    .map((a): DoneItem => {
      const link = byActivity.get(a.id);
      const meters = num(a.distance_m);
      const km = meters !== null ? round1(meters / 1000) : null;
      const secs = num(a.moving_s) ?? num(a.duration_s);
      const hr = num(a.avg_hr);
      const climb = num(a.elevation_gain_m);
      const te = num(a.aerobic_te);
      const planned = link ? num(link.distance_km) : null;
      return {
        i: daysBetween(start, a.local_date),
        t: glyphs(link?.title ?? a.name ?? 'Lauf').slice(0, TITLE_MAX) || 'Lauf',
        ts: epoch(a.start_time),
        ...(km !== null && km > 0 ? { k: km } : {}),
        ...(secs ? { s: Math.round(secs) } : {}),
        ...(hr ? { h: Math.round(hr) } : {}),
        ...(climb ? { e: Math.round(climb) } : {}),
        ...(te ? { te: round1(te) } : {}),
        ...(planned ? { pk: round1(planned) } : {}),
      };
    });
}

const kgText = (v: number) => `${Math.round(v * 10) / 10}`.replace(/\.0$/, '');

/** Strength trainings (one per session_key), newest first, one line per exercise: "3 × 8 · 60 kg". */
export function doneStrength(sets: DoneSet[], start: string, label = 'Kraft'): DoneItem[] {
  const sessions = new Map<string, DoneSet[]>();
  for (const s of sets) sessions.set(s.session_key, [...(sessions.get(s.session_key) ?? []), s]);
  return [...sessions.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, DONE_STRENGTH)
    .map(([key, list]): DoneItem => {
      const sorted = [...list].sort((a, b) => a.idx - b.idx);
      const order: string[] = [];
      const groups = new Map<string, DoneSet[]>();
      for (const s of sorted) {
        const name = glyphs((s.exercise_id ? exerciseById(s.exercise_id)?.de : null) ?? s.exercise_name ?? 'Uebung').slice(0, 24);
        if (!groups.has(name)) order.push(name);
        groups.set(name, [...(groups.get(name) ?? []), s]);
      }
      const x = order.slice(0, MAX_STEPS).map((name): [string, string] => {
        const g = groups.get(name)!;
        const reps = g.map((s) => s.reps);
        const same = reps.every((r) => r === reps[0]);
        const weights = g.map((s) => num(s.weight_kg)).filter((w): w is number => w !== null && w > 0);
        const top = weights.length ? Math.max(...weights) : null;
        return [name, `${g.length} × ${same ? reps[0] : reps.join('/')}${top !== null ? ` · ${kgText(top)} kg` : ''}`];
      });
      return { i: daysBetween(start, sorted[0].local_date), t: label, ts: Number(key), x };
    });
}

export interface PlanFeedInput {
  /** Today, YYYY-MM-DD. */
  date: string;
  paces: CalPaces | null;
  /** Planned sessions of the two weeks starting with the Monday of `date`'s week. */
  workouts: CalWorkout[];
  activities?: DoneActivity[];
  links?: DoneLink[];
  sets?: DoneSet[];
}

/** Everything the plan and finished-sessions pages need. Finished sessions are mixed newest first. */
export function buildPlanFeed(input: PlanFeedInput): PlanFeed {
  const start = mondayOf(input.date);
  const done = [...doneRuns(input.activities ?? [], input.links ?? [], start), ...doneStrength(input.sets ?? [], start)].sort((a, b) => b.ts - a.ts);
  return { v: 1, start, days: planDays(input.workouts, start, input.paces), done };
}

// ---------------------------------------------------------------------------
// Week overview: every remaining week of the plan, a few words per session (the "Trainingsplan" list on the watch)
// ---------------------------------------------------------------------------

const WEEK_TITLE_MAX = 18;
const MAX_WEEKS = 30;
const STRENGTH_KINDS = new Set(['strength_upper', 'strength_lower', 'strength_full', 'strength_cali', 'core']);
const PHASE_LETTER = { base: 'b', build: 'u', peak: 'p', taper: 't' } as const;

/** One session of a week: day (0 = Monday), short title, km, minutes, status (c done, p planned, x skipped). */
export type WeekSession = [number, string, number, number, 'c' | 'p' | 'x'];

export interface WeekOverview {
  /** Plan week number. */
  n: number;
  /** Days after the Monday of `start`. */
  i: number;
  /** Phase: b base, u build, p peak, t taper. */
  p: 'b' | 'u' | 'p' | 't';
  /** Planned km of the runs, rounded. */
  k: number;
  /** Run sessions and strength sessions. */
  r: number;
  s: number;
  /** 1 on a recovery week. */
  e?: 1;
  d: WeekSession[];
}

export interface WeeksFeed {
  v: 1;
  /** Monday of the current week. */
  start: string;
  weeks: WeekOverview[];
}

export interface PlanWeek {
  week: number;
  startDate: string;
  phase: 'base' | 'build' | 'peak' | 'taper';
  recovery: boolean;
}

export interface WeeksInput {
  /** Today, YYYY-MM-DD. */
  date: string;
  weeks: PlanWeek[];
  /** Planned sessions from the Monday of this week to the end of the plan. */
  workouts: Pick<CalWorkout, 'date' | 'kind' | 'title' | 'distance_km' | 'duration_min' | 'status'>[];
}

/** The current week and every later week with a short list of their sessions. */
export function buildWeeksFeed(input: WeeksInput): WeeksFeed {
  const start = mondayOf(input.date);
  const weeks = input.weeks
    .filter((w) => w.startDate >= start)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, MAX_WEEKS)
    .map((w): WeekOverview => {
      const mine = input.workouts
        .map((x) => ({ x, day: daysBetween(w.startDate, x.date) }))
        .filter(({ day }) => day >= 0 && day <= 6)
        .sort((a, b) => a.day - b.day);
      const live = mine.filter(({ x }) => x.status !== 'skipped');
      const runs = live.filter(({ x }) => RUNS.has(x.kind));
      return {
        n: w.week,
        i: daysBetween(start, w.startDate),
        p: PHASE_LETTER[w.phase],
        k: Math.round(runs.reduce((sum, { x }) => sum + (x.distance_km ?? 0), 0)),
        r: runs.length,
        s: live.filter(({ x }) => STRENGTH_KINDS.has(x.kind)).length,
        ...(w.recovery ? { e: 1 as const } : {}),
        d: mine.map(({ x, day }): WeekSession => [
          day,
          glyphs(x.title).slice(0, WEEK_TITLE_MAX),
          RUNS.has(x.kind) && x.distance_km ? round1(x.distance_km) : 0,
          x.duration_min ? Math.round(x.duration_min) : 0,
          x.status === 'skipped' ? 'x' : x.status === 'completed' || x.status === 'partial' ? 'c' : 'p',
        ]),
      };
    });
  return { v: 1, start, weeks };
}
