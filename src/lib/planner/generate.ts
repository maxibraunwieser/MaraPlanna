// Marathon plan generator.
//
// Structure: base -> build -> peak -> taper, counted backwards from race day.
// Evidence the targets are built on:
// - Longest run 30–35 km: a longest run < 25 km was linked to ~13 min slower
//   marathons, > 35 km brought no extra benefit (Fokkema et al. 2020, SJMSS);
//   more ≥32 km runs → faster finishes (Doherty et al. 2020, JSAMS).
// - Weekly volume: < 40 km/wk slower, > 65 km/wk ~14 min faster (Fokkema 2020).
// - Intensity: ~75–80 % easy, pyramidal/polarised (Campos, Casado et al. 2022).
// - Taper: cut volume 41–60 %, keep intensity and frequency (Bosquet 2007;
//   Wang et al. 2023).
// Volume grows ≤6–10 %/week with a lighter week every 3rd/4th week and
// quality sessions follow per-phase ladders. Paces come from VDOT (vdot.ts).

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
  DayTemplate,
  ExtraSession,
} from '../types';
import type { Routine } from '../../../supabase/functions/_shared/strength';
import { addDays, daysBetween, mondayOf } from './dates';
import { chooseLayout, templateLayout, type WeekLayout } from './layout';
import { MARATHON_M, raceTimeForVdot, trainingPaces, vdotFromRace as vdotForTime } from './vdot';
import { distanceLabel, goalProfile, type GoalProfile } from './goals';
import { extraLoad, extraSession, extrasForWeek, placeExtras, type DayType } from './extras';
import { autoWeek, weekInputOf } from './week';
import { qualityFor } from './weekModel';
import { isStrengthExtra } from '../onboarding/strengthMap';
import { kmInZones, round05, workoutKm, workoutMinutes, zonePace } from './workouts';

export { chooseLayout, templateLayout };
export type { WeekLayout };

export interface GeneratedPlan {
  fitness: PlanFitness;
  weeks: WeekSummary[];
  workouts: WorkoutDraft[];
  warnings: string[];
}

const LEVEL_PEAK_KM: Record<Level, number> = { beginner: 55, intermediate: 70, advanced: 90 };
const PER_RUN_DAY_CAP_KM: Record<Level, number> = { beginner: 14, intermediate: 16, advanced: 19 };
const LEVEL_LONG_KM: Record<Level, number> = { beginner: 30, intermediate: 32, advanced: 34 };
/** Max increase of the long run per (non-recovery) week. */
const LONG_STEP_KM: Record<Level, number> = { beginner: 2, intermediate: 2.5, advanced: 3 };
/** How many long runs close to peak distance in the final block before the taper. */
const BIG_LONG_RUNS: Record<Level, number> = { beginner: 2, intermediate: 3, advanced: 4 };
const MAX_EASY_KM: Record<Level, number> = { beginner: 12, intermediate: 16, advanced: 18 };
/** Distance of a day with a hard session, warm-up and cool-down included. */
const HARD_DAY_KM = 10;
const MIN_EASY_KM: Record<Level, number> = { beginner: 3.5, intermediate: 4.5, advanced: 5 };
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

