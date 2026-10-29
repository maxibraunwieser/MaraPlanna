// Weekly report: what was planned, what was done, how well, how the body
// coped and what comes next – with a few coach notes on top.

import type { Activity, ActivityDetails, DailyMetric, PlannedWorkout, TrainingPlan, Units, WeekSummary } from './types';
import { analyze, tandaProjection } from './analysis';
import { addDays } from './planner/dates';
import { isRunWorkout } from './planner/adapt';
import { fmtDistance, fmtMinSec, zonePaceText } from './format';

export type NoteTone = 'good' | 'warn' | 'info';
export interface ReportNote {
  tone: NoteTone;
  text: string;
}

export interface ReportItem {
  date: string;
  workout: PlannedWorkout | null;
  activity: Activity | null;
  score: number | null;
  tooFast: boolean;
}

interface Pair {
  now: number | null;
  prev: number | null;
}

export interface WeekReport {
  start: string;
  end: string;
  week: WeekSummary | null;
  state: 'past' | 'current' | 'future';
  /** Run distance planned for the whole week and up to today (same for past weeks). */
  plannedKm: number;
  plannedToDateKm: number;
  doneKm: number;
  pct: number | null;
  sessions: { planned: number; done: number };
  key: { planned: number; done: number; missed: PlannedWorkout[] };
  long: { workout: PlannedWorkout | null; doneKm: number | null; longest: boolean };
  movingS: number;
  avgScore: number | null;
  easy: { runs: number; tooFast: number };
  wellness: { restingHr: Pair; hrv: Pair; sleepH: Pair };
  projection: { startS: number | null; endS: number | null };
  items: ReportItem[];
  notes: ReportNote[];
  next: { week: WeekSummary | null; key: PlannedWorkout[]; long: PlannedWorkout | null; plannedKm: number } | null;
}

const STEADY = new Set(['easy', 'recovery', 'long']);
const DONE = new Set(['completed', 'partial']);
const km = (a: Activity) => (a.distance_m ?? 0) / 1000;
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Sessions that count as "planned": everything except sessions the planner replaced. */
const counts = (w: PlannedWorkout) => !(w.status === 'skipped' && w.status_source === 'auto');

