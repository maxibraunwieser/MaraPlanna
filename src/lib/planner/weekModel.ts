// The weekly structure model: on which days the runs and the strength sessions go, given the time the person has on each weekday.
//
// It searches the candidate weeks and scores them with rules that come from the training literature, so the result is the best
// week under the rules rather than the first one that fits:
//  - Hard and easy days alternate: the long run and the quality runs are not back to back, and no quality run is the day before
//    or after the long run ("hard day, easy day"; Daniels' Running Formula, Pfitzinger & Douglas, Advanced Marathoning).
//  - The long run goes on the day with the most time (the weekend when the times are equal) and never shares a day with strength.
//  - Concurrent training: heavy leg work interferes with endurance adaptations when it is squeezed in front of key runs, so it is
//    not placed on the day before the long run or a quality run, and two leg sessions are at least a day apart (Wilson et al. 2012;
//    Fyfe, Bishop & Stepto 2014; ACSM 2009 on at least 48 h between sessions for the same muscles). Upper-body work has no such
//    limit. On a day with both, the run comes first and the strength session after it, ideally some hours later (Robineau et al. 2016).
//  - Strength goes best on a hard-run day or a day off, so the easy days stay easy (Rønnestad & Mujika 2014).
//  - Every session has to fit into the minutes of its day; a day that cannot take run and strength together gets only one of them.
//  - At least one day a week with nothing planned, best right after the long run (Meeusen et al. 2013).

import type { DayTemplate, Level, Weekday } from '../types';
import { isLegKind, type StrengthKind } from '../onboarding/strengthMap';

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
const adjacent = (a: number, b: number) => gap(a, b) === 1;

/** Shortest useful run of each kind in minutes (warm-up and cool-down included for a quality run). */
export const MIN_RUN_MIN = { easy: 25, recovery: 20, quality: 40 } as const;
/** Minutes a long run needs at least, by level. */
export const LONG_MIN: Record<Level, number> = { beginner: 50, intermediate: 65, advanced: 80 };

export const qualityFor = (level: Level, runs: number) => (level === 'beginner' || runs < 5 ? 1 : 2);

export interface WeekModelInput {
  /** The days with time. */
  free: Weekday[];
  /** Minutes per weekday: null = not answered (no limit), 120 or more = no limit. */
  minutes: (number | null | undefined)[];
  runs: number;
  /** null = the planner picks the long-run day. */
  longDay: Weekday | null;
  /** The days the person wants to run on (empty = the planner picks). */
  preferred: Weekday[];
  quality: number;
  level: Level;
  /** One entry per strength session of the week. */
  strength: StrengthKind[];
  /** Minutes of a strength session. */
  strengthMin: number;
  /** A run and a strength session may share a day. */
  sameDay: boolean;
}

export type StrengthWhy = 'hardDay' | 'easyDay' | 'rest';

export interface WeekSolution {
  week: DayTemplate[];
  runDays: Weekday[];
  longDay: Weekday;
  quality: Weekday[];
  recovery: Weekday[];
  strength: { kind: StrengthKind; day: Weekday; why: StrengthWhy }[];
  /** Free days with nothing planned. */
  restDays: Weekday[];
  /** Strength sessions that found no day (no time, or every day is taken). */
  unplaced: number;
  /** Minutes of the long-run day (null = no limit). */
  longMinutes: number | null;
  /** The long-run day has less time than a long run needs. */
  longTight: boolean;
}

const budgetOf = (minutes: WeekModelInput['minutes'], d: number): number => {
  const m = minutes[d];
  return m === null || m === undefined || m >= 120 ? Infinity : m;
};

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

function permutations(kinds: StrengthKind[]): StrengthKind[][] {
  const seen = new Set<string>();
  const out: StrengthKind[][] = [];
  const rec = (rest: StrengthKind[], acc: StrengthKind[]) => {
    if (!rest.length) {
      const key = acc.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(acc);
      }
      return;
    }
    rest.forEach((k, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, k]));
  };
  rec(kinds, []);
  return out;
}

