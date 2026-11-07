// Post-workout analysis: what the session was for, how well it was executed
// and what it means for the marathon.
//
// References used for the coaching logic:
// - Fokkema et al. 2020 (Scand J Med Sci Sports): longest run, weekly volume
//   and training pace vs. marathon time in 441 recreational marathoners.
// - Doherty et al. 2020 (J Sci Med Sport): training volume / ≥32 km runs vs.
//   marathon performance (meta-regression).
// - Campos, Casado et al. 2022 (Int J Sports Med): intensity distribution.
// - Smyth et al. 2022 (Sports Med): lower pace:HR decoupling ↔ better marathons.
// - Tanda 2011 (J Hum Sport Exerc): marathon pace from 8-week weekly km + pace.
// - Llanos-Lagos et al. 2024 (Sports Med): strength training and running economy.

import type { Activity, ActivityDetails, ActivitySample, DailyMetric, PlannedWorkout, Step, TrainingPlan, WorkoutKind } from './types';
import { addDays } from './planner/dates';
import { median } from './planner/fitness';
import { vdotFromHeartRate } from './planner/vdot';
import { zonePace } from './planner/workouts';
import { isRunWorkout } from './planner/adapt';
import { tr, type MsgKey } from './i18n';

export type CheckStatus = 'good' | 'warn' | 'bad' | 'info';
export interface Check {
  /** Stable name of the check (the label is translated). */
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface RepResult {
  index: number;
  distanceM: number;
  durationS: number;
  paceS: number;
  avgHr: number | null;
  targetPaceS: number;
  deviationPct: number;
}

export interface Purpose {
  headline: string;
  why: string;
  marathon: string;
}

export interface Analysis {
  purpose: Purpose;
  score: number | null;
  grade: 'excellent' | 'good' | 'fair' | 'off' | null;
  completionPct: number | null;
  checks: Check[];
  zones: { zone: number; label: string; seconds: number; pct: number }[] | null;
  reps: RepResult[] | null;
  decouplingPct: number | null;
  fitness: { vdot: number | null; method: string | null; planVdot: number };
  projection: {
    tandaS: number | null;
    tandaWithoutS: number | null;
    deltaS: number | null;
    weeklyKm8: number | null;
    planS: number;
  };
  insights: string[];
}

// ---------------------------------------------------------------------------
// Purpose of each session type
// ---------------------------------------------------------------------------

const PURPOSE_KINDS: WorkoutKind[] = [
  'easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout', 'race',
  'strength_lower', 'strength_full', 'strength_upper', 'core', 'mobility', 'plyo', 'bike', 'swim', 'custom',
];

/** What a kind of session is for, in the language of the page. */
export const purposeFor = (kind: WorkoutKind): Purpose => {
  const k = PURPOSE_KINDS.includes(kind) ? kind : 'easy';
  return { headline: tr(`an.p.${k}.h` as MsgKey), why: tr(`an.p.${k}.why` as MsgKey), marathon: tr(`an.p.${k}.goal` as MsgKey) };
};

// ---------------------------------------------------------------------------
// Training-based marathon projection (Tanda 2011)
// ---------------------------------------------------------------------------

/** Marathon time from the 8 weeks of running before `endDate` (inclusive). */
export function tandaProjection(activities: Activity[], endDate: string, excludeId?: string) {
  const from = addDays(endDate, -55);
  const all = activities.filter((a) => a.sport === 'run' && (a.distance_m ?? 0) > 500 && (a.moving_s ?? a.duration_s));
  const earliest = all.reduce<string | null>((m, a) => (!m || a.local_date < m ? a.local_date : m), null);
  if (!earliest || earliest > addDays(from, 14)) return null; // need ~8 weeks of history
  const runs = all.filter((a) => a.local_date >= from && a.local_date <= endDate && a.id !== excludeId);
  if (runs.length < 8) return null;
  const km = runs.reduce((s, a) => s + a.distance_m! / 1000, 0);
  const sec = runs.reduce((s, a) => s + (a.moving_s ?? a.duration_s)!, 0);
  const weeklyKm = km / 8;
  const paceS = sec / km;
  const marathonPace = 17.1 + 140 * Math.exp(-0.0053 * weeklyKm) + 0.55 * paceS;
  return { seconds: Math.round(marathonPace * 42.195), weeklyKm, paceS };
}

// ---------------------------------------------------------------------------
// Stream helpers
// ---------------------------------------------------------------------------

const pace = (v: number) => 1000 / v;

function hrZones(samples: ActivitySample[], maxHr: number) {
  const bounds = [0.6, 0.7, 0.8, 0.9];
  const labels = [1, 2, 3, 4, 5].map((n) => tr(`an.hz.${n}` as MsgKey));
  const secs = [0, 0, 0, 0, 0];
  for (let i = 0; i < samples.length - 1; i++) {
    const hr = samples[i].hr;
    if (!hr) continue;
    const dt = Math.min(30, samples[i + 1].t - samples[i].t);
    const z = bounds.filter((b) => hr / maxHr >= b).length;
    secs[z] += dt;
  }
  const total = secs.reduce((a, b) => a + b, 0);
  if (total < 60) return null;
  return secs.map((s, i) => ({ zone: i + 1, label: labels[i], seconds: s, pct: (s / total) * 100 }));
}

/** Pace:HR decoupling between first and second half (after a 10 min warm-up). */
function decoupling(samples: ActivitySample[], maxDistanceM = Infinity): number | null {
  const pts = samples.filter((s) => s.t >= 600 && s.d <= maxDistanceM && s.hr && s.v && s.v > 1.5);
  if (pts.length < 20 || pts[pts.length - 1].t - pts[0].t < 1800) return null;
  const mid = (pts[0].t + pts[pts.length - 1].t) / 2;
  const ef = (ps: ActivitySample[]) => ps.reduce((s, p) => s + p.v!, 0) / ps.reduce((s, p) => s + p.hr!, 0);
  const first = ef(pts.filter((p) => p.t < mid));
  const second = ef(pts.filter((p) => p.t >= mid));
  return ((first - second) / first) * 100;
}

function segmentStats(samples: ActivitySample[], from: number, to: number) {
  const seg = samples.slice(from, to + 1);
  const hr = seg.filter((s) => s.hr).map((s) => s.hr!);
  const distanceM = seg[seg.length - 1].d - seg[0].d;
  const durationS = seg[seg.length - 1].t - seg[0].t;
  return { distanceM, durationS, avgHr: hr.length ? hr.reduce((a, b) => a + b, 0) / hr.length : null };
}

export interface RepPlan {
  /** Planned number of work reps. */
  reps: number;
  /** Target pace of the reps, s/km. */
  targetPace: number;
  /** Fast end of the easy range, s/km. */
  easyPace: number;
  /** Planned duration of one rep and of the recovery between reps, s. */
  repSeconds: number;
  recoverySeconds: number;
}

type RepStat = { distanceM: number; durationS: number; avgHr: number | null; paceS?: number };

/** Weighted two-class split (Otsu) of speeds: where "fast" and "slow" running separate best. */
function speedSplit(values: { v: number; w: number }[]) {
  const xs = [...values].sort((a, b) => a.v - b.v);
  const W = xs.reduce((s, x) => s + x.w, 0);
  const S = xs.reduce((s, x) => s + x.w * x.v, 0);
  let best: { threshold: number; slow: number; fast: number } | null = null;
  let bestVar = 0;
  let w0 = 0;
  let s0 = 0;
  for (let k = 0; k < xs.length - 1; k++) {
    w0 += xs[k].w;
    s0 += xs[k].w * xs[k].v;
    if (xs[k + 1].v === xs[k].v) continue;
    const m0 = s0 / w0;
    const m1 = (S - s0) / (W - w0);
    const between = w0 * (W - w0) * (m1 - m0) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = { threshold: (xs[k].v + xs[k + 1].v) / 2, slow: m0, fast: m1 };
    }
  }
  return best;
}

