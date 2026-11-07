// Heart-rate zones and the estimates behind them.
//
// Garmin's own zones win when Garmin returned them. Otherwise: Karvonen (percent of the heart-rate reserve) when the resting
// heart rate is known, else percent of the maximum heart rate. The method is shown to the person.

export interface HrZone {
  /** 1–5 */
  zone: number;
  /** Lower and upper bound in bpm. */
  from: number;
  to: number;
}

export type ZoneMethod = 'garmin' | 'karvonen' | 'percent-max';

/** Typical maximum heart rate from age (Tanaka: 208 − 0.7 × age). */
export const estimateMaxHr = (age: number): number => Math.round(208 - 0.7 * age);

export function ageFromBirthDate(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const KARVONEN: [number, number][] = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0]];

/** Five zones; bounds do not overlap (each zone starts one bpm above the last). */
export function hrZones(opts: { maxHr: number; restingHr?: number | null; garminFloors?: number[] | null }): { zones: HrZone[]; method: ZoneMethod } {
  const { maxHr, restingHr, garminFloors } = opts;
  if (garminFloors && garminFloors.length >= 5 && garminFloors.every((x, i) => i === 0 || x > garminFloors[i - 1])) {
    const f = garminFloors.slice(0, 5);
    return { method: 'garmin', zones: f.map((from, i) => ({ zone: i + 1, from, to: i < 4 ? f[i + 1] - 1 : maxHr })) };
  }
  const reserve = restingHr ? maxHr - restingHr : null;
  const at = (p: number) => Math.round(reserve !== null ? restingHr! + reserve * p : maxHr * p);
  const zones = KARVONEN.map(([lo, hi], i): HrZone => ({ zone: i + 1, from: i === 0 ? at(lo) : at(lo) + 1, to: at(hi) }));
  return { method: reserve !== null ? 'karvonen' : 'percent-max', zones };
}

export const HR_LIMITS = { restingMin: 30, restingMax: 100, maxMin: 120, maxMax: 220 } as const;

/** Problems with the two values (message keys), empty when both are fine or empty. */
export function hrProblems(restingHr: number | null, maxHr: number | null): ('restRange' | 'maxRange' | 'maxBelowRest')[] {
  const out: ('restRange' | 'maxRange' | 'maxBelowRest')[] = [];
  if (restingHr !== null && (restingHr < HR_LIMITS.restingMin || restingHr > HR_LIMITS.restingMax)) out.push('restRange');
  if (maxHr !== null && (maxHr < HR_LIMITS.maxMin || maxHr > HR_LIMITS.maxMax)) out.push('maxRange');
  if (restingHr !== null && maxHr !== null && maxHr <= restingHr) out.push('maxBelowRest');
  return out;
}
