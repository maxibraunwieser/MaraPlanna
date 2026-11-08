// Numbers for the strength page: how the weights and repetitions develop per exercise, volume per week, personal records.
// Pure functions on the recorded sets (strength_sets rows from the watch and from the logger on the website).

import { exerciseById } from '../../supabase/functions/_shared/strength';
import type { StrengthSetRow } from './types';
import { tr } from './i18n';
import { addDays, daysBetween, mondayOf } from './planner/dates';

export type SetRow = Pick<StrengthSetRow, 'session_key' | 'idx' | 'local_date' | 'exercise_id' | 'exercise_name' | 'reps' | 'weight_kg'>;

/** Name of the exercise of a set: the typed/catalogue name, else the library name. */
export const exerciseLabel = (r: Pick<SetRow, 'exercise_id' | 'exercise_name'>): string =>
  r.exercise_name?.trim() || (r.exercise_id ? exerciseById(r.exercise_id)?.en : undefined) || 'Exercise';

/** Same exercise from the watch (library id) and from the website (name) share one key. */
export const exerciseKeyOf = (r: Pick<SetRow, 'exercise_id' | 'exercise_name'>): string => exerciseLabel(r).toLowerCase();

/** The weight of the last time per exercise (from the watch or the website), by library id and by name. */
export function lastWeights(rows: SetRow[]): Map<string, { kg: number; date: string }> {
  const out = new Map<string, { kg: number; date: string }>();
  for (const r of rows) {
    if (!r.weight_kg || r.weight_kg <= 0) continue;
    for (const k of [r.exercise_id, exerciseKeyOf(r)]) {
      if (!k) continue;
      const cur = out.get(k);
      if (!cur || r.local_date > cur.date || (r.local_date === cur.date && r.weight_kg > cur.kg)) out.set(k, { kg: r.weight_kg, date: r.local_date });
    }
  }
  return out;
}

/** The last weight of an exercise of a workout (by its library id, else by its name). */
export const lastWeightOf = (last: Map<string, { kg: number; date: string }>, x: { id?: string; name: string }) => (x.id ? last.get(x.id) : undefined) ?? last.get(x.name.toLowerCase());

