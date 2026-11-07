import { describe, expect, it } from 'vitest';
import { normalizePrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import { ageFromBirthDate, estimateMaxHr, hrProblems, hrZones } from '../hrZones';
import { assessFitness, garminPredictionVdot } from '../planner/fitness';
import { vdotFromEasyPace, paceAtFraction } from '../planner/vdot';
import { applyGoal, applyPersonal, applyRaces, endDateForWeeks, readGoal, runsRecommendation } from './derive';
import { checkGoal } from './goalCheck';
import { applyGarmin, readGarmin } from './garmin';
import { hasProgress, newDraft, newest, parseDraft } from './draft';
import { SCREENS, nextScreen, prevScreen, visibleScreens } from './screens';
import { validateStep } from './validate';
import type { Activity, DailyMetric, GarminConnection, OnboardingAnswers } from '../types';

const TODAY = '2026-11-06';
const fresh = (): OnboardingAnswers => normalizeAnswers(null);
const strength = () => normalizePrefs(null);
const withSetup = (a: OnboardingAnswers, patch: Partial<NonNullable<OnboardingAnswers['setup']>>): OnboardingAnswers => ({ ...a, setup: { ...a.setup!, ...patch } });

describe('heart-rate zones', () => {
  it('estimates the maximum from age', () => {
    expect(estimateMaxHr(30)).toBe(187);
    expect(estimateMaxHr(50)).toBe(173);
  });

  it('computes age from the birth date', () => {
    expect(ageFromBirthDate('1990-11-07', TODAY)).toBe(35);
    expect(ageFromBirthDate('1990-11-06', TODAY)).toBe(36);
    expect(ageFromBirthDate('nonsense', TODAY)).toBeNull();
    expect(ageFromBirthDate(null, TODAY)).toBeNull();
  });

  it('uses the reserve (Karvonen) with a resting heart rate, percent of maximum without', () => {
    const k = hrZones({ maxHr: 190, restingHr: 50 });
    expect(k.method).toBe('karvonen');
    expect(k.zones).toHaveLength(5);
    expect(k.zones[0].from).toBe(120);
    expect(k.zones[4].to).toBe(190);
    const p = hrZones({ maxHr: 190 });
    expect(p.method).toBe('percent-max');
    expect(p.zones[0].from).toBe(95);
  });

  it('zones do not overlap and rise', () => {
    for (const z of [hrZones({ maxHr: 185, restingHr: 55 }).zones, hrZones({ maxHr: 185 }).zones]) {
      for (let i = 1; i < z.length; i++) expect(z[i].from).toBe(z[i - 1].to + 1);
    }
  });

  it("Garmin's own zones win when they are valid", () => {
    const g = hrZones({ maxHr: 190, restingHr: 50, garminFloors: [100, 120, 140, 160, 175] });
    expect(g.method).toBe('garmin');
    expect(g.zones.map((z) => z.from)).toEqual([100, 120, 140, 160, 175]);
    expect(g.zones[0].to).toBe(119);
    expect(hrZones({ maxHr: 190, restingHr: 50, garminFloors: [100, 90, 140, 160, 175] }).method).toBe('karvonen');
  });

  it('flags implausible values', () => {
    expect(hrProblems(55, 185)).toEqual([]);
    expect(hrProblems(null, null)).toEqual([]);
    expect(hrProblems(25, 185)).toContain('restRange');
    expect(hrProblems(105, 185)).toContain('restRange');
    expect(hrProblems(55, 230)).toContain('maxRange');
    expect(hrProblems(55, 110)).toContain('maxRange');
    expect(hrProblems(90, 85)).toContain('maxBelowRest');
  });
});

describe('derive', () => {
  it('turns a date goal into the engine fields', () => {
    const a = applyGoal(fresh(), { goal: 'half', date: '2027-03-14', weeks: null, mode: 'time', timeS: 6000 }, TODAY);
    expect(a.raceDate).toBe('2027-03-14');
    expect(a.planWeeks).toBeNull();
    expect(a.raceDistanceM).toBe(21_097);
    expect(a.goalType).toBe('time');
    expect(a.goalTimeS).toBe(6000);
  });

  it('turns "no date yet" into a plan length that ends on a Sunday', () => {
    for (const weeks of [8, 12, 16, 20]) {
      const a = applyGoal(fresh(), { goal: 'marathon', date: null, weeks, mode: 'finish', timeS: null }, TODAY);
      expect(a.planWeeks).toBe(weeks);
      expect(new Date(`${a.raceDate}T00:00:00Z`).getUTCDay()).toBe(0);
    }
    expect(endDateForWeeks(8, TODAY)).toBe('2026-12-27');
  });

  it('ignores a finish time for plans without a race and reads the goal back', () => {
    const a = applyGoal(fresh(), { goal: 'fitness', date: null, weeks: 12, mode: 'time', timeS: 3000 }, TODAY);
    expect(a.goalType).toBe('finish');
    expect(a.goalTimeS).toBeNull();
    expect(readGoal(a).goal).toBe('fitness');
    expect(readGoal(a).weeks).toBe(12);
  });

  it('takes the best result of the longest distance as the recent race', () => {
    const a = applyRaces(withSetup(fresh(), { racesDone: [{ distance: '10k', pbS: 2900 }, { distance: 'half', pbS: 6300 }, { distance: '5k', pbS: null }] }));
    expect(a.recentRace).toMatchObject({ distanceM: 21_097, timeS: 6300 });
    expect(applyRaces(withSetup(fresh(), { racesDone: [{ distance: '5k', pbS: null }] })).recentRace).toBeNull();
    expect(applyRaces(withSetup(fresh(), { racesDone: [{ distance: 'marathon', pbS: null }] })).marathonsCompleted).toBe(1);
  });

  it('estimates the maximum heart rate from age and marks it, but keeps a measured one', () => {
    const est = applyPersonal(withSetup(fresh(), { birthDate: '1990-01-01' }), TODAY);
    expect(est.maxHr).toBe(estimateMaxHr(36));
    expect(est.setup!.hrSource.max).toBe('estimated');
    const typed = applyPersonal({ ...withSetup(fresh(), { birthDate: '1990-01-01', hrSource: { rest: null, max: 'manual' } }), maxHr: 195 }, TODAY);
    expect(typed.maxHr).toBe(195);
    expect(typed.setup!.hrSource.max).toBe('manual');
  });

  it('recommends more runs for longer races and fewer for beginners', () => {
    expect(runsRecommendation('marathon', 'intermediate')[1]).toBeGreaterThanOrEqual(runsRecommendation('race5k', 'intermediate')[1]);
    expect(runsRecommendation('marathon', 'beginner')[1]).toBeLessThanOrEqual(runsRecommendation('marathon', 'advanced')[1]);
  });
});

describe('validation', () => {
  const personal = (patch = {}) => withSetup(fresh(), { name: 'Ana', birthDate: '1990-05-05', heightCm: 170, weightKg: 65, gender: 'female', ...patch });
  const v = (id: Parameters<typeof validateStep>[0], a: OnboardingAnswers, st = strength()) => validateStep(id, a, st, TODAY);

  it('the health consent is required, the analytics consent is not', () => {
    expect(v('consent', fresh()).consent).toBe('consent');
    expect(v('consent', withSetup(fresh(), { consent: { health: true, analytics: false, at: null } }))).toEqual({});
  });

  it('name and birth date: age 16 to 90', () => {
    expect(Object.keys(v('name', fresh())).sort()).toEqual(['birthDate', 'name']);
    expect(v('name', personal())).toEqual({});
    expect(v('name', personal({ birthDate: '2015-01-01' })).birthDate).toBe('birthRange');
    expect(v('name', personal({ birthDate: '2012-01-01' })).birthDate).toBe('birthRange');
    expect(v('name', personal({ birthDate: '2010-01-01' })).birthDate).toBeUndefined();
    expect(v('name', personal({ birthDate: '1930-01-01' })).birthDate).toBe('birthRange');
    expect(v('name', personal({ name: '   ' })).name).toBe('required');
  });

  it('sex is required (one of the four answers)', () => {
    expect(v('gender', fresh()).gender).toBe('choose');
    expect(v('gender', personal({ gender: 'none' }))).toEqual({});
  });

  it('height 120–230 cm, weight 30–250 kg, body fat 3–60 % is optional', () => {
    expect(Object.keys(v('body', fresh())).sort()).toEqual(['heightCm', 'weightKg']);
    expect(v('body', personal())).toEqual({});
    expect(v('body', personal({ weightKg: 29 })).weightKg).toBe('weightRange');
    expect(v('body', personal({ weightKg: 251 })).weightKg).toBe('weightRange');
    expect(v('body', personal({ weightKg: 30 })).weightKg).toBeUndefined();
    expect(v('body', personal({ heightCm: 119 })).heightCm).toBe('heightRange');
    expect(v('body', personal({ heightCm: 231 })).heightCm).toBe('heightRange');
    expect(v('body', personal({ heightCm: 120 })).heightCm).toBeUndefined();
    expect(v('body', personal({ bodyFatPct: 70 })).bodyFat).toBe('fatRange');
    expect(v('body', personal({ bodyFatPct: 18 }))).toEqual({});
  });

  it('the main goal is required', () => {
    expect(v('goal', fresh()).goal).toBe('required');
    expect(v('goal', withSetup(fresh(), { primary: 'hybrid' }))).toEqual({});
  });

  it('race details: a race distance, a date far enough away and not too far', () => {
    expect(v('raceDetails', fresh()).distance).toBe('choose');
    const soon = applyGoal(fresh(), { goal: 'marathon', date: '2026-11-10', weeks: null, mode: 'finish', timeS: null }, TODAY);
    expect(v('raceDetails', soon).date).toBe('dateSoon');
    const far = applyGoal(fresh(), { goal: 'marathon', date: '2029-03-14', weeks: null, mode: 'finish', timeS: null }, TODAY);
    expect(v('raceDetails', far).date).toBe('dateFar');
    const ok = applyGoal(fresh(), { goal: 'marathon', date: '2027-03-14', weeks: null, mode: 'finish', timeS: null }, TODAY);
    expect(v('raceDetails', ok)).toEqual({});
  });

  it('the target time has to be plausible for the distance', () => {
    const slow = applyGoal(fresh(), { goal: 'marathon', date: '2027-03-14', weeks: null, mode: 'time', timeS: 3600 }, TODAY);
    expect(v('raceTime', slow).time).toBe('timeRange');
    const ok = applyGoal(fresh(), { goal: 'marathon', date: '2027-03-14', weeks: null, mode: 'time', timeS: 3.5 * 3600 }, TODAY);
    expect(v('raceTime', { ...ok, goalTimeS: null }).time).toBe('required');
    expect(v('raceTime', ok)).toEqual({});
    expect(v('raceTime', { ...ok, goalType: 'finish' })).toEqual({});
  });

  it('the plan length has to be one the goal allows', () => {
    const hybrid = applyGoal(fresh(), { goal: 'hybrid', date: null, weeks: 12, mode: 'finish', timeS: null }, TODAY);
    expect(v('planLength', hybrid)).toEqual({});
    expect(v('planLength', { ...hybrid, planWeeks: 3 }).weeks).toBe('weeksRange');
  });

  it('Garmin: yes or no, and the connect screen needs a choice', () => {
    expect(v('hasGarmin', fresh()).hasGarmin).toBe('choose');
    expect(v('hasGarmin', withSetup(fresh(), { hasGarmin: false }))).toEqual({});
    expect(v('garminConnect', fresh()).garmin).toBe('choose');
    expect(v('garminConnect', withSetup(fresh(), { garmin: 'manual' }))).toEqual({});
  });

  it('running: the experience is required, volume numbers cannot be negative, a reference needs a time', () => {
    expect(v('runExperience', fresh()).runStarted).toBe('required');
    expect(v('runExperience', withSetup(fresh(), { runStarted: 'y1to3' }))).toEqual({});
    expect(v('runVolume', fresh())).toEqual({});
    expect(v('runVolume', { ...fresh(), currentWeeklyKm: -1 }).weeklyKm).toBe('negative');
    expect(v('runVolume', withSetup(fresh(), { runsNow: 15 })).runsNow).toBe('runsRange');
    expect(v('runReference', withSetup(fresh(), { refRace: { distance: '10k', timeS: null, date: null } })).time).toBe('required');
    expect(v('runReference', withSetup(fresh(), { refRace: { distance: '10k', timeS: 600, date: null } })).time).toBe('timeRange');
    expect(v('runReference', withSetup(fresh(), { refRace: { distance: '10k', timeS: 3000, date: null } }))).toEqual({});
    expect(v('runReference', withSetup(fresh(), { easyPaceS: 100 })).easyPace).toBe('paceRange');
  });

  it('heart rate: maximum above resting, VO2max plausible', () => {
    const a = withSetup({ ...fresh(), maxHr: 80 }, { restingHr: 90 });
    expect(Object.values(v('runHeart', a))).toContain('maxBelowRest');
    expect(v('runHeart', withSetup({ ...fresh(), maxHr: 185 }, { restingHr: 52 }))).toEqual({});
    expect(v('runHeart', withSetup(fresh(), { vo2max: 120 })).vo2max).toBe('vo2Range');
  });

  it('strength: experience, a place, equipment and how often they lift now', () => {
    expect(v('strExperience', fresh()).strengthXp).toBe('required');
    expect(v('strWhere', fresh()).locations).toBe('pickOne');
    expect(v('strEquipment', withSetup(fresh(), { locations: ['gym'] })).gear).toBe('pickOne');
    expect(v('strEquipment', withSetup(fresh(), { locations: ['bodyweight'] }))).toEqual({});
    expect(v('strEquipment', withSetup(fresh(), { locations: ['gym'] }), { ...strength(), gear: ['dumbbell'] })).toEqual({});
    expect(v('strFrequency', fresh()).strengthNow).toBe('required');
        expect(v('strWrist', fresh()).wrist).toBe('required');
    expect(v('strWrist', fresh(), { ...strength(), wrist: 'left' })).toEqual({});
  });

  it('everyday life: at least two days with time; breaks must make sense', () => {
    expect(v('dayMinutes', fresh())).toEqual({});
    expect(v('dayMinutes', withSetup(fresh(), { minutesPerDay: [0, 0, 0, 0, 0, 0, 60] })).days).toBe('fewDays');
    expect(v('dayMinutes', withSetup(fresh(), { minutesPerDay: [0, 0, 0, 0, 0, 45, 60] }))).toEqual({});
    expect(v('dayMinutes', withSetup(fresh(), { restDays: [0, 1, 2, 3, 4, 5] })).days).toBe('fewDays');
    expect(v('breaks', withSetup(fresh(), { breaks: [{ from: '2026-12-20', to: '2026-12-10' }] }))['break.0']).toBe('breakRange');
    expect(v('breaks', withSetup(fresh(), { breaks: [{ from: '2026-12-10', to: '' }] }))['break.0']).toBe('required');
    expect(v('breaks', withSetup(fresh(), { breaks: [{ from: '2026-12-10', to: '2026-12-20' }] }))).toEqual({});
  });

  it('running days: 2–7 runs, no more than the days with time, a long run on a free day', () => {
    expect(v('runDays', { ...fresh(), runDaysPerWeek: 1 }).runs).toBe('runsRange');
    expect(v('runDays', { ...fresh(), runDaysPerWeek: 5 })).toEqual({});
    const busy = withSetup({ ...fresh(), runDaysPerWeek: 5 }, { unavailableDays: [0, 1, 2, 3, 4] });
    expect(v('runDays', busy).runs).toBe('runsTooMany');
    expect(v('runDays', withSetup({ ...fresh(), longRunDay: 6 }, { unavailableDays: [6] })).longDay).toBe('longBlocked');
    expect(v('runDays', withSetup({ ...fresh(), longRunDay: 6 }, { unavailableDays: [6], longRunAny: true })).longDay).toBeUndefined();
  });

  it('health: the injury question and the four health questions are required', () => {
    expect(v('injuryNow', fresh()).injuriesNow).toBe('choose');
    expect(v('injuryNow', withSetup(fresh(), { injuriesNow: false }))).toEqual({});
    expect(v('injuryRegions', withSetup(fresh(), { injuriesNow: true })).areas).toBe('pickOne');
    expect(v('parq', fresh()).parq).toBe('required');
    expect(v('parq', withSetup(fresh(), { parq: { heart: false, dizzy: false, chest: false } })).parq).toBe('required');
    expect(v('parq', withSetup(fresh(), { parq: { heart: false, dizzy: false, chest: false, meds: true } }))).toEqual({});
  });

  it('a drawn week needs exactly one long run and two runs', () => {
    const week = (runs: ('rest' | 'easy' | 'long')[]) => runs.map((run) => ({ run, extras: [] as string[] }));
    const drawn = (w: ReturnType<typeof week>) => ({ ...fresh(), scheduleMode: 'custom' as const, customWeek: w });
    expect(v('runPlan', fresh())).toEqual({});
    expect(v('strengthPlan', drawn(week(['easy', 'rest', 'easy', 'rest', 'rest', 'rest', 'long'])))).toEqual({});
    expect(v('strengthPlan', drawn(week(['easy', 'rest', 'easy', 'rest', 'easy', 'rest', 'easy']))).longDay).toBe('pickLong');
    expect(v('strengthPlan', drawn(week(['long', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']))).runs).toBe('tooFewRuns');
  });
});

describe('Garmin import', () => {
  const connection = (profile: GarminConnection['profile'] = {}): GarminConnection => ({
    user_id: 'u', status: 'connected', display_name: 'Ana', profile, last_sync_at: '2026-11-06T08:00:00Z', last_sync_error: null, connected_at: '2026-11-06T07:59:00Z',
  });
  const run = (daysAgo: number, km: number, maxHr = 170): Activity => ({
    id: `r${daysAgo}-${km}`, user_id: 'u', source: 'garmin', external_id: null, name: null, sport: 'run', sub_type: null,
    start_time: '', local_date: new Date(Date.UTC(2026, 10, 6 - daysAgo)).toISOString().slice(0, 10), duration_s: km * 330, moving_s: km * 330,
    distance_m: km * 1000, avg_hr: 150, max_hr: maxHr, elevation_gain_m: null, calories: null, training_load: null, aerobic_te: null, vo2max: null,
  });
  const metric = (daysAgo: number, rhr: number | null): DailyMetric => ({
    date: new Date(Date.UTC(2026, 10, 6 - daysAgo)).toISOString().slice(0, 10), resting_hr: rhr, hrv_last_night: null, hrv_weekly_avg: null, hrv_status: null,
    sleep_s: null, sleep_score: null, stress_avg: null, body_battery_high: null, body_battery_low: null, steps: null,
  });

  it('reads nothing when Garmin is not connected', () => {
    const r = readGarmin({ connection: null, activities: [], metrics: [], today: TODAY });
    expect(r.values).toEqual({});
    expect(r.missing).toHaveLength(7);
  });

  it('averages the resting heart rate over 7 days and leaves out what has no data', () => {
    const r = readGarmin({ connection: connection({ maxHr: 188 }), activities: [], metrics: [metric(0, 50), metric(1, 52), metric(2, 54), metric(20, 80)], today: TODAY });
    expect(r.values.restingHr).toBe(52);
    expect(r.values.maxHr).toBe(188);
    expect(r.missing).toEqual(expect.arrayContaining(['weeklyKm', 'runsNow', 'longest', 'weightKg']));
    expect(r.missing).not.toContain('restingHr');
  });

  it('does not guess a maximum heart rate from single runs, and needs a few runs for the weekly numbers', () => {
    const acts = [run(1, 10, 181), run(5, 8, 176), run(9, 21), run(14, 10), run(20, 6)];
    const r = readGarmin({ connection: connection({}), activities: acts, metrics: [], today: TODAY });
    expect(r.values.maxHr).toBeUndefined();
    expect(r.missing).toContain('maxHr');
    expect(r.values.weeklyKm).toBe(14);
    expect(r.values.longest).toBe(21);
    expect(r.values.runsNow).toBe(1);
    expect(readGarmin({ connection: connection({}), activities: [run(1, 10), run(5, 8)], metrics: [], today: TODAY }).missing).toContain('weeklyKm');
  });

  it('fills the answers, marks the source, and never overwrites what the person typed', () => {
    const imp = { values: { restingHr: 51, maxHr: 186, weightKg: 70, weeklyKm: 30 }, missing: [], syncedAt: '2026-11-06T08:00:00Z', runCount: 12 } as ReturnType<typeof readGarmin>;
    const filled = applyGarmin(fresh(), imp);
    expect(filled.setup!.restingHr).toBe(51);
    expect(filled.maxHr).toBe(186);
    expect(filled.setup!.hrSource).toEqual({ rest: 'garmin', max: 'garmin' });
    expect(filled.setup!.fromGarmin).toEqual(expect.arrayContaining(['restingHr', 'maxHr', 'weightKg', 'weeklyKm']));
    expect(filled.setup!.garmin).toBe('connected');

    const mine = applyGarmin({ ...withSetup(fresh(), { restingHr: 60, weightKg: 82, hrSource: { rest: 'manual', max: null } }), maxHr: null }, imp);
    expect(mine.setup!.restingHr).toBe(60);
    expect(mine.setup!.weightKg).toBe(82);
    expect(mine.maxHr).toBe(186);

    // A later sync may update the values that came from Garmin.
    const again = applyGarmin(filled, { ...imp, values: { restingHr: 49 } });
    expect(again.setup!.restingHr).toBe(49);
  });
});

describe('fitness from what the person knows', () => {
  const base = (patch = {}) => assessFitness({ answers: withSetup(fresh(), patch), activities: [], metrics: [], garmin: null, today: TODAY });

  it('turns a comfortable pace into a VDOT and back', () => {
    const v = vdotFromEasyPace(360);
    expect(v).toBeGreaterThan(35);
    expect(v).toBeLessThan(50);
    expect(paceAtFraction(v, 0.66)).toBeCloseTo(360, 0);
    expect(vdotFromEasyPace(300)).toBeGreaterThan(vdotFromEasyPace(420));
  });

  it('uses the easy pace when nothing better is known, and says so', () => {
    const f = base({ easyPaceS: 330 });
    expect(f.vdotSource).toContain('comfortable pace');
    expect(f.vdot).toBeGreaterThan(base({ easyPaceS: 420 }).vdot);
    expect(base({}).vdotSource).toContain('typical');
  });

  it("uses Garmin's race predictions before the pace", () => {
    const garmin = { racePredictions: { '5k': 1380, '10k': 2880, half: 6300, marathon: 13_200 } };
    const f = assessFitness({ answers: withSetup(fresh(), { easyPaceS: 420 }), activities: [], metrics: [], garmin, today: TODAY });
    expect(f.vdotSource).toContain('Garmin');
    expect(garminPredictionVdot(garmin)).toBeGreaterThan(40);
    expect(garminPredictionVdot(null)).toBeNull();
  });
});

describe('goal reality check', () => {
  const fitness = { vdot: 42, weeklyKm: 35 };
  const marathon = (timeS: number, date = '2027-03-14') => applyGoal(fresh(), { goal: 'marathon', date, weeks: null, mode: 'time', timeS }, TODAY);

  it('has no check for plans without a race', () => {
    expect(checkGoal(applyGoal(fresh(), { goal: 'fitness', date: null, weeks: 12, mode: 'finish', timeS: null }, TODAY), fitness, TODAY)).toBeNull();
  });

  it('calls a goal far beyond the projection a stretch and a slow goal easy', () => {
    const stretch = checkGoal(marathon(2.5 * 3600), fitness, TODAY)!;
    expect(stretch.verdict).toBe('stretch');
    expect(stretch.range[0]).toBeLessThan(stretch.range[1]);
    const easy = checkGoal(marathon(6 * 3600), fitness, TODAY)!;
    expect(easy.verdict).toBe('easy');
  });

  it('gives the goal pace and the projection of the plan', () => {
    const c = checkGoal(marathon(4 * 3600), fitness, TODAY)!;
    expect(c.goalPaceS).toBeCloseTo((4 * 3600) / 42.195, 0);
    expect(c.predictedS).toBeGreaterThan(3 * 3600);
    expect(c.predictedS).toBeLessThan(6 * 3600);
  });

  it('warns when there is too little time for the distance', () => {
    expect(checkGoal(marathon(4 * 3600, '2026-12-20'), { vdot: 40, weeklyKm: 15 }, TODAY)!.tooShort).toBe(true);
    expect(checkGoal(marathon(4 * 3600, '2027-04-25'), { vdot: 40, weeklyKm: 40 }, TODAY)!.tooShort).toBe(false);
  });
});

describe('draft', () => {
  it('survives a round trip and repairs damaged saves', () => {
    const d = newDraft(withSetup(fresh(), { name: 'Ana' }));
    const back = parseDraft(JSON.parse(JSON.stringify(d)))!;
    expect(back.answers.setup!.name).toBe('Ana');
    expect(back.step).toBe('consent');
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ v: 99 })).toBeNull();
    const broken = parseDraft({ v: 2, step: 'nonsense', done: ['name', 'x'], answers: {}, strength: 5 })!;
    expect(broken.step).toBe('consent');
    expect(broken.done).toEqual(['name']);
    expect(parseDraft({ v: 1, step: 'goal', done: [], answers: {} })).toBeNull();
    expect(broken.strength.styles).toEqual([]);
  });

  it('prefers the newer copy and only asks to resume when something was entered', () => {
    const old = { ...newDraft(fresh()), savedAt: '2026-11-05T10:00:00Z' };
    const recent = { ...newDraft(fresh()), savedAt: '2026-11-06T10:00:00Z', step: 'goal' as const };
    expect(newest(old, recent)).toBe(recent);
    expect(newest(null, old)).toBe(old);
    expect(newest(null, null)).toBeNull();
    expect(hasProgress(newDraft(fresh()))).toBe(false);
    expect(hasProgress(recent)).toBe(true);
    expect(hasProgress(newDraft(withSetup(fresh(), { name: 'Ana' })))).toBe(true);
  });

  it('walks the screens and hides what does not apply', () => {
    const ctx = (setup = {}, perWeek: number | null = null) => ({ a: withSetup(fresh(), setup), strength: { ...strength(), perWeek } });
    const ids = (c: ReturnType<typeof ctx>) => visibleScreens(c).map((x) => x.id);
    // without a race: no race questions; with one: the plan length is not asked
    expect(ids(ctx({ hasRace: false }))).not.toContain('raceDetails');
    expect(ids(ctx({ hasRace: false }))).toContain('planLength');
    expect(ids(ctx({ hasRace: true }))).toEqual(expect.arrayContaining(['raceDetails', 'raceTime']));
    expect(ids(ctx({ hasRace: true }))).not.toContain('planLength');
    // no strength share: no strength block; no running share: no race questions
    expect(ids(ctx({ runPct: 100 })).filter((x) => x.startsWith('str'))).toEqual([]);
    expect(ids(ctx({ runPct: 0, hasRace: true }))).not.toContain('race');
    // Garmin: no watch, nothing to connect; connected: the review; the wrist only with a watch and strength
    expect(ids(ctx({ hasGarmin: false }))).not.toContain('garminConnect');
    expect(ids(ctx({ hasGarmin: true, garmin: 'manual' }))).not.toContain('garminReview');
    expect(ids(ctx({ hasGarmin: true, garmin: 'connected' }))).toContain('garminReview');
    expect(ids(ctx({ hasGarmin: true }))).toContain('strWrist');
    expect(ids(ctx({ hasGarmin: false }))).not.toContain('strWrist');
    // health: regions only when something hurts; pregnancy not for men; the workouts page needs strength sessions
    expect(ids(ctx({ injuriesNow: false }))).not.toContain('injuryRegions');
    expect(ids(ctx({ injuriesNow: true }))).toContain('injuryRegions');
    expect(ids(ctx({ gender: 'male' }))).not.toContain('pregnancy');
    expect(ids(ctx({ gender: 'female' }))).toContain('pregnancy');
    // the strength plan only exists with a strength share
    expect(ids(ctx({ runPct: 100 }))).not.toContain('strengthPlan');
    expect(ids(ctx({ runPct: 100 }))).toContain('runPlan');
    expect(ids(ctx({ runPct: 50 }))).toEqual(expect.arrayContaining(['double', 'strengthPlan']));
  });

  it('next and previous skip hidden screens; the overview follows the last one', () => {
    const c = { a: withSetup(fresh(), { hasGarmin: false, hasRace: false, runPct: 100 }), strength: { ...strength(), perWeek: 0 } };
    expect(nextScreen('hasGarmin', c)).toBe('motivation');
    expect(prevScreen('motivation', c)).toBe('hasGarmin');
    expect(nextScreen('runPlan', c)).toBe('preview');
    expect(prevScreen('preview', c)).toBe('runPlan');
    expect(prevScreen('consent', c)).toBeNull();
    expect(SCREENS[0].id).toBe('consent');
    expect(new Set(SCREENS.map((x) => x.id)).size).toBe(SCREENS.length);
  });

  it('the order: the person first, then the running plan, then the strength questions and the plan with strength', () => {
    const order = SCREENS.map((x) => x.block);
    const first = (b: string) => order.indexOf(b as never);
    expect(['welcome', 'personal', 'everyday', 'health', 'goal', 'garmin', 'prefs', 'running', 'strength'].map(first)).toEqual([...Array(9).keys()].map((_, i) => first(['welcome', 'personal', 'everyday', 'health', 'goal', 'garmin', 'prefs', 'running', 'strength'][i])));
    expect(first('everyday')).toBeLessThan(first('health'));
    expect(first('health')).toBeLessThan(first('running'));
    const ids = SCREENS.map((x) => x.id);
    expect(ids.indexOf('runDays')).toBeLessThan(ids.indexOf('runPlan'));
    expect(ids.indexOf('runPlan')).toBeLessThan(ids.indexOf('strExperience'));
    expect(ids.indexOf('strengthPlan')).toBe(ids.length - 1);
    for (const gone of ['days', 'longRun', 'strLifts', 'strSkills', 'strExclude', 'strStyle', 'workouts', 'week']) expect(ids).not.toContain(gone);
  });
});
