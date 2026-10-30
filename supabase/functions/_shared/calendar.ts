// iCalendar (RFC 5545) feed of a training plan: one all-day event per session
// with distance, paces and steps. No imports, so it runs in the Edge Function
// (Deno) and in the app's tests (Node). Step texts mirror src/lib/format.ts.

export type CalZone = 'recovery' | 'easy' | 'long' | 'marathon' | 'threshold' | 'interval' | 'repetition';
export type CalPaces = Record<CalZone, number | [number, number]>;
export type CalUnits = 'km' | 'mi';

export type CalStep =
  | { type: 'run'; label: string; zone: CalZone; distanceKm?: number; durationMin?: number; repeat?: number; recoveryKm?: number; recoveryMin?: number }
  | { type: 'exercise'; name: string; sets: number; reps: string; note?: string };

export interface CalWorkout {
  id: string;
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
const ZONE_LABEL: Record<CalZone, string> = {
  recovery: 'recovery',
  easy: 'easy',
  long: 'long-run',
  marathon: 'marathon pace',
  threshold: 'threshold',
  interval: 'interval',
  repetition: 'fast',
};

const minSec = (total: number) => {
  const s = Math.round(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const distance = (km: number, units: CalUnits) => {
  const v = units === 'mi' ? km / KM_PER_MI : km;
  return `${v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '')} ${units}`;
};
const perUnit = (s: number, units: CalUnits) => minSec(units === 'mi' ? s * KM_PER_MI : s);
export const paceText = (paces: CalPaces, zone: CalZone, units: CalUnits) => {
  const p = paces[zone];
  return Array.isArray(p) ? `${perUnit(p[0], units)}–${perUnit(p[1], units)} /${units}` : `${perUnit(p, units)} /${units}`;
};
const amount = (km: number | undefined, min: number | undefined, units: CalUnits, metres = false) => {
  if (km !== undefined) return metres && km < 2 ? `${Math.round(km * 1000)} m` : distance(km, units);
  if (min !== undefined) return min < 1 ? `${Math.round(min * 60)} s` : `${min} min`;
  return '';
};

export function stepText(step: CalStep, paces: CalPaces | null, units: CalUnits): { main: string; detail?: string } {
  if (step.type === 'exercise') return { main: step.name, detail: `${step.sets} × ${step.reps}${step.note ? ` · ${step.note}` : ''}` };
  const reps = step.repeat ?? 1;
  const isRep = reps > 1;
  const rec = isRep ? amount(step.recoveryKm, step.recoveryMin, units, true) : '';
  return {
    main: `${isRep ? `${reps} × ` : ''}${amount(step.distanceKm, step.durationMin, units, isRep)} ${step.label.toLowerCase()}`,
    detail: paces ? `${ZONE_LABEL[step.zone]} ${paceText(paces, step.zone, units)}${rec ? ` · ${rec} easy jog between` : ''}` : undefined,
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

export function eventSummary(w: CalWorkout, units: CalUnits): string {
  const size = w.distance_km ? ` · ${distance(w.distance_km, units)}` : w.duration_min ? ` · ${w.duration_min} min` : '';
  const done = w.status === 'completed' || w.status === 'partial' ? '✓ ' : w.status === 'missed' ? '(missed) ' : '';
  return `${done}${w.kind === 'race' ? '🏁 ' : ''}${w.title}${w.kind === 'race' ? '' : size}`;
}

export function eventDescription(w: CalWorkout, paces: CalPaces | null, units: CalUnits, appUrl: string): string {
  const lines: string[] = [];
  const size = [w.distance_km ? distance(w.distance_km, units) : null, w.duration_min ? `~${w.duration_min} min` : null].filter(Boolean).join(' · ');
  if (size) lines.push(size + (w.key_session && w.kind !== 'race' ? ' · key session' : ''));
  if (w.steps.length) {
    lines.push('');
    w.steps.forEach((s, i) => {
      const t = stepText(s, paces, units);
      lines.push(`${i + 1}. ${t.main}${t.detail ? ` – ${t.detail}` : ''}`);
    });
  }
  if (w.note) lines.push('', `Note: ${w.note}`);
  if (appUrl) lines.push('', `Open in MaraPlanna: ${appUrl}`);
  return lines.join('\n');
}

export function buildIcs(input: {
  name: string;
  workouts: CalWorkout[];
  paces: CalPaces | null;
  units: CalUnits;
  appUrl: string;
  now: Date;
}): string {
  const { workouts, paces, units, appUrl, now } = input;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MaraPlanna//Training plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeText(input.name)}`,
    `X-WR-CALNAME:${escapeText(input.name)}`,
    `X-WR-CALDESC:${escapeText('Your MaraPlanna training plan. Updates automatically when the plan changes.')}`,
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
      `SUMMARY:${escapeText(eventSummary(w, units))}`,
      `DESCRIPTION:${escapeText(eventDescription(w, paces, units, appUrl))}`,
      ...(appUrl ? [`URL:${appUrl}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