/** Work reps in the pace stream. Speeds come from distance over time (robust against single GPS readings). */
function streamReps(samples: ActivitySample[], plan: RepPlan): RepStat[] | null {
  if (samples.length < 10) return null;
  const iv: { dt: number; dd: number; v: number; hr: number | null }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const dd = Math.max(0, b.d - a.d);
    // A long gap is a pause; without distance (treadmill) fall back to the speed reading.
    const v = dt > 30 ? 0 : dd > 0 ? dd / dt : (b.v ?? 0);
    const hrs = [a.hr, b.hr].filter((h): h is number => !!h);
    iv.push({ dt, dd, v, hr: hrs.length ? hrs.reduce((x, y) => x + y, 0) / hrs.length : null });
  }

  // Fast vs slow: split the run's own speeds; fall back to halfway between target and easy pace.
  const easySpeed = 1000 / plan.easyPace;
  const split = speedSplit(iv.filter((x) => x.v > 1).map((x) => ({ v: x.v, w: x.dt })));
  const cut = split && split.fast / split.slow >= 1.08 && split.threshold > easySpeed ? split.threshold : 1000 / ((plan.targetPace + plan.easyPace) / 2);
  const fast = iv.map((x) => x.v >= cut);
  const slowRef = split?.slow ?? easySpeed * 0.9;

  // Segments of fast running; short dips (GPS) inside a rep are bridged, the planned recovery is not.
  const bridge = Math.min(20, Math.max(8, plan.recoverySeconds * 0.35));
  const segments: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  let gap = 0;
  for (let k = 0; k < iv.length; k++) {
    if (fast[k]) {
      if (cur && gap <= bridge) cur.end = k;
      else {
        if (cur) segments.push(cur);
        cur = { start: k, end: k };
      }
      gap = 0;
    } else if (cur) {
      gap += iv[k].dt;
    }
  }
  if (cur) segments.push(cur);

  const stats = segments.map((s) => {
    const core = iv.slice(s.start, s.end + 1);
    const work = core.filter((_, j) => fast[s.start + j]);
    const workS = work.reduce((x, y) => x + y.dt, 0);
    const speed = work.reduce((x, y) => x + y.dd, 0) / workS || work.reduce((x, y) => x + y.v * y.dt, 0) / workS;
    let durationS = core.reduce((x, y) => x + y.dt, 0);
    // The intervals either side are partly rep, partly recovery: count the fast share.
    for (const edge of [iv[s.start - 1], iv[s.end + 1]]) {
      if (edge && edge.v > slowRef && speed > slowRef) durationS += Math.min(1, (edge.v - slowRef) / (speed - slowRef)) * edge.dt;
    }
    const hrw = core.filter((x) => x.hr);
    const avgHr = hrw.length ? hrw.reduce((x, y) => x + y.hr! * y.dt, 0) / hrw.reduce((x, y) => x + y.dt, 0) : null;
    return { durationS, distanceM: durationS * speed, paceS: 1000 / speed, avgHr, start: s.start };
  });

  // Reps are about the planned length; much shorter surges (strides) and long easy stretches drop out.
  const E = plan.repSeconds;
  let cands = stats.filter((c) => c.durationS >= Math.max(15, E * 0.45) && c.durationS <= E * 2.2 + 20);
  if (!cands.length) return null;
  if (cands.length > plan.reps) {
    cands = [...cands].sort((a, b) => Math.abs(Math.log(a.durationS / E)) - Math.abs(Math.log(b.durationS / E))).slice(0, plan.reps);
  }
  return cands.sort((a, b) => a.start - b.start).map(({ start: _, ...r }) => r);
}

