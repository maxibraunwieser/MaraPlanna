// Compact data package for the MaraPlanna watch face: ready-to-show strings,
// so the watch only has to draw them. Shared by the "watch" Edge Function
// (Deno) and the app's tests (Node).

import { distance, paceText, type CalPaces, type CalUnits, type CalWorkout, type CalZone } from './calendar.ts';

export interface FeedDay {
  /** e.g. "TODAY · INTERVALS + CORE" */
  label: string;
  title: string;
  /** e.g. "9.5 km · 4:34 /km" */
  line: string;
  done: boolean;
  rest: boolean;
}

export interface WatchFeed {
  v: 1;
  paired: true;
  date: string;
  today: FeedDay;
  next: FeedDay | null;
  /** Running distance this week (Mon–Sun) in the user's units. */
  week: { done: number; planned: number; text: string };
  race: { days: number; text: string } | null;
  /** Projected marathon time, h:mm. */
  proj: string | null;
}

export interface FeedInput {
  date: string;
  raceDate: string | null;
  predictedS: number | null;
  paces: CalPaces | null;
  units: CalUnits;
  /** Workouts of the week containing `date` and of the next day. */
  workouts: CalWorkout[];
  /** Run distance done this week, km. */
  weekDoneKm: number;
  hasPlan: boolean;
}

const KM_PER_MI = 1.609344;
const RUNS = new Set(['easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout', 'race']);
const LABEL: Record<string, string> = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long run', long_mp: 'Long + MP', threshold: 'Threshold', intervals: 'Intervals',
  marathon_pace: 'Marathon pace', fartlek: 'Fartlek', shakeout: 'Shakeout', race: 'Race', strength_upper: 'Upper body',
  strength_lower: 'Lower body', strength_full: 'Full body', core: 'Core', mobility: 'Mobility', plyo: 'Plyometrics',
  bike: 'Cycling', swim: 'Swimming', custom: 'Own workout',
};
const HARDEST: CalZone[] = ['repetition', 'interval', 'threshold', 'marathon', 'long', 'easy', 'recovery'];

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
export const mondayOf = (iso: string) => addDays(iso, -((parse(iso).getUTCDay() + 6) % 7));
export const hm = (s: number) => {
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** Garmin's system fonts reliably cover Latin-1 only: swap or drop anything beyond it. */
export const glyphs = (s: string) =>
  s.replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\u0020-\u00ff]/g, '').replace(/\s{2,}/g, ' ').trim();

/** Pace of the hardest step, e.g. "4:34 /km" or "5:58–6:34 /km" for easy running. */
function keyPace(w: CalWorkout, paces: CalPaces | null, units: CalUnits): string | null {
  if (!paces) return null;
  const zones = w.steps.flatMap((s) => (s.type === 'run' ? [s.zone] : []));
  const z = HARDEST.find((h) => zones.includes(h));
  return z ? paceText(paces, z, units) : null;
}

function day(prefix: string, list: CalWorkout[], paces: CalPaces | null, units: CalUnits, upcoming: boolean): FeedDay {
  const active = list.filter((w) => w.status !== 'skipped');
  const runs = active.filter((w) => RUNS.has(w.kind));
  const main = runs.find((w) => w.key_session) ?? runs[0] ?? active[0];
  if (!main) return { label: prefix, title: 'Rest day', line: upcoming ? 'Recharge for the next session' : 'Recovery is training too', done: false, rest: true };
  const extras = active.filter((w) => w !== main).map((w) => (LABEL[w.kind] ?? 'Workout').toUpperCase());
  const label = [`${prefix} · ${(LABEL[main.kind] ?? 'Workout').toUpperCase()}`, ...extras].join(' + ');
  const size = main.distance_km ? distance(main.distance_km, units) : main.duration_min ? `${main.duration_min} min` : '';
  const pace = RUNS.has(main.kind) && main.kind !== 'race' ? keyPace(main, paces, units) : null;
  return {
    label: glyphs(label),
    title: glyphs(main.title),
    line: glyphs([size, pace].filter(Boolean).join(' · ')),
    done: active.length > 0 && active.every((w) => w.status === 'completed' || w.status === 'partial'),
    rest: false,
  };
}

export function buildWatchFeed(input: FeedInput): WatchFeed {
  const { date, units, paces } = input;
  const conv = (km: number) => Math.round((units === 'mi' ? km / KM_PER_MI : km) * 10) / 10;
  if (!input.hasPlan) {
    return {
      v: 1, paired: true, date,
      today: { label: 'MARAPLANNA', title: 'No plan yet', line: 'Create one on the website', done: false, rest: true },
      next: null, week: { done: 0, planned: 0, text: '' }, race: null, proj: null,
    };
  }
  const on = (d: string) => input.workouts.filter((w) => w.date === d);
  const start = mondayOf(date);
  const end = addDays(start, 6);
  const planned = input.workouts
    .filter((w) => w.date >= start && w.date <= end && RUNS.has(w.kind) && w.status !== 'skipped')
    .reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const done = conv(input.weekDoneKm);
  const plan = conv(planned);
  const days = input.raceDate ? daysBetween(date, input.raceDate) : null;
  return {
    v: 1,
    paired: true,
    date,
    today: day('TODAY', on(date), paces, units, false),
    next: days !== null && days <= 0 ? null : day('TOMORROW', on(addDays(date, 1)), paces, units, true),
    week: { done, planned: plan, text: `${Math.round(done)} / ${Math.round(plan)} ${units}` },
    race: days === null || days < 0 ? null : { days, text: days === 0 ? 'Race day!' : days === 1 ? '1 day to go' : `${days} days to go` },
    proj: input.predictedS ? hm(input.predictedS) : null,
  };
}
