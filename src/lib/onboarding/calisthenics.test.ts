import { describe, expect, it } from 'vitest';
import { normalizeAnswers } from '../answers';
import { addDays, weekdayOf } from '../planner/dates';
import { assessFitness } from '../planner/fitness';
import { EXTRA_INFO, extraSession } from '../planner/extras';
import { buildPlan } from '../planner/generate';
import { autoWeek, statesOf, weekInputOf } from '../planner/week';
import { daySuitability, type DayKind } from '../planner/weekModel';
import { catalogEntry, routineKind, routineMinutes, suggestRoutine, type Setup } from '../strengthPlan';
import { applyStrengthPlan, setCaliWanted, setStrengthWanted, settle } from './apply';
import { finalize } from './finalize';
import { editStart } from './seed';
import { caliOf, distinctWorkouts, isLegKind, strengthPerWeek, weekKinds, withStrengthSessions } from './strengthMap';
import { applyManualWeek } from '../planner/week';
import type { Profile } from '../types';

const TODAY = '2026-11-06';
const NOW = '2026-11-06T10:00:00Z';
const profile = (onboarding: unknown): Profile => ({ id: 'u', display_name: 'Ana', units: 'km', onboarding, onboarding_completed_at: NOW, strength: null }) as unknown as Profile;
const SAVED: Record<string, unknown> = { raceName: 'Vienna', raceDate: '2027-04-18', level: 'intermediate', sex: 'female', runDaysPerWeek: 4, extras: [] };

/** The questionnaire with `n` strength sessions a week, `cali` of them calisthenics. */
function model(n: number, cali: number) {
  const start = editStart(profile(normalizeAnswers(SAVED)), null, TODAY);
  const base = settle({ a: { ...start.answers, setup: { ...start.answers.setup!, runPct: 70 } }, strength: start.strength }, TODAY);
  return setCaliWanted(setStrengthWanted(applyStrengthPlan(base), n), cali);
}

const setup = (over: Partial<Setup> = {}): Setup => ({ equipment: 'bodyweight', gear: [], avoid: [], goal: 'running', level: 'some', minutes: 60, ...over });

