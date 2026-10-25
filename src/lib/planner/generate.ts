// Marathon plan generator.
//
// Structure: base -> build -> peak -> taper, counted backwards from race day.
// Volume grows ≤6–10 %/week with a lighter week every 3rd/4th week, the long
// run grows ~2 km/week up to a time-capped peak, and quality sessions follow
// per-phase ladders. Paces come from VDOT (see vdot.ts).

import type {
  FitnessAssessment,
  Level,
  OnboardingAnswers,
  Phase,
  PlanFitness,
  Step,
  WeekSummary,
  Weekday,
  WorkoutDraft,
  WorkoutKind,
} from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { MARATHON_M, raceTimeForVdot, trainingPaces } from './vdot';
import { placeStrength, strengthSession, strengthTypesForWeek, type DayType } from './strength';
import { kmInZones, round05, workoutKm, workoutMinutes, zonePace } from './workouts';

export interface GeneratedPlan {
  fitness: PlanFitness;
  weeks: WeekSummary[];
  workouts: WorkoutDraft[];
  warnings: string[];
}

const LEVEL_PEAK_KM: Record<Level, number> = { beginner: 55, intermediate: 70, advanced: 90 };
const PER_RUN_DAY_CAP_KM: Record<Level, number> = { beginner: 14, intermediate: 16, advanced: 19 };
const LEVEL_LONG_KM: Record<Level, number> = { beginner: 30, intermediate: 32, advanced: 34 };
const MAX_EASY_KM: Record<Level, number> = { beginner: 12, intermediate: 16, advanced: 18 };
const WEEKLY_VDOT_GAIN: Record<Level, number> = { beginner: 0.2, intermediate: 0.12, advanced: 0.07 };
const APPROACH_VOLUME = { conservative: 0.85, balanced: 1, ambitious: 1.15 } as const;
const APPROACH_LONG = { conservative: -2, balanced: 0, ambitious: 2 } as const;
const MAX_WEEKLY_INCREASE = { conservative: 0.06, balanced: 0.08, ambitious: 0.1 } as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export function weekCount(planStart: string, raceDate: string): number {
  return Math.floor(daysBetween(planStart, raceDate) / 7) + 1;
}

export function assignPhases(n: number): Phase[] {
  const taper = n >= 16 ? 3 : n >= 9 ? 2 : 1;
  const rest = Math.max(0, n - taper);
  const peak = Math.round(rest * 0.2);
  const build = Math.round(rest * 0.4);
  const base = rest - peak - build;
  return [
    ...Array<Phase>(base).fill('base'),
    ...Array<Phase>(build).fill('build'),
    ...Array<Phase>(peak).fill('peak'),
    ...Array<Phase>(Math.min(n, taper)).fill('taper'),
  ];
}

export function peakVolume(answers: OnboardingAnswers, currentKm: number): number {
  const { level, approach, runDaysPerWeek } = answers;
  let peak = LEVEL_PEAK_KM[level] * APPROACH_VOLUME[approach];
  if (answers.goalType === 'time' && answers.goalTimeS && answers.goalTimeS <= 3 * 3600) peak = Math.max(peak, 85);
  if (answers.injuryProne) peak *= 0.9;
  // Few run days → each run (especially the long one) carries more volume.
  const perDay = PER_RUN_DAY_CAP_KM[level] + (runDaysPerWeek <= 3 ? 2 : 0);
  peak = Math.min(peak, runDaysPerWeek * perDay);
  peak = Math.max(peak, Math.min(currentKm * 1.1, runDaysPerWeek * PER_RUN_DAY_CAP_KM.advanced));
  return Math.round(peak);
}

