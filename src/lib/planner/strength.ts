// Strength sessions for runners and where to put them in the week.

import type { Equipment, Phase, Step, StrengthFocus, Weekday, WorkoutKind } from '../types';

type Role = 'main' | 'accessory' | 'core';
interface Exercise {
  name: string;
  role: Role;
}

const LOWER: Record<Equipment, Exercise[]> = {
  gym: [
    { name: 'Back squat', role: 'main' },
    { name: 'Romanian deadlift', role: 'main' },
    { name: 'Bulgarian split squat', role: 'main' },
    { name: 'Standing calf raise', role: 'accessory' },
    { name: 'Hip thrust', role: 'accessory' },
    { name: 'Copenhagen plank', role: 'core' },
  ],
  dumbbells: [
    { name: 'Goblet squat', role: 'main' },
    { name: 'Dumbbell Romanian deadlift', role: 'main' },
    { name: 'Dumbbell reverse lunge', role: 'main' },
    { name: 'Single-leg calf raise (holding DB)', role: 'accessory' },
    { name: 'Single-leg glute bridge', role: 'accessory' },
    { name: 'Side plank', role: 'core' },
  ],
  bodyweight: [
    { name: 'Tempo squat (3 s down)', role: 'main' },
    { name: 'Reverse lunge', role: 'main' },
    { name: 'Single-leg Romanian deadlift', role: 'main' },
    { name: 'Single-leg calf raise', role: 'accessory' },
    { name: 'Glute bridge march', role: 'accessory' },
    { name: 'Side plank', role: 'core' },
  ],
};

const UPPER: Record<Equipment, Exercise[]> = {
  gym: [
    { name: 'Bench press', role: 'main' },
    { name: 'Pull-up / lat pulldown', role: 'main' },
    { name: 'Seated cable row', role: 'main' },
    { name: 'Overhead press', role: 'accessory' },
    { name: 'Face pull', role: 'accessory' },
    { name: 'Dead bug', role: 'core' },
  ],
  dumbbells: [
    { name: 'Dumbbell floor press', role: 'main' },
    { name: 'One-arm dumbbell row', role: 'main' },
    { name: 'Dumbbell shoulder press', role: 'main' },
    { name: 'Reverse fly', role: 'accessory' },
    { name: 'Plank shoulder taps', role: 'core' },
    { name: 'Dead bug', role: 'core' },
  ],
  bodyweight: [
    { name: 'Push-up', role: 'main' },
    { name: 'Inverted row (table or bar)', role: 'main' },
    { name: 'Pike push-up', role: 'main' },
    { name: 'Y-T-W raises', role: 'accessory' },
    { name: 'Plank', role: 'core' },
    { name: 'Dead bug', role: 'core' },
  ],
};

export type StrengthType = 'upper' | 'lower' | 'full';
type Intensity = 'base' | 'build' | 'peak' | 'light';

function prescription(role: Role, intensity: Intensity, equipment: Equipment): { sets: number; reps: string; note?: string } {
  if (role === 'core') return { sets: intensity === 'light' ? 2 : 3, reps: '30–45 s' };
  if (role === 'accessory') return { sets: intensity === 'light' ? 2 : 3, reps: '12–15' };
  if (equipment === 'bodyweight') {
    if (intensity === 'build') return { sets: 4, reps: '12–15', note: 'slow 3 s lowering' };
    if (intensity === 'light') return { sets: 2, reps: '10' };
    return { sets: 3, reps: '10–12' };
  }
  switch (intensity) {
    case 'base':
      return { sets: 3, reps: '10–12', note: 'moderate load, 2–3 reps in reserve' };
    case 'build':
      return { sets: 4, reps: '5–6', note: 'heavy, 2 reps in reserve' };
    case 'peak':
      return { sets: 3, reps: '5', note: 'maintain load, stay crisp' };
    case 'light':
      return { sets: 2, reps: '6–8', note: 'light, no fatigue' };
  }
}

