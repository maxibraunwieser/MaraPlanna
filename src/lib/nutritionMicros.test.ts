import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/20261115000000_nutrition.sql?raw';
import microSql from '../../supabase/migrations/20261117000000_micro_levels.sql?raw';
import { seedRows } from '../sim/sqlSeed';
import { dayMicros, levelOf, mealMicros, microRulesMissing, overallLevel, referenceFor, type ReferenceRow } from '../../supabase/functions/_shared/nutrition/micros';

const seed = seedRows(sql);
const rules = Object.fromEntries(seedRows(microSql).nutrition_rules.map((r) => [r.key as string, r.value as number]));
const refs = seed.nutrient_references as unknown as ReferenceRow[];
const man = { sex: 'male' as const, age: 35 };
const woman = { sex: 'female' as const, age: 35 };
const item = (kcal: number, micros: Record<string, number>) => ({ kcal, micros });

describe('micronutrient scale', () => {
  it('has all thresholds in the migration', () => {
    expect(microRulesMissing(rules)).toEqual([]);
  });

  it('reference by sex and age, with the athlete extra', () => {
    expect(referenceFor(refs, 'iron', man)!.target).toBeCloseTo(11 * 1.3);
    expect(referenceFor(refs, 'iron', woman)!.target).toBeCloseTo(16 * 1.3);
    expect(referenceFor(refs, 'iron', { sex: 'female', age: 60 })!.target).toBeCloseTo(14 * 1.3);
    expect(referenceFor(refs, 'calcium', man)).toEqual({ target: 1000, upper: 2500 });
    expect(referenceFor(refs, 'magnesium', { sex: null, age: 35 })!.target).toBe(325);
  });

  it('turns shares into levels', () => {
    expect([110, 80, 60, 30, 10].map((p) => levelOf(p, rules))).toEqual(['very_good', 'good', 'fair', 'low', 'very_low']);
  });

  it('rates a day, marks too much and too little data', () => {
    const day = [
      item(800, { calcium: 1100, iron: 5, vit_d: 1 }),
      item(400, { calcium: 1500, iron: 2, vit_d: 0 }),
      item(600, { magnesium: 50 }),
    ];
    const list = dayMicros(day, refs, man, rules);
    const by = Object.fromEntries(list.map((m) => [m.code, m.level]));
    expect(by.calcium).toBe('too_much'); // 2600 mg > 2500 mg
    expect(by.iron).toBe('low'); // 7 of 14.3 mg = 49 %, just below "fair" (50 %)
    expect(by.magnesium).toBe('unknown'); // only a third of the energy has a value
    expect(by.vit_d).toBe('very_low'); // 1 of 20 µg, two thirds of the energy known
  });

  it('day rating and meal contribution', () => {
    const list = dayMicros([item(2000, { iron: 20, calcium: 900, zinc: 3 })], refs, man, rules);
    const o = overallLevel(list.filter((m) => ['iron', 'calcium', 'zinc'].includes(m.code)), rules);
    expect(o.rated).toBe(3);
    expect(o.good).toBe(2);
    const meal = Object.fromEntries(mealMicros([item(600, { iron: 6, calcium: 200, zinc: 0.1 })], refs, man, rules).map((m) => [m.code, m.level]));
    expect(meal.iron).toBe('much'); // 6 / 14.3 = 42 %
    expect(meal.calcium).toBe('some'); // 20 %
    expect(meal.zinc).toBe('none'); // < 1 %
    expect(meal.vit_c).toBe('unknown');
  });
});
