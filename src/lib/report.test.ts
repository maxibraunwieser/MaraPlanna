import { describe, expect, it } from 'vitest';
import type { Activity, DailyMetric, OnboardingAnswers, PlannedWorkout, TrainingPlan } from './types';
import { addDays } from './planner/dates';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { zonePace } from './planner/workouts';
import { normalizeAnswers } from './answers';
import { weekReport } from './report';
import { planProjectionAt, projectionHistory } from './projection';

const PLAN_START = '2026-09-28'; // Monday
const TODAY = '2026-10-28'; // Wednesday of week 5

const answers: OnboardingAnswers = normalizeAnswers({
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 3 * 3600 + 45 * 60, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
  extras: [{ id: 'core', type: 'core', perWeek: 1 }],
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: PLAN_START }), PLAN_START);
const plan: TrainingPlan = {
  id: 'p', user_id: 'u', status: 'active', race_name: 'Vienna', race_date: answers.raceDate, start_date: PLAN_START,
  inputs: answers, fitness: gen.fitness, weeks: gen.weeks, created_at: PLAN_START, updated_at: PLAN_START,
};
const P = plan.fitness.paces;
/** A normal build week (not a recovery week) before the current one. */
const WEEK = gen.weeks.find((w) => !w.recovery && w.longKm >= 17 && w.startDate < '2026-10-26')!.startDate;

const activity = (id: string, date: string, distKm: number, paceS: number, over: Partial<Activity> = {}): Activity => ({
  id, user_id: 'u', source: 'garmin', external_id: id, name: 'Run', sport: 'run', sub_type: 'running', start_time: `${date}T07:00:00Z`,
  local_date: date, duration_s: Math.round(distKm * paceS), moving_s: Math.round(distKm * paceS), distance_m: distKm * 1000,
  avg_hr: 140, max_hr: 160, elevation_gain_m: 0, calories: 0, training_load: 0, aerobic_te: 0, vo2max: null, ...over,
});

/** Week 4 done as planned, except: one easy run skipped, the other easy runs 12 % too fast. */
function scenario() {
  let n = 0;
  const activities: Activity[] = [];
  const workouts: PlannedWorkout[] = gen.workouts.map((d) => ({
    ...d, id: `w${n++}`, plan_id: 'p', user_id: 'u', status: 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, original_date: null, note: null,
  }));
  const week = workouts.filter((w) => w.date >= WEEK && w.date <= addDays(WEEK, 6));
  const easy = week.filter((w) => w.kind === 'easy');
  const skipped = easy[0];
  for (const w of week) {
    if (w === skipped) {
      w.status = 'missed';
      continue;
    }
    const isRun = !!w.distance_km;
    const pace = w.kind === 'easy' ? P.easy[0] * 0.88 : zonePace(P, w.kind === 'long' ? 'long' : 'easy');
    const a = isRun ? activity(`a-${w.id}`, w.date, w.distance_km!, pace) : { ...activity(`a-${w.id}`, w.date, 0, 0), sport: 'strength' as const, distance_m: null, duration_s: 1800, moving_s: 1800 };
    activities.push(a);
    Object.assign(w, { status: 'completed', activity_id: a.id, actual_distance_km: isRun ? w.distance_km : null });
  }
  return { workouts, activities, week, skipped, easy };
}

const metrics = (from: string, days: number, rhr: number, sleepH: number): DailyMetric[] =>
  Array.from({ length: days }, (_, i) => ({
    date: addDays(from, i), resting_hr: rhr, hrv_last_night: 60, hrv_weekly_avg: 60, hrv_status: 'BALANCED', sleep_s: sleepH * 3600,
    sleep_score: 80, stress_avg: 25, body_battery_high: 80, body_battery_low: 20, steps: 8000,
  }));

