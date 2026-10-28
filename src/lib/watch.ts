// Planned run → structured watch workout: steps with distance/time and a pace
// range, written as intervals.icu workout text (→ Garmin Connect → watch) or,
// in watchFit.ts, as a Garmin .FIT workout file.

import type { PaceZone, Paces, Step, WorkoutDraft } from './types';

export type WatchIntensity = 'warmup' | 'active' | 'recovery' | 'cooldown';

export interface WatchStep {
  name: string;
  intensity: WatchIntensity;
  distanceM?: number;
  seconds?: number;
  /** Target pace in s/km as [fast, slow]; none = run by feel. */
  pace?: [number, number];
}

export type WatchItem = WatchStep | { repeat: number; steps: WatchStep[] };

export interface WatchWorkout {
  name: string;
  items: WatchItem[];
}

// ± s/km around single-pace zones – tight enough to guide, loose enough for GPS noise.
const TOLERANCE: Partial<Record<PaceZone, number>> = { marathon: 5, threshold: 5, interval: 4, repetition: 8 };

export function paceRange(paces: Paces, zone: PaceZone): [number, number] {
  const p = paces[zone];
  if (Array.isArray(p)) return [p[0], p[1]];
  const tol = TOLERANCE[zone] ?? 5;
  return [p - tol, p + tol];
}

const amount = (km?: number, min?: number): Pick<WatchStep, 'distanceM' | 'seconds'> =>
  km ? { distanceM: Math.round(km * 1000) } : min ? { seconds: Math.round(min * 60) } : {};

export function watchWorkout(w: Pick<WorkoutDraft, 'title' | 'steps'>, paces: Paces): WatchWorkout {
  const items: WatchItem[] = [];
  for (const s of w.steps) {
    if (s.type !== 'run') continue;
    const stride = s.label.startsWith('Strides');
    const work: WatchStep = {
      name: stride ? 'Stride' : s.label,
      intensity: s.label === 'Warm-up' ? 'warmup' : s.label === 'Cool-down' ? 'cooldown' : s.zone === 'recovery' ? 'recovery' : 'active',
      ...amount(s.distanceKm, s.durationMin),
      pace: paceRange(paces, s.zone),
    };
    const reps = s.repeat ?? 1;
    if (reps > 1) {
      const rec = amount(s.recoveryKm, s.recoveryMin);
      // Recovery jogs carry no target, so the watch doesn't nag while you catch your breath.
      items.push({ repeat: reps, steps: rec.distanceM || rec.seconds ? [work, { name: 'Recovery', intensity: 'recovery', ...rec }] : [work] });
    } else {
      items.push(work);
    }
  }
  return { name: w.title, items };
}

export const isWatchable = (steps: Step[]) => steps.some((s) => s.type === 'run');

// ---------------------------------------------------------------------------
// intervals.icu workout text, e.g. "- Interval 1km 4:09-4:01/km Pace"
// https://forum.intervals.icu/t/workout-builder/1163
// ---------------------------------------------------------------------------

const mmss = (s: number) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

function durationText(s: WatchStep): string {
  if (s.distanceM) return `${Math.round(s.distanceM / 10) / 100}km`; // "m" means minutes in intervals.icu
  const t = s.seconds ?? 0;
  if (t < 60) return `${t}s`;
  return t % 60 ? `${Math.floor(t / 60)}m${t % 60}s` : `${t / 60}m`;
}

// The text before the duration becomes the step label; keep it free of digits and keywords.
const labelText = (name: string) => name.replace(/\bpace\b/gi, '').replace(/[\d()%]/g, '').replace(/\s+/g, ' ').trim() || 'Run';

/** Recovery jogs need some pace in intervals.icu's syntax: the plan's recovery pace, open at the slow end. */
export function toIntervalsText(w: WatchWorkout, paces: Paces): string {
  const easyFloor: [number, number] = [paces.recovery[0], paces.recovery[1] + 90];
  const line = (s: WatchStep) => {
    const [fast, slow] = s.pace ?? easyFloor;
    return `- ${labelText(s.name)} ${durationText(s)} ${mmss(slow)}-${mmss(fast)}/km Pace`;
  };
  const blocks: string[] = [];
  for (const it of w.items) {
    if ('repeat' in it) blocks.push([`${it.repeat}x`, ...it.steps.map(line)].join('\n'));
    else if (it.intensity === 'warmup') blocks.push(`Warmup\n${line(it)}`);
    else if (it.intensity === 'cooldown') blocks.push(`Cooldown\n${line(it)}`);
    else blocks.push(line(it));
  }
  return blocks.join('\n\n');
}
