// The plan the questionnaire produces for a runner who also lifts: the strength sessions the person asked for, the time of each day,
// the build-up and the lighter weeks.

import { describe, expect, it } from 'vitest';
import { applyStrengthPlan, setMinutes, setPlanWeeks, setPrimary, setRunPct, setRunSettings, setRunStarted, setStrengthTime, setStrengthWanted, type Model } from '../onboarding/apply';
import { finalize } from '../onboarding/finalize';
import { blankStart } from '../onboarding/seed';
import { assessFitness } from './fitness';
import { weekdayOf } from './dates';
import { buildPlan } from './generate';
import { autoWeek, weekInputOf } from './week';
import type { Weekday } from '../types';

const TODAY = '2026-11-02'; // a Monday: the first week is a full one
const MINUTES = [45, 45, 45, 45, 60, 90, 120];

function person(over: (m: Model) => Model = (m) => m): Model {
  const s = blankStart(null, TODAY);
  let m: Model = { a: s.answers, strength: s.strength };
  m = setPrimary(m, 'running', TODAY);
  m = setRunStarted(m, 'y1to3');
  m = setPlanWeeks(m, 12, TODAY);
  MINUTES.forEach((v, d) => (m = setMinutes(m, d as Weekday, v)));
  m = setRunSettings(m, { runsWanted: 4 });
  m = setStrengthTime(m, { strengthNow: 3, doubles: true });
  return over(applyStrengthPlan(m));
}

function planOf(m: Model) {
  const { answers, prefs } = finalize(m.a, m.strength, TODAY);
  const assessment = assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY });
  return { answers, plan: buildPlan(answers, assessment, TODAY, prefs?.routines) };
}

const strengthIn = (plan: ReturnType<typeof planOf>['plan'], week: number) => plan.workouts.filter((w) => w.week === week && w.kind.startsWith('strength_'));

describe('the number of strength sessions the person gave', () => {
  it('three sessions now and running first: three strength workouts a week, not one', () => {
    const m = person();
    expect(m.strength.perWeek).toBe(3);
    const { plan } = planOf(m);
    const normal = plan.weeks.filter((w) => w.phase !== 'taper');
    expect(normal.length).toBeGreaterThan(8);
    for (const w of normal) expect(strengthIn(plan, w.week).length).toBe(3);
  });

  it('a different number chosen in the plan is what the plan has', () => {
    const { plan } = planOf(person((m) => setStrengthWanted(m, 2)));
    for (const w of plan.weeks.filter((x) => x.phase !== 'taper')) expect(strengthIn(plan, w.week).length).toBe(2);
  });

  it('a plan without a race keeps its strength sessions in the last week too', () => {
    const { plan } = planOf(person((m) => setRunPct(setPrimary(m, 'hybrid', TODAY), 50, TODAY)));
    const last = plan.weeks[plan.weeks.length - 1].week;
    expect(strengthIn(plan, last).length).toBeGreaterThan(0);
  });
});

describe('the time of each day', () => {
  it('run and strength together fit into the minutes of the day', () => {
    const { plan } = planOf(person());
    const byDate = new Map<string, number>();
    for (const w of plan.workouts) byDate.set(w.date, (byDate.get(w.date) ?? 0) + (w.duration_min ?? 0));
    for (const [date, minutes] of byDate) {
      const limit = MINUTES[weekdayOf(date)];
      if (limit < 120) expect(minutes, `${date} has ${minutes} min of ${limit}`).toBeLessThanOrEqual(limit + 2);
    }
  });

  it('the long run fits the day it is on', () => {
    const m = person((x) => [0, 1, 2, 3, 4, 5].reduce((acc, d) => setMinutes(acc, d as Weekday, d === 5 ? 100 : 45), setMinutes(x, 6, 60)));
    const { plan } = planOf(m);
    const long = plan.workouts.filter((w) => w.kind === 'long' || w.kind === 'long_mp');
    expect(long.length).toBeGreaterThan(0);
    // the planner picks the day with the most time (Saturday, 100 minutes)
    for (const w of long) {
      expect(weekdayOf(w.date)).toBe(5);
      expect(w.duration_min ?? 0).toBeLessThanOrEqual(100);
    }
  });

  it('the plan keeps to the days of the weekly model every week', () => {
    const m = person();
    const model = autoWeek(weekInputOf(finalize(m.a, m.strength, TODAY).answers)).solution;
    const allowed = new Set<number>([...model.runDays, ...model.strength.map((x) => x.day)]);
    const { plan } = planOf(m);
    // the race week is laid out backwards from race day
    for (const w of plan.workouts) if (w.week < plan.weeks.length) expect(allowed.has(weekdayOf(w.date)), `${w.date} ${w.kind}`).toBe(true);
  });
});

describe('the build-up', () => {
  it('lighter weeks are really lighter and the volume does not jump', () => {
    const { plan } = planOf(person());
    const weeks = plan.weeks;
    const recovery = weeks.filter((w) => w.recovery);
    expect(recovery.length).toBeGreaterThan(0);
    for (const r of recovery) {
      const before = weeks[r.week - 2];
      expect(r.targetKm, `week ${r.week}`).toBeLessThanOrEqual(before.targetKm * 0.9);
    }
    let last = weeks[1].targetKm;
    for (const w of weeks.slice(2)) {
      if (w.recovery || w.phase === 'taper') continue;
      expect(w.targetKm, `week ${w.week}`).toBeLessThanOrEqual(last * 1.16);
      last = w.targetKm;
    }
  });
});
