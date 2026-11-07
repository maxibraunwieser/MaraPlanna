import { describe, expect, it } from 'vitest';
import { normalizePrefs, buildStrengthFeed, prefsReady, watchExercises, type Routine } from '../../supabase/functions/_shared/strength.ts';
import type { CalWorkout } from '../../supabase/functions/_shared/calendar.ts';
import {
  CATALOG, alternatives, available, catalogEntry, customExercise, defaultGear, deriveEquipment, exerciseCount, libraryIds, prescribe, routineMinutes,
  routinePatches, routineSteps, suggestAll, suggestRoutine, type Setup,
} from './strengthPlan';
import { extraSession } from './planner/extras';
import type { PlannedWorkout, WeekSummary } from './types';

const setup = (over: Partial<Setup> = {}): Setup => ({ equipment: 'free', gear: defaultGear('free'), avoid: [], goal: 'running', level: 'some', minutes: 45, ...over });
const keys = (r: Routine) => r.exercises.map((x) => x.key);

describe('catalogue', () => {
  it('has unique keys, and every library id it names exists', () => {
    expect(new Set(CATALOG.map((x) => x.key)).size).toBe(CATALOG.length);
    for (const x of CATALOG) if (x.lib) expect(normalizePrefs({ exercises: [x.lib] }).exercises).toEqual([x.lib]);
  });

  it('every kind of person has something to do for every movement pattern', () => {
    for (const style of ['free', 'machines', 'mixed', 'bodyweight'] as const) {
      for (const type of ['lower', 'upper', 'full'] as const) {
        const r = suggestRoutine(type, setup({ equipment: style, gear: defaultGear(style), level: 'new' }));
        expect(r.exercises.length, `${style} ${type}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('suggestions follow equipment and style', () => {
  it('free weights with a rack: barbell basics for an experienced lifter', () => {
    const r = suggestRoutine('lower', setup({ level: 'experienced', goal: 'strong' }));
    expect(keys(r)).toContain('back_squat');
    expect(keys(r)).toContain('deadlift');
    expect(r.exercises[0]).toMatchObject({ sets: 5, reps: '5' });
  });

  it('machines only: no free-weight exercise at all', () => {
    const r = suggestRoutine('upper', setup({ equipment: 'machines', gear: defaultGear('machines'), level: 'new', goal: 'muscle' }));
    for (const k of keys(r)) expect(['machine', 'body']).toContain(catalogEntry(k)!.style);
    expect(keys(r)).toContain('chest_press');
  });

  it('bodyweight: nothing that needs equipment the person does not have', () => {
    const s = setup({ equipment: 'bodyweight', gear: [], level: 'some' });
    for (const type of ['lower', 'upper', 'full'] as const) {
      for (const x of suggestRoutine(type, s).exercises) expect(catalogEntry(x.key)!.needs).toEqual([]);
    }
  });

  it('without a rack there is no back squat; without a pull-up bar no pull-up', () => {
    const r = suggestRoutine('full', setup({ gear: ['barbell', 'dumbbell', 'bench'] }));
    expect(keys(r)).not.toContain('back_squat');
    expect(keys(suggestRoutine('upper', setup({ gear: ['dumbbell', 'bench'] })))).not.toContain('pull_up');
  });

  it('an experienced lifter gets the main version of a movement, not an accessory one', () => {
    const lower = keys(suggestRoutine('lower', setup({ level: 'experienced', goal: 'strong' })));
    expect(lower).toContain('bulgarian');
    expect(lower).not.toContain('step_up');
    const upper = keys(suggestRoutine('upper', setup({ level: 'experienced', goal: 'strong' })));
    expect(upper[0]).toBe('bench_press');
  });

  it('a new lifter does not get exercises above their level', () => {
    const r = suggestRoutine('lower', setup({ level: 'new' }));
    for (const k of keys(r)) expect(catalogEntry(k)!.level).toBe(0);
  });
});

describe('suggestions avoid limitations', () => {
  it('knees: no split squats, step-ups or leg extensions', () => {
    for (const style of ['free', 'machines', 'mixed'] as const) {
      const r = suggestRoutine('lower', setup({ equipment: style, gear: defaultGear(style), avoid: ['knee'], level: 'experienced' }));
      for (const k of keys(r)) expect(catalogEntry(k)!.avoid).not.toContain('knee');
    }
  });

  it('shoulders and wrists: no overhead pressing, dips, push-ups or barbell curls', () => {
    const r = suggestRoutine('upper', setup({ avoid: ['shoulder', 'wrist'], level: 'experienced', goal: 'muscle' }));
    for (const k of keys(r)) {
      expect(catalogEntry(k)!.avoid).not.toContain('shoulder');
      expect(catalogEntry(k)!.avoid).not.toContain('wrist');
    }
    expect(keys(r)).not.toContain('ohp');
  });

  it('lower back: no deadlift or barbell row', () => {
    const r = suggestRoutine('full', setup({ avoid: ['back'], level: 'experienced' }));
    expect(keys(r)).not.toContain('deadlift');
    expect(keys(r)).not.toContain('bb_row');
    expect(keys(r)).not.toContain('back_squat');
  });

  it('the swap list respects them too', () => {
    const squat = suggestRoutine('lower', setup({ level: 'experienced' })).exercises.find((x) => x.key === 'back_squat')!;
    for (const alt of alternatives(squat, setup({ avoid: ['knee', 'back'] }))) expect(alt.avoid).not.toContain('back');
  });
});

describe('goal and level shape the prescription', () => {
  const main = catalogEntry('back_squat')!;
  it('running: heavy and few repetitions once the person has some experience', () => {
    expect(prescribe(main, 'running', 'some')).toEqual({ sets: 3, reps: '4–6' });
    expect(prescribe(main, 'running', 'experienced')).toEqual({ sets: 4, reps: '4–6' });
    expect(prescribe(main, 'running', 'new')).toEqual({ sets: 3, reps: '8–10' });
  });
  it('muscle: moderate repetitions; health: lighter volume; strong: fives', () => {
    expect(prescribe(main, 'muscle', 'some').reps).toBe('8–10');
    expect(prescribe(main, 'health', 'some')).toEqual({ sets: 3, reps: '10' });
    expect(prescribe(main, 'strong', 'experienced')).toEqual({ sets: 5, reps: '5' });
  });
  it('core work is timed and small exercises get more repetitions', () => {
    expect(prescribe(catalogEntry('plank')!, 'running', 'some')).toEqual({ sets: 3, reps: '45 s' });
    expect(prescribe(catalogEntry('lateral_raise')!, 'muscle', 'some').reps).toBe('12–15');
  });
  it('the session length decides how many exercises', () => {
    expect(exerciseCount(30, 6)).toBe(4);
    expect(exerciseCount(45, 6)).toBe(5);
    expect(exerciseCount(75, 6)).toBe(6);
    expect(suggestRoutine('lower', setup({ minutes: 30 })).exercises.length).toBeLessThan(suggestRoutine('lower', setup({ minutes: 75 })).exercises.length);
  });
  it('is deterministic', () => {
    expect(suggestRoutine('upper', setup())).toEqual(suggestRoutine('upper', setup()));
  });
});

describe('suggestAll', () => {
  it('keeps what the person wrote themselves, fills the rest', () => {
    const own: Routine = { id: 'lower', by: 'own', updatedAt: null, exercises: [customExercise('Sled push')] };
    const out = suggestAll(['lower', 'upper'], setup(), [own]);
    expect(out[0]).toBe(own);
    expect(out[1].by).toBe('suggested');
    expect(out[1].exercises.length).toBeGreaterThan(2);
  });
});

describe('custom exercises', () => {
  it('a catalogue name is matched; a free name stays free', () => {
    expect(customExercise('bench press')).toMatchObject({ key: 'bench_press', name: 'Bench press', id: 'bench_press' });
    expect(customExercise('rope jumping')).toEqual({ key: '', name: 'Rope jumping', sets: 3, reps: '10', kg: null });
  });
});

describe('workout -> plan', () => {
  const routine: Routine = {
    id: 'lower', by: 'own', updatedAt: null,
    exercises: [
      { key: 'back_squat', name: 'Back squat', id: 'squat', sets: 4, reps: '5', kg: 80 },
      { key: 'plank', name: 'Plank', sets: 3, reps: '45 s' },
    ],
  };

  it('steps carry sets, reps, library id and the target weight; deload weeks have one set less', () => {
    expect(routineSteps(routine)).toEqual([
      { type: 'exercise', name: 'Back squat', sets: 4, reps: '5', id: 'squat', key: 'back_squat', kg: 80 },
      { type: 'exercise', name: 'Plank', sets: 3, reps: '45 s', key: 'plank' },
    ]);
    const light = routineSteps(routine, true);
    expect(light.map((s) => (s.type === 'exercise' ? s.sets : 0))).toEqual([3, 2]);
    expect(routineMinutes(routine)).toBe(Math.round(5 + 7 * 2.5));
    expect(routineMinutes(routine, true)).toBeLessThan(routineMinutes(routine));
  });

  it('the plan generator uses the workout instead of its default pool', () => {
    const own = extraSession({ id: 'lower', type: 'lower', perWeek: 1 }, 'build', false, 'gym', routine);
    expect(own.title).toBe('Lower body strength');
    expect(own.steps).toEqual(routineSteps(routine));
    const dflt = extraSession({ id: 'lower', type: 'lower', perWeek: 1 }, 'build', false, 'gym');
    expect(dflt.steps).not.toEqual(own.steps);
    // recovery weeks: deload
    expect(extraSession({ id: 'lower', type: 'lower', perWeek: 1 }, 'build', true, 'gym', routine).steps).toEqual(routineSteps(routine, true));
    // an empty workout falls back to the default pool
    expect(extraSession({ id: 'lower', type: 'lower', perWeek: 1 }, 'build', false, 'gym', { ...routine, exercises: [] }).steps).toEqual(dflt.steps);
  });

  const w = (over: Partial<PlannedWorkout>): PlannedWorkout => ({
    id: 'w', plan_id: 'p', user_id: 'u', date: '2026-11-10', week: 2, phase: 'build', kind: 'strength_lower', title: 'Lower body strength', steps: [],
    distance_km: null, duration_min: 40, key_session: false, status: 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, original_date: null, note: null, ...over,
  });
  const weeks: WeekSummary[] = [
    { week: 1, startDate: '2026-11-02', phase: 'build', targetKm: 30, longKm: 14, recovery: false },
    { week: 2, startDate: '2026-11-09', phase: 'build', targetKm: 30, longKm: 14, recovery: false },
    { week: 3, startDate: '2026-11-16', phase: 'build', targetKm: 24, longKm: 12, recovery: true },
  ];

  it('changes reach only sessions that have not happened yet, with deload in recovery weeks', () => {
    const list = [
      w({ id: 'future' }),
      w({ id: 'past', date: '2026-11-03', week: 1 }),
      w({ id: 'done', status: 'completed', date: '2026-11-11' }),
      w({ id: 'recovery', date: '2026-11-18', week: 3 }),
      w({ id: 'upper', kind: 'strength_upper', date: '2026-11-12' }),
      w({ id: 'run', kind: 'easy', date: '2026-11-13' }),
    ];
    const patches = routinePatches(list, [routine], weeks, '2026-11-06');
    expect(patches.map((p) => p.id).sort()).toEqual(['future', 'recovery']);
    expect(patches.find((p) => p.id === 'recovery')!.steps).toEqual(routineSteps(routine, true));
    expect(patches.find((p) => p.id === 'future')!.steps).toEqual(routineSteps(routine));
  });

  it('nothing to do when the sessions already match', () => {
    expect(routinePatches([w({ steps: routineSteps(routine) })], [routine], weeks, '2026-11-06')).toEqual([]);
  });
});

describe('equipment and the watch', () => {
  it('derives the planner equipment class from style and gear', () => {
    expect(deriveEquipment({ equipment: 'bodyweight', gear: ['barbell'] })).toBe('bodyweight');
    expect(deriveEquipment({ equipment: 'free', gear: ['barbell', 'rack'] })).toBe('gym');
    expect(deriveEquipment({ equipment: 'machines', gear: ['machines'] })).toBe('gym');
    expect(deriveEquipment({ equipment: 'free', gear: ['dumbbell'] })).toBe('dumbbells');
    expect(deriveEquipment({ equipment: 'free', gear: [] })).toBe('bodyweight');
  });

  it('the watch knows every library exercise of the workouts and is ready without a separate list', () => {
    const routines: Routine[] = [suggestRoutine('lower', setup({ level: 'experienced' })), suggestRoutine('upper', setup())];
    expect(libraryIds(routines).length).toBeGreaterThan(3);
    const prefs = normalizePrefs({ wrist: 'left', equipment: 'free', exercises: [], routines, savedAt: '2026-11-06T08:00:00Z' });
    expect(watchExercises(prefs).sort()).toEqual(libraryIds(routines).sort());
    expect(prefsReady(prefs)).toBe(true);
    expect(prefsReady({ ...prefs, routines: [] })).toBe(false);
  });

  it('the feed uses the workout weight until the person has logged one', () => {
    const session: CalWorkout = {
      id: '11111111-1111-1111-1111-111111111111', date: '2026-11-06', kind: 'strength_lower', title: 'Lower body strength', distance_km: null, duration_min: 40,
      key_session: false, status: 'planned', note: null,
      steps: [{ type: 'exercise', name: 'Back squat', sets: 4, reps: '5', id: 'squat', kg: 80 }, { type: 'exercise', name: 'Bench press', sets: 3, reps: '8', id: 'bench_press', kg: 50 }],
    };
    const prefs = normalizePrefs({ wrist: 'left', equipment: 'free', exercises: ['squat'], savedAt: 'x' });
    const feed = buildStrengthFeed({ prefs, workouts: [session], lastKg: { bench_press: 55 } });
    expect(feed.today!.ex.map((x) => x.k)).toEqual([80, 55]);
  });
});

describe('normalising the saved setup', () => {
  it('keeps clean values and drops junk', () => {
    const p = normalizePrefs({
      goal: 'running', level: 'weird', minutes: 500, gear: ['barbell', 'jetpack', 'barbell'], avoid: ['knee', 'ego'], equipment: 'bodyweight',
      routines: [{ id: 'lower', by: 'own', exercises: [{ key: 'x', name: ' Sled push ', sets: 99, reps: '', kg: -4 }, { name: '' }] }, { id: '' }],
    });
    expect(p).toMatchObject({ goal: 'running', level: null, minutes: 120, gear: ['barbell'], avoid: ['knee'], equipment: 'bodyweight' });
    expect(p.routines).toEqual([{ id: 'lower', by: 'own', updatedAt: null, exercises: [{ key: 'x', name: 'Sled push', sets: 10, reps: '10' }] }]);
  });

  it('old saves without the new fields still work', () => {
    const p = normalizePrefs({ wrist: 'right', equipment: 'mixed', exercises: ['squat'], weightUnit: 'kg', savedAt: '2026-11-01T00:00:00Z' });
    expect(p).toMatchObject({ goal: null, level: null, minutes: 45, gear: [], avoid: [], routines: [] });
    expect(prefsReady(p)).toBe(true);
  });
});

describe('available()', () => {
  it('machines count as met by a cable machine', () => {
    const lat = catalogEntry('lat_pulldown')!;
    expect(available(lat, { equipment: 'mixed', gear: ['cable'], avoid: [] })).toBe(true);
    expect(available(lat, { equipment: 'mixed', gear: [], avoid: [] })).toBe(false);
  });
});
