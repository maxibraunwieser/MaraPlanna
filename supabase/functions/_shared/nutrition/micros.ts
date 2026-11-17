// How well the micronutrients of a day are covered, as a scale instead of numbers: the share of the person's reference value
// (D-A-CH, plus the athlete extra where there is one) is turned into a level with the thresholds of nutrition_rules.
// A nutrient for which too little of the eaten food has a value is "unknown", never "very low" (missing data is not zero).

import { MICRO_CODES, type MealItem, type MicroCode } from './items.ts';
import type { Rules } from './targets.ts';

export type Level = 'too_much' | 'very_good' | 'good' | 'fair' | 'low' | 'very_low' | 'unknown';
export type MealLevel = 'much' | 'some' | 'little' | 'none' | 'unknown';

export const MICRO_RULE_KEYS = ['micro_level_very_good', 'micro_level_good', 'micro_level_fair', 'micro_level_low', 'micro_min_coverage', 'meal_micro_much', 'meal_micro_some'] as const;

export interface NutrientInfo {
  code: string;
  name_de: string;
  name_en: string;
  unit: string;
  category: string;
  endurance_key: boolean;
  sort: number;
}

export interface ReferenceRow {
  nutrient_code: string;
  sex: 'male' | 'female' | 'any';
  age_min: number;
  age_max: number | null;
  target: number;
  upper_limit: number | null;
  athlete_extra_pct: number;
}

export interface Person {
  sex: 'male' | 'female' | null;
  age: number;
}

/** The person's daily reference of a nutrient (with the athlete extra); null when there is none. */
export function referenceFor(refs: ReferenceRow[], code: string, p: Person): { target: number; upper: number | null } | null {
  const fits = (r: ReferenceRow) => r.nutrient_code === code && Number(r.age_min) <= p.age && (r.age_max === null || p.age <= Number(r.age_max));
  const pick = (sex: string) => refs.find((r) => fits(r) && r.sex === sex);
  const any = pick('any');
  let row = p.sex ? pick(p.sex) ?? any : any;
  if (!row && !p.sex) {
    // no stated sex and only sex-specific values: the mean of both
    const m = pick('male');
    const f = pick('female');
    if (m && f) row = { ...m, target: (Number(m.target) + Number(f.target)) / 2, upper_limit: m.upper_limit ?? f.upper_limit };
  }
  if (!row) return null;
  const target = Number(row.target) * (1 + Number(row.athlete_extra_pct ?? 0) / 100);
  return { target, upper: row.upper_limit === null || row.upper_limit === undefined ? null : Number(row.upper_limit) };
}

export const microRulesMissing = (rules: Rules) => MICRO_RULE_KEYS.filter((k) => typeof rules[k] !== 'number' || !Number.isFinite(rules[k]));

/** Level of a share of the reference (percent). */
export function levelOf(pct: number, rules: Rules): Exclude<Level, 'too_much' | 'unknown'> {
  if (pct >= rules.micro_level_very_good) return 'very_good';
  if (pct >= rules.micro_level_good) return 'good';
  if (pct >= rules.micro_level_fair) return 'fair';
  if (pct >= rules.micro_level_low) return 'low';
  return 'very_low';
}

/** Steps of the scale for drawing (5 = very good; too much is drawn full in another colour; unknown 0). */
export const LEVEL_STEPS: Record<Level, number> = { very_good: 5, good: 4, fair: 3, low: 2, very_low: 1, too_much: 5, unknown: 0 };

export interface MicroStatus {
  code: string;
  level: Level;
  /** Share of the reference in percent (kept for the overall rating; not shown as a number). */
  pct: number;
  /** Share (0..1) of the eaten energy whose foods have a value for this nutrient. */
  coverage: number;
}

/** Amount of a nutrient in items, and how much of their energy has a value for it. */
function sumOf(items: Pick<MealItem, 'kcal' | 'micros'>[], code: string): { amount: number; coverage: number } {
  let amount = 0;
  let known = 0;
  let energy = 0;
  for (const it of items) {
    const k = Math.max(0, Number(it.kcal) || 0);
    energy += k;
    const v = (it.micros as Record<string, number> | undefined)?.[code];
    if (typeof v === 'number' && Number.isFinite(v)) {
      amount += v;
      known += k;
    }
  }
  return { amount, coverage: energy > 0 ? known / energy : 0 };
}

/**
 * Status of every micronutrient of a day. `targets` can replace a reference (sodium follows the training: the day's sodium
 * target). Nutrients without a reference are left out.
 */
export function dayMicros(items: Pick<MealItem, 'kcal' | 'micros'>[], refs: ReferenceRow[], person: Person, rules: Rules, targets: Partial<Record<string, number>> = {}): MicroStatus[] {
  const out: MicroStatus[] = [];
  for (const code of MICRO_CODES) {
    const ref = referenceFor(refs, code, person);
    const target = targets[code] ?? ref?.target;
    if (!target) continue;
    const { amount, coverage } = sumOf(items, code);
    const pct = (amount / target) * 100;
    let level: Level;
    if (!items.length || coverage * 100 < rules.micro_min_coverage) level = 'unknown';
    else if (ref?.upper && amount > ref.upper) level = 'too_much';
    else level = levelOf(pct, rules);
    out.push({ code, level, pct, coverage });
  }
  return out;
}

/** Rating of the whole day: the mean share (each capped at 100 %) of the nutrients with enough data. */
export function overallLevel(list: MicroStatus[], rules: Rules): { level: Level; rated: number; good: number } {
  const rated = list.filter((m) => m.level !== 'unknown');
  if (!rated.length) return { level: 'unknown', rated: 0, good: 0 };
  const mean = rated.reduce((s, m) => s + Math.min(100, m.pct), 0) / rated.length;
  const good = rated.filter((m) => m.level === 'very_good' || m.level === 'good').length;
  return { level: levelOf(mean, rules), rated: rated.length, good };
}

/** What one meal contributes to the day's reference: much, some, little. */
export function mealMicros(items: Pick<MealItem, 'kcal' | 'micros'>[], refs: ReferenceRow[], person: Person, rules: Rules, targets: Partial<Record<string, number>> = {}): { code: MicroCode; level: MealLevel; pct: number }[] {
  const out: { code: MicroCode; level: MealLevel; pct: number }[] = [];
  for (const code of MICRO_CODES) {
    const target = targets[code] ?? referenceFor(refs, code, person)?.target;
    if (!target) continue;
    const { amount, coverage } = sumOf(items, code);
    const pct = (amount / target) * 100;
    const level: MealLevel = coverage * 100 < rules.micro_min_coverage ? 'unknown' : pct >= rules.meal_micro_much ? 'much' : pct >= rules.meal_micro_some ? 'some' : pct >= 1 ? 'little' : 'none';
    out.push({ code, level, pct });
  }
  return out;
}

/** Age in years on a day from a birth date (YYYY-MM-DD). */
export function ageOn(birthDate: string | null | undefined, date: string, fallback: number | null): number | null {
  if (birthDate && /^\d{4}-\d{2}-\d{2}/.test(birthDate)) {
    const [y, m, d] = birthDate.slice(0, 10).split('-').map(Number);
    const [ty, tm, td] = date.split('-').map(Number);
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  }
  return fallback;
}
