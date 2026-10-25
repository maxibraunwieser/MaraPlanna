// Calendar-date helpers on ISO strings (YYYY-MM-DD). All arithmetic is done in
// UTC so daylight-saving changes never shift a date.

import type { Weekday } from '../types';

const DAY_MS = 86_400_000;

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in the user's local time zone. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY_MS));
}

/** Number of days from `from` to `to` (positive if `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayOf(iso: string): Weekday {
  return ((parseISO(iso).getUTCDay() + 6) % 7) as Weekday;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
