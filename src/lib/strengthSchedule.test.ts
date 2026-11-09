import { describe, expect, it } from 'vitest';
import { normalizePrefs, type Routine } from '../../supabase/functions/_shared/strength';
import { normalizeAnswers } from './answers';
import { workoutMuscles } from './exerciseInfo';
import { applyStrengthPlan, setStrengthWanted, settle } from './onboarding/apply';
import { finalize } from './onboarding/finalize';
import { editStart } from './onboarding/seed';
import { addDays, mondayOf, weekdayOf } from './planner/dates';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { suggestRoutine } from './strengthPlan';
import { lastWeightOf, lastWeights } from './strengthStats';
import { coachLine } from '../../supabase/functions/_shared/content';
import { movePatches, movedDays, ownSessions, planEnd, routineIdOf, scheduleDates, sessionsOf, weekdaysOf } from './strengthSchedule';
import type { PlannedWorkout, Profile, TrainingPlan, WeekSummary } from './types';

const TODAY = '2026-11-09'; // a Monday
const NOW = '2026-11-09T08:00:00Z';
const weeks: WeekSummary[] = Array.from({ length: 6 }, (_, i) => ({ week: i + 1, startDate: addDays(TODAY, i * 7), phase: i === 5 ? 'taper' : 'build', targetKm: 40, longKm: 15, recovery: i === 3 }));
const plan = { id: 'p', user_id: 'u', race_date: addDays(TODAY, 41), weeks } as unknown as TrainingPlan;
const own = (schedule: Routine['schedule']): Routine => ({ id: 'own-park', name: 'Park session', exercises: suggestRoutine('cali', { equipment: 'bodyweight', gear: [], avoid: [], goal: 'health', level: 'some', minutes: 45 }).exercises, by: 'own', updatedAt: null, schedule });
const row = (date: string, kind: PlannedWorkout['kind'], extra: Partial<PlannedWorkout> = {}) => ({ id: `${kind}-${date}`, date, kind, status: 'planned', original_date: null, routine_id: null, ...extra }) as PlannedWorkout;

describe('the schedule of a workout of your own', () => {
  it('once: on its date when that is in the plan', () => {
    expect(scheduleDates({ mode: 'once', date: addDays(TODAY, 3) }, TODAY, plan.race_date)).toEqual([addDays(TODAY, 3)]);
    expect(scheduleDates({ mode: 'once', date: addDays(TODAY, -1) }, TODAY, plan.race_date)).toEqual([]);
  });

  it('series: on its weekdays from its start until its end or the end of the plan', () => {
    const all = scheduleDates({ mode: 'series', days: [0, 3], from: TODAY, until: null }, TODAY, plan.race_date);
    expect(all.length).toBe(12);
    expect(all.every((d) => [0, 3].includes(weekdayOf(d)))).toBe(true);
    expect(scheduleDates({ mode: 'series', days: [0], from: addDays(TODAY, 7), until: addDays(TODAY, 20) }, TODAY, plan.race_date)).toEqual([addDays(TODAY, 7), addDays(TODAY, 14)]);
  });

  it('its sessions carry the workout, its name and exercises, and are lighter in recovery and taper weeks', () => {
    const sessions = ownSessions(own({ mode: 'series', days: [2], from: TODAY, until: null }), plan, [], TODAY);
    expect(sessions.length).toBe(6);
    for (const s of sessions) {
      expect(s.routine_id).toBe('own-park');
      expect(s.kind).toBe('custom');
      expect(s.title).toBe('Park session');
      expect(s.steps.length).toBeGreaterThan(0);
    }
    const normal = sessions.find((s) => s.week === 1)!;
    const recovery = sessions.find((s) => s.week === 4)!;
    expect(recovery.duration_min!).toBeLessThan(normal.duration_min!);
    expect(sessions.find((s) => s.week === 6)!.phase).toBe('taper');
  });

  it('a day that already has a session of the workout gets no second one; the planner kinds and no schedule give none', () => {
    const r = own({ mode: 'series', days: [2], from: TODAY, until: null });
    const existing = [row(addDays(TODAY, 2), 'custom', { routine_id: 'own-park' })];
    expect(ownSessions(r, plan, existing, TODAY).map((s) => s.date)).not.toContain(addDays(TODAY, 2));
    expect(ownSessions({ ...r, id: 'lower' }, plan, [], TODAY)).toEqual([]);
    expect(ownSessions({ ...r, schedule: undefined }, plan, [], TODAY)).toEqual([]);
  });

  it('the schedule is kept when the settings are saved and loaded', () => {
    const r = own({ mode: 'series', days: [3, 1, 3, 9], from: TODAY, until: null });
    const back = normalizePrefs({ routines: [r, { ...r, id: 'own-x', schedule: { mode: 'once', date: 'soon' } }] }).routines;
    expect(back[0].schedule).toEqual({ mode: 'series', days: [1, 3], from: TODAY, until: null });
    expect(back[1].schedule).toBeUndefined();
  });
});