export function strengthSession(
  type: StrengthType,
  phase: Phase,
  recoveryWeek: boolean,
  equipment: Equipment,
): { kind: WorkoutKind; title: string; steps: Step[]; duration_min: number } {
  const intensity: Intensity = recoveryWeek || phase === 'taper' ? 'light' : phase;
  const pool =
    type === 'lower'
      ? LOWER[equipment]
      : type === 'upper'
        ? UPPER[equipment]
        : [...LOWER[equipment].slice(0, 2), ...UPPER[equipment].slice(0, 2), LOWER[equipment][3], UPPER[equipment][5]];
  const exercises = intensity === 'light' ? pool.slice(0, 4) : pool;
  const steps: Step[] = exercises.map((e) => ({ type: 'exercise', name: e.name, ...prescription(e.role, intensity, equipment) }));
  const label = type === 'lower' ? 'Lower body' : type === 'upper' ? 'Upper body' : 'Full body';
  const kind: WorkoutKind = type === 'lower' ? 'strength_lower' : type === 'upper' ? 'strength_upper' : 'strength_full';
  const duration = intensity === 'light' ? 25 : intensity === 'build' ? 45 : 40;
  return { kind, title: `${label} strength${intensity === 'light' ? ' (maintenance)' : ''}`, steps, duration_min: duration };
}

/** Which strength sessions to do in a given week. */
export function strengthTypesForWeek(
  focus: StrengthFocus,
  perWeek: number,
  week: number,
  phase: Phase,
  recoveryWeek: boolean,
  raceWeek: boolean,
): StrengthType[] {
  if (raceWeek || perWeek <= 0) return [];
  let n = perWeek;
  if (recoveryWeek) n = Math.max(1, n - 1);
  if (phase === 'taper') n = Math.min(n, focus === 'upper' ? 2 : 1);
  const types: StrengthType[] = [];
  for (let i = 0; i < n; i++) {
    if (focus === 'upper_lower') types.push((i + week) % 2 === 0 ? 'lower' : 'upper');
    else types.push(focus);
  }
  // Legs first so they get the best slots.
  return types.sort((a, b) => (a === 'upper' ? 1 : 0) - (b === 'upper' ? 1 : 0));
}

export type DayType = 'rest' | 'easy' | 'recovery' | 'quality' | 'long' | 'race';

const LEG_DAY_SCORE: Record<DayType, number> = { rest: 8, easy: 10, recovery: -10, quality: 15, long: -1000, race: -1000 };
const UPPER_DAY_SCORE: Record<DayType, number> = { rest: 12, easy: 10, recovery: 10, quality: 4, long: -50, race: -1000 };

/**
 * Pick a day for each strength session. Lower-body/full sessions avoid the long
 * run, the day before it and the day before a quality session ("hard days hard").
 */
export function placeStrength(
  dayTypes: DayType[],
  types: StrengthType[],
  availableDays: Weekday[],
): { type: StrengthType; day: Weekday }[] {
  const used = new Map<number, StrengthType>();
  const result: { type: StrengthType; day: Weekday }[] = [];
  for (const type of types) {
    let best = -1;
    let bestScore = -Infinity;
    for (let d = 0; d < 7; d++) {
      if (used.has(d) || dayTypes[d] === 'race') continue;
      const today = dayTypes[d];
      const next = d < 6 ? dayTypes[d + 1] : 'rest';
      const legs = type !== 'upper';
      let score = availableDays.includes(d as Weekday) ? 5 : 0;
      if (legs) {
        if (today === 'long') continue;
        if (next === 'long' || next === 'race') score -= 60;
        if (next === 'quality') score -= 40;
        score += LEG_DAY_SCORE[today];
      } else {
        score += UPPER_DAY_SCORE[today];
      }
      for (const n of [d - 1, d + 1]) {
        const other = used.get(n);
        if (!other) continue;
        if (legs && other !== 'upper') score -= 30;
        if (!legs && other === 'upper') score -= 15;
        score -= 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (best >= 0 && bestScore > -100) {
      used.set(best, type);
      result.push({ type, day: best as Weekday });
    }
  }
  return result;
}
