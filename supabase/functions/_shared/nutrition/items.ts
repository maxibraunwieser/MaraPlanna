// What one logged food or meal contributes: nutrients for a weight from the per-100 g values of the food database, recipes
// per serving, and the day's totals. Pure functions, shared by the website and (later) the photo and text analysis.

export const MACRO_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sat_fat_g', 'sodium_mg'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

/** Micronutrients the database tracks (codes of the nutrients table, category micro). */
export const MICRO_CODES = [
  'iron', 'vit_d', 'calcium', 'magnesium', 'sodium', 'potassium', 'zinc', 'vit_b12', 'folate', 'vit_c', 'vit_a', 'vit_e', 'vit_k',
  'vit_b1', 'vit_b2', 'vit_b6', 'iodine', 'selenium', 'epa_dha',
] as const;
export type MicroCode = (typeof MICRO_CODES)[number];

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'during_workout', 'post_workout'] as const;
export type Slot = (typeof SLOTS)[number];

export interface Food {
  id: string;
  user_id: string | null;
  source: 'usda' | 'off' | 'bls' | 'custom' | 'ai_estimate';
  name_de: string | null;
  name_en: string | null;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sat_fat_g: number | null;
  sodium_mg: number | null;
  completeness: number;
}

export interface Portion {
  id: string;
  food_id: string;
  label_de: string | null;
  label_en: string;
  grams: number;
  sort: number;
}

/** The nutrients of a food or a logged item: macros plus micros (code -> amount). */
export type Nutrients = Record<MacroKey, number | null> & { micros: Partial<Record<MicroCode, number>>; completeness: number };

export interface MealItem extends Nutrients {
  id: string;
  meal_entry_id: string;
  user_id: string;
  date: string;
  food_id: string | null;
  recipe_id: string | null;
  name: string;
  grams: number | null;
  amount: number | null;
  unit_label: string | null;
  source: 'db' | 'ai_estimate' | 'quick_add';
  created_at: string;
}

export interface MealEntry {
  id: string;
  user_id: string;
  date: string;
  time: string | null;
  slot: Slot;
  source: 'photo' | 'text' | 'barcode' | 'search' | 'quick_add' | 'copy' | 'recipe';
  name: string | null;
  photo_path: string | null;
  workout_id: string | null;
  activity_id: string | null;
  note: string | null;
  created_at: string;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Nutrients of `grams` of a food (values per 100 g); unknown values stay unknown (null), they are not zero. */
export function forGrams(food: Pick<Food, MacroKey | 'completeness'>, micros: Partial<Record<string, number>>, grams: number): Nutrients {
  const f = grams / 100;
  const out = { micros: {} as Nutrients['micros'], completeness: n(food.completeness) ?? 0 } as Nutrients;
  for (const k of MACRO_KEYS) {
    const v = n(food[k]);
    out[k] = v === null ? null : r(v * f, k === 'kcal' || k === 'sodium_mg' ? 0 : 1);
  }
  for (const code of MICRO_CODES) {
    const v = n(micros[code]);
    if (v !== null) out.micros[code] = r(v * f, 3);
  }
  return out;
}

/** Sum of several nutrient sets; completeness is weighted by energy (a gram of oil weighs more than a leaf of lettuce). */
export function sumNutrients(list: Nutrients[]): Nutrients {
  const out = { micros: {} as Nutrients['micros'], completeness: 0 } as Nutrients;
  for (const k of MACRO_KEYS) out[k] = list.length ? list.reduce((m, x) => m + (n(x[k]) ?? 0), 0) : 0;
  for (const x of list) {
    for (const [code, v] of Object.entries(x.micros ?? {})) {
      const c = code as MicroCode;
      out.micros[c] = (out.micros[c] ?? 0) + (n(v) ?? 0);
    }
  }
  const energy = list.reduce((m, x) => m + Math.max(0, n(x.kcal) ?? 0), 0);
  out.completeness = energy > 0 ? list.reduce((m, x) => m + Math.max(0, n(x.kcal) ?? 0) * (n(x.completeness) ?? 0), 0) / energy : 0;
  for (const k of MACRO_KEYS) out[k] = r(out[k] ?? 0, k === 'kcal' || k === 'sodium_mg' ? 0 : 1);
  for (const c of Object.keys(out.micros) as MicroCode[]) out.micros[c] = r(out.micros[c]!, 3);
  out.completeness = r(out.completeness, 3);
  return out;
}

/** Scales a nutrient set (e.g. a recipe to one serving). */
export function scale(x: Nutrients, factor: number): Nutrients {
  const out = { micros: {} as Nutrients['micros'], completeness: x.completeness } as Nutrients;
  for (const k of MACRO_KEYS) out[k] = x[k] === null ? null : r((x[k] as number) * factor, k === 'kcal' || k === 'sodium_mg' ? 0 : 1);
  for (const [c, v] of Object.entries(x.micros)) out.micros[c as MicroCode] = r((v as number) * factor, 3);
  return out;
}

/** Quick add: only what the person typed (no micronutrients, completeness 0). */
export function quickNutrients(v: { kcal: number; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }): Nutrients {
  return {
    kcal: Math.round(v.kcal), protein_g: n(v.protein_g) ?? 0, carbs_g: n(v.carbs_g) ?? 0, fat_g: n(v.fat_g) ?? 0,
    fiber_g: null, sugar_g: null, sat_fat_g: null, sodium_mg: null, micros: {}, completeness: 0,
  };
}

/** Energy from the macros when a quick add gives grams but no kcal. */
export const kcalFromMacros = (p: number, c: number, f: number) => Math.round(4 * p + 4 * c + 9 * f);

/** Display name of a food in a language, falling back to the other language. */
export function foodName(f: Pick<Food, 'name_de' | 'name_en' | 'brand'>, lang: 'de' | 'en'): string {
  const name = (lang === 'de' ? f.name_de || f.name_en : f.name_en || f.name_de) ?? '';
  return f.brand ? `${name} (${f.brand})` : name;
}

/** Slot that fits a time of day (hours) when nothing else is known. */
export function slotForHour(h: number): Slot {
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h >= 17.5 && h < 21.5) return 'dinner';
  return 'snack';
}
