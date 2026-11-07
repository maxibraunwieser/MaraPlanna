// What a plan is for. A hybrid app serves more than the marathon: shorter races, "get faster" over a distance, and plans
// without a race (build endurance next to strength, general fitness, coming back after a break or an injury).
//
// The plan engine (generate.ts) asks this table for everything that depends on the goal: how long the longest run gets,
// how much volume the peak week carries, how long the taper is, which pace zone the race-specific sessions use and whether
// the plan ends with a race. The marathon row reproduces what the engine always did.

import type { Level } from '../types';

export type GoalKind = 'race5k' | 'race10k' | 'half' | 'marathon' | 'faster' | 'hybrid' | 'fitness' | 'comeback';

/** Goals that are offered but not built yet (shown as "coming soon"). */
export const COMING_SOON_GOALS = ['ultra'] as const;

export const RACE_DISTANCES = { race5k: 5000, race10k: 10_000, half: 21_097, marathon: 42_195 } as const;
export type RaceDistanceKey = keyof typeof RACE_DISTANCES;

export interface GoalProfile {
  kind: GoalKind;
  /** Race distance in metres; null when the plan has no race. */
  distanceM: number | null;
  /** The plan ends on a race (or time trial) day. */
  race: boolean;
  /** [usual, ceiling] of the longest run in km, by experience. */
  longKm: Record<Level, [number, number]>;
  /** Peak weekly kilometres (balanced approach) by experience. */
  volumeKm: Record<Level, number>;
  /** Never plan a peak week below this. */
  minVolumeKm: number;
  /** Pace zone of the race-specific sessions. */
  zone: 'marathon' | 'threshold' | 'interval';
  /** Long runs may finish at race pace. */
  longFinish: boolean;
  /** Added to the number of quality sessions per week (-1 = one less). */
  qualityShift: number;
  /** Weeks of tapering for a plan of n weeks. */
  taperWeeks: (n: number) => number;
  /** Plan lengths the person can pick when there is no date, with the default. */
  weeks: { min: number; max: number; default: number };
}

const taperLong = (n: number) => (n >= 16 ? 3 : n >= 9 ? 2 : 1);
const taperMid = (n: number) => (n >= 12 ? 2 : 1);
const taperShort = () => 1;
const noTaper = () => 0;

const PROFILES: Record<GoalKind, GoalProfile> = {
  marathon: {
    kind: 'marathon', distanceM: 42_195, race: true,
    longKm: { beginner: [30, 35], intermediate: [32, 35], advanced: [34, 35] },
    volumeKm: { beginner: 55, intermediate: 70, advanced: 90 }, minVolumeKm: 40,
    zone: 'marathon', longFinish: true, qualityShift: 0, taperWeeks: taperLong, weeks: { min: 8, max: 30, default: 16 },
  },
  half: {
    kind: 'half', distanceM: 21_097, race: true,
    longKm: { beginner: [16, 20], intermediate: [19, 23], advanced: [21, 25] },
    volumeKm: { beginner: 38, intermediate: 50, advanced: 65 }, minVolumeKm: 30,
    zone: 'marathon', longFinish: true, qualityShift: 0, taperWeeks: taperMid, weeks: { min: 6, max: 24, default: 12 },
  },
  race10k: {
    kind: 'race10k', distanceM: 10_000, race: true,
    longKm: { beginner: [11, 14], intermediate: [14, 18], advanced: [16, 20] },
    volumeKm: { beginner: 30, intermediate: 42, advanced: 55 }, minVolumeKm: 24,
    zone: 'threshold', longFinish: false, qualityShift: 0, taperWeeks: taperShort, weeks: { min: 6, max: 20, default: 10 },
  },
  race5k: {
    kind: 'race5k', distanceM: 5000, race: true,
    longKm: { beginner: [8, 11], intermediate: [11, 14], advanced: [13, 16] },
    volumeKm: { beginner: 24, intermediate: 36, advanced: 48 }, minVolumeKm: 18,
    zone: 'interval', longFinish: false, qualityShift: 0, taperWeeks: taperShort, weeks: { min: 6, max: 16, default: 8 },
  },
  // Same shape as the race plans, but the person picks the distance; the last day is a time trial.
  faster: {
    kind: 'faster', distanceM: 10_000, race: true,
    longKm: { beginner: [11, 14], intermediate: [14, 18], advanced: [16, 20] },
    volumeKm: { beginner: 30, intermediate: 42, advanced: 55 }, minVolumeKm: 24,
    zone: 'threshold', longFinish: false, qualityShift: 0, taperWeeks: taperShort, weeks: { min: 6, max: 20, default: 10 },
  },
  hybrid: {
    kind: 'hybrid', distanceM: null, race: false,
    longKm: { beginner: [12, 16], intermediate: [15, 19], advanced: [17, 22] },
    volumeKm: { beginner: 26, intermediate: 38, advanced: 50 }, minVolumeKm: 22,
    zone: 'threshold', longFinish: false, qualityShift: 0, taperWeeks: noTaper, weeks: { min: 8, max: 24, default: 12 },
  },
  fitness: {
    kind: 'fitness', distanceM: null, race: false,
    longKm: { beginner: [8, 12], intermediate: [11, 15], advanced: [13, 18] },
    volumeKm: { beginner: 20, intermediate: 30, advanced: 40 }, minVolumeKm: 15,
    zone: 'threshold', longFinish: false, qualityShift: 0, taperWeeks: noTaper, weeks: { min: 8, max: 24, default: 12 },
  },
  comeback: {
    kind: 'comeback', distanceM: null, race: false,
    longKm: { beginner: [6, 10], intermediate: [8, 12], advanced: [10, 14] },
    volumeKm: { beginner: 16, intermediate: 24, advanced: 32 }, minVolumeKm: 12,
    zone: 'threshold', longFinish: false, qualityShift: -1, taperWeeks: noTaper, weeks: { min: 8, max: 20, default: 12 },
  },
};

/** Every goal the engine builds plans for. */
export const GOAL_KINDS = Object.keys(PROFILES) as GoalKind[];

/** The profile of a goal; plans saved before goals existed (no kind) are marathons. For "faster" the distance comes from the person. */
export function goalProfile(kind: GoalKind | undefined, distanceM?: number | null): GoalProfile {
  const p = PROFILES[kind ?? 'marathon'];
  if (p.kind !== 'faster') return p;
  const d = distanceM && distanceM > 0 ? distanceM : p.distanceM;
  // Pick the table of the nearest race distance for the structure, keep the person's distance for the time trial.
  const base = d! >= 30_000 ? PROFILES.marathon : d! >= 15_000 ? PROFILES.half : d! >= 7500 ? PROFILES.race10k : PROFILES.race5k;
  return { ...base, kind: 'faster', distanceM: d, race: true };
}

/** Goals with a date to aim at (or a distance and a number of weeks). */
export const isRaceGoal = (kind: GoalKind | undefined) => PROFILES[kind ?? 'marathon'].race;

export const RACE_LABEL: Record<RaceDistanceKey, string> = { race5k: '5 km', race10k: '10 km', half: 'Half marathon', marathon: 'Marathon' };

/** Label of a distance: "5 km", "10 km", "Half marathon", "Marathon", otherwise "12 km". */
export function distanceLabel(distanceM: number | null | undefined): string {
  if (!distanceM) return '';
  if (Math.abs(distanceM - 42_195) < 100) return 'Marathon';
  if (Math.abs(distanceM - 21_097) < 100) return 'Half marathon';
  return `${Math.round(distanceM / 100) / 10} km`.replace('.0 km', ' km');
}
