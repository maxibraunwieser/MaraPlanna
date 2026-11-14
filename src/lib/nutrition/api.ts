// Database access of the nutrition tab (tables of supabase/migrations/20261115000000_nutrition.sql) and the
// "nutrition" Edge Function for the daily targets.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { tr } from '../i18n';
import { forGrams, quickNutrients, scale, sumNutrients, type Food, type MealEntry, type MealItem, type Nutrients, type Portion, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import type { TargetRow } from '../../../supabase/functions/_shared/nutrition/service';
import type { AnalysisResult } from '../../../supabase/functions/_shared/nutrition/analysis';

export type { TargetRow };

export interface NutritionProfile {
  user_id: string;
  goal: 'maintain' | 'lose' | 'gain';
  activity_level: 'sedentary' | 'light' | 'moderate' | 'heavy';
  diet: 'omnivore' | 'pescetarian' | 'vegetarian' | 'vegan';
  intolerances: string[];
  dislikes: string[];
  supplements: string[];
  overrides: Partial<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number>>;
  timezone: string | null;
  updated_at?: string;
}

export interface WaterEntry {
  id: string;
  date: string;
  ml: number;
  created_at: string;
}

export interface WeightEntry {
  id: string;
  date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  source: 'manual' | 'garmin';
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  servings: number;
  note: string | null;
  items: { id?: string; food_id: string; grams: number; food?: Food }[];
}

/** Food with its micronutrients (per 100 g) and portions. */
export interface FoodDetail extends Food {
  micros: Record<string, number>;
  portions: Portion[];
}

/** A table of the nutrition migration is missing: tell the person in plain words. */
function readable(message: string): Error {
  if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) return new Error(tr('food.err.migration'));
  return new Error(message);
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw readable(res.error.message);
  return res.data;
}

const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// ---------------------------------------------------------------------------
// Profile and targets
// ---------------------------------------------------------------------------

export async function fetchNutritionProfile(userId: string): Promise<NutritionProfile | null> {
  return check(await supabase.from('nutrition_profiles').select('*').eq('user_id', userId).maybeSingle()) as NutritionProfile | null;
}

export async function saveNutritionProfile(userId: string, patch: Partial<NutritionProfile>): Promise<NutritionProfile> {
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();
  const row = { ...patch, user_id: userId, timezone, updated_at: new Date().toISOString() };
  return check(await supabase.from('nutrition_profiles').upsert(row, { onConflict: 'user_id' }).select().single()) as NutritionProfile;
}

export class TargetsUnavailable extends Error {
  constructor(public code: 'no_body' | 'no_rules' | 'unreachable' | 'other', message: string) {
    super(message);
  }
}

/** Targets of [from, to]; the function recomputes the days whose inputs changed. */
export async function fetchTargets(from: string, to: string, today: string): Promise<TargetRow[]> {
  const { data, error } = await supabase.functions.invoke('nutrition', { body: { action: 'targets', from, to, today } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      const code = payload?.code === 'no_body' || payload?.code === 'no_rules' ? payload.code : 'other';
      throw new TargetsUnavailable(code, code === 'no_body' ? tr('food.err.noBody') : code === 'no_rules' ? tr('food.err.migration') : String(payload?.error ?? error.message));
    }
    throw new TargetsUnavailable('unreachable', tr('food.err.unreachable'));
  }
  return ((data as { targets: TargetRow[] }).targets ?? []).map((t) => ({ ...t, date: String(t.date).slice(0, 10) }));
}

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------

export async function fetchDiary(userId: string, from: string, to: string): Promise<{ entries: MealEntry[]; items: MealItem[] }> {
  const [entries, items] = await Promise.all([
    supabase.from('meal_entries').select('*').eq('user_id', userId).gte('date', from).lte('date', to).order('created_at', { ascending: true }),
    supabase.from('meal_items').select('*').eq('user_id', userId).gte('date', from).lte('date', to).order('created_at', { ascending: true }),
  ]);
  return { entries: check(entries) as MealEntry[], items: (check(items) as MealItem[]).map(normalizeItem) };
}

function normalizeItem(i: MealItem): MealItem {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...i, date: String(i.date).slice(0, 10), grams: num(i.grams), amount: num(i.amount), kcal: Number(i.kcal), protein_g: Number(i.protein_g), carbs_g: Number(i.carbs_g),
    fat_g: Number(i.fat_g), fiber_g: num(i.fiber_g), sugar_g: num(i.sugar_g), sat_fat_g: num(i.sat_fat_g), sodium_mg: num(i.sodium_mg), completeness: Number(i.completeness ?? 0), micros: i.micros ?? {},
  };
}

interface LogItem {
  name: string;
  food_id?: string | null;
  recipe_id?: string | null;
  grams: number | null;
  amount?: number | null;
  unit_label?: string | null;
  nutrients: Nutrients;
  source?: MealItem['source'];
}

