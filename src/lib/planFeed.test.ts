import { describe, expect, it } from 'vitest';
import { buildPlanFeed, buildWeeksFeed, doneRuns, doneStrength, planDays, planSteps, type DoneActivity, type DoneSet } from '../../supabase/functions/_shared/planFeed.ts';
import type { CalPaces, CalStep, CalWorkout } from '../../supabase/functions/_shared/calendar.ts';

const paces: CalPaces = { recovery: [380, 420], easy: [340, 370], long: [345, 375], marathon: 300, threshold: 275, interval: 250, repetition: 230 };

const workout = (over: Partial<CalWorkout>): CalWorkout => ({
  id: 'w', date: '2026-11-04', kind: 'intervals', title: 'Intervals 5 × 1 km', steps: [], distance_km: 10, duration_min: 55, key_session: true, status: 'planned', note: null, ...over,
});

describe('plan steps', () => {
  const steps: CalStep[] = [
    { type: 'run', label: 'Warm-up', zone: 'easy', distanceKm: 2 },
    { type: 'run', label: 'Interval', zone: 'interval', distanceKm: 1, repeat: 5, recoveryKm: 0.4 },
    { type: 'run', label: 'Cool-down', zone: 'easy', distanceKm: 1.5 },
  ];

  it('keeps repeats together with the recovery between them', () => {
    expect(planSteps(steps, paces)).toEqual([
      { n: 'Einlaufen', d: 2000, lo: 340, hi: 370 },
      { n: 'Interval', d: 1000, r: 5, rd: 400, lo: 245, hi: 255 },
      { n: 'Auslaufen', d: 1500, lo: 340, hi: 370 },
    ]);
  });

  it('time based reps with a time recovery; strides have no target', () => {
    const out = planSteps([{ type: 'run', label: 'Strides (20 s fast, relaxed)', zone: 'repetition', durationMin: 1 / 3, repeat: 6, recoveryMin: 1 }], paces);
    expect(out).toEqual([{ n: 'Steigerung', s: 20, r: 6, rs: 60 }]);
  });

  it('a single step has no repeat count and no recovery', () => {
    const out = planSteps([{ type: 'run', label: 'Easy', zone: 'easy', distanceKm: 8, repeat: 1, recoveryKm: 0.4 }], paces);
    expect(out).toEqual([{ n: 'Easy', d: 8000, lo: 340, hi: 370 }]);
  });

  it('without paces the steps carry no target', () => {
    expect(planSteps(steps, null)[1]).toEqual({ n: 'Interval', d: 1000, r: 5, rd: 400 });
  });

  it('strength exercises are shown with sets and reps', () => {
    const out = planSteps([{ type: 'exercise', name: 'Bench press', sets: 3, reps: '8' }, { type: 'exercise', name: 'Plank', sets: 3, reps: '45 s' }], paces);
    expect(out).toEqual([{ n: 'Bench press', x: '3 × 8' }, { n: 'Plank', x: '3 × 45 s' }]);
  });

  it('is capped so one session cannot blow up the feed', () => {
    const many: CalStep[] = Array.from({ length: 30 }, () => ({ type: 'exercise', name: 'Curl', sets: 3, reps: '10' }));
    expect(planSteps(many, paces)).toHaveLength(12);
  });
});

describe('plan days', () => {
  const start = '2026-11-02'; // Monday
  const list = [
    workout({ id: 'a', date: '2026-11-04', title: 'Easy run', kind: 'easy', steps: [{ type: 'run', label: 'Easy', zone: 'easy', distanceKm: 8 }], distance_km: 8, key_session: false, status: 'completed' }),
    workout({ id: 'b', date: '2026-11-04', title: 'Core stability', kind: 'core', steps: [{ type: 'exercise', name: 'Plank', sets: 3, reps: '45 s' }], distance_km: null, duration_min: 20, key_session: false }),
    workout({ id: 'c', date: '2026-11-12', title: 'Long run', kind: 'long', steps: [{ type: 'run', label: 'Long run', zone: 'long', distanceKm: 22 }], distance_km: 22, status: 'skipped' }),
    workout({ id: 'd', date: '2026-11-20', title: 'Too far', kind: 'easy', steps: [], distance_km: 5 }),
  ];

  it('lists this and next week with status, kilometres, minutes and steps', () => {
    const days = planDays(list, start, paces);
    expect(days.map((d) => [d.i, d.t, d.s, d.k, d.m])).toEqual([
      [2, 'Easy run', 'c', 8, 55],
      [2, 'Core stability', 'p', undefined, 20],
      [10, 'Long run', 'x', 22, 55],
    ]);
    expect(days[0].st).toEqual([{ n: 'Easy', d: 8000, lo: 340, hi: 370 }]);
  });

  it('matches the order of the main feed (same day: key session first)', () => {
    const days = planDays([list[1], list[0]].map((w, i) => ({ ...w, key_session: i === 1 })), start, paces);
    expect(days.map((d) => d.t)).toEqual(['Easy run', 'Core stability']);
  });

  it('a session without steps has no step list', () => {
    expect(planDays([workout({ steps: [] })], start, paces)[0].st).toBeUndefined();
  });
});

