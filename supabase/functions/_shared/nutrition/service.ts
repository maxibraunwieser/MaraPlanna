// Reads what the daily targets depend on (profile, plan, Garmin, weight, rules) for one person and a range of days,
// computes the targets and stores the days whose inputs changed. Works with any client that speaks the Supabase query
// API: the service-role client of the Edge Functions and the in-memory stand-in of the website's simulation.

import { computeDay, hashInputs, missingRules, type ActivityLevel, type Body, type DayInput, type DayRule, type DayTarget, type Goal, type Rules, type Session, type SessionKind } from './targets.ts';

/** Raise when the calculation changes in a way that should recompute stored days. */
export const TARGETS_VERSION = 1;

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };
type Rec = Record<string, unknown>;

const DAY_MS = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export interface TargetRow extends DayTarget {
  user_id: string;
  inputs_hash: string;
  version: number;
  computed_at: string;
}

export class TargetsError extends Error {
  constructor(public code: 'no_body' | 'no_rules', message: string) {
    super(message);
  }
}

async function rows(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Rec[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Kind of a planned workout (planned_workouts.kind) for the energy estimate and the type of day. */
export function plannedKind(kind: string, distanceKm: number | null): SessionKind {
  switch (kind) {
    case 'easy': case 'recovery': case 'shakeout': return 'run_easy';
    case 'long': case 'long_mp': return 'run_long';
    case 'threshold': case 'intervals': case 'marathon_pace': case 'fartlek': return 'run_hard';
    case 'race': return 'race';
    case 'strength_upper': case 'strength_lower': case 'strength_full': case 'strength_cali': case 'plyo': return 'strength';
    case 'core': case 'mobility': return 'mobility';
    case 'bike': case 'swim': return 'other';
    default: return distanceKm ? 'run_easy' : 'other';
  }
}

/** Kind of a recorded activity; a run linked to a planned workout takes the workout's kind. */
export function activityKind(sport: string, minutes: number, linkedKind: string | null, longMinutes: number): SessionKind {
  if (sport === 'run') {
    if (linkedKind) {
      const k = plannedKind(linkedKind, 1);
      if (k.startsWith('run') || k === 'race') return k;
    }
    return minutes >= longMinutes ? 'run_long' : 'run_easy';
  }
  if (sport === 'strength') return 'strength';
  if (sport === 'mobility' || sport === 'walk') return 'mobility';
  return 'other';
}

function ageOn(birthDate: string | null | undefined, date: string, fallback: number | null): number | null {
  if (birthDate && /^\d{4}-\d{2}-\d{2}/.test(birthDate)) {
    const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number);
    const [ty, tm, td] = date.split('-').map(Number);
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  }
  return fallback;
}

export interface Loaded {
  rules: Rules;
  dayRules: DayRule[];
  inputs: DayInput[];
}

/** Everything the targets of [from, to] depend on, as one input per day. */
export async function loadInputs(db: Db, userId: string, from: string, to: string, today: string): Promise<Loaded> {
  const [ruleRows, dayRuleRows, profileRows, nutritionRows, connRows, planRows, weightRows, activityRows, metricRows] = await Promise.all([
    rows(db.from('nutrition_rules').select('key, value')),
    rows(db.from('nutrition_day_rules').select('*')),
    rows(db.from('profiles').select('onboarding').eq('id', userId)),
    rows(db.from('nutrition_profiles').select('*').eq('user_id', userId)),
    rows(db.from('garmin_connections').select('profile').eq('user_id', userId)),
    rows(db.from('training_plans').select('id, race_date, fitness').eq('user_id', userId).eq('status', 'active')),
    rows(db.from('body_weight_entries').select('date, weight_kg, body_fat_pct, source').eq('user_id', userId).lte('date', to).order('date', { ascending: false }).limit(400)),
    rows(db.from('activities').select('id, sport, local_date, duration_s, distance_m, calories, name').eq('user_id', userId).gte('local_date', from).lte('local_date', to)),
    rows(db.from('daily_metrics').select('date, total_kcal').eq('user_id', userId).gte('date', from).lte('date', to)),
  ]);

  const rules: Rules = {};
  for (const r of ruleRows) {
    const v = num(r.value);
    if (typeof r.key === 'string' && v != null) rules[r.key] = v;
  }
  const dayRules = dayRuleRows.map((r) => ({
    day_type: r.day_type, carbs_min_gkg: num(r.carbs_min_gkg), carbs_max_gkg: num(r.carbs_max_gkg), protein_min_gkg: num(r.protein_min_gkg),
    protein_max_gkg: num(r.protein_max_gkg), fat_min_gkg: num(r.fat_min_gkg), fiber_per_1000kcal: num(r.fiber_per_1000kcal), level: num(r.level), deficit_allowed: r.deficit_allowed !== false,
  })) as DayRule[];
  const missing = missingRules(rules, dayRules);
  if (missing.length) throw new TargetsError('no_rules', `Nutrition rules are missing in the database: ${missing.join(', ')}`);

  const answers = (profileRows[0]?.onboarding ?? null) as Rec | null;
  const setup = (answers?.setup ?? null) as Rec | null;
  const np = (nutritionRows[0] ?? {}) as Rec;
  const garminWeight = num(((connRows[0]?.profile ?? null) as Rec | null)?.weightKg);
  const plan = planRows[0] as Rec | undefined;
  const fitness = (plan?.fitness ?? null) as Rec | null;
  const hasRace = !!plan && fitness?.raceDistanceM !== null;
  const raceDate = hasRace ? (plan!.race_date as string) : null;
  const raceS = num(fitness?.targetMarathonS) || num(fitness?.predictedMarathonS);
  const workoutRows = plan
    ? await rows(db.from('planned_workouts').select('id, date, kind, title, distance_km, duration_min, status, activity_id').eq('plan_id', plan.id as string).gte('date', from).lte('date', to))
    : [];

  const heightCm = num(setup?.heightCm);
  const sexRaw = answers?.sex;
  const sex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null;
  const goal = (['maintain', 'lose', 'gain'].includes(np.goal as string) ? np.goal : 'maintain') as Goal;
  const activity = (['sedentary', 'light', 'moderate', 'heavy'].includes(np.activity_level as string) ? np.activity_level : 'light') as ActivityLevel;
  const overrides = (np.overrides && typeof np.overrides === 'object' ? np.overrides : {}) as DayInput['overrides'];
  const longMinutes = rules.long_run_min_minutes;
  const linkedKind = new Map<string, string>();
  for (const w of workoutRows) if (w.activity_id) linkedKind.set(w.activity_id as string, w.kind as string);

  const inputs: DayInput[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    // Weight: newest entry up to that day (own entry before Garmin's on the same day), then Garmin, then the setup.
    // Days before the first weigh-in take the nearest one (weight changes slowly; better than no target at all).
    const entry = weightRows.filter((w) => (w.date as string) <= date).sort((a, b) => (a.date === b.date ? (a.source === 'manual' ? -1 : 1) : 0))[0]
      ?? weightRows.filter((w) => (w.date as string) > date).at(-1);
    const fatEntry = weightRows.find((w) => (w.date as string) <= date && num(w.body_fat_pct) != null);
    const weightKg = num(entry?.weight_kg) ?? garminWeight ?? num(setup?.weightKg);
    const weightSource: Body['weightSource'] = entry ? 'entry' : garminWeight != null ? 'garmin' : 'onboarding';
    const age = ageOn(setup?.birthDate as string | null, date, num(answers?.age));
    if (weightKg == null || heightCm == null || age == null) {
      throw new TargetsError('no_body', 'Body weight, height and age are needed for the targets.');
    }

    // Sessions: what Garmin recorded that day, plus (today and later) what the plan still has open.
    const sessions: Session[] = [];
    const done = activityRows.filter((a) => a.local_date === date);
    for (const a of done) {
      const minutes = (num(a.duration_s) ?? 0) / 60;
      sessions.push({
        kind: activityKind(String(a.sport), minutes, linkedKind.get(a.id as string) ?? null, longMinutes),
        minutes: Math.round(minutes), km: num(a.distance_m) != null ? num(a.distance_m)! / 1000 : null, kcal: num(a.calories), done: true, title: (a.name as string) ?? undefined,
      });
    }
    if (date >= today) {
      const doneIds = new Set(done.map((a) => a.id));
      for (const w of workoutRows.filter((x) => x.date === date)) {
        if (w.status === 'skipped' || w.status === 'missed' || w.status === 'completed') continue;
        if (w.activity_id && doneIds.has(w.activity_id)) continue;
        const km = num(w.distance_km);
        sessions.push({ kind: plannedKind(w.kind as string, km), minutes: num(w.duration_min), km, kcal: null, done: false, title: w.title as string });
      }
    }

    const garminTotal = date < today ? num(metricRows.find((m) => m.date === date)?.total_kcal) : null;
    inputs.push({
      date,
      body: { weightKg, heightCm, age, sex, bodyFatPct: num(fatEntry?.body_fat_pct), weightSource },
      goal,
      activity,
      sessions,
      garminTotalKcal: garminTotal,
      daysToRace: raceDate && raceDate >= date ? daysBetween(date, raceDate) : null,
      raceMinutes: raceS ? raceS / 60 : null,
      noDeficit: setup?.pregnancy === 'yes',
      overrides,
    });
  }
  return { rules, dayRules, inputs };
}

/**
 * Targets of [from, to] for one person: days whose inputs changed (or that were never computed) are computed and stored,
 * the others are read back as they are. Returns all days in order.
 */
export async function refreshTargets(db: Db, userId: string, from: string, to: string, today: string): Promise<TargetRow[]> {
  const { rules, dayRules, inputs } = await loadInputs(db, userId, from, to, today);
  const stored = await rows(db.from('nutrition_daily_targets').select('*').eq('user_id', userId).gte('date', from).lte('date', to));
  const byDate = new Map(stored.map((r) => [r.date as string, r as unknown as TargetRow]));
  const out: TargetRow[] = [];
  const changed: TargetRow[] = [];
  const now = new Date().toISOString();
  for (const input of inputs) {
    const hash = hashInputs({ v: TARGETS_VERSION, input, rules, dayRules });
    const prev = byDate.get(input.date);
    if (prev && prev.inputs_hash === hash && prev.version === TARGETS_VERSION) {
      out.push(prev);
      continue;
    }
    const row: TargetRow = { ...computeDay(input, rules, dayRules), user_id: userId, inputs_hash: hash, version: TARGETS_VERSION, computed_at: now };
    changed.push(row);
    out.push(row);
  }
  if (changed.length) {
    const { error } = await db.from('nutrition_daily_targets').upsert(changed, { onConflict: 'user_id,date' });
    if (error) throw new Error(error.message);
  }
  return out;
}