/** One meal (entry) with its items. */
export async function logMeal(userId: string, meal: { date: string; slot: Slot; source: MealEntry['source']; name?: string | null; time?: string | null; photo_path?: string | null }, items: LogItem[]): Promise<void> {
  if (!items.length) return;
  const entry = check(
    await supabase.from('meal_entries').insert({ user_id: userId, date: meal.date, slot: meal.slot, source: meal.source, name: meal.name ?? null, time: meal.time ?? null, photo_path: meal.photo_path ?? null }).select().single(),
  ) as MealEntry;
  const rows = items.map((it) => {
    const { micros, completeness, ...macros } = it.nutrients;
    return {
      meal_entry_id: entry.id, user_id: userId, date: meal.date, food_id: it.food_id ?? null, recipe_id: it.recipe_id ?? null, name: it.name,
      grams: it.grams, amount: it.amount ?? null, unit_label: it.unit_label ?? null, ...macros,
      kcal: macros.kcal ?? 0, protein_g: macros.protein_g ?? 0, carbs_g: macros.carbs_g ?? 0, fat_g: macros.fat_g ?? 0,
      micros, completeness, source: it.source ?? 'db',
    };
  });
  const res = await supabase.from('meal_items').insert(rows);
  if (res.error) {
    await supabase.from('meal_entries').delete().eq('id', entry.id);
    throw readable(res.error.message);
  }
}

/** Removes one item; an entry left without items goes too. */
export async function deleteItem(item: MealItem): Promise<void> {
  check(await supabase.from('meal_items').delete().eq('id', item.id));
  const left = check(await supabase.from('meal_items').select('id').eq('meal_entry_id', item.meal_entry_id).limit(1)) as { id: string }[];
  if (!left.length) check(await supabase.from('meal_entries').delete().eq('id', item.meal_entry_id));
}

/** Changes the amount of an item: the nutrients scale with the grams. */
export async function updateItemGrams(item: MealItem, grams: number, amount: number | null, unitLabel: string | null): Promise<void> {
  const factor = item.grams && item.grams > 0 ? grams / item.grams : 1;
  const next = scale(item, factor);
  const { micros, completeness: _c, ...macros } = next;
  check(await supabase.from('meal_items').update({ ...macros, micros, grams, amount, unit_label: unitLabel }).eq('id', item.id));
}

