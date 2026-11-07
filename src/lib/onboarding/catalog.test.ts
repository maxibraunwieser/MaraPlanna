// The translation from the questionnaire's answers to what the plan engine reads, and what the engine does with the new answers.

import { describe, expect, it } from 'vitest';
import { normalizePrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import { assessFitness } from '../planner/fitness';
import { weekdayOf } from '../planner/dates';
import { buildPlan } from '../planner/generate';
import { autoWeek, weekInputOf } from '../planner/week';
import { isRaceGoal } from '../planner/goals';
import { CATALOG, startingWeight, suggestRoutine } from '../strengthPlan';
import type { Activity, GarminConnection, OnboardingAnswers, SetupExtras, Weekday } from '../types';
import {
  anyLongDay, gearFor, inBreak, keysInText, kindsOfLocations, levelCapsOf, liftsToE1rm, limitationsOf, parqAnswered, parqFlagged, strengthCount, strengthGoalOf, strengthMinutesOf, unavailableByMinutes,
} from './catalog';
import {
  applyStrengthPlan, clearGarminValues, moveInWeek, moveRunDay, runOnlyWeek, setHasRace, setLocations, setMinutes, setPlanWeeks, setPrimary, setRaceKind, setRefRace, setRunPct, setRunSettings,
  setRunStarted, setStrengthTime, setStrengthWanted, strengthPlanOf, syncStrength, type Model,
} from './apply';
import { finalize } from './finalize';
import { applyGarmin, readGarmin } from './garmin';
import { blankStart } from './seed';
import { strengthPerWeek } from './strengthMap';

const TODAY = '2026-11-06';
const NOW = '2026-11-06T10:00:00Z';
const start = (): Model => {
  const s = blankStart(null, TODAY);
  return { a: s.answers, strength: s.strength };
};
const setup = (m: Model, patch: Partial<SetupExtras>): Model => ({ ...m, a: { ...m.a, setup: { ...m.a.setup!, ...patch } } });

describe('strength sessions next to the runs', () => {
  const count = (o: Partial<Parameters<typeof strengthCount>[0]> = {}) => strengthCount({ runs: 3, runPct: 50, strengthNow: 3, freeDays: 7, doubles: true, ...o });

  it('follows the share of running, at least one with a strength share and at most four', () => {
    expect(count().count).toBe(3);
    expect(count({ runs: 4, runPct: 80, strengthNow: 0 }).count).toBe(1);
    expect(count({ runs: 3, runPct: 60, strengthNow: 0 }).count).toBe(2);
    expect(count({ runs: 5, runPct: 95, strengthNow: 0 }).count).toBe(1);
    expect(count({ runPct: 100 }).count).toBe(0);
    expect(count({ runs: 6, runPct: 0, strengthNow: 6 }).count).toBe(4);
    expect(count({ runs: 6, runPct: 20, strengthNow: 6 }).count).toBe(4);
  });

  it('keeps what the person already does: three sessions now stay three, even with a small strength share', () => {
    expect(count({ runs: 4, runPct: 80, strengthNow: 3 })).toMatchObject({ count: 3, recommended: 3, desired: 1, limitedBy: null });
    expect(count({ runs: 4, runPct: 80, strengthNow: 2 }).count).toBe(2);
    // more than three is not carried over: two or three sessions are what runners gain from
    expect(count({ runs: 4, runPct: 90, strengthNow: 5 }).count).toBe(3);
  });

  it('does not jump above what the person lifts now: two more at most', () => {
    expect(count({ strengthNow: 0 })).toEqual({ count: 2, recommended: 2, desired: 3, max: 4, limitedBy: 'now' });
    expect(count({ strengthNow: 1 }).count).toBe(3);
    expect(count({ strengthNow: null }).count).toBe(2);
  });

  it('a number the person chose wins over the recommendation, within what fits', () => {
    expect(count({ strengthNow: 3, strengthWanted: 1 })).toMatchObject({ count: 1, recommended: 3 });
    expect(count({ strengthNow: 3, strengthWanted: 4 }).count).toBe(4);
    // four is the most the plan has (lower and upper, twice)
    expect(count({ strengthNow: 3, strengthWanted: 9 }).count).toBe(4);
    expect(count({ strengthNow: 3, strengthWanted: 4, freeDays: 5, doubles: false })).toMatchObject({ count: 2, max: 2 });
    expect(count({ strengthNow: 3, strengthWanted: 4, runPct: 100 }).count).toBe(0);
  });

  it('without double days only the days without a run take strength', () => {
    expect(count({ runs: 4, runPct: 50, strengthNow: 4, freeDays: 5, doubles: false })).toEqual({ count: 1, recommended: 1, desired: 4, max: 1, limitedBy: 'days' });
    expect(count({ runs: 4, runPct: 50, strengthNow: 4, freeDays: 5, doubles: true }).count).toBe(4);
    expect(count({ runs: 4, runPct: 50, strengthNow: 4, freeDays: 4, doubles: false }).count).toBe(0);
    expect(count({ runs: 3, runPct: 50, strengthNow: 4, freeDays: 7, doubles: null }).count).toBe(3);
  });

  it('a strength session is as long as the days of the person allow', () => {
    expect(strengthMinutesOf([30, 30, 30, 30, 30, 90, 90], [])).toBe(30);
    expect(strengthMinutesOf([null, 45, null, 45, null, 90, 120], [])).toBe(60);
    expect(strengthMinutesOf([45, 45, 45, 0, 45, 60, 60], [3])).toBe(45);
    expect(strengthMinutesOf([null, null, null, null, null, null, null], [])).toBe(60);
    expect(strengthMinutesOf([90, 90, 90, 120, 90, 90, 90], [])).toBe(75);
  });
});

describe('the answers drive the plan engine', () => {
  it('the main goal sets the share of running and, without a race, the plan goal', () => {
    let m = setPrimary(start(), 'hybrid', TODAY);
    expect(m.a.setup!.runPct).toBe(50);
    expect(m.a.goal).toBe('hybrid');
    m = setPrimary(m, 'running', TODAY);
    expect(m.a.setup!.runPct).toBe(80);
    expect(m.a.goal).toBe('faster');
    m = setPrimary(m, 'lose', TODAY);
    expect(m.a.goal).toBe('fitness');
    expect(m.a.setup!.secondaryGoal).toBe('weight');
    m = setPrimary(m, 'fitness', TODAY);
    expect(m.a.setup!.secondaryGoal).toBeNull();
  });

  it('a race: yes starts without a distance, the distance and the date make a race goal, no goes back to the main goal', () => {
    let m = setPrimary(start(), 'running', TODAY);
    m = setHasRace(m, true, TODAY);
    expect(m.a.goal).toBeUndefined();
    m = setRaceKind(m, 'marathon', TODAY);
    expect(isRaceGoal(m.a.goal!)).toBe(true);
    expect(m.a.raceDate).toBe('');
    m = { ...m, a: { ...m.a, raceDate: '2027-03-14' } };
    m = setRaceKind(m, 'half', TODAY);
    expect(m.a.goal).toBe('half');
    expect(m.a.raceDate).toBe('2027-03-14');
    // the race stays when the main goal is changed afterwards
    expect(setPrimary(m, 'hybrid', TODAY).a.goal).toBe('half');
    m = setHasRace(m, false, TODAY);
    expect(m.a.goal).toBe('faster');
    expect(m.a.planWeeks).not.toBeNull();
  });

  it('no running share, no race', () => {
    let m = setHasRace(setPrimary(start(), 'running', TODAY), true, TODAY);
    m = setRunPct(m, 0, TODAY);
    expect(m.a.setup!.hasRace).toBe(false);
  });

  it('the plan length of a plan without a race', () => {
    const m = setPlanWeeks(setPrimary(start(), 'hybrid', TODAY), 8, TODAY);
    expect(m.a.planWeeks).toBe(8);
    expect(m.a.goal).toBe('hybrid');
  });

  it('days with no time are free, the long run moves to a free day, the runs follow the answer', () => {
    let m = setPrimary(start(), 'hybrid', TODAY);
    m = setMinutes(setMinutes(setMinutes(m, 2, 0), 4, 0), 1, 45);
    expect(m.a.setup!.minutesPerDay).toEqual([null, 45, 0, null, 0, null, null]);
    expect(m.a.setup!.unavailableDays).toEqual([2, 4]);
    expect(m.a.setup!.daysAvail).toEqual([0, 1, 3, 5, 6]);
    expect(m.a.availableDays).toEqual([0, 1, 3, 5, 6]);
    m = setRunSettings(m, { runsWanted: 4, longDay: 4 });
    expect(m.a.runDaysPerWeek).toBe(4);
    expect([0, 1, 3, 5, 6]).toContain(m.a.longRunDay);
    expect(setRunSettings(m, { longRunAny: true }).a.longRunDay).toBe(6);
    expect(anyLongDay([0, 2, 5])).toBe(5);
    expect(unavailableByMinutes([0, null, 30, 0, null, null, null], [6])).toEqual([0, 3, 6]);
  });

  it('as many runs as asked, but never more than the days with time', () => {
    let m = setPrimary(start(), 'running', TODAY);
    m = setRunSettings(m, { runsWanted: 6 });
    expect(m.a.runDaysPerWeek).toBe(6);
    m = [0, 1, 2, 3].reduce((x, d) => setMinutes(x, d as 0, 0), m);
    expect(m.a.runDaysPerWeek).toBe(3);
  });

  it('the days they like to run on are kept when there are enough', () => {
    let m = setPrimary(start(), 'running', TODAY);
    m = setRunSettings(setRunSettings(m, { runsWanted: 3 }), { runDays: [1, 3, 5], longDay: 5 });
    const runDays = (x: Model) => runOnlyWeek(x.a).week.flatMap((d, i) => (d.run !== 'rest' ? [i] : []));
    expect(runDays(m)).toEqual([1, 3, 5]);
    expect(runOnlyWeek(m.a).week[5].run).toBe('long');
    // fewer days than runs: the planner adds days
    m = setRunSettings(m, { runDays: [1, 3] });
    expect(runDays(m).length).toBe(3);
  });

  it('dragging a run moves it (and the long run with it)', () => {
    let m = setRunSettings(setRunSettings(setPrimary(start(), 'running', TODAY), { runsWanted: 3 }), { runDays: [1, 3, 5], longDay: 5 });
    m = moveRunDay(m, 3, 4);
    expect(runOnlyWeek(m.a).week.flatMap((d, i) => (d.run !== 'rest' ? [i] : []))).toEqual([1, 4, 5]);
    m = moveRunDay(m, 5, 6);
    const week = runOnlyWeek(m.a).week;
    expect(week.findIndex((d) => d.run === 'long')).toBe(6);
    // a day with a run, or with no time, is not a target
    expect(moveRunDay(m, 1, 4)).toBe(m);
    const closed = setMinutes(m, 2, 0);
    expect(moveRunDay(closed, 1, 2)).toBe(closed);
  });

  it('the strength sessions are planned next to the runs once the strength questions are answered', () => {
    let m = setRunSettings(setPrimary(start(), 'hybrid', TODAY), { runsWanted: 3 });
    expect(m.strength.perWeek).toBeNull();
    m = setStrengthTime(m, { strengthNow: 2 });
    expect(m.strength.perWeek).toBeNull();
    m = applyStrengthPlan(m);
    expect(m.strength.perWeek).toBe(strengthPlanOf(m.a).count);
    expect(m.strength.perWeek).toBeGreaterThanOrEqual(2);
    expect(m.a.extras.filter((e) => ['lower', 'upper', 'full'].includes(e.id)).reduce((n, e) => n + e.perWeek, 0)).toBe(m.strength.perWeek);
    // a change of the answers plans the strength again
    expect(setStrengthTime(m, { strengthNow: 0 }).strength.perWeek).toBe(2);
    expect(setStrengthTime(m, { doubles: false }).strength.perWeek).toBeLessThanOrEqual(m.strength.perWeek!);
  });

  it('dragging a run or a strength session in the week with strength makes it a drawn week and keeps the counts', () => {
    let m = setRunSettings(setPrimary(start(), 'hybrid', TODAY), { runsWanted: 3 });
    m = applyStrengthPlan(setStrengthTime(m, { strengthNow: 2 }));
    const n = m.strength.perWeek!;
    const week = autoWeek(weekInputOf(m.a, m.a.extras)).week;
    const isStrength = (d: { extras: string[] }) => d.extras.some((id) => ['lower', 'upper', 'full'].includes(id));
    const strengthDays = week.flatMap((d, i) => (isStrength(d) ? [i as Weekday] : []));
    expect(strengthDays.length).toBe(n);
    const free = ([0, 1, 2, 3, 4, 5, 6] as const).find((d) => !strengthDays.includes(d) && week[d].run === 'rest');
    expect(free).toBeDefined();
    const moved = moveInWeek(m, 'strength', strengthDays[0], free!);
    expect(moved.a.scheduleMode).toBe('custom');
    expect(moved.strength.perWeek).toBe(n);
    expect(isStrength(moved.a.customWeek![free!])).toBe(true);
    expect(moved.a.customWeek!.filter(isStrength).length).toBe(n);
    // a run moves too; the long run stays one
    const runDays = week.flatMap((d, i) => (d.run !== 'rest' ? [i as Weekday] : []));
    const restDay = ([0, 1, 2, 3, 4, 5, 6] as const).find((d) => week[d].run === 'rest' && d !== free)!;
    const again = moveInWeek(moved, 'run', runDays.find((d) => week[d].run !== 'long')!, restDay);
    expect(again.a.customWeek!.filter((d) => d.run !== 'rest').length).toBe(runDays.length);
    expect(again.a.customWeek!.filter((d) => d.run === 'long').length).toBe(1);
    // a day that already has that session, or no time, takes none
    expect(moveInWeek(m, 'strength', strengthDays[0], strengthDays[0])).toBe(m);
    const closed = setMinutes(m, free!, 0);
    expect(moveInWeek(closed, 'strength', closed.a.customWeek ? 0 : strengthDays[0], free!)).toBe(closed);
  });

  it('the share of running changes how many strength sessions come with the runs', () => {
    const base = (pct: number) => {
      let m = setRunSettings(setPrimary(start(), 'hybrid', TODAY), { runsWanted: 3 });
      m = setStrengthTime(m, { strengthNow: 4 });
      return applyStrengthPlan(setRunPct(m, pct, TODAY));
    };
    expect(base(100).strength.perWeek).toBe(0);
    // lifting four times now: the habit is kept (three), whatever the share
    expect(base(80).strength.perWeek).toBe(3);
    expect(base(50).strength.perWeek).toBe(3);
    // not lifting yet: the share decides, two more than now at most
    const fresh = (pct: number) => applyStrengthPlan(setRunPct(setStrengthTime(setRunSettings(setPrimary(start(), 'hybrid', TODAY), { runsWanted: 3 }), { strengthNow: 0 }), pct, TODAY));
    expect(fresh(80).strength.perWeek).toBe(1);
    expect(fresh(60).strength.perWeek).toBe(2);
    expect(fresh(50).strength.perWeek).toBe(2);
  });

  it('the number chosen in the plan is kept and used, and a new main goal starts from the recommendation again', () => {
    let m = setRunSettings(setPrimary(start(), 'running', TODAY), { runsWanted: 4 });
    m = applyStrengthPlan(setStrengthTime(m, { strengthNow: 3 }));
    // 3 times now, running first: still 3
    expect(m.strength.perWeek).toBe(3);
    m = setStrengthWanted(m, 2);
    expect(m.a.setup!.strengthWanted).toBe(2);
    expect(m.strength.perWeek).toBe(2);
    expect(strengthPerWeek(m.a.extras)).toBe(2);
    expect(finalize(m.a, m.strength, TODAY, NOW).prefs!.routines.length).toBeGreaterThan(0);
    expect(setStrengthWanted(m, null).strength.perWeek).toBe(3);
    // other answers change the recommendation: the choice is dropped
    expect(setPrimary(m, 'hybrid', TODAY).a.setup!.strengthWanted).toBeNull();
    expect(setRunPct(m, 60, TODAY).a.setup!.strengthWanted).toBeNull();
    expect(setStrengthTime(m, { strengthNow: 1 }).a.setup!.strengthWanted).toBeNull();
  });

  it('how long they have run sets level and experience', () => {
    const m = setRunStarted(start(), 'gt3y');
    expect(m.a.level).toBe('advanced');
    expect(m.a.setup!.experience).toBe('long');
    expect(setRunStarted(m, 'never').a.level).toBe('beginner');
    expect(setRunStarted(m, 'y1to3').a.level).toBe('intermediate');
  });

  it('the reference result anchors the paces', () => {
    const m = setRefRace(start(), { distance: '10k', timeS: 3000, date: '2026-09-01' });
    expect(m.a.recentRace).toEqual({ distanceM: 10_000, timeS: 3000, date: '2026-09-01' });
    expect(m.a.setup!.racesDone).toEqual([{ distance: '10k', pbS: 3000 }]);
    const none = setRefRace(m, null, true);
    expect(none.a.recentRace).toBeNull();
    expect(none.a.setup!.refNone).toBe(true);
  });
});

describe('strength settings follow the answers', () => {
  it('where they train gives the kinds and the usual equipment', () => {
    expect(kindsOfLocations(['gym'])).toEqual(['free', 'machines']);
    expect(kindsOfLocations(['homeGym', 'outdoor'])).toEqual(['free', 'bodyweight']);
    expect(gearFor(['bodyweight'])).toEqual(['bands']);
    expect(gearFor(['gym'])).toEqual(expect.arrayContaining(['barbell', 'rack', 'machines', 'pullup']));
    const m = setLocations(start(), ['homeGym']);
    expect(m.strength.styles).toEqual(['free']);
    expect(m.strength.equipment).toBe('free');
    expect(m.strength.gear).toEqual(['dumbbell', 'bench', 'kettlebell', 'bands']);
  });

  it('level, limits, goal, weights, caps and exclusions are derived', () => {
    let m = start();
    m = setup(m, {
      strengthXp: 'm6to24', injuriesNow: true, injuryAreas: ['knee', 'achilles'], injuriesPast: ['shoulder'], strengthGoals: ['maxStrength'],
      lifts: { squat: { kg: 100, reps: 5 } }, skills: { squat: 'unsure', pullup: 'ok' }, excluded: ['dips'], excludedNote: 'burpees, Plank', favorites: ['hip_thrust', 'dips'], weightUnit: 'lb',
    });
    const p = syncStrength(m.strength, m.a.setup!);
    expect(p.level).toBe('some');
    expect(p.avoid.sort()).toEqual(['knee', 'shoulder']);
    expect(p.goal).toBe('strong');
    expect(p.lifts.squat).toBeCloseTo(116.7, 1);
    expect(p.levelCaps).toEqual({ squat: 0, pull_v: 1 });
    expect(p.excluded).toEqual(expect.arrayContaining(['dips', 'plank']));
    expect(p.favorites).toEqual(['hip_thrust']);
    expect(p.weightUnit).toBe('lb');
    // nothing changed: the same object comes back (no needless updates)
    expect(syncStrength(p, m.a.setup!)).toBe(p);
  });

  it('pain right now counts only while there is pain', () => {
    expect(limitationsOf({ injuriesNow: false, injuryAreas: ['knee'], injuriesPast: [] })).toEqual([]);
    expect(limitationsOf({ injuriesNow: true, injuryAreas: ['back', 'hip'], injuriesPast: ['wrist'] }).sort()).toEqual(['back', 'wrist']);
  });

  it('the strength goal comes from what they want from lifting', () => {
    expect(strengthGoalOf({ strengthGoals: ['prevention'], primary: 'running' })).toBe('running');
    expect(strengthGoalOf({ strengthGoals: ['muscle', 'prevention'], primary: 'strength' })).toBe('muscle');
    expect(strengthGoalOf({ strengthGoals: [], primary: 'fitness' })).toBe('health');
    expect(strengthGoalOf({ strengthGoals: [], primary: 'running' })).toBe('running');
    expect(strengthGoalOf({ strengthGoals: ['functional'], primary: null })).toBe('health');
  });

  it('known lifts become one-repetition maximums', () => {
    expect(liftsToE1rm({ squat: { kg: 100, reps: 5 }, bench: { kg: 80, reps: 1 }, deadlift: { kg: null, reps: 5 } })).toEqual({ squat: 116.7, bench: 80 });
    expect(levelCapsOf({ deadlift: 'unsure', lunge: 'sure' })).toEqual({ hinge: 0 });
  });

  it('exercises named in free text are found by their English or German name', () => {
    const names = CATALOG.map((x) => ({ key: x.key, en: x.name, de: x.name }));
    expect(keysInText('plank, bird dog', names)).toEqual(expect.arrayContaining(['plank', 'bird_dog']));
    expect(keysInText('xx', names)).toEqual([]);
  });
});

describe('suggested workouts respect the answers', () => {
  const base = { equipment: 'mixed' as const, gear: ['barbell', 'rack', 'dumbbell', 'bench', 'pullup', 'cable', 'machines'] as never, avoid: [], goal: 'strong' as const, level: 'experienced' as const, minutes: 75 };
  const keys = (r: ReturnType<typeof suggestRoutine>) => r.exercises.map((x) => x.key);

  it('an excluded exercise never appears, in any session', () => {
    const all = (['lower', 'upper', 'full'] as const).flatMap((t) => keys(suggestRoutine(t, base)));
    expect(all).toContain('back_squat');
    const without = (['lower', 'upper', 'full'] as const).flatMap((t) => keys(suggestRoutine(t, { ...base, excluded: ['back_squat', 'bench_press'] })));
    expect(without).not.toContain('back_squat');
    expect(without).not.toContain('bench_press');
  });

  it('an unsure movement gets the easier versions', () => {
    expect(keys(suggestRoutine('lower', { ...base, levelCaps: { squat: 0 } }))).not.toContain('back_squat');
    expect(keys(suggestRoutine('lower', base))).toContain('back_squat');
  });

  it('a favourite is preferred over an equal choice', () => {
    const plain = keys(suggestRoutine('upper', { ...base, goal: 'muscle' }));
    expect(plain).not.toContain('cable_curl');
    const liked = keys(suggestRoutine('upper', { ...base, goal: 'muscle', favorites: ['cable_curl'] }));
    expect(liked).toContain('cable_curl');
  });

  it('the known lifts give the barbell exercises a starting weight', () => {
    const squat = CATALOG.find((x) => x.key === 'back_squat')!;
    expect(startingWeight(squat, '5', { squat: 120 })).toBe(92.5);
    expect(startingWeight(squat, '5', {})).toBeNull();
    expect(startingWeight(CATALOG.find((x) => x.key === 'goblet_squat')!, '8', { squat: 120 })).toBeNull();
    const r = suggestRoutine('lower', { ...base, lifts: { squat: 120, deadlift: 140 } });
    expect(r.exercises.find((x) => x.key === 'back_squat')?.kg).toBeGreaterThan(60);
  });

  it('TRX and a box open up exercises for people with that equipment', () => {
    const body = { equipment: 'bodyweight' as const, gear: ['trx', 'box'] as never, avoid: [], goal: 'health' as const, level: 'new' as const, minutes: 45 };
    const all = (['lower', 'upper', 'full'] as const).flatMap((t) => keys(suggestRoutine(t, body)));
    expect(all).toEqual(expect.arrayContaining(['trx_row']));
  });
});

describe('the engine keeps to the new answers', () => {
  const planFor = (a: OnboardingAnswers, perWeek: number) => {
    const { answers, prefs } = finalize(a, { ...normalizePrefs(null), perWeek, styles: ['free'], equipment: 'free', gear: ['dumbbell', 'bench'], goal: 'health', level: 'new', wrist: 'left' }, TODAY, NOW);
    return buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, prefs?.routines);
  };
  const hybrid = (patch: Partial<SetupExtras>): OnboardingAnswers => {
    let m = setRunSettings(setPrimary(start(), 'hybrid', TODAY), { runsWanted: 3 });
    m = applyStrengthPlan(setStrengthTime(setup(m, patch), { strengthNow: 2 }));
    return m.a;
  };

  it('minutes per day cap the sessions of that day', () => {
    const a = hybrid({});
    const open = buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);
    const capped = hybrid({ minutesPerDay: [30, 30, 30, 30, 30, null, null] });
    const plan = buildPlan(capped, assessFitness({ answers: capped, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);
    const longest = (w: typeof plan.workouts) => Math.max(0, ...w.filter((x) => weekdayOf(x.date) <= 4 && x.kind !== 'long').map((x) => x.duration_min ?? 0));
    expect(longest(plan.workouts)).toBeLessThanOrEqual(longest(open.workouts));
    expect(longest(plan.workouts)).toBeLessThanOrEqual(45);
  });

  it('breaks leave their days free and say so', () => {
    const a = hybrid({ breaks: [{ from: '2026-11-16', to: '2026-11-29' }] });
    const plan = buildPlan(a, assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);
    expect(plan.workouts.filter((w) => inBreak(w.date, [{ from: '2026-11-16', to: '2026-11-29' }]))).toEqual([]);
    expect(plan.warnings.some((w) => /planned breaks/.test(w))).toBe(true);
    expect(plan.workouts.some((w) => w.date > '2026-11-29')).toBe(true);
  });

  it('without double days a strength session never shares a day with a run', () => {
    const a = hybrid({ doubles: false });
    const plan = planFor(a, 2);
    const runDays = new Set(plan.workouts.filter((w) => w.distance_km && !w.kind.startsWith('strength')).map((w) => w.date));
    const clash = plan.workouts.filter((w) => w.kind.startsWith('strength_') && runDays.has(w.date));
    expect(clash).toEqual([]);
  });
});

describe('Garmin and the questionnaire', () => {
  const connection: GarminConnection = {
    user_id: 'u', status: 'connected', display_name: 'Ana', profile: { maxHr: 188, restingHr: 49, weightKg: 71.4, vo2max: 52 }, last_sync_at: '2026-11-06T08:00:00Z', last_sync_error: null, connected_at: '2026-11-06T07:00:00Z',
  };
  const run = (daysAgo: number, km: number): Activity => ({
    id: `r${daysAgo}`, user_id: 'u', source: 'garmin', external_id: null, name: null, sport: 'run', sub_type: null, start_time: '', local_date: new Date(Date.UTC(2026, 10, 6 - daysAgo)).toISOString().slice(0, 10),
    duration_s: km * 330, moving_s: km * 330, distance_m: km * 1000, avg_hr: 150, max_hr: 170, elevation_gain_m: null, calories: null, training_load: null, aerobic_te: null, vo2max: null,
  });
  const acts = [run(1, 8), run(4, 10), run(8, 12), run(12, 9)];

  it('reads only what the person allowed', () => {
    const all = readGarmin({ connection, activities: acts, metrics: [], today: TODAY });
    expect(Object.keys(all.values).sort()).toEqual(['longest', 'maxHr', 'restingHr', 'runsNow', 'vo2max', 'weeklyKm', 'weightKg']);
    expect(all.runCount).toBe(4);
    const some = readGarmin({ connection, activities: acts, metrics: [], today: TODAY, scopes: ['heart', 'sleep'] });
    expect(Object.keys(some.values).sort()).toEqual(['maxHr', 'restingHr']);
    expect(some.runCount).toBe(0);
    expect(readGarmin({ connection, activities: acts, metrics: [], today: TODAY, scopes: [] }).values).toEqual({});
  });

  it('VO2max is filled in, but not over a value the person typed', () => {
    const imp = readGarmin({ connection, activities: acts, metrics: [], today: TODAY });
    expect(applyGarmin(normalizeAnswers(null), imp).setup!.vo2max).toBe(52);
    const own = normalizeAnswers(null);
    own.setup!.vo2max = 48;
    expect(applyGarmin(own, imp).setup!.vo2max).toBe(48);
  });

  it('values the person wants to type themselves are taken back', () => {
    const filled = applyGarmin(normalizeAnswers(null), readGarmin({ connection, activities: acts, metrics: [], today: TODAY }));
    expect(filled.setup!.fromGarmin.length).toBeGreaterThan(3);
    const cleared = clearGarminValues(filled);
    expect(cleared.setup!.fromGarmin).toEqual([]);
    expect(cleared.setup!.restingHr).toBeNull();
    expect(cleared.setup!.hrSource.rest).toBeNull();
    expect(cleared.maxHr).toBeNull();
    expect(cleared.currentWeeklyKm).toBe(20);
  });
});

describe('the health check', () => {
  it('needs all four answers and flags any yes', () => {
    expect(parqAnswered({})).toBe(false);
    expect(parqAnswered({ heart: false, dizzy: false, chest: false, meds: false })).toBe(true);
    expect(parqFlagged({ heart: false, dizzy: false, chest: false, meds: false })).toBe(false);
    expect(parqFlagged({ heart: false, dizzy: true })).toBe(true);
  });
});