/** Estimated one-repetition maximum (Epley). Only for 1–12 repetitions with a weight; null otherwise. */
export function e1rm(kg: number | null | undefined, reps: number): number | null {
  if (!kg || kg <= 0 || reps < 1 || reps > 12) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const kgOf = (r: SetRow) => (r.weight_kg && r.weight_kg > 0 ? r.weight_kg : 0);

export interface Session {
  key: string;
  date: string;
  sets: SetRow[];
  reps: number;
  /** Sum of weight × repetitions in kg. */
  volume: number;
  exercises: string[];
}

export function groupSessions(rows: SetRow[]): Session[] {
  const map = new Map<string, SetRow[]>();
  for (const r of rows) map.set(r.session_key, [...(map.get(r.session_key) ?? []), r]);
  return [...map.entries()]
    .map(([key, list]): Session => {
      const sets = [...list].sort((a, b) => a.idx - b.idx);
      return {
        key,
        date: sets[0].local_date,
        sets,
        reps: sets.reduce((n, s) => n + s.reps, 0),
        volume: Math.round(sets.reduce((n, s) => n + kgOf(s) * s.reps, 0)),
        exercises: [...new Set(sets.map(exerciseLabel))],
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

export interface ExercisePoint {
  date: string;
  session: string;
  /** Heaviest weight of the session and the most repetitions done with it. */
  topKg: number;
  topReps: number;
  /** Best estimated 1RM of the session (0 without a weight). */
  e1rm: number;
  volume: number;
  /** Most repetitions in one set (for exercises without weight). */
  bestReps: number;
  sets: { kg: number; reps: number }[];
}

/** One point per session for one exercise, oldest first. */
export function exerciseProgress(rows: SetRow[], key: string): ExercisePoint[] {
  const bySession = new Map<string, SetRow[]>();
  for (const r of rows) if (exerciseKeyOf(r) === key) bySession.set(r.session_key, [...(bySession.get(r.session_key) ?? []), r]);
  return [...bySession.entries()]
    .map(([session, list]): ExercisePoint => {
      const sets = [...list].sort((a, b) => a.idx - b.idx).map((s) => ({ kg: kgOf(s), reps: s.reps }));
      const topKg = Math.max(0, ...sets.map((s) => s.kg));
      return {
        date: list[0].local_date,
        session,
        topKg,
        topReps: Math.max(0, ...sets.filter((s) => s.kg === topKg).map((s) => s.reps)),
        e1rm: r1(Math.max(0, ...sets.map((s) => e1rm(s.kg, s.reps) ?? 0))),
        volume: Math.round(sets.reduce((n, s) => n + s.kg * s.reps, 0)),
        bestReps: Math.max(0, ...sets.map((s) => s.reps)),
        sets,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session));
}

export interface ExerciseSummary {
  key: string;
  label: string;
  sessions: number;
  lastDate: string;
  last: ExercisePoint;
  first: ExercisePoint;
  /** Weight-based exercises are judged by estimated 1RM, bodyweight ones by repetitions. */
  metric: 'e1rm' | 'reps';
  /** Change of the metric from the first to the latest session (kg or repetitions) and in percent. */
  change: number;
  changePct: number;
  best: number;
  trend: number[];
}

/** Every exercise with data, most trained first. */
export function exerciseSummaries(rows: SetRow[]): ExerciseSummary[] {
  const labels = new Map<string, string>();
  for (const r of rows) if (!labels.has(exerciseKeyOf(r))) labels.set(exerciseKeyOf(r), exerciseLabel(r));
  return [...labels.entries()]
    .map(([key, label]): ExerciseSummary => {
      const pts = exerciseProgress(rows, key);
      const metric: 'e1rm' | 'reps' = pts.some((p) => p.e1rm > 0) ? 'e1rm' : 'reps';
      const val = (p: ExercisePoint) => (metric === 'e1rm' ? p.e1rm : p.bestReps);
      const first = pts[0];
      const last = pts[pts.length - 1];
      const change = r1(val(last) - val(first));
      return {
        key,
        label,
        sessions: pts.length,
        lastDate: last.date,
        last,
        first,
        metric,
        change,
        changePct: val(first) > 0 ? Math.round(((val(last) - val(first)) / val(first)) * 1000) / 10 : 0,
        best: Math.max(...pts.map(val)),
        trend: pts.slice(-10).map(val),
      };
    })
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate));
}

export interface WeekVolume {
  weekStart: string;
  volume: number;
  sets: number;
  sessions: number;
}

/** Volume per week for the last `weeks` weeks including the current one. */
export function weeklyVolume(rows: SetRow[], weeks: number, today: string): WeekVolume[] {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const out: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDays(first, 7 * i), volume: 0, sets: 0, sessions: 0 }));
  const seen = new Set<string>();
  for (const r of rows) {
    const i = Math.floor(daysBetween(first, r.local_date) / 7);
    if (i < 0 || i >= weeks) continue;
    out[i].volume += kgOf(r) * r.reps;
    out[i].sets += 1;
    if (!seen.has(r.session_key)) {
      seen.add(r.session_key);
      out[i].sessions += 1;
    }
  }
  return out.map((w) => ({ ...w, volume: Math.round(w.volume) }));
}

export interface PersonalRecord {
  key: string;
  label: string;
  kg: number;
  reps: number;
  e1rm: number;
  date: string;
  /** Best estimated 1RM before this record (0 if it was the first). */
  before: number;
}

/** Best set per exercise (by estimated 1RM), newest records first. Bodyweight exercises are left out. */
export function personalRecords(rows: SetRow[]): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  for (const s of exerciseSummaries(rows)) {
    if (s.metric !== 'e1rm') continue;
    const sets = rows.filter((r) => exerciseKeyOf(r) === s.key && e1rm(r.weight_kg, r.reps));
    const best = sets.reduce((a, b) => ((e1rm(b.weight_kg, b.reps) ?? 0) > (e1rm(a.weight_kg, a.reps) ?? 0) ? b : a));
    const bestVal = e1rm(best.weight_kg, best.reps) ?? 0;
    const before = Math.max(0, ...sets.filter((r) => r.local_date < best.local_date).map((r) => e1rm(r.weight_kg, r.reps) ?? 0));
    out.push({ key: s.key, label: s.label, kg: kgOf(best), reps: best.reps, e1rm: r1(bestVal), date: best.local_date, before: r1(before) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface Summary {
  sessions: number;
  sets: number;
  volume: number;
  /** Volume of the 30 days before, to show the trend. */
  previousVolume: number;
  /** Sessions in which an exercise reached a new best estimated 1RM. */
  records: number;
  /** Weeks in a row (counting back from this or last week) with at least one session. */
  streakWeeks: number;
}

/** The last 30 days at a glance. */
export function summarize(rows: SetRow[], today: string): Summary {
  const from = addDays(today, -29);
  const prevFrom = addDays(today, -59);
  const inRange = rows.filter((r) => r.local_date >= from && r.local_date <= today);
  const previous = rows.filter((r) => r.local_date >= prevFrom && r.local_date < from);
  const vol = (list: SetRow[]) => Math.round(list.reduce((n, r) => n + kgOf(r) * r.reps, 0));

  // New records: for each exercise and session, did the best e1RM beat everything before?
  let records = 0;
  for (const s of exerciseSummaries(rows)) {
    if (s.metric !== 'e1rm') continue;
    let best = 0;
    for (const p of exerciseProgress(rows, s.key)) {
      if (p.e1rm > best && best > 0 && p.date >= from && p.date <= today) records += 1;
      best = Math.max(best, p.e1rm);
    }
  }

  const weeks = new Set(rows.map((r) => mondayOf(r.local_date)));
  let streak = 0;
  let cursor = mondayOf(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7); // the running week may not have a session yet
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return {
    sessions: new Set(inRange.map((r) => r.session_key)).size,
    sets: inRange.length,
    volume: vol(inRange),
    previousVolume: vol(previous),
    records,
    streakWeeks: streak,
  };
}

/** "8", "8–10" → [8, 8] / [8, 10]; null for times ("45 s") or text without a number. */
export function repRange(reps: string): [number, number] | null {
  if (/\bs\b|sec|min/i.test(reps)) return null;
  const m = reps.match(/\d+/g);
  if (!m) return null;
  const lo = parseInt(m[0], 10);
  return [lo, m.length > 1 ? parseInt(m[1], 10) : lo];
}

export interface Hint {
  kg: number;
  reason: string;
}

/**
 * What to put on the bar next time: when every set of the last session reached the top of the repetition range, a little
 * more; otherwise the same weight again. Null without history (the person decides).
 */
export function progressionHint(last: ExercisePoint | undefined, reps: string, step = 2.5): Hint | null {
  const range = repRange(reps);
  if (!last || !range || last.topKg <= 0) return null;
  const working = last.sets.filter((s) => s.kg >= last.topKg * 0.95);
  const allDone = working.length > 0 && working.every((s) => s.reps >= range[1]);
  return allDone
    ? { kg: Math.round((last.topKg + step) * 100) / 100, reason: tr('lg.h.allDone', { n: range[1] }) }
    : { kg: last.topKg, reason: tr('lg.h.repeat', { n: range[1] }) };
}