/** Race-day projection and marathon-pace target. */
export function marathonTargets(answers: OnboardingAnswers, vdot: number, peakWeeklyKm: number, today: string) {
  const warnings: string[] = [];
  const weeksToRace = Math.max(0, daysBetween(today, answers.raceDate) / 7);
  const gain = Math.min(4, weeksToRace * WEEKLY_VDOT_GAIN[answers.level] * (answers.approach === 'conservative' ? 0.8 : 1));
  const volumeFactor = peakWeeklyKm >= 70 ? 1 : peakWeeklyKm >= 55 ? 1.015 : peakWeeklyKm >= 40 ? 1.035 : 1.06;
  const firstMarathon = answers.marathonsCompleted === 0 ? 1.02 : 1;
  const terrain = answers.raceTerrain === 'hilly' ? 1.03 : answers.raceTerrain === 'rolling' ? 1.01 : 1;
  const predicted = Math.round(raceTimeForVdot(vdot + gain, MARATHON_M) * volumeFactor * firstMarathon * terrain);

  let target = predicted;
  let goalAssessment: PlanFitness['goalAssessment'] = 'none';
  if (answers.goalType === 'time' && answers.goalTimeS) {
    const ratio = predicted / answers.goalTimeS;
    if (ratio <= 1.02) {
      goalAssessment = 'realistic';
      target = answers.goalTimeS;
    } else if (ratio <= 1.06) {
      goalAssessment = 'ambitious';
      target = Math.round((answers.goalTimeS + predicted) / 2);
      warnings.push('Your goal time is ambitious. Marathon-pace sessions start a bit slower than goal pace; they speed up if your runs show you are improving.');
    } else {
      goalAssessment = 'very_ambitious';
      warnings.push('Your goal time is a big stretch for your current fitness. Marathon-pace sessions use your projected pace instead; it is updated as your fitness improves.');
    }
  }
  return { predicted, target, goalAssessment, terrain, warnings };
}

/**
 * MP sessions run at the target pace, but never faster than what current
 * fitness supports – the pace speeds up as VDOT updates come in.
 */
function pacesFor(vdot: number, targetS: number, terrain: number) {
  const targetPace = targetS / (MARATHON_M / 1000) / terrain;
  const currentPace = raceTimeForVdot(vdot, MARATHON_M) / (MARATHON_M / 1000);
  const paces = trainingPaces(vdot, Math.max(targetPace, currentPace));
  paces.marathon = Math.min(paces.marathon, (paces.easy[0] + paces.easy[1]) / 2);
  return paces;
}

export function createPlanFitness(answers: OnboardingAnswers, fitness: FitnessAssessment, today: string) {
  const peakWeeklyKm = peakVolume(answers, fitness.weeklyKm);
  const t = marathonTargets(answers, fitness.vdot, peakWeeklyKm, today);
  const paces = pacesFor(fitness.vdot, t.target, t.terrain);

  const longPace = (paces.long[0] + paces.long[1]) / 2;
  const capMinutes = answers.level === 'advanced' ? 210 : 195;
  const peakLongKm = Math.round(
    clamp(Math.min(LEVEL_LONG_KM[answers.level] + APPROACH_LONG[answers.approach], (capMinutes * 60) / longPace), 24, 36),
  );

  const planFitness: PlanFitness = {
    vdot: fitness.vdot,
    vdotSource: fitness.vdotSource,
    paces,
    predictedMarathonS: t.predicted,
    targetMarathonS: t.target,
    goalAssessment: t.goalAssessment,
    startWeeklyKm: fitness.weeklyKm,
    peakWeeklyKm,
    peakLongKm,
    lastReplanAt: null,
    history: [{ date: today, vdot: fitness.vdot, reason: 'Plan created' }],
  };
  return { fitness: planFitness, warnings: t.warnings };
}

/** Recompute paces for a new VDOT, keeping volume targets. */
export function withNewVdot(fitness: PlanFitness, answers: OnboardingAnswers, vdot: number, today: string, reason: string): PlanFitness {
  const t = marathonTargets(answers, vdot, fitness.peakWeeklyKm, today);
  const paces = pacesFor(vdot, t.target, t.terrain);
  return {
    ...fitness,
    vdot: Math.round(vdot * 10) / 10,
    paces,
    predictedMarathonS: t.predicted,
    targetMarathonS: t.target,
    goalAssessment: t.goalAssessment,
    history: [...fitness.history, { date: today, vdot: Math.round(vdot * 10) / 10, reason }],
  };
}

// ---------------------------------------------------------------------------
// Weekly layout
// ---------------------------------------------------------------------------

