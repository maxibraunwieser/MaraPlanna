import { describe, expect, it } from 'vitest';
import { normalizeAnswers } from '../answers';
import { addDays, mondayOf, weekdayOf } from '../planner/dates';
import { assessFitness } from '../planner/fitness';
import { buildPlan } from '../planner/generate';
import { inputsWithStrength, keepRunPlan, keptStrengthSessions, keptWeekFor, moveKeptStrength, runSlotOf, storedRunWeek } from '../planner/keepRuns';
import { messageText } from '../../../supabase/functions/_shared/content';
import { applyStrengthPlan, settle, setStrengthWanted } from './apply';
import { finalize } from './finalize';
import { editStart, strengthStart } from './seed';
import { firstOfBlock, nextScreen, visibleBlocks, visibleScreens, type Ctx } from './screens';
import { validateStep } from './validate';
import type { OnboardingAnswers, PlannedWorkout, Profile, RunSlot, TrainingPlan, Weekday, WorkoutDraft } from '../types';

const TODAY = '2026-11-06';
const EARLIER = '2026-10-26';
const NOW = '2026-11-06T10:00:00Z';
const DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const profile = (onboarding: unknown): Profile => ({ id: 'u', display_name: 'Ana', units: 'km', onboarding, onboarding_completed_at: NOW, strength: null }) as unknown as Profile;
const assessOn = (a: OnboardingAnswers, today: string) => assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today });
const isStrength = (kind: string) => kind.startsWith('strength') || kind === 'core';
const isLegs = (kind: string) => kind === 'strength_lower' || kind === 'strength_full';
const RUN_SCREENS = ['race', 'raceDetails', 'raceTime', 'planLength', 'runExperience', 'runVolume', 'runReference', 'runHeart', 'runDays', 'runPlan'] as const;

const SCENARIOS: Record<string, Record<string, unknown>> = {
  'marathon, 4 runs': { raceName: 'Vienna', raceDate: '2027-04-18', level: 'intermediate', sex: 'female', runDaysPerWeek: 4, extras: [] },
  'marathon, 5 runs': { raceName: 'Berlin', raceDate: '2027-05-30', level: 'advanced', sex: 'male', runDaysPerWeek: 5, extras: [] },
  'half marathon, 3 runs': { raceName: 'Graz', raceDate: '2027-03-14', level: 'beginner', sex: 'female', runDaysPerWeek: 3, raceDistanceM: 21_097, goal: 'half', extras: [] },
  'no race, 3 runs': { goal: 'fitness', planWeeks: 12, level: 'beginner', sex: 'male', runDaysPerWeek: 3, extras: [] },
};

/** A running plan made earlier from other answers than the ones saved now, as the database has it (with the coach's changes). */
function storedPlan(saved: Record<string, unknown>, change?: (rows: PlannedWorkout[]) => PlannedWorkout[]) {
  const before = editStart(profile(normalizeAnswers(saved)), null, EARLIER);
  const f0 = finalize(before.answers, before.strength, EARLIER, NOW);
  const built = buildPlan(f0.answers, assessOn(f0.answers, EARLIER), EARLIER, f0.prefs?.routines);
  const plan = {
    id: 'p', user_id: 'u', status: 'active', race_name: f0.answers.raceName || null, race_date: f0.answers.raceDate, start_date: EARLIER,
    inputs: { ...f0.answers, noStridesDays: [1] }, fitness: built.fitness, weeks: built.weeks,
  } as unknown as TrainingPlan;
  let rows = built.workouts.map((w, i) => ({
    ...w, id: `w${i}`, plan_id: 'p', user_id: 'u', status: w.date < TODAY ? 'completed' : 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, original_date: null, note: null,
  })) as PlannedWorkout[];
  if (change) rows = change(rows);
  return { plan, rows };
}

/** The add-strength flow with "keep my running plan" for someone whose saved answers now differ from those of the stored plan. */
function addStrength(saved: Record<string, unknown>, extra: (a: OnboardingAnswers) => OnboardingAnswers = (a) => a) {
  const start = strengthStart(profile(normalizeAnswers(saved)), null, TODAY);
  const m = applyStrengthPlan(settle({ a: extra({ ...start.answers, setup: { ...start.answers.setup!, keepRunPlan: true } }), strength: start.strength }, TODAY));
  return finalize(m.a, m.strength, TODAY, NOW);
}

