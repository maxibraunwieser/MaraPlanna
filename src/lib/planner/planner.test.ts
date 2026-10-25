import { describe, expect, it } from 'vitest';
import type { Activity, OnboardingAnswers, PlannedWorkout, TrainingPlan } from '../types';
import { addDays, weekdayOf } from './dates';
import { raceTimeForVdot, trainingPaces, vdotFromRace, MARATHON_M } from './vdot';
import { assessFitness } from './fitness';
import { assignPhases, buildPlan, chooseLayout, generateWeeks } from './generate';
import { adaptPlan, reconcile } from './adapt';
import { readiness } from './readiness';

const TODAY = '2026-10-26'; // Monday

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  raceName: 'Vienna City Marathon',
  raceDate: '2027-04-18',
  goalType: 'time',
  goalTimeS: 3 * 3600 + 45 * 60,
  raceTerrain: 'flat',
  level: 'intermediate',
  yearsRunning: 3,
  marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 1 * 3600 + 48 * 60, date: '2026-09-20' },
  currentWeeklyKm: 35,
  longestRecentRunKm: 16,
  runDaysPerWeek: 5,
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  longRunDay: 6,
  weekdayMaxMinutes: null,
  strength: { enabled: true, focus: 'upper_lower', perWeek: 2, equipment: 'gym' },
  age: 34,
  sex: 'male',
  maxHr: null,
  injuryProne: false,
  injuries: '',
  approach: 'balanced',
  units: 'km',
  ...over,
});

const fitnessFor = (a: OnboardingAnswers) => assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY });

const toPlanned = (drafts: ReturnType<typeof buildPlan>['workouts']): PlannedWorkout[] =>
  drafts.map((d, i) => ({
    ...d,
    id: `w${i}`,
    plan_id: 'p',
    user_id: 'u',
    status: 'planned',
    status_source: 'auto',
    activity_id: null,
    actual_distance_km: null,
    original_date: null,
    note: null,
  }));

const run = (id: string, date: string, kmDist: number, extra: Partial<Activity> = {}): Activity => ({
  id,
  user_id: 'u',
  source: 'garmin',
  external_id: id,
  name: 'Run',
  sport: 'run',
  sub_type: 'running',
  start_time: `${date}T07:00:00Z`,
  local_date: date,
  duration_s: kmDist * 330,
  moving_s: kmDist * 330,
  distance_m: kmDist * 1000,
  avg_hr: 145,
  max_hr: 165,
  elevation_gain_m: 50,
  calories: 500,
  training_load: 100,
  aerobic_te: 3,
  vo2max: null,
  ...extra,
});

