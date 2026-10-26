// Non-running sessions (strength, core, mobility, plyometrics, cross-training,
// custom) and where to put them in the week.
//
// Evidence: heavy-load, plyometric and combined strength training improve
// running economy in distance runners (Llanos-Lagos et al., Sports Med 2024),
// typically 2–3 sessions/week for 8–12 weeks.

import type { Equipment, ExtraSession, ExtraType, Phase, Step, Weekday, WorkoutKind } from '../types';

export type ExtraLoad = 'legs' | 'light' | 'cross';

export const EXTRA_INFO: Record<ExtraType, { label: string; hint: string; load: ExtraLoad; kind: WorkoutKind }> = {
  lower: { label: 'Lower body', hint: 'Legs, glutes, calves – best for running economy', load: 'legs', kind: 'strength_lower' },
  upper: { label: 'Upper body', hint: 'Back, shoulders, arms – posture late in the race', load: 'light', kind: 'strength_upper' },
  full: { label: 'Full body', hint: 'Everything in one session', load: 'legs', kind: 'strength_full' },
  core: { label: 'Core', hint: 'Trunk stability, 20–25 min', load: 'light', kind: 'core' },
  mobility: { label: 'Mobility / yoga', hint: 'Hips, ankles, recovery', load: 'light', kind: 'mobility' },
  plyo: { label: 'Plyometrics & drills', hint: 'Jumps and skips for springy, economical legs', load: 'legs', kind: 'plyo' },
  bike: { label: 'Cycling', hint: 'Low-impact aerobic cross-training', load: 'cross', kind: 'bike' },
  swim: { label: 'Swimming', hint: 'Low-impact aerobic cross-training', load: 'cross', kind: 'swim' },
  custom: { label: 'Own workout', hint: 'Anything else, e.g. climbing or football', load: 'light', kind: 'custom' },
};

export const extraLoad = (e: ExtraSession): ExtraLoad => (e.type === 'custom' ? (e.hard ? 'legs' : 'light') : EXTRA_INFO[e.type].load);

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
      return { sets: 4, reps: '4–6', note: 'heavy (~80–85 % 1RM), 2 reps in reserve' };
    case 'peak':
      return { sets: 3, reps: '4–5', note: 'keep the load, fewer sets' };
    case 'light':
      return { sets: 2, reps: '6–8', note: 'light, no fatigue' };
  }
}

const ex = (name: string, sets: number, reps: string, note?: string): Step => ({ type: 'exercise', name, sets, reps, ...(note ? { note } : {}) });

function coreSession(intensity: Intensity, equipment: Equipment): Step[] {
  const sets = intensity === 'light' ? 2 : 3;
  return [
    ex('Dead bug', sets, '10 / side'),
    ex('Side plank', sets, '30–45 s / side'),
    ex('Bird dog', sets, '10 / side'),
    ex(equipment === 'bodyweight' ? 'Hollow hold' : 'Pallof press (band/cable)', sets, equipment === 'bodyweight' ? '20–30 s' : '10 / side'),
    ex('Front plank', sets, '45 s'),
  ];
}

function mobilitySession(): Step[] {
  return [
    ex('Hip flexor stretch (half kneeling)', 2, '45 s / side'),
    ex('90/90 hip switches', 2, '8 / side'),
    ex('Ankle dorsiflexion rocks', 2, '10 / side'),
    ex('Thoracic rotations', 2, '8 / side'),
    ex("World's greatest stretch", 2, '5 / side'),
    ex('Calf & soleus stretch', 2, '45 s / side'),
  ];
}

function plyoSession(phase: Phase, light: boolean): Step[] {
  const drills = [ex('A-skips', 3, '20 m'), ex('B-skips', 3, '20 m'), ex('Pogo hops (stiff ankles)', 3, '15')];
  if (light || phase === 'taper') return [ex('A-skips', 2, '20 m'), ex('Pogo hops', 2, '10'), ex('Strides', 1, '4 × 20 s')];
  if (phase === 'base') return [...drills, ex('Skipping for height', 3, '20 m')];
  return [
    ...drills,
    ex('Bounding', phase === 'peak' ? 3 : 4, '30 m'),
    ex('Box / tuck jumps', 3, '6'),
    ex('Single-leg hops', 3, '8 / leg', 'land softly, full recovery between sets'),
  ];
}

function strengthSteps(type: 'upper' | 'lower' | 'full', intensity: Intensity, equipment: Equipment): Step[] {
  const pool =
    type === 'lower'
      ? LOWER[equipment]
      : type === 'upper'
        ? UPPER[equipment]
        : [...LOWER[equipment].slice(0, 2), ...UPPER[equipment].slice(0, 2), LOWER[equipment][3], UPPER[equipment][5]];
  const exercises = intensity === 'light' ? pool.slice(0, 4) : pool;
  return exercises.map((e) => ({ type: 'exercise', name: e.name, ...prescription(e.role, intensity, equipment) }));
}

