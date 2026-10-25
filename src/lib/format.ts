import type { Paces, PaceZone, Step, Units } from './types';
import { parseISO } from './planner/dates';
import { zonePace } from './planner/workouts';

export const KM_PER_MI = 1.609344;

export const toUnit = (km: number, units: Units) => (units === 'mi' ? km / KM_PER_MI : km);
export const fromUnit = (value: number, units: Units) => (units === 'mi' ? value * KM_PER_MI : value);

export function fmtDistance(km: number | null | undefined, units: Units, digits = 1): string {
  if (km === null || km === undefined) return '–';
  const v = toUnit(km, units);
  return `${v.toFixed(v >= 100 ? 0 : digits).replace(/\.0$/, '')} ${units}`;
}

/** m:ss, rounding to whole seconds first (avoids "5:60"). */
export function fmtMinSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtPace(secPerKm: number, units: Units): string {
  return `${fmtMinSec(units === 'mi' ? secPerKm * KM_PER_MI : secPerKm)} /${units}`;
}

export function fmtPaceRange(range: [number, number] | number, units: Units): string {
  if (!Array.isArray(range)) return fmtPace(range, units);
  const f = (s: number) => fmtMinSec(units === 'mi' ? s * KM_PER_MI : s);
  return `${f(range[0])}–${f(range[1])} /${units}`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '–';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtMinutes(min: number | null | undefined): string {
  if (!min) return '';
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`;
}

export function parseTime(text: string): number | null {
  const parts = text.trim().split(':').map((p) => Number(p));
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0) || null;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseISO(iso).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function fmtRelative(ts: string | null): string {
  if (!ts) return 'never';
  const diff = (Date.now() - Date.parse(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} days ago`;
}

export const ZONE_LABEL: Record<PaceZone, string> = {
  recovery: 'recovery',
  easy: 'easy',
  long: 'long-run',
  marathon: 'marathon pace',
  threshold: 'threshold',
  interval: 'interval',
  repetition: 'fast',
};

export function zonePaceText(paces: Paces, zone: PaceZone, units: Units): string {
  const p = paces[zone];
  return Array.isArray(p) ? fmtPaceRange(p, units) : fmtPace(p, units);
}

function amount(km: number | undefined, min: number | undefined, units: Units, metres = false): string {
  if (km !== undefined) {
    if (metres && km < 2) return `${Math.round(km * 1000)} m`;
    return fmtDistance(km, units);
  }
  if (min !== undefined) return min < 1 ? `${Math.round(min * 60)} s` : `${min} min`;
  return '';
}

export function describeStep(step: Step, paces: Paces, units: Units): { main: string; detail?: string } {
  if (step.type === 'exercise') {
    return { main: `${step.name}`, detail: `${step.sets} × ${step.reps}${step.note ? ` · ${step.note}` : ''}` };
  }
  const reps = step.repeat ?? 1;
  const isRep = reps > 1;
  const work = amount(step.distanceKm, step.durationMin, units, isRep);
  const rec = isRep ? amount(step.recoveryKm, step.recoveryMin, units, true) : '';
  return {
    main: `${isRep ? `${reps} × ` : ''}${work} ${step.label.toLowerCase()}`,
    detail: `${ZONE_LABEL[step.zone]} ${zonePaceText(paces, step.zone, units)}${rec ? ` · ${rec} easy jog between` : ''}`,
  };
}

/** Pace of the hardest step of a workout, e.g. "4:58 /km". */
export function keyPace(steps: Step[], paces: Paces, units: Units): string | null {
  const order: PaceZone[] = ['repetition', 'interval', 'threshold', 'marathon', 'long', 'easy', 'recovery'];
  const zones = steps.flatMap((s) => (s.type === 'run' ? [s.zone] : []));
  const z = order.find((o) => zones.includes(o));
  if (!z) return null;
  return z === 'easy' || z === 'long' || z === 'recovery' ? zonePaceText(paces, z, units) : fmtPace(zonePace(paces, z), units);
}
