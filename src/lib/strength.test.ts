import { describe, expect, it } from 'vitest';
import {
  EMPTY_PREFS,
  EXERCISES,
  buildStrengthFeed,
  catalogOfStep,
  exerciseById,
  holdTarget,
  libraryIdOf,
  matchExercise,
  normalizePrefs,
  prefsReady,
  repTarget,
  sessionOrder,
  signaturesOf,
  watchName,
  strengthRows,
  toKg,
  toUnit,
} from '../../supabase/functions/_shared/strength.ts';
import { EQUIP_BITS, MOVES, feedMove } from '../../supabase/functions/_shared/exercisePoses.ts';
import { CATALOG } from '../../supabase/functions/_shared/exerciseCatalog.ts';
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
    expect(matchExercise('Calf raise')).toBe('calf_machine');
    expect(matchExercise('Something nobody has')).toBeNull();
  });

  it('knows every exercise of the website\'s catalogue, with how it is counted', () => {
    for (const x of CATALOG) {
      const lib = exerciseById(libraryIdOf(x));
      expect(lib, x.key).toBeDefined();
      expect(['auto', 'assist', 'time']).toContain(lib!.count);
    }
    // a hold is timed, machines and floor work are counted with a check, the rest from the movement
    expect(exerciseById('plank')!.count).toBe('time');
    expect(exerciseById('leg_press')!.count).toBe('assist');
    expect(exerciseById('leg_curl')!.count).toBe('assist');
    expect(exerciseById('bicep_curl')!.count).toBe('auto');
    expect(exerciseById('kb_swing')!.count).toBe('auto');
    // catalogue exercises resolve to their own entry or to the one they are linked to
    expect(libraryIdOf(CATALOG.find((x) => x.key === 'goblet_squat')!)).toBe('squat');
    expect(libraryIdOf(CATALOG.find((x) => x.key === 'face_pull')!)).toBe('face_pull');
    expect(catalogOfStep({ name: 'Goblet squat' })?.key).toBe('goblet_squat');
    expect(catalogOfStep({ name: 'whatever', key: 'dips' })?.key).toBe('dips');
  });

  it('reads a hold and shortens a name for the watch', () => {
    expect(holdTarget('45 s')).toBe(45);
    expect(holdTarget('30–45 s / side')).toBe(30);
    expect(holdTarget('2 min')).toBe(120);
    expect(holdTarget('10 / side')).toBe(0);
    expect(watchName('Single-leg calf raise (holding DB)').length).toBeLessThanOrEqual(22);
    expect(watchName('Back squat')).toBe('Kniebeuge mit Langhantel'.length <= 22 ? watchName('Back squat') : 'Kniebeuge');
    expect(watchName('Plank')).not.toBe('');
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
    // the person's list first, then what today's session has besides
    expect(f.ex.map((e) => e.i).slice(0, 3)).toEqual(['squat', 'bench_press', 'row']);
    expect(f.ex[0]).toMatchObject({ i: 'squat', n: 'Kniebeuge', f: 'squat', m: 0 });
    expect(f.today?.id).toBe('11111111-1111-1111-1111-111111111111');
    const [bench, squat, calf, hold] = f.today!.ex;
    expect(bench).toMatchObject({ i: 'bench_press', n: 'Bankdrücken', f: 'push_h', s: 3, r: 8, k: 60, rest: 120 });
    expect(squat).toMatchObject({ i: 'squat', s: 4, r: 5, k: 80, a: 'back_squat', m: 0 });
    // calf raise is in the library now (counted with a check), a hold is timed and has no repetition target
    expect(calf).toMatchObject({ i: 'calf_machine', f: 'calf', s: 2, r: 15, m: 1 });
    expect(hold).toMatchObject({ i: 'hollow_hold', m: 2, h: 20, r: 0, s: 3 });
    expect(hold.k).toBeUndefined();
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
    expect(f.ex.map((e) => e.i)).toEqual(['bench_press', 'squat', 'calf_machine', 'hollow_hold']); // today's exercises only, none of the person's own
    expect(f.sess).toHaveLength(1);
  });

  it('sends every strength session of the day to choose from', () => {
    const two = buildStrengthFeed({ prefs, workouts: [session(), session({ id: '22222222-2222-2222-2222-222222222222', kind: 'core', title: 'Core stability', steps: [{ type: 'exercise', name: 'Dead bug', sets: 3, reps: '10 / side' }, { type: 'exercise', name: 'Side plank', sets: 2, reps: '30 s / side' }, { type: 'exercise', name: 'Bird dog', sets: 2, reps: '10 / side' }] }), session({ id: '33333333-3333-3333-3333-333333333333', status: 'skipped' }), session({ id: '44444444-4444-4444-4444-444444444444', kind: 'easy', steps: [] })], lastKg: {} });
    // the titles in German, as the website shows them (the watch app speaks German)
    expect(two.sess.map((x) => [x.t, x.c])).toEqual([['Krafttest', 'full'], ['Rumpfstabilität', 'core']]);
    expect(two.today?.id).toBe(two.sess[0].id);
    const core = two.sess[1].ex;
    expect(core.map((e) => [e.i, e.m])).toEqual([['dead_bug', 0], ['side_plank', 2], ['bird_dog', 1]]);
    expect(core[1]).toMatchObject({ h: 30, r: 0 });
    expect(core[0].a).toBe('dead_bug');
  });

  it('learns what an exercise feels like from the confirmed sets, for the person\'s wrist only', () => {
    const row = (id: string, f: number[], over: Record<string, unknown> = {}) => ({ exercise_id: id, source: 'plan', wrist: 'left', diag: { g: [3, 4, 5, 0, 200, 10, ...f] }, ...over });
    const bench = (a: number) => row('bench_press', [26 + a, 300 + a * 10, 80, 110, 90, 100]);
    const rows = [bench(0), bench(1), bench(2), bench(-1), row('squat', [30, 200, 70, 90, 120, 100]), row('squat', [31, 210, 72, 92, 118, 100]), row('bench_press', [10, 1, 1, 1, 1, 1], { wrist: 'right' }), row('row', [20, 250, 30, 100, 100, 100], { diag: { g: [1, 2, 3] } })];
    const sigs = signaturesOf(rows, 'left');
    expect(Object.keys(sigs)).toEqual(['bench_press']); // squat has two sets only, the row's numbers are too few, the right wrist is another sensor position
    expect(sigs.bench_press).toHaveLength(13);
    expect(sigs.bench_press[0]).toBe(4);
    expect(sigs.bench_press[1]).toBeGreaterThanOrEqual(26);
    expect(sigs.bench_press[1]).toBeLessThanOrEqual(28);
    expect(sigs.bench_press[3]).toBe(80); // no spread in the share along gravity
    const feed = buildStrengthFeed({ prefs, workouts: [session()], lastKg: {}, sigs });
    expect(Object.keys(feed.sig ?? {})).toEqual(['bench_press']);
    expect(buildStrengthFeed({ prefs, workouts: [session()], lastKg: {} }).sig).toBeUndefined();
  });

  it('ignores skipped sessions and runs', () => {
    expect(buildStrengthFeed({ prefs, workouts: [session({ status: 'skipped' })], lastKg: {} }).today).toBeNull();
    expect(buildStrengthFeed({ prefs, workouts: [session({ kind: 'easy', steps: [] })], lastKg: {} }).today).toBeNull();
  });

  it('is part of the run feed only when settings are passed', () => {
    const base = { vdot: 50, paces: null, units: 'km' as const, workouts: [session()], date: '2026-11-04' };
    expect(buildRunFeed(base).strength).toBeUndefined();
    const feed = buildRunFeed({ ...base, strength: { prefs } });
    // small: the sessions of the day and their figures are a request of their own
    expect(feed.strength).toEqual({ ready: true, w: 'l', u: 'kg', auto: true, share: false });
    expect(JSON.stringify(feed.strength).length).toBeLessThan(100);
    expect(exerciseById('bench_press')?.family).toBe('push_h');
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

describe('exercise animations', () => {
  it('has a clean move for every hand-tuned exercise of the library', () => {
    for (const e of EXERCISES.filter((x) => MOVES[x.id])) {
      const m = MOVES[e.id];
      expect(m, e.id).toBeDefined();
      expect(m.frames.length).toBeGreaterThanOrEqual(2);
      for (const f of m.frames) {
        expect(f).toHaveLength(9);
        for (const a of f) expect(Number.isFinite(a) && Math.abs(a) <= 360).toBe(true);
      }
      expect(m.ms).toBeGreaterThanOrEqual(2000);
      expect(m.ms).toBeLessThanOrEqual(5000);
      const [x0, y0, x1, y1] = m.view;
      expect(x1).toBeGreaterThan(x0 + 40);
      expect(y1).toBeGreaterThan(y0 + 60);
      expect(y1).toBeGreaterThanOrEqual(0); // the floor is inside the picture
    }
  });

  it('encodes a move for the watch', () => {
    const f = feedMove(MOVES.bench_press);
    expect(f).toMatchObject({ p: 3, x: 0, y: 56, ms: 3200 });
    expect(f.q).toBe(EQUIP_BITS.bb | EQUIP_BITS.bench | EQUIP_BITS.rack);
    expect(f.k).toHaveLength(2);
    expect(f.v).toHaveLength(4);
    expect(feedMove(MOVES.pushup).p).toBe(1);
    expect(feedMove(MOVES.pull_up).p).toBe(2);
  });

  it('sends figures for the exercises of the user and of today, and none when turned off', () => {
    const f = buildStrengthFeed({ prefs, workouts: [session()], lastKg: {} });
    // by the animation key (the catalogue exercise): bench press, back squat, the calf raise and the plank of the session, and the person's own
    expect(Object.keys(f.an ?? {}).sort()).toEqual(['back_squat', 'bb_row', 'bench_press', 'calf_machine', 'hollow_hold']);
    expect(f.an!.back_squat.k.map((r) => r.slice(0, 9))).toEqual(MOVES.squat.frames);
    expect(f.an!.hollow_hold.g ?? []).toBeDefined();
    const off = buildStrengthFeed({ prefs: { ...prefs, animation: false }, workouts: [session()], lastKg: {} });
    expect(off.an).toBeUndefined();
    expect(f.an!['']).toBeUndefined();
    // the goblet squat shows a goblet squat, not the back squat
    const goblet = buildStrengthFeed({ prefs, workouts: [session({ steps: [{ type: 'exercise', name: 'Goblet squat', sets: 3, reps: '10' }, { type: 'exercise', name: 'Dumbbell Romanian deadlift', sets: 3, reps: '10' }] })], lastKg: {} });
    expect(goblet.sess[0].ex.map((e) => e.a)).toEqual(['goblet_squat', 'rdl_db']);
    expect(goblet.an!.goblet_squat.g).toBeDefined();
    expect(goblet.an!.goblet_squat.k).not.toEqual(goblet.an!.back_squat?.k);
  });

  it('keeps the animation setting', () => {
    expect(normalizePrefs({}).animation).toBe(true);
    expect(normalizePrefs({ animation: false }).animation).toBe(false);
  });
});

describe('watch feed: the workouts of the website', () => {
  const lower = { id: 'lower', exercises: [{ key: 'back_squat', name: 'Back squat', id: 'squat', sets: 4, reps: '5', kg: 80 }, { key: 'rdl_bb', name: 'Romanian deadlift', sets: 3, reps: '6' }], by: 'own' as const, updatedAt: null };
  const park = { id: 'own-park', name: 'Park session', exercises: [{ key: 'pull_up', name: 'Pull-up', id: 'pull_up', sets: 3, reps: '6–10' }, { key: 'dead_hang', name: 'Dead hang', sets: 3, reps: '30 s' }], by: 'own' as const, updatedAt: null, schedule: { mode: 'series' as const, days: [5], from: '2026-11-04', until: null } };
  const upper = { id: 'upper', name: 'Push & pull', exercises: [{ key: 'bench_press', name: 'Bench press', id: 'bench_press', sets: 4, reps: '6' }], by: 'suggested' as const, updatedAt: null };
  const withRoutines = (routines: unknown[]) => normalizePrefs({ ...prefs, routines });

  it('lists every workout with its exercises, the planner\'s first, built from the website each time', () => {
    const f = buildStrengthFeed({ prefs: withRoutines([park, lower, upper]), workouts: [], lastKg: { squat: 85 } });
    expect(f.wo!.map((w) => [w.r, w.t, w.c])).toEqual([['lower', 'Unterkörper', 'lower'], ['upper', 'Push & pull', 'upper'], ['own-park', 'Park session', 'custom']]);
    const squat = f.wo![0].ex[0];
    expect(squat).toMatchObject({ i: 'squat', s: 4, r: 5 });
    // the weight of the last time wins over the workout's own target
    expect(squat.k).toBe(85);
    expect(f.wo![2].ex.length).toBe(2);
    // a change on the website is in the next feed
    const changed = buildStrengthFeed({ prefs: withRoutines([{ ...lower, exercises: [lower.exercises[0]] }]), workouts: [], lastKg: {} });
    expect(changed.wo!.map((w) => w.ex.length)).toEqual([1]);
  });

  it('links today\'s planned session of a workout, so finishing it on the watch completes it', () => {
    const today = [session({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'strength_lower' }), session({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', kind: 'custom', routine_id: 'own-park', title: 'Park session' })];
    const f = buildStrengthFeed({ prefs: withRoutines([lower, park, upper]), workouts: today, lastKg: {} });
    expect(f.wo!.find((w) => w.r === 'lower')!.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(f.wo!.find((w) => w.r === 'own-park')!.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(f.wo!.find((w) => w.r === 'upper')!.id).toBe('');
  });

  it('has no workouts before the strength part is set up, and none without exercises', () => {
    expect(buildStrengthFeed({ prefs: normalizePrefs({ routines: [lower] }), workouts: [], lastKg: {} }).wo).toBeUndefined();
    expect(buildStrengthFeed({ prefs: withRoutines([{ ...lower, exercises: [] }]), workouts: [], lastKg: {} }).wo).toBeUndefined();
  });

  it('keeps at most six workouts (the watch stores each on its own)', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...park, id: `own-${i}`, name: `W${i}` }));
    expect(buildStrengthFeed({ prefs: withRoutines(many), workouts: [], lastKg: {} }).wo!.length).toBe(6);
  });
});
