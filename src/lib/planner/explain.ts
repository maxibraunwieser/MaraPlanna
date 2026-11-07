// Why the plan looks the way it does, in the plan's own numbers. Rule-based: every sentence is a message key with parameters read
// from the generated plan, so the text can never disagree with the plan (and it reads the same in every language).

import { fmtDistance, fmtDuration, fmtPace } from '../format';
import type { OnboardingAnswers, Units, WorkoutKind } from '../types';
import { goalProfile, isRaceGoal } from './goals';
import type { GeneratedPlan } from './generate';

export interface ExplainItem {
  /** Message key `explain.*`. */
  key: string;
  params: Record<string, string | number>;
}

const QUALITY: WorkoutKind[] = ['threshold', 'intervals', 'marathon_pace', 'fartlek', 'long_mp'];
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

export function explainPlan(input: { answers: OnboardingAnswers; plan: GeneratedPlan; units: Units; today: string }): ExplainItem[] {
  const { answers, plan, units, today } = input;
  const { weeks, workouts, fitness } = plan;
  const goal = answers.goal ?? 'marathon';
  const profile = goalProfile(goal, answers.raceDistanceM);
  const out: ExplainItem[] = [];
  const count = (phase: string) => weeks.filter((w) => w.phase === phase).length;

  // Goal
  if (isRaceGoal(goal)) {
    out.push({ key: goal === 'faster' ? 'explain.goal.faster' : 'explain.goal.race', params: { weeks: weeks.length, distance: fmtDistance((profile.distanceM ?? 0) / 1000, units, 1) } });
    if (answers.goalType === 'time' && answers.goalTimeS && profile.distanceM) {
      out.push({
        key: 'explain.target',
        params: {
          goal: fmtDuration(answers.goalTimeS),
          pace: fmtPace(answers.goalTimeS / (profile.distanceM / 1000), units),
          predicted: fmtDuration(fitness.predictedMarathonS),
          verdict: fitness.goalAssessment,
        },
      });
    } else {
      out.push({ key: 'explain.projection', params: { predicted: fmtDuration(fitness.predictedMarathonS) } });
    }
  } else {
    out.push({ key: `explain.goal.${goal}`, params: { weeks: weeks.length } });
  }

  // Phases
  out.push({ key: 'explain.phases', params: { weeks: weeks.length, base: count('base'), build: count('build'), peak: count('peak'), taper: count('taper') } });

  // Volume: from the first to the highest week, and the largest single step between normal weeks.
  const peakKm = Math.max(...weeks.map((w) => w.targetKm));
  const peakWeek = weeks.find((w) => w.targetKm === peakKm)!.week;
  // A plan that starts in the middle of a week has a short first week; the build-up is told from the first full week on.
  const from = today > weeks[0].startDate && weeks.length > 2 ? 1 : 0;
  let steepest = 0;
  for (let i = from + 1; i < weeks.length; i++) {
    const [p, c] = [weeks[i - 1], weeks[i]];
    if (p.recovery || c.recovery || c.phase === 'taper' || p.targetKm <= 0) continue;
    steepest = Math.max(steepest, (c.targetKm - p.targetKm) / p.targetKm);
  }
  out.push({ key: 'explain.volume', params: { start: fmtDistance(weeks[from].targetKm, units, 0), peak: fmtDistance(peakKm, units, 0), week: peakWeek, pct: Math.max(1, Math.round(steepest * 100)) } });

  const recovery = weeks.filter((w) => w.recovery).map((w) => w.week);
  if (recovery.length >= 2) {
    const gaps = recovery.slice(1).map((w, i) => w - recovery[i]);
    out.push({ key: 'explain.recovery', params: { every: median(gaps) } });
  } else if (recovery.length === 1) {
    out.push({ key: 'explain.recovery', params: { every: recovery[0] } });
  }

  out.push({ key: 'explain.long', params: { long: fmtDistance(Math.max(...weeks.map((w) => w.longKm)), units, 0) } });

  // Hard sessions in a normal build or peak week.
  const normal = weeks.filter((w) => (w.phase === 'build' || w.phase === 'peak') && !w.recovery);
  if (normal.length) {
    const q = median(normal.map((w) => workouts.filter((x) => x.week === w.week && QUALITY.includes(x.kind)).length));
    out.push({ key: 'explain.quality', params: { n: q } });
  }

  if (profile.race && count('taper') > 0) out.push({ key: 'explain.taper', params: { weeks: count('taper') } });

  // Strength sessions in a normal week.
  const full = weeks.find((w) => !w.recovery && w.phase !== 'taper');
  if (full) {
    const n = workouts.filter((x) => x.week === full.week && x.kind.startsWith('strength_')).length;
    if (n > 0) out.push({ key: 'explain.strength', params: { n } });
  }
  return out;
}
