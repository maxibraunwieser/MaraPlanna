import { describe, expect, it } from 'vitest';
import {
  EMPTY_PREFS,
  EXERCISES,
  buildStrengthFeed,
  exerciseById,
  matchExercise,
  normalizePrefs,
  prefsReady,
  repTarget,
  sessionOrder,
  strengthRows,
  toKg,
  toUnit,
} from '../../supabase/functions/_shared/strength.ts';
import { buildRunFeed } from '../../supabase/functions/_shared/runFeed.ts';
import type { CalWorkout } from '../../supabase/functions/_shared/calendar.ts';

const prefs = normalizePrefs({ wrist: 'left', equipment: 'free', exercises: ['squat', 'bench_press', 'row', 'nope'], weightUnit: 'kg', savedAt: '2026-11-04T10:00:00Z' });

const session = (over: Partial<CalWorkout> = {}): CalWorkout => ({
  id: '11111111-1111-1111-1111-111111111111',
  date: '2026-11-04',
  kind: 'strength_full',
  title: 'Strength test',
  steps: [
    { type: 'exercise', name: 'Bench press', sets: 3, reps: '8', id: 'bench_press' },
    { type: 'exercise', name: 'Back squat', sets: 4, reps: '5–8' },
    { type: 'exercise', name: 'Calf raise', sets: 2, reps: '15' },
    { type: 'exercise', name: 'Hollow hold', sets: 3, reps: '20–30 s' },
  ],
  distance_km: null,
  duration_min: 30,
  key_session: false,
  status: 'planned',
  note: null,
  ...over,
});

describe('library', () => {
  it('has unique ids and every exercise has a family and defaults', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.sets).toBeGreaterThan(0);
      expect(e.reps).toBeGreaterThan(0);
      expect(e.restS).toBeGreaterThanOrEqual(30);
    }
  });

  it('matches the plan generator exercise names', () => {
    expect(matchExercise('Back squat')).toBe('squat');
    expect(matchExercise('Goblet squat')).toBe('squat');
    expect(matchExercise('Bench press')).toBe('bench_press');
    expect(matchExercise('Dumbbell floor press')).toBe('bench_press');
    expect(matchExercise('Overhead press')).toBe('shoulder_press');
    expect(matchExercise('Dumbbell shoulder press')).toBe('shoulder_press');
    expect(matchExercise('Romanian deadlift')).toBe('deadlift');
    expect(matchExercise('Bulgarian split squat')).toBe('lunge'); // the longer alias beats "squat"
    expect(matchExercise('Pull-up')).toBe('pull_up');
    expect(matchExercise('Push-up')).toBe('pushup');
    expect(matchExercise('Calf raise')).toBeNull();
  });

  it('puts big lifts before small ones', () => {
    expect(sessionOrder(['bicep_curl', 'squat', 'bench_press'])).toEqual(['squat', 'bench_press', 'bicep_curl']);
  });
});

describe('settings', () => {
  it('drops unknown exercise ids and keeps the answers', () => {
    expect(prefs.exercises).toEqual(['squat', 'bench_press', 'row']);
    expect(prefs.wrist).toBe('left');
  });

  it('is ready only when wrist, equipment and an exercise were saved', () => {
    expect(prefsReady(EMPTY_PREFS)).toBe(false);
    expect(prefsReady(prefs)).toBe(true);
    expect(prefsReady({ ...prefs, wrist: null })).toBe(false);
    expect(prefsReady({ ...prefs, exercises: [] })).toBe(false);
    expect(prefsReady({ ...prefs, savedAt: null })).toBe(false);
  });

  it('never shares data unless the user said yes', () => {
    expect(normalizePrefs(null).shareData).toBe(false);
    expect(normalizePrefs({ shareData: 'yes' }).shareData).toBe(false);
    expect(normalizePrefs({ shareData: true }).shareData).toBe(true);
  });
});

describe('numbers', () => {
  it('reads the repetition target', () => {
    expect(repTarget('8')).toBe(8);
    expect(repTarget('8–10')).toBe(8);
    expect(repTarget('10 / side')).toBe(10);
    expect(repTarget('20–30 s')).toBe(0);
    expect(repTarget('max')).toBe(0);
  });

  it('converts weights in both directions to half units', () => {
    expect(toUnit(60, 'kg')).toBe(60);
    expect(toUnit(60, 'lb')).toBe(132.5);
    expect(toKg(132.5, 'lb')).toBeCloseTo(60.1, 1);
    expect(toKg(62.5, 'kg')).toBe(62.5);
  });
});