/** Lengths of consecutive-day runs in a circular week. */
function streaks(days: number[]): number[] {
  const set = new Set(days);
  if (set.size === 7) return [7];
  const start = ALL_DAYS.find((d) => !set.has(d))!;
  const out: number[] = [];
  let len = 0;
  for (let i = 1; i <= 7; i++) {
    if (set.has((start + i) % 7)) len++;
    else if (len) {
      out.push(len);
      len = 0;
    }
  }
  return out;
}

interface RunLayout {
  runSet: Weekday[];
  longDay: Weekday;
  quality: Weekday[];
  /** Lower is better. */
  cost: number;
}

function nearestFree(day: Weekday, free: Weekday[]): Weekday {
  return [...free].sort((a, b) => gap(a, day) - gap(b, day) || b - a)[0] ?? day;
}

function runLayouts(inp: WeekModelInput): RunLayout[] {
  const { free, level } = inp;
  let pool = inp.preferred.filter((d) => free.includes(d));
  if (pool.length < inp.runs) pool = [...free];
  // Days with less time than a short run needs are only used when there are not enough others.
  const roomy = pool.filter((d) => budgetOf(inp.minutes, d) >= MIN_RUN_MIN.easy);
  if (roomy.length >= Math.min(inp.runs, pool.length)) pool = roomy;
  const longs: Weekday[] = inp.longDay !== null ? [free.includes(inp.longDay) ? inp.longDay : nearestFree(inp.longDay, free)] : pool.length ? pool : free;
  const n = clamp(inp.runs, 1, Math.max(1, Math.max(pool.length, 1)));
  const out: RunLayout[] = [];
  for (const L of longs) {
    const others = [...new Set([...pool, L])].filter((d) => d !== L);
    const after = ((L + 1) % 7) as Weekday;
    const before = ((L + 6) % 7) as Weekday;
    const longBudget = budgetOf(inp.minutes, L);
    let longCost = 0;
    if (inp.longDay === null) {
      longCost -= Math.min(Number.isFinite(longBudget) ? longBudget : 150, 150) / 12;
      longCost -= L === 6 ? 6 : L === 5 ? 4 : 0;
    }
    if (longBudget < LONG_MIN[level]) longCost += 35;
    for (const combo of combinations(others, Math.min(n - 1, others.length))) {
      const runSet = [...combo, L].sort((a, b) => a - b) as Weekday[];
      let cost = longCost;
      for (let i = 0; i < runSet.length; i++) for (let j = i + 1; j < runSet.length; j++) if (adjacent(runSet[i], runSet[j])) cost += 10;
      // Long streaks of consecutive run days are worse than several short ones.
      for (const len of streaks(runSet)) if (len > 2) cost += (len - 2) ** 2 * 5;
      if (combo.includes(after)) cost += 2;
      if (combo.includes(before)) cost += 1;
      const q = clamp(inp.quality, 0, Math.max(0, combo.length - (runSet.length >= 4 ? 1 : 0)));
      for (const qc of combinations(combo, q)) {
        let qcost = 0;
        for (const d of qc) {
          if (d === before) qcost += 25;
          if (d === after) qcost += 20;
          const b = budgetOf(inp.minutes, d);
          qcost += b < MIN_RUN_MIN.quality ? 40 : -Math.min(Number.isFinite(b) ? b : 90, 90) / 30;
        }
        for (let i = 0; i < qc.length; i++)
          for (let j = i + 1; j < qc.length; j++) {
            if (adjacent(qc[i], qc[j])) qcost += 30;
            qcost -= gap(qc[i], qc[j]);
          }
        out.push({ runSet, longDay: L, quality: [...qc].sort((a, b) => a - b) as Weekday[], cost: cost + qcost });
      }
    }
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, 24);
}

export type DayKind = 'rest' | 'easy' | 'recovery' | 'quality' | 'long';

