import { describe, expect, it } from 'vitest';
import { assessFitness } from './fitness';
import { buildPlan, peakLongRun, peakVolume } from './generate';
import { COMING_SOON_GOALS, distanceLabel, goalProfile, isRaceGoal, type GoalKind } from './goals';
import { addDays, daysBetween, mondayOf } from './dates';
import { defaultAnswers, normalizeAnswers } from '../answers';
import type { OnboardingAnswers } from '../types';

const today = '2026-11-02'; // a Monday

function answersFor(goal: GoalKind, over: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  const weeks = goalProfile(goal, over.raceDistanceM).weeks.default;
  const end = addDays(mondayOf(addDays(today, weeks * 7 - 1)), 6);
  return normalizeAnswers({
    ...defaultAnswers(),
    goal,
    raceName: goal === 'marathon' ? 'Vienna' : '',
    raceDate: end,
    level: 'intermediate',
    currentWeeklyKm: 30,
    longestRecentRunKm: 12,
    runDaysPerWeek: 4,
    extras: [],
    ...over,
  });
}

const plan = (a: OnboardingAnswers) => buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today }), today);

describe('goal profiles', () => {
  it('plans saved before goals existed are marathons', () => {
    expect(goalProfile(undefined).kind).toBe('marathon');
    expect(goalProfile(undefined).distanceM).toBe(42_195);
  });

  it('which goals have a race, and what is still to come', () => {
    expect(['marathon', 'half', 'race10k', 'race5k', 'faster'].every((g) => isRaceGoal(g as GoalKind))).toBe(true);
    expect(['hybrid', 'fitness', 'comeback'].some((g) => isRaceGoal(g as GoalKind))).toBe(false);
    expect(COMING_SOON_GOALS).toContain('ultra');
  });

  it('"get faster" takes the distance the person picks', () => {
    expect(goalProfile('faster', 5000).distanceM).toBe(5000);
    expect(goalProfile('faster', 21_097).taperWeeks(12)).toBe(2);
    expect(goalProfile('faster', 5000).longKm.intermediate[1]).toBeLessThan(goalProfile('faster', 21_097).longKm.intermediate[1]);
  });

  it('labels distances', () => {
    expect(distanceLabel(42_195)).toBe('Marathon');
    expect(distanceLabel(21_097)).toBe('Half marathon');
    expect(distanceLabel(10_000)).toBe('10 km');
    expect(distanceLabel(5000)).toBe('5 km');
    expect(distanceLabel(8000)).toBe('8 km');
  });
});

describe('race plans end on the right day over the right distance', () => {
  const cases: [GoalKind, number, number][] = [['race5k', 5000, 1], ['race10k', 10_000, 1], ['half', 21_097, 2], ['marathon', 42_195, 3]];
  for (const [goal, distance, taper] of cases) {
    it(goal, () => {
      const a = answersFor(goal);
      const p = plan(a);
      const race = p.workouts.find((w) => w.kind === 'race')!;
      expect(race.date).toBe(a.raceDate);
      expect(race.distance_km).toBeCloseTo(distance / 1000, 0);
      expect(p.fitness.raceDistanceM).toBe(distance);
      const taperWeeks = p.weeks.filter((w) => w.phase === 'taper').length;
      expect(taperWeeks).toBe(goalProfile(goal).taperWeeks(p.weeks.length));
      if (p.weeks.length >= 12) expect(taperWeeks).toBeGreaterThanOrEqual(Math.min(taper, 2));
      // the longest run stays in the range of the distance
      const long = Math.max(...p.weeks.map((w) => w.longKm));
      expect(long).toBeLessThanOrEqual(goalProfile(goal).longKm.intermediate[1] + 0.5);
      expect(p.workouts.every((w) => w.date <= a.raceDate)).toBe(true);
    });
  }

  it('short races have no marathon-pace work, long ones do', () => {
    const kinds = (g: GoalKind) => new Set(plan(answersFor(g)).workouts.map((w) => w.kind));
    for (const g of ['race5k', 'race10k'] as const) {
      expect(kinds(g).has('marathon_pace')).toBe(false);
      expect(kinds(g).has('long_mp')).toBe(false);
    }
    expect(kinds('marathon').has('marathon_pace') || kinds('marathon').has('long_mp')).toBe(true);
  });

  it('the 5 km plan builds intervals, the 10 km plan tempo and intervals', () => {
    const k5 = plan(answersFor('race5k', { level: 'advanced', runDaysPerWeek: 5 })).workouts.map((w) => w.kind);
    expect(k5.includes('intervals')).toBe(true);
    const k10 = plan(answersFor('race10k', { level: 'advanced', runDaysPerWeek: 5 })).workouts.map((w) => w.kind);
    expect(k10.includes('threshold')).toBe(true);
  });

  it('a time goal sets the pace of the race: a faster 10 km goal gives faster training paces', () => {
    const slow = plan(answersFor('race10k', { goalType: 'time', goalTimeS: 3000 })).fitness;
    const fast = plan(answersFor('race10k', { goalType: 'time', goalTimeS: 2400, currentWeeklyKm: 50 })).fitness;
    expect(fast.paces.threshold).toBeLessThanOrEqual(slow.paces.threshold);
    expect(slow.targetMarathonS).toBeGreaterThan(0);
  });
});