/** Copies the meals of a day (or of one slot) to another day. Returns the number of items copied. */
export async function copyMeals(userId: string, fromDate: string, toDate: string, slot: Slot | null, toSlot?: Slot): Promise<number> {
  const { entries, items } = await fetchDiary(userId, fromDate, fromDate);
  let copied = 0;
  for (const e of entries.filter((x) => !slot || x.slot === slot)) {
    const its = items.filter((i) => i.meal_entry_id === e.id);
    if (!its.length) continue;
    await logMeal(userId, { date: toDate, slot: toSlot ?? e.slot, source: 'copy', name: e.name }, its.map((i) => ({
      name: i.name, food_id: i.food_id, recipe_id: i.recipe_id, grams: i.grams, amount: i.amount, unit_label: i.unit_label, source: i.source, nutrients: i,
    })));
    copied += its.length;
  }
  return copied;
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

export async function searchFoods(q: string): Promise<Food[]> {
  const res = await supabase.rpc('search_foods', { q, lim: 30 });
  return check(res) as Food[];
}

export async function fetchFoods(ids: string[]): Promise<Food[]> {
  const out: Food[] = [];
  for (const part of chunks([...new Set(ids)], 100)) {
    if (part.length) out.push(...(check(await supabase.from('foods').select('*').in('id', part)) as Food[]));
  }
  return out;
}

/** Micronutrients and portions of foods. */
export async function fetchFoodDetails(foods: Food[]): Promise<Map<string, FoodDetail>> {
  const ids = foods.map((f) => f.id);
  const out = new Map<string, FoodDetail>(foods.map((f) => [f.id, { ...f, micros: {}, portions: [] }]));
  for (const part of chunks(ids, 100)) {
    if (!part.length) continue;
    const [nutrients, portions] = await Promise.all([
      supabase.from('food_nutrients').select('food_id, nutrient_code, amount').in('food_id', part),
      supabase.from('food_portions').select('*').in('food_id', part).order('sort', { ascending: true }),
    ]);
    for (const n of check(nutrients) as { food_id: string; nutrient_code: string; amount: number }[]) out.get(n.food_id)!.micros[n.nutrient_code] = Number(n.amount);
    for (const p of check(portions) as Portion[]) out.get(p.food_id)!.portions.push({ ...p, grams: Number(p.grams) });
  }
  return out;
}

/** Foods logged most recently and most often (last 60 days), newest first. */
export async function recentFoods(userId: string, since: string): Promise<{ recent: Food[]; frequent: Food[]; lastGrams: Map<string, number> }> {
  const rows = check(
    await supabase.from('meal_items').select('food_id, grams, created_at').eq('user_id', userId).gte('date', since).order('created_at', { ascending: false }).limit(400),
  ) as { food_id: string | null; grams: number | null }[];
  const order: string[] = [];
  const count = new Map<string, number>();
  const lastGrams = new Map<string, number>();
  for (const r of rows) {
    if (!r.food_id) continue;
    if (!count.has(r.food_id)) {
      order.push(r.food_id);
      if (r.grams) lastGrams.set(r.food_id, Number(r.grams));
    }
    count.set(r.food_id, (count.get(r.food_id) ?? 0) + 1);
  }
  const foods = new Map((await fetchFoods(order)).map((f) => [f.id, f]));
  const recent = order.map((id) => foods.get(id)).filter((f): f is Food => !!f).slice(0, 20);
  const frequent = [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([id]) => foods.get(id)).filter((f): f is Food => !!f).slice(0, 12);
  return { recent, frequent, lastGrams };
}

export async function fetchFavorites(userId: string): Promise<Food[]> {
  const rows = check(await supabase.from('food_favorites').select('food_id, created_at').eq('user_id', userId).order('created_at', { ascending: false })) as { food_id: string }[];
  const foods = new Map((await fetchFoods(rows.map((r) => r.food_id))).map((f) => [f.id, f]));
  return rows.map((r) => foods.get(r.food_id)).filter((f): f is Food => !!f);
}

export async function setFavorite(userId: string, foodId: string, on: boolean): Promise<void> {
  if (on) check(await supabase.from('food_favorites').upsert({ user_id: userId, food_id: foodId }, { onConflict: 'user_id,food_id' }));
  else check(await supabase.from('food_favorites').delete().eq('user_id', userId).eq('food_id', foodId));
}

/** Nutrients of an amount of a food. */
export const foodNutrients = (food: FoodDetail, grams: number) => forGrams(food, food.micros, grams);

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export async function fetchRecipes(userId: string): Promise<Recipe[]> {
  const recipes = check(await supabase.from('recipes').select('*').eq('user_id', userId).order('name', { ascending: true })) as Omit<Recipe, 'items'>[];
  if (!recipes.length) return [];
  const items = check(await supabase.from('recipe_items').select('*').in('recipe_id', recipes.map((r) => r.id)).order('sort', { ascending: true })) as { id: string; recipe_id: string; food_id: string; grams: number }[];
  const foods = new Map((await fetchFoods(items.map((i) => i.food_id))).map((f) => [f.id, f]));
  return recipes.map((r) => ({ ...r, servings: Number(r.servings), items: items.filter((i) => i.recipe_id === r.id).map((i) => ({ id: i.id, food_id: i.food_id, grams: Number(i.grams), food: foods.get(i.food_id) })) }));
}

export async function saveRecipe(userId: string, recipe: { id?: string; name: string; servings: number; note?: string | null }, items: { food_id: string; grams: number }[]): Promise<string> {
  const row = { user_id: userId, name: recipe.name.trim(), servings: recipe.servings, note: recipe.note ?? null, updated_at: new Date().toISOString() };
  const saved = recipe.id
    ? (check(await supabase.from('recipes').update(row).eq('id', recipe.id).select().single()) as { id: string })
    : (check(await supabase.from('recipes').insert(row).select().single()) as { id: string });
  check(await supabase.from('recipe_items').delete().eq('recipe_id', saved.id));
  if (items.length) check(await supabase.from('recipe_items').insert(items.map((it, i) => ({ recipe_id: saved.id, user_id: userId, food_id: it.food_id, grams: it.grams, sort: i }))));
  return saved.id;
}

export async function deleteRecipe(id: string): Promise<void> {
  check(await supabase.from('recipes').delete().eq('id', id));
}

/** Nutrients of a whole recipe and of one serving, from its ingredients. */
export async function recipeNutrients(recipe: Recipe): Promise<{ total: Nutrients; perServing: Nutrients; grams: number }> {
  const details = await fetchFoodDetails(recipe.items.map((i) => i.food).filter((f): f is Food => !!f));
  const parts = recipe.items.map((i) => {
    const d = details.get(i.food_id);
    return d ? forGrams(d, d.micros, i.grams) : null;
  }).filter((x): x is Nutrients => !!x);
  const total = sumNutrients(parts);
  const grams = recipe.items.reduce((m, i) => m + i.grams, 0);
  return { total, perServing: scale(total, 1 / Math.max(recipe.servings, 0.1)), grams };
}

// ---------------------------------------------------------------------------
// Quick add, water, weight
// ---------------------------------------------------------------------------

export const quick = quickNutrients;

export async function fetchWater(userId: string, from: string, to: string): Promise<WaterEntry[]> {
  return (check(await supabase.from('water_entries').select('*').eq('user_id', userId).gte('date', from).lte('date', to).order('created_at', { ascending: true })) as WaterEntry[]).map((w) => ({ ...w, date: String(w.date).slice(0, 10), ml: Number(w.ml) }));
}

export async function addWater(userId: string, date: string, ml: number): Promise<void> {
  check(await supabase.from('water_entries').insert({ user_id: userId, date, ml }));
}

export async function deleteWater(id: string): Promise<void> {
  check(await supabase.from('water_entries').delete().eq('id', id));
}

export async function fetchWeights(userId: string, from: string): Promise<WeightEntry[]> {
  return (check(await supabase.from('body_weight_entries').select('*').eq('user_id', userId).gte('date', from).order('date', { ascending: true })) as WeightEntry[]).map((w) => ({
    ...w, date: String(w.date).slice(0, 10), weight_kg: Number(w.weight_kg), body_fat_pct: w.body_fat_pct == null ? null : Number(w.body_fat_pct),
  }));
}

export async function saveWeight(userId: string, date: string, weightKg: number, bodyFatPct: number | null): Promise<void> {
  check(await supabase.from('body_weight_entries').upsert({ user_id: userId, date, weight_kg: weightKg, body_fat_pct: bodyFatPct, source: 'manual' }, { onConflict: 'user_id,date,source' }));
}

export async function deleteWeight(id: string): Promise<void> {
  check(await supabase.from('body_weight_entries').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Photo, text and barcode (phase 4): the analysis runs in the nutrition Edge Function, the key never reaches the browser
// ---------------------------------------------------------------------------

export type { AnalysisResult } from '../../../supabase/functions/_shared/nutrition/analysis';
export type { MatchedItem } from '../../../supabase/functions/_shared/nutrition/ai';

export class AnalysisFailed extends Error {
  constructor(public code: 'not_configured' | 'limit' | 'ai_failed' | 'no_photo' | 'not_found' | 'unreachable' | 'other', message: string) {
    super(message);
  }
}

async function invokeNutrition<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nutrition', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      const code = ['not_configured', 'limit', 'ai_failed', 'no_photo', 'not_found'].includes(payload?.code) ? payload.code : 'other';
      const text: Record<string, string> = {
        not_configured: tr('food.ai.err.notConfigured'), limit: tr('food.ai.err.limit', { n: payload?.limit ?? 30 }), ai_failed: tr('food.ai.err.failed'),
        no_photo: tr('food.ai.err.noPhoto'), not_found: tr('food.barcode.notFound'),
      };
      throw new AnalysisFailed(code, text[code] ?? String(payload?.error ?? error.message));
    }
    throw new AnalysisFailed('unreachable', tr('food.err.unreachable'));
  }
  return data as T;
}

