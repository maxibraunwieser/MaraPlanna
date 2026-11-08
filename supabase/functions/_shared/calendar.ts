// iCalendar (RFC 5545) feed of a training plan: one all-day event per session
// with distance, paces and steps. No imports, so it runs in the Edge Function
// (Deno) and in the app's tests (Node). Step texts mirror src/lib/format.ts. The feed can be in English or German
// (the `lang` of the link); plan texts are translated by content.ts.

import { decimal, exerciseName, messageText, noteText, repsText, stepLabel, workoutTitle, zoneName, type ContentLang } from './content.ts';

export type CalZone = 'recovery' | 'easy' | 'long' | 'marathon' | 'threshold' | 'interval' | 'repetition';
export type CalPaces = Record<CalZone, number | [number, number]>;
export type CalUnits = 'km' | 'mi';

export type CalStep =
  | { type: 'run'; label: string; zone: CalZone; distanceKm?: number; durationMin?: number; repeat?: number; recoveryKm?: number; recoveryMin?: number }
  | { type: 'exercise'; name: string; sets: number; reps: string; note?: string; /** library id (_shared/strength.ts) */ id?: string; /** catalogue key (_shared/exerciseCatalog.ts) */ key?: string; /** target weight in kg */ kg?: number };

export interface CalWorkout {
  id: string;
  /** The person's own workout this session belongs to ('own-…'); missing for the planner's sessions. */
  routine_id?: string | null;
  date: string;
  kind: string;
  title: string;
  steps: CalStep[];
  distance_km: number | null;
  duration_min: number | null;
  key_session: boolean;
  status: string;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Text formatting (same output as describeStep() in src/lib/format.ts)
// ---------------------------------------------------------------------------

const KM_PER_MI = 1.609344;

const PHRASES = {
  en: { jog: (a: string) => `${a} easy jog between`, min: 'min', key: ' · key session', missed: '(missed) ', note: 'Note', open: 'Open in MaraPlanna', desc: 'Your MaraPlanna training plan. Updates automatically when the plan changes.', title: 'MaraPlanna' },
  de: { jog: (a: string) => `${a} lockerer Trab dazwischen`, min: 'Min.', key: ' · Schlüsseleinheit', missed: '(verpasst) ', note: 'Notiz', open: 'In MaraPlanna öffnen', desc: 'Dein MaraPlanna-Trainingsplan. Aktualisiert sich automatisch, wenn sich der Plan ändert.', title: 'MaraPlanna' },
} as const;

const minSec = (total: number) => {
  const s = Math.round(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const distance = (km: number, units: CalUnits, lang: ContentLang = 'en') => {
  const v = units === 'mi' ? km / KM_PER_MI : km;
  return `${decimal(v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, ''), lang)} ${units}`;
};
const perUnit = (s: number, units: CalUnits) => minSec(units === 'mi' ? s * KM_PER_MI : s);
export const paceText = (paces: CalPaces, zone: CalZone, units: CalUnits) => {
  const p = paces[zone];
  return Array.isArray(p) ? `${perUnit(p[0], units)}–${perUnit(p[1], units)} /${units}` : `${perUnit(p, units)} /${units}`;
};
const amount = (km: number | undefined, min: number | undefined, units: CalUnits, metres = false, lang: ContentLang = 'en') => {
  if (km !== undefined) return metres && km < 2 ? `${Math.round(km * 1000)} m` : distance(km, units, lang);
  if (min !== undefined) return min < 1 ? `${Math.round(min * 60)} s` : `${decimal(String(Math.round(min * 10) / 10), lang)} ${PHRASES[lang].min}`;
  return '';
};

export function stepText(step: CalStep, paces: CalPaces | null, units: CalUnits, lang: ContentLang = 'en'): { main: string; detail?: string } {
  if (step.type === 'exercise') {
    const note = step.note ? noteText(step.note, lang) : '';
    return { main: exerciseName(step.name, lang), detail: `${step.sets} × ${repsText(step.reps, lang)}${note ? ` · ${note}` : ''}` };
  }
  const reps = step.repeat ?? 1;
  const isRep = reps > 1;
  const rec = isRep ? amount(step.recoveryKm, step.recoveryMin, units, true, lang) : '';
  const label = stepLabel(step.label, lang);
  return {
    main: `${isRep ? `${reps} × ` : ''}${amount(step.distanceKm, step.durationMin, units, isRep, lang)} ${lang === 'de' ? label : label.toLowerCase()}`,
    detail: paces ? `${zoneName(step.zone, lang)} ${paceText(paces, step.zone, units)}${rec ? ` · ${PHRASES[lang].jog(rec)}` : ''}` : undefined,
  };
}

// ---------------------------------------------------------------------------
// iCalendar
// ---------------------------------------------------------------------------

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dateValue = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Fold to ≤ 75 octets per line (continuations start with a space), never splitting a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function eventSummary(w: CalWorkout, units: CalUnits, lang: ContentLang = 'en'): string {
  const size = w.distance_km ? ` · ${distance(w.distance_km, units, lang)}` : w.duration_min ? ` · ${w.duration_min} ${PHRASES[lang].min}` : '';
  const done = w.status === 'completed' || w.status === 'partial' ? '✓ ' : w.status === 'missed' ? PHRASES[lang].missed : '';
  return `${done}${w.kind === 'race' ? '🏁 ' : ''}${workoutTitle(w.title, lang)}${w.kind === 'race' ? '' : size}`;
}

export function eventDescription(w: CalWorkout, paces: CalPaces | null, units: CalUnits, appUrl: string, lang: ContentLang = 'en'): string {
  const lines: string[] = [];
  const size = [w.distance_km ? distance(w.distance_km, units, lang) : null, w.duration_min ? `~${w.duration_min} ${PHRASES[lang].min}` : null].filter(Boolean).join(' · ');
  if (size) lines.push(size + (w.key_session && w.kind !== 'race' ? PHRASES[lang].key : ''));
  if (w.steps.length) {
    lines.push('');
    w.steps.forEach((s, i) => {
      const t = stepText(s, paces, units, lang);
      lines.push(`${i + 1}. ${t.main}${t.detail ? ` – ${t.detail}` : ''}`);
    });
  }
  if (w.note) lines.push('', `${PHRASES[lang].note}: ${messageText(w.note, lang)}`);
  if (appUrl) lines.push('', `${PHRASES[lang].open}: ${appUrl}`);
  return lines.join('\n');
}

export function buildIcs(input: {
  name: string;
  workouts: CalWorkout[];
  paces: CalPaces | null;
  units: CalUnits;
  appUrl: string;
  now: Date;
  lang?: ContentLang;
}): string {
  const { workouts, paces, units, appUrl, now } = input;
  const lang = input.lang ?? 'en';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MaraPlanna//Training plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeText(input.name)}`,
    `X-WR-CALNAME:${escapeText(input.name)}`,
    `X-WR-CALDESC:${escapeText(PHRASES[lang].desc)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const sorted = workouts.filter((w) => w.status !== 'skipped').sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  for (const w of sorted) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${w.id}@maraplanna`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(w.date)}`,
      `DTEND;VALUE=DATE:${dateValue(nextDay(w.date))}`,
      `SUMMARY:${escapeText(eventSummary(w, units, lang))}`,
      `DESCRIPTION:${escapeText(eventDescription(w, paces, units, appUrl, lang))}`,
      ...(appUrl ? [`URL:${appUrl}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
