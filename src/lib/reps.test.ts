import { describe, expect, it } from 'vitest';
import type { ActivityDetails, ActivityLap, ActivitySample } from './types';
import { analyze, detectReps, type RepPlan } from './analysis';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { normalizeAnswers } from './answers';

// Paces (s/km) of a ~3:45 marathoner.
const P = { recovery: 415, easy: 358, threshold: 298, interval: 274 };

/** Deterministic random numbers (mulberry32) and a normal draw. */
function rng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  return { next, gauss };
}

type Seg = { sec: number; pace: number; hr: number };

/**
 * Watch data as it arrives: 1 s "truth" with 5 s accelerations between segments,
 * a noisy and lagging GPS speed reading, slightly noisy GPS distance, optional
 * GPS stalls, irregular "smart recording", then thinned out like the sync does.
 */
function watch(segs: Seg[], o: { seed?: number; step?: number; smart?: boolean; stalls?: number[] } = {}): ActivitySample[] {
  const r = rng(o.seed ?? 1);
  const truth: { v: number; hr: number }[] = [];
  let prevV = 1000 / segs[0].pace;
  for (const s of segs) {
    const v = 1000 / s.pace;
    for (let i = 0; i < s.sec; i++) {
      const k = Math.min(1, (i + 1) / 5);
      truth.push({ v: prevV + (v - prevV) * k, hr: s.hr });
    }
    prevV = v;
  }
  const records: ActivitySample[] = [];
  let d = 0;
  let next = 0;
  for (let t = 0; t < truth.length; t++) {
    const stall = o.stalls?.some((s) => t >= s && t < s + 8) ? 0.25 : o.stalls?.some((s) => t >= s + 8 && t < s + 16) ? 1.75 : 1;
    d += truth[t].v * (1 + 0.03 * r.gauss()) * stall;
    if (t < next) continue;
    const lagged = truth[Math.max(0, t - 3)].v;
    records.push({ t, d, hr: Math.round(truth[t].hr + 2 * r.gauss()), v: Math.max(0, lagged * (1 + 0.07 * r.gauss())), alt: 100 });
    next = t + (o.smart ? 1 + Math.floor(r.next() * 7) : 1);
  }
  // Thin out exactly like the Edge Function / FIT import.
  const step = o.step ?? 10;
  const out: ActivitySample[] = [];
  let lastT = -Infinity;
  for (const rec of records) {
    if (rec.t - lastT < step) continue;
    lastT = rec.t;
    out.push({ t: rec.t, d: Math.round(rec.d * 10) / 10, hr: rec.hr, v: Math.round(rec.v! * 100) / 100, alt: 100 });
  }
  return out;
}

const easy = (km: number): Seg => ({ sec: Math.round(km * P.easy * 1.03), pace: P.easy * 1.03, hr: 135 });
function session(reps: number, work: (i: number) => Seg, rec: Seg) {
  const segs: Seg[] = [easy(2)];
  for (let i = 0; i < reps; i++) {
    segs.push(work(i));
    if (i < reps - 1) segs.push(rec);
  }
  segs.push(easy(1.5));
  return segs;
}
const fartlekPlan: RepPlan = { reps: 6, targetPace: P.interval, easyPace: P.easy, repSeconds: 60, recoverySeconds: 60 };
const fartlek = (paceFactor = 1, done = 6) =>
  session(done, () => ({ sec: 60, pace: P.interval * paceFactor, hr: 168 }), { sec: 60, pace: P.recovery, hr: 142 });
const details = (samples: ActivitySample[], laps: ActivityLap[] = []): ActivityDetails => ({ laps, samples });
const meanDev = (reps: { deviationPct: number }[]) => reps.reduce((s, r) => s + r.deviationPct, 0) / reps.length;