/** Everything that must hold for strength placed around a stored plan. */
function checkRules(rows: PlannedWorkout[], sessions: WorkoutDraft[]) {
  const rank: Record<RunSlot | 'race', number> = { rest: 0, recovery: 1, easy: 2, quality: 3, long: 4, race: 5 };
  const slots = new Map<string, RunSlot | 'race'>();
  for (const w of rows) {
    const s = runSlotOf(w.kind);
    if (s && rank[s] > rank[slots.get(w.date) ?? 'rest']) slots.set(w.date, s);
  }
  const last = rows.reduce((m, w) => (w.date > m ? w.date : m), TODAY);
  const dates = sessions.map((w) => w.date);
  expect(new Set(dates).size).toBe(dates.length);
  for (const w of sessions) {
    expect(isStrength(w.kind)).toBe(true);
    expect(w.date >= TODAY && w.date <= last).toBe(true);
    expect(['long', 'race']).not.toContain(slots.get(w.date));
    if (isLegs(w.kind)) {
      expect(['long', 'race', 'quality']).not.toContain(slots.get(addDays(w.date, 1)));
      expect(sessions.some((x) => isLegs(x.kind) && (x.date === addDays(w.date, 1) || x.date === addDays(w.date, -1)))).toBe(false);
    }
  }
}

describe('adding strength later: the running block asks whether to keep the running plan', () => {
  for (const [name, saved] of Object.entries(SCENARIOS)) {
    it(`${name}: the plan is shown with the question; "no" skips the running questions, "yes" starts at the first of them`, () => {
      const start = strengthStart(profile(normalizeAnswers(saved)), null, TODAY);
      expect(start.answers.setup!.runPct).toBeLessThan(100);
      expect(start.strength.perWeek).toBeNull();
      expect(start.answers.setup!.keepRunPlan).toBeNull();

      // not answered yet: the running block holds only the question, and it has to be answered
      const open: Ctx = { a: start.answers, strength: start.strength, addMode: true };
      const ids = visibleScreens(open).map((x) => x.id);
      expect(ids).toContain('runKeep');
      for (const run of RUN_SCREENS) expect(ids).not.toContain(run);
      expect(firstOfBlock('running', open)).toBe('runKeep');
      expect(validateStep('runKeep', start.answers, start.strength, TODAY)).toEqual({ keepRunPlan: 'choose' });

      // "no, keep it": straight on to the strength questions
      const keep: Ctx = { ...open, a: { ...start.answers, setup: { ...start.answers.setup!, keepRunPlan: true } } };
      expect(validateStep('runKeep', keep.a, keep.strength, TODAY)).toEqual({});
      expect(nextScreen('runKeep', keep)).toBe('strExperience');
      expect(visibleScreens(keep).filter((x) => x.block === 'running').map((x) => x.id)).toEqual(['runKeep']);
      for (const run of RUN_SCREENS) expect(visibleScreens(keep).map((x) => x.id)).not.toContain(run);
      expect(visibleBlocks(keep)).toContain('strength');

      // "yes, change it": the running questions from the first one
      const change: Ctx = { ...open, a: { ...start.answers, setup: { ...start.answers.setup!, keepRunPlan: false } } };
      expect(nextScreen('runKeep', change)).toBe('runExperience');
      expect(visibleScreens(change).map((x) => x.id)).toEqual(expect.arrayContaining(['runExperience', 'runVolume', 'runDays', 'runPlan']));
    });
  }

  it('without a running plan to keep the question does not come up', () => {
    const start = strengthStart(profile(normalizeAnswers(SCENARIOS['marathon, 4 runs'])), null, TODAY);
    const ids = visibleScreens({ a: start.answers, strength: start.strength }).map((x) => x.id);
    expect(ids).not.toContain('runKeep');
    expect(ids).toContain('runExperience');
  });

  it('the plan message is translated', () => {
    expect(messageText('Strength added: 2 per week. Your running plan stays as it is.', 'de')).toBe('Kraft hinzugefügt: 2 pro Woche. Dein Laufplan bleibt unverändert.');
  });
});

