// Open Food Facts (ODbL, attribution required): a product found by its barcode, mapped to our food format (per 100 g) so it
// can be cached in the foods table. Open Food Facts gives every value per 100 g in grams; we keep mg / µg per nutrient.

export const OFF_FIELDS = 'code,product_name,product_name_de,product_name_en,brands,nutriments,nova_group,serving_quantity,serving_size';

/** Open Food Facts asks automated clients to name themselves; a generic name, no personal data. */
export const OFF_USER_AGENT = 'MaraPlanna/1.0 (training planner; food diary barcode lookup)';

export const offUrl = (barcode: string) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

/** Our micronutrient code -> [Open Food Facts key, factor from grams to our unit]. */
const MICRO: Record<string, [string, number]> = {
  iron: ['iron_100g', 1e3], calcium: ['calcium_100g', 1e3], magnesium: ['magnesium_100g', 1e3], sodium: ['sodium_100g', 1e3], potassium: ['potassium_100g', 1e3],
  zinc: ['zinc_100g', 1e3], vit_c: ['vitamin-c_100g', 1e3], vit_e: ['vitamin-e_100g', 1e3], vit_b1: ['vitamin-b1_100g', 1e3], vit_b2: ['vitamin-b2_100g', 1e3],
  vit_b6: ['vitamin-b6_100g', 1e3], vit_d: ['vitamin-d_100g', 1e6], vit_b12: ['vitamin-b12_100g', 1e6], vit_a: ['vitamin-a_100g', 1e6], vit_k: ['vitamin-k_100g', 1e6],
  folate: ['folates_100g', 1e6], iodine: ['iodine_100g', 1e6], selenium: ['selenium_100g', 1e6],
};
const MICRO_COUNT = 19; // as in items.ts MICRO_CODES (EPA/DHA is never given by Open Food Facts)

export interface OffFood {
  source: 'off';
  external_id: string;
  barcode: string;
  name_de: string | null;
  name_en: string | null;
  brand: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sat_fat_g: number | null;
  sodium_mg: number | null;
  completeness: number;
  nova: number | null;
  micros: Record<string, number>;
  portion: { label_en: string; label_de: string; grams: number } | null;
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) && x >= 0 ? x : null;
};
const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** null when the product is unknown or lacks the basic values (energy and macros). */
export function mapOffProduct(barcode: string, body: unknown): OffFood | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const p = (b.product && typeof b.product === 'object' ? b.product : null) as Record<string, unknown> | null;
  if (!p || (b.status !== 1 && b.status !== 'success')) return null;
  const nu = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>;
  let kcal = n(nu['energy-kcal_100g']);
  if (kcal === null) {
    const kj = n(nu['energy-kj_100g']) ?? n(nu['energy_100g']);
    kcal = kj === null ? null : kj / 4.184;
  }
  const protein = n(nu['proteins_100g']);
  const carbs = n(nu['carbohydrates_100g']);
  const fat = n(nu['fat_100g']);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  const name = (k: string) => (typeof p[k] === 'string' && (p[k] as string).trim() ? (p[k] as string).trim().slice(0, 120) : null);
  const generic = name('product_name');
  const micros: Record<string, number> = {};
  for (const [code, [key, f]] of Object.entries(MICRO)) {
    const v = n(nu[key]);
    if (v !== null) micros[code] = r(v * f, 3);
  }
  if (micros.sodium === undefined) {
    const salt = n(nu['salt_100g']);
    if (salt !== null) micros.sodium = r((salt / 2.5) * 1000, 1);
  }
  const serving = n(p.serving_quantity);
  const nova = n(p.nova_group);
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0].trim().slice(0, 60) || null : null;
  return {
    source: 'off', external_id: barcode, barcode,
    name_de: name('product_name_de') ?? generic, name_en: name('product_name_en') ?? generic, brand,
    kcal: r(kcal), protein_g: r(protein), carbs_g: r(carbs), fat_g: r(fat),
    fiber_g: n(nu['fiber_100g']), sugar_g: n(nu['sugars_100g']), sat_fat_g: n(nu['saturated-fat_100g']), sodium_mg: micros.sodium ?? null,
    completeness: r(Object.keys(micros).length / MICRO_COUNT, 3),
    nova: nova !== null && nova >= 1 && nova <= 4 ? Math.round(nova) : null,
    micros,
    portion: serving && serving > 0 && serving < 2000 ? { label_en: `serving (${typeof p.serving_size === 'string' ? p.serving_size.slice(0, 30) : `${serving} g`})`, label_de: `Portion (${typeof p.serving_size === 'string' ? p.serving_size.slice(0, 30) : `${serving} g`})`, grams: r(serving) } : null,
  };
}

/** EAN-8, UPC-A, EAN-13, GTIN-14 with a valid check digit. */
export function validBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((m, d, i) => m + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