const act = (over: Partial<DoneActivity>): DoneActivity => ({
  id: 'x', name: 'Vienna Running', start_time: '2026-11-03T06:30:00Z', local_date: '2026-11-03', duration_s: 3300, moving_s: 3240, distance_m: 10_200.4, avg_hr: 151.2,
  elevation_gain_m: 84.6, aerobic_te: 3.24, ...over,
});

describe('finished runs', () => {
  const start = '2026-11-02';

  it('carries the numbers of the run, rounded for the watch', () => {
    const [r] = doneRuns([act({})], [], start);
    expect(r).toEqual({ i: 1, t: 'Vienna Running', ts: Date.parse('2026-11-03T06:30:00Z') / 1000, k: 10.2, s: 3240, h: 151, e: 85, te: 3.2 });
  });

  it('is titled after the planned session it was matched to, with its planned distance', () => {
    const [r] = doneRuns([act({ id: 'a1' })], [{ activity_id: 'a1', title: 'Tempo 8 km', distance_km: '9.5' }], start);
    expect(r).toMatchObject({ t: 'Tempo 8 km', pk: 9.5, k: 10.2 });
  });

  it('earlier weeks count backwards from the Monday', () => {
    const [r] = doneRuns([act({ local_date: '2026-10-25', start_time: '2026-10-25T07:00:00Z' })], [], start);
    expect(r.i).toBe(-8);
  });

  it('newest first, at most ten, and missing numbers are left out', () => {
    const many = Array.from({ length: 14 }, (_, n) => act({ id: `r${n}`, start_time: `2026-10-${String(10 + n).padStart(2, '0')}T06:00:00Z`, local_date: `2026-10-${String(10 + n).padStart(2, '0')}` }));
    const out = doneRuns(many, [], start);
    expect(out).toHaveLength(10);
    expect(out[0].ts).toBeGreaterThan(out[9].ts);
    const [bare] = doneRuns([act({ distance_m: null, moving_s: null, duration_s: null, avg_hr: null, elevation_gain_m: null, aerobic_te: null, name: null })], [], start);
    expect(bare).toEqual({ i: 1, t: 'Lauf', ts: Date.parse('2026-11-03T06:30:00Z') / 1000 });
  });
});

describe('finished strength trainings', () => {
  const start = '2026-11-02';
  const set = (session: string, idx: number, id: string | null, reps: number, kg: number | null, name: string | null = null): DoneSet => ({
    session_key: session, local_date: '2026-11-04', idx, exercise_id: id, exercise_name: name, reps, weight_kg: kg,
  });

  it('one line per exercise with sets, reps and the heaviest weight', () => {
    const out = doneStrength([set('1000', 0, 'bench_press', 8, 60), set('1000', 1, 'bench_press', 8, 62.5), set('1000', 2, 'bench_press', 7, 62.5), set('1000', 3, 'squat', 5, null), set('1000', 4, null, 12, 20, 'Face pull')], start);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ i: 2, t: 'Kraft', ts: 1000 });
    expect(out[0].x).toEqual([['Bankdrücken', '3 × 8/8/7 · 62.5 kg'], ['Kniebeuge', '1 × 5'], ['Face pull', '1 × 12 · 20 kg']]);
  });

  it('equal reps are shown as 3 × 8', () => {
    expect(doneStrength([set('1', 0, 'squat', 8, 80), set('1', 1, 'squat', 8, 80), set('1', 2, 'squat', 8, 80)], start)[0].x).toEqual([['Kniebeuge', '3 × 8 · 80 kg']]);
  });

  it('newest training first, at most three', () => {
    const sets = ['10', '20', '30', '40'].map((k) => set(k, 0, 'squat', 5, 50));
    expect(doneStrength(sets, start).map((d) => d.ts)).toEqual([40, 30, 20]);
  });
});