export interface WeekLayout {
  runDays: Weekday[];
  quality: Weekday[];
  recoveryDay: Weekday | null;
  longDay: Weekday;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

const circularGap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
const adjacent = (a: number, b: number) => circularGap(a, b) === 1;

/** Lengths of consecutive-day runs in a (circular) week. */
function streaks(days: number[]): number[] {
  const set = new Set(days);
  if (set.size === 7) return [7];
  const start = [...Array(7).keys()].find((d) => !set.has(d))!;
  const out: number[] = [];
  let len = 0;
  for (let i = 1; i <= 7; i++) {
    if (set.has((start + i) % 7)) len++;
    else if (len) {
      out.push(len);
      len = 0;
    }
  }
  return out;
}

export function chooseLayout(availableDays: Weekday[], runDays: number, longDay: Weekday, quality: number): WeekLayout {
  const avail = [...new Set<Weekday>([...availableDays, longDay])].sort((a, b) => a - b);
  const n = clamp(runDays, 1, avail.length);
  const others = avail.filter((d) => d !== longDay);
  const dayAfterLong = ((longDay + 1) % 7) as Weekday;
  const dayBeforeLong = ((longDay + 6) % 7) as Weekday;

  let runSet: Weekday[] = [longDay];
  let best = Infinity;
  for (const combo of combinations(others, n - 1)) {
    const days = [...combo, longDay];
    let score = 0;
    for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) if (adjacent(days[i], days[j])) score += 10;
    // Long streaks of consecutive run days are worse than several short ones.
    for (const len of streaks(days)) if (len > 2) score += (len - 2) ** 2 * 5;
    if (combo.includes(dayAfterLong)) score += 2;
    if (combo.includes(dayBeforeLong)) score += 1;
    if (score < best) {
      best = score;
      runSet = days;
    }
  }
  runSet.sort((a, b) => a - b);

  const candidates = runSet.filter((d) => d !== longDay);
  const q = clamp(quality, 0, Math.max(0, candidates.length - (runSet.length >= 4 ? 1 : 0)));
  let qualityDays: Weekday[] = [];
  best = Infinity;
  for (const combo of combinations(candidates, q)) {
    let score = 0;
    for (const d of combo) {
      if (d === dayBeforeLong) score += 25;
      if (d === dayAfterLong) score += 20;
    }
    for (let i = 0; i < combo.length; i++)
      for (let j = i + 1; j < combo.length; j++) {
        if (adjacent(combo[i], combo[j])) score += 30;
        score -= circularGap(combo[i], combo[j]);
      }
    if (score < best) {
      best = score;
      qualityDays = combo;
    }
  }
  const recoveryDay = runSet.includes(dayAfterLong) && !qualityDays.includes(dayAfterLong) ? dayAfterLong : null;
  return { runDays: runSet, quality: [...qualityDays].sort((a, b) => a - b), recoveryDay, longDay };
}

function qualityCount(level: Level, phase: Phase, runDays: number, recovery: boolean): number {
  let q: number;
  if (phase === 'base') q = level === 'beginner' ? 0 : level === 'advanced' && runDays >= 6 ? 2 : 1;
  else if (phase === 'taper') q = level === 'advanced' && runDays >= 5 ? 2 : 1;
  else q = level === 'beginner' || runDays < 5 ? 1 : 2;
  if (recovery) q = Math.min(q, 1);
  return runDays <= 2 ? Math.min(q, 1) : q;
}

// ---------------------------------------------------------------------------
// Session builders
// ---------------------------------------------------------------------------

type SessionType = 'fartlek' | 'threshold' | 'threshold_light' | 'intervals' | 'mp' | 'easy_strides';