/**
 * Find the work reps of a structured session: the watch's own workout laps,
 * laps pressed by the athlete, or the pace stream.
 */
export function detectReps(details: ActivityDetails | null, plan: RepPlan): RepResult[] | null {
  if (!details) return null;
  const E = plan.repSeconds;
  const enough = (n: number) => n >= Math.max(1, Math.ceil(plan.reps * 0.6));
  const make = (list: RepStat[]): RepResult[] =>
    list
      .filter((r) => r.distanceM > 30 && r.durationS > 0)
      .map((r, i) => {
        const p = r.paceS ?? r.durationS / (r.distanceM / 1000);
        return { index: i + 1, distanceM: r.distanceM, durationS: r.durationS, avgHr: r.avgHr, paceS: p, targetPaceS: plan.targetPace, deviationPct: ((p - plan.targetPace) / plan.targetPace) * 100 };
      });
  const fromLap = (l: ActivityDetails['laps'][number]): RepStat => ({ distanceM: l.distanceM, durationS: l.durationS, avgHr: l.avgHr });

  // 1) A structured workout run on the watch marks work and rest laps.
  const laps = details.laps;
  if (laps.some((l) => l.intensity === 'rest' || l.intensity === 'recovery')) {
    const work = laps.filter((l) => (l.intensity === 'active' || l.intensity === 'interval') && l.durationS >= E * 0.4 && l.durationS <= E * 2.5 && l.distanceM > 0);
    if (enough(work.length)) return make(work.slice(0, plan.reps).map(fromLap));
  }

  // 2) Lap button pressed at the start and end of each rep.
  const cutoff = (plan.targetPace + plan.easyPace) / 2;
  const lapReps = laps.filter((l) => l.avgSpeed && pace(l.avgSpeed) <= cutoff && l.durationS >= E * 0.5 && l.durationS <= E * 1.6);
  if (enough(lapReps.length)) return make(lapReps.map(fromLap));

  // 3) The pace stream.
  const fromStream = streamReps(details.samples, plan);
  return fromStream ? make(fromStream) : null;
}

