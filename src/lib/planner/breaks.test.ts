import { describe, expect, it } from 'vitest';
import type { Activity, OnboardingAnswers, PlannedWorkout, TrainingPlan, WorkoutDraft } from '../types';
import { adaptPlan, type AdaptResult } from './adapt';
import { breakPhase, comeback, endBreakEarly, isBreakNote, keepDuring, openBreak, planBreak, visibleBreak } from './breaks';
import { addDays, daysBetween } from './dates';
import { assessFitness } from './fitness';
import { buildPlan, generateWeeks } from './generate';
import { normalizeAnswers } from '../answers';

const PLAN_START = '2026-09-28'; // Monday
const TODAY = '2026-11-04'; // Wednesday, week 6

const answers: OnboardingAnswers = normalizeAnswers({
  raceName: 'Vienna',
  raceDate: '2027-04-18',
  goalType: 'time',
  goalTimeS: 3 * 3600 + 45 * 60,
  level: 'intermediate',
  marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' },
  currentWeeklyKm: 35,
  longestRecentRunKm: 16,
  runDaysPerWeek: 5,
  longRunDay: 6,
  extras: [
    { id: 'lower', type: 'lower', perWeek: 1 },
    { id: 'core', type: 'core', perWeek: 1 },
  ],
});

let seq = 0;
const toPlanned = (d: WorkoutDraft, today = TODAY): PlannedWorkout => ({
  ...d,
  id: `w${seq++}`,
  plan_id: 'p',
  user_id: 'u',
  status: d.date < today ? 'completed' : 'planned',
  status_source: 'auto',
  activity_id: null,
  actual_distance_km: null,
  original_date: null,
  note: null,
});

function setup() {
  const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: PLAN_START }), PLAN_START);
  const plan: TrainingPlan = {
    id: 'p', user_id: 'u', status: 'active', race_name: 'Vienna', race_date: answers.raceDate, start_date: PLAN_START,
    inputs: answers, fitness: gen.fitness, weeks: gen.weeks, created_at: PLAN_START, updated_at: PLAN_START,
  };
  return { plan, workouts: gen.workouts.map((d) => toPlanned(d)) };
}

/** What persistAdaptation() does, in memory. */
function persist(plan: TrainingPlan, workouts: PlannedWorkout[], r: AdaptResult, today = TODAY) {
  let ws = workouts.map((w) => ({ ...w, ...(r.patches.find((p) => p.id === w.id)?.patch ?? {}) }));
  let weeks = plan.weeks;
  const fitness = r.fitness ?? plan.fitness;
  if (r.replan && r.fitness) {
    const g = generateWeeks({
      answers: plan.inputs, fitness, planStart: plan.weeks[0].startDate, firstDate: r.replan.fromDate,
      startKm: r.replan.startKm, startLongKm: r.replan.startLongKm, easyUntil: r.replan.easyUntil, breaks: r.fitness.breaks,
    });
    ws = ws.filter((w) => !((w.status === 'planned' || w.status === 'skipped') && w.date >= r.replan!.fromDate));
    ws.push(...g.workouts.map((d) => toPlanned(d, today)));
    const first = g.weeks[0]?.week ?? Infinity;
    weeks = [...plan.weeks.filter((w) => w.week < first), ...g.weeks];
  }
  ws.sort((a, b) => a.date.localeCompare(b.date));
  return { plan: { ...plan, fitness, weeks }, workouts: ws };
}

const between = (ws: PlannedWorkout[], from: string, to: string) => ws.filter((w) => w.date >= from && w.date <= to);

