import { describe, expect, it } from 'vitest';
import { answersFromChanges, previewAction, replanStart, staleReason, type ActionContext, type CoachAction } from './coachActions';
import { scaleWorkout } from './planner/scale';
import { assessFitness } from './planner/fitness';
import { buildPlan, generateWeeks } from './planner/generate';
import { workoutKm } from './planner/workouts';
import { normalizeAnswers } from './answers';
import type { Activity, PlannedWorkout, TrainingPlan } from './types';

const TODAY = '2026-10-30'; // a Friday
const answers = normalizeAnswers({
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 4, availableDays: [0, 2, 4, 6], longRunDay: 6,
  extras: [{ id: 'core', type: 'core', perWeek: 1 }],
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' }), '2026-10-26');
const paces = gen.fitness.paces;

const workouts: PlannedWorkout[] = gen.workouts.map((d, i) => ({
  ...d, id: `w${String(i).padStart(7, '0')}-0000`, plan_id: 'p', user_id: 'u', status: 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, original_date: null, note: null,
}));
const plan = { id: 'p', user_id: 'u', status: 'active', race_name: 'Vienna', race_date: '2027-04-18', start_date: '2026-10-26', inputs: answers, fitness: gen.fitness, weeks: gen.weeks, created_at: '', updated_at: '' } as TrainingPlan;

const run = (date: string, km: number): Activity => ({ id: `a${date}`, user_id: 'u', source: 'garmin', external_id: null, name: null, sport: 'run', sub_type: null, start_time: `${date}T07:00:00Z`, local_date: date, duration_s: km * 340, moving_s: null, distance_m: km * 1000, avg_hr: 150, max_hr: 170, elevation_gain_m: null, calories: null, training_load: null, aerobic_te: null, vo2max: null });
const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({ plan, workouts, activities: [], profile: null, today: TODAY, ...over });

const upcoming = (kind: string) => workouts.find((w) => w.kind === kind && w.date >= TODAY && w.date < '2027-03-01')!;
const action = (a: Partial<CoachAction> & { tool: CoachAction['tool'] }): CoachAction => ({ id: 'x', status: 'pending', summary: 'S', reason: 'R', ...a }) as CoachAction;

describe('shortening and lengthening sessions', () => {
  it('scales the distance of an easy run and keeps the strides', () => {
    const w = workouts.find((x) => x.kind === 'easy' && x.steps.some((s) => s.type === 'run' && /stride/i.test(s.label)))!;
    const s = scaleWorkout(w, 0.7, paces)!;
    expect(s).not.toBeNull();
    expect(s.distance_km).toBeLessThan(w.distance_km!);
    expect(s.steps.some((st) => st.type === 'run' && /stride/i.test(st.label))).toBe(true);
    expect(Math.abs(s.distance_km - workoutKm(s.steps, paces))).toBeLessThan(0.3);
    expect(s.title).toBe(w.title);
  });

  it('takes reps off interval and threshold sessions and renames them', () => {
    for (const kind of ['intervals', 'threshold']) {
      const w = workouts.find((x) => x.kind === kind && x.steps.some((s) => s.type === 'run' && (s.repeat ?? 1) >= 4))!;
      if (!w) continue;
      const before = (w.steps.find((s) => s.type === 'run' && (s.repeat ?? 1) > 1) as { repeat: number }).repeat;
      const s = scaleWorkout(w, 0.75, paces)!;
      const after = (s.steps.find((st) => st.type === 'run' && (st.repeat ?? 1) > 1) as { repeat: number }).repeat;
      expect(after).toBeLessThan(before);
      expect(s.title).toContain(`${after} ×`);
      expect(s.distance_km).toBeLessThan(w.distance_km!);
    }
  });

  it('can lengthen a long run, within limits', () => {
    const w = upcoming('long');
    const s = scaleWorkout(w, 1.2, paces)!;
    expect(s.distance_km).toBeGreaterThan(w.distance_km!);
    expect(scaleWorkout(w, 99, paces)!.distance_km).toBeLessThanOrEqual(Math.round(w.distance_km! * 1.5 * 2) / 2 + 0.5);
  });

  it('returns null when nothing would change', () => {
    expect(scaleWorkout(upcoming('long'), 1.0, paces)).toBeNull();
  });
});

describe('plan changes from the coach', () => {
  it('maps the changes onto the answers and keeps them consistent', () => {
    const a = answersFromChanges(answers, { runsPerWeek: 5, availableDays: [0, 2, 6], longRunDay: 6, weekdayMaxMinutes: 45, approach: 'conservative', injuryProne: true, injuries: 'calf' });
    expect(a.availableDays).toEqual([0, 2, 6]);
    expect(a.runDaysPerWeek).toBe(3); // cannot run more days than are available
    expect(a.weekdayMaxMinutes).toBe(45);
    expect(a.approach).toBe('conservative');
    expect(a.injuryProne).toBe(true);
    expect(a.injuries).toBe('calf');
    expect(answersFromChanges(a, { weekdayMaxMinutes: null }).weekdayMaxMinutes).toBeNull();
    expect(answers.runDaysPerWeek).toBe(4); // the original is untouched
  });

  it('a rebuilt plan really has the new rhythm', () => {
    const next = answersFromChanges(answers, { runsPerWeek: 3, availableDays: [0, 2, 6], longRunDay: 6 });
    const start = replanStart(plan, [run('2026-10-27', 8), run('2026-10-25', 21)], TODAY);
    const rebuilt = generateWeeks({ answers: next, fitness: plan.fitness, planStart: plan.weeks[0].startDate, firstDate: start.fromDate, startKm: start.startKm, startLongKm: start.startLongKm });
    const days = new Set(rebuilt.workouts.filter((w) => ['easy', 'long', 'intervals', 'threshold', 'recovery'].includes(w.kind)).map((w) => new Date(`${w.date}T00:00:00Z`).getUTCDay()));
    // only Monday (1), Wednesday (3) and Sunday (0)
    expect([...days].every((d) => [0, 1, 3].includes(d))).toBe(true);
    expect(rebuilt.workouts.every((w) => w.date >= start.fromDate)).toBe(true);
  });

  it('rebuilds from the next Monday (or today on Monday/Tuesday) at the volume the athlete really runs', () => {
    const s = replanStart(plan, [run('2026-10-27', 10), run('2026-10-25', 20), run('2026-10-20', 10), run('2026-10-13', 20), run('2026-09-01', 30)], TODAY);
    expect(s.fromDate).toBe('2026-11-02');
    expect(s.startKm).toBe(15); // 60 km in the last 28 days / 4
    expect(s.startLongKm).toBe(20);
    expect(s.tooLate).toBe(false);
    expect(replanStart(plan, [], '2026-11-03').fromDate).toBe('2026-11-03'); // Tuesday: rebuilt from today
    expect(replanStart(plan, [], '2026-11-04').fromDate).toBe('2026-11-09'); // Wednesday: from next Monday
  });

  it('never starts below 10 km a week and is too late in race week', () => {
    expect(replanStart(plan, [], TODAY).startKm).toBe(10);
    expect(replanStart(plan, [], '2027-04-14').tooLate).toBe(true);
  });
});

describe('proposals that no longer fit', () => {
  it('a moved-away or finished session makes a move proposal stale', () => {
    const w = upcoming('easy');
    const move = action({ tool: 'move_workout', workoutId: w.id, date: '2026-12-01' });
    expect(staleReason(move, ctx())).toBeNull();
    expect(staleReason(move, ctx({ workouts: workouts.filter((x) => x.id !== w.id) }))).toMatch(/no longer in your plan/);
    expect(staleReason(move, ctx({ workouts: workouts.map((x) => (x.id === w.id ? { ...x, status: 'completed' as const } : x)) }))).toMatch(/already completed/);
    expect(staleReason(action({ tool: 'move_workout', workoutId: w.id, date: '2027-04-18' }), ctx())).toMatch(/no longer possible/);
  });

  it('skips only apply to sessions that are still open', () => {
    const w = upcoming('easy');
    const skip = action({ tool: 'skip_workouts', workoutIds: [w.id] });
    expect(staleReason(skip, ctx())).toBeNull();
    expect(staleReason(skip, ctx({ workouts: workouts.map((x) => (x.id === w.id ? { ...x, status: 'skipped' as const } : x)) }))).toMatch(/no longer open/);
  });

  it('shows what a scale proposal will really do', () => {
    const w = upcoming('long');
    const lines = previewAction(action({ tool: 'scale_workouts', items: [{ workoutId: w.id, factor: 0.8 }], summary: 'estimate' }), ctx());
    expect(lines[0]).toContain(`${w.distance_km} km →`);
    expect(lines[0]).not.toContain('estimate');
    expect(previewAction(action({ tool: 'skip_workouts', workoutIds: [w.id], summary: 'Skip A\nSkip B' }), ctx())).toEqual(['Skip A', 'Skip B']);
  });
});