describe('which sessions belong to a workout', () => {
  it('own workouts by their id, the planner kinds by their kind', () => {
    const ws = [row(TODAY, 'strength_lower'), row(addDays(TODAY, 1), 'custom', { routine_id: 'own-park' }), row(addDays(TODAY, 2), 'easy'), row(addDays(TODAY, 3), 'custom')];
    expect(routineIdOf(ws[0])).toBe('lower');
    expect(routineIdOf(ws[1])).toBe('own-park');
    expect(routineIdOf(ws[2])).toBeNull();
    expect(routineIdOf(ws[3])).toBeNull();
    expect(sessionsOf(ws, 'lower').map((w) => w.id)).toEqual([ws[0].id]);
    expect(sessionsOf(ws, 'own-park').map((w) => w.id)).toEqual([ws[1].id]);
  });

  it('the end of the plan is race day or the last planned day', () => {
    expect(planEnd({ race_date: '2027-03-14' }, [row('2027-03-10', 'easy')])).toBe('2027-03-14');
    expect(planEnd({ race_date: '2026-12-01' }, [row('2026-12-20', 'easy')])).toBe('2026-12-20');
  });
});

describe('moving a session', () => {
  const ws = [0, 7, 14, 21].map((d) => row(addDays(TODAY, d), 'strength_lower'));
  const end = addDays(TODAY, 41);

  it('only this one: its first date is kept (back on it, nothing is noted)', () => {
    expect(movePatches(ws, ws[1], addDays(TODAY, 8), 'one', end)).toEqual([{ id: ws[1].id, date: addDays(TODAY, 8), original_date: ws[1].date }]);
    const moved = { ...ws[1], date: addDays(TODAY, 8), original_date: ws[1].date };
    expect(movePatches(ws, moved, ws[1].date, 'one', end)).toEqual([{ id: ws[1].id, date: ws[1].date, original_date: null }]);
  });

  it('the series: this one and every later one on the same weekday, by the same number of days', () => {
    const patches = movePatches(ws, ws[1], addDays(TODAY, 8), 'series', end);
    expect(patches.map((p) => p.date)).toEqual([addDays(TODAY, 8), addDays(TODAY, 15), addDays(TODAY, 22)]);
    // earlier sessions, other workouts and done ones stay
    const mixed = [...ws, row(addDays(TODAY, 7), 'strength_upper'), { ...row(addDays(TODAY, 28), 'strength_lower'), status: 'completed' } as PlannedWorkout];
    expect(movePatches(mixed, ws[1], addDays(TODAY, 8), 'series', end).map((p) => p.id)).toEqual([ws[1].id, ws[2].id, ws[3].id]);
    // nothing past the end of the plan
    expect(movePatches(ws, ws[1], addDays(TODAY, 8), 'series', addDays(TODAY, 20)).length).toBe(2);
  });

  it('a session that belongs to no workout only moves by itself; the same date changes nothing', () => {
    const easy = row(TODAY, 'easy');
    expect(movePatches([easy], easy, addDays(TODAY, 1), 'series', end).length).toBe(1);
    expect(movePatches(ws, ws[0], ws[0].date, 'one', end)).toEqual([]);
  });

  it('the weekdays of a series follow the move', () => {
    expect(movedDays([0, 3], 0, 1)).toEqual([1, 3]);
    expect(movedDays([0, 3], 0, 3)).toEqual([3]);
    expect(weekdaysOf(ws, 'lower', TODAY)).toEqual([0]);
  });
});