function mainStep(steps: Step[]) {
  return steps.find((x): x is Extract<Step, { type: 'run' }> => x.type === 'run' && x.label !== 'Warm-up' && x.label !== 'Cool-down');
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const STEADY: WorkoutKind[] = ['easy', 'recovery', 'long', 'shakeout'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function analyze(input: {
  workout: PlannedWorkout | null;
  activity: Activity | null;
  details: ActivityDetails | null;
  plan: TrainingPlan;
  activities: Activity[];
  metrics: DailyMetric[];
  maxHr: number | null;
}): Analysis {
  const { workout: w, activity: a, details, plan, activities, metrics } = input;
  const paces = plan.fitness.paces;
  const kind: WorkoutKind = w?.kind ?? (a?.sport === 'run' ? 'easy' : a?.sport === 'strength' ? 'strength_full' : 'custom');
  const purpose = purposeFor(kind);
  const checks: Check[] = [];
  const insights: string[] = [];
  const parts: { weight: number; score: number }[] = [];
  const maxHr = input.maxHr;
  const restingHr = median(metrics.filter((m) => m.resting_hr).slice(-14).map((m) => m.resting_hr!));

  const empty: Analysis = {
    purpose,
    score: null,
    grade: null,
    completionPct: null,
    checks,
    zones: null,
    reps: null,
    decouplingPct: null,
    fitness: { vdot: null, method: null, planVdot: plan.fitness.vdot },
    projection: { tandaS: null, tandaWithoutS: null, deltaS: null, weeklyKm8: null, planS: plan.fitness.predictedMarathonS },
    insights,
  };
  if (!a) {
    if (w && w.status === 'missed') insights.push(tr('an.i.noActivity'));
    return empty;
  }

  // Non-running sessions: done is done.
  if (w && !isRunWorkout(w)) {
    const minutes = (a.duration_s ?? 0) / 60;
    checks.push({ id: 'completed', label: tr('an.chk.completed'), status: 'good', detail: tr('an.d.completed', { min: Math.round(minutes) || w.duration_min || 0 }) });
    if (w.duration_min && minutes && minutes < w.duration_min * 0.6)
      checks.push({ id: 'duration', label: tr('an.chk.duration'), status: 'warn', detail: tr('an.d.shorter', { min: Math.round(minutes), plan: w.duration_min }) });
    return { ...empty, score: 100, grade: 'excellent', completionPct: 100, checks };
  }

  const km = (a.distance_m ?? 0) / 1000;
  const moving = a.moving_s ?? a.duration_s ?? 0;
  const avgPace = km > 0 ? moving / km : null;
  const samples = details?.samples ?? [];

  // --- Completion ---------------------------------------------------------
  let completionPct: number | null = null;
  if (w?.distance_km && km) {
    completionPct = Math.round((km / w.distance_km) * 100);
    const status: CheckStatus = completionPct >= 90 ? 'good' : completionPct >= 75 ? 'warn' : 'bad';
    checks.push({ id: 'distance', label: tr('an.chk.distance'), status, detail: tr('an.d.distance', { km: km.toFixed(1), plan: w.distance_km, pct: completionPct }) });
    parts.push({ weight: 40, score: Math.min(100, completionPct) - Math.max(0, completionPct - 120) / 2 });
    if (completionPct > 120) insights.push(tr('an.i.further', { pct: completionPct - 100 }));
  }

  // --- Pace ---------------------------------------------------------------
  let reps: RepResult[] | null = null;
  const main = w ? mainStep(w.steps) : undefined;
  if (avgPace && (STEADY.includes(kind) || !w)) {
    const zone = kind === 'recovery' ? paces.recovery : kind === 'long' ? paces.long : paces.easy;
    const [fast, slow] = zone;
    if (avgPace < fast * 0.97) {
      const pct = ((fast - avgPace) / fast) * 100;
      checks.push({ id: 'pace', label: tr('an.chk.pace'), status: pct > 8 ? 'bad' : 'warn', detail: tr('an.d.paceFast', { pace: fmt(avgPace), pct: pct.toFixed(0), fast: fmt(fast), slow: fmt(slow) }) });
      parts.push({ weight: 35, score: Math.max(30, 100 - pct * 7) });
      insights.push(tr('an.i.tooFast'));
    } else {
      checks.push({ id: 'pace', label: tr('an.chk.pace'), status: 'good', detail: tr(kind === 'long' ? 'an.d.paceOkLong' : 'an.d.paceOkEasy', { pace: fmt(avgPace), fast: fmt(fast), slow: fmt(slow) }) });
      parts.push({ weight: 35, score: 100 });
    }
  } else if (w && main && kind === 'long_mp') {
    const mpKm = main.distanceKm ?? 0;
    const total = samples.length ? samples[samples.length - 1].d : 0;
    if (samples.length && total > mpKm * 1000) {
      const startIdx = samples.findIndex((s) => s.d >= total - mpKm * 1000);
      const st = segmentStats(samples, startIdx, samples.length - 1);
      const p = st.durationS / (st.distanceM / 1000);
      const dev = ((p - paces.marathon) / paces.marathon) * 100;
      reps = [{ index: 1, ...st, paceS: p, targetPaceS: paces.marathon, deviationPct: dev }];
      const ok = Math.abs(dev) <= 3;
      checks.push({ id: 'mpFinish', label: tr('an.chk.mpFinish'), status: ok ? 'good' : Math.abs(dev) <= 6 ? 'warn' : 'bad', detail: tr('an.d.mpFinish', { km: mpKm, pace: fmt(p), target: fmt(paces.marathon) }) });
      parts.push({ weight: 35, score: Math.max(30, 100 - Math.max(0, Math.abs(dev) - 2) * 10) });
      if (dev < -4) insights.push(tr('an.i.mpFast'));
    } else {
      checks.push({ id: 'mpFinish', label: tr('an.chk.mpFinish'), status: 'info', detail: tr('an.d.mpNeedsGps') });
    }
  } else if (w && main) {
    const target = zonePace(paces, main.zone);
    const repCount = main.repeat ?? 1;
    const repSeconds = main.durationMin ? main.durationMin * 60 : (main.distanceKm ?? 1) * target;
    const recoverySeconds = main.recoveryMin ? main.recoveryMin * 60 : (main.recoveryKm ?? 0) * zonePace(paces, 'recovery');
    reps = detectReps(details, { reps: repCount, targetPace: target, easyPace: paces.easy[0], repSeconds, recoverySeconds });
    if (reps?.length) {
      const devs = reps.map((r) => r.deviationPct);
      const meanAbs = devs.reduce((s, d) => s + Math.abs(d), 0) / devs.length;
      const meanDev = devs.reduce((s, d) => s + d, 0) / devs.length;
      const repPaces = reps.map((r) => r.paceS);
      const avgRep = repPaces.reduce((s, p) => s + p, 0) / repPaces.length;
      const cv = Math.sqrt(repPaces.reduce((s, p) => s + (p - avgRep) ** 2, 0) / repPaces.length) / avgRep;
      const status: CheckStatus = meanAbs <= 3 ? 'good' : meanAbs <= 6 ? 'warn' : 'bad';
      checks.push({
        id: 'workPace', label: tr('an.chk.workPace'),
        status,
        detail: tr('an.d.workPace', { n: reps.length, reps: repCount, avg: fmt(avgRep), target: fmt(target), dev: `${meanDev > 0 ? '+' : ''}${meanDev.toFixed(1)}` }),
      });
      checks.push({ id: 'consistency', label: tr('an.chk.consistency'), status: cv < 0.03 ? 'good' : cv < 0.06 ? 'warn' : 'bad', detail: tr('an.d.consistency', { pct: (cv * 100).toFixed(1) }) });
      parts.push({ weight: 35, score: Math.max(30, 100 - Math.max(0, meanAbs - 2) * 10 - (reps.length < repCount ? 10 : 0)) });
      if (meanDev < -4) insights.push(tr('an.i.repsFaster'));
      else if (meanDev > 4) insights.push(tr('an.i.repsSlower'));
      if (repPaces.length >= 3 && repPaces[repPaces.length - 1] < repPaces[0] * 0.98) insights.push(tr('an.i.gotFaster'));
      if (reps.length < repCount) insights.push(tr('an.i.fewReps', { n: reps.length, total: repCount }));
    } else if (avgPace) {
      checks.push({ id: 'workPace', label: tr('an.chk.workPace'), status: 'info', detail: details ? tr('an.d.noReps') : tr('an.d.noStream') });
    }
  }

  // --- Heart rate --------------------------------------------------------
  const zones = maxHr && samples.length ? hrZones(samples, maxHr) : null;
  let decouplingPct: number | null = null;
  if (maxHr && a.avg_hr) {
    const rel = a.avg_hr / maxHr;
    if (STEADY.includes(kind) || !w) {
      const limit = kind === 'long' ? 0.8 : 0.78;
      const status: CheckStatus = rel <= limit ? 'good' : rel <= limit + 0.04 ? 'warn' : 'bad';
      checks.push({ id: 'hr', label: tr('an.chk.hr'), status, detail: tr('an.d.hr', { avg: a.avg_hr, pct: Math.round(rel * 100), limit: Math.round(limit * 100) }) });
      parts.push({ weight: 25, score: status === 'good' ? 100 : status === 'warn' ? 70 : 40 });
    } else if (reps?.length && reps.some((r) => r.avgHr)) {
      const repHr = reps.filter((r) => r.avgHr).reduce((s, r) => s + r.avgHr!, 0) / reps.filter((r) => r.avgHr).length;
      const repRel = repHr / maxHr;
      const [lo, hi] = kind === 'intervals' ? [0.88, 0.98] : kind === 'threshold' ? [0.83, 0.93] : kind === 'marathon_pace' || kind === 'long_mp' ? [0.78, 0.9] : [0.8, 0.95];
      const status: CheckStatus = repRel >= lo && repRel <= hi ? 'good' : 'warn';
      checks.push({ id: 'effort', label: tr('an.chk.effort'), status, detail: tr('an.d.effort', { hr: Math.round(repHr), pct: Math.round(repRel * 100), lo: Math.round(lo * 100), hi: Math.round(hi * 100) }) });
      parts.push({ weight: 25, score: status === 'good' ? 100 : 70 });
      if (repRel < lo - 0.03) insights.push(tr('an.i.hrLow'));
    }
    if (kind === 'long' || kind === 'long_mp' || (!w && moving > 4500)) {
      const mpKm = kind === 'long_mp' ? (main?.distanceKm ?? 0) : 0;
      const total = samples.length ? samples[samples.length - 1].d : 0;
      decouplingPct = samples.length ? decoupling(samples, total - mpKm * 1000) : null;
      if (decouplingPct !== null) {
        const status: CheckStatus = decouplingPct < 5 ? 'good' : decouplingPct < 8 ? 'warn' : 'bad';
        checks.push({ id: 'decoupling', label: tr('an.chk.decoupling'), status, detail: tr('an.d.decoupling', { pct: decouplingPct.toFixed(1) }) });
        if (kind === 'long') parts.push({ weight: 15, score: status === 'good' ? 100 : status === 'warn' ? 70 : 45 });
        insights.push(tr(decouplingPct < 5 ? 'an.i.driftLow' : 'an.i.driftHigh'));
      }
    }
  } else if (!a.avg_hr) {
    checks.push({ id: 'hr', label: tr('an.chk.hr'), status: 'info', detail: tr('an.d.noHr') });
  }

  // --- Fitness signal -----------------------------------------------------
  let vdot: number | null = null;
  let method: string | null = null;
  if (maxHr && restingHr) {
    if (reps?.length && reps.every((r) => r.avgHr)) {
      const d = reps.reduce((s, r) => s + r.distanceM, 0);
      const t = reps.reduce((s, r) => s + r.durationS, 0);
      const hr = reps.reduce((s, r) => s + r.avgHr! * r.durationS, 0) / t;
      vdot = vdotFromHeartRate(d, t, hr, restingHr, maxHr);
      method = tr('an.m.reps');
    } else if (a.distance_m && moving && a.avg_hr && (STEADY.includes(kind) || !w)) {
      vdot = vdotFromHeartRate(a.distance_m, moving, a.avg_hr, restingHr, maxHr);
      method = tr('an.m.run');
    }
  }
  if (vdot) {
    const diff = vdot - plan.fitness.vdot;
    if (Math.abs(diff) >= 1.5)
      insights.push(tr(diff > 0 ? 'an.i.vdotUp' : 'an.i.vdotDown', { vdot: vdot.toFixed(1), plan: plan.fitness.vdot.toFixed(1) }));
  }

  // --- Marathon projection (Tanda) ---------------------------------------
  const withRun = tandaProjection(activities, a.local_date);
  const withoutRun = tandaProjection(activities, a.local_date, a.id);
  const deltaS = withRun && withoutRun ? withRun.seconds - withoutRun.seconds : null;

  if (kind === 'long' || kind === 'long_mp') {
    const bigRuns = activities.filter((x) => x.sport === 'run' && (x.distance_m ?? 0) >= 28_000 && x.local_date >= plan.start_date).length;
    insights.push(tr('an.i.bigRuns', { n: bigRuns, goal: plan.fitness.peakLongKm >= 32 ? '3–4' : '2–3' }));
  }

  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = total ? Math.round(parts.reduce((s, p) => s + p.weight * p.score, 0) / total) : null;
  const grade = score === null ? null : score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'off';

  return {
    purpose,
    score,
    grade,
    completionPct,
    checks,
    zones,
    reps,
    decouplingPct,
    fitness: { vdot, method, planVdot: plan.fitness.vdot },
    projection: {
      tandaS: withRun?.seconds ?? null,
      tandaWithoutS: withoutRun?.seconds ?? null,
      deltaS,
      weeklyKm8: withRun?.weeklyKm ?? null,
      planS: plan.fitness.predictedMarathonS,
    },
    insights,
  };
}
