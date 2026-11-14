import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/20261115000000_nutrition.sql?raw';
import { seedRows } from '../sim/sqlSeed';
import { computeDay, dayType, energyAvailability, fatFreeMass, mifflinStJeor, missingRules, sessionKcal, type DayInput, type DayRule, type Rules, type Session } from '../../supabase/functions/_shared/nutrition/targets';
import { activityKind, plannedKind, refreshTargets } from '../../supabase/functions/_shared/nutrition/service';

const seed = seedRows(sql);
const rules: Rules = Object.fromEntries(seed.nutrition_rules.map((r) => [r.key as string, r.value as number]));
const dayRules = seed.nutrition_day_rules as unknown as DayRule[];

const body = { weightKg: 70, heightCm: 178, age: 35, sex: 'male' as const, bodyFatPct: null, weightSource: 'entry' as const };
const day = (over: Partial<DayInput> = {}): DayInput => ({
  date: '2026-11-14', body, goal: 'maintain', activity: 'light', sessions: [], garminTotalKcal: null, daysToRace: null, raceMinutes: null,
  noDeficit: false, overrides: {}, ...over,
});
const run = (kind: Session['kind'], minutes: number | null, km: number | null, extra: Partial<Session> = {}): Session => ({ kind, minutes, km, kcal: null, done: false, ...extra });

describe('seed of the migration', () => {
  it('has every rule the calculation reads and all day types', () => {
    expect(missingRules(rules, dayRules)).toEqual([]);
    expect(seed.nutrients.length).toBeGreaterThan(20);
    expect(seed.nutrient_references.length).toBe(38);
    expect(seed.nutrient_references.find((r) => r.nutrient_code === 'iron' && r.sex === 'female' && r.age_max === 50)).toMatchObject({ target: 16, upper_limit: 40, athlete_extra_pct: 30 });
    expect(seed.nutrient_references.every((r) => seed.nutrients.some((n) => n.code === r.nutrient_code))).toBe(true);
  });
  it('keeps the table of the brief: rest 3-5, long run 8-10, carb loading 10-12 g/kg', () => {
    const by = (t: string) => dayRules.find((r) => r.day_type === t)!;
    expect([by('rest').carbs_min_gkg, by('rest').carbs_max_gkg]).toEqual([3, 5]);
    expect([by('long_run').carbs_min_gkg, by('long_run').carbs_max_gkg]).toEqual([8, 10]);
    expect([by('carb_loading').carbs_min_gkg, by('carb_loading').carbs_max_gkg]).toEqual([10, 12]);
  });
});

describe('body', () => {
  it('Mifflin-St Jeor', () => {
    expect(mifflinStJeor(body)).toBeCloseTo(1642.5);
    expect(mifflinStJeor({ ...body, sex: 'female' })).toBeCloseTo(1476.5);
    expect(mifflinStJeor({ ...body, sex: null })).toBeCloseTo(1559.5);
  });
  it('fat-free mass from body fat, else estimated', () => {
    expect(fatFreeMass({ ...body, bodyFatPct: 15 })).toEqual({ kg: 59.5, estimated: false });
    expect(fatFreeMass(body).estimated).toBe(true);
    expect(fatFreeMass(body).kg).toBeCloseTo(0.407 * 70 + 0.267 * 178 - 19.2);
  });
});