describe('comeback rules', () => {
  const b = (days: number, over: Partial<{ kind: 'sick' | 'injury' | 'other'; mode: 'rest' | 'easy' }> = {}) =>
    comeback({ kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, days - 1), ...over });

  it('longer breaks cost more – volume, long run and paces', () => {
    const lengths = [1, 3, 5, 10, 21, 40].map((d) => b(d));
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i].volume).toBeLessThanOrEqual(lengths[i - 1].volume);
      expect(lengths[i].long).toBeLessThanOrEqual(lengths[i - 1].long);
      expect(lengths[i].easyDays).toBeGreaterThanOrEqual(lengths[i - 1].easyDays);
      expect(lengths[i].vdotDrop).toBeGreaterThanOrEqual(lengths[i - 1].vdotDrop);
    }
    expect(b(2).replan).toBe(false);
    expect(b(5).vdotDrop).toBe(0); // < 1 week: no measurable fitness loss
    expect(b(14).vdotDrop).toBeGreaterThan(0);
  });

  it('easy running during a mild illness costs much less than full rest', () => {
    expect(b(7, { mode: 'easy' }).volume).toBeGreaterThan(b(7).volume);
    expect(b(4, { mode: 'easy' }).replan).toBe(false);
  });

  it('injuries come back more carefully than illness', () => {
    expect(b(10, { kind: 'injury' }).volume).toBeLessThan(b(10, { kind: 'other' }).volume);
    expect(b(10, { kind: 'injury' }).easyDays).toBeGreaterThan(b(10, { kind: 'other' }).easyDays);
  });

  it('keeps only light sessions', () => {
    const run = (kind: PlannedWorkout['kind'], key = false) => ({ kind, key_session: key });
    expect(keepDuring(run('easy'), { kind: 'sick', mode: 'easy' })).toBe(true);
    expect(keepDuring(run('threshold', true), { kind: 'sick', mode: 'easy' })).toBe(false);
    expect(keepDuring(run('long', true), { kind: 'sick', mode: 'easy' })).toBe(false);
    expect(keepDuring(run('easy'), { kind: 'sick', mode: 'rest' })).toBe(false);
    expect(keepDuring(run('core'), { kind: 'sick', mode: 'rest' })).toBe(false);
    expect(keepDuring(run('core'), { kind: 'injury', mode: 'rest' })).toBe(true);
    expect(keepDuring(run('strength_lower'), { kind: 'injury', mode: 'rest' })).toBe(false);
  });
});

describe('sick for 5 days (fever)', () => {
  const { plan, workouts } = setup();
  const to = addDays(TODAY, 4);
  const r = planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from: TODAY, to } });
  const after = persist(plan, workouts, r);
  const back = addDays(to, 1);

  it('pauses every session in the break', () => {
    const inside = between(after.workouts, TODAY, to);
    expect(inside.length).toBeGreaterThan(0);
    for (const w of inside) {
      expect(w.status).toBe('skipped');
      expect(w.status_source).toBe('user');
      expect(isBreakNote(w.note)).toBe(true);
    }
    expect(r.summary.paused).toBe(inside.length);
  });

  it('rebuilds from the return day at a lower volume, easy days first', () => {
    expect(r.replan?.fromDate).toBe(back);
    expect(r.replan?.startKm).toBe(Math.round(r.summary.baseKm * 0.75));
    expect(r.replan?.easyUntil).toBe(addDays(back, 4)); // 3 easy days + 1 extra after illness
    for (const w of between(after.workouts, back, addDays(r.replan!.easyUntil!, -1))) {
      if (w.kind === 'long') continue;
      expect(w.key_session).toBe(false);
      expect(w.steps.some((s) => s.type === 'run' && s.label.startsWith('Strides'))).toBe(false);
    }
    const longBack = after.workouts.find((w) => w.date >= back && (w.kind === 'long' || w.kind === 'long_mp'))!;
    expect(longBack.kind).toBe('long');
    expect(longBack.distance_km!).toBeLessThanOrEqual(r.summary.baseKm * 0.5);
  });

  it('builds back up afterwards and keeps race day', () => {
    const week = (n: number) => after.plan.weeks.find((w) => w.startDate === addDays('2026-11-09', 7 * n))!;
    expect(week(0).targetKm).toBeLessThan(r.summary.baseKm);
    expect(week(3).targetKm).toBeGreaterThan(week(0).targetKm);
    expect(after.workouts.filter((w) => w.kind === 'race')).toHaveLength(1);
    expect(Math.max(...after.plan.weeks.map((w) => w.longKm))).toBeGreaterThanOrEqual(30);
  });

  it('stores the break and keeps paces (under a week costs no fitness)', () => {
    const b = after.plan.fitness.breaks![0];
    expect(b).toMatchObject({ kind: 'sick', mode: 'rest', from: TODAY, to, replanned: true, comebackUntil: addDays(back, 4) });
    expect(after.plan.fitness.vdot).toBe(plan.fitness.vdot);
    expect(openBreak(after.plan, TODAY)?.id).toBe(b.id);
    expect(breakPhase(b, TODAY)).toBe('active');
    expect(breakPhase(b, addDays(back, 1))).toBe('comeback');
    expect(breakPhase(b, addDays(back, 10))).toBe('over');
    expect(r.messages[0].message).toContain('paused');
  });

  it('the normal adaptation leaves the break alone', () => {
    const later = addDays(TODAY, 3);
    const res = adaptPlan({ plan: after.plan, workouts: after.workouts, activities: [], metrics: [], today: later });
    expect(res.replan).toBeNull();
    expect(res.fitness).toBeNull();
    expect(res.patches.filter((p) => p.patch.date)).toHaveLength(0);
  });

  it('extending reuses the pre-break level (no compounding) and eases paces after 1+ week', () => {
    const b = after.plan.fitness.breaks![0];
    const r2 = planBreak({ plan: after.plan, workouts: after.workouts, activities: [], today: addDays(TODAY, 2), draft: { id: b.id, kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, 9) } });
    expect(r2.summary.baseKm).toBe(r.summary.baseKm);
    expect(r2.replan?.startKm).toBe(Math.round(r.summary.baseKm * 0.6));
    expect(r2.fitness!.vdot).toBeCloseTo(plan.fitness.vdot * 0.98, 1);
    expect(r2.fitness!.breaks).toHaveLength(1);
    const after2 = persist(after.plan, after.workouts, r2, addDays(TODAY, 2));
    for (const w of between(after2.workouts, addDays(TODAY, 2), addDays(TODAY, 9))) expect(w.status).toBe('skipped');
  });

  it('"I\'m feeling better" ends it yesterday and rebuilds from today', () => {
    const b = after.plan.fitness.breaks![0];
    const today = addDays(TODAY, 3);
    const r3 = endBreakEarly({ plan: after.plan, workouts: after.workouts, activities: [], today, id: b.id });
    expect(r3.break?.to).toBe(addDays(today, -1));
    expect(r3.replan?.fromDate).toBe(today);
    expect(r3.replan?.startKm).toBe(Math.round(r.summary.baseKm * 0.85)); // 3 days
    const after3 = persist(after.plan, after.workouts, r3, today);
    expect(between(after3.workouts, today, addDays(today, 30)).every((w) => w.status !== 'skipped')).toBe(true);
  });

  it('cancelling restores the plan at its previous level', () => {
    const b = after.plan.fitness.breaks![0];
    const r4 = planBreak({ plan: after.plan, workouts: after.workouts, activities: [], today: TODAY, draft: null, cancelId: b.id });
    expect(r4.fitness!.breaks).toHaveLength(0);
    expect(r4.replan).toMatchObject({ fromDate: TODAY, startKm: r.summary.baseKm, easyUntil: null });
    const after4 = persist(after.plan, after.workouts, r4);
    expect(between(after4.workouts, TODAY, to).some((w) => w.key_session)).toBe(true);
    expect(after4.workouts.some((w) => isBreakNote(w.note))).toBe(false);
  });
});