describe('rep detection – short fartlek reps (6 × 1 min)', () => {
  it('finds all six in 10 s data with GPS noise and lag', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const reps = detectReps(details(watch(fartlek(), { seed })), fartlekPlan)!;
      expect(reps).toHaveLength(6);
      expect(Math.abs(meanDev(reps))).toBeLessThan(3);
      for (const r of reps) expect(Math.abs(r.durationS - 60)).toBeLessThan(13);
    }
  });

  it('finds all six in 5 s data with Garmin smart recording', () => {
    for (const seed of [11, 12, 13]) {
      const reps = detectReps(details(watch(fartlek(), { seed, step: 5, smart: true })), fartlekPlan)!;
      expect(reps).toHaveLength(6);
      expect(Math.abs(meanDev(reps))).toBeLessThan(3);
    }
  });

  it('measures reps that were 7 % too slow as about +7 %', () => {
    const reps = detectReps(details(watch(fartlek(1.07), { seed: 7 })), fartlekPlan)!;
    expect(reps).toHaveLength(6);
    expect(meanDev(reps)).toBeGreaterThan(4.5);
    expect(meanDev(reps)).toBeLessThan(9.5);
  });

  it('still finds reps run far slower than planned (tired day)', () => {
    const reps = detectReps(details(watch(fartlek(1.17), { seed: 8 })), fartlekPlan)!;
    expect(reps).toHaveLength(6);
    expect(meanDev(reps)).toBeGreaterThan(13);
  });

  it('a GPS stall inside a rep does not split it in two', () => {
    const segs = fartlek();
    const firstRepStart = segs[0].sec;
    const reps = detectReps(details(watch(segs, { seed: 9, stalls: [firstRepStart + 20, firstRepStart + 260] })), fartlekPlan)!;
    expect(reps).toHaveLength(6);
  });

  it('counts only the reps that were run', () => {
    const reps = detectReps(details(watch(fartlek(1, 4), { seed: 10 })), fartlekPlan)!;
    expect(reps).toHaveLength(4);
  });

  it('an easy run has no reps', () => {
    expect(detectReps(details(watch([easy(8)], { seed: 12 })), fartlekPlan)).toBeNull();
  });
});

describe('rep detection – longer reps', () => {
  it('threshold 3 × 2 km with 2 min jog, plus strides at the end that are not reps', () => {
    const segs = session(3, () => ({ sec: Math.round(2 * P.threshold), pace: P.threshold, hr: 165 }), { sec: 120, pace: P.recovery, hr: 140 });
    for (let i = 0; i < 6; i++) segs.push({ sec: 20, pace: 235, hr: 160 }, { sec: 60, pace: P.recovery, hr: 140 });
    const reps = detectReps(details(watch(segs, { seed: 21 })), { reps: 3, targetPace: P.threshold, easyPace: P.easy, repSeconds: 2 * P.threshold, recoverySeconds: 120 })!;
    expect(reps).toHaveLength(3);
    for (const r of reps) {
      expect(Math.abs(r.distanceM - 2000)).toBeLessThan(160);
      expect(Math.abs(r.deviationPct)).toBeLessThan(3);
    }
  });

  it('intervals 5 × 1000 m with 400 m jog', () => {
    const jog = { sec: Math.round(0.4 * P.recovery), pace: P.recovery, hr: 145 };
    const segs = session(5, () => ({ sec: Math.round(P.interval), pace: P.interval, hr: 172 }), jog);
    const reps = detectReps(details(watch(segs, { seed: 31 })), { reps: 5, targetPace: P.interval, easyPace: P.easy, repSeconds: P.interval, recoverySeconds: jog.sec })!;
    expect(reps).toHaveLength(5);
    for (const r of reps) expect(Math.abs(r.distanceM - 1000)).toBeLessThan(90);
  });
});

