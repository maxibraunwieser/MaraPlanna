import { describe, expect, it } from 'vitest';
import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { applyStrengthPlan, setMinutes, setPlanWeeks, setPrimary, setRunSettings, setRunStarted, setStrengthTime, setStrengthWanted, strengthPlanOf, type Model } from '../onboarding/apply';
import { finalize } from '../onboarding/finalize';
import { blankStart } from '../onboarding/seed';
import { assessFitness } from './fitness';
import { buildPlan, timeLimits } from './generate';
import { runBuildSteps, strengthBuildSteps, weekFacts, SOURCES } from './rationale';
import type { Weekday } from '../types';

const TODAY = '2026-11-02';
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function person(over: (m: Model) => Model = (m) => m): Model {
  const s = blankStart(null, TODAY);
  let m: Model = { a: s.answers, strength: s.strength };
  m = setPrimary(m, 'running', TODAY);
  m = setRunStarted(m, 'y1to3');
  m = setPlanWeeks(m, 12, TODAY);
  [45, 45, 45, 45, 60, 90, 120].forEach((v, d) => (m = setMinutes(m, d as Weekday, v)));
  m = setRunSettings(m, { runsWanted: 4 });
  m = setStrengthTime(m, { strengthNow: 3, doubles: true });
  return over(applyStrengthPlan(m));
}

function steps(m: Model) {
  const { answers, prefs } = finalize(m.a, m.strength, TODAY);
  const assessment = assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY });
  const plan = buildPlan(answers, assessment, TODAY, prefs?.routines);
  const input = { today: TODAY, answers, plan, assessment, units: 'km' as const, names: NAMES };
  const p = strengthPlanOf(m.a);
  const run = runBuildSteps(input);
  const str = strengthBuildSteps({
    ...input,
    facts: { count: m.strength.perWeek ?? 0, recommended: p.recommended, desired: p.desired, now: m.a.setup!.strengthNow ?? 0, chosen: m.a.setup!.strengthWanted !== null, limitedBy: p.limitedBy, minutes: m.strength.minutes },
    kindNames: { lower: 'Lower body', upper: 'Upper body', full: 'Full body' },
    whyNames: { hardDay: 'on a hard-run day', easyDay: 'on an easy-run day', rest: 'on a day of its own' },
  });
  return { run, str };
}

describe('the steps the plan is built in', () => {
  it('the running plan has its steps in order, with the plan\'s own numbers and the studies', () => {
    const { run } = steps(person());
    expect(run.map((s) => s.id.split('.').slice(0, 2).join('.'))).toEqual(['run.level', 'run.load', 'run.days', 'run.hard', 'run.intensity', 'run.long', 'run.deload', 'run.phases']);
    expect(run[0].params.vdot).toBeGreaterThan(25);
    expect(run[2].params.runs).toBe(4);
    expect(String(run[2].params.days).split(', ').length).toBe(4);
    expect(run[1].sources).toContain('nielsen');
    expect(run[4].sources).toContain('seiler');
    for (const s of run.flatMap((x) => x.sources)) expect(SOURCES[s]).toBeTruthy();
  });

  it('the days step says whether the planner or the person chose them', () => {
    expect(steps(person()).run[2].id).toMatch(/^run\.days\.auto/);
    expect(steps(person((m) => setRunSettings(m, { runDays: [1, 3, 5, 6] }))).run[2].id).toBe('run.days.manual');
  });

  it('every step has a title and a text in English and German', () => {
    const { run, str } = steps(person());
    for (const s of [...run, ...str]) {
      for (const suffix of ['t', 'x']) {
        expect(en, `en ${s.id}.${suffix}`).toHaveProperty(`ob.build.${s.id}.${suffix}`);
        expect(de, `de ${s.id}.${suffix}`).toHaveProperty(`ob.build.${s.id}.${suffix}`);
      }
    }
  });

  it('the strength steps tell why the number is what it is', () => {
    // lifting three times now: kept
    expect(steps(person()).str[0].id).toBe('str.count.habit');
    // chosen in the plan
    expect(steps(person((m) => setStrengthWanted(m, 2))).str[0].id).toBe('str.count.chosen');
    // no strength yet and a big share: capped by what they do now
    const limited = person((m) => setPrimary(setStrengthTime(m, { strengthNow: 0 }), 'hybrid', TODAY));
    expect(steps(applyStrengthPlan(limited)).str[0].id).toBe('str.count.limited.now');
  });

  it('the strength steps list every session with its day and why', () => {
    const { str } = steps(person());
    const place = str.find((s) => s.id.startsWith('str.place'))!;
    expect(String(place.params.list).split('; ').length).toBe(3);
    expect(String(place.params.list)).toMatch(/Lower body – \w+day \(/);
    expect(str.map((s) => s.id.split('.').slice(0, 2).join('.'))).toEqual(['str.count', 'str.time', 'str.interference', 'str.place', 'str.rest', 'str.phase']);
  });

  it('the facts of a drawn week come from the drawn week', () => {
    const m = person();
    const facts = weekFacts(finalize(m.a, m.strength, TODAY).answers);
    expect(facts.drawn).toBe(false);
    expect(facts.runDays.length).toBe(4);
    const drawn = weekFacts({ ...m.a, scheduleMode: 'custom', customWeek: [
      { run: 'easy', extras: [] }, { run: 'quality', extras: ['lower'] }, { run: 'rest', extras: [] }, { run: 'easy', extras: [] },
      { run: 'rest', extras: ['upper'] }, { run: 'rest', extras: [] }, { run: 'long', extras: [] },
    ] });
    expect(drawn.drawn).toBe(true);
    expect(drawn.longDay).toBe(6);
    expect(drawn.strength.map((s) => [s.kind, s.day, s.why])).toEqual([['lower', 1, 'hardDay'], ['upper', 4, 'rest']]);
  });

  it('days that cannot carry what the person runs now: the plan is what the days allow, and the step says so', () => {
    const m = person((x) => {
      const t = [null, 45, 0, 60, null, null, null].reduce<Model>((acc, v, d) => setMinutes(acc, d as Weekday, v), x);
      return setRunSettings({ ...t, a: { ...t.a, currentWeeklyKm: 40, longestRecentRunKm: 15 } }, { runsWanted: 3 });
    });
    const { answers, prefs } = finalize(m.a, m.strength, TODAY);
    const assessment = assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY });
    const plan = buildPlan(answers, assessment, TODAY, prefs?.routines);
    const cap = timeLimits(answers, plan.fitness.vdot).weeklyKm;
    expect(cap).toBeLessThan(40);
    expect(plan.fitness.peakWeeklyKm).toBeLessThanOrEqual(cap);
    expect(Math.max(...plan.weeks.map((w) => w.targetKm))).toBeLessThanOrEqual(cap + 2);
    const load = runBuildSteps({ today: TODAY, answers, plan, assessment, units: 'km', names: NAMES }).find((x) => x.id.startsWith('run.load'))!;
    expect(load.id).toBe('run.load.capped');
    expect(load.params.cap).toBeDefined();
  });
});