describe('type of day', () => {
  it('follows the sessions', () => {
    expect(dayType([], null, null, rules).type).toBe('rest');
    expect(dayType([run('run_easy', 45, 8)], null, null, rules).type).toBe('easy');
    expect(dayType([run('strength', 50, null)], null, null, rules).type).toBe('strength');
    expect(dayType([run('run_hard', 60, 12)], null, null, rules).type).toBe('hard');
    expect(dayType([run('run_long', 120, 22)], null, null, rules).type).toBe('long_run');
    // a "long" run shorter than the limit is an easy day; one with distance only counts at ~6 min/km
    expect(dayType([run('run_long', 70, 12)], null, null, rules).type).toBe('easy');
    expect(dayType([run('run_long', null, 18)], null, null, rules).type).toBe('long_run');
    expect(dayType([run('mobility', 30, null)], null, null, rules).type).toBe('rest');
  });
  it('a strength and a run day is one step harder', () => {
    expect(dayType([run('run_easy', 45, 8), run('strength', 45, null)], null, null, rules)).toEqual({ type: 'hard', hybrid: true });
    expect(dayType([run('run_hard', 60, 12), run('strength', 45, null)], null, null, rules)).toEqual({ type: 'long_run', hybrid: true });
  });
  it('race day and carb loading before long races only', () => {
    expect(dayType([], 0, 210, rules).type).toBe('race');
    expect(dayType([run('run_easy', 20, 3)], 1, 210, rules).type).toBe('carb_loading');
    expect(dayType([], 2, 210, rules).type).toBe('carb_loading');
    expect(dayType([], 3, 210, rules).type).toBe('rest');
    expect(dayType([run('run_easy', 20, 3)], 1, 25, rules).type).toBe('easy');
  });
});

describe('targets of a day', () => {
  it('rest day: carbohydrate within 3-5 g/kg, protein 1.8 g/kg, fat between 0.8 g/kg and 35 % of energy', () => {
    const t = computeDay(day(), rules, dayRules);
    expect(t.day_type).toBe('rest');
    // the middle (280 g) would leave fat above 35 % of energy, so carbohydrate takes the rest
    expect(t.carbs_g).toBe(300);
    expect(t.carbs_g).toBeLessThanOrEqual(350);
    expect(9 * t.fat_g).toBeLessThanOrEqual(0.35 * t.kcal + 9);
    expect(t.protein_g).toBe(126);
    expect(t.fat_g).toBeGreaterThanOrEqual(56);
    expect(t.basis.training).toBe(0);
    expect(t.basis.expenditure).toBe(Math.round(1642.5 * 1.6));
  });
  it('long-run day needs far more carbohydrate than a rest day', () => {
    const rest = computeDay(day(), rules, dayRules);
    const long = computeDay(day({ sessions: [run('run_long', 150, 28)] }), rules, dayRules);
    expect(long.day_type).toBe('long_run');
    expect(long.carbs_g).toBe(630);
    expect(long.kcal).toBeGreaterThan(rest.kcal + 1500);
    expect(long.basis.training).toBe(28 * 70);
    expect(long.basis.trainingSource).toBe('estimate');
  });
  it('Garmin energy replaces the estimate', () => {
    const t = computeDay(day({ sessions: [run('run_easy', 50, 10, { done: true, kcal: 812 })] }), rules, dayRules);
    expect(t.basis.training).toBe(812);
    expect(t.basis.trainingSource).toBe('garmin');
    const past = computeDay(day({ garminTotalKcal: 3100, sessions: [run('run_easy', 50, 10, { done: true, kcal: 812 })] }), rules, dayRules);
    expect(past.basis.expenditure).toBe(3100);
    expect(past.basis.expenditureSource).toBe('garmin_total');
  });
  it('a deficit only on easy days, never on hard days, before a race or in pregnancy, and at most 500 kcal', () => {
    const easy = day({ goal: 'lose', sessions: [run('run_easy', 45, 8)] });
    const maintain = computeDay({ ...easy, goal: 'maintain' }, rules, dayRules);
    const lose = computeDay(easy, rules, dayRules);
    expect(lose.basis.adjustment).toBe(-400);
    expect(maintain.kcal - lose.kcal).toBeLessThanOrEqual(500);
    expect(computeDay(day({ goal: 'lose', sessions: [run('run_hard', 60, 12)] }), rules, dayRules).basis.adjustmentReason).toBe('hard_day');
    expect(computeDay({ ...easy, daysToRace: 10, raceMinutes: 200 }, rules, dayRules).basis.adjustmentReason).toBe('race_prep');
    expect(computeDay({ ...easy, noDeficit: true }, rules, dayRules).basis.adjustment).toBe(0);
    expect(computeDay(day({ goal: 'lose' }), { ...rules, lose_deficit_kcal: 900 }, dayRules).basis.adjustment).toBe(-500);
  });
  it('never below the resting metabolism', () => {
    const small = { ...body, weightKg: 48, heightCm: 158, sex: 'female' as const };
    const t = computeDay(day({ body: small, goal: 'lose', activity: 'sedentary' }), rules, dayRules);
    expect(t.kcal).toBeGreaterThanOrEqual(Math.max(rules.min_kcal_abs, mifflinStJeor(small)) - 10);
  });
  it('carb loading raises energy so the carbohydrate fits', () => {
    const t = computeDay(day({ daysToRace: 1, raceMinutes: 210 }), rules, dayRules);
    expect(t.day_type).toBe('carb_loading');
    expect(t.carbs_g).toBe(770);
    expect(t.basis.raisedForMacros).toBe(true);
    expect(t.fat_g).toBeGreaterThanOrEqual(42);
  });
  it('manual targets win', () => {
    const t = computeDay(day({ overrides: { protein_g: 150 } }), rules, dayRules);
    expect(t.protein_g).toBe(150);
    expect(t.basis.overridden).toEqual(['protein_g']);
    expect(computeDay(day({ overrides: { kcal: 2222 } }), rules, dayRules).kcal).toBe(2220);
  });
  it('fluid and sodium grow with training', () => {
    const rest = computeDay(day(), rules, dayRules);
    const long = computeDay(day({ sessions: [run('run_long', 120, 22)] }), rules, dayRules);
    expect(rest.water_ml).toBe(2450);
    expect(long.water_ml).toBe(2450 + 1200);
    expect(long.sodium_mg).toBe(1500 + 1000);
    expect(rest.sodium_mg).toBe(1500);
  });
  it('running energy by distance, otherwise MET', () => {
    expect(sessionKcal(run('run_easy', 50, 10), 70, rules)).toBe(700);
    expect(sessionKcal(run('strength', 60, null), 70, rules)).toBe(350);
  });
});