describe('calisthenics as a kind of strength session', () => {
  it('is part of the weekly number: "of those, calisthenics"', () => {
    expect(weekKinds(3, 1)).toEqual(['lower', 'upper', 'cali']);
    expect(weekKinds(2, 1)).toEqual(['full', 'cali']);
    expect(weekKinds(1, 1)).toEqual(['cali']);
    expect(weekKinds(2, 5)).toEqual(['cali', 'cali']);
    expect(weekKinds(2)).toEqual(['lower', 'upper']);
    expect(distinctWorkouts(3, 1)).toEqual([{ kind: 'lower', times: 1 }, { kind: 'upper', times: 1 }, { kind: 'cali', times: 1 }]);
  });

  it('is upper body and core, no leg day', () => {
    expect(isLegKind('cali')).toBe(false);
    expect(EXTRA_INFO.cali.load).toBe('light');
    expect(EXTRA_INFO.cali.kind).toBe('strength_cali');
    expect(routineKind('cali')).toBe('strength_cali');
    // it sits on a day like an upper-body session: the day before the long run is fine, the long-run day is not
    const kinds: DayKind[] = ['rest', 'quality', 'easy', 'rest', 'easy', 'rest', 'long'];
    for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(daySuitability('cali', d, kinds)).toBe(daySuitability('upper', d, kinds));
    expect(daySuitability('cali', 5, kinds)).toBeGreaterThan(0);
    expect(daySuitability('lower', 5, kinds)).toBeLessThan(0);
  });

  it('the share stays when the weekly number changes, and is never more than it', () => {
    const extras = withStrengthSessions([], 3, 1);
    expect(caliOf(extras)).toBe(1);
    expect(strengthPerWeek(extras)).toBe(3);
    const two = withStrengthSessions(extras, 2);
    expect(caliOf(two)).toBe(1);
    expect(strengthPerWeek(two)).toBe(2);
    expect(caliOf(withStrengthSessions(extras, 0))).toBe(0);
  });

  it('chosen in the questionnaire, the week gets a calisthenics day and the total stays', () => {
    const m = model(3, 1);
    expect(m.strength.perWeek).toBe(3);
    expect(caliOf(m.a.extras)).toBe(1);
    expect(strengthPerWeek(m.a.extras)).toBe(3);
    const week = autoWeek(weekInputOf(m.a)).week;
    expect(week.filter((d) => d.extras.includes('cali')).length).toBe(1);
    const long = week.findIndex((d) => d.run === 'long');
    expect(week[long].extras).not.toContain('cali');
    // fewer sessions keep the calisthenics one
    const two = setStrengthWanted(m, 2);
    expect(caliOf(two.a.extras)).toBe(1);
    expect(strengthPerWeek(two.a.extras)).toBe(2);
    // and back to none
    expect(caliOf(setCaliWanted(m, 0).a.extras)).toBe(0);
  });

  it('a drawn week keeps its days and gets the calisthenics session on one of its strength days', () => {
    const m = model(2, 0);
    const states = statesOf(autoWeek(weekInputOf(m.a)).week);
    const drawn = applyManualWeek(m.a, states, m.a.longRunDay);
    const withCali = setCaliWanted({ a: drawn, strength: m.strength }, 1).a;
    expect(withCali.scheduleMode).toBe('custom');
    expect(statesOf(withCali.customWeek!)).toEqual(statesOf(drawn.customWeek!));
    expect(withCali.customWeek!.filter((d) => d.extras.includes('cali')).length).toBe(1);
    expect(caliOf(withCali.extras)).toBe(1);
  });

  it('the plan has calisthenics sessions with their own workout, never on the long run, and leg work keeps its rules', () => {
    const m = model(3, 1);
    const f = finalize(m.a, m.strength, TODAY, NOW);
    expect(f.prefs!.routines.some((r) => r.id === 'cali' && r.exercises.length >= 3)).toBe(true);
    const plan = buildPlan(f.answers, assessFitness({ answers: f.answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, f.prefs?.routines);
    const cali = plan.workouts.filter((w) => w.kind === 'strength_cali');
    expect(cali.length).toBeGreaterThan(5);
    const longs = new Set(plan.workouts.filter((w) => w.kind === 'long' || w.kind === 'long_mp' || w.kind === 'race').map((w) => w.date));
    for (const w of cali) {
      expect(longs.has(w.date)).toBe(false);
      expect(w.steps.every((s) => s.type === 'exercise')).toBe(true);
    }
    for (const w of plan.workouts.filter((x) => x.kind === 'strength_lower' || x.kind === 'strength_full')) expect(longs.has(addDays(w.date, 1))).toBe(false);
    // the same weekday every normal week
    const days = new Set(cali.filter((w) => w.phase === 'build').map((w) => weekdayOf(w.date)));
    expect(days.size).toBe(1);
  });

  it('without a workout of its own the session is bar and parallel bars, lighter in recovery weeks', () => {
    const normal = extraSession({ id: 'cali', type: 'cali', perWeek: 1 }, 'build', false, 'bodyweight');
    const light = extraSession({ id: 'cali', type: 'cali', perWeek: 1 }, 'build', true, 'bodyweight');
    expect(normal.kind).toBe('strength_cali');
    expect(normal.title).toBe('Calisthenics');
    expect(normal.steps.map((s) => (s.type === 'exercise' ? s.name : ''))).toEqual(expect.arrayContaining(['Pull-up', 'Dips']));
    expect(light.duration_min).toBeLessThan(normal.duration_min);
  });
});

describe('the suggested calisthenics workout', () => {
  const keys = (s: Setup) => suggestRoutine('cali', s).exercises.map((x) => x.key);

  it('starts easy for someone new and gets harder with experience', () => {
    const fresh = keys(setup({ level: 'new' }));
    expect(fresh).toContain('dead_hang');
    expect(fresh).toContain('klimmzuege_einarmig_oder_mit_hilfe');
    expect(fresh).not.toContain('muscle_ups');
    const pro = keys(setup({ level: 'experienced' }));
    expect(pro).toContain('front_lever_progressionen');
    expect(pro).toContain('muscle_ups');
  });

  it('has only upper-body and core exercises, every one in the catalogue, without weights', () => {
    for (const level of ['new', 'some', 'experienced'] as const) {
      const r = suggestRoutine('cali', setup({ level }));
      expect(r.id).toBe('cali');
      expect(r.exercises.length).toBeGreaterThanOrEqual(3);
      for (const x of r.exercises) {
        const c = catalogEntry(x.key)!;
        expect(c).toBeTruthy();
        expect(['squat', 'hinge', 'lunge', 'glute', 'calf']).not.toContain(c.pattern);
        expect(x.kg).toBeNull();
      }
    }
  });

  it('steers around a sore shoulder or wrist and leaves out what the person excluded', () => {
    const shoulder = suggestRoutine('cali', setup({ level: 'experienced', avoid: ['shoulder', 'wrist'] }));
    for (const x of shoulder.exercises) expect(catalogEntry(x.key)!.avoid.some((a) => a === 'shoulder' || a === 'wrist')).toBe(false);
    expect(keys(setup({ excluded: ['pull_up'] }))).not.toContain('pull_up');
  });

  it('fits the time: never longer than the session length, a short session has fewer exercises', () => {
    for (const minutes of [30, 45, 60, 90]) expect(routineMinutes(suggestRoutine('cali', setup({ minutes, level: 'experienced' })))).toBeLessThanOrEqual(minutes);
    expect(suggestRoutine('cali', setup({ minutes: 30 })).exercises.length).toBeLessThan(suggestRoutine('cali', setup({ minutes: 60 })).exercises.length);
  });
});