export function weekReport(input: {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
  activities: Activity[];
  metrics: DailyMetric[];
  weekStart: string;
  today: string;
  maxHr: number | null;
  units: Units;
  /** Laps + streams (same source as the full analysis, so the scores match). */
  detailsOf?: (a: Activity) => ActivityDetails | null;
}): WeekReport {
  const { plan, workouts, activities, metrics, weekStart: start, today, maxHr, units } = input;
  const detailsOf = input.detailsOf ?? ((a: Activity) => a.details ?? null);
  const end = addDays(start, 6);
  const state = today > end ? 'past' : today < start ? 'future' : 'current';
  const cutoff = state === 'current' ? today : end;
  const inWeek = <T extends { date?: string; local_date?: string }>(x: T) => {
    const d = x.date ?? x.local_date!;
    return d >= start && d <= end;
  };

  const ws = workouts.filter(inWeek).sort((a, b) => a.date.localeCompare(b.date));
  const acts = activities.filter(inWeek);
  const runs = acts.filter((a) => a.sport === 'run');
  const countable = ws.filter(counts);
  const dueRuns = countable.filter((w) => isRunWorkout(w));

  const plannedKm = dueRuns.reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const plannedToDateKm = dueRuns.filter((w) => w.date <= cutoff).reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const doneKm = runs.reduce((s, a) => s + km(a), 0);
  const refKm = state === 'current' ? plannedToDateKm : plannedKm;
  const pct = refKm > 0 ? Math.round((doneKm / refKm) * 100) : null;

  const due = countable.filter((w) => w.date <= cutoff);
  const keyDue = due.filter((w) => w.key_session && w.kind !== 'race');
  const sessions = { planned: due.length, done: due.filter((w) => DONE.has(w.status)).length };
  const key = {
    planned: keyDue.length,
    done: keyDue.filter((w) => DONE.has(w.status)).length,
    missed: keyDue.filter((w) => w.status === 'missed' || w.status === 'skipped' || (w.status === 'planned' && w.date < today)),
  };

  // Sessions with their activities and execution scores.
  const byId = new Map(activities.map((a) => [a.id, a]));
  const linked = new Set(ws.map((w) => w.activity_id).filter(Boolean));
  const score = (w: PlannedWorkout | null, a: Activity) => {
    const r = analyze({ workout: w, activity: a, details: detailsOf(a), plan, activities, metrics, maxHr });
    const steady = !w || STEADY.has(w.kind);
    return { score: r.score, tooFast: steady && a.sport === 'run' && r.checks.some((c) => c.label === 'Pace' && c.status !== 'good') };
  };
  const items: ReportItem[] = ws.map((w) => {
    const a = w.activity_id ? (byId.get(w.activity_id) ?? null) : null;
    return { date: w.date, workout: w, activity: a, ...(a && isRunWorkout(w) ? score(w, a) : { score: null, tooFast: false }) };
  });
  for (const a of runs.filter((r) => !linked.has(r.id))) items.push({ date: a.local_date, workout: null, activity: a, ...score(null, a) });
  items.sort((x, y) => x.date.localeCompare(y.date));

  const scored = items.filter((i) => i.activity?.sport === 'run' && i.score !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, i) => s + i.score!, 0) / scored.length) : null;
  const steady = items.filter((i) => i.activity?.sport === 'run' && (!i.workout || STEADY.has(i.workout.kind)));
  const easy = { runs: steady.length, tooFast: steady.filter((i) => i.tooFast).length };

  // Long run.
  const longW = ws.find((w) => w.kind === 'long' || w.kind === 'long_mp') ?? null;
  const longAct = longW?.activity_id ? byId.get(longW.activity_id) : undefined;
  const longDone = longAct ? km(longAct) : null;
  const before = activities.filter((a) => a.sport === 'run' && a.local_date < start && a.local_date >= addDays(plan.start_date, -60));
  const longest = longDone !== null && longDone >= 16 && longDone > Math.max(0, ...before.map(km)) + 0.2;

  // Recovery markers vs the week before.
  const day = (m: DailyMetric, from: string, to: string) => m.date >= from && m.date <= to;
  const cur = metrics.filter((m) => day(m, start, cutoff));
  const prev = metrics.filter((m) => day(m, addDays(start, -7), addDays(start, -1)));
  const pair = (f: (m: DailyMetric) => number | null): Pair => ({ now: avg(cur.map(f)), prev: avg(prev.map(f)) });
  const wellness = {
    restingHr: pair((m) => m.resting_hr),
    hrv: pair((m) => m.hrv_last_night),
    sleepH: pair((m) => (m.sleep_s ? m.sleep_s / 3600 : null)),
  };

  const projection = {
    startS: tandaProjection(activities, addDays(start, -1))?.seconds ?? null,
    endS: state === 'future' ? null : (tandaProjection(activities, cutoff)?.seconds ?? null),
  };


  // Next week.
  const nextStart = addDays(start, 7);
  const nextWs = workouts.filter((w) => w.date >= nextStart && w.date <= addDays(nextStart, 6) && counts(w));
  const next =
    nextStart <= plan.race_date
      ? {
          week: plan.weeks.find((w) => w.startDate === nextStart) ?? null,
          key: nextWs.filter((w) => w.key_session && w.kind !== 'long' && w.kind !== 'long_mp' && w.kind !== 'race'),
          long: nextWs.find((w) => w.kind === 'long' || w.kind === 'long_mp') ?? null,
          plannedKm: nextWs.filter((w) => isRunWorkout(w)).reduce((s, w) => s + (w.distance_km ?? 0), 0),
        }
      : null;

  const report: WeekReport = {
    start, end, week: plan.weeks.find((w) => w.startDate === start) ?? null, state,
    plannedKm, plannedToDateKm, doneKm, pct, sessions, key,
    long: { workout: longW, doneKm: longDone, longest },
    movingS: acts.reduce((s, a) => s + (a.moving_s ?? a.duration_s ?? 0), 0),
    avgScore, easy, wellness, projection,
    items, notes: [], next,
  };
  report.notes = coachNotes(report, plan, units);
  return report;
}