describe('energy availability', () => {
  it('needs several low, logged days', () => {
    const d = (date: string, intake: number, logged = true) => ({ date, intakeKcal: intake, trainingKcal: 800, ffmKg: 58, logged });
    expect(energyAvailability([d('1', 2700), d('2', 2700), d('3', 2700)], rules).low).toBe(false);
    expect(energyAvailability([d('1', 2200), d('2', 2300), d('3', 2400), d('4', 2400)], rules).low).toBe(true);
    expect(energyAvailability([d('1', 900, false), d('2', 900, false), d('3', 900, false)], rules)).toMatchObject({ low: false, judged: 0 });
  });
});

describe('kinds of sessions', () => {
  it('maps plan and Garmin kinds', () => {
    expect(plannedKind('long_mp', 20)).toBe('run_long');
    expect(plannedKind('intervals', 10)).toBe('run_hard');
    expect(plannedKind('strength_full', null)).toBe('strength');
    expect(plannedKind('custom', 8)).toBe('run_easy');
    expect(activityKind('run', 50, 'threshold', 90)).toBe('run_hard');
    expect(activityKind('run', 110, null, 90)).toBe('run_long');
    expect(activityKind('walk', 40, null, 90)).toBe('mobility');
  });
});

// A minimal stand-in for the query API (eq, gte, lte, order, limit, upsert) on top of plain arrays.
function memoryDb(tables: Record<string, Record<string, unknown>[]>) {
  const q = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let max: number | null = null;
    let sort: { col: string; asc: boolean } | null = null;
    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), api),
      lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), api),
      order: (col: string, o?: { ascending?: boolean }) => ((sort = { col, asc: o?.ascending !== false }), api),
      limit: (n: number) => ((max = n), api),
      upsert: async (rows: Record<string, unknown>[]) => {
        const t = (tables[table] ??= []);
        for (const r of rows) {
          const i = t.findIndex((x) => x.user_id === r.user_id && x.date === r.date);
          if (i >= 0) t[i] = r;
          else t.push(r);
        }
        return { error: null };
      },
      then: (ok: (v: { data: unknown; error: null }) => unknown) => {
        let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (sort) {
          const s = sort;
          out = [...out].sort((a, b) => (String(a[s.col]) > String(b[s.col]) ? 1 : -1) * (s.asc ? 1 : -1));
        }
        if (max !== null) out = out.slice(0, max);
        return Promise.resolve({ data: out, error: null }).then(ok);
      },
    };
    return api;
  };
  return { from: q, tables };
}