describe('VDOT model', () => {
  it('matches Daniels reference values', () => {
    // 3:10:49 marathon ≈ VDOT 50; 20:00 5K ≈ VDOT 49.8
    expect(vdotFromRace(MARATHON_M, 3 * 3600 + 10 * 60 + 49)).toBeCloseTo(50, 0);
    expect(vdotFromRace(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    const t = raceTimeForVdot(50, MARATHON_M);
    expect(Math.abs(t - (3 * 3600 + 10 * 60 + 49))).toBeLessThan(60);
    const p = trainingPaces(50, 271);
    expect(p.threshold).toBeGreaterThan(250); // ~4:15/km
    expect(p.threshold).toBeLessThan(260);
    expect(p.interval).toBeGreaterThan(230); // ~3:55/km
    expect(p.interval).toBeLessThan(240);
  });
});

describe('phases', () => {
  it('splits weeks into base/build/peak/taper', () => {
    const p = assignPhases(16);
    expect(p).toHaveLength(16);
    expect(p.filter((x) => x === 'taper')).toHaveLength(3);
    expect(p[0]).toBe('base');
    expect(p[15]).toBe('taper');
  });
});

describe('layout', () => {
  it('spreads quality days away from the long run', () => {
    const l = chooseLayout([0, 1, 2, 3, 4, 5, 6], 5, 6, 2);
    expect(l.runDays).toHaveLength(5);
    expect(l.runDays).toContain(6);
    expect(l.quality).toHaveLength(2);
    for (const q of l.quality) {
      expect(q).not.toBe(5); // not the day before the long run
      expect(q).not.toBe(0); // not the day after
    }
    expect(Math.abs(l.quality[0] - l.quality[1])).toBeGreaterThan(1);
  });
});

describe('plan generation', () => {
  const a = answers();
  const plan = buildPlan(a, fitnessFor(a), TODAY);

  it('ends with the race on race day', () => {
    const last = plan.workouts[plan.workouts.length - 1];
    expect(last.kind).toBe('race');
    expect(last.date).toBe(a.raceDate);
  });

  it('never schedules before today or after race day', () => {
    for (const w of plan.workouts) {
      expect(w.date >= TODAY).toBe(true);
      expect(w.date <= a.raceDate).toBe(true);
    }
  });

  it('respects run days per week', () => {
    for (const wk of plan.weeks) {
      const runDays = new Set(plan.workouts.filter((w) => w.week === wk.week && w.distance_km).map((w) => w.date));
      expect(runDays.size).toBeLessThanOrEqual(a.runDaysPerWeek);
    }
  });

  it('progresses volume safely and tapers', () => {
    const vols = plan.weeks.map((w) => w.targetKm);
    const peak = Math.max(...vols);
    expect(peak).toBeGreaterThan(55);
    expect(peak).toBeLessThan(90);
    for (let i = 1; i < plan.weeks.length; i++) {
      if (!plan.weeks[i].recovery && plan.weeks[i].phase !== 'taper' && !plan.weeks[i - 1].recovery) {
        expect(vols[i]).toBeLessThanOrEqual(vols[i - 1] * 1.2 + 3);
      }
    }
    const taper = plan.weeks.filter((w) => w.phase === 'taper');
    expect(taper[0].targetKm).toBeLessThan(peak);
    const longest = Math.max(...plan.weeks.map((w) => w.longKm));
    expect(longest).toBeGreaterThanOrEqual(28);
    expect(longest).toBeLessThanOrEqual(34);
  });

  it('places strength sessions and never lower body before the long run', () => {
    const strength = plan.workouts.filter((w) => w.kind.startsWith('strength'));
    expect(strength.length).toBeGreaterThan(20);
    for (const s of strength.filter((w) => w.kind === 'strength_lower')) {
      const next = addDays(s.date, 1);
      expect(plan.workouts.some((w) => w.date === next && (w.kind === 'long' || w.kind === 'long_mp'))).toBe(false);
      expect(plan.workouts.some((w) => w.date === s.date && (w.kind === 'long' || w.kind === 'long_mp'))).toBe(false);
    }
    // No strength in race week
    const raceWeek = plan.weeks[plan.weeks.length - 1].week;
    expect(strength.some((w) => w.week === raceWeek)).toBe(false);
  });

  it('includes marathon-specific work', () => {
    expect(plan.workouts.some((w) => w.kind === 'marathon_pace')).toBe(true);
    expect(plan.workouts.some((w) => w.kind === 'long_mp')).toBe(true);
    expect(plan.workouts.some((w) => w.kind === 'threshold')).toBe(true);
  });

  it('works for a beginner on 3 days with a weekday time cap', () => {
    const b = answers({
      level: 'beginner',
      marathonsCompleted: 0,
      recentRace: null,
      currentWeeklyKm: 15,
      longestRecentRunKm: 8,
      runDaysPerWeek: 3,
      availableDays: [1, 3, 5],
      longRunDay: 5,
      weekdayMaxMinutes: 45,
      goalType: 'finish',
      goalTimeS: null,
      strength: { enabled: true, focus: 'full', perWeek: 1, equipment: 'bodyweight' },
    });
    const p = buildPlan(b, fitnessFor(b), TODAY);
    expect(p.workouts.at(-1)?.kind).toBe('race');
    for (const w of p.workouts) {
      if (w.distance_km && w.kind !== 'race') expect([1, 3, 5, 6, 4, 2, 0]).toContain(weekdayOf(w.date));
    }
    const weekdayRuns = p.workouts.filter((w) => w.distance_km && weekdayOf(w.date) <= 4 && w.kind !== 'race' && w.kind !== 'shakeout');
    for (const w of weekdayRuns) expect(w.duration_min!).toBeLessThanOrEqual(50);
  });
});

describe('adaptation', () => {
  const a = answers();
  const built = buildPlan(a, fitnessFor(a), TODAY);
  const plan: TrainingPlan = {
    id: 'p',
    user_id: 'u',
    status: 'active',
    race_name: a.raceName,
    race_date: a.raceDate,
    start_date: TODAY,
    inputs: a,
    fitness: built.fitness,
    weeks: built.weeks,
    created_at: TODAY,
    updated_at: TODAY,
  };

  it('links runs to workouts and marks misses', () => {
    const ws = toPlanned(built.workouts);
    const firstRun = ws.find((w) => w.distance_km)!;
    const later = addDays(firstRun.date, 3);
    const acts = [run('a1', firstRun.date, firstRun.distance_km!)];
    const { workouts } = reconcile(ws, acts, later);
    const linked = workouts.find((w) => w.id === firstRun.id)!;
    expect(linked.status).toBe('completed');
    expect(linked.activity_id).toBe('a1');
    const missed = workouts.filter((w) => w.date < later && w.status === 'missed');
    expect(missed.length).toBeGreaterThan(0);
  });

  it('reschedules a missed key session without stacking hard days', () => {
    const ws = toPlanned(built.workouts);
    const key = ws.find((w) => w.key_session && w.kind !== 'long' && w.kind !== 'long_mp' && w.date > addDays(TODAY, 7))!;
    const today = addDays(key.date, 1);
    const acts = ws
      .filter((w) => w.distance_km && w.date < key.date)
      .map((w, i) => run(`r${i}`, w.date, w.distance_km!));
    const res = adaptPlan({ plan, workouts: ws, activities: acts, metrics: [], today });
    const moved = res.workouts.find((w) => w.id === key.id)!;
    expect(res.messages.some((m) => m.kind === 'reschedule' || m.kind === 'skip')).toBe(true);
    if (moved.original_date) {
      expect(moved.date >= today).toBe(true);
      const neighbours = res.workouts.filter(
        (w) => w.id !== moved.id && w.key_session && w.status !== 'skipped' && Math.abs(Date.parse(w.date) - Date.parse(moved.date)) <= 86_400_000,
      );
      expect(neighbours).toHaveLength(0);
    }
  });

  it('rebuilds upcoming weeks after a break', () => {
    const ws = toPlanned(built.workouts);
    const today = addDays(TODAY, 21);
    const acts = [run('x', addDays(TODAY, 1), 10), run('y', addDays(TODAY, 3), 8)];
    const res = adaptPlan({ plan, workouts: ws, activities: acts, metrics: [], today });
    expect(res.replan).not.toBeNull();
    expect(res.fitness?.vdot).toBeLessThan(plan.fitness.vdot);
    const again = generateWeeks({
      answers: a,
      fitness: res.fitness!,
      planStart: TODAY,
      firstDate: res.replan!.fromDate,
      startKm: res.replan!.startKm,
      startLongKm: res.replan!.startLongKm,
    });
    expect(again.workouts[0].date >= res.replan!.fromDate).toBe(true);
    expect(again.weeks[0].targetKm).toBeLessThan(40);
    expect(again.workouts.at(-1)?.kind).toBe('race');
  });
});

describe('readiness', () => {
  it('flags elevated resting HR and short sleep', () => {
    const base = Array.from({ length: 14 }, (_, i) => ({
      date: addDays(TODAY, -14 + i),
      resting_hr: 50,
      hrv_last_night: 60,
      hrv_weekly_avg: 60,
      hrv_status: 'BALANCED',
      sleep_s: 8 * 3600,
      sleep_score: 80,
      stress_avg: 25,
      body_battery_high: 90,
      body_battery_low: 20,
      steps: 9000,
    }));
    const r = readiness([...base, { ...base[0], date: TODAY, resting_hr: 59, sleep_s: 5 * 3600 }], TODAY);
    expect(r.level).toBe('low');
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
