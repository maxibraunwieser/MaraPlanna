import { describe, expect, it } from 'vitest';
import type { Activity, ActivitySample, DayTemplate, OnboardingAnswers, PlannedWorkout, TrainingPlan } from '../types';
import { addDays, weekdayOf } from './dates';
import { assessFitness } from './fitness';
import { buildPlan } from './generate';
import { kmInZones } from './workouts';
import { analyze, tandaProjection } from '../analysis';
import { normalizeAnswers } from '../answers';

const TODAY = '2026-10-26'; // Monday

const base = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers =>
  normalizeAnswers({
    raceName: 'Vienna',
    raceDate: '2027-04-18',
    goalType: 'time',
    goalTimeS: 3 * 3600 + 45 * 60,
    level: 'intermediate',
    marathonsCompleted: 1,
    recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' },
    currentWeeklyKm: 30,
    longestRecentRunKm: 14,
    runDaysPerWeek: 5,
    longRunDay: 6,
    extras: [],
    ...over,
  });

const plan = (a: OnboardingAnswers) => buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);

describe('long runs (Fokkema 2020 / Doherty 2020)', () => {
  for (const [level, min, big] of [
    ['beginner', 30, 2],
    ['intermediate', 32, 3],
    ['advanced', 34, 4],
  ] as const) {
    it(`${level}: peaks at ≥ ${min} km with ${big}+ near-peak runs`, () => {
      const p = plan(base({ level, runDaysPerWeek: level === 'beginner' ? 4 : 5 }));
      const longs = p.weeks.map((w) => w.longKm);
      expect(Math.max(...longs)).toBeGreaterThanOrEqual(min);
      expect(Math.max(...longs)).toBeLessThanOrEqual(35);
      expect(longs.filter((l) => l >= min - 2).length).toBeGreaterThanOrEqual(big);
    });
  }

  it('starts from the current longest run and grows gradually', () => {
    const p = plan(base());
    const longs = p.weeks.filter((w) => w.phase !== 'taper' && !w.recovery).map((w) => w.longKm);
    expect(longs[0]).toBeLessThanOrEqual(17);
    for (let i = 1; i < longs.length; i++) expect(longs[i] - longs[i - 1]).toBeLessThanOrEqual(3);
  });

  it('weekly volume supports the peak long run (≥ 40 km/week)', () => {
    const p = plan(base({ level: 'beginner', runDaysPerWeek: 3, availableDays: [1, 3, 6] }));
    expect(Math.max(...p.weeks.map((w) => w.targetKm))).toBeGreaterThanOrEqual(40);
  });

  it('keeps hard running to about 20–25 % of the week (80/20)', () => {
    const p = plan(base({ level: 'advanced', runDaysPerWeek: 6 }));
    for (const wk of p.weeks.filter((w) => w.phase !== 'taper')) {
      const ws = p.workouts.filter((w) => w.week === wk.week);
      const hard = ws.reduce((s, w) => s + kmInZones(w.steps, p.fitness.paces, ['marathon', 'threshold', 'interval', 'repetition']), 0);
      expect(hard).toBeLessThanOrEqual(Math.max(6, wk.targetKm * 0.27));
    }
  });
});

describe('custom week', () => {
  const week: DayTemplate[] = [
    { run: 'rest', extras: ['lower'] }, // Mon legs
    { run: 'easy', extras: [] },
    { run: 'easy', extras: [] },
    { run: 'quality', extras: [] }, // Thu intervals/tempo
    { run: 'easy', extras: [] },
    { run: 'rest', extras: ['upper'] }, // Sat upper body
    { run: 'long', extras: [] }, // Sun long
  ];
  const a = base({
    scheduleMode: 'custom',
    customWeek: week,
    extras: [
      { id: 'lower', type: 'lower', perWeek: 1 },
      { id: 'upper', type: 'upper', perWeek: 1 },
    ],
  });
  const p = plan(a);

  it('puts every session on the day the user chose', () => {
    for (const w of p.workouts) {
      const day = weekdayOf(w.date);
      if (w.kind === 'race') continue;
      if (w.kind === 'long' || w.kind === 'long_mp') expect(day).toBe(6);
      if (['threshold', 'intervals', 'marathon_pace', 'fartlek'].includes(w.kind) && w.phase !== 'taper') expect(day).toBe(3);
      if (w.kind === 'strength_lower') expect(day).toBe(0);
      if (w.kind === 'strength_upper') expect(day).toBe(5);
      if (w.distance_km && w.kind !== 'shakeout') expect(week[day].run).not.toBe('rest');
    }
  });

  it('still builds the long run to the peak', () => {
    expect(Math.max(...p.weeks.map((w) => w.longKm))).toBeGreaterThanOrEqual(31);
  });
});