describe('refreshTargets', () => {
  const base = () => memoryDb({
    nutrition_rules: seed.nutrition_rules as never,
    nutrition_day_rules: seed.nutrition_day_rules as never,
    profiles: [{ id: 'u', onboarding: { sex: 'male', setup: { heightCm: 178, weightKg: 72, birthDate: '1991-04-12' } } }],
    nutrition_profiles: [{ user_id: 'u', goal: 'maintain', activity_level: 'light' }],
    garmin_connections: [],
    training_plans: [{ id: 'p', user_id: 'u', status: 'active', race_date: '2026-11-22', fitness: { raceDistanceM: 42195, targetMarathonS: 12600, predictedMarathonS: 12900 } }],
    planned_workouts: [
      { id: 'w1', plan_id: 'p', date: '2026-11-14', kind: 'long', title: 'Long run', distance_km: 26, duration_min: 150, status: 'planned', activity_id: null },
      { id: 'w2', plan_id: 'p', date: '2026-11-16', kind: 'intervals', title: 'Intervals', distance_km: 11, duration_min: 60, status: 'planned', activity_id: null },
    ],
    body_weight_entries: [],
    activities: [],
    daily_metrics: [],
    nutrition_daily_targets: [],
  });

  it('computes, stores, and recomputes only what changed', async () => {
    const db = base();
    const first = await refreshTargets(db, 'u', '2026-11-14', '2026-11-22', '2026-11-14');
    expect(first.map((t) => t.day_type)).toEqual(['long_run', 'rest', 'hard', 'rest', 'rest', 'rest', 'carb_loading', 'carb_loading', 'race']);
    expect(db.tables.nutrition_daily_targets).toHaveLength(9);
    expect(first[0].basis.weightSource).toBe('onboarding');
    const stamp = first[1].inputs_hash;

    // A Garmin run today and a new weight: today is recomputed with the measured energy, the stored days are reused.
    db.tables.activities.push({ id: 'a1', user_id: 'u', sport: 'run', local_date: '2026-11-14', duration_s: 9300, distance_m: 26200, calories: 1950, name: 'Long run' });
    (db.tables.planned_workouts[0] as Record<string, unknown>).activity_id = 'a1';
    const second = await refreshTargets(db, 'u', '2026-11-14', '2026-11-22', '2026-11-14');
    expect(second[0].basis.training).toBe(1950);
    expect(second[0].basis.trainingSource).toBe('garmin');
    expect(second[1].inputs_hash).toBe(stamp);

    db.tables.body_weight_entries.push({ user_id: 'u', date: '2026-11-13', weight_kg: 70, body_fat_pct: null, source: 'manual' });
    const third = await refreshTargets(db, 'u', '2026-11-14', '2026-11-22', '2026-11-14');
    expect(third[1].basis.weightKg).toBe(70);
    expect(third[1].basis.weightSource).toBe('entry');
    expect(third[1].inputs_hash).not.toBe(stamp);
  });

  it('days before the first weigh-in use the nearest one', async () => {
    const db = base();
    db.tables.profiles = [{ id: 'u', onboarding: { sex: 'male', setup: { heightCm: 178, weightKg: null, birthDate: '1991-04-12' } } }];
    db.tables.body_weight_entries.push({ user_id: 'u', date: '2026-11-14', weight_kg: 74.5, body_fat_pct: null, source: 'manual' });
    const rows = await refreshTargets(db, 'u', '2026-11-08', '2026-11-14', '2026-11-14');
    expect(rows.map((r) => r.basis.weightKg)).toEqual(Array(7).fill(74.5));
  });

  it('says when body data is missing', async () => {
    const db = base();
    db.tables.profiles = [{ id: 'u', onboarding: { setup: {} } }];
    await expect(refreshTargets(db, 'u', '2026-11-14', '2026-11-14', '2026-11-14')).rejects.toMatchObject({ code: 'no_body' });
  });
});
