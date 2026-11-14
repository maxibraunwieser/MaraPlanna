// Daily nutrition targets that follow the training: energy (resting metabolism, everyday activity, training), carbohydrate,
// protein and fat by type of day, fibre, fluid and sodium. Pure functions: the numbers come in (profile, plan, Garmin,
// rules from the database), the targets go out together with how they were reached. Shared by the "nutrition" and
// "garmin" Edge Functions, the website's simulation and the tests.

export type DayType = 'rest' | 'easy' | 'strength' | 'hard' | 'long_run' | 'race' | 'carb_loading';
export type Goal = 'maintain' | 'lose' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'heavy';
export type Sex = 'male' | 'female' | null;

/** One row of nutrition_day_rules. */
export interface DayRule {
  day_type: DayType;
  carbs_min_gkg: number;
  carbs_max_gkg: number;
  protein_min_gkg: number;
  protein_max_gkg: number;
  fat_min_gkg: number;
  fiber_per_1000kcal: number;
  level: number;
  deficit_allowed: boolean;
}

/** nutrition_rules as key -> value. */
export type Rules = Record<string, number>;

/** The keys the calculation reads; a missing one makes the target unusable (reported, not guessed). */
export const RULE_KEYS = [
  'pal_sedentary', 'pal_light', 'pal_moderate', 'pal_heavy', 'run_kcal_per_kg_km', 'run_met_easy', 'run_met_hard', 'strength_met',
  'mobility_met', 'other_met', 'long_run_min_minutes', 'lose_deficit_kcal', 'max_deficit_kcal', 'gain_surplus_kcal',
  'no_deficit_days_before_race', 'min_kcal_abs', 'min_kcal_bmr_factor', 'fat_max_energy_pct', 'carb_loading_days',
  'carb_loading_min_race_minutes', 'water_ml_per_kg', 'water_ml_per_training_hour', 'sodium_base_mg',
  'sodium_mg_per_training_hour', 'sodium_min_session_minutes',
] as const;

export type SessionKind = 'run_easy' | 'run_hard' | 'run_long' | 'race' | 'strength' | 'mobility' | 'other';

/** A training session of the day: planned (from the plan) or done (from Garmin). */
export interface Session {
  kind: SessionKind;
  minutes: number | null;
  km: number | null;
  /** Measured energy (Garmin); null for a planned session. */
  kcal: number | null;
  done: boolean;
  title?: string;
}

export interface Body {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  bodyFatPct: number | null;
  /** Where the weight comes from (shown in the basis). */
  weightSource: 'entry' | 'garmin' | 'onboarding';
}

export interface DayInput {
  date: string;
  body: Body;
  goal: Goal;
  activity: ActivityLevel;
  sessions: Session[];
  /** Garmin's total energy of a finished day (includes training); null for today and future days. */
  garminTotalKcal: number | null;
  /** Days until the race (0 = race day); null without a race. */
  daysToRace: number | null;
  /** Expected race duration in minutes (carb loading only for long races). */
  raceMinutes: number | null;
  /** No deficit at all (pregnancy). */
  noDeficit: boolean;
  overrides: Partial<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number>>;
}

export interface TargetBasis {
  bmr: number;
  pal: number;
  everyday: number;
  training: number;
  trainingSource: 'none' | 'estimate' | 'garmin' | 'mixed';
  expenditure: number;
  expenditureSource: 'estimate' | 'garmin_total';
  adjustment: number;
  adjustmentReason: 'none' | 'lose' | 'gain' | 'hard_day' | 'race_prep' | 'no_deficit';
  raisedToFloor: boolean;
  raisedForMacros: boolean;
  hybrid: boolean;
  weightKg: number;
  weightSource: Body['weightSource'];
  ffmKg: number;
  ffmEstimated: boolean;
  carbsRange: [number, number];
  proteinRange: [number, number];
  fatMin: number;
  trainingMinutes: number;
  sessions: { kind: SessionKind; minutes: number | null; km: number | null; kcal: number; source: 'estimate' | 'garmin'; title?: string }[];
  overridden: string[];
}