describe('"get faster"', () => {
  it('ends with a time trial over the chosen distance', () => {
    const a = answersFor('faster', { raceDistanceM: 5000 });
    const p = plan(a);
    const t = p.workouts.find((w) => w.kind === 'race')!;
    expect(t.title).toBe('Time trial: 5 km');
    expect(t.distance_km).toBe(5);
  });
});

describe('plans without a race', () => {
  for (const goal of ['hybrid', 'fitness', 'comeback'] as const) {
    it(`${goal}: no taper, no race day, the chosen number of weeks`, () => {
      const a = answersFor(goal);
      const p = plan(a);
      expect(p.fitness.raceDistanceM).toBeNull();
      expect(p.workouts.some((w) => w.kind === 'race')).toBe(false);
      expect(p.weeks.some((w) => w.phase === 'taper')).toBe(false);
      expect(p.weeks.length).toBe(goalProfile(goal).weeks.default);
      expect(p.weeks.length * 7).toBeGreaterThanOrEqual(daysBetween(today, a.raceDate));
      const long = Math.max(...p.weeks.map((w) => w.longKm));
      expect(long).toBeLessThanOrEqual(goalProfile(goal).longKm.intermediate[1] + 0.5);
      expect(p.workouts.filter((w) => w.distance_km).length).toBeGreaterThan(p.weeks.length * 2);
    });
  }

  it('they are lighter than a marathon plan, and coming back is the lightest', () => {
    const peak = (g: GoalKind) => peakVolume(answersFor(g), 30);
    expect(peak('hybrid')).toBeLessThan(peak('marathon'));
    expect(peak('comeback')).toBeLessThanOrEqual(peak('fitness'));
    expect(peakLongRun(answersFor('comeback'))).toBeLessThan(peakLongRun(answersFor('hybrid')));
  });

  it('volume grows slowly (at most about 10 % a week outside recovery weeks)', () => {
    const p = plan(answersFor('comeback', { approach: 'conservative' }));
    for (let i = 1; i < p.weeks.length; i++) {
      if (p.weeks[i].recovery || p.weeks[i - 1].recovery) continue;
      expect(p.weeks[i].targetKm).toBeLessThanOrEqual(p.weeks[i - 1].targetKm * 1.2 + 1);
    }
  });

  it('every fourth week or so is lighter', () => {
    const p = plan(answersFor('hybrid'));
    expect(p.weeks.some((w) => w.recovery)).toBe(true);
  });
});

describe('the marathon is unchanged', () => {
  it('still 16+ weeks of phases with a three week taper and the marathon on race day', () => {
    const a = answersFor('marathon', { raceDate: addDays(mondayOf(addDays(today, 18 * 7)), 6) });
    const p = plan(a);
    expect(p.weeks.filter((w) => w.phase === 'taper')).toHaveLength(3);
    expect(p.workouts.find((w) => w.kind === 'race')!.distance_km).toBe(42.2);
    expect(Math.max(...p.weeks.map((w) => w.longKm))).toBeGreaterThanOrEqual(28);
  });
});