const FARTLEK: [number, number][] = [[6, 1], [8, 1], [10, 1], [5, 2], [6, 2], [8, 2]];
const THRESHOLD: [number, number][] = [
  [2, 1.5], [3, 1.5], [2, 2.5], [3, 2], [4, 2], [3, 3], [2, 4], [5, 2], [4, 2.5], [3, 3.5], [2, 5], [1, 8],
];
const INTERVALS: [number, number][] = [[5, 0.8], [5, 1], [6, 1], [5, 1.2], [4, 1.6], [6, 1.2], [5, 1.6]];
const MP_KM: Record<Level, number[]> = {
  beginner: [4, 5, 6, 7, 8, 10],
  intermediate: [6, 8, 10, 12, 14, 16],
  advanced: [8, 10, 12, 14, 16, 18],
};
const LEVEL_OFFSET: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 3 };

const warmup = (km = 2): Step => ({ type: 'run', label: 'Warm-up', zone: 'easy', distanceKm: km });
const cooldown = (km = 1.5): Step => ({ type: 'run', label: 'Cool-down', zone: 'easy', distanceKm: km });
const strides = (n = 6): Step => ({ type: 'run', label: 'Strides (20 s fast, relaxed)', zone: 'repetition', durationMin: 1 / 3, repeat: n, recoveryMin: 1 });