describe('a cold above the neck (easy runs only)', () => {
  const { plan, workouts } = setup();
  const to = addDays(TODAY, 3);
  const r = planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'easy', from: TODAY, to } });
  const after = persist(plan, workouts, r);

  it('keeps easy runs, pauses hard sessions and leg work, no rebuild', () => {
    const inside = between(after.workouts, TODAY, to);
    for (const w of inside) {
      if (w.kind === 'easy' || w.kind === 'recovery' || w.kind === 'core') expect(w.status).toBe('planned');
      if (w.key_session || w.kind === 'strength_lower') expect(w.status).toBe('skipped');
      expect(isBreakNote(w.note)).toBe(true);
    }
    expect(r.replan).toBeNull();
    expect(r.summary.kept).toBeGreaterThan(0);
    expect(after.plan.fitness.breaks![0].replanned).toBe(false);
  });
});

describe('short and late breaks', () => {
  it('2 sick days: sessions paused, nothing rebuilt', () => {
    const { plan, workouts } = setup();
    const r = planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, 1) } });
    expect(r.replan).toBeNull();
    expect(r.patches.every((p) => p.patch.status === 'skipped' || p.patch.note)).toBe(true);
    expect(r.summary.paused).toBeGreaterThan(0);
  });

  it('a break entered afterwards rebuilds from today with the remaining easy days', () => {
    const { plan, workouts } = setup();
    const from = addDays(TODAY, -9);
    const to = addDays(TODAY, -3);
    const ws = workouts.map((w) => (w.date >= from && w.date < TODAY ? { ...w, status: 'missed' as const } : w));
    const r = planBreak({ plan, workouts: ws, activities: [], today: TODAY, draft: { kind: 'injury', mode: 'rest', from, to } });
    expect(r.replan?.fromDate).toBe(TODAY);
    // 7 days injured: 3 + 2 easy days from the return day (2 days ago) → still easy until 3 days from now.
    expect(r.replan?.easyUntil).toBe(addDays(to, 1 + 5));
    const after = persist(plan, ws, r);
    expect(between(after.workouts, from, to).filter((w) => w.status === 'missed')).toHaveLength(0);
  });

  it('upcoming time off (holiday) is shown before it starts', () => {
    const { plan, workouts } = setup();
    const from = addDays(TODAY, 10);
    const r = planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'other', mode: 'rest', from, to: addDays(from, 6) } });
    const after = persist(plan, workouts, r);
    const b = visibleBreak(after.plan, TODAY)!;
    expect(breakPhase(b, TODAY)).toBe('upcoming');
    // Until the holiday the plan is unchanged.
    expect(between(after.workouts, TODAY, addDays(from, -1)).map((w) => w.id)).toEqual(between(workouts, TODAY, addDays(from, -1)).map((w) => w.id));
  });

  it('getting sick again while easing back in: the new break wins on the dashboard', () => {
    const { plan, workouts } = setup();
    const first = persist(plan, workouts, planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from: addDays(TODAY, -8), to: addDays(TODAY, -3) } }));
    expect(breakPhase(visibleBreak(first.plan, TODAY)!, TODAY)).toBe('comeback');
    const second = persist(first.plan, first.workouts, planBreak({ plan: first.plan, workouts: first.workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, 2) } }));
    expect(second.plan.fitness.breaks).toHaveLength(2);
    expect(visibleBreak(second.plan, TODAY)?.from).toBe(TODAY);
  });

  it('a holiday later on survives when getting sick now rebuilds the plan', () => {
    const { plan, workouts } = setup();
    const hFrom = addDays(TODAY, 21);
    const hTo = addDays(hFrom, 6);
    const holiday = persist(plan, workouts, planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'other', mode: 'rest', from: hFrom, to: hTo } }));
    const sick = persist(holiday.plan, holiday.workouts, planBreak({ plan: holiday.plan, workouts: holiday.workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, 4) } }));
    expect(sick.plan.fitness.breaks).toHaveLength(2);
    const inHoliday = between(sick.workouts, hFrom, hTo).filter((w) => w.status !== 'skipped');
    expect(inHoliday.every((w) => w.kind === 'core' || w.kind === 'strength_upper' || w.kind === 'mobility')).toBe(true);
    expect(inHoliday.some((w) => w.distance_km)).toBe(false);
  });

  it('rejects impossible dates and overlapping breaks', () => {
    const { plan, workouts } = setup();
    const run = (from: string, to: string, p = plan) => () => planBreak({ plan: p, workouts, activities: [], today: TODAY, draft: { kind: 'sick', mode: 'rest', from, to } });
    expect(run(TODAY, addDays(TODAY, -1))).toThrow(/after the first day/);
    expect(run(addDays(TODAY, -30), TODAY)).toThrow(/3 weeks/);
    expect(run(TODAY, plan.race_date)).toThrow(/before race day/);
    const first = persist(plan, workouts, run(TODAY, addDays(TODAY, 4))());
    expect(run(addDays(TODAY, 2), addDays(TODAY, 8), first.plan)).toThrow(/overlaps/);
  });
});

