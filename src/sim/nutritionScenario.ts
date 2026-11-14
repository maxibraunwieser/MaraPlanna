// Nutrition data of the simulation: the rules and reference values come straight from the migration (one source), the
// foods are a small extract of the real USDA import (scripts/import-foods.ts --sample). The "food" situation adds a person
// who uses the tab: a nutrition profile, a few days of diary, water and weigh-ins.

/* eslint-disable @typescript-eslint/no-explicit-any */
import nutritionSql from '../../supabase/migrations/20261115000000_nutrition.sql?raw';
import foodSample from './foodSample.json';
import { seedRows } from './sqlSeed';
import { addDays } from '../lib/planner/dates';
import { forGrams, type Slot } from '../../supabase/functions/_shared/nutrition/items';

type Tables = Record<string, Record<string, any>[]>;
type SampleFood = (typeof foodSample)[number];

const USER = 'sim-user';
const foodId = (externalId: string) => `food-${externalId}`;

/** Reference tables and the shared foods: every situation has them, as every real database does. */
export function nutritionBase(): Tables {
  const seed = seedRows(nutritionSql);
  const foods = (foodSample as SampleFood[]).map(({ micros: _m, portions: _p, ...f }) => ({ ...f, id: foodId(f.external_id), user_id: null, brand: null, barcode: null, nova: null }));
  const food_nutrients = (foodSample as SampleFood[]).flatMap((f) => Object.entries(f.micros).map(([code, amount]) => ({ food_id: foodId(f.external_id), nutrient_code: code, amount })));
  const food_portions = (foodSample as SampleFood[]).flatMap((f) => f.portions.map((p, i) => ({ id: `portion-${f.external_id}-${i}`, food_id: foodId(f.external_id), ...p })));
  return {
    nutrients: seed.nutrients,
    nutrient_references: seed.nutrient_references.map((r, i) => ({ id: i + 1, ...r })),
    nutrition_rules: seed.nutrition_rules,
    nutrition_day_rules: seed.nutrition_day_rules,
    foods,
    food_nutrients,
    food_portions,
    food_favorites: [],
    recipes: [],
    recipe_items: [],
    meal_entries: [],
    meal_items: [],
    water_entries: [],
    body_weight_entries: [],
    nutrition_profiles: [],
    nutrition_daily_targets: [],
  };
}

/** A typical day of a runner: food (USDA id) and grams per slot. */
const DAYS: Record<Slot, [string, number][]>[] = [
  { breakfast: [['173904', 70], ['171267', 200], ['173944', 120], ['171711', 80]], lunch: [['168878', 220], ['171477', 150], ['169967', 150], ['171413', 10]], dinner: [['169737', 250], ['171192', 150], ['171247', 15]], snack: [['170894', 170], ['169640', 15], ['170567', 25]], pre_workout: [], during_workout: [], post_workout: [] },
  { breakfast: [['172688', 100], ['173424', 100], ['170457', 120], ['173410', 10]], lunch: [['172421', 200], ['168483', 200], ['168462', 60], ['171705', 70]], dinner: [['175168', 160], ['170438', 300], ['170393', 120]], snack: [['171688', 180], ['172470', 30]], pre_workout: [], during_workout: [], post_workout: [] },
  { breakfast: [['171646', 60], ['170894', 200], ['167762', 120]], lunch: [['168917', 200], ['173740', 150], ['170108', 100], ['173420', 40]], dinner: [['174032', 150], ['172796', 80], ['170000', 30], ['169249', 60]], snack: [['170273', 25], ['169097', 150]], pre_workout: [], during_workout: [], post_workout: [] },
];

/** The person of the "food" situation: body data in the setup, a profile, a week of diary (today half done), water, weight. */
export function foodPerson(tables: Tables, today: string): Tables {
  const foods = new Map((foodSample as SampleFood[]).map((f) => [f.external_id, f]));
  const profile = tables.profiles[0];
  profile.onboarding = { ...profile.onboarding, setup: { ...(profile.onboarding?.setup ?? {}), heightCm: 180, weightKg: 73, birthDate: '1991-04-12', gender: 'male', pregnancy: 'none' } };
  const entries: Record<string, any>[] = [];
  const items: Record<string, any>[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back);
    const plan = DAYS[back % DAYS.length];
    for (const slot of Object.keys(plan) as Slot[]) {
      // today: only breakfast and lunch so far
      if (back === 0 && slot !== 'breakfast' && slot !== 'lunch') continue;
      const list = plan[slot];
      if (!list.length) continue;
      const entryId = `meal-${date}-${slot}`;
      entries.push({ id: entryId, user_id: USER, date, time: null, slot, source: 'search', name: null, photo_path: null, workout_id: null, activity_id: null, note: null, created_at: `${date}T${slot === 'breakfast' ? '07' : slot === 'lunch' ? '12' : slot === 'dinner' ? '19' : '16'}:00:00Z` });
      for (const [ext, base] of list) {
        // a runner's portions: a third more than a standard serving
        const grams = Math.round(base * 1.35);
        const f = foods.get(ext);
        if (!f) continue;
        const nutr = forGrams(f, f.micros, grams);
        const { micros, completeness, ...macros } = nutr;
        items.push({
          id: `item-${date}-${slot}-${ext}`, meal_entry_id: entryId, user_id: USER, date, food_id: foodId(ext), recipe_id: null, name: f.name_de, grams, amount: grams, unit_label: 'g',
          ...macros, micros, completeness, source: 'db', created_at: entries.at(-1)!.created_at,
        });
      }
    }
  }
  const water = Array.from({ length: 7 }, (_, k) => addDays(today, -k)).flatMap((date, k) => Array.from({ length: k === 0 ? 3 : 7 + (k % 3) }, (_, i) => ({ id: `water-${date}-${i}`, user_id: USER, date, ml: i % 2 ? 500 : 250, created_at: `${date}T${String(8 + i).padStart(2, '0')}:00:00Z` })));
  const weights = [21, 14, 10, 7, 4, 1].map((back, i) => ({ id: `weight-${back}`, user_id: USER, date: addDays(today, -back), weight_kg: [73.6, 73.4, 73.1, 73.2, 72.9, 72.8][i], body_fat_pct: null, source: 'manual', created_at: `${addDays(today, -back)}T07:00:00Z` }));
  // Garmin's daily energy for finished days (the targets use it instead of the estimate)
  for (const m of tables.daily_metrics ?? []) {
    if (m.date < today) {
      const run = (tables.activities ?? []).find((a) => a.local_date === m.date);
      m.total_kcal = 2550 + (run ? run.calories : 0);
      m.active_kcal = m.total_kcal - 1720;
      m.bmr_kcal = 1720;
    }
  }
  return {
    ...tables,
    nutrition_profiles: [{ user_id: USER, goal: 'maintain', activity_level: 'light', diet: 'omnivore', intolerances: [], dislikes: [], supplements: [], training_times: {}, race_start_time: null, overrides: {}, notifications: {}, timezone: 'Europe/Vienna', updated_at: `${today}T06:00:00Z` }],
    meal_entries: entries,
    meal_items: items,
    water_entries: water,
    body_weight_entries: weights,
    food_favorites: [{ user_id: USER, food_id: foodId('173904'), created_at: `${today}T06:00:00Z` }, { user_id: USER, food_id: foodId('170894'), created_at: `${today}T06:00:00Z` }],
  };
}