describe('weekly report', () => {
  const { workouts, activities, week, skipped, easy } = scenario();
  const m = [...metrics(addDays(WEEK, -7), 7, 48, 7.8), ...metrics(WEEK, 7, 52, 6.4)];
  const r = weekReport({ plan, workouts, activities, metrics: m, weekStart: WEEK, today: TODAY, maxHr: 190, units: 'km' });

  it('adds up planned and done distance, sessions and key sessions', () => {
    const planned = week.filter((w) => w.distance_km).reduce((s, w) => s + w.distance_km!, 0);
    expect(r.state).toBe('past');
    expect(r.plannedKm).toBeCloseTo(planned, 5);
    expect(r.doneKm).toBeCloseTo(planned - skipped.distance_km!, 5);
    expect(r.pct).toBe(Math.round(((planned - skipped.distance_km!) / planned) * 100));
    expect(r.sessions).toEqual({ planned: week.length, done: week.length - 1 });
    expect(r.key.planned).toBe(week.filter((w) => w.key_session).length);
    expect(r.key.done).toBe(r.key.planned);
    expect(r.long.doneKm).toBe(week.find((w) => w.kind === 'long')!.distance_km);
  });

  it('spots easy runs that were too fast and scores every run', () => {
    expect(r.easy.tooFast).toBe(easy.length - 1);
    expect(r.items.filter((i) => i.activity?.sport === 'run').every((i) => i.score !== null)).toBe(true);
    expect(r.notes.some((n) => n.tone === 'warn' && n.text.includes('faster than your easy pace'))).toBe(true);
  });

  it('flags recovery markers and celebrates the new longest run', () => {
    expect(r.wellness.restingHr).toEqual({ now: 52, prev: 48 });
    expect(r.notes.some((n) => n.text.includes('Resting heart rate is 4 bpm above'))).toBe(true);
    expect(r.notes.some((n) => n.text.includes('6.4 h'))).toBe(true);
    expect(r.long.longest).toBe(true);
    expect(r.notes.some((n) => n.tone === 'good' && n.text.includes('longest run'))).toBe(true);
    expect(r.notes.some((n) => n.text.includes('key session'))).toBe(true);
  });

  it('previews next week', () => {
    expect(r.next?.week?.startDate).toBe(addDays(WEEK, 7));
    expect(r.next?.long).not.toBeNull();
    expect(r.next?.plannedKm).toBeGreaterThan(0);
    expect(r.next?.key.every((w) => w.key_session && w.kind !== 'long')).toBe(true);
  });

  it('the current week compares with what was due up to today', () => {
    const cur = weekReport({ plan, workouts, activities, metrics: [], weekStart: '2026-10-26', today: TODAY, maxHr: 190, units: 'km' });
    expect(cur.state).toBe('current');
    expect(cur.plannedToDateKm).toBeLessThan(cur.plannedKm);
    expect(cur.notes[0]?.text ?? '').toMatch(/So far|key session/);
  });

  it('a week with a break does not count paused sessions as missed', () => {
    const ws = workouts.map((w) =>
      w.date >= '2026-10-26' && w.date <= '2026-10-28' ? { ...w, status: 'skipped' as const, status_source: 'user' as const, note: 'Break: sick – rest.' } : w,
    );
    const p = { ...plan, fitness: { ...plan.fitness, breaks: [{ id: 'b', kind: 'sick' as const, mode: 'rest' as const, from: '2026-10-26', to: '2026-10-28', baseKm: 40, baseLongKm: 18, baseVdot: 45, comebackUntil: null, replanned: false, createdAt: '2026-10-26' }] } };
    const cur = weekReport({ plan: p, workouts: ws, activities, metrics: [], weekStart: '2026-10-26', today: TODAY, maxHr: 190, units: 'km' });
    expect(cur.breakDays).toBe(3);
    expect(cur.key.missed).toHaveLength(0);
    expect(cur.sessions.planned).toBe(0);
    expect(cur.notes[0].text).toMatch(/^Sick for 3 days/);
  });

  it('uses the chosen units', () => {
    const mi = weekReport({ plan, workouts, activities, metrics: m, weekStart: WEEK, today: TODAY, maxHr: 190, units: 'mi' });
    expect(mi.notes.find((n) => n.text.startsWith('You ran'))?.text).toMatch(/ mi /);
  });
});

describe('projection history', () => {
  // 20 weeks of running, volume rising from ~25 to ~60 km/week at the same pace.
  const runs: Activity[] = [];
  for (let wk = 0; wk < 20; wk++) {
    const weekly = 25 + wk * 1.8;
    for (let d = 0; d < 4; d++) runs.push(activity(`r${wk}-${d}`, addDays('2026-06-15', wk * 7 + d * 2), weekly / 4, 330));
  }
  const today = '2026-11-01';

  it('shows the training-based estimate getting faster with more volume', () => {
    const h = projectionHistory(plan, runs, today);
    expect(h.points[h.points.length - 1].date).toBe(today);
    const tanda = h.points.filter((p) => p.tandaS !== null).map((p) => p.tandaS!);
    expect(tanda.length).toBeGreaterThan(5);
    expect(tanda[tanda.length - 1]).toBeLessThan(tanda[0]);
    expect(h.tandaChangeS!).toBeLessThan(0);
    expect(h.goalS).toBe(answers.goalTimeS);
  });

  it('the plan line follows VDOT updates and ends at the dashboard number', () => {
    const updated = { ...plan, fitness: { ...plan.fitness, vdot: plan.fitness.vdot + 1.5, predictedMarathonS: plan.fitness.predictedMarathonS - 300, history: [...plan.fitness.history, { date: '2026-10-20', vdot: plan.fitness.vdot + 1.5, reason: 'faster' }] } };
    expect(planProjectionAt(updated, '2026-09-01')).toBeNull();
    const before = planProjectionAt(updated, '2026-10-10')!;
    expect(Math.abs(before - plan.fitness.predictedMarathonS)).toBeLessThan(5);
    expect(planProjectionAt(updated, '2026-10-25')).toBe(updated.fitness.predictedMarathonS);
    const h = projectionHistory(updated, runs, today);
    expect(h.current.planS).toBe(updated.fitness.predictedMarathonS);
    expect(h.planChangeS).toBeLessThan(-200);
  });

  it('works without enough running history', () => {
    const h = projectionHistory(plan, [], today);
    expect(h.points.every((p) => p.tandaS === null)).toBe(true);
    expect(h.points.some((p) => p.planS !== null)).toBe(true);
    expect(h.tandaChangeS).toBeNull();
  });
});
