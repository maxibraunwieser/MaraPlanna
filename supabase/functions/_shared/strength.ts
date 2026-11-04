// Strength training for the MaraPlanna watch app: the exercise library, the user's strength settings and
// the "strength" part of the watch feed. No imports of other app code, so it runs in the Edge Function
// (Deno) and in the app's tests (Node).
//
// Nothing about the person is fixed on the watch: wrist, equipment, weight unit and the exercise list
// come from the website (profiles.strength) through the feed. The library below only describes what exists.

import type { CalStep, CalWorkout } from './calendar.ts';

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/** Movement families: what a wrist sensor can tell apart. The exact exercise is resolved from the plan. */
export type Family = 'push_h' | 'push_v' | 'pull_h' | 'pull_v' | 'curl' | 'triceps' | 'squat' | 'hinge' | 'lunge' | 'pushup';

export const FAMILIES: Record<Family, { en: string; de: string }> = {
  push_h: { en: 'Horizontal press', de: 'Drücken waagerecht' },
  push_v: { en: 'Overhead press', de: 'Drücken senkrecht' },
  pull_h: { en: 'Row', de: 'Rudern' },
  pull_v: { en: 'Vertical pull', de: 'Ziehen senkrecht' },
  curl: { en: 'Curl', de: 'Curl' },
  triceps: { en: 'Triceps', de: 'Trizeps' },
  squat: { en: 'Squat', de: 'Kniebeuge' },
  hinge: { en: 'Hip hinge', de: 'Kreuzheben' },
  lunge: { en: 'Lunge', de: 'Ausfallschritt' },
  pushup: { en: 'Push-up', de: 'Liegestütz' },
};

/** How well a watch on the wrist can recognise the movement (the hand has to move on its own path). */
export type Detect = 'good' | 'medium' | 'poor';
export type Equipment = 'free' | 'machine' | 'body';

export interface Exercise {
  id: string;
  en: string;
  /** Name shown on the watch (short, no special glyphs the watch font lacks). */
  de: string;
  family: Family;
  equipment: Equipment;
  detect: Detect;
  /** Defaults for a new session. */
  sets: number;
  reps: number;
  restS: number;
  /** Part of the first version of the library (pre-selected until the user decides). */
  starter: boolean;
  /** Lower-case fragments of plan exercise names that mean this exercise (see matchExercise). */
  aliases: string[];
}

