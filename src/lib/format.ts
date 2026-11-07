import type { Paces, PaceZone, Step, Units } from './types';
import { parseISO } from './planner/dates';
import { zonePace } from './planner/workouts';
import { currentLang, tr, type MsgKey } from './i18n';
import { exerciseName, messageText, noteText, repsText, stepLabel, workoutTitle } from '../../supabase/functions/_shared/content';

export const KM_PER_MI = 1.609344;

/** Plan texts are stored in English; these show them in the language of the page. */
export const localTitle = (title: string): string => workoutTitle(title, currentLang());
export const localMessage = (message: string): string => messageText(message, currentLang());
export const localNote = (note: string): string => noteText(note, currentLang());

export const toUnit = (km: number, units: Units) => (units === 'mi' ? km / KM_PER_MI : km);
export const fromUnit = (value: number, units: Units) => (units === 'mi' ? value * KM_PER_MI : value);

/** A number the way the page language writes it: "5.2" or "5,2". */
export function fmtNum(n: number, digits = 1): string {
  const text = n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return currentLang() === 'de' ? text.replace('.', ',') : text;
}

export function fmtDistance(km: number | null | undefined, units: Units, digits = 1): string {
  if (km === null || km === undefined) return '–';
  const v = toUnit(km, units);
  return `${fmtNum(v, v >= 100 ? 0 : digits)} ${units}`;
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

const LOCALE = { en: 'en-GB', de: 'de-AT' } as const;

/** A calendar date in the language of the page. */
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseISO(iso).toLocaleDateString(LOCALE[currentLang()], { ...opts, timeZone: 'UTC' });
}

/** "Today", "Tomorrow", "Yesterday", otherwise the date. */
export function fmtDay(iso: string, today: string, opts?: Intl.DateTimeFormatOptions): string {
  const diff = Math.round((parseISO(iso).getTime() - parseISO(today).getTime()) / 86_400_000);
  if (diff === 0) return tr('common.today');
  if (diff === 1) return tr('common.tomorrow');
  if (diff === -1) return tr('common.yesterday');
  return fmtDate(iso, opts);
}

export function fmtRelative(ts: string | null): string {
  if (!ts) return tr('rel.never');
  const diff = (Date.now() - Date.parse(ts)) / 1000;
  if (diff < 60) return tr('rel.now');
  if (diff < 3600) return tr('rel.min', { n: Math.round(diff / 60) });
  if (diff < 86400) return tr('rel.h', { n: Math.round(diff / 3600) });
  const days = Math.round(diff / 86400);
  return days === 1 ? tr('rel.day') : tr('rel.days', { n: days });
}

/** Name of a pace zone in the language of the page. */
export const zoneLabel = (zone: PaceZone): string => tr(`zname.${zone}` as MsgKey);

export function zonePaceText(paces: Paces, zone: PaceZone, units: Units): string {
  const p = paces[zone];
  return Array.isArray(p) ? fmtPaceRange(p, units) : fmtPace(p, units);
}

function amount(km: number | undefined, min: number | undefined, units: Units, metres = false): string {
  if (km !== undefined) {
    if (metres && km < 2) return `${Math.round(km * 1000)} m`;
    return fmtDistance(km, units);
  }
  if (min !== undefined) return min < 1 ? `${Math.round(min * 60)} s` : `${fmtNum(min)} ${tr('common.min')}`;
  return '';
}

export function describeStep(step: Step, paces: Paces, units: Units): { main: string; detail?: string } {
  const lang = currentLang();
  if (step.type === 'exercise') {
    const note = step.note ? noteText(step.note, lang) : '';
    return { main: exerciseName(step.name, lang), detail: `${step.sets} × ${repsText(step.reps, lang)}${note ? ` · ${note}` : ''}` };
  }
  const reps = step.repeat ?? 1;
  const isRep = reps > 1;
  const work = amount(step.distanceKm, step.durationMin, units, isRep);
  const rec = isRep ? amount(step.recoveryKm, step.recoveryMin, units, true) : '';
  const label = stepLabel(step.label, lang);
  return {
    // German nouns keep their capital letter; English labels read better in lower case after the amount.
    main: `${isRep ? `${reps} × ` : ''}${work} ${lang === 'de' ? label : label.toLowerCase()}`,
    detail: `${zoneLabel(step.zone)} ${zonePaceText(paces, step.zone, units)}${rec ? ` · ${tr('step.jogBetween', { amount: rec })}` : ''}`,
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