export function assignPhases(n: number, taperWeeks?: number): Phase[] {
  const taper = taperWeeks ?? (n >= 16 ? 3 : n >= 9 ? 2 : 1);
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

export const longShareCap = (runDays: number) => (runDays <= 3 ? 0.6 : runDays === 4 ? 0.5 : runDays === 5 ? 0.45 : 0.4);

export const profileOf = (answers: Pick<OnboardingAnswers, 'goal' | 'raceDistanceM'>): GoalProfile => goalProfile(answers.goal, answers.raceDistanceM);

export function peakLongRun(answers: OnboardingAnswers): number {
  const p = profileOf(answers);
  if (p.kind === 'marathon') return clamp(LEVEL_LONG_KM[answers.level] + APPROACH_LONG[answers.approach] - (answers.injuryProne ? 1 : 0), 28, 35);
  const [usual, ceiling] = p.longKm[answers.level];
  return clamp(usual + APPROACH_LONG[answers.approach] - (answers.injuryProne ? 1 : 0), Math.min(usual, ceiling) - 4, ceiling);
}

export function peakVolume(answers: OnboardingAnswers, currentKm: number): number {
  const { level, approach, runDaysPerWeek } = answers;
  const p = profileOf(answers);
  const marathon = p.kind === 'marathon';
  let peak = (marathon ? LEVEL_PEAK_KM[level] : p.volumeKm[level]) * APPROACH_VOLUME[approach];
  if (marathon && answers.goalType === 'time' && answers.goalTimeS && answers.goalTimeS <= 3 * 3600) peak = Math.max(peak, 85);
  if (answers.injuryProne) peak *= 0.9;
  // Few run days → each run (especially the long one) carries more volume.
  const perDay = PER_RUN_DAY_CAP_KM[level] + (runDaysPerWeek <= 3 ? 2 : 0);
  peak = Math.min(peak, runDaysPerWeek * perDay);
  peak = Math.max(peak, Math.min(currentKm * 1.1, runDaysPerWeek * PER_RUN_DAY_CAP_KM.advanced));
  // The week has to carry the peak long run, and < 40 km/week is linked to slower marathons.
  peak = Math.max(peak, peakLongRun(answers) / longShareCap(runDaysPerWeek), p.minVolumeKm);
  return Math.round(peak);
}

/**
 * Race-day projection and the target pace for the plan's race distance (the marathon unless the goal says otherwise;
 * without a race the numbers are for the marathon so the pace zones keep their usual anchor).
 */
export function marathonTargets(answers: OnboardingAnswers, vdot: number, peakWeeklyKm: number, today: string) {
  const warnings: string[] = [];
  const weeksToRace = Math.max(0, daysBetween(today, answers.raceDate) / 7);
  const gain = Math.min(4, weeksToRace * WEEKLY_VDOT_GAIN[answers.level] * (answers.approach === 'conservative' ? 0.8 : 1));
  const p = profileOf(answers);
  const distance = p.distanceM ?? MARATHON_M;
  // Long races need more mileage behind them; short ones barely care.
  const volumeFactor = distance >= 30_000 ? (peakWeeklyKm >= 70 ? 1 : peakWeeklyKm >= 55 ? 1.015 : peakWeeklyKm >= 40 ? 1.035 : 1.06) : distance >= 15_000 ? (peakWeeklyKm >= 45 ? 1 : peakWeeklyKm >= 30 ? 1.015 : 1.03) : 1;
  const firstMarathon = p.kind === 'marathon' && answers.marathonsCompleted === 0 ? 1.02 : 1;
  const terrain = answers.raceTerrain === 'hilly' ? 1.03 : answers.raceTerrain === 'rolling' ? 1.01 : 1;
  const predicted = Math.round(raceTimeForVdot(vdot + gain, distance) * volumeFactor * firstMarathon * terrain);

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
      warnings.push('Your goal time is ambitious. Race-pace sessions start a bit slower than goal pace; they speed up if your runs show you are improving.');
    } else {
      goalAssessment = 'very_ambitious';
      warnings.push('Your goal time is a big stretch for your current fitness. Race-pace sessions use your projected pace instead; it is updated as your fitness improves.');
    }
  }
  return { predicted, target, goalAssessment, terrain, warnings };
}

/**
 * MP sessions run at the target pace, but never faster than what current
 * fitness supports – the pace speeds up as VDOT updates come in.
 */
function pacesFor(vdot: number, targetS: number, terrain: number, distanceM = MARATHON_M) {
  const km = distanceM / 1000;
  // The paces are anchored on the marathon pace; a target over another distance is converted through the VDOT it implies.
  const targetPace = distanceM === MARATHON_M ? targetS / km / terrain : raceTimeForVdot(vdotForTime(distanceM, targetS / terrain), MARATHON_M) / (MARATHON_M / 1000);
  const currentPace = raceTimeForVdot(vdot, MARATHON_M) / (MARATHON_M / 1000);
  const paces = trainingPaces(vdot, Math.max(targetPace, currentPace));
  paces.marathon = Math.min(paces.marathon, (paces.easy[0] + paces.easy[1]) / 2);
  return paces;
}

/** The days the plan runs on and the long-run day: a drawn week as drawn, else what the weekly model picks. */
function scheduleOf(answers: OnboardingAnswers): { runDays: Weekday[]; longDay: Weekday } {
  const template = answers.scheduleMode === 'custom' && answers.customWeek?.length === 7 ? answers.customWeek : null;
  if (template) {
    return { runDays: template.flatMap((d, i) => (d.run !== 'rest' ? [i as Weekday] : [])), longDay: (Math.max(0, template.findIndex((d) => d.run === 'long'))) as Weekday };
  }
  const base = autoWeek(weekInputOf(answers)).solution;
  return { runDays: base.runDays, longDay: base.longDay };
}

/**
 * What the minutes of the person's days allow: the longest run (the minutes of the long-run day at long-run pace) and the weekly
 * distance the run days can carry (each run day up to what its minutes and a sensible easy run allow, the long-run day up to the
 * long run the goal asks for). A run needs a few minutes more than it takes (getting ready, stretching).
 */
