// Changing what a single planned running session consists of (used when the coach's proposal
// is applied): take strides out or put them in, set the distance, turn a hard session into an
// easy run. The total distance stays as it was unless a distance is asked for: when strides go,
// the easy part gets the distance they covered, and the other way round.

import type { Paces, Step, WorkoutKind } from '../types';
import { strides } from './generate';
import { round05, workoutKm, workoutMinutes } from './workouts';

type RunStep = Extract<Step, { type: 'run' }>;

export interface WorkoutEdit {
  removeStrides?: boolean;
  addStrides?: boolean;
  /** Total distance of the session in km. */
  distanceKm?: number;
  /** Turn a hard session (intervals, threshold, fartlek, marathon pace) into a plain easy run. */
  makeEasy?: boolean;
}

export interface EditedWorkout {
  kind: WorkoutKind;
  title: string;
  steps: Step[];
  key_session: boolean;
  distance_km: number;
  duration_min: number;
}

const isStrides = (s: Step) => s.type === 'run' && /stride/i.test(s.label);
const isFixed = (s: Step) => s.type === 'run' && /warm|cool|stride/i.test(s.label);
const HARD_KINDS = new Set<WorkoutKind>(['intervals', 'threshold', 'fartlek', 'marathon_pace']);

export const hasStrides = (steps: Step[]) => steps.some(isStrides);
export const canEdit = (kind: WorkoutKind) => kind === 'easy' || kind === 'recovery' || kind === 'long' || kind === 'shakeout' || HARD_KINDS.has(kind) || kind === 'long_mp';

/** The step that carries the distance of a single-block session. */
function mainStep(steps: Step[]): RunStep | undefined {
  return steps.find((s): s is RunStep => s.type === 'run' && !isFixed(s) && !!s.distanceKm && (s.repeat ?? 1) === 1);
}

/** Null when the edit does not apply to this session or would not change anything. */
export function editWorkout(w: { kind: WorkoutKind; title: string; steps: Step[]; distance_km: number | null; key_session: boolean }, edit: WorkoutEdit, paces: Paces): EditedWorkout | null {
  let kind = w.kind;
  let keyed = w.key_session;
  let steps = w.steps.map((s) => ({ ...s })) as Step[];
  const before = w.distance_km ?? round05(workoutKm(w.steps, paces));
  const target = edit.distanceKm ?? before;

  if (edit.makeEasy) {
    if (!HARD_KINDS.has(w.kind)) return null;
    kind = 'easy';
    keyed = false;
    steps = [{ type: 'run', label: 'Easy', zone: 'easy', distanceKm: Math.max(2, round05(target)) }];
  }
  if (edit.removeStrides) {
    if (!hasStrides(steps)) return null;
    steps = steps.filter((s) => !isStrides(s));
  }
  if (edit.addStrides) {
    if (hasStrides(steps) || kind !== 'easy') return null;
    steps.push(strides());
  }

  // Bring the total back to the target by changing the easy block (the first single block).
  const delta = target - workoutKm(steps, paces);
  if (Math.abs(delta) >= 0.2) {
    const main = mainStep(steps);
    if (main) main.distanceKm = Math.max(1, round05((main.distanceKm ?? 0) + delta));
    else if (edit.distanceKm !== undefined) return null; // a session built from reps has no distance to set
  }

  let title = w.title;
  if (kind === 'easy') title = hasStrides(steps) ? 'Easy run + strides' : 'Easy run';
  const distance = round05(workoutKm(steps, paces));
  const unchanged = kind === w.kind && JSON.stringify(steps) === JSON.stringify(w.steps) && Math.abs(distance - before) < 0.2;
  if (unchanged) return null;
  return { kind, title, steps, key_session: keyed, distance_km: distance, duration_min: Math.round(workoutMinutes(steps, paces)) };
}