const repLabel = (km: number, metres: boolean) => (metres || km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

function mainStep(steps: Step[]) {
  return steps.find((s): s is Extract<Step, { type: 'run' }> => s.type === 'run' && s.label !== 'Warm-up' && s.label !== 'Cool-down');
}

function sessionTitle(kind: WorkoutKind, steps: Step[]): string {
  const m = mainStep(steps);
  if (!m) return 'Workout';
  const reps = m.repeat ?? 1;
  switch (kind) {
    case 'fartlek':
      return `Fartlek ${reps} × ${m.durationMin} min`;
    case 'threshold':
      return reps === 1 ? `Tempo run ${m.distanceKm} km` : `Threshold ${reps} × ${repLabel(m.distanceKm ?? 0, false)}`;
    case 'intervals':
      return `Intervals ${reps} × ${repLabel(m.distanceKm ?? 0, true)}`;
    case 'marathon_pace':
      return `Marathon pace ${m.distanceKm} km`;
    default:
      return 'Workout';
  }
}

/** Shrink the main set by one notch. Returns false when it can't shrink further. */
function shrink(steps: Step[]): boolean {
  const m = mainStep(steps);
  if (!m) return false;
  const reps = m.repeat ?? 1;
  if (reps > 2) {
    m.repeat = reps - 1;
    return true;
  }
  if (m.distanceKm !== undefined) {
    const min = reps === 1 ? 3 : 1;
    if (m.distanceKm - 0.5 >= min) {
      m.distanceKm -= reps === 1 ? 1 : 0.5;
      m.distanceKm = Math.max(min, m.distanceKm);
      return true;
    }
  }
  if (m.durationMin !== undefined && m.durationMin > 1) {
    m.durationMin -= 1;
    return true;
  }
  return false;
}

/** Fit a session into a time budget: shorter warm-up/cool-down first, then a smaller main set. */
function fitToMinutes(steps: Step[], paces: PlanFitness['paces'], minutes: number) {
  if (workoutMinutes(steps, paces) <= minutes) return;
  for (const s of steps) {
    if (s.type === 'run' && s.label === 'Warm-up') s.distanceKm = Math.min(s.distanceKm ?? 2, 1.5);
    if (s.type === 'run' && s.label === 'Cool-down') s.distanceKm = 1;
  }
  while (workoutMinutes(steps, paces) > minutes && shrink(steps));
}

interface SessionCtx {
  level: Level;
  phase: Phase;
  pIdx: number;
  bpIdx: number;
  weeksToRace: number;
}

function buildSession(type: Exclude<SessionType, 'easy_strides'>, c: SessionCtx): { kind: WorkoutKind; steps: Step[] } {
  switch (type) {
    case 'fartlek': {
      const [reps, min] = FARTLEK[Math.min(c.pIdx, FARTLEK.length - 1)];
      return {
        kind: 'fartlek',
        steps: [warmup(), { type: 'run', label: 'Fast', zone: 'interval', durationMin: min, repeat: reps, recoveryMin: min }, cooldown()],
      };
    }
    case 'threshold':
    case 'threshold_light': {
      const idx = type === 'threshold_light' ? 1 : c.phase === 'base' ? Math.min(c.pIdx, 2) : LEVEL_OFFSET[c.level] + c.bpIdx;
      const [reps, km] = c.phase === 'taper' ? THRESHOLD[1] : THRESHOLD[Math.min(idx, THRESHOLD.length - 1)];
      return {
        kind: 'threshold',
        steps: [warmup(), { type: 'run', label: 'Threshold', zone: 'threshold', distanceKm: km, repeat: reps, recoveryMin: 2 }, cooldown()],
      };
    }
    case 'intervals': {
      const idx = Math.floor(c.bpIdx / 2) + (c.level === 'advanced' ? 1 : 0);
      const [reps, km] = INTERVALS[Math.min(idx, INTERVALS.length - 1)];
      return {
        kind: 'intervals',
        steps: [warmup(2.5), { type: 'run', label: 'Interval', zone: 'interval', distanceKm: km, repeat: reps, recoveryKm: 0.4 }, cooldown()],
      };
    }
    case 'mp': {
      const ladder = MP_KM[c.level];
      const km =
        c.phase === 'taper'
          ? c.weeksToRace >= 2
            ? ladder[2]
            : ladder[1]
          : ladder[Math.min(Math.floor(c.bpIdx / 2), ladder.length - 1)];
      return {
        kind: 'marathon_pace',
        steps: [warmup(), { type: 'run', label: 'Marathon pace', zone: 'marathon', distanceKm: km }, cooldown()],
      };
    }
  }
}

function longRun(km: number, mpKm: number): { kind: WorkoutKind; title: string; steps: Step[] } {
  if (mpKm > 0) {
    return {
      kind: 'long_mp',
      title: `Long run with ${mpKm} km @ marathon pace`,
      steps: [
        { type: 'run', label: 'Easy', zone: 'long', distanceKm: km - mpKm },
        { type: 'run', label: 'Marathon pace finish', zone: 'marathon', distanceKm: mpKm },
      ],
    };
  }
  return { kind: 'long', title: 'Long run', steps: [{ type: 'run', label: 'Long run', zone: 'long', distanceKm: km }] };
}

function easyRun(km: number, withStrides: boolean): { kind: WorkoutKind; title: string; steps: Step[] } {
  const steps: Step[] = [{ type: 'run', label: 'Easy', zone: 'easy', distanceKm: km }];
  if (withStrides) steps.push(strides());
  return { kind: 'easy', title: withStrides ? 'Easy run + strides' : 'Easy run', steps };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface GenerateContext {
  answers: OnboardingAnswers;
  fitness: PlanFitness;
  /** Monday of week 1 */
  planStart: string;
  /** First date that may receive workouts (today, or the re-plan date). */
  firstDate: string;
  startKm: number;
  startLongKm: number;
}

export function generateWeeks(ctx: GenerateContext): { weeks: WeekSummary[]; workouts: WorkoutDraft[]; warnings: string[] } {
  const { answers, fitness, planStart, firstDate } = ctx;
  const { level, runDaysPerWeek: runDays, longRunDay: longDay } = answers;
  const raceDate = answers.raceDate;
  const paces = fitness.paces;
  const warnings: string[] = [];

  const n = weekCount(planStart, raceDate);
  const phases = assignPhases(n);
  const phaseOf = (w: number) => phases[w - 1];
  const firstTaper = phases.indexOf('taper') + 1;
  const taperWeeks = n - firstTaper + 1;
  const cycle = answers.injuryProne || answers.approach === 'conservative' || (answers.age ?? 0) >= 50 ? 3 : 4;
  const fromWeek = Math.max(1, Math.floor(daysBetween(planStart, firstDate) / 7) + 1);
  const recoveryAbs = (w: number) => w > 1 && w < firstTaper - 1 && w % cycle === 0;
  const isRecovery = (w: number) => w !== fromWeek && recoveryAbs(w);
  const countBefore = (w: number, inPhase: (p: Phase) => boolean) => {
    let c = 0;
    for (let i = 1; i < w; i++) if (inPhase(phaseOf(i)) && !recoveryAbs(i)) c++;
    return c;
  };

  if (n < 8) warnings.push(`Only ${n} weeks until race day – the plan focuses on arriving healthy rather than building a lot of new fitness.`);

  // Volume progression
  const startKm = Math.max(ctx.startKm, runDays * 3, 10);
  const peakKm = Math.max(fitness.peakWeeklyKm, startKm);
  let progWeeks = 0;
  for (let w = fromWeek; w < firstTaper; w++) if (!isRecovery(w)) progWeeks++;
  const maxRate = answers.injuryProne ? Math.min(0.06, MAX_WEEKLY_INCREASE[answers.approach]) : MAX_WEEKLY_INCREASE[answers.approach];
  const rate = clamp(Math.pow(peakKm / startKm, 1 / Math.max(1, progWeeks - 2)) - 1, 0, maxRate);

  const longStep = level === 'beginner' ? 1.5 : 2;
  const fracCap = runDays <= 3 ? 0.6 : runDays === 4 ? 0.5 : runDays === 5 ? 0.45 : 0.4;
  const startLong = clamp(ctx.startLongKm || startKm * 0.3, 6, fitness.peakLongKm);
  const easyPace = zonePace(paces, 'easy');
  const weekdayCap = answers.weekdayMaxMinutes;
  const cappedDay = (d: number) => !!weekdayCap && d <= 4 && d !== longDay;

  const layouts = new Map<number, WeekLayout>();
  const layoutFor = (q: number) => {
    if (!layouts.has(q)) layouts.set(q, chooseLayout(answers.availableDays, runDays, longDay, q));
    return layouts.get(q)!;
  };

  let prog = startKm;
  let maxVol = startKm;
  let longProg = startLong;
  let maxLong = startLong;
  const weeks: WeekSummary[] = [];
  const workouts: WorkoutDraft[] = [];

  for (let w = fromWeek; w <= n; w++) {
    const weekStart = addDays(planStart, (w - 1) * 7);
    const phase = phaseOf(w);
    const recovery = isRecovery(w);
    const weekWorkouts: WorkoutDraft[] = [];
    const push = (day: number, d: Omit<WorkoutDraft, 'date' | 'week' | 'phase'>) => {
      const date = addDays(weekStart, day);
      if (date < firstDate || date > raceDate) return;
      weekWorkouts.push({ ...d, date, week: w, phase });
    };
    const runDraft = (kind: WorkoutKind, title: string, steps: Step[], key: boolean) => ({
      kind,
      title,
      steps,
      distance_km: round05(workoutKm(steps, paces)),
      duration_min: Math.round(workoutMinutes(steps, paces)),
      key_session: key,
    });

    if (w === n) {
      // Race week: short sharpeners relative to race day.
      const raceDay = daysBetween(weekStart, raceDate);
      const items: { offset: number; minDays: number; build: () => Omit<WorkoutDraft, 'date' | 'week' | 'phase'> }[] = [
        { offset: -6, minDays: 4, build: () => { const e = easyRun(6, true); return runDraft(e.kind, e.title, e.steps, false); } },
        {
          offset: -4,
          minDays: 3,
          build: () =>
            runDraft('marathon_pace', 'Race-pace sharpener', [warmup(), { type: 'run', label: 'Marathon pace', zone: 'marathon', distanceKm: 3 }, cooldown()], false),
        },
        { offset: -3, minDays: 5, build: () => { const e = easyRun(5, false); return runDraft(e.kind, e.title, e.steps, false); } },
        {
          offset: -1,
          minDays: 4,
          build: () =>
            runDraft('shakeout', 'Shakeout run', [{ type: 'run', label: 'Very easy', zone: 'recovery', distanceKm: 3 }, strides(4)], false),
        },
        {
          offset: 0,
          minDays: 0,
          build: () => ({
            kind: 'race',
            title: answers.raceName ? `Race day: ${answers.raceName}` : 'Race day!',
            steps: [{ type: 'run', label: 'Marathon', zone: 'marathon', distanceKm: MARATHON_M / 1000 }],
            distance_km: 42.2,
            duration_min: Math.round(fitness.targetMarathonS / 60),
            key_session: true,
          }),
        },
      ];
      for (const it of items) {
        const day = raceDay + it.offset;
        if (day >= 0 && runDays >= it.minDays) push(day, it.build());
      }
      workouts.push(...weekWorkouts);
      weeks.push({
        week: w,
        startDate: weekStart,
        phase,
        targetKm: round05(weekWorkouts.filter((x) => x.kind !== 'race').reduce((s, x) => s + (x.distance_km ?? 0), 0)),
        longKm: 0,
        recovery: false,
      });
      continue;
    }

    // Weekly volume + long run
    let volume: number;
    let longKm: number;
    if (phase === 'taper') {
      const idx = w - firstTaper;
      volume = maxVol * (taperWeeks >= 3 ? [0.75, 0.55][idx] : 0.65);
      longKm = Math.max(12, maxLong * (taperWeeks >= 3 ? [0.7, 0.5][idx] : 0.55));
    } else if (recovery) {
      volume = prog * 0.75;
      longKm = Math.max(6, longProg * 0.7);
    } else {
      if (w !== fromWeek) {
        prog = Math.min(peakKm, prog * (1 + rate));
        longProg = Math.min(fitness.peakLongKm, longProg + longStep);
      }
      volume = prog;
      longKm = Math.min(longProg, Math.max(volume * fracCap, startLong));
      longProg = longKm;
    }
    longKm = Math.round(longKm);
    maxVol = Math.max(maxVol, volume);
    maxLong = Math.max(maxLong, longKm);

    // Quality sessions
    const bpIdx = countBefore(w, (p) => p === 'build' || p === 'peak');
    const pIdx = recovery ? Math.max(0, countBefore(w, (p) => p === phase) - 2) : countBefore(w, (p) => p === phase);
    const q = qualityCount(level, phase, runDays, recovery);
    const sessions: SessionType[] = [];
    let longMp = 0;
    if (phase === 'base') {
      if (q >= 1) sessions.push('fartlek');
      if (q >= 2) sessions.push('threshold');
    } else if (phase === 'taper') {
      if (q >= 1) sessions.push('mp');
      if (q >= 2) sessions.push('threshold');
    } else if (recovery) {
      if (q >= 1) sessions.push('threshold_light');
    } else {
      const speed: SessionType =
        (phase === 'peak' && level !== 'beginner') || (level === 'advanced' && bpIdx % 2 === 1) ? 'intervals' : 'threshold';
      const mpLongWeek = q <= 1 ? bpIdx % 2 === 0 : bpIdx % 2 === 1;
      const mpLongAllowed = (level !== 'beginner' || phase === 'peak') && longKm >= 16;
      if (mpLongWeek && mpLongAllowed) {
        const ladder = level === 'beginner' ? [3, 5, 6, 8] : phase === 'build' ? [6, 8, 10, 12] : [12, 14, 16];
        const i = Math.floor((phase === 'build' ? bpIdx : countBefore(w, (p) => p === 'peak')) / 2);
        longMp = Math.min(ladder[Math.min(i, ladder.length - 1)], Math.floor(longKm * 0.45));
      }
      if (q === 1) sessions.push(bpIdx % 2 === 0 ? speed : 'mp');
      else if (q >= 2) sessions.push(speed, longMp > 0 ? 'easy_strides' : 'mp');
    }

    const layout = layoutFor(sessions.length);
    const dayType: DayType[] = Array<DayType>(7).fill('rest');
    for (const d of layout.runDays) dayType[d] = 'easy';
    dayType[longDay] = 'long';
    if (layout.recoveryDay !== null) dayType[layout.recoveryDay] = 'recovery';

    let usedKm = 0;
    const lr = longRun(longKm, longMp);
    const longDraft = runDraft(lr.kind, lr.title, lr.steps, true);
    push(longDay, longDraft);
    usedKm += longDraft.distance_km ?? 0;

    const stridesDays = new Set<number>();
    const weeksToRace = n - w;
    sessions.forEach((type, i) => {
      const day = layout.quality[i];
      if (day === undefined) return;
      if (type === 'easy_strides') {
        stridesDays.add(day);
        return;
      }
      dayType[day] = 'quality';
      const s = buildSession(type, { level, phase, pIdx, bpIdx, weeksToRace });
      // Intensity caps relative to weekly volume (after Daniels).
      const cap = (z: 'threshold' | 'interval' | 'marathon', share: number, min: number) => {
        while (kmInZones(s.steps, paces, [z]) > Math.max(min, volume * share) && shrink(s.steps));
      };
      cap('threshold', 0.12, 5);
      cap('interval', 0.08, 4);
      cap('marathon', 0.2, 4);
      if (cappedDay(day)) fitToMinutes(s.steps, paces, weekdayCap!);
      const draft = runDraft(s.kind, sessionTitle(s.kind, s.steps), s.steps, true);
      push(day, draft);
      usedKm += draft.distance_km ?? 0;
    });

    // Easy + recovery runs fill the remaining volume.
    const easyDays = layout.runDays.filter((d) => dayType[d] === 'easy' || dayType[d] === 'recovery');
    const plain = easyDays.filter((d) => dayType[d] === 'easy');
    if ((phase === 'base' || recovery) && plain.length) stridesDays.add(plain[0]);
    if (phase === 'base' && level === 'beginner' && plain.length > 1) stridesDays.add(plain[plain.length - 1]);
    let remaining = volume - usedKm;
    const stridesKm = workoutKm([strides()], paces);
    const stridesMin = workoutMinutes([strides()], paces);
    const maxEasyFor = (d: number) =>
      Math.min(
        MAX_EASY_KM[level],
        cappedDay(d) ? ((weekdayCap! - (stridesDays.has(d) ? stridesMin : 0)) * 60) / easyPace : Infinity,
      );
    if (layout.recoveryDay !== null && dayType[layout.recoveryDay] === 'recovery') {
      const km = round05(clamp(volume * 0.08, 4, Math.min(7, maxEasyFor(layout.recoveryDay))));
      const steps: Step[] = [{ type: 'run', label: 'Recovery', zone: 'recovery', distanceKm: km }];
      push(layout.recoveryDay, runDraft('recovery', 'Recovery run', steps, false));
      remaining -= km;
    }
    for (const d of plain) {
      const share = remaining / plain.length - (stridesDays.has(d) ? stridesKm : 0);
      const km = round05(clamp(share, 3, maxEasyFor(d)));
      const e = easyRun(km, stridesDays.has(d));
      push(d, runDraft(e.kind, e.title, e.steps, false));
    }

    // Strength
    if (answers.strength.enabled) {
      const types = strengthTypesForWeek(answers.strength.focus, answers.strength.perWeek, w, phase, recovery, false);
      for (const { type, day } of placeStrength(dayType, types, answers.availableDays)) {
        const s = strengthSession(type, phase, recovery, answers.strength.equipment);
        push(day, { kind: s.kind, title: s.title, steps: s.steps, distance_km: null, duration_min: s.duration_min, key_session: false });
      }
    }

    weekWorkouts.sort((a, b) => a.date.localeCompare(b.date));
    workouts.push(...weekWorkouts);
    weeks.push({
      week: w,
      startDate: weekStart,
      phase,
      targetKm: round05(weekWorkouts.reduce((s, x) => s + (x.distance_km ?? 0), 0)),
      longKm,
      recovery,
    });
  }

  if (fromWeek === 1 && maxLong < 26 && n >= 8)
    warnings.push(`Your longest run peaks at ${maxLong} km – with more weeks or more running days it could build further.`);

  return { weeks, workouts, warnings };
}

/** Build a brand-new plan starting today. */
export function buildPlan(answers: OnboardingAnswers, assessment: FitnessAssessment, today: string): GeneratedPlan {
  const { fitness, warnings } = createPlanFitness(answers, assessment, today);
  const res = generateWeeks({
    answers,
    fitness,
    planStart: mondayOf(today),
    firstDate: today,
    startKm: assessment.weeklyKm,
    startLongKm: assessment.longestRunKm,
  });
  return { fitness, weeks: res.weeks, workouts: res.workouts, warnings: [...warnings, ...res.warnings] };
}
