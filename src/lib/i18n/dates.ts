// Dates and numbers in the language of the page (the older formatters in lib/format.ts are English).

import type { Lang } from './index';

const LOCALE: Record<Lang, string> = { en: 'en-GB', de: 'de-AT' };

/** "Mon 6 Nov" / "Mo., 6. Nov." for an ISO calendar date. */
export function dateText(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALE[lang], { ...opts, timeZone: 'UTC' });
}

/** "6 Nov 2026" / "6. Nov. 2026". */
export const dateLong = (iso: string, lang: Lang) => dateText(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' });

/** Weekday names, Monday first. */
export function weekdayNames(lang: Lang, style: 'short' | 'long' = 'short'): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(LOCALE[lang], { weekday: style, timeZone: 'UTC' }));
}

/** Time of the day of a timestamp, e.g. "08:00". */
export function timeText(ts: string, lang: Lang): string {
  return new Date(ts).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
}

export const numberText = (n: number, lang: Lang, digits = 0) => n.toLocaleString(LOCALE[lang], { maximumFractionDigits: digits, minimumFractionDigits: 0 });
