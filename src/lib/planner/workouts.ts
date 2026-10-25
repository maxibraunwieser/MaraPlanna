// Distance/duration maths for structured workout steps.

import type { PaceZone, Paces, Step } from '../types';

export const round05 = (x: number) => Math.round(x * 2) / 2;

/** Representative pace (s/km) for a zone – the middle of a range. */
export function zonePace(paces: Paces, zone: PaceZone): number {
  const p = paces[zone];
  return Array.isArray(p) ? (p[0] + p[1]) / 2 : p;
}

function runStepParts(step: Extract<Step, { type: 'run' }>, paces: Paces) {
  const pace = zonePace(paces, step.zone);
  const reps = step.repeat ?? 1;
  const workKm = step.distanceKm ?? ((step.durationMin ?? 0) * 60) / pace;
  const recPace = zonePace(paces, 'recovery');
  const recKm = step.recoveryKm ?? ((step.recoveryMin ?? 0) * 60) / recPace;
  const recoveries = Math.max(0, reps - 1);
  return {
    km: workKm * reps + recKm * recoveries,
    minutes: (workKm * reps * pace + recKm * recoveries * recPace) / 60,
  };
}

export function stepKm(step: Step, paces: Paces): number {
  return step.type === 'run' ? runStepParts(step, paces).km : 0;
}

export function workoutKm(steps: Step[], paces: Paces): number {
  return steps.reduce((sum, s) => sum + stepKm(s, paces), 0);
}

export function workoutMinutes(steps: Step[], paces: Paces): number {
  return steps.reduce((sum, s) => sum + (s.type === 'run' ? runStepParts(s, paces).minutes : 0), 0);
}

/** km of running at a given set of zones (used for intensity caps). */
export function kmInZones(steps: Step[], paces: Paces, zones: PaceZone[]): number {
  return steps.reduce((sum, s) => {
    if (s.type !== 'run' || !zones.includes(s.zone)) return sum;
    const pace = zonePace(paces, s.zone);
    const workKm = s.distanceKm ?? ((s.durationMin ?? 0) * 60) / pace;
    return sum + workKm * (s.repeat ?? 1);
  }, 0);
}