describe('the usual week of a stored running plan', () => {
  const row = (date: string, kind: PlannedWorkout['kind']) => ({ id: date + kind, date, kind, status: 'planned' }) as PlannedWorkout;
  const weekOf = (monday: string, kinds: Partial<Record<Weekday, PlannedWorkout['kind']>>) => Object.entries(kinds).map(([d, k]) => row(addDays(monday, Number(d)), k!));

  it('takes for each weekday the run it has most often in the coming weeks, with one long run', () => {
    const m = mondayOf(TODAY);
    const rows = [
      ...weekOf(m, { 1: 'intervals', 2: 'easy', 4: 'easy', 6: 'long' }),
      ...weekOf(addDays(m, 7), { 1: 'threshold', 2: 'easy', 4: 'easy', 6: 'long' }),
      // the coach moved one easy run from Wednesday to Thursday
      ...weekOf(addDays(m, 14), { 1: 'intervals', 3: 'easy', 4: 'easy', 6: 'long_mp' }),
    ];
    expect(storedRunWeek(rows, TODAY)!.map((d) => d.run)).toEqual(['rest', 'quality', 'easy', 'rest', 'easy', 'rest', 'long']);
  });

  it('leaves out the race week, and a plan without runs has no week', () => {
    const m = mondayOf(TODAY);
    const rows = [...weekOf(m, { 0: 'easy', 2: 'easy', 5: 'long' }), ...weekOf(addDays(m, 7), { 0: 'easy', 1: 'easy', 2: 'shakeout', 3: 'race' })];
    expect(storedRunWeek(rows, TODAY)!.map((d) => d.run)).toEqual(['easy', 'rest', 'easy', 'rest', 'rest', 'long', 'rest']);
    expect(storedRunWeek([], TODAY)).toBeNull();
  });
});

