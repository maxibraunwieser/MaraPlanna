import { describe, expect, it } from 'vitest';
import { editWorkout, hasStrides } from './edit';
import { assessFitness } from './fitness';
import { buildPlan } from './generate';
import { weekdayOf } from './dates';
import { workoutKm } from './workouts';
import { normalizeAnswers } from '../answers';
import type { OnboardingAnswers, WorkoutDraft } from '../types';

const base: Partial<OnboardingAnswers> = {
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 40, longestRecentRunKm: 18, runDaysPerWeek: 5, availableDays: [0, 1, 2, 3, 4, 5, 6], longRunDay: 6,
  extras: [],
};
const build = (over: Partial<OnboardingAnswers> = {}) => {
  const answers = normalizeAnswers({ ...base, ...over });
  const assessment = assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' });
  return buildPlan(answers, assessment, '2026-10-26');
};

const plan = build();
const paces = plan.fitness.paces;
const easyWithStrides = plan.workouts.find((w) => w.kind === 'easy' && hasStrides(w.steps))!;
const plainEasy = plan.workouts.find((w) => w.kind === 'easy' && !hasStrides(w.steps))!;
const withKey = (w: WorkoutDraft) => ({ ...w });

describe('editing a single session', () => {
  it('the plan has easy runs with and without strides to work with', () => {
    expect(easyWithStrides).toBeDefined();
    expect(plainEasy).toBeDefined();
  });

  it('takes the strides out and gives their distance to the easy part', () => {
    const e = editWorkout(withKey(easyWithStrides), { removeStrides: true }, paces)!;
    expect(e).not.toBeNull();
    expect(hasStrides(e.steps)).toBe(false);
    expect(e.title).toBe('Easy run');
    expect(e.kind).toBe('easy');
    // the total stays (within the rounding to half a kilometre)
    expect(Math.abs(e.distance_km - easyWithStrides.distance_km!)).toBeLessThanOrEqual(0.5);
    const before = easyWithStrides.steps.find((s) => s.type === 'run' && s.label === 'Easy') as { distanceKm: number };
    const after = e.steps.find((s) => s.type === 'run' && s.label === 'Easy') as { distanceKm: number };
    expect(after.distanceKm).toBeGreaterThan(before.distanceKm);
    expect(Math.abs(workoutKm(e.steps, paces) - e.distance_km)).toBeLessThan(0.3);
    expect(e.duration_min).toBeGreaterThan(0);
  });

  it('does not touch the original session', () => {
    const copy = JSON.stringify(easyWithStrides);
    editWorkout(easyWithStrides, { removeStrides: true }, paces);
    expect(JSON.stringify(easyWithStrides)).toBe(copy);
  });

  it('adds strides to a plain easy run and shortens the easy part to keep the total', () => {
    const e = editWorkout(withKey(plainEasy), { addStrides: true }, paces)!;
    expect(hasStrides(e.steps)).toBe(true);
    expect(e.title).toBe('Easy run + strides');
    expect(Math.abs(e.distance_km - plainEasy.distance_km!)).toBeLessThanOrEqual(0.5);
  });

  it('sets the total distance, with or without strides', () => {
    const longer = editWorkout(withKey(plainEasy), { distanceKm: plainEasy.distance_km! + 3 }, paces)!;
    expect(longer.distance_km).toBeGreaterThan(plainEasy.distance_km!);
    expect(Math.abs(longer.distance_km - (plainEasy.distance_km! + 3))).toBeLessThanOrEqual(0.5);
    const noStrides = editWorkout(withKey(easyWithStrides), { removeStrides: true, distanceKm: 12 }, paces)!;
    expect(hasStrides(noStrides.steps)).toBe(false);
    expect(Math.abs(noStrides.distance_km - 12)).toBeLessThanOrEqual(0.5);
  });

  it('turns a hard session into an easy run of the same distance and takes the key flag off', () => {
    const hard = plan.workouts.find((w) => w.kind === 'intervals' || w.kind === 'threshold')!;
    const e = editWorkout(withKey(hard), { makeEasy: true }, paces)!;
    expect(e.kind).toBe('easy');
    expect(e.key_session).toBe(false);
    expect(e.title).toBe('Easy run');
    expect(e.steps).toHaveLength(1);
    expect(Math.abs(e.distance_km - hard.distance_km!)).toBeLessThanOrEqual(0.5);
  });

  it.each([
    ['no strides to remove', () => editWorkout(withKey(plainEasy), { removeStrides: true }, paces)],
    ['strides already there', () => editWorkout(withKey(easyWithStrides), { addStrides: true }, paces)],
    ['making an easy run easy', () => editWorkout(withKey(plainEasy), { makeEasy: true }, paces)],
    ['nothing asked', () => editWorkout(withKey(plainEasy), {}, paces)],
    ['a distance on a session made of reps', () => editWorkout(withKey(plan.workouts.find((w) => w.kind === 'intervals')!), { distanceKm: 20 }, paces)],
  ])('returns null: %s', (_name, run) => {
    expect(run()).toBeNull();
  });
});

describe('"no strides on Fridays" in the generator', () => {
  const strideDays = (p: ReturnType<typeof build>) => {
    const out = new Map<number, number>();
    for (const w of p.workouts) if (w.kind === 'easy' && hasStrides(w.steps)) out.set(weekdayOf(w.date), (out.get(weekdayOf(w.date)) ?? 0) + 1);
    return out;
  };

  it('keeps strides off the chosen weekday and leaves the other days alone', () => {
    const baseline = strideDays(plan);
    expect(baseline.size).toBeGreaterThan(0);
    const [day, count] = [...baseline][0];
    expect(count).toBeGreaterThan(0);
    const without = strideDays(build({ noStridesDays: [day as 0] }));
    expect(without.get(day) ?? 0).toBe(0);
    for (const [d, n] of baseline) if (d !== day) expect(without.get(d) ?? 0).toBe(n);
  });

  it('no strides at all when every day is listed, and the easy runs get the distance instead', () => {
    const none = build({ noStridesDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(none.workouts.some((w) => w.kind === 'easy' && hasStrides(w.steps))).toBe(false);
    const weekKm = (p: typeof plan, week: number) => p.workouts.filter((w) => w.week === week).reduce((s, w) => s + (w.distance_km ?? 0), 0);
    // the weekly volume is the same with and without strides (within a couple of kilometres)
    expect(Math.abs(weekKm(none, 2) - weekKm(plan, 2))).toBeLessThan(3);
  });
});