describe('multi-select extras', () => {
  it('schedules every selected type at its frequency', () => {
    const p = plan(
      base({
        extras: [
          { id: 'core', type: 'core', perWeek: 2 },
          { id: 'mobility', type: 'mobility', perWeek: 2 },
          { id: 'plyo', type: 'plyo', perWeek: 1 },
          { id: 'bike', type: 'bike', perWeek: 1 },
          { id: 'c1', type: 'custom', name: 'Climbing', minutes: 90, hard: true, perWeek: 1 },
        ],
      }),
    );
    const wk = p.weeks.find((w) => w.phase === 'build' && !w.recovery)!;
    const ws = p.workouts.filter((w) => w.week === wk.week);
    expect(ws.filter((w) => w.kind === 'core')).toHaveLength(2);
    expect(ws.filter((w) => w.kind === 'mobility')).toHaveLength(2);
    expect(ws.filter((w) => w.kind === 'plyo')).toHaveLength(1);
    expect(ws.filter((w) => w.kind === 'bike')).toHaveLength(1);
    expect(ws.filter((w) => w.kind === 'custom' && w.title === 'Climbing')).toHaveLength(1);
    // Hard sessions never on the day before or of the long run.
    const longDate = ws.find((w) => w.kind === 'long' || w.kind === 'long_mp')!.date;
    for (const w of ws.filter((x) => x.kind === 'plyo' || (x.kind === 'custom' && x.title === 'Climbing'))) {
      expect(w.date).not.toBe(longDate);
      expect(w.date).not.toBe(addDays(longDate, -1));
    }
  });

  it('migrates the old single strength setting', () => {
    const a = normalizeAnswers({ strength: { enabled: true, focus: 'upper_lower', perWeek: 2, equipment: 'gym' } } as never);
    expect(a.extras.map((e) => e.type).sort()).toEqual(['lower', 'upper']);
    expect(a.equipment).toBe('gym');
  });
});

describe('workout analysis', () => {
  const a = base();
  const built = plan(a);
  const tp: TrainingPlan = {
    id: 'p', user_id: 'u', status: 'active', race_name: 'Vienna', race_date: a.raceDate, start_date: TODAY,
    inputs: a, fitness: built.fitness, weeks: built.weeks, created_at: TODAY, updated_at: TODAY,
  };
  const paces = built.fitness.paces;
  const act = (over: Partial<Activity>): Activity => ({
    id: 'a', user_id: 'u', source: 'garmin', external_id: '1', name: 'Run', sport: 'run', sub_type: 'running',
    start_time: `${TODAY}T07:00:00Z`, local_date: TODAY, duration_s: 3600, moving_s: 3600, distance_m: 10_000,
    avg_hr: 140, max_hr: 160, elevation_gain_m: 20, calories: 600, training_load: 80, aerobic_te: 3, vo2max: null, ...over,
  });

  it('detects interval reps in the pace stream and compares them with the target', () => {
    const w = built.workouts.find((x) => x.kind === 'threshold')!;
    const main = w.steps.find((s) => s.type === 'run' && s.label === 'Threshold') as Extract<(typeof w.steps)[number], { type: 'run' }>;
    const reps = main.repeat ?? 1;
    const samples: ActivitySample[] = [];
    let t = 0;
    let d = 0;
    const seg = (seconds: number, paceS: number, hr: number) => {
      for (let i = 0; i < seconds; i += 10) {
        samples.push({ t, d, hr, v: 1000 / paceS, alt: 100 });
        t += 10;
        d += (10 * 1000) / paceS;
      }
    };
    seg(720, paces.easy[1], 130);
    for (let r = 0; r < reps; r++) {
      seg(Math.round((main.distanceKm ?? 1) * paces.threshold), paces.threshold * 1.01, 170);
      if (r < reps - 1) seg(120, paces.recovery[1], 140);
    }
    seg(540, paces.easy[1], 135);
    const pw: PlannedWorkout = { ...w, id: 'w', plan_id: 'p', user_id: 'u', status: 'completed', status_source: 'auto', activity_id: 'a', actual_distance_km: d / 1000, original_date: null, note: null };
    const res = analyze({ workout: pw, activity: act({ distance_m: d, moving_s: t, duration_s: t }), details: { laps: [], samples }, plan: tp, activities: [], metrics: [], maxHr: 190 });
    expect(res.reps?.length).toBe(reps);
    for (const r of res.reps!) expect(Math.abs(r.deviationPct)).toBeLessThan(4);
    expect(res.score).toBeGreaterThanOrEqual(80);
  });

  it('flags an easy run that was too fast', () => {
    const w = built.workouts.find((x) => x.kind === 'easy')!;
    const pw: PlannedWorkout = { ...w, id: 'w', plan_id: 'p', user_id: 'u', status: 'completed', status_source: 'auto', activity_id: 'a', actual_distance_km: null, original_date: null, note: null };
    const km = w.distance_km!;
    const res = analyze({
      workout: pw,
      activity: act({ distance_m: km * 1000, moving_s: km * paces.easy[0] * 0.85, avg_hr: 172 }),
      details: null, plan: tp, activities: [], metrics: [], maxHr: 190,
    });
    expect(res.checks.find((c) => c.label === 'Pace')?.status).not.toBe('good');
    expect(res.score!).toBeLessThan(85);
  });

  it('Tanda projection: more weekly volume → faster projection', () => {
    const runs = (kmPerRun: number): Activity[] =>
      Array.from({ length: 40 }, (_, i) => act({ id: `r${i}`, local_date: addDays(TODAY, -i * 1.4 | 0), distance_m: kmPerRun * 1000, moving_s: kmPerRun * 330 }));
    const low = tandaProjection(runs(8), TODAY)!;
    const high = tandaProjection(runs(14), TODAY)!;
    expect(high.seconds).toBeLessThan(low.seconds);
    // 60 km/week at 5:30/km ≈ 3:25 marathon according to Tanda's formula
    expect(Math.abs(tandaProjection(runs(12), TODAY)!.seconds - 3.42 * 3600)).toBeLessThan(15 * 60);
  });
});