export function timeLimits(answers: OnboardingAnswers, vdot: number): { longKm: number; weeklyKm: number } {
  const minutes = answers.setup?.minutesPerDay;
  const { runDays, longDay } = scheduleOf(answers);
  const p = trainingPaces(vdot, raceTimeForVdot(vdot, MARATHON_M) / (MARATHON_M / 1000));
  const limit = (d: number, pace: number) => {
    const m = minutes?.[d];
    return m && m < 120 ? Math.max(0, ((m - 5) * 60) / pace) : Infinity;
  };
  const longKm = limit(longDay, zonePace(p, 'long'));
  const longCap = Number.isFinite(longKm) ? Math.max(8, Math.floor(longKm)) : Infinity;
  const easyMax = MAX_EASY_KM[answers.level];
  // The other run days: up to an easy run of their minutes; the days that carry a hard session hold less (a tempo or interval
  // session with warm-up and cool-down is about 10 km).
  const caps = runDays.filter((d) => d !== longDay).map((d) => Math.min(easyMax, limit(d, zonePace(p, 'easy')))).sort((x, y) => y - x);
  for (let i = 0; i < Math.min(qualityFor(answers.level, runDays.length), caps.length); i++) caps[i] = Math.min(caps[i], HARD_DAY_KM);
  const weeklyKm = caps.reduce((sum, c) => sum + c, 0) + Math.min(longCap, peakLongRun(answers));
  return { longKm: longCap, weeklyKm: Math.round(weeklyKm) };
}