export function extraSession(
  extra: ExtraSession,
  phase: Phase,
  recoveryWeek: boolean,
  equipment: Equipment,
): { kind: WorkoutKind; title: string; steps: Step[]; duration_min: number } {
  const light = recoveryWeek || phase === 'taper';
  const intensity: Intensity = light ? 'light' : phase;
  const kind = EXTRA_INFO[extra.type].kind;
  const suffix = light && extraLoad(extra) === 'legs' ? ' (maintenance)' : '';
  switch (extra.type) {
    case 'upper':
    case 'lower':
    case 'full': {
      const label = extra.type === 'lower' ? 'Lower body' : extra.type === 'upper' ? 'Upper body' : 'Full body';
      return { kind, title: `${label} strength${suffix}`, steps: strengthSteps(extra.type, intensity, equipment), duration_min: light ? 25 : intensity === 'build' ? 45 : 40 };
    }
    case 'core':
      return { kind, title: 'Core stability', steps: coreSession(intensity, equipment), duration_min: light ? 15 : 25 };
    case 'mobility':
      return { kind, title: 'Mobility', steps: mobilitySession(), duration_min: 20 };
    case 'plyo':
      return { kind, title: `Plyometrics & drills${suffix}`, steps: plyoSession(phase, light), duration_min: light ? 15 : 25 };
    case 'bike': {
      const min = light ? 30 : phase === 'base' ? 45 : 60;
      return { kind, title: 'Easy ride', steps: [ex('Ride in zone 2 (conversational)', 1, `${min} min`, 'cadence 85–95 rpm')], duration_min: min };
    }
    case 'swim': {
      const min = light ? 25 : 40;
      return { kind, title: 'Easy swim', steps: [ex('Continuous easy swimming, focus on technique', 1, `${min} min`)], duration_min: min };
    }
    case 'custom': {
      const min = extra.minutes ?? 45;
      return { kind, title: extra.name || 'Own workout', steps: [ex(extra.name || 'Own workout', 1, `${min} min`, extra.hard ? 'counts as a hard day' : undefined)], duration_min: min };
    }
  }
}

/** Sessions to schedule in a given week (each entry is one occurrence). */
export function extrasForWeek(extras: ExtraSession[], phase: Phase, recoveryWeek: boolean, raceWeek: boolean): ExtraSession[] {
  const out: ExtraSession[] = [];
  for (const e of extras) {
    const load = extraLoad(e);
    let n = e.perWeek;
    if (raceWeek) n = e.type === 'mobility' || e.type === 'core' ? Math.min(n, 1) : 0;
    else if (phase === 'taper') n = load === 'light' ? n : Math.min(n, 1);
    else if (recoveryWeek && load === 'legs') n = Math.max(1, n - 1);
    for (let i = 0; i < n; i++) out.push(e);
  }
  const order: Record<ExtraLoad, number> = { legs: 0, cross: 1, light: 2 };
  return out.sort((a, b) => order[extraLoad(a)] - order[extraLoad(b)]);
}

export type DayType = 'rest' | 'easy' | 'recovery' | 'quality' | 'long' | 'race';

const SCORE: Record<ExtraLoad, Record<DayType, number>> = {
  legs: { rest: 8, easy: 10, recovery: -10, quality: 15, long: -1000, race: -1000 },
  light: { rest: 12, easy: 10, recovery: 10, quality: 4, long: -50, race: -1000 },
  cross: { rest: 12, easy: 6, recovery: 8, quality: -5, long: -1000, race: -1000 },
};

/**
 * Pick a day for each session. Leg-heavy work avoids the long run, the day
 * before it and the day before a quality session ("hard days hard").
 */
export function placeExtras(dayTypes: DayType[], sessions: ExtraSession[], availableDays: Weekday[]): { extra: ExtraSession; day: Weekday }[] {
  const used = new Map<number, ExtraLoad[]>();
  const result: { extra: ExtraSession; day: Weekday }[] = [];
  for (const extra of sessions) {
    const load = extraLoad(extra);
    let best = -1;
    let bestScore = -Infinity;
    for (let d = 0; d < 7; d++) {
      const today = dayTypes[d];
      const next = d < 6 ? dayTypes[d + 1] : 'rest';
      const already = used.get(d) ?? [];
      if (result.some((r) => r.day === d && r.extra.id === extra.id)) continue;
      let score = SCORE[load][today] + (availableDays.includes(d as Weekday) ? 5 : 0);
      if (load === 'legs') {
        if (next === 'long' || next === 'race') score -= 60;
        if (next === 'quality') score -= 40;
      }
      if (load === 'cross' && (next === 'long' || next === 'quality')) score -= 10;
      score -= already.length * 25;
      for (const n of [d - 1, d + 1]) {
        for (const other of used.get(n) ?? []) {
          if (load === 'legs' && other === 'legs') score -= 30;
          else if (other === load) score -= 8;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (best >= 0 && bestScore > -100) {
      used.set(best, [...(used.get(best) ?? []), load]);
      result.push({ extra, day: best as Weekday });
    }
  }
  return result;
}