export interface DayTarget {
  date: string;
  day_type: DayType;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  sodium_mg: number;
  basis: TargetBasis;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/** Resting energy (Mifflin-St Jeor). Without a stated sex the mean of both formulas. */
export function mifflinStJeor(b: Pick<Body, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  const base = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age;
  return base + (b.sex === 'male' ? 5 : b.sex === 'female' ? -161 : -78);
}

/** Fat-free mass: from the body-fat share when known, else Boer's formula (an estimate). */
export function fatFreeMass(b: Body): { kg: number; estimated: boolean } {
  if (b.bodyFatPct != null && b.bodyFatPct > 0 && b.bodyFatPct < 70) return { kg: b.weightKg * (1 - b.bodyFatPct / 100), estimated: false };
  const male = 0.407 * b.weightKg + 0.267 * b.heightCm - 19.2;
  const female = 0.252 * b.weightKg + 0.473 * b.heightCm - 48.3;
  const kg = b.sex === 'male' ? male : b.sex === 'female' ? female : (male + female) / 2;
  return { kg: Math.max(kg, b.weightKg * 0.5), estimated: true };
}

// ---------------------------------------------------------------------------
// Training energy and type of day
// ---------------------------------------------------------------------------

/** Estimated energy of a session (kcal): running by distance, otherwise MET x weight x hours. */
export function sessionKcal(s: Session, weightKg: number, rules: Rules): number {
  const isRun = s.kind === 'run_easy' || s.kind === 'run_hard' || s.kind === 'run_long' || s.kind === 'race';
  if (isRun && s.km != null && s.km > 0) return s.km * weightKg * rules.run_kcal_per_kg_km;
  const hours = (s.minutes ?? 0) / 60;
  const met = isRun ? (s.kind === 'run_hard' || s.kind === 'race' ? rules.run_met_hard : rules.run_met_easy)
    : s.kind === 'strength' ? rules.strength_met : s.kind === 'mobility' ? rules.mobility_met : rules.other_met;
  return met * weightKg * hours;
}

const LADDER: DayType[] = ['rest', 'easy', 'hard', 'long_run'];

/**
 * Type of day from its sessions and the race calendar. Strength and a run on the same day move the run one step up
 * (easy -> hard -> long run); strength alone is a strength day.
 */
export function dayType(sessions: Session[], daysToRace: number | null, raceMinutes: number | null, rules: Rules): { type: DayType; hybrid: boolean } {
  if (daysToRace === 0) return { type: 'race', hybrid: false };
  if (daysToRace != null && daysToRace > 0 && daysToRace <= rules.carb_loading_days && (raceMinutes ?? 0) >= rules.carb_loading_min_race_minutes) {
    return { type: 'carb_loading', hybrid: false };
  }
  const runs = sessions.filter((s) => s.kind === 'run_easy' || s.kind === 'run_hard' || s.kind === 'run_long' || s.kind === 'race');
  const strength = sessions.some((s) => s.kind === 'strength');
  if (runs.some((s) => s.kind === 'race')) return { type: 'race', hybrid: false };
  let run: DayType | null = null;
  for (const r of runs) {
    const t: DayType = r.kind === 'run_long' && (r.minutes ?? 0) >= rules.long_run_min_minutes ? 'long_run' : r.kind === 'run_hard' ? 'hard' : 'easy';
    if (!run || LADDER.indexOf(t) > LADDER.indexOf(run)) run = t;
  }
  // A long run planned without a duration but with a distance: long when it takes long at an easy pace (~6 min/km).
  if (run === 'easy' && runs.some((r) => r.kind === 'run_long' && r.minutes == null && (r.km ?? 0) * 6 >= rules.long_run_min_minutes)) run = 'long_run';
  if (!run) {
    if (strength) return { type: 'strength', hybrid: false };
    // Other sport (bike, swim) of some length counts as an easy day, mobility alone as rest.
    const other = sessions.filter((s) => s.kind === 'other').reduce((m, s) => m + (s.minutes ?? 0), 0);
    return { type: other >= 45 ? 'easy' : 'rest', hybrid: false };
  }
  if (strength) return { type: LADDER[Math.min(LADDER.length - 1, LADDER.indexOf(run) + 1)], hybrid: true };
  return { type: run, hybrid: false };
}

// ---------------------------------------------------------------------------
// The day's targets
// ---------------------------------------------------------------------------

const round = (v: number, step = 1) => Math.round(v / step) * step;

export function missingRules(rules: Rules, dayRules: DayRule[]): string[] {
  const missing: string[] = RULE_KEYS.filter((k) => typeof rules[k] !== 'number' || !Number.isFinite(rules[k]));
  for (const t of ['rest', 'easy', 'strength', 'hard', 'long_run', 'race', 'carb_loading'] as DayType[]) {
    if (!dayRules.some((r) => r.day_type === t)) missing.push(`day:${t}`);
  }
  return missing;
}

export function computeDay(input: DayInput, rules: Rules, dayRules: DayRule[]): DayTarget {
  const { body } = input;
  const kg = body.weightKg;
  const { type, hybrid } = dayType(input.sessions, input.daysToRace, input.raceMinutes, rules);
  const rule = dayRules.find((r) => r.day_type === type)!;

  // Energy
  const bmr = mifflinStJeor(body);
  const pal = rules[`pal_${input.activity}`] ?? rules.pal_light;
  const everyday = bmr * pal;
  const sessions = input.sessions.map((s) => {
    const garmin = s.done && s.kcal != null && s.kcal > 0;
    return { kind: s.kind, minutes: s.minutes, km: s.km, kcal: Math.round(garmin ? s.kcal! : sessionKcal(s, kg, rules)), source: (garmin ? 'garmin' : 'estimate') as 'garmin' | 'estimate', title: s.title };
  });
  const training = sessions.reduce((m, s) => m + s.kcal, 0);
  const trainingSource = !sessions.length ? 'none' : sessions.every((s) => s.source === 'garmin') ? 'garmin' : sessions.every((s) => s.source === 'estimate') ? 'estimate' : 'mixed';
  const useGarmin = input.garminTotalKcal != null && input.garminTotalKcal > bmr * 0.8;
  const expenditure = useGarmin ? input.garminTotalKcal! : everyday + training;

  // Goal: deficit only where allowed and never in the weeks before a race or on hard days.
  let adjustment = 0;
  let adjustmentReason: TargetBasis['adjustmentReason'] = 'none';
  if (input.goal === 'lose') {
    if (input.noDeficit) adjustmentReason = 'no_deficit';
    else if (!rule.deficit_allowed) adjustmentReason = 'hard_day';
    else if (input.daysToRace != null && input.daysToRace >= 0 && input.daysToRace <= rules.no_deficit_days_before_race) adjustmentReason = 'race_prep';
    else {
      adjustment = -Math.min(rules.lose_deficit_kcal, rules.max_deficit_kcal);
      adjustmentReason = 'lose';
    }
  } else if (input.goal === 'gain') {
    adjustment = rules.gain_surplus_kcal;
    adjustmentReason = 'gain';
  }
  let kcal = expenditure + adjustment;
  const floor = Math.max(rules.min_kcal_abs, bmr * rules.min_kcal_bmr_factor);
  const raisedToFloor = kcal < floor;
  kcal = Math.max(kcal, floor);

  // Macros: protein from the range (top on hybrid days), carbohydrate from the middle of the range, fat the rest.
  const protein = (hybrid ? rule.protein_max_gkg : (rule.protein_min_gkg + rule.protein_max_gkg) / 2) * kg;
  const cMin = rule.carbs_min_gkg * kg;
  const cMax = rule.carbs_max_gkg * kg;
  const fatMin = rule.fat_min_gkg * kg;
  let carbs = (cMin + cMax) / 2;
  let fat = (kcal - 4 * carbs - 4 * protein) / 9;
  let raisedForMacros = false;
  if (fat < fatMin) {
    // Too little energy for the macros: on easy days carbohydrate gives way (down to its range), on hard days, long runs,
    // race and carb loading the carbohydrate stays and the energy goes up.
    if (rule.deficit_allowed) carbs = Math.max(cMin, (kcal - 4 * protein - 9 * fatMin) / 4);
    fat = Math.max(fatMin, (kcal - 4 * carbs - 4 * protein) / 9);
    const need = 4 * carbs + 4 * protein + 9 * fat;
    if (need > kcal + 1) {
      kcal = need;
      raisedForMacros = true;
    }
  }
  const fatCap = (rules.fat_max_energy_pct / 100) * kcal;
  if (9 * fat > fatCap) {
    carbs = Math.min(cMax, (kcal - 4 * protein - fatCap) / 4);
    fat = (kcal - 4 * carbs - 4 * protein) / 9;
  }

  // Manual targets replace the computed ones; kcal follows the macros when only those are set.
  const overridden: string[] = [];
  const o = input.overrides ?? {};
  let p = protein, c = carbs, f = fat;
  if (o.protein_g != null) { p = o.protein_g; overridden.push('protein_g'); }
  if (o.carbs_g != null) { c = o.carbs_g; overridden.push('carbs_g'); }
  if (o.fat_g != null) { f = o.fat_g; overridden.push('fat_g'); }
  if (o.kcal != null) { kcal = o.kcal; overridden.push('kcal'); }
  else if (overridden.length) kcal = 4 * p + 4 * c + 9 * f;

  // Fluid and sodium
  const trainingMinutes = input.sessions.reduce((m, s) => m + (s.minutes ?? 0), 0);
  const longMinutes = input.sessions.filter((s) => (s.minutes ?? 0) >= rules.sodium_min_session_minutes).reduce((m, s) => m + (s.minutes ?? 0), 0);
  const water = kg * rules.water_ml_per_kg + (trainingMinutes / 60) * rules.water_ml_per_training_hour;
  const sodium = rules.sodium_base_mg + (longMinutes / 60) * rules.sodium_mg_per_training_hour;
  const ffm = fatFreeMass(body);

  return {
    date: input.date,
    day_type: type,
    kcal: round(kcal, 10),
    protein_g: round(p),
    carbs_g: round(c, 5),
    fat_g: round(f),
    fiber_g: round((kcal / 1000) * rule.fiber_per_1000kcal),
    water_ml: round(water, 50),
    sodium_mg: round(sodium, 50),
    basis: {
      bmr: Math.round(bmr), pal, everyday: Math.round(everyday), training: Math.round(training), trainingSource,
      expenditure: Math.round(expenditure), expenditureSource: useGarmin ? 'garmin_total' : 'estimate',
      adjustment, adjustmentReason, raisedToFloor, raisedForMacros, hybrid,
      weightKg: kg, weightSource: body.weightSource, ffmKg: Math.round(ffm.kg * 10) / 10, ffmEstimated: ffm.estimated,
      carbsRange: [round(cMin), round(cMax)], proteinRange: [round(rule.protein_min_gkg * kg), round(rule.protein_max_gkg * kg)], fatMin: round(fatMin),
      trainingMinutes, sessions, overridden,
    },
  };
}

// ---------------------------------------------------------------------------
// Energy availability (intake minus training energy per kg fat-free mass)
// ---------------------------------------------------------------------------

export interface EaDay {
  date: string;
  intakeKcal: number;
  trainingKcal: number;
  ffmKg: number;
  /** Whether enough was logged that day to judge it (an empty diary is not a low day). */
  logged: boolean;
}

/** Days below the threshold within the window; low = the hint is due. Days without a diary are not counted. */
export function energyAvailability(days: EaDay[], rules: Rules): { low: boolean; lowDays: number; judged: number; values: { date: string; ea: number }[] } {
  const window = days.slice(-Math.max(1, rules.ea_window_days ?? 7));
  const values = window.filter((d) => d.logged && d.ffmKg > 0).map((d) => ({ date: d.date, ea: (d.intakeKcal - d.trainingKcal) / d.ffmKg }));
  const lowDays = values.filter((v) => v.ea < (rules.ea_low_kcal_per_kg_ffm ?? 30)).length;
  return { low: lowDays >= (rules.ea_low_days ?? 3), lowDays, judged: values.length, values };
}

/** Short stable hash (FNV-1a) of what a day's targets depend on. */
export function hashInputs(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