export function createPlanFitness(answers: OnboardingAnswers, fitness: FitnessAssessment, today: string) {
  const limits = timeLimits(answers, fitness.vdot);
  // The days carry only so many kilometres: with few runs or short days the peak week is what they allow, even below what the
  // person runs now (the plan says so).
  const peakWeeklyKm = Math.round(Math.min(peakVolume(answers, fitness.weeklyKm), limits.weeklyKm));
  const t = marathonTargets(answers, fitness.vdot, peakWeeklyKm, today);
  const goal = profileOf(answers);
  const paces = pacesFor(fitness.vdot, t.target, t.terrain, goal.distanceM ?? MARATHON_M);

  const peakLongKm = Math.min(peakLongRun(answers), limits.longKm);
  const longHours = (peakLongKm * zonePace(paces, 'long')) / 3600;
  if (longHours > 3.4)
    t.warnings.push(
      `Your longest runs (${peakLongKm} km) will take about ${longHours.toFixed(1)} h. Short walk breaks are fine – practise fuelling (60–90 g carbs per hour) on them.`,
    );

  const planFitness: PlanFitness = {
    vdot: fitness.vdot,
    vdotSource: fitness.vdotSource,
    paces,
    predictedMarathonS: t.predicted,
    targetMarathonS: t.target,
    raceDistanceM: goal.distanceM,
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
  const paces = pacesFor(vdot, t.target, t.terrain, profileOf(answers).distanceM ?? MARATHON_M);
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
export const strides = (n = 6): Step => ({ type: 'run', label: 'Strides (20 s fast, relaxed)', zone: 'repetition', durationMin: 1 / 3, repeat: n, recoveryMin: 1 });

const repLabel = (km: number, metres: boolean) => (metres || km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

function mainStep(steps: Step[]) {
  return steps.find((s): s is Extract<Step, { type: 'run' }> => s.type === 'run' && s.label !== 'Warm-up' && s.label !== 'Cool-down');
}

export function sessionTitle(kind: WorkoutKind, steps: Step[]): string {
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

/**
 * Long-run distance for each non-taper week. The run builds from the current
 * longest run by at most LONG_STEP_KM per week into a final block of several
 * near-peak runs (alternating peak / peak−2) that ends 2–3 weeks before race day.
 */
export function longRunLadder(opts: {
  weeks: number[];
  isRecovery: (w: number) => boolean;
  startKm: number;
  peakKm: number;
  level: Level;
}): { byWeek: Map<number, number>; reachedPeak: number } {
  const { weeks, isRecovery, startKm, peakKm, level } = opts;
  const build = weeks.filter((w) => !isRecovery(w));
  const step = LONG_STEP_KM[level];
  const blockLen = Math.min(BIG_LONG_RUNS[level], Math.max(1, build.length - 1));
  const block = Array.from({ length: blockLen }, (_, k) => ((blockLen - 1 - k) % 2 === 0 ? peakKm : peakKm - 2));
  const pre = build.length - blockLen;
  const values: number[] = [];
  const blockMin = Math.min(...block);
  for (let i = 0; i < pre; i++)
    values.push(startKm >= blockMin ? Math.min(startKm, peakKm) : startKm + ((blockMin - startKm) * (i + 1)) / (pre + 1));
  values.push(...block);
  // Forward pass: never more than one step per week (short plans peak lower).
  let prev = startKm;
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.min(values[i], prev + step);
    prev = values[i];
  }
  const byWeek = new Map<number, number>();
  let last = startKm;
  let bi = 0;
  for (const w of weeks) {
    // A recovery week never has a longer long run than the weeks around it (matters for short plans like coming back).
    if (isRecovery(w)) byWeek.set(w, Math.min(Math.max(6, Math.round(last * 0.7)), Math.max(1, Math.round(last))));
    else {
      last = values[bi++];
      byWeek.set(w, Math.round(last));
    }
  }
  return { byWeek, reachedPeak: Math.round(Math.max(startKm, ...values)) };
}

export interface GenerateContext {
  answers: OnboardingAnswers;
  fitness: PlanFitness;
  /** Monday of week 1 */
  planStart: string;
  /** First date that may receive workouts (today, or the re-plan date). */
  firstDate: string;
  startKm: number;
  startLongKm: number;
  /** The person's strength workouts (by kind: lower, upper, full); their exercises replace the default pools. */
  routines?: Routine[];
}

export function generateWeeks(ctx: GenerateContext): { weeks: WeekSummary[]; workouts: WorkoutDraft[]; warnings: string[] } {
  const { answers, fitness, planStart, firstDate } = ctx;
  const template = answers.scheduleMode === 'custom' && answers.customWeek?.length === 7 ? answers.customWeek : null;
  const templateQuality = template ? template.filter((d) => d.run === 'quality').length : 0;
  const { level } = answers;
  // Without a drawn week the weekly model decides the run days, the long-run day and the days of the strength sessions.
  const base = template ? null : autoWeek(weekInputOf(answers)).solution;
  const runDays = template ? template.filter((d) => d.run !== 'rest').length : base!.runDays.length || answers.runDaysPerWeek;
  const longDay = (template ? template.findIndex((d) => d.run === 'long') : base!.longDay) as Weekday;
  const raceDate = answers.raceDate;
  const paces = fitness.paces;
  const warnings: string[] = [];
  const goal = profileOf(answers);

  const n = weekCount(planStart, raceDate);
  const phases = assignPhases(n, goal.taperWeeks(n));
  const phaseOf = (w: number) => phases[w - 1];
  // Plans without a taper (no race) have none: the "first taper week" lies behind the last week.
  const firstTaper = phases.includes('taper') ? phases.indexOf('taper') + 1 : n + 1;
  const taperWeeks = phases.includes('taper') ? n - firstTaper + 1 : 0;
  const cycle = answers.injuryProne || answers.approach === 'conservative' || (answers.age ?? 0) >= 50 ? 3 : 4;
  const fromWeek = Math.max(1, Math.floor(daysBetween(planStart, firstDate) / 7) + 1);
  const recoveryAbs = (w: number) => w > 1 && w < firstTaper - 1 && w % cycle === 0;
  const isRecovery = (w: number) => w !== fromWeek && recoveryAbs(w);
  const countBefore = (w: number, inPhase: (p: Phase) => boolean) => {
    let c = 0;
    for (let i = 1; i < w; i++) if (inPhase(phaseOf(i)) && !recoveryAbs(i)) c++;
    return c;
  };

  if (n < 8 && goal.race) warnings.push(`Only ${n} weeks until race day – the plan focuses on arriving healthy rather than building a lot of new fitness.`);

  // Long-run ladder (decides the shape of the build)
  const fracCap = longShareCap(runDays);
  // Nobody starts above what their days can carry.
  const dayLimits = timeLimits(answers, fitness.vdot);
  const startKm = Math.max(Math.min(ctx.startKm, dayLimits.weeklyKm), runDays * 3, 10);
  const startLong = clamp(ctx.startLongKm || startKm * 0.35, 8, fitness.peakLongKm);
  const preTaper = Array.from({ length: Math.max(0, firstTaper - fromWeek) }, (_, i) => fromWeek + i);
  const ladder = longRunLadder({ weeks: preTaper, isRecovery, startKm: startLong, peakKm: fitness.peakLongKm, level });

  // Volume progression – must be able to carry the long run.
  const peakKm = Math.max(fitness.peakWeeklyKm, startKm, fitness.peakLongKm / fracCap);
  let progWeeks = 0;
  for (let w = fromWeek; w < firstTaper; w++) if (!isRecovery(w)) progWeeks++;
  const maxRate = answers.injuryProne ? Math.min(0.06, MAX_WEEKLY_INCREASE[answers.approach]) : MAX_WEEKLY_INCREASE[answers.approach];
  const rate = clamp(Math.pow(peakKm / startKm, 1 / Math.max(1, progWeeks - 2)) - 1, 0, maxRate);

  const easyPace = zonePace(paces, 'easy');
  // How long a session may be on a day: the person's minutes for that weekday (120 = no limit), else the weekday limit for
  // Monday to Friday. The long-run day is never capped.
  const weekdayCap = answers.weekdayMaxMinutes;
  const perDay = answers.setup?.minutesPerDay;
  // Minutes of strength and other sessions on each day of the week being built: the run has to fit in what is left.
  let extraMin = new Map<number, number>();
  const dayCap = (d: number): number | null => {
    if (d === longDay) return null;
    const own = perDay?.[d];
    const taken = extraMin.get(d) ?? 0;
    if (own) return own < 120 ? Math.max(20, own - taken) : null;
    return weekdayCap && d <= 4 ? Math.max(20, weekdayCap - taken) : null;
  };
  const cappedDay = (d: number) => dayCap(d) !== null;
  // The long run has to fit into the day it is on.
  const longBudget = perDay?.[longDay];
  const longCapKm = longBudget && longBudget < 120 ? Math.max(5, Math.floor(((longBudget - 5) * 60) / zonePace(paces, 'long'))) : null;

  const layouts = new Map<number, WeekLayout>();
  const layoutFor = (q: number) => {
    if (!layouts.has(q)) {
      layouts.set(
        q,
        template
          ? templateLayout(template, q)
          : base && q === base.quality.length
            ? { runDays: base.runDays, quality: base.quality, recoveryDays: base.recovery, longDay: base.longDay }
            : chooseLayout(base ? base.runDays : answers.availableDays, runDays, longDay, q),
      );
    }
    return layouts.get(q)!;
  };
  const extrasById = new Map(answers.extras.map((e) => [e.id, e]));

  /** The strength sessions of a week on the days of the weekly model (the same weekdays every week; lighter weeks use fewer). */
  const strengthPlaced = (phase: Phase, recovery: boolean, raceWeek: boolean): { extra: ExtraSession; day: Weekday }[] => {
    if (!base) return [];
    const pool = [...base.strength];
    const out: { extra: ExtraSession; day: Weekday }[] = [];
    for (const e of extrasForWeek(answers.extras, phase, recovery, raceWeek)) {
      if (!isStrengthExtra(e)) continue;
      const i = pool.findIndex((p) => p.kind === e.id);
      if (i < 0) continue;
      out.push({ extra: e, day: pool[i].day });
      pool.splice(i, 1);
    }
    return out;
  };

  /** Place this week's extra sessions (fixed days in a custom week, the weekly model for strength, scored for the rest). */
  const placeWeekExtras = (dayType: DayType[], phase: Phase, recovery: boolean, raceWeek: boolean) => {
    const wanted = extrasForWeek(answers.extras, phase, recovery, raceWeek);
    if (!template) {
      const others = wanted.filter((e) => !isStrengthExtra(e));
      const blocked = [...new Set<Weekday>([...(answers.setup?.unavailableDays ?? []), ...(base?.restDays ?? [])])];
      return [...strengthPlaced(phase, recovery, raceWeek), ...placeExtras(dayType, others, answers.availableDays, blocked, answers.setup?.doubles !== false)];
    }
    const remaining = new Map<string, number>();
    for (const e of wanted) remaining.set(e.id, (remaining.get(e.id) ?? 0) + 1);
    const placed: { extra: (typeof wanted)[number]; day: Weekday }[] = [];
    template.forEach((d, day) => {
      if (dayType[day] === 'race') return;
      for (const id of d.extras) {
        const extra = extrasById.get(id);
        if (!extra || !remaining.get(id)) continue;
        remaining.set(id, remaining.get(id)! - 1);
        placed.push({ extra, day: day as Weekday });
      }
    });
    return placed;
  };

  let prog = startKm;
  let lastVol = startKm;
  let maxVol = startKm;
  let maxLong = startLong;
  const weeks: WeekSummary[] = [];
  const workouts: WorkoutDraft[] = [];

  for (let w = fromWeek; w <= n; w++) {
    const weekStart = addDays(planStart, (w - 1) * 7);
    const phase = phaseOf(w);
    const recovery = isRecovery(w);
    const weekWorkouts: WorkoutDraft[] = [];
    // The strength sessions of this week come first: the runs of those days are shortened to the time that is left.
    extraMin = new Map();
    const early = template ? placeWeekExtras(Array<DayType>(7).fill('rest'), phase, recovery, goal.race && w === n) : strengthPlaced(phase, recovery, goal.race && w === n);
    for (const { extra, day } of early) {
      const s = extraSession(extra, phase, recovery, answers.equipment, ctx.routines?.find((r) => r.id === extra.id));
      extraMin.set(day, (extraMin.get(day) ?? 0) + s.duration_min);
    }
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
    const pushExtras = (dayType: DayType[]) => {
      for (const { extra, day } of placeWeekExtras(dayType, phase, recovery, goal.race && w === n)) {
        const s = extraSession(extra, phase, recovery, answers.equipment, ctx.routines?.find((r) => r.id === extra.id));
        push(day, { kind: s.kind, title: s.title, steps: s.steps, distance_km: null, duration_min: s.duration_min, key_session: false });
      }
    };

    if (goal.race && w === n) {
      // Race week: same number of runs (frequency kept), all short; one sharpener.
      const raceDay = daysBetween(weekStart, raceDate);
      const noStrides = new Set<number>(answers.noStridesDays ?? []);
      const easy = (km: number, st: boolean) => (day: number) => {
        const e = easyRun(km, st && !noStrides.has(day));
        return runDraft(e.kind, e.title, e.steps, false);
      };
      const items: { offset: number; minDays: number; build: (day: number) => Omit<WorkoutDraft, 'date' | 'week' | 'phase'> }[] = [
        { offset: -6, minDays: 4, build: easy(6, true) },
        { offset: -5, minDays: 6, build: easy(5, false) },
        {
          offset: -4,
          minDays: 3,
          build: () =>
            goal.zone === 'marathon'
              ? runDraft('marathon_pace', 'Race-pace sharpener', [warmup(), { type: 'run', label: 'Marathon pace', zone: 'marathon', distanceKm: 3 }, cooldown()], false)
              : runDraft('threshold', 'Race-pace sharpener', [warmup(), { type: 'run', label: 'Race pace', zone: goal.zone, distanceKm: 1, repeat: 3, recoveryMin: 2 }, cooldown()], false),
        },
        { offset: -3, minDays: 5, build: easy(5, false) },
        { offset: -2, minDays: 7, build: easy(4, false) },
        {
          offset: -1,
          minDays: 4,
          build: () => runDraft('shakeout', 'Shakeout run', [{ type: 'run', label: 'Very easy', zone: 'recovery', distanceKm: 3 }, strides(4)], false),
        },
        {
          offset: 0,
          minDays: 0,
          build: () => ({
            kind: 'race',
            title: answers.goal === 'faster' ? `Time trial: ${distanceLabel(goal.distanceM)}` : answers.raceName ? `Race day: ${answers.raceName}` : 'Race day!',
            steps: [{ type: 'run', label: distanceLabel(goal.distanceM), zone: goal.zone, distanceKm: (goal.distanceM ?? MARATHON_M) / 1000 }],
            distance_km: Math.round(((goal.distanceM ?? MARATHON_M) / 1000) * 10) / 10,
            duration_min: Math.round(fitness.targetMarathonS / 60),
            key_session: true,
          }),
        },
      ];
      const dayType: DayType[] = Array<DayType>(7).fill('rest');
      if (template) {
        const sharpenerDay = [...Array(raceDay).keys()].filter((d) => d <= raceDay - 3 && template[d].run !== 'rest').sort((x, y) => {
          const q = (d: number) => (template[d].run === 'quality' ? 0 : 1);
          return q(x) - q(y) || Math.abs(raceDay - 4 - x) - Math.abs(raceDay - 4 - y);
        })[0];
        for (let d = 0; d < raceDay; d++) {
          if (template[d].run === 'rest') continue;
          const it = d === raceDay - 1 ? items.find((x) => x.offset === -1)! : d === sharpenerDay ? items.find((x) => x.offset === -4)! : { build: easy(d >= raceDay - 2 ? 4 : 5, d === 0) };
          dayType[d] = 'easy';
          push(d, it.build(d));
        }
        dayType[raceDay] = 'race';
        push(raceDay, items.find((x) => x.offset === 0)!.build(raceDay));
      } else {
        for (const it of items) {
          const day = raceDay + it.offset;
          if (day < 0 || runDays < it.minDays) continue;
          dayType[day] = it.offset === 0 ? 'race' : 'easy';
          push(day, it.build(day));
        }
      }
      for (let d = raceDay; d < 7; d++) dayType[d] = 'race';
      if (raceDay > 0) dayType[raceDay - 1] = 'race';
      pushExtras(dayType);
      weekWorkouts.sort((a, b) => a.date.localeCompare(b.date));
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
      longKm = Math.max(12, maxLong * (taperWeeks >= 3 ? [0.7, 0.5][idx] : 0.6));
    } else {
      if (!recovery && w !== fromWeek) prog = Math.min(peakKm, prog * (1 + rate));
      longKm = ladder.byWeek.get(w) ?? startLong;
      if (recovery) volume = prog * 0.75;
      else {
        // Volume follows the long run so it never dominates the week, but grows ≤ ~10–14 %/week.
        volume = Math.min(Math.max(prog, longKm / fracCap), lastVol * (1 + maxRate + 0.04));
        volume = Math.max(volume, prog);
        prog = volume;
        lastVol = volume;
      }
    }
    longKm = Math.round(longKm);
    if (longCapKm !== null) longKm = Math.min(longKm, longCapKm);
    maxVol = Math.max(maxVol, volume);
    maxLong = Math.max(maxLong, longKm);

    // Quality sessions
    const bpIdx = countBefore(w, (p) => p === 'build' || p === 'peak');
    const pIdx = recovery ? Math.max(0, countBefore(w, (p) => p === phase) - 2) : countBefore(w, (p) => p === phase);
    const q = template ? (recovery ? Math.min(templateQuality, 1) : templateQuality) : Math.max(0, qualityCount(level, phase, runDays, recovery) + goal.qualityShift);
    const sessions: SessionType[] = [];
    let longMp = 0;
    if (phase === 'base') {
      if (q >= 1) sessions.push('fartlek');
      if (q >= 2) sessions.push('threshold');
      if (q >= 3) sessions.push('easy_strides');
    } else if (phase === 'taper') {
      if (q >= 1) sessions.push(goal.zone === 'marathon' ? 'mp' : goal.zone === 'interval' ? 'intervals' : 'threshold');
      if (q >= 2) sessions.push('threshold');
    } else if (recovery) {
      if (q >= 1) sessions.push('threshold_light');
    } else {
      const speed: SessionType =
        (phase === 'peak' && level !== 'beginner') || (level === 'advanced' && bpIdx % 2 === 1) ? 'intervals' : 'threshold';
      const mpLongWeek = q <= 1 ? bpIdx % 2 === 0 : bpIdx % 2 === 1;
      const mpLongAllowed = goal.longFinish && (level !== 'beginner' || phase === 'peak') && longKm >= 16;
      if (mpLongWeek && mpLongAllowed) {
        const mpLadder = level === 'beginner' ? [3, 5, 6, 8] : phase === 'build' ? [6, 8, 10, 12] : [12, 14, 16];
        const i = Math.floor((phase === 'build' ? bpIdx : countBefore(w, (p) => p === 'peak')) / 2);
        longMp = Math.min(mpLadder[Math.min(i, mpLadder.length - 1)], Math.floor(longKm * 0.45));
      }
      // Sessions at race pace: marathon pace for the long races, otherwise the specific zone of the distance (threshold or intervals).
      const specific: SessionType = goal.zone === 'marathon' ? 'mp' : goal.zone === 'interval' ? 'intervals' : 'threshold';
      const other: SessionType = speed === 'threshold' && specific === 'threshold' ? 'intervals' : specific;
      if (q === 1) sessions.push(bpIdx % 2 === 0 ? speed : other);
      else if (q >= 2) {
        sessions.push(speed, longMp > 0 ? 'easy_strides' : other);
        if (q >= 3) sessions.push(level === 'advanced' ? (speed === 'intervals' ? 'threshold' : 'intervals') : 'easy_strides');
      }
    }

    const layout = layoutFor(template ? q : sessions.length);
    const dayType: DayType[] = Array<DayType>(7).fill('rest');
    for (const d of layout.runDays) dayType[d] = 'easy';
    dayType[longDay] = 'long';
    for (const d of layout.recoveryDays) if (dayType[d] === 'easy') dayType[d] = 'recovery';

    let usedKm = 0;
    const lr = longRun(longKm, longMp);
    const longDraft = runDraft(lr.kind, lr.title, lr.steps, true);
    push(longDay, longDraft);
    usedKm += longDraft.distance_km ?? 0;

    // Build quality sessions, then keep total hard running ≤ ~25 % of the week (80/20).
    const stridesDays = new Set<number>();
    const weeksToRace = n - w;
    const built: { day: number; kind: WorkoutKind; steps: Step[] }[] = [];
    sessions.forEach((type, i) => {
      const day = layout.quality[i];
      if (day === undefined) return;
      if (type === 'easy_strides') {
        stridesDays.add(day);
        return;
      }
      dayType[day] = 'quality';
      const s = buildSession(type, { level, phase, pIdx, bpIdx, weeksToRace });
      const cap = (z: 'threshold' | 'interval' | 'marathon', share: number, min: number) => {
        while (kmInZones(s.steps, paces, [z]) > Math.max(min, volume * share) && shrink(s.steps));
      };
      cap('threshold', 0.12, 3);
      cap('interval', 0.08, 2.5);
      cap('marathon', 0.2, 4);
      if (cappedDay(day)) fitToMinutes(s.steps, paces, dayCap(day)!);
      built.push({ day, kind: s.kind, steps: s.steps });
    });
    const HARD: ('marathon' | 'threshold' | 'interval' | 'repetition')[] = ['marathon', 'threshold', 'interval', 'repetition'];
    const hardKm = () => built.reduce((sum, b) => sum + kmInZones(b.steps, paces, HARD), 0) + kmInZones(longDraft.steps, paces, HARD);
    for (let guard = 0; guard < 20 && hardKm() > Math.max(6, volume * 0.25); guard++) {
      const biggest = [...built].sort((a, b) => kmInZones(b.steps, paces, HARD) - kmInZones(a.steps, paces, HARD))[0];
      if (!biggest || !shrink(biggest.steps)) break;
    }
    for (const b of built) {
      const draft = runDraft(b.kind, sessionTitle(b.kind, b.steps), b.steps, true);
      push(b.day, draft);
      usedKm += draft.distance_km ?? 0;
    }
    // Template quality days not used this week become easy runs with strides.
    if (template) for (const d of template.flatMap((t, i) => (t.run === 'quality' ? [i] : []))) if (dayType[d] !== 'quality') stridesDays.add(d);

    // Easy + recovery runs fill the remaining volume.
    const plain = layout.runDays.filter((d) => dayType[d] === 'easy');
    const recoveryDays = layout.runDays.filter((d) => dayType[d] === 'recovery');
    if ((phase === 'base' || recovery) && plain.length) stridesDays.add(plain[0]);
    if (phase === 'base' && level === 'beginner' && plain.length > 1) stridesDays.add(plain[plain.length - 1]);
    // Days the athlete wants without strides (the easy run just gets its distance).
    for (const d of answers.noStridesDays ?? []) stridesDays.delete(d);
    let remaining = volume - usedKm;
    const stridesKm = workoutKm([strides()], paces);
    const stridesMin = workoutMinutes([strides()], paces);
    const maxEasyFor = (d: number) =>
      Math.min(MAX_EASY_KM[level], cappedDay(d) ? ((dayCap(d)! - (stridesDays.has(d) ? stridesMin : 0)) * 60) / easyPace : Infinity);
    const floorKm = Math.min(MIN_EASY_KM[level], Math.max(3, volume * 0.14));
    for (const d of recoveryDays) {
      const km = round05(clamp(volume * 0.08, Math.min(4, floorKm), Math.min(7, maxEasyFor(d))));
      push(d, runDraft('recovery', 'Recovery run', [{ type: 'run', label: 'Recovery', zone: 'recovery', distanceKm: km }], false));
      remaining -= km;
    }
    for (const d of plain) {
      const share = remaining / plain.length - (stridesDays.has(d) ? stridesKm : 0);
      const km = round05(clamp(share, floorKm, maxEasyFor(d)));
      const e = easyRun(km, stridesDays.has(d));
      push(d, runDraft(e.kind, e.title, e.steps, false));
    }

    pushExtras(dayType);

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

  if (fromWeek === 1 && n >= 8 && goal.race && ladder.reachedPeak < fitness.peakLongKm - 1)
    warnings.push(
      `With ${n} weeks your longest run reaches ${ladder.reachedPeak} km instead of the ideal ${fitness.peakLongKm} km – building the long run faster would raise injury risk.`,
    );
  if (template) {
    const legs = new Set(answers.extras.filter((e) => extraLoad(e) === 'legs').map((e) => e.id));
    if (template[(longDay + 6) % 7].extras.some((id) => legs.has(id)))
      warnings.push('Your week has leg training the day before the long run – expect heavier legs on long runs.');
  }

  // Planned breaks (holiday, travel): nothing is scheduled on those days.
  const breaks = answers.setup?.breaks ?? [];
  if (breaks.length) {
    const inBreak = (date: string) => breaks.some((b) => b.from && b.to && date >= b.from && date <= b.to);
    const kept = workouts.filter((w) => !inBreak(w.date));
    const left = workouts.length - kept.length;
    if (left > 0) warnings.push(`${left} ${left === 1 ? 'session falls' : 'sessions fall'} into your planned breaks and ${left === 1 ? 'was' : 'were'} left out.`);
    return { weeks, workouts: kept, warnings };
  }

  return { weeks, workouts, warnings };
}

/** Build a brand-new plan starting today. */
export function buildPlan(answers: OnboardingAnswers, assessment: FitnessAssessment, today: string, routines?: Routine[]): GeneratedPlan {
  const { fitness, warnings } = createPlanFitness(answers, assessment, today);
  const res = generateWeeks({
    answers,
    fitness,
    planStart: mondayOf(today),
    firstDate: today,
    startKm: assessment.weeklyKm,
    startLongKm: assessment.longestRunKm,
    routines,
  });
  return { fitness, weeks: res.weeks, workouts: res.workouts, warnings: [...warnings, ...res.warnings] };
}

/** A sensible default week (build phase) to prefill the custom-week editor: the weekly model's week for these answers. */
export function suggestWeek(answers: OnboardingAnswers): DayTemplate[] {
  return autoWeek(weekInputOf(answers)).week;
}