describe('fitness and the base level', () => {
  it('base level follows what was really run when it is below the plan', () => {
    const { plan, workouts } = setup();
    const runs: Activity[] = Array.from({ length: 9 }, (_, i) => ({
      id: `a${i}`, user_id: 'u', source: 'garmin', external_id: String(i), name: 'Run', sport: 'run', sub_type: 'running',
      start_time: '', local_date: addDays('2026-10-12', i * 2), duration_s: 2400, moving_s: 2400, distance_m: 6000,
      avg_hr: 140, max_hr: 160, elevation_gain_m: 0, calories: 0, training_load: 0, aerobic_te: 0, vo2max: null,
    }));
    const r = planBreak({ plan, workouts, activities: runs, today: TODAY, draft: { kind: 'sick', mode: 'rest', from: TODAY, to: addDays(TODAY, 5) } });
    const planned = Math.max(...plan.weeks.filter((w) => daysBetween(w.startDate, TODAY) >= 0 && daysBetween(w.startDate, TODAY) < 14).map((w) => w.targetKm));
    expect(r.summary.baseKm).toBeLessThan(planned);
    expect(r.summary.baseKm).toBeGreaterThanOrEqual(Math.round(planned * 0.7));
  });

  it('a long injury eases paces and restores them when cancelled', () => {
    const { plan, workouts } = setup();
    const r = planBreak({ plan, workouts, activities: [], today: TODAY, draft: { kind: 'injury', mode: 'rest', from: TODAY, to: addDays(TODAY, 20) } });
    expect(r.fitness!.vdot).toBeCloseTo(plan.fitness.vdot * 0.955, 1);
    expect(r.fitness!.paces.easy[0]).toBeGreaterThan(plan.fitness.paces.easy[0]);
    const after = persist(plan, workouts, r);
    const cancel = planBreak({ plan: after.plan, workouts: after.workouts, activities: [], today: TODAY, draft: null, cancelId: after.plan.fitness.breaks![0].id });
    expect(cancel.fitness!.vdot).toBe(plan.fitness.vdot);
  });
});
