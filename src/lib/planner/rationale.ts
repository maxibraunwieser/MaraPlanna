// How a plan is put together, as steps with the plan's own numbers. The questionnaire plays these steps while the plan is built
// ("building your plan") and keeps them next to the result as the explanation. Every step carries the studies it rests on.
// Rule-based: the numbers come from the generated plan and the weekly model, so the text can never disagree with the plan.

import { fmtDistance, fmtPace } from '../format';
import type { DayTemplate, FitnessAssessment, OnboardingAnswers, Units, Weekday } from '../types';
import { STRENGTH_KINDS, isLegKind, isStrengthExtra, type StrengthKind } from '../onboarding/strengthMap';
import { timeLimits, type GeneratedPlan } from './generate';
import { zonePace } from './workouts';
import { autoWeek, weekInputOf } from './week';
import type { StrengthWhy } from './weekModel';

export const SOURCES = {
  daniels: "Daniels (2014): Daniels' Running Formula, 3rd ed. (VDOT and training paces)",
  nielsen: 'Nielsen et al. (2014): Excessive progression in weekly running distance and risk of running-related injuries. J Orthop Sports Phys Ther',
  pfitzinger: 'Pfitzinger & Douglas (2009): Advanced Marathoning (hard and easy days, long run, recovery weeks)',
  seiler: 'Seiler (2010): What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform',
  fokkema: 'Fokkema et al. (2020): Training for a (half-)marathon: training volume and longest endurance run related to performance and running injuries. Scand J Med Sci Sports',
  mujika: 'Mujika & Padilla (2003): Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc',
  bosquet: 'Bosquet et al. (2007): Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc',
  meeusen: 'Meeusen et al. (2013): Prevention, diagnosis and treatment of the overtraining syndrome (ECSS/ACSM consensus). Med Sci Sports Exerc',
  ronnestad: 'Rønnestad & Mujika (2014): Optimizing strength training for running and cycling endurance performance. Scand J Med Sci Sports',
  berryman: 'Berryman et al. (2018): Strength training for middle- and long-distance performance: a meta-analysis. Int J Sports Physiol Perform',
  wilson: 'Wilson et al. (2012): Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises. J Strength Cond Res',
  fyfe: 'Fyfe, Bishop & Stepto (2014): Interference between concurrent resistance and endurance exercise. Sports Med',
  robineau: 'Robineau et al. (2016): Specific training effects of concurrent aerobic and strength exercises depend on recovery duration. J Strength Cond Res',
  acsm: 'ACSM (2009): Progression models in resistance training for healthy adults. Med Sci Sports Exerc',
} as const;
export type SourceId = keyof typeof SOURCES;

export interface BuildStep {
  /** Message key suffix: `ob.build.<id>.t` (title) and `ob.build.<id>.x` (text). */
  id: string;
  params: Record<string, string | number>;
  sources: SourceId[];
}

/** The week as the plan uses it: from the weekly model, or from the week the person drew. */
export interface WeekFacts {
  drawn: boolean;
  runDays: Weekday[];
  longDay: Weekday;
  quality: Weekday[];
  strength: { kind: StrengthKind; day: Weekday; why: StrengthWhy }[];
  restDays: Weekday[];
  unplaced: number;
  longMinutes: number | null;
  longTight: boolean;
}