function dayKinds(lay: RunLayout): DayKind[] {
  const kinds: DayKind[] = Array<DayKind>(7).fill('rest');
  for (const d of lay.runSet) kinds[d] = 'easy';
  for (const d of lay.quality) kinds[d] = 'quality';
  kinds[lay.longDay] = 'long';
  const after = (lay.longDay + 1) % 7;
  if (kinds[after] === 'easy') kinds[after] = 'recovery';
  return kinds;
}

/** How well a strength session of this kind sits on a day (higher is better). */
export function daySuitability(kind: StrengthKind, d: number, kinds: DayKind[]): number {
  const today = kinds[d];
  const next = kinds[(d + 1) % 7];
  const prev = kinds[(d + 6) % 7];
  // Upper body and calisthenics are no leg day.
  if (!isLegKind(kind)) return { rest: 12, easy: 10, recovery: 10, quality: 4, long: -60 }[today];
  let s = { rest: 8, easy: 10, recovery: -10, quality: 15, long: -1000 }[today];
  if (next === 'long') s -= 60;
  if (next === 'quality') s -= 40;
  if (prev === 'long') s -= 15;
  return s;
}

function placeStrength(inp: WeekModelInput, lay: RunLayout, kinds: DayKind[]): { placed: { kind: StrengthKind; day: Weekday }[]; score: number; unplaced: number } {
  const wanted = inp.strength;
  if (!wanted.length) return { placed: [], score: 0, unplaced: 0 };
  const runs = new Set<number>(lay.runSet);
  const maxUsed = inp.free.length >= 7 ? 6 : inp.free.length;
  const feasible = inp.free.filter((d) => {
    if (d === lay.longDay) return false;
    const b = budgetOf(inp.minutes, d);
    if (runs.has(d)) return inp.sameDay && b >= inp.strengthMin + MIN_RUN_MIN[kinds[d] === 'quality' ? 'quality' : kinds[d] === 'recovery' ? 'recovery' : 'easy'];
    return b >= inp.strengthMin - 10;
  });
  for (let s = wanted.length; s >= 0; s--) {
    let best: { placed: { kind: StrengthKind; day: Weekday }[]; score: number } | null = null;
    for (const days of combinations(feasible, s)) {
      const only = days.filter((d) => !runs.has(d)).length;
      if (runs.size + only > maxUsed) continue;
      for (const kindsOrder of permutations(chooseKinds(wanted, s))) {
        let score = 0;
        days.forEach((d, i) => {
          score += daySuitability(kindsOrder[i], d, kinds);
          if (runs.has(d)) score -= 3;
        });
        for (let i = 0; i < days.length; i++)
          for (let j = i + 1; j < days.length; j++) {
            if (!adjacent(days[i], days[j])) continue;
            score -= isLegKind(kindsOrder[i]) && isLegKind(kindsOrder[j]) ? 30 : 8;
          }
        const used = new Set<number>([...runs, ...days]);
        const rest = inp.free.filter((d) => !used.has(d));
        if (rest.includes(((lay.longDay + 1) % 7) as Weekday)) score += 6;
        if (rest.includes(((lay.longDay + 6) % 7) as Weekday)) score += 3;
        if (!best || score > best.score) best = { placed: days.map((d, i) => ({ kind: kindsOrder[i], day: d as Weekday })), score };
      }
    }
    if (best) return { ...best, unplaced: wanted.length - s };
  }
  return { placed: [], score: 0, unplaced: wanted.length };
}

/** When fewer sessions fit, the ones that matter most stay: leg work first, then upper body (the order of `wanted`). */
function chooseKinds(wanted: StrengthKind[], s: number): StrengthKind[] {
  const legs = wanted.filter(isLegKind);
  const upper = wanted.filter((k) => !isLegKind(k));
  // Keep a balance: alternate leg and upper sessions when cutting down.
  const out: StrengthKind[] = [];
  let l = 0;
  let u = 0;
  while (out.length < s && (l < legs.length || u < upper.length)) {
    if (l < legs.length) out.push(legs[l++]);
    if (out.length < s && u < upper.length) out.push(upper[u++]);
  }
  return out;
}