describe('rep detection – laps', () => {
  const lap = (startS: number, durationS: number, pace: number, intensity: string): ActivityLap => ({
    startS, durationS, distanceM: (durationS / pace) * 1000, avgSpeed: 1000 / pace, avgHr: 160, maxHr: 170, cadence: 180, intensity,
  });

  it('uses the work laps of a structured workout run on the watch', () => {
    const laps = [lap(0, 740, 370, 'warmup')];
    for (let i = 0; i < 6; i++) laps.push(lap(740 + i * 120, 61, 281, 'active'), lap(801 + i * 120, 59, 415, 'rest'));
    laps.push(lap(1460, 550, 370, 'cooldown'));
    const reps = detectReps(details(watch(fartlek(), { seed: 41 }), laps), fartlekPlan)!;
    expect(reps).toHaveLength(6);
    expect(reps[0].durationS).toBe(61);
    expect(reps[0].deviationPct).toBeCloseTo(((281 - P.interval) / P.interval) * 100, 1);
  });

  it('ignores 1 km auto laps and reads the stream instead', () => {
    const laps = Array.from({ length: 8 }, (_, i) => lap(i * 330, 330, 330, 'active'));
    const reps = detectReps(details(watch(fartlek(), { seed: 42 }), laps), fartlekPlan)!;
    expect(reps).toHaveLength(6);
    expect(Math.abs(meanDev(reps))).toBeLessThan(3);
  });
});

describe('full analysis of a fartlek from the plan', () => {
  const answers = normalizeAnswers({
    raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
    recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
  });
  const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' }), '2026-10-26');
  const plan = { id: 'p', user_id: 'u', status: 'active' as const, race_name: 'Vienna', race_date: answers.raceDate, start_date: '2026-10-26', inputs: answers, fitness: gen.fitness, weeks: gen.weeks, created_at: '', updated_at: '' };
  const draft = gen.workouts.find((w) => w.kind === 'fartlek')!;
  const main = draft.steps.find((s) => s.type === 'run' && s.repeat) as Extract<(typeof draft.steps)[number], { type: 'run' }>;
  const pz = gen.fitness.paces;

  const run = (factor: number, seed: number) => {
    const segs: Seg[] = [{ sec: Math.round(2 * pz.easy[1]), pace: pz.easy[1], hr: 135 }];
    for (let i = 0; i < main.repeat!; i++) {
      segs.push({ sec: main.durationMin! * 60, pace: pz.interval * factor, hr: 170 });
      if (i < main.repeat! - 1) segs.push({ sec: main.recoveryMin! * 60, pace: pz.recovery[1], hr: 145 });
    }
    segs.push({ sec: Math.round(1.5 * pz.easy[1]), pace: pz.easy[1], hr: 138 });
    const samples = watch(segs, { seed });
    const last = samples[samples.length - 1];
    const workout = { ...draft, id: 'w', plan_id: 'p', user_id: 'u', status: 'completed' as const, status_source: 'auto' as const, activity_id: 'a', actual_distance_km: last.d / 1000, original_date: null, note: null };
    const activity = {
      id: 'a', user_id: 'u', source: 'garmin' as const, external_id: '1', name: 'Run', sport: 'run' as const, sub_type: 'running', start_time: '', local_date: draft.date,
      duration_s: last.t, moving_s: last.t, distance_m: last.d, avg_hr: 150, max_hr: 175, elevation_gain_m: 0, calories: 0, training_load: 0, aerobic_te: 0, vo2max: null,
    };
    return analyze({ workout, activity, details: { laps: [], samples }, plan, activities: [activity], metrics: [], maxHr: 190 });
  };

  it(`detects all ${'reps'} and rewards a well-run session`, () => {
    const res = run(1, 51);
    expect(res.reps).toHaveLength(main.repeat!);
    expect(res.checks.find((c) => c.label === 'Work pace')?.status).toBe('good');
    expect(res.score!).toBeGreaterThanOrEqual(85);
  });

  it('marks clearly slow reps down', () => {
    const res = run(1.08, 52);
    expect(res.reps).toHaveLength(main.repeat!);
    expect(res.checks.find((c) => c.label === 'Work pace')?.status).not.toBe('good');
    expect(res.score!).toBeLessThan(run(1, 51).score!);
  });
});
