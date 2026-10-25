// Jack Daniels' VDOT model: race performance -> aerobic capacity -> training paces.

import type { Paces } from '../types';

export const MARATHON_M = 42_195;

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
export function vo2AtVelocity(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max that can be sustained for `minutes`. */
export function sustainableFraction(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

export function vdotFromRace(distanceM: number, timeS: number): number {
  const minutes = timeS / 60;
  return vo2AtVelocity(distanceM / minutes) / sustainableFraction(minutes);
}

/** Velocity (m/min) at which the oxygen cost equals `vo2`. */
export function velocityForVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted race time in seconds for a distance at a given VDOT. */
export function raceTimeForVdot(vdot: number, distanceM: number): number {
  // vdotFromRace is monotonically decreasing in time -> bisection.
  let lo = 60;
  let hi = 60 * 60 * 12;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Seconds per km when running at `fraction` of VDOT. */
export function paceAtFraction(vdot: number, fraction: number): number {
  return 60_000 / velocityForVo2(vdot * fraction);
}

/**
 * Training paces. Easy/threshold/interval/repetition come from current fitness;
 * marathon pace is the *target* marathon pace for the plan.
 */
export function trainingPaces(vdot: number, marathonPaceSPerKm: number): Paces {
  const easyFast = paceAtFraction(vdot, 0.7);
  const easySlow = paceAtFraction(vdot, 0.62);
  return {
    recovery: [easySlow, easySlow * 1.06],
    easy: [easyFast, easySlow],
    long: [easyFast * 1.01, easySlow],
    marathon: marathonPaceSPerKm,
    threshold: paceAtFraction(vdot, 0.88),
    interval: paceAtFraction(vdot, 0.975),
    repetition: paceAtFraction(vdot, 1.05),
  };
}

/**
 * VO2max estimate from a steady run using heart-rate reserve
 * (%HRR ≈ %VO2 reserve, Swain & Leutholtz).
 */
export function vdotFromHeartRate(
  distanceM: number,
  movingS: number,
  avgHr: number,
  restingHr: number,
  maxHr: number,
): number | null {
  if (movingS <= 0 || distanceM <= 0 || maxHr <= restingHr) return null;
  const hrr = (avgHr - restingHr) / (maxHr - restingHr);
  if (hrr < 0.5 || hrr > 0.97) return null;
  const vo2 = vo2AtVelocity(distanceM / (movingS / 60));
  const estimate = (vo2 - 3.5) / hrr + 3.5;
  return estimate > 20 && estimate < 90 ? estimate : null;
}