describe('watch feed', () => {
  it('has the list of the user\'s exercises and today\'s session with last weights', () => {
    const f = buildStrengthFeed({ prefs, workouts: [session()], lastKg: { bench_press: 60, squat: 80 } });
    expect(f.ready).toBe(true);
    expect(f.w).toBe('l');
    expect(f.ex.map((e) => e.i)).toEqual(['squat', 'bench_press', 'row']);
    expect(f.ex[0]).toEqual({ i: 'squat', n: 'Kniebeuge', f: 'squat' });
    expect(f.today?.id).toBe('11111111-1111-1111-1111-111111111111');
    const [bench, squat, calf, hold] = f.today!.ex;
    expect(bench).toMatchObject({ i: 'bench_press', n: 'Bankdrücken', f: 'push_h', s: 3, r: 8, k: 60, rest: 120 });
    expect(squat).toMatchObject({ i: 'squat', s: 4, r: 5, k: 80 });
    expect(calf).toMatchObject({ i: '', n: 'Calf raise', f: '', s: 2, r: 15, rest: 90 });
    expect(calf.k).toBeUndefined();
    expect(hold.r).toBe(0); // a timed exercise has no repetition target
  });

  it('converts last weights to the user\'s unit', () => {
    const f = buildStrengthFeed({ prefs: { ...prefs, weightUnit: 'lb' }, workouts: [session()], lastKg: { bench_press: 60 } });
    expect(f.u).toBe('lb');
    expect(f.today!.ex[0].k).toBe(132.5);
  });

  it('says not ready without saved settings but still lists nothing personal', () => {
    const f = buildStrengthFeed({ prefs: EMPTY_PREFS, workouts: [session()], lastKg: {} });
    expect(f.ready).toBe(false);
    expect(f.w).toBeNull();
    expect(f.ex).toEqual([]);
  });

  it('ignores skipped sessions and runs', () => {
    expect(buildStrengthFeed({ prefs, workouts: [session({ status: 'skipped' })], lastKg: {} }).today).toBeNull();
    expect(buildStrengthFeed({ prefs, workouts: [session({ kind: 'easy', steps: [] })], lastKg: {} }).today).toBeNull();
  });

  it('is part of the run feed only when settings are passed', () => {
    const base = { vdot: 50, paces: null, units: 'km' as const, workouts: [session()], date: '2026-11-04' };
    expect(buildRunFeed(base).strength).toBeUndefined();
    const feed = buildRunFeed({ ...base, strength: { prefs, lastKg: {} } });
    expect(feed.strength?.today?.ex).toHaveLength(4);
    expect(exerciseById(feed.strength!.today!.ex[0].i)?.family).toBe('push_h');
    // the run part does not change
    expect(feed.workout).toBeNull();
    expect(feed.days).toHaveLength(1);
  });
});

describe('upload from the watch', () => {
  // The body StrengthController.sendSets() builds (garmin-runapp/source/strength/StrengthController.mc)
  const body = {
    date: '2026-11-04',
    started: 1793900000,
    unit: 'kg',
    workout: '11111111-1111-1111-1111-111111111111',
    diag: { hz: 25, calls: 400, smp: 10000, gyro: 10000, gap: 1100, gy: 1 },
    sets: [
      { i: 0, e: 'bench_press', n: 'Bankdrücken', r: 8, m: 'plan', t: 30, d: 11, g: [15, 16, 0, 0, 290, 13], k: 60 },
      { i: 1, e: '', n: 'Wadenheben', r: 15, m: 'pick', t: 160, d: 20, g: [30, 2, 1, 0, 200, 20] },
      { i: 2, e: 'squat', n: 'Kniebeuge', r: 5, m: 'bogus', t: 300, d: 9 },
    ],
  };

  it('turns the body into rows', () => {
    const made = strengthRows('user-1', body, 'left');
    if (!('rows' in made)) throw new Error(made.error);
    expect(made.rows).toHaveLength(3);
    const [a, b, c] = made.rows;
    expect(a).toMatchObject({ user_id: 'user-1', session_key: '1793900000', idx: 0, exercise_id: 'bench_press', exercise_name: null, reps: 8, weight_kg: 60, source: 'plan', wrist: 'left', duration_s: 11 });
    expect(a.started_at).toBe(new Date((1793900000 + 30) * 1000).toISOString());
    expect(a.workout_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(a.diag).toEqual({ g: [15, 16, 0, 0, 290, 13], s: body.diag }); // training measurements ride on the first set
    expect(b).toMatchObject({ exercise_id: null, exercise_name: 'Wadenheben', source: 'pick', weight_kg: null });
    expect(b.diag).toEqual({ g: [30, 2, 1, 0, 200, 20] });
    expect(c.source).toBe('plan'); // unknown source falls back
    expect(c.diag).toBeNull();
  });

  it('converts pounds and ignores junk', () => {
    const made = strengthRows('u', { started: 1793900000, unit: 'lb', sets: [{ i: 0, e: 'squat', r: 5, k: 132.5 }, { i: 'x', r: 3 }, { r: 2 }] }, null);
    if (!('rows' in made)) throw new Error(made.error);
    expect(made.rows).toHaveLength(1);
    expect(made.rows[0].weight_kg).toBeCloseTo(60.1, 1);
    expect(made.rows[0].wrist).toBeNull();
  });

  it('refuses an empty or broken upload', () => {
    expect(strengthRows('u', { started: 0, sets: [{ i: 0, r: 1 }] }, null)).toHaveProperty('error');
    expect(strengthRows('u', { started: 1793900000, sets: [] }, null)).toHaveProperty('error');
    expect(strengthRows('u', { started: 1793900000, sets: [{ i: 'a', r: 'b' }] }, null)).toHaveProperty('error');
  });
});