export const EXERCISES: Exercise[] = [
  { id: 'pushup', en: 'Push-up', de: 'Liegestütz', family: 'pushup', equipment: 'body', detect: 'good', sets: 3, reps: 10, restS: 60, starter: true, aliases: ['push-up', 'pushup', 'push up'] },
  { id: 'bench_press', en: 'Bench press', de: 'Bankdrücken', family: 'push_h', equipment: 'free', detect: 'medium', sets: 3, reps: 8, restS: 120, starter: true, aliases: ['bench press', 'floor press', 'chest press'] },
  { id: 'shoulder_press', en: 'Shoulder press', de: 'Schulterdrücken', family: 'push_v', equipment: 'free', detect: 'good', sets: 3, reps: 8, restS: 90, starter: true, aliases: ['shoulder press', 'overhead press', 'military press'] },
  { id: 'row', en: 'Row', de: 'Rudern', family: 'pull_h', equipment: 'free', detect: 'good', sets: 3, reps: 10, restS: 90, starter: true, aliases: ['row'] },
  { id: 'bicep_curl', en: 'Biceps curl', de: 'Bizepscurl', family: 'curl', equipment: 'free', detect: 'good', sets: 3, reps: 12, restS: 60, starter: true, aliases: ['curl'] },
  { id: 'squat', en: 'Squat', de: 'Kniebeuge', family: 'squat', equipment: 'free', detect: 'good', sets: 3, reps: 8, restS: 120, starter: true, aliases: ['squat'] },
  { id: 'deadlift', en: 'Deadlift', de: 'Kreuzheben', family: 'hinge', equipment: 'free', detect: 'good', sets: 3, reps: 5, restS: 150, starter: true, aliases: ['deadlift', 'good morning'] },
  { id: 'lunge', en: 'Lunge', de: 'Ausfallschritt', family: 'lunge', equipment: 'free', detect: 'medium', sets: 3, reps: 10, restS: 90, starter: true, aliases: ['lunge', 'split squat', 'step-up', 'step up'] },
  { id: 'pull_up', en: 'Pull-up', de: 'Klimmzug', family: 'pull_v', equipment: 'body', detect: 'good', sets: 3, reps: 6, restS: 120, starter: true, aliases: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chin up'] },
  { id: 'triceps_ext', en: 'Triceps extension', de: 'Trizepsdrücken', family: 'triceps', equipment: 'free', detect: 'good', sets: 3, reps: 12, restS: 60, starter: false, aliases: ['triceps', 'skull crusher', 'dip'] },
  { id: 'lat_pulldown', en: 'Lat pulldown', de: 'Latzug', family: 'pull_v', equipment: 'machine', detect: 'medium', sets: 3, reps: 10, restS: 90, starter: false, aliases: ['pulldown', 'pull-down'] },
  { id: 'leg_press', en: 'Leg press', de: 'Beinpresse', family: 'squat', equipment: 'machine', detect: 'poor', sets: 3, reps: 10, restS: 120, starter: false, aliases: ['leg press'] },
];

export const exerciseById = (id: string): Exercise | undefined => EXERCISES.find((e) => e.id === id);

/** Order in a session: big lifts first, small ones last. */
const FAMILY_ORDER: Family[] = ['squat', 'hinge', 'push_h', 'pull_h', 'push_v', 'pull_v', 'pushup', 'lunge', 'curl', 'triceps'];
export const sessionOrder = (ids: string[]): string[] =>
  [...ids].sort((a, b) => FAMILY_ORDER.indexOf(exerciseById(a)?.family ?? 'curl') - FAMILY_ORDER.indexOf(exerciseById(b)?.family ?? 'curl'));

/** Plan exercise name → library id (null if the library has no match). More specific aliases win. */
export function matchExercise(name: string): string | null {
  const n = name.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const e of EXERCISES) {
    for (const a of e.aliases) {
      if (n.includes(a) && (!best || a.length > best.len)) best = { id: e.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// The user's settings (profiles.strength)
// ---------------------------------------------------------------------------

export interface StrengthPrefs {
  wrist: 'left' | 'right' | null;
  equipment: 'free' | 'machines' | 'mixed' | null;
  /** Library ids the user does. */
  exercises: string[];
  weightUnit: 'kg' | 'lb';
  /** Close a set by itself when the watch is sure; otherwise it always asks. */
  autoConfirm: boolean;
  /** Allow raw sensor data of the sets to be stored to improve the recognition. Off until the user says yes. */
  shareData: boolean;
  savedAt: string | null;
}

export const EMPTY_PREFS: StrengthPrefs = { wrist: null, equipment: null, exercises: [], weightUnit: 'kg', autoConfirm: true, shareData: false, savedAt: null };

/** Accepts whatever is in the database and returns clean settings (unknown ids dropped). */
export function normalizePrefs(raw: unknown): StrengthPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = Array.isArray(r.exercises) ? r.exercises.filter((x): x is string => typeof x === 'string' && !!exerciseById(x)) : [];
  return {
    wrist: r.wrist === 'left' || r.wrist === 'right' ? r.wrist : null,
    equipment: r.equipment === 'free' || r.equipment === 'machines' || r.equipment === 'mixed' ? r.equipment : null,
    exercises: [...new Set(ids)],
    weightUnit: r.weightUnit === 'lb' ? 'lb' : 'kg',
    autoConfirm: r.autoConfirm !== false,
    shareData: r.shareData === true,
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : null,
  };
}

/** The watch only starts strength training once these questions are answered on the website. */
export const prefsReady = (p: StrengthPrefs): boolean => !!p.savedAt && !!p.wrist && !!p.equipment && p.exercises.length > 0;

// ---------------------------------------------------------------------------
// Watch feed
// ---------------------------------------------------------------------------

export interface FeedExercise {
  /** Library id ('' if the plan names an exercise the library does not have). */
  i: string;
  /** Name on the watch. */
  n: string;
  /** Family id ('' without library entry). */
  f: string;
  /** Sets and target repetitions. */
  s: number;
  r: number;
  /** Weight of the last time, in the user's unit. */
  k?: number;
  /** Rest between sets in seconds. */
  rest: number;
}

export interface StrengthFeed {
  ready: boolean;
  /** Wrist: l or r. */
  w: 'l' | 'r' | null;
  /** Weight unit. */
  u: 'kg' | 'lb';
  auto: boolean;
  share: boolean;
  /** The user's own exercise list (free training, changing the exercise on the watch). */
  ex: { i: string; n: string; f: string }[];
  /** Today's strength session from the plan. */
  today: { id: string; t: string; ex: FeedExercise[] } | null;
}

export interface StrengthFeedInput {
  prefs: StrengthPrefs;
  /** Sessions of today. */
  workouts: CalWorkout[];
  /** Last weight per exercise id, in kg. */
  lastKg: Record<string, number>;
}

const STRENGTH_KINDS = new Set(['strength_upper', 'strength_lower', 'strength_full', 'custom']);
const KG_PER_LB = 0.45359237;
const TITLE_MAX = 26;
const NAME_MAX = 22;

/** Characters the watch font may not have (umlauts stay, they are in the fonts). */
const clean = (s: string) => s.replace(/[^\x20-\x7eÄÖÜäöüß]/g, '').trim();

/** First number of a rep text such as "8", "8–10" or "5 / side"; 0 if there is none or it is a time (seconds). */
export function repTarget(reps: string): number {
  if (/\bs\b|sec|min/i.test(reps)) return 0;
  const m = /\d+/.exec(reps);
  return m ? Math.min(99, parseInt(m[0], 10)) : 0;
}

export const toUnit = (kg: number, unit: 'kg' | 'lb'): number => {
  const v = unit === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 2) / 2;
};
export const toKg = (v: number, unit: 'kg' | 'lb'): number => Math.round((unit === 'lb' ? v * KG_PER_LB : v) * 100) / 100;

export function buildStrengthFeed(input: StrengthFeedInput): StrengthFeed {
  const { prefs } = input;
  const unit = prefs.weightUnit;
  const ready = prefsReady(prefs);
  const ex = sessionOrder(prefs.exercises).flatMap((id) => {
    const e = exerciseById(id);
    return e ? [{ i: e.id, n: e.de, f: e.family }] : [];
  });

  let today: StrengthFeed['today'] = null;
  const session = input.workouts.find((w) => STRENGTH_KINDS.has(w.kind) && w.status !== 'skipped' && w.steps.some((s) => s.type === 'exercise'));
  if (session) {
    const rows = session.steps.flatMap((s: CalStep): FeedExercise[] => {
      if (s.type !== 'exercise') return [];
      const id = ('id' in s && typeof s.id === 'string' && exerciseById(s.id) ? s.id : null) ?? matchExercise(s.name);
      const e = id ? exerciseById(id) : undefined;
      const kg = id ? input.lastKg[id] : undefined;
      return [{
        i: e?.id ?? '',
        n: e ? e.de : clean(s.name).slice(0, NAME_MAX),
        f: e?.family ?? '',
        s: Math.max(1, Math.min(10, s.sets || 1)),
        r: repTarget(s.reps) || e?.reps || 0,
        ...(kg ? { k: toUnit(kg, unit) } : {}),
        rest: e?.restS ?? 90,
      }];
    });
    if (rows.length) today = { id: session.id, t: clean(session.title).slice(0, TITLE_MAX), ex: rows.slice(0, 12) };
  }

  return { ready, w: prefs.wrist === 'left' ? 'l' : prefs.wrist === 'right' ? 'r' : null, u: unit, auto: prefs.autoConfirm, share: prefs.shareData, ex, today };
}

// ---------------------------------------------------------------------------
// Upload from the watch (POST /watch/strength)
// ---------------------------------------------------------------------------

/** One set as the watch sends it: position in the training, library id (or '' with a name), repetitions, weight in the
 *  user's unit, confidence 0-100, source, seconds from the start of the training, duration in seconds, counter measurements. */
export interface UploadedSet {
  i: number; e?: string; n?: string; r: number; k?: number; c?: number; m?: string; t?: number; d?: number; g?: number[];
}

export interface StrengthRow {
  user_id: string;
  session_key: string;
  idx: number;
  workout_id: string | null;
  local_date: string;
  started_at: string;
  duration_s: number | null;
  exercise_id: string | null;
  exercise_name: string | null;
  reps: number;
  weight_kg: number | null;
  source: 'plan' | 'pick' | 'auto';
  confidence: number | null;
  wrist: 'left' | 'right' | null;
  diag: Record<string, unknown> | null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Rows for the table from the body the watch posts; anything unusable is dropped. Weights come in the user's unit. */
export function strengthRows(userId: string, body: Record<string, unknown>, wrist: 'left' | 'right' | null): { rows: StrengthRow[] } | { error: string } {
  const started = Number(body.started);
  const sets = Array.isArray(body.sets) ? (body.sets as UploadedSet[]).slice(0, 200) : [];
  if (!Number.isFinite(started) || started <= 0 || !sets.length) return { error: 'No sets to save.' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? '')) ? String(body.date) : new Date(started * 1000).toISOString().slice(0, 10);
  const unit = body.unit === 'lb' ? 'lb' : 'kg';
  const workoutId = typeof body.workout === 'string' && /^[0-9a-f-]{36}$/.test(body.workout) ? body.workout : null;
  const session = body.diag && typeof body.diag === 'object' ? (body.diag as Record<string, unknown>) : null;
  const rows = sets.flatMap((s): StrengthRow[] => {
    if (!isNum(s.i) || !isNum(s.r)) return [];
    const id = typeof s.e === 'string' && exerciseById(s.e) ? s.e : null;
    const g = Array.isArray(s.g) ? s.g.filter(isNum).slice(0, 8) : null;
    const diag = { ...(g ? { g } : {}), ...(Math.round(s.i) === 0 && session ? { s: session } : {}) };
    return [{
      user_id: userId,
      session_key: String(Math.round(started)),
      idx: Math.round(s.i),
      workout_id: workoutId,
      local_date: date,
      started_at: new Date((started + (isNum(s.t) ? s.t : 0)) * 1000).toISOString(),
      duration_s: isNum(s.d) ? Math.round(s.d) : null,
      exercise_id: id,
      exercise_name: id ? null : String(s.n ?? '').slice(0, 40) || null,
      reps: Math.max(0, Math.min(999, Math.round(s.r))),
      weight_kg: isNum(s.k) && s.k > 0 ? toKg(s.k, unit) : null,
      source: s.m === 'pick' || s.m === 'auto' ? s.m : 'plan',
      confidence: isNum(s.c) ? Math.max(0, Math.min(100, Math.round(s.c))) : null,
      wrist,
      diag: Object.keys(diag).length ? diag : null,
    }];
  });
  return rows.length ? { rows } : { error: 'No valid sets.' };
}