function coachNotes(r: WeekReport, plan: TrainingPlan, units: Units): ReportNote[] {
  const notes: ReportNote[] = [];
  const d = (x: number) => fmtDistance(x, units);
  if (r.state === 'future') return notes;
  const so = r.state === 'current';

  if (r.pct !== null && (so ? r.plannedToDateKm : r.plannedKm) >= 5) {
    const ref = so ? r.plannedToDateKm : r.plannedKm;
    const base = `${so ? 'So far you ran' : 'You ran'} ${d(r.doneKm)} of ${d(ref)}${so ? ' planned up to today' : ''} (${r.pct} %)`;
    if (r.pct >= 115) notes.push({ tone: 'warn', text: `${base} – more than planned. Extra kilometres add up; keep the easy days easy.` });
    else if (r.pct >= 90) notes.push({ tone: 'good', text: `${base} – right on target.` });
    else if (r.pct >= 70) notes.push({ tone: 'info', text: `${base}. No need to make up the missing distance – consistency matters more.` });
    else notes.push({ tone: 'warn', text: `${base}. If it stays this low, the plan rebuilds from your real level automatically.` });
  }

  if (r.key.planned) {
    if (r.key.missed.length) {
      const titles = r.key.missed.map((w) => w.title).join(', ');
      notes.push({ tone: 'warn', text: `Missed key session${r.key.missed.length > 1 ? 's' : ''}: ${titles}. Don't squeeze ${r.key.missed.length > 1 ? 'them' : 'it'} in – the next one matters more.` });
    } else if (r.key.done === r.key.planned) {
      notes.push({ tone: 'good', text: `${r.key.planned === 1 ? 'Key session' : `All ${r.key.planned} key sessions`} done – that's the work that moves your marathon.` });
    }
  }

  // A missed long run already shows up under the key sessions.
  if (r.long.workout && r.long.doneKm !== null) {
    const planned = r.long.workout.distance_km ?? 0;
    if (r.long.longest) notes.push({ tone: 'good', text: `New longest run of this build: ${d(r.long.doneKm)}.` });
    else if (planned && r.long.doneKm < planned * 0.8) notes.push({ tone: 'info', text: `Long run: ${d(r.long.doneKm)} of ${d(planned)}.` });
  }

  if (r.easy.runs >= 2) {
    if (r.easy.tooFast / r.easy.runs >= 0.5)
      notes.push({
        tone: 'warn',
        text: `${r.easy.tooFast} of ${r.easy.runs} easy runs were faster than your easy pace (${zonePaceText(plan.fitness.paces, 'easy', units)}). Slower easy days let you absorb the hard ones.`,
      });
    else if (r.easy.tooFast === 0) notes.push({ tone: 'good', text: 'Easy runs stayed easy – exactly right.' });
  }

  if (r.avgScore !== null) {
    if (r.avgScore >= 85) notes.push({ tone: 'good', text: `Average execution score ${r.avgScore} – sessions done the way they were meant.` });
    else if (r.avgScore < 60) notes.push({ tone: 'info', text: `Average execution score ${r.avgScore}. Open the analyses below to see what was off.` });
  }

  const { restingHr, hrv, sleepH } = r.wellness;
  if (restingHr.now !== null && restingHr.prev !== null && restingHr.now - restingHr.prev >= 3)
    notes.push({ tone: 'warn', text: `Resting heart rate is ${Math.round(restingHr.now - restingHr.prev)} bpm above last week – a sign of fatigue, stress or a coming cold. Sleep and easy days help.` });
  else if (hrv.now !== null && hrv.prev !== null && hrv.now < hrv.prev * 0.9)
    notes.push({ tone: 'warn', text: `HRV dropped ${Math.round((1 - hrv.now / hrv.prev) * 100)} % compared with last week – recover well before the next hard session.` });
  if (sleepH.now !== null && sleepH.now < 7) notes.push({ tone: 'info', text: `You slept ${sleepH.now.toFixed(1)} h a night on average – runners adapt better with 7–9 h.` });

  if (r.projection.startS !== null && r.projection.endS !== null) {
    const delta = r.projection.endS - r.projection.startS;
    if (delta <= -30) notes.push({ tone: 'good', text: `Your training-based marathon projection improved by ${fmtMinSec(-delta)} min this week.` });
  }
  return notes.slice(0, 7);
}