describe('strength added around a running plan that stays exactly as it is', () => {
  // The plan was made with the long run on Saturday; the answers saved now would put it on Sunday with five runs.
  const OLD: Record<string, unknown> = { ...SCENARIOS['marathon, 4 runs'], longRunDay: 5, setup: { longRunAny: false } };
  const NEW: Record<string, unknown> = { ...SCENARIOS['marathon, 4 runs'], runDaysPerWeek: 5, longRunDay: 6, setup: { longRunAny: false } };

  it('the week shown is the stored one: the runs from the database, the strength days around them', () => {
    const { rows } = storedPlan(OLD);
    const f1 = addStrength(NEW);
    const runWeek = storedRunWeek(rows, TODAY)!;
    expect(runWeek[5].run).toBe('long');
    const kept = keptWeekFor(f1.answers, rows, TODAY)!;
    expect(kept.week.map((d) => d.run)).toEqual(runWeek.map((d) => d.run));
    // the saved answers alone would give another week (the one the person must not get)
    const generated = buildPlan(f1.answers, assessOn(f1.answers, TODAY), TODAY, f1.prefs?.routines);
    expect(generated.workouts.some((w) => w.kind === 'long' && weekdayOf(w.date) === 6)).toBe(true);

    const strengthDays = DAYS.filter((d) => kept.week[d].extras.some((x) => ['lower', 'upper', 'full'].includes(x)));
    expect(strengthDays.length).toBeGreaterThan(0);
    expect(strengthDays).not.toContain(5);
    for (const d of strengthDays) {
      if (kept.week[d].extras.includes('lower') || kept.week[d].extras.includes('full')) expect(['long', 'quality']).not.toContain(kept.week[(d + 1) % 7].run);
    }
  });

  it("every stored workout stays as it is (the coach's changes too); strength joins only from today, by the rules", () => {
    const { plan, rows } = storedPlan(OLD, (r) => r.map((w, i) => (i === 7 ? { ...w, title: 'Coach changed', distance_km: 7 } : w)));
    const f1 = addStrength(NEW);
    const kept = keptWeekFor(f1.answers, rows, TODAY)!;
    const sessions = keptStrengthSessions(plan, rows, f1.answers, f1.prefs?.routines, kept.week, TODAY);
    const result = keepRunPlan(plan, rows, sessions, TODAY);

    expect(result.weeks).toBe(plan.weeks);
    expect(result.fitness).toBe(plan.fitness);
    expect(result.workouts.filter((w) => !isStrength(w.kind))).toEqual(rows.filter((w) => !isStrength(w.kind)));
    expect(result.workouts.some((w) => w.title === 'Coach changed')).toBe(true);

    expect(sessions.length).toBeGreaterThan(10);
    checkRules(rows, sessions);
    // the sessions keep to the weekdays of the week shown, unless the runs of a week did not allow it
    const shown = new Set(DAYS.filter((d) => kept.week[d].extras.length));
    expect(sessions.filter((w) => shown.has(weekdayOf(w.date))).length / sessions.length).toBeGreaterThan(0.8);
    // no strength in the race week
    const race = rows.find((w) => w.kind === 'race')!;
    expect(sessions.some((w) => mondayOf(w.date) === mondayOf(race.date))).toBe(false);
  });

  it('a run the coach moved in one week moves the strength of that week out of its way', () => {
    // two weeks from now the long run is on Friday instead of Saturday
    const target = addDays(mondayOf(TODAY), 14);
    const { plan, rows } = storedPlan(OLD, (r) => r.map((w) => (w.kind === 'long' && mondayOf(w.date) === target ? { ...w, date: addDays(w.date, -1), original_date: w.date } : w)));
    const f1 = addStrength(NEW);
    const kept = keptWeekFor(f1.answers, rows, TODAY)!;
    const sessions = keptStrengthSessions(plan, rows, f1.answers, f1.prefs?.routines, kept.week, TODAY);
    checkRules(rows, sessions);
    const moved = rows.find((w) => w.kind === 'long' && mondayOf(w.date) === target)!;
    expect(weekdayOf(moved.date)).toBe(4);
    expect(sessions.some((w) => w.date === moved.date)).toBe(false);
    expect(sessions.some((w) => isLegs(w.kind) && w.date === addDays(moved.date, -1))).toBe(false);
  });

  it('days without time stay free, and without double days no strength goes on a run day', () => {
    const { plan, rows } = storedPlan(OLD);
    const f1 = addStrength(NEW, (a) => ({ ...a, setup: { ...a.setup!, doubles: false, minutesPerDay: [0, 60, 60, 60, 60, null, null] } }));
    const kept = keptWeekFor(f1.answers, rows, TODAY)!;
    const sessions = keptStrengthSessions(plan, rows, f1.answers, f1.prefs?.routines, kept.week, TODAY);
    expect(sessions.length).toBeGreaterThan(0);
    checkRules(rows, sessions);
    const runDates = new Set(rows.filter((w) => runSlotOf(w.kind)).map((w) => w.date));
    for (const w of sessions) {
      expect(weekdayOf(w.date)).not.toBe(0);
      expect(runDates.has(w.date)).toBe(false);
    }
  });

  for (const [name, saved] of Object.entries(SCENARIOS)) {
    it(`${name}: the stored runs stay identical and the rules hold`, () => {
      const { plan, rows } = storedPlan(saved);
      const f1 = addStrength(saved);
      const kept = keptWeekFor(f1.answers, rows, TODAY)!;
      const sessions = keptStrengthSessions(plan, rows, f1.answers, f1.prefs?.routines, kept.week, TODAY);
      expect(sessions.length).toBeGreaterThan(0);
      checkRules(rows, sessions);
      expect(keepRunPlan(plan, rows, sessions, TODAY).workouts.filter((w) => !isStrength(w.kind))).toEqual(rows.filter((w) => !isStrength(w.kind)));
    });
  }

  for (const n of [2, 3]) {
    it(`${n} sessions a week: the leg and upper-body days follow the rules around the stored runs`, () => {
      const { plan, rows } = storedPlan(OLD);
      const start = strengthStart(profile(normalizeAnswers(NEW)), null, TODAY);
      const m = setStrengthWanted(applyStrengthPlan(settle({ a: { ...start.answers, setup: { ...start.answers.setup!, keepRunPlan: true } }, strength: start.strength }, TODAY)), n);
      const f = finalize(m.a, m.strength, TODAY, NOW);
      const kept = keptWeekFor(f.answers, rows, TODAY)!;
      expect(kept.week.flatMap((d) => d.extras.filter((x) => ['lower', 'upper', 'full'].includes(x))).length + kept.unplaced).toBe(n);
      const sessions = keptStrengthSessions(plan, rows, f.answers, f.prefs?.routines, kept.week, TODAY);
      checkRules(rows, sessions);
      // a normal week (not recovery, taper or race week) gets every session that fits the week shown
      const normal = plan.weeks.find((w) => w.startDate > TODAY && !w.recovery && w.phase !== 'taper')!;
      expect(sessions.filter((w) => w.week === normal.week).length).toBe(n - kept.unplaced);
      expect(keepRunPlan(plan, rows, sessions, TODAY).workouts.filter((w) => !isStrength(w.kind))).toEqual(rows.filter((w) => !isStrength(w.kind)));
    });
  }

  it('setting strength up again replaces only the open strength sessions; done ones stay', () => {
    const { plan, rows } = storedPlan(OLD);
    const f1 = addStrength(NEW);
    const kept = keptWeekFor(f1.answers, rows, TODAY)!;
    const first = keptStrengthSessions(plan, rows, f1.answers, f1.prefs?.routines, kept.week, TODAY);
    const done = { ...first[0], date: addDays(TODAY, -2), id: 'old', plan_id: 'p', user_id: 'u', status: 'completed' } as PlannedWorkout;
    const open = first.slice(1).map((w, i) => ({ ...w, id: `s${i}`, plan_id: 'p', user_id: 'u', status: 'planned' }) as PlannedWorkout);
    const result = keepRunPlan(plan, [...rows, done, ...open], first, TODAY);
    expect(result.workouts).toContainEqual(done);
    expect(result.workouts.filter((w) => (w as PlannedWorkout).id?.startsWith('s'))).toEqual([]);
  });

  it('a strength session moved on the week stays there; another number of sessions gives a new week', () => {
    const { rows } = storedPlan(OLD);
    const f1 = addStrength(NEW);
    const auto = keptWeekFor(f1.answers, rows, TODAY)!.week;
    const from = auto.findIndex((d) => d.extras.some((x) => ['lower', 'upper', 'full'].includes(x))) as Weekday;
    const id = auto[from].extras.find((x) => ['lower', 'upper', 'full'].includes(x))!;
    const to = DAYS.find((d) => d !== from && auto[d].run !== 'long' && !auto[d].extras.length)!;
    const moved = moveKeptStrength(auto, from, to, []);
    expect(moved[to].extras).toContain(id);
    expect(moved[from].extras).not.toContain(id);
    expect(moved.map((d) => d.run)).toEqual(auto.map((d) => d.run));
    // never onto the long run or a day without time
    const long = auto.findIndex((d) => d.run === 'long') as Weekday;
    expect(moveKeptStrength(auto, from, long, [])).toBe(auto);
    expect(moveKeptStrength(auto, from, to, [to])).toBe(auto);

    const own = { ...f1.answers, setup: { ...f1.answers.setup!, keptWeek: moved } };
    expect(keptWeekFor(own, rows, TODAY)!.week).toBe(moved);
    const start = strengthStart(profile(normalizeAnswers(NEW)), null, TODAY);
    const m = setStrengthWanted(applyStrengthPlan(settle({ a: { ...start.answers, setup: { ...start.answers.setup!, keepRunPlan: true, keptWeek: moved } }, strength: start.strength }, TODAY)), 2);
    const one = finalize(m.a, m.strength, TODAY, NOW);
    expect(keptWeekFor(one.answers, rows, TODAY)!.week).not.toBe(moved);
  });

  it("only the strength part of the stored inputs changes; the run part and the coach's changes stay", () => {
    const { plan } = storedPlan(OLD);
    const f1 = addStrength(NEW);
    const inputs = inputsWithStrength(plan.inputs, f1.answers);
    expect(inputs.noStridesDays).toEqual([1]);
    expect(inputs.runDaysPerWeek).toBe(plan.inputs.runDaysPerWeek);
    expect(inputs.longRunDay).toBe(5);
    expect(inputs.availableDays).toEqual(plan.inputs.availableDays);
    expect(inputs.raceDate).toBe(plan.inputs.raceDate);
    expect(inputs.extras).toEqual(f1.answers.extras);
  });
});
