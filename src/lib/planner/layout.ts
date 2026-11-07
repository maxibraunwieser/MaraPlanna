// The run layout of a week: which days carry runs, which of them are hard and which is the long run. The automatic week of the
// questionnaire and the plan engine both take it from here.

import type { DayTemplate, Weekday } from '../types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));


export interface WeekLayout {
  runDays: Weekday[];
  quality: Weekday[];
  recoveryDays: Weekday[];
  longDay: Weekday;
}

/** Layout from a user-defined week; extra quality days beyond `quality` become easy runs. */
export function templateLayout(week: DayTemplate[], quality: number): WeekLayout {
  const days = (slot: string) => week.flatMap((d, i) => (d.run === slot ? [i as Weekday] : []));
  return {
    runDays: week.flatMap((d, i) => (d.run !== 'rest' ? [i as Weekday] : [])),
    quality: days('quality').slice(0, quality),
    recoveryDays: days('recovery'),
    longDay: (days('long')[0] ?? 6) as Weekday,
  };
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

const circularGap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
const adjacent = (a: number, b: number) => circularGap(a, b) === 1;

/** Lengths of consecutive-day runs in a (circular) week. */
function streaks(days: number[]): number[] {
  const set = new Set(days);
  if (set.size === 7) return [7];
  const start = [...Array(7).keys()].find((d) => !set.has(d))!;
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

export function chooseLayout(availableDays: Weekday[], runDays: number, longDay: Weekday, quality: number): WeekLayout {
  const avail = [...new Set<Weekday>([...availableDays, longDay])].sort((a, b) => a - b);
  const n = clamp(runDays, 1, avail.length);
  const others = avail.filter((d) => d !== longDay);
  const dayAfterLong = ((longDay + 1) % 7) as Weekday;
  const dayBeforeLong = ((longDay + 6) % 7) as Weekday;

  let runSet: Weekday[] = [longDay];
  let best = Infinity;
  for (const combo of combinations(others, n - 1)) {
    const days = [...combo, longDay];
    let score = 0;
    for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) if (adjacent(days[i], days[j])) score += 10;
    // Long streaks of consecutive run days are worse than several short ones.
    for (const len of streaks(days)) if (len > 2) score += (len - 2) ** 2 * 5;
    if (combo.includes(dayAfterLong)) score += 2;
    if (combo.includes(dayBeforeLong)) score += 1;
    if (score < best) {
      best = score;
      runSet = days;
    }
  }
  runSet.sort((a, b) => a - b);

  const candidates = runSet.filter((d) => d !== longDay);
  const q = clamp(quality, 0, Math.max(0, candidates.length - (runSet.length >= 4 ? 1 : 0)));
  let qualityDays: Weekday[] = [];
  best = Infinity;
  for (const combo of combinations(candidates, q)) {
    let score = 0;
    for (const d of combo) {
      if (d === dayBeforeLong) score += 25;
      if (d === dayAfterLong) score += 20;
    }
    for (let i = 0; i < combo.length; i++)
      for (let j = i + 1; j < combo.length; j++) {
        if (adjacent(combo[i], combo[j])) score += 30;
        score -= circularGap(combo[i], combo[j]);
      }
    if (score < best) {
      best = score;
      qualityDays = combo;
    }
  }
  const recoveryDays = runSet.includes(dayAfterLong) && !qualityDays.includes(dayAfterLong) ? [dayAfterLong] : [];
  return { runDays: runSet, quality: [...qualityDays].sort((a, b) => a - b), recoveryDays, longDay };
}