const emptyWeek = (): DayTemplate[] => Array.from({ length: 7 }, () => ({ run: 'rest' as const, extras: [] as string[] }));

/** The best week for these inputs. */
export function solveWeek(inp: WeekModelInput): WeekSolution {
  const free = [...inp.free].sort((a, b) => a - b) as Weekday[];
  if (!free.length) {
    return { week: emptyWeek(), runDays: [], longDay: 6, quality: [], recovery: [], strength: [], restDays: [], unplaced: inp.strength.length, longMinutes: null, longTight: false };
  }
  const input = { ...inp, free };
  let best: { lay: RunLayout; kinds: DayKind[]; str: ReturnType<typeof placeStrength>; total: number } | null = null;
  for (const lay of runLayouts(input)) {
    const kinds = dayKinds(lay);
    const str = placeStrength(input, lay, kinds);
    const total = -lay.cost + str.score - str.unplaced * 500;
    if (!best || total > best.total) best = { lay, kinds, str, total };
  }
  if (!best) return { week: emptyWeek(), runDays: [], longDay: free[free.length - 1], quality: [], recovery: [], strength: [], restDays: free, unplaced: inp.strength.length, longMinutes: null, longTight: false };
  return assemble(input, best.lay, best.kinds, best.str);
}

/** The week of a run layout with the strength sessions on it, and why each one sits where it does. */
function assemble(input: WeekModelInput, lay: RunLayout, kinds: DayKind[], str: ReturnType<typeof placeStrength>): WeekSolution {
  const free = input.free;
  const week = emptyWeek();
  for (const d of lay.runSet) week[d].run = kinds[d] === 'rest' ? 'easy' : kinds[d];
  const strengthDays = new Set<number>();
  const strength = [...str.placed]
    .sort((a, b) => a.day - b.day)
    .map((p) => {
      week[p.day].extras.push(p.kind);
      strengthDays.add(p.day);
      const k = kinds[p.day];
      return { kind: p.kind, day: p.day, why: (k === 'quality' || k === 'long' ? 'hardDay' : k === 'rest' ? 'rest' : 'easyDay') as StrengthWhy };
    });
  const restDays = free.filter((d) => week[d].run === 'rest' && !strengthDays.has(d));
  const longBudget = budgetOf(input.minutes, lay.longDay);
  return {
    week,
    runDays: lay.runSet,
    longDay: lay.longDay,
    quality: lay.quality,
    recovery: lay.runSet.filter((d) => kinds[d] === 'recovery'),
    strength,
    restDays,
    unplaced: str.unplaced,
    longMinutes: Number.isFinite(longBudget) ? longBudget : null,
    longTight: longBudget < LONG_MIN[input.level],
  };
}

/**
 * The strength sessions around runs that are already fixed (a running plan that exists and stays as it is): the same rules as
 * solveWeek, but only the strength days are searched; every run keeps its day and its kind.
 */
export function solveAroundRuns(inp: WeekModelInput, runWeek: DayTemplate[]): WeekSolution {
  const free = [...inp.free].sort((a, b) => a - b) as Weekday[];
  const runSet = ALL_DAYS.filter((d) => runWeek[d].run !== 'rest');
  const long = runWeek.findIndex((d) => d.run === 'long');
  const lay: RunLayout = { runSet, longDay: (long >= 0 ? long : (runSet[runSet.length - 1] ?? 6)) as Weekday, quality: ALL_DAYS.filter((d) => runWeek[d].run === 'quality'), cost: 0 };
  const kinds = runWeek.map((d) => d.run as DayKind);
  const input = { ...inp, free };
  return assemble(input, lay, kinds, placeStrength(input, lay, kinds));
}
