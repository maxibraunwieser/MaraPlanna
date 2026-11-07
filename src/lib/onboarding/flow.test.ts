import { describe, expect, it } from 'vitest';
import { normalizePrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import { en } from '../i18n/en';
import { de } from '../i18n/de';
import { format } from '../i18n';
import { assessFitness } from '../planner/fitness';
import { explainPlan } from '../planner/explain';
import { buildPlan } from '../planner/generate';
import { GOAL_KINDS } from '../planner/goals';
import { applyAutoWeek, applyManualWeek, autoWeek, weekInputOf, type DayState } from '../planner/week';
import { CATALOG } from '../strengthPlan';
import { weekdayOf } from '../planner/dates';
import { applyGoal } from './derive';
import { finalize } from './finalize';
import { blankStart, editStart } from './seed';
import { strengthExtras, withStrengthSessions } from './strengthMap';
import { ERROR_CODES, validateStep } from './validate';
import { SCREENS, visibleScreens } from './screens';
import {
  LOCATIONS, PARQ, PRIMARY_GOALS, REGIONS, RUN_STARTED, STRENGTH_GOALS, STRENGTH_XP,
} from './catalog';
import { GEAR } from '../../../supabase/functions/_shared/strength';
import type { GoalKind } from '../planner/goals';
import type { OnboardingAnswers, Profile, Weekday } from '../types';
import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';

const TODAY = '2026-11-06';
const NOW = '2026-11-06T10:00:00Z';

// ---------------------------------------------------------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------------------------------------------------------

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const have = (key: string) => key in en && key in de;

describe('texts', () => {
  it('German has every English key, and the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(de[key], key).toBeDefined();
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
      if (!['reality.verdict.none', 'proj.a.none'].includes(key)) {
        expect(en[key].trim().length, key).toBeGreaterThan(0);
        expect(de[key].trim().length, key).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('has a text for every key the screens build at run time', () => {
    const dynamic: string[] = [
      ...ERROR_CODES.map((c) => `err.${c}`),
      ...['male', 'female', 'diverse', 'none'].map((g) => `gender.${g}`),
      ...REGIONS.map((i) => `injury.${i}`),
      ...SCREENS.map((x) => x.id)
        .flatMap((id) => [`ob.t.${id}`, `ob.s.${id}`]),
      ...SCREENS.map((x) => `ob.block.${x.block}`),
      ...PRIMARY_GOALS.flatMap((g) => [`ob.goal.${g}`, `ob.goal.${g}.text`]),
      ...STRENGTH_GOALS.map((g) => `ob.sgoal.${g}`),
      ...RUN_STARTED.map((x) => `ob.run.started.${x}`),
      ...['never', 'rare', 'regular'].map((x) => `ob.run.intervals.${x}`),
      ...STRENGTH_XP.map((x) => `ob.sxp.${x}`),
      ...LOCATIONS.flatMap((x) => [`ob.loc.${x}`, `ob.loc.${x}.text`]),
      ...GEAR.map((x) => `sg.gear.${x}`),
      ...['run', 'strength', 'any'].map((x) => `ob.double.order.${x}`),
      ...PARQ.map((x) => `ob.parq.${x}`),
      ...['yes', 'no', 'none'].map((x) => `ob.preg.${x}`),
      ...['health', 'performance', 'looks', 'fun', 'competition', 'routine'].map((x) => `ob.motivation.${x}`),
      ...['strict', 'flexible'].flatMap((x) => [`ob.structure.${x}`, `ob.structure.${x}.text`]),
      ...['sitting', 'mixed', 'standing', 'heavy'].map((x) => `ob.activity.${x}`),
      ...['lt6', 'h6to7', 'h7to8', 'gt8'].map((x) => `ob.sleep.${x}`),
      ...['activities', 'heart', 'sleep', 'weight', 'status'].map((x) => `ob.garmin.scope.${x}`),
      ...['gym', 'dumbbells', 'bodyweight'].map((x) => `st.eq.${x}`),
      ...['5k', '10k', 'half', 'marathon'].map((r) => `race.${r}`),
      ...GOAL_KINDS.flatMap((g) => [`goal.${g}`, `goal.${g}.text`]),
      ...['strength', 'weight', 'injury'].map((g) => `secondary.${g}`),
      ...['easy', 'realistic', 'ambitious', 'stretch', 'none'].map((v) => `reality.verdict.${v}`),
      ...['garmin', 'karvonen', 'percent-max'].map((m) => `zones.${m}`),
      ...[1, 2, 3, 4, 5].map((z) => `zone.${z}`),
      ...['new', 'some', 'long'].flatMap((e) => [`experience.${e}`, `experience.${e}.text`]),
      ...['easy', 'mixed', 'structured'].flatMap((i) => [`intensity.${i}`, `intensity.${i}.text`]),
      ...['road', 'trail', 'treadmill', 'track'].map((x) => `surface.${x}`),
      ...[1, 2, 3, 4].map((n) => `strength.n${n}`),
      ...['lower', 'upper', 'full'].map((k) => `kind.${k}`),
      ...['easy', 'quality', 'long', 'recovery', 'rest'].map((r) => `run.${r}`),
      ...['rest', 'run', 'strength', 'both'].map((s) => `week.state.${s}`),
      ...['noLong', 'fewRuns', 'hardBackToBack', 'qualityBeforeLong', 'legsBeforeLong', 'legsOnLong', 'noRest', 'runsMismatch', 'strengthMismatch', 'unplaced'].map((k) => `week.issue.${k}`),
      ...['morning', 'noon', 'evening'].map((x) => `time.${x}`),
      ...['base', 'build', 'peak', 'taper'].map((p) => `phase.${p}`),
      ...['easy', 'long', 'marathon', 'threshold', 'interval'].map((z) => `pace.${z}`),
    ];
    for (const key of dynamic) expect(have(key), key).toBe(true);
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(format('Step {n} of {total}', { n: 2, total: 6 })).toBe('Step 2 of 6');
    expect(format('Hi {name}', {})).toBe('Hi {name}');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Starting points
// ---------------------------------------------------------------------------------------------------------------------------

const profile = (over: Partial<Profile> = {}): Profile => ({ id: 'u', display_name: null, units: 'km', onboarding: null, onboarding_completed_at: null, ...over });

describe('starting points', () => {
  it('a new account starts blank: no goal, no date, metric units, nothing consented', () => {
    const start = blankStart(profile({ units: 'mi' }), TODAY);
    expect(start.answers.units).toBe('km');
    expect(start.answers.setup).toMatchObject({ weightUnit: 'kg', heightUnit: 'm', primary: null, hasRace: null, hasGarmin: null, injuriesNow: null, parq: {} });
    expect(start.answers.setup!.consent).toEqual({ health: false, analytics: false, at: null });
    expect(start.strength.weightUnit).toBe('kg');
    expect(start.answers.goal).toBeUndefined();
    expect(start.answers.raceDate).toBe('');
    expect(start.strength.perWeek).toBeNull();
    expect(start.answers.extras).toEqual([]);
  });

  it('a returning user keeps their answers and gets the newer questions answered from the older ones', () => {
    const old = normalizeAnswers({
      raceName: 'Vienna', raceDate: '2027-04-18', level: 'advanced', sex: 'female', runDaysPerWeek: 5,
      recentRace: { distanceM: 21_097, timeS: 6300, date: '2026-09-01' }, maxHr: 186,
      extras: [{ id: 'lower', type: 'lower', perWeek: 1 }, { id: 'upper', type: 'upper', perWeek: 1 }],
    });
    const r = editStart(profile({ display_name: 'Ana', onboarding: old, onboarding_completed_at: NOW }), null, TODAY);
    expect(r.answers.raceName).toBe('Vienna');
    expect(r.answers.goal).toBe('marathon');
    expect(r.answers.setup).toMatchObject({ name: 'Ana', experience: 'long', gender: 'female', runsWanted: 5, garmin: 'manual' });
    expect(r.answers.setup!.racesDone).toEqual([{ distance: 'half', pbS: 6300 }]);
    expect(r.answers.setup!.hrSource.max).toBe('manual');
    expect(r.strength.perWeek).toBe(2);
    // the questions that came later are answered from the older answers, but consent and the health check are asked again
    expect(r.answers.setup).toMatchObject({ primary: 'running', hasRace: true, runStarted: 'gt3y', hasGarmin: null, injuriesNow: false, strengthNow: null, runDays: [] });
    expect(r.answers.setup!.refRace).toEqual({ distance: 'half', timeS: 6300, date: '2026-09-01' });
    expect(r.answers.setup!.consent.health).toBe(false);
    expect(r.answers.setup!.parq).toEqual({});
    expect(r.answers.setup!.runPct).toBe(71);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The whole setup, with and without Garmin
// ---------------------------------------------------------------------------------------------------------------------------

function filledIn(goal: GoalKind, over: { garmin?: boolean; perWeek?: number; unavailable?: number[]; manual?: boolean } = {}): { a: OnboardingAnswers; strength: StrengthPrefs } {
  const start = blankStart(profile(), TODAY);
  let a = start.answers;
  const raceGoal = ['race5k', 'race10k', 'half', 'marathon', 'faster'].includes(goal);
  const perWeekWanted = over.perWeek ?? 2;
  const unavailable = (over.unavailable ?? []) as Weekday[];
  a = {
    ...a,
    setup: {
      ...a.setup!, name: 'Ana', birthDate: '1990-05-05', heightCm: 170, weightKg: 65, gender: 'female', garmin: over.garmin ? 'connected' : 'manual', experience: 'some', unavailableDays: unavailable,
      consent: { health: true, analytics: false, at: NOW }, primary: goal === 'hybrid' ? 'hybrid' : goal === 'fitness' || goal === 'comeback' ? 'fitness' : 'running',
      runPct: perWeekWanted ? 50 : 100, hasRace: raceGoal, hasGarmin: !!over.garmin, runStarted: 'm6to12',
      strengthXp: 'lt6m', locations: ['gym'], strengthNow: perWeekWanted, daysAvail: ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !unavailable.includes(d)), minutesPerDay: [0, 1, 2, 3, 4, 5, 6].map((d) => (unavailable.includes(d as Weekday) ? 0 : null)),
      injuriesNow: false, parq: { heart: false, dizzy: false, chest: false, meds: false },
    },
  };
  a = { ...a, level: 'intermediate', yearsRunning: 1, runDaysPerWeek: 4, longRunDay: 6, currentWeeklyKm: 30, longestRecentRunKm: 12 };
  a = applyGoal(a, { goal, distanceM: goal === 'faster' ? 10_000 : null, date: ['race5k', 'race10k', 'half', 'marathon', 'faster'].includes(goal) ? '2027-03-14' : null, weeks: ['hybrid', 'fitness', 'comeback'].includes(goal) ? 12 : null, mode: 'finish', timeS: null }, TODAY);
  const perWeek = over.perWeek ?? 2;
  const strength: StrengthPrefs = { ...start.strength, perWeek, styles: perWeek ? ['free'] : [], equipment: perWeek ? 'free' : null, gear: perWeek ? ['barbell', 'rack', 'dumbbell', 'bench'] : [], goal: 'running', level: 'new', wrist: 'left' };
  a = { ...a, extras: withStrengthSessions(a.extras, perWeek) };
  a = over.manual ? applyManualWeek(a, ['strength', 'run', 'rest', 'run', 'both', 'rest', 'run'] as DayState[], 6) : applyAutoWeek(a, perWeek);
  return { a, strength };
}

describe('walking through the setup', () => {
  it.each(GOAL_KINDS)('%s: every screen passes its checks and the plan builds', (goal) => {
    for (const garmin of [false, true]) {
      const { a, strength } = filledIn(goal, { garmin });
      const problems = visibleScreens({ a, strength }).map((x) => [x.id, validateStep(x.id, a, strength, TODAY)] as const).filter(([, e]) => Object.keys(e).length);
      expect(problems, `${goal} garmin=${garmin}`).toEqual([]);
      const { answers, prefs } = finalize(a, strength, TODAY, NOW);
      const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, prefs?.routines);
      expect(plan.weeks.length).toBeGreaterThan(5);
      expect(plan.workouts.length).toBeGreaterThan(10);
      expect(prefs?.routines.every((r) => r.exercises.length > 0)).toBe(true);
    }
  });

  it('the first checks stop an empty setup', () => {
    const { answers } = blankStart(profile(), TODAY);
    const st = normalizePrefs(null);
    expect(validateStep('consent', answers, st, TODAY).consent).toBe('consent');
    expect(Object.keys(validateStep('name', answers, st, TODAY)).length).toBeGreaterThan(0);
    expect(validateStep('goal', answers, st, TODAY).goal).toBe('required');
    expect(validateStep('hasGarmin', answers, st, TODAY).hasGarmin).toBe('choose');
    expect(validateStep('parq', answers, st, TODAY).parq).toBe('required');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------------------------------------------------------

describe('finalize', () => {
  it('suggests a workout for every strength session and sets the equipment class', () => {
    const { a, strength } = filledIn('marathon', { perWeek: 3 });
    const { answers, prefs } = finalize(a, strength, TODAY, NOW);
    expect(prefs!.routines.map((r) => r.id).sort()).toEqual(['full', 'lower', 'upper']);
    expect(answers.equipment).toBe('gym');
    expect(prefs!.savedAt).toBe(NOW);
  });

  it('keeps a workout the person edited', () => {
    const { a, strength } = filledIn('marathon', { perWeek: 2 });
    const mine = { id: 'lower', by: 'own' as const, updatedAt: null, name: 'Leg day', exercises: [{ key: '', name: 'Sled push', sets: 5, reps: '20 m' }] };
    const { prefs } = finalize(a, { ...strength, routines: [mine] }, TODAY, NOW);
    expect(prefs!.routines.find((r) => r.id === 'lower')).toEqual(mine);
    expect(prefs!.routines.find((r) => r.id === 'upper')!.exercises.length).toBeGreaterThan(0);
  });

  it('no strength sessions: no strength in the plan and nothing saved', () => {
    const { a, strength } = filledIn('marathon', { perWeek: 0 });
    const { answers, prefs } = finalize(a, strength, TODAY, NOW);
    expect(prefs).toBeUndefined();
    expect(answers.extras.filter((e) => ['lower', 'upper', 'full'].includes(e.id))).toEqual([]);
    const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);
    expect(plan.workouts.some((w) => w.kind.startsWith('strength_'))).toBe(false);
  });

  it('a time goal keeps its time, a finish goal drops it', () => {
    const { a, strength } = filledIn('marathon');
    expect(finalize({ ...a, goalType: 'time', goalTimeS: 14_400 }, strength, TODAY, NOW).answers.goalTimeS).toBe(14_400);
    expect(finalize({ ...a, goalType: 'finish', goalTimeS: 14_400 }, strength, TODAY, NOW).answers.goalTimeS).toBeNull();
  });

  it('the manual week is kept as drawn', () => {
    const { a, strength } = filledIn('half', { manual: true });
    const { answers } = finalize(a, strength, TODAY, NOW);
    expect(answers.scheduleMode).toBe('custom');
    expect(answers.customWeek!.map((d) => d.run !== 'rest')).toEqual([false, true, false, true, true, false, true]);
    expect(answers.longRunDay).toBe(6);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The engine keeps to the week
// ---------------------------------------------------------------------------------------------------------------------------

describe('the plan keeps to the days chosen', () => {
  it('nothing is planned on the days the person cannot train', () => {
    for (const perWeek of [0, 2, 4]) {
      const { a, strength } = filledIn('marathon', { perWeek, unavailable: [1, 3] });
      const { answers, prefs } = finalize(a, strength, TODAY, NOW);
      const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, prefs?.routines);
      const on = plan.workouts.filter((w) => [1, 3].includes(weekdayOf(w.date)));
      expect(on, `perWeek=${perWeek}`).toEqual([]);
    }
  });

  it('every normal week keeps one day free when the person does not run on all seven days', () => {
    const { a, strength } = filledIn('marathon', { perWeek: 4 });
    const { answers, prefs } = finalize({ ...a, runDaysPerWeek: 5 }, strength, TODAY, NOW);
    const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, prefs?.routines);
    for (const w of plan.weeks.slice(1, -1)) {
      const days = new Set(plan.workouts.filter((x) => x.week === w.week).map((x) => x.date));
      expect(days.size, `week ${w.week}`).toBeLessThan(7);
    }
  });

  it('the planner week and the plan agree on the long run day', () => {
    const { a, strength } = filledIn('half', { unavailable: [6] });
    const { answers } = finalize(a, strength, TODAY, NOW);
    const week = autoWeek(weekInputOf(answers)).week;
    expect(week.findIndex((d) => d.run === 'long')).toBe(answers.longRunDay);
    expect(answers.longRunDay).not.toBe(6);
    expect(strengthExtras(2)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The explanation says what the plan does
// ---------------------------------------------------------------------------------------------------------------------------

describe('explanation', () => {
  it.each(GOAL_KINDS)('%s: every sentence has its text, its numbers are filled in and match the plan', (goal) => {
    const { a, strength } = filledIn(goal, { perWeek: 2 });
    const { answers, prefs } = finalize(goal === 'marathon' ? { ...a, goalType: 'time', goalTimeS: 14_400 } : a, strength, TODAY, NOW);
    const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY, prefs?.routines);
    const items = explainPlan({ answers, plan, units: 'km', today: TODAY });
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      for (const lang of [en, de]) {
        const text = lang[item.key as keyof typeof en];
        expect(text, item.key).toBeDefined();
        expect(format(text, item.params), item.key).not.toMatch(/\{\w+\}/);
      }
    }
    const find = (key: string) => items.find((i) => i.key === key)?.params;
    const phases = find('explain.phases')!;
    expect(phases.weeks).toBe(plan.weeks.length);
    expect(Number(phases.base) + Number(phases.build) + Number(phases.peak) + Number(phases.taper)).toBe(plan.weeks.length);
    for (const p of ['base', 'build', 'peak', 'taper'] as const) expect(phases[p]).toBe(plan.weeks.filter((w) => w.phase === p).length);
    const volume = find('explain.volume')!;
    const peak = plan.weeks.reduce((best, w) => (w.targetKm > best.targetKm ? w : best));
    expect(volume.week).toBe(peak.week);
    expect(volume.peak).toBe(`${Math.round(peak.targetKm)} km`);
    expect(find('explain.long')!.long).toBe(`${Math.round(Math.max(...plan.weeks.map((w) => w.longKm)))} km`);
    expect(Number(find('explain.strength')?.n ?? 0)).toBe(
      plan.workouts.filter((x) => x.week === plan.weeks.find((w) => !w.recovery && w.phase !== 'taper')!.week && x.kind.startsWith('strength_')).length,
    );
  });

  it('a time goal names the goal pace and the projection of the plan', () => {
    const { a, strength } = filledIn('marathon');
    const { answers } = finalize({ ...a, goalType: 'time', goalTimeS: 4 * 3600 }, strength, TODAY, NOW);
    const plan = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: TODAY }), TODAY);
    const t = explainPlan({ answers, plan, units: 'km', today: TODAY }).find((i) => i.key === 'explain.target')!;
    expect(t.params.goal).toBe('4:00:00');
    expect(String(t.params.pace)).toMatch(/^5:4\d \/km$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Exercise database
// ---------------------------------------------------------------------------------------------------------------------------

describe('exercise database', () => {
  it('every exercise has what suggestions and swaps rely on', () => {
    const keys = new Set<string>();
    for (const x of CATALOG) {
      expect(x.key.length, x.name).toBeGreaterThan(0);
      expect(keys.has(x.key), `duplicate key ${x.key}`).toBe(false);
      keys.add(x.key);
      expect(x.name.trim().length).toBeGreaterThan(2);
      expect(['main', 'accessory', 'core']).toContain(x.role);
      expect([0, 1, 2]).toContain(x.level);
    }
  });
});