const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function weekFacts(a: OnboardingAnswers): WeekFacts {
  if (a.scheduleMode === 'custom' && a.customWeek?.length === 7) {
    const w: DayTemplate[] = a.customWeek;
    const runDays = ALL.filter((d) => w[d].run !== 'rest');
    const strength = ALL.flatMap((d) =>
      w[d].extras.filter((id) => (STRENGTH_KINDS as string[]).includes(id)).map((id) => ({
        kind: id as StrengthKind,
        day: d,
        why: (w[d].run === 'rest' ? 'rest' : w[d].run === 'quality' || w[d].run === 'long' ? 'hardDay' : 'easyDay') as StrengthWhy,
      })),
    );
    const longDay = (w.findIndex((d) => d.run === 'long') >= 0 ? w.findIndex((d) => d.run === 'long') : 6) as Weekday;
    const minutes = a.setup?.minutesPerDay?.[longDay];
    return {
      drawn: true,
      runDays,
      longDay,
      quality: ALL.filter((d) => w[d].run === 'quality'),
      strength,
      restDays: ALL.filter((d) => w[d].run === 'rest' && !w[d].extras.length && !a.setup?.unavailableDays.includes(d)),
      unplaced: 0,
      longMinutes: minutes && minutes < 120 ? minutes : null,
      longTight: false,
    };
  }
  const s = autoWeek(weekInputOf(a)).solution;
  return { drawn: false, runDays: s.runDays, longDay: s.longDay, quality: s.quality, strength: s.strength, restDays: s.restDays, unplaced: s.unplaced, longMinutes: s.longMinutes, longTight: s.longTight };
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const list = (days: number[], names: string[]) => days.map((d) => names[d]).join(', ');

interface Input {
  today: string;
  answers: OnboardingAnswers;
  plan: GeneratedPlan;
  assessment: FitnessAssessment;
  units: Units;
  /** Long weekday names in the language of the page, Monday first. */
  names: string[];
}

/** The steps of the running plan, in the order the plan is built. */
export function runBuildSteps({ answers, plan, assessment, units, names, today }: Input): BuildStep[] {
  const { weeks, fitness } = plan;
  const facts = weekFacts(answers);
  const out: BuildStep[] = [];
  const count = (phase: string) => weeks.filter((w) => w.phase === phase).length;

  out.push({
    id: 'run.level',
    params: { vdot: fitness.vdot, easy: fmtPace(zonePace(fitness.paces, 'easy'), units), tempo: fmtPace(zonePace(fitness.paces, 'threshold'), units) },
    sources: ['daniels'],
  });

  // Volume: the first full week to the highest, and the steepest step between normal weeks.
  const first = today > weeks[0].startDate && weeks.length > 2 ? 1 : 0;
  const peakKm = Math.max(...weeks.map((w) => w.targetKm));
  let steepest = 0;
  for (let i = first + 1; i < weeks.length; i++) {
    const [p, c] = [weeks[i - 1], weeks[i]];
    if (p.recovery || c.recovery || c.phase === 'taper' || p.targetKm <= 0) continue;
    steepest = Math.max(steepest, (c.targetKm - p.targetKm) / p.targetKm);
  }
  const capacity = timeLimits(answers, fitness.vdot).weeklyKm;
  out.push({
    // The days of the week cannot carry what the person runs now: the plan says so.
    id: assessment.weeklyKm > capacity * 1.1 ? 'run.load.capped' : 'run.load',
    params: {
      now: fmtDistance(assessment.weeklyKm, units, 0),
      start: fmtDistance(weeks[first].targetKm, units, 0),
      peak: fmtDistance(peakKm, units, 0),
      pct: Math.max(1, Math.round(steepest * 100)),
      cap: fmtDistance(capacity, units, 0),
      runs: facts.runDays.length,
    },
    sources: ['nielsen'],
  });

  out.push({
    id: facts.drawn ? 'run.days.drawn' : answers.setup?.runDaysMode === 'manual' ? 'run.days.manual' : facts.longTight ? 'run.days.tight' : facts.longMinutes === null ? 'run.days.auto.open' : 'run.days.auto',
    params: {
      runs: facts.runDays.length,
      days: list(facts.runDays, names),
      long: names[facts.longDay],
      minutes: facts.longMinutes ?? 0,
    },
    sources: [],
  });

  out.push({
    id: facts.quality.length ? 'run.hard' : 'run.hard.none',
    params: { n: facts.quality.length, days: list(facts.quality, names), long: names[facts.longDay] },
    sources: ['pfitzinger'],
  });

  out.push({ id: 'run.intensity', params: {}, sources: ['seiler'] });

  const longs = weeks.filter((w) => w.longKm > 0);
  if (longs.length) {
    const flat = Math.round(longs[0].longKm) === Math.round(Math.max(...longs.map((w) => w.longKm)));
    out.push({
      id: flat ? 'run.long.flat' : 'run.long',
      params: { from: fmtDistance(longs[0].longKm, units, 0), to: fmtDistance(Math.max(...longs.map((w) => w.longKm)), units, 0) },
      sources: ['fokkema', 'pfitzinger'],
    });
  }

  const recovery = weeks.filter((w) => w.recovery).map((w) => w.week);
  if (recovery.length) {
    const gaps = recovery.slice(1).map((w, i) => w - recovery[i]);
    out.push({ id: 'run.deload', params: { every: gaps.length ? median(gaps) : recovery[0] }, sources: ['meeusen', 'pfitzinger'] });
  }

  out.push({
    id: count('taper') ? 'run.phases.taper' : 'run.phases',
    params: { weeks: weeks.length, base: count('base'), build: count('build'), peak: count('peak'), taper: count('taper') },
    sources: count('taper') ? ['mujika', 'bosquet'] : [],
  });
  return out;
}

export interface StrengthFacts {
  count: number;
  recommended: number;
  desired: number;
  now: number;
  chosen: boolean;
  limitedBy: 'now' | 'days' | null;
  /** Minutes of a strength session. */
  minutes: number;
}

const KIND_ORDER: Record<StrengthKind, number> = { lower: 0, full: 1, upper: 2, cali: 3 };

/** The steps that bring the strength sessions into the running week. */
export function strengthBuildSteps(input: Input & { facts: StrengthFacts; kindNames: Record<StrengthKind, string>; whyNames: Record<StrengthWhy, string> }): BuildStep[] {
  const { answers, names, facts: f, kindNames, whyNames } = input;
  const week = weekFacts(answers);
  const out: BuildStep[] = [];

  const countId = f.chosen ? 'str.count.chosen' : f.limitedBy ? `str.count.limited.${f.limitedBy}` : f.now >= 1 && f.count === Math.min(f.now, 3) && f.desired < f.count ? 'str.count.habit' : 'str.count.share';
  out.push({
    id: countId,
    params: { n: f.count, rec: f.recommended, desired: f.desired, now: f.now, runPct: answers.setup?.runPct ?? 50 },
    sources: ['ronnestad', 'berryman'],
  });

  const withRun = week.strength.filter((s) => week.runDays.includes(s.day)).length;
  out.push({ id: 'str.time', params: { min: f.minutes, together: withRun, alone: week.strength.length - withRun }, sources: [] });

  const legs = week.strength.filter((s) => isLegKind(s.kind));
  out.push({ id: 'str.interference', params: { days: legs.length ? list(legs.map((s) => s.day), names) : '–', long: names[week.longDay] }, sources: ['wilson', 'fyfe', 'acsm', 'robineau'] });

  const placed = [...week.strength].sort((x, y) => x.day - y.day || KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);
  out.push({
    id: week.unplaced > 0 ? 'str.place.short' : 'str.place',
    params: { list: placed.map((s) => `${kindNames[s.kind]} – ${names[s.day]} (${whyNames[s.why]})`).join('; '), missing: week.unplaced },
    sources: ['ronnestad'],
  });

  out.push({
    id: !week.restDays.length ? 'str.rest.none' : week.restDays.includes(((week.longDay + 1) % 7) as Weekday) ? 'str.rest.after' : 'str.rest',
    params: { days: list(week.restDays, names) },
    sources: ['meeusen'],
  });

  out.push({ id: 'str.phase', params: {}, sources: ['ronnestad', 'berryman'] });
  return out;
}

export const hasStrength = (a: OnboardingAnswers) => a.extras.some(isStrengthExtra);
