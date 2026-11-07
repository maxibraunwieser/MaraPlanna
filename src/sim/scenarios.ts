// Prepared situations for the simulation: who the person is, what they answered, their plan and what they have lifted so far.
// Everything is built with the real planner functions, so the pages show what a real account would.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultAnswers, normalizeAnswers } from '../lib/answers';
import { addDays, mondayOf, todayISO } from '../lib/planner/dates';
import { assessFitness } from '../lib/planner/fitness';
import { buildPlan } from '../lib/planner/generate';
import { STRENGTH_TYPES, defaultGear, deriveEquipment, suggestAll, type Setup } from '../lib/strengthPlan';
import { setHasRace, setPlanWeeks, setPrimary } from '../lib/onboarding/apply';
import { EMPTY_PREFS, normalizePrefs, type Routine, type RoutineExercise, type StrengthPrefs } from '../../supabase/functions/_shared/strength';
import type { OnboardingAnswers } from '../lib/types';
import { blankStart } from '../lib/onboarding/seed';
import { SIM_USER } from './fakeSupabase';

type Tables = Record<string, Record<string, any>[]>;

export interface Scenario {
  id: string;
  label: string;
  about: string;
  /** Page to open first. */
  start: string;
  build: (today: string) => Tables;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function answers(today: string, over: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  const race = addDays(mondayOf(addDays(today, 18 * 7)), 6);
  return normalizeAnswers({
    ...defaultAnswers(),
    raceName: 'Vienna City Marathon',
    raceDate: race,
    goalType: 'time',
    goalTimeS: 3 * 3600 + 45 * 60,
    level: 'intermediate',
    yearsRunning: 4,
    marathonsCompleted: 1,
    currentWeeklyKm: 40,
    longestRecentRunKm: 18,
    runDaysPerWeek: 4,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    longRunDay: 6,
    extras: [
      { id: 'lower', type: 'lower', perWeek: 1 },
      { id: 'upper', type: 'upper', perWeek: 1 },
      { id: 'core', type: 'core', perWeek: 1 },
    ],
    age: 34,
    sex: 'male',
    ...over,
  });
}

const setupOf = (p: StrengthPrefs): Setup => ({ equipment: p.equipment, gear: p.gear, avoid: p.avoid, goal: p.goal, level: p.level, minutes: p.minutes });

function prefs(over: Partial<StrengthPrefs>, today: string): StrengthPrefs {
  const base: StrengthPrefs = {
    ...EMPTY_PREFS,
    wrist: 'left',
    styles: ['free'],
    equipment: 'free',
    perWeek: 2,
    gear: defaultGear('free'),
    goal: 'running',
    level: 'some',
    minutes: 45,
    savedAt: `${today}T08:00:00Z`,
    ...over,
  };
  return base;
}

/** The workouts a suggestion would give for these answers. */
const suggested = (p: StrengthPrefs, now: string): Routine[] => suggestAll(STRENGTH_TYPES.filter((t) => t !== 'full'), setupOf(p), [], now);

const withKg = (r: Routine, kg: Record<string, number>): Routine => ({
  ...r,
  by: 'own',
  exercises: r.exercises.map((x): RoutineExercise => (kg[x.key] ? { ...x, kg: kg[x.key] } : x)),
});

function planTables(a: OnboardingAnswers, p: StrengthPrefs | null, today: string): Tables {
  const assessment = assessFitness({ answers: a, activities: [], metrics: [], garmin: null, today });
  const gen = buildPlan(a, assessment, today, p?.routines);
  const planId = 'plan-sim';
  return {
    training_plans: [{
      id: planId, user_id: SIM_USER.id, status: 'active', race_name: a.raceName, race_date: a.raceDate, start_date: today,
      inputs: a, fitness: gen.fitness, weeks: gen.weeks, created_at: `${today}T08:00:00Z`, updated_at: `${today}T08:00:00Z`,
    }],
    planned_workouts: gen.workouts.map((w, i) => ({
      ...w, id: `w-${String(i).padStart(4, '0')}`, plan_id: planId, user_id: SIM_USER.id, status: 'planned', status_source: 'auto', activity_id: null,
      actual_distance_km: null, original_date: null, note: null,
    })),
  };
}

function profile(a: OnboardingAnswers | null, p: StrengthPrefs | null, today: string): Tables {
  return {
    profiles: [{
      id: SIM_USER.id, display_name: 'Sim Runner', units: a?.units ?? 'km', onboarding: a, onboarding_completed_at: a ? `${today}T08:00:00Z` : null,
      strength: p, updated_at: `${today}T08:00:00Z`,
    }],
    garmin_connections: [], activities: [], daily_metrics: [], plan_adjustments: [], strength_sets: [], calendar_feeds: [], watch_devices: [],
  };
}

// ---------------------------------------------------------------------------
// History: weeks of logged sets with progressive overload
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Lift {
  name: string;
  /** Library id; with viaWatch the sets look like the watch's (id only, source auto). */
  id?: string;
  viaWatch?: boolean;
  /** Weight in kg at the first week and the gain per week (0 = bodyweight: repetitions grow instead). */
  start: number;
  perWeek: number;
  reps: number;
  sets: number;
  /** Day of the week of the session this lift belongs to (0 = Monday). */
  day: number;
  /** Weeks (counted from the first) in which the weight does not change. */
  stall?: [number, number];
}

function history(today: string, weeks: number, lifts: Lift[], seed = 7, wrist: 'left' | 'right' = 'left'): Record<string, any>[] {
  const rand = rng(seed);
  const rows: Record<string, any>[] = [];
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const days = [...new Set(lifts.map((l) => l.day))].sort();
  for (let w = 0; w < weeks; w++) {
    // A lighter week every fifth week.
    const deload = (w + 1) % 5 === 0 && w < weeks - 1;
    for (const day of days) {
      const date = addDays(first, 7 * w + day);
      if (date > today) continue;
      const key = String(Math.floor(Date.parse(`${date}T17:30:00Z`) / 1000));
      let idx = 0;
      for (const l of lifts.filter((x) => x.day === day)) {
        const held = l.stall && w >= l.stall[0] && w <= l.stall[1] ? l.stall[0] : w;
        const raw = l.start + l.perWeek * (deload ? held - 1 : held);
        const kg = l.start > 0 ? Math.max(l.start, Math.round(raw / 2.5) * 2.5) : null;
        const extraReps = l.start === 0 ? Math.floor(w / 2) : 0;
        for (let s = 0; s < l.sets; s++) {
          // The last set is sometimes a rep short right after a weight increase.
          const short = rand() < 0.25 && s === l.sets - 1 ? 1 : 0;
          rows.push({
            id: `set-${rows.length}`, user_id: SIM_USER.id, session_key: key, idx: idx++, workout_id: null, local_date: date,
            started_at: new Date(Date.parse(`${date}T17:30:00Z`) + idx * 150_000).toISOString(), duration_s: null,
            exercise_id: l.id ?? null, exercise_name: l.viaWatch ? null : l.name, reps: l.reps + extraReps - short, weight_kg: kg,
            source: l.viaWatch ? 'auto' : 'plan', confidence: l.viaWatch ? 88 : null, wrist: l.viaWatch ? wrist : null, diag: null, created_at: `${date}T18:30:00Z`,
          });
        }
      }
    }
  }
  return rows;
}

const RUNNER_LIFTS: Lift[] = [
  { name: 'Back squat', id: 'squat', start: 60, perWeek: 2.5, reps: 5, sets: 4, day: 0 },
  { name: 'Romanian deadlift', id: 'deadlift', start: 55, perWeek: 2.5, reps: 6, sets: 3, day: 0 },
  { name: 'Dumbbell reverse lunge', id: 'lunge', start: 14, perWeek: 0.5, reps: 8, sets: 3, day: 0 },
  { name: 'Bench press', id: 'bench_press', viaWatch: true, start: 45, perWeek: 1.25, reps: 6, sets: 4, day: 3 },
  { name: 'Barbell row', id: 'row', start: 40, perWeek: 1.25, reps: 8, sets: 3, day: 3 },
  { name: 'Overhead press', id: 'shoulder_press', start: 27.5, perWeek: 0.625, reps: 6, sets: 3, day: 3 },
  { name: 'Pull-up', id: 'pull_up', start: 0, perWeek: 0, reps: 4, sets: 3, day: 3 },
];

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// A runner with five weeks behind them: runs linked to the plan, wellness data, Garmin connected
// ---------------------------------------------------------------------------

const RUN_KINDS = new Set(['easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout']);
const PACE_OF: Record<string, number> = { easy: 345, recovery: 375, long: 352, long_mp: 335, threshold: 298, intervals: 305, marathon_pace: 320, fartlek: 325, shakeout: 380 };

function runnerTables(today: string): Tables {
  const planStart = addDays(mondayOf(today), -35);
  const a = answers(today, { raceDate: addDays(mondayOf(today), 14 * 7 + 6), maxHr: 188 });
  const pr = prefs({}, today);
  const base: Tables = { ...profile(a, pr, today), ...planTables(a, pr, planStart) };
  const rand = rng(11);
  const activities: Record<string, any>[] = [];
  const planned = base.planned_workouts;
  planned.forEach((w, i) => {
    if (w.date >= today) return;
    if (!RUN_KINDS.has(w.kind)) {
      w.status = 'completed';
      return;
    }
    if (i % 9 === 4) {
      w.status = 'missed';
      return;
    }
    const km = Math.round((w.distance_km ?? 8) * (0.96 + rand() * 0.08) * 100) / 100;
    const pace = (PACE_OF[w.kind] ?? 350) * (0.98 + rand() * 0.04);
    const moving = Math.round(km * pace);
    const id = `act-${String(i).padStart(4, '0')}`;
    activities.push({
      id, user_id: SIM_USER.id, source: 'garmin', external_id: `g-${i}`, name: null, sport: 'run', sub_type: null,
      start_time: `${w.date}T06:30:00Z`, local_date: w.date, duration_s: moving + 40, moving_s: moving, distance_m: Math.round(km * 1000),
      avg_hr: Math.round(138 + (w.kind === 'easy' || w.kind === 'recovery' ? 0 : 18) + rand() * 6), max_hr: Math.round(158 + rand() * 20),
      elevation_gain_m: 30 + Math.round(rand() * 80), calories: Math.round(km * 62), training_load: null, aerobic_te: 2.5, vo2max: 52, details: null,
    });
    w.status = 'completed';
    w.status_source = 'auto';
    w.activity_id = id;
    w.actual_distance_km = km;
  });
  // Stream data for the latest runs, so the analysis page has charts.
  for (const act of activities.slice(-3)) {
    const total = act.moving_s as number;
    const speed = (act.distance_m as number) / total;
    const samples = Array.from({ length: Math.floor(total / 15) }, (_, k) => {
      const t = k * 15;
      return { t, d: Math.round(speed * t), hr: Math.round(act.avg_hr - 4 + (t / total) * 9 + rand() * 3), v: Math.round((speed + (rand() - 0.5) * 0.25) * 100) / 100, alt: 180 };
    });
    const lapKm = 1000;
    const laps = Array.from({ length: Math.floor((act.distance_m as number) / lapKm) }, (_, k) => ({
      startS: Math.round((k * lapKm) / speed), durationS: Math.round(lapKm / speed), distanceM: lapKm, avgSpeed: Math.round(speed * 100) / 100,
      avgHr: act.avg_hr, maxHr: act.max_hr, cadence: 172, intensity: 'active',
    }));
    act.details = { laps, samples };
  }
  const metrics = Array.from({ length: 30 }, (_, k) => {
    const date = addDays(today, -29 + k);
    return {
      user_id: SIM_USER.id, date, resting_hr: 50 + Math.round(rand() * 3) + (k === 29 ? 6 : 0), hrv_last_night: 62 - (k === 29 ? 14 : 0) + Math.round(rand() * 6),
      hrv_weekly_avg: 62, hrv_status: k === 29 ? 'LOW' : 'BALANCED', sleep_s: Math.round((7.2 - (k === 29 ? 1.6 : 0) + rand() * 0.6) * 3600),
      sleep_score: 78, stress_avg: 28, body_battery_high: k === 29 ? 38 : 82, body_battery_low: 18, steps: 9000,
    };
  });
  return {
    ...base,
    activities,
    daily_metrics: metrics,
    garmin_connections: [{
      user_id: SIM_USER.id, status: 'connected', display_name: 'Sim Runner', last_sync_at: new Date().toISOString(), last_sync_error: null,
      connected_at: `${planStart}T08:00:00Z`, profile: { vo2max: 52, maxHr: 188, restingHr: 51, lthr: 170 },
    }],
    plan_adjustments: [
      { id: 'adj-1', plan_id: 'plan-sim', user_id: SIM_USER.id, kind: 'created', message: `Plan created: ${base.training_plans[0].weeks.length} weeks to Vienna City Marathon.`, created_at: `${planStart}T08:00:00Z` },
      { id: 'adj-2', plan_id: 'plan-sim', user_id: SIM_USER.id, kind: 'missed', message: 'Missed "Easy run" on Wednesday – moved to today in place of an easy run.', created_at: `${addDays(today, -10)}T08:00:00Z` },
      { id: 'adj-3', plan_id: 'plan-sim', user_id: SIM_USER.id, kind: 'fitness', message: 'Your recent runs suggest your fitness improved (VDOT 41.5 → 42.3). Training paces were updated.', created_at: `${addDays(today, -3)}T08:00:00Z` },
    ],
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'runner',
    label: 'Runner, five weeks in',
    about: 'A marathon plan that started five weeks ago: runs linked to sessions, a missed one, wellness data (low readiness today), Garmin connected, plan adjustments.',
    start: '/',
    build: (today) => runnerTables(today),
  },
  {
    id: 'complete',
    label: 'Finished setup, every question answered',
    about: 'Someone who answered the whole questionnaire (hybrid, a half marathon, a Garmin watch, strength with known lifts and exclusions). Edit answers walks through every screen.',
    start: '/onboarding',
    build: (today) => {
      const p = prefs({ styles: ['free', 'machines'], equipment: 'mixed', gear: defaultGear('mixed'), goal: 'strong', level: 'some', minutes: 45, perWeek: 2, wrist: 'left', excluded: ['back_squat'], favorites: ['hip_thrust'], lifts: { squat: 110 } }, today);
      const base = answers(today, { goal: 'half', raceName: '', raceDistanceM: 21_097, goalType: 'finish', goalTimeS: null, runDaysPerWeek: 3 });
      const a: OnboardingAnswers = {
        ...base,
        setup: {
          ...base.setup!,
          name: 'Sim Runner', birthDate: '1989-03-03', heightCm: 178, weightKg: 72, gender: 'male', experience: 'some',
          consent: { health: true, analytics: false, at: `${today}T08:00:00Z` },
          bodyFatPct: 18, dailyActivity: 'mixed', sleep: 'h7to8',
          primary: 'hybrid', runPct: 60, hasRace: true, strengthGoals: ['maxStrength', 'prevention'], strengthNote: 'squat 1.5x body weight',
          hasGarmin: true, garmin: 'manual', garminModel: 'Forerunner 165', garminScopes: ['activities', 'heart', 'weight', 'status'], garminPush: true,
          runStarted: 'y1to3', intervals: 'rare', peakKm: 55, vo2max: 52, surfaces: ['road', 'trail'], refRace: { distance: '10k', timeS: 3000, date: null },
          racesDone: [{ distance: '10k', pbS: 3000 }], runsNow: 3, runsWanted: 3,
          strengthXp: 'm6to24', locations: ['gym', 'homeGym'], strengthNow: 2,
          daysAvail: [0, 1, 3, 4, 5, 6], unavailableDays: [2], minutesPerDay: [null, 45, 0, 60, null, null, null], restDays: [], runDays: [], doubles: true, doubleOrder: 'run',
          injuriesNow: true, injuryAreas: ['knee'], injuryDetail: { knee: { severity: 3, since: '2026-09-01' } }, injuriesPast: ['shoulder'],
          parq: { heart: false, dizzy: false, chest: false, meds: false }, pregnancy: null,
          motivation: ['health', 'fun'], structure: 'flexible', autoAdapt: true, notifications: { reminder: true, review: false, time: '08:00' },
        },
        availableDays: [0, 1, 3, 4, 5, 6],
      };
      return { ...profile(a, p, today), ...planTables(a, p, today) };
    },
  },
  {
    id: 'new',
    label: 'New account',
    about: 'Just registered: the questionnaire from the first question, including the strength questions.',
    start: '/onboarding',
    build: (today) => profile(null, null, today),
  },
  {
    id: 'new-partial',
    label: 'New account, Garmin knows little',
    about: 'The setup from the start; connecting Garmin works but only the VO2max and two runs come back.',
    start: '/onboarding?garmin=partial',
    build: (today) => profile(null, null, today),
  },
  {
    id: 'new-broken',
    label: 'New account, Garmin connection breaks',
    about: 'The setup from the start; Garmin accepts the key but the connection is unusable (retry / continue manually).',
    start: '/onboarding?garmin=broken',
    build: (today) => profile(null, null, today),
  },
  {
    id: 'new-refused',
    label: 'New account, Garmin refuses the key',
    about: 'The setup from the start; the key is refused with an error message.',
    start: '/onboarding?garmin=fail',
    build: (today) => profile(null, null, today),
  },
  {
    id: 'new-de',
    label: 'New account in German',
    about: 'The setup from the start with the page in German (the language can be switched at the top right).',
    start: '/onboarding?lang=de',
    build: (today) => profile(null, null, today),
  },
  {
    id: 'resume',
    label: 'Setup half done (saved draft)',
    about: 'A draft saved on the profile: consent, personal data and the main goal are done, the Garmin block is next.',
    start: '/onboarding',
    build: (today) => {
      const t = profile(null, null, today);
      const { answers, strength } = blankStart(null, today);
      const consent = { health: true, analytics: false, at: new Date().toISOString() };
      const filled = {
        ...answers,
        setup: { ...answers.setup!, consent, name: 'Sam', birthDate: '1991-04-12', heightCm: 178, weightKg: 74, gender: 'male' as const, injuriesNow: false, parq: { heart: false, dizzy: false, chest: false, meds: false } },
      };
      const m = setPlanWeeks(setHasRace(setPrimary({ a: filled, strength }, 'hybrid', today), false, today), 12, today);
      t.profiles[0].onboarding_draft = {
        v: 2, step: 'hasGarmin', done: ['consent', 'name', 'gender', 'body', 'lifestyle', 'dayMinutes', 'breaks', 'injuryNow', 'injuryPast', 'parq', 'goal', 'weighting', 'race', 'planLength'], answers: m.a, strength: m.strength, savedAt: new Date().toISOString(),
      };
      return t;
    },
  },
  {
    id: 'ready',
    label: 'Set up, nothing logged',
    about: 'Questionnaire done, suggested workouts, plan on the calendar, no sets recorded yet.',
    start: '/strength',
    build: (today) => {
      const p = prefs({}, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { equipment: deriveEquipment(p) });
      return { ...profile(a, p, today), ...planTables(a, p, today) };
    },
  },
  {
    id: 'history',
    label: '16 weeks of lifting',
    about: 'Two workouts a week for 16 weeks with progressive overload; bench press counted by the watch, the rest logged on the website.',
    start: '/strength?tab=progress',
    build: (today) => {
      const p = prefs({}, today);
      const kg = { back_squat: 95, rdl_bb: 85, reverse_lunge_db: 20, bench_press: 62.5, bb_row: 55, ohp: 37.5 };
      p.routines = suggested(p, `${today}T08:00:00Z`).map((r) => withKg(r, kg));
      const a = answers(today, { equipment: deriveEquipment(p) });
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 16, RUNNER_LIFTS) };
    },
  },
  {
    id: 'plateau',
    label: 'Stuck squat, new bench record',
    about: 'The squat has not moved for four weeks (the logger says: repeat the weight), the bench press just set a record.',
    start: '/strength?tab=progress',
    build: (today) => {
      const p = prefs({}, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { equipment: deriveEquipment(p) });
      const lifts = RUNNER_LIFTS.map((l) => (l.name === 'Back squat' ? { ...l, stall: [8, 11] as [number, number], perWeek: 2.5 } : l.name === 'Bench press' ? { ...l, perWeek: 1.75 } : l));
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 12, lifts, 21) };
    },
  },
  {
    id: 'knee',
    label: 'Home, sore knees and shoulder',
    about: 'Beginner at home with a few bands, health goal; knees and shoulders need care. Compare the suggestions with the gym scenarios.',
    start: '/strength',
    build: (today) => {
      const p = prefs({ styles: ['bodyweight'], equipment: 'bodyweight', gear: ['bands'], goal: 'health', level: 'new', minutes: 30, avoid: ['knee', 'shoulder'], wrist: 'right' }, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { level: 'beginner', equipment: deriveEquipment(p), currentWeeklyKm: 20, extras: [{ id: 'lower', type: 'lower', perWeek: 1 }, { id: 'upper', type: 'upper', perWeek: 1 }] });
      const lifts: Lift[] = [
        { name: 'Single-leg glute bridge', start: 0, perWeek: 0, reps: 8, sets: 2, day: 1 },
        { name: 'Push-up', id: 'pushup', start: 0, perWeek: 0, reps: 6, sets: 3, day: 4 },
        { name: 'Inverted row (table or bar)', id: 'row', start: 0, perWeek: 0, reps: 5, sets: 3, day: 4 },
      ];
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 6, lifts, 3, 'right') };
    },
  },
  {
    id: 'machines',
    label: 'Machines, build muscle',
    about: 'Commercial gym, machines only, new to lifting, goal muscle. Every suggested exercise is a machine or bodyweight movement.',
    start: '/strength',
    build: (today) => {
      const p = prefs({ styles: ['machines'], equipment: 'machines', gear: defaultGear('machines'), goal: 'muscle', level: 'new', minutes: 60, avoid: ['back'] }, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { equipment: deriveEquipment(p), extras: [{ id: 'lower', type: 'lower', perWeek: 1 }, { id: 'upper', type: 'upper', perWeek: 2 }] });
      const lifts: Lift[] = [
        { name: 'Leg press', id: 'leg_press', start: 80, perWeek: 5, reps: 10, sets: 3, day: 0 },
        { name: 'Chest press machine', id: 'bench_press', start: 30, perWeek: 2.5, reps: 10, sets: 3, day: 2 },
        { name: 'Lat pulldown', id: 'lat_pulldown', start: 35, perWeek: 2.5, reps: 10, sets: 3, day: 2 },
      ];
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 8, lifts, 11) };
    },
  },
  {
    id: 'lb',
    label: 'Pounds',
    about: 'Same lifter, but the weights are entered and shown in pounds (stored in kg).',
    start: '/strength?tab=progress',
    build: (today) => {
      const p = prefs({ weightUnit: 'lb' }, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { units: 'mi', equipment: deriveEquipment(p) });
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 10, RUNNER_LIFTS, 5) };
    },
  },
  {
    id: 'legacy',
    label: 'Existing user, no workouts yet',
    about: 'Set up before the new strength page: wrist and exercise list only, a few sets from the watch. The page offers the guided setup.',
    start: '/strength',
    build: (today) => {
      const p = normalizePrefs({ wrist: 'left', equipment: 'free', exercises: ['squat', 'bench_press', 'row'], weightUnit: 'kg', savedAt: `${today}T08:00:00Z` });
      const a = answers(today, { equipment: 'dumbbells' });
      const lifts: Lift[] = [
        { name: 'Squat', id: 'squat', viaWatch: true, start: 50, perWeek: 2.5, reps: 8, sets: 3, day: 1 },
        { name: 'Bench press', id: 'bench_press', viaWatch: true, start: 40, perWeek: 1.25, reps: 8, sets: 3, day: 1 },
      ];
      return { ...profile(a, p, today), ...planTables(a, p, today), strength_sets: history(today, 4, lifts, 9) };
    },
  },
  {
    id: 'no-plan',
    label: 'No training plan',
    about: 'Workouts and history exist but there is no marathon plan, so nothing is scheduled. Logging and progress still work.',
    start: '/strength',
    build: (today) => {
      const p = prefs({}, today);
      p.routines = suggested(p, `${today}T08:00:00Z`);
      const a = answers(today, { equipment: deriveEquipment(p) });
      return { ...profile(a, p, today), strength_sets: history(today, 6, RUNNER_LIFTS, 13) };
    },
  },
];

export const scenarioById = (id: string | null): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[1];

export const buildScenario = (id: string | null): Tables => scenarioById(id).build(todayISO());
