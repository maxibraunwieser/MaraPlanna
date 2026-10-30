// Data for the MaraPlanna Run app on the watch: VDOT, all target paces and
// today's run as a flat list of steps (repeats written out), so the watch only
// has to walk through them. Shared by the "watch" Edge Function and the tests.

import type { CalPaces, CalStep, CalUnits, CalWorkout, CalZone } from './calendar.ts';
import { glyphs } from './watchFeed.ts';

/** Single target paces get ± this many seconds per km. */
export const PACE_TOLERANCE_S = 5;

export interface RunStep {
  /** e.g. "Interval 2/5" or "Einlaufen" (see STEP_NAMES) */
  n: string;
  /** w = warm-up, a = active, r = recovery, c = cool-down */
  t: 'w' | 'a' | 'r' | 'c';
  /** Length: metres or seconds (one of them). */
  d?: number;
  s?: number;
  /** Target pace range in s/km (fast, slow); missing = run by feel. */
  lo?: number;
  hi?: number;
  /** Zone index for the FIT file (see ZONES). */
  z: number;
}

export interface RunFeed {
  v: 1;
  paired: true;
  vdot: number | null;
  units: CalUnits;
  /** s/km; ranges are [fast, slow]. */
  paces: CalPaces | null;
  /** Marathon goal time for the finish forecast on the watch (seconds for 42,195 m). */
  goal: { m: number; s: number } | null;
  workout: { title: string; z: number; steps: RunStep[] } | null;
}

const MARATHON_M = 42195;

/** Order of the run types on the watch (index = pace_zone in the FIT file; 0 = free run). */
export const ZONES: (CalZone | 'free')[] = ['free', 'easy', 'long', 'recovery', 'marathon', 'threshold', 'interval', 'repetition'];
const zoneIndex = (z: CalZone) => ZONES.indexOf(z);

const RUNS = new Set(['easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout', 'race']);
const HARDEST: CalZone[] = ['repetition', 'interval', 'threshold', 'marathon', 'long', 'easy', 'recovery'];

export function paceRange(paces: CalPaces, zone: CalZone): [number, number] {
  const p = paces[zone];
  return Array.isArray(p) ? [Math.round(p[0]), Math.round(p[1])] : [Math.round(p - PACE_TOLERANCE_S), Math.round(p + PACE_TOLERANCE_S)];
}

const length = (km?: number, min?: number) => (km ? { d: Math.round(km * 1000) } : min ? { s: Math.round(min * 60) } : {});

/** German names for the generic steps; run types keep the plan's terms (Easy, Threshold, …) as on the website. */
const STEP_NAMES: Record<string, string> = {
  'Warm-up': 'Einlaufen',
  'Cool-down': 'Auslaufen',
};
export const stepName = (label: string) => STEP_NAMES[label] ?? glyphs(label);

/** Plan steps → watch steps: repeats written out, recoveries without target, strides by feel. */
export function runSteps(steps: CalStep[], paces: CalPaces): RunStep[] {
  const out: RunStep[] = [];
  for (const s of steps) {
    if (s.type !== 'run') continue;
    const stride = s.label.startsWith('Strides');
    const t: RunStep['t'] = s.label === 'Warm-up' ? 'w' : s.label === 'Cool-down' ? 'c' : s.zone === 'recovery' ? 'r' : 'a';
    const name = stride ? 'Steigerung' : stepName(s.label);
    const reps = s.repeat ?? 1;
    const [lo, hi] = paceRange(paces, s.zone);
    for (let i = 1; i <= reps; i++) {
      out.push({ n: reps > 1 ? `${name} ${i}/${reps}` : name, t, ...length(s.distanceKm, s.durationMin), ...(stride ? {} : { lo, hi }), z: zoneIndex(s.zone) });
      const rec = length(s.recoveryKm, s.recoveryMin);
      if (i < reps && (rec.d || rec.s)) out.push({ n: 'Trabpause', t: 'r', ...rec, z: zoneIndex('recovery') });
    }
  }
  return out;
}

export function buildRunFeed(input: { vdot: number | null; paces: CalPaces | null; units: CalUnits; workouts: CalWorkout[]; goalS?: number | null }): RunFeed {
  const { paces } = input;
  const goalS = input.goalS && input.goalS > 0 ? Math.round(input.goalS) : null;
  const runs = input.workouts.filter((w) => RUNS.has(w.kind) && w.status !== 'skipped');
  const main = runs.find((w) => w.key_session) ?? runs[0];
  let workout: RunFeed['workout'] = null;
  if (main && paces) {
    const zones = main.steps.flatMap((s) => (s.type === 'run' ? [s.zone] : []));
    const hardest = HARDEST.find((z) => zones.includes(z)) ?? 'easy';
    let steps = runSteps(main.steps, paces);
    if (main.kind === 'race' && goalS) {
      // Race day: the target is the goal time, not the training marathon pace.
      const gp = goalS / (MARATHON_M / 1000);
      steps = steps.map((s) => (s.t === 'a' ? { ...s, lo: Math.round(gp - PACE_TOLERANCE_S), hi: Math.round(gp + PACE_TOLERANCE_S) } : s));
    }
    if (steps.length) workout = { title: glyphs(main.title), z: zoneIndex(hardest), steps };
  }
  return { v: 1, paired: true, vdot: input.vdot === null ? null : Math.round(input.vdot * 10) / 10, units: input.units, paces, goal: goalS ? { m: MARATHON_M, s: goalS } : null, workout };
}