/** Uploads a (shrunk) meal photo to the private bucket: user_id/date/uuid.jpg. */
export async function uploadMealPhoto(userId: string, date: string, photo: Blob): Promise<string> {
  const path = `${userId}/${date}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('meal-photos').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
  if (error) throw readable(error.message.includes('Bucket not found') ? 'relation meal-photos does not exist' : error.message);
  return path;
}

export async function mealPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('meal-photos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function deleteMealPhoto(path: string): Promise<void> {
  await supabase.storage.from('meal-photos').remove([path]);
}

export const analyzePhoto = (path: string, note?: string) => invokeNutrition<AnalysisResult>({ action: 'analyze-photo', path, note: note || undefined });
export const parseMealText = (text: string) => invokeNutrition<AnalysisResult>({ action: 'parse-text', text });

/** A product by barcode (Open Food Facts, cached in the food database). */
export async function foodByBarcode(code: string): Promise<Food> {
  const { food } = await invokeNutrition<{ food: { id: string } }>({ action: 'barcode', code });
  const [row] = await fetchFoods([food.id]);
  if (!row) throw new AnalysisFailed('not_found', tr('food.barcode.notFound'));
  return row;
}

/** An AI estimate without a database match becomes an own food (source ai_estimate), so it can be found and corrected later. */
export async function saveEstimateFood(userId: string, item: { name_de: string; name_en: string; per100: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } }): Promise<Food> {
  return check(
    await supabase.from('foods').insert({
      user_id: userId, source: 'ai_estimate', name_de: item.name_de, name_en: item.name_en,
      kcal: item.per100.kcal, protein_g: item.per100.protein_g, carbs_g: item.per100.carbs_g, fat_g: item.per100.fat_g, completeness: 0,
    }).select().single(),
  ) as Food;
}