describe('plan feed', () => {
  it('mixes runs and strength newest first and stays small', () => {
    const plan = buildPlanFeed({
      date: '2026-11-05',
      paces,
      workouts: Array.from({ length: 12 }, (_, n) =>
        workout({ id: `w${n}`, date: `2026-11-${String(2 + n).padStart(2, '0')}`, steps: [{ type: 'run', label: 'Warm-up', zone: 'easy', distanceKm: 2 }, { type: 'run', label: 'Interval', zone: 'interval', distanceKm: 1, repeat: 5, recoveryKm: 0.4 }, { type: 'run', label: 'Cool-down', zone: 'easy', distanceKm: 1.5 }] }),
      ),
      activities: Array.from({ length: 12 }, (_, n) => act({ id: `a${n}`, start_time: `2026-10-${String(10 + n).padStart(2, '0')}T06:00:00Z`, local_date: `2026-10-${String(10 + n).padStart(2, '0')}` })),
      sets: [{ session_key: String(Date.parse('2026-10-20T10:00:00Z') / 1000), local_date: '2026-10-20', idx: 0, exercise_id: 'squat', exercise_name: null, reps: 8, weight_kg: 80 }],
    });
    expect(plan.start).toBe('2026-11-02');
    expect(plan.days).toHaveLength(12);
    const ts = plan.done.map((d) => d.ts);
    expect([...ts].sort((a, b) => b - a)).toEqual(ts);
    expect(plan.done.some((d) => d.x)).toBe(true);
    // Everything the watch stores must stay small: it is parsed on watches with 128 KB of memory.
    expect(JSON.stringify(plan).length).toBeLessThan(5000);
  });

  it('works without a plan or finished sessions', () => {
    expect(buildPlanFeed({ date: '2026-11-05', paces: null, workouts: [] })).toEqual({ v: 1, start: '2026-11-02', days: [], done: [] });
  });
});

describe('week overview', () => {
  const weeks = [
    { week: 5, startDate: '2026-10-26', phase: 'base' as const, recovery: false },
    { week: 6, startDate: '2026-11-02', phase: 'base' as const, recovery: false },
    { week: 7, startDate: '2026-11-09', phase: 'build' as const, recovery: true },
    { week: 8, startDate: '2026-11-16', phase: 'peak' as const, recovery: false },
  ];
  const sessions = [
    workout({ date: '2026-11-03', kind: 'easy', title: 'Easy run', distance_km: 8, duration_min: 48, status: 'completed' }),
    workout({ date: '2026-11-05', kind: 'strength_lower', title: 'Unterkoerper-Krafttraining mit langem Titel', distance_km: null, duration_min: 40 }),
    workout({ date: '2026-11-08', kind: 'long', title: 'Long run', distance_km: 20.4, duration_min: 125 }),
    workout({ date: '2026-11-10', kind: 'intervals', title: 'Intervals', distance_km: 9, duration_min: 55 }),
    workout({ date: '2026-11-12', kind: 'easy', title: 'Skipped', distance_km: 6, duration_min: 36, status: 'skipped' }),
    workout({ date: '2026-11-19', kind: 'core', title: 'Rumpf', distance_km: null, duration_min: 25 }),
  ];

  it('starts with the current week and leaves earlier weeks out', () => {
    const f = buildWeeksFeed({ date: '2026-11-04', weeks, workouts: sessions });
    expect(f.start).toBe('2026-11-02');
    expect(f.weeks.map((w) => w.n)).toEqual([6, 7, 8]);
    expect(f.weeks.map((w) => w.i)).toEqual([0, 7, 14]);
  });

  it('counts runs, strength and kilometres of each week, skipped sessions not', () => {
    const f = buildWeeksFeed({ date: '2026-11-04', weeks, workouts: sessions });
    expect(f.weeks[0]).toMatchObject({ n: 6, p: 'b', k: 28, r: 2, s: 1 });
    expect(f.weeks[1]).toMatchObject({ n: 7, p: 'u', k: 9, r: 1, s: 0, e: 1 });
    expect(f.weeks[2]).toMatchObject({ n: 8, p: 'p', k: 0, r: 0, s: 1 });
    expect(f.weeks[0].e).toBeUndefined();
  });

  it('lists the sessions with day, short title, km, minutes and status', () => {
    const f = buildWeeksFeed({ date: '2026-11-04', weeks, workouts: sessions });
    expect(f.weeks[0].d[0]).toEqual([1, 'Easy run', 8, 48, 'c']);
    expect(f.weeks[0].d[1]).toEqual([3, 'Unterkoerper-Kraft', 0, 40, 'p']);
    expect(f.weeks[1].d.map((d) => d[4])).toEqual(['p', 'x']);
  });

  it('is small enough for the watch: 20 weeks of 7 sessions fit in one stored value (8 KB)', () => {
    const start = '2026-11-02';
    const ws = Array.from({ length: 20 }, (_, n) => ({ week: n + 1, startDate: new Date(Date.parse(start) + n * 7 * 86_400_000).toISOString().slice(0, 10), phase: 'build' as const, recovery: false }));
    const wo = ws.flatMap((w) => Array.from({ length: 7 }, (_, d) => workout({ date: new Date(Date.parse(w.startDate) + d * 86_400_000).toISOString().slice(0, 10), title: 'Fahrtspiel 6 x 2 Min.', kind: 'intervals', distance_km: 7.5, duration_min: 44 })));
    const json = JSON.stringify(buildWeeksFeed({ date: start, weeks: ws, workouts: wo }));
    expect(json.length).toBeLessThan(8000);
  });
});