describe('a planner kind moved to another weekday stays there when the plan is built again', () => {
  it('the lower-body sessions go on the weekday the person chose', () => {
    const profile = { id: 'u', onboarding: normalizeAnswers({ raceName: 'Vienna', raceDate: '2027-04-18', level: 'intermediate', runDaysPerWeek: 4, extras: [] }), onboarding_completed_at: NOW, strength: null } as unknown as Profile;
    const start = editStart(profile, null, TODAY);
    const m = setStrengthWanted(applyStrengthPlan(settle({ a: { ...start.answers, setup: { ...start.answers.setup!, runPct: 70 } }, strength: start.strength }, TODAY)), 2);
    const f = finalize(m.a, m.strength, TODAY, NOW);
    const build = (a: typeof f.answers) => buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, f.prefs?.routines);
    const before = build(f.answers).workouts.filter((w) => w.kind === 'strength_lower' && w.phase === 'build');
    const was = weekdayOf(before[0].date);
    const to = ((was + 1) % 7) as 0;
    const after = build({ ...f.answers, setup: { ...f.answers.setup!, strengthDays: { lower: [to] } } }).workouts.filter((w) => w.kind === 'strength_lower' && w.phase === 'build');
    expect(after.length).toBe(before.length);
    expect(after.every((w) => weekdayOf(w.date) === to)).toBe(true);
    expect(after.every((w) => mondayOf(w.date) <= w.date)).toBe(true);
  });
});

describe('what a workout trains', () => {
  it('a lower-body workout trains the legs, an upper-body one the arms and back', () => {
    const lower = workoutMuscles([{ key: 'back_squat', name: 'Back squat', sets: 4 }, { key: 'rdl_bb', name: 'Romanian deadlift', sets: 3 }, { key: 'calf_body', name: 'Single-leg calf raise', sets: 3 }]);
    expect(lower.quads).toBe('primary');
    expect(lower.chest).toBeUndefined();
    // one exercise: its main muscle is the main one, the muscles it also works are secondary
    const push = workoutMuscles([{ key: 'push_up', name: 'Push-up', sets: 3 }]);
    expect(push.chest).toBe('primary');
    expect(Object.values(push)).toContain('secondary');
    const upper = workoutMuscles([{ key: 'pull_up', name: 'Pull-up', sets: 4 }, { key: 'push_up', name: 'Push-up', sets: 4 }]);
    expect(upper.back).toBe('primary');
    expect(upper.chest).toBe('primary');
    expect(upper.quads).toBeUndefined();
  });

  it('exercises the catalogue does not know add nothing', () => {
    expect(workoutMuscles([{ name: 'My own thing' }])).toEqual({});
  });
});

describe('the weight of the last time', () => {
  it('per exercise from the watch (library id) or the website (name), the newest day wins', () => {
    const rows = [
      { session_key: 'a', idx: 0, local_date: '2026-11-01', exercise_id: 'squat', exercise_name: null, reps: 5, weight_kg: 80 },
      { session_key: 'b', idx: 0, local_date: '2026-11-05', exercise_id: 'squat', exercise_name: null, reps: 5, weight_kg: 82.5 },
      { session_key: 'c', idx: 0, local_date: '2026-11-06', exercise_id: null, exercise_name: 'Pull-up', reps: 6, weight_kg: 5 },
      { session_key: 'c', idx: 1, local_date: '2026-11-06', exercise_id: null, exercise_name: 'Plank', reps: 0, weight_kg: null },
    ];
    const last = lastWeights(rows);
    expect(lastWeightOf(last, { id: 'squat', name: 'Back squat' })).toEqual({ kg: 82.5, date: '2026-11-05' });
    expect(lastWeightOf(last, { name: 'Pull-up' })).toEqual({ kg: 5, date: '2026-11-06' });
    expect(lastWeightOf(last, { name: 'Plank' })).toBeUndefined();
  });
});

describe('the coach card for whole workouts, in German', () => {
  it('translates the lines of the delete and add proposals', () => {
    expect(coachLine('Delete workout "Park session" (24 planned sessions from today)', 'de')).toBe('Workout „Park session“ löschen (24 geplante Einheiten ab heute)');
    expect(coachLine('Add workout "Hotel gym": once on Wed 2026-11-04', 'de')).toBe('Workout „Hotel gym“ hinzufügen: einmal am Mi 2026-11-04');
    expect(coachLine('Add workout "Core": every Tue, Thu from 2026-10-30 until the end of the plan', 'de')).toBe('Workout „Core“ hinzufügen: jeden Di, Do ab 2026-10-30 bis Planende');
    expect(coachLine('Goblet squat 3 × 10 · 20 kg', 'de')).toMatch(/^Goblet-Kniebeuge 3 × 10 · 20 kg$/);
  });
});
