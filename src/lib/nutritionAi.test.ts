import { describe, expect, it } from 'vitest';
import { analyzeMeal, cleanAnalysis, matchItems, namesMeet, type AiItem, type FoodHit } from '../../supabase/functions/_shared/nutrition/ai';
import { mapOffProduct, validBarcode } from '../../supabase/functions/_shared/nutrition/off';
import { LimitError, lookupBarcode, runAnalysis } from '../../supabase/functions/_shared/nutrition/analysis';
import { fitSize } from './nutrition/image';

const item = (over: Partial<AiItem> = {}): AiItem => ({
  name_de: 'Spaghetti, gekocht', name_en: 'Spaghetti, cooked', search: 'Nudeln gekocht', estimated_grams: 220, confidence: 0.8,
  per100: { kcal: 158, protein_g: 5.8, carbs_g: 31, fat_g: 0.9 }, ...over,
});

describe('Claude answer', () => {
  it('is checked and clamped', () => {
    const a = cleanAnalysis({
      meal_name: 'Pasta',
      items: [
        { name_de: 'Nudeln', name_en: 'Pasta', search: 'Nudeln', estimated_grams: 99999, confidence: 7, per100: { kcal: 5000, protein_g: -3, carbs_g: 30, fat_g: 'x' } },
        { name_de: '', name_en: '' },
        'junk',
      ],
      notes: 42,
    });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ estimated_grams: 2000, confidence: 1, per100: { kcal: 900, protein_g: 0, carbs_g: 30, fat_g: 0 } });
    expect(a.notes).toBe('');
    expect(cleanAnalysis(null)).toEqual({ meal_name: '', items: [], notes: '' });
  });

  it('is requested as JSON of the schema, with the image as base64', async () => {
    let sent: Record<string, unknown> = {};
    const fake = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ meal_name: 'Müsli', items: [item()], notes: 'ok' }) }], usage: { input_tokens: 1200, output_tokens: 180 } }));
    }) as unknown as typeof fetch;
    const r = await analyzeMeal(fake, { apiKey: 'k'.repeat(30), model: 'claude-sonnet-5-5', image: { data: 'AAAA', mediaType: 'image/jpeg' }, note: 'groß' });
    expect((sent.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    const content = (sent.messages as { content: { type: string }[] }[])[0].content;
    expect(content[0].type).toBe('image');
    expect(r.usage).toEqual({ input_tokens: 1200, output_tokens: 180 });
    expect(r.analysis.items[0].name_de).toBe('Spaghetti, gekocht');
  });
});

describe('matching to the food database', () => {
  const db: Record<string, FoodHit[]> = {
    'Nudeln gekocht': [{ id: 'pasta', name_de: 'Nudeln, gekocht', name_en: 'Pasta, cooked', user_id: null, kcal: 158 }],
    Parmesan: [{ id: 'parm', name_de: 'Parmesan, gerieben', name_en: 'Cheese, parmesan', user_id: null, kcal: 420 }],
    Bolognese: [{ id: 'wrong', name_de: 'Bolognese-Gewürz', name_en: 'Spice mix', user_id: null, kcal: 2 }],
  };
  const search = async (q: string) => db[q] ?? [];
  it('takes the database values where a food fits, the estimate elsewhere', async () => {
    const out = await matchItems([
      item(),
      item({ name_de: 'Parmesan', name_en: 'Parmesan', search: 'Parmesan', estimated_grams: 10, per100: { kcal: 400, protein_g: 35, carbs_g: 3, fat_g: 28 } }),
      item({ name_de: 'Bolognese-Sauce', name_en: 'Bolognese sauce', search: 'Bolognese', estimated_grams: 150, per100: { kcal: 120, protein_g: 8, carbs_g: 5, fat_g: 7 } }),
    ], search);
    expect(out.map((o) => o.food?.id ?? null)).toEqual(['pasta', 'parm', null]);
  });
  it('compares the main word of the database name (butter is not a croissant)', async () => {
    const hits: FoodHit[] = [
      { id: 'croissant', name_de: 'Croissant', name_en: 'Croissants, butter', user_id: null, kcal: 406 },
      { id: 'butter', name_de: 'Butter, gesalzen', name_en: 'Butter, salted', user_id: null, kcal: 717 },
    ];
    const [m] = await matchItems([item({ name_de: 'Butter', name_en: 'Butter', search: 'Butter', estimated_grams: 10, per100: { kcal: 740, protein_g: 0.7, carbs_g: 0.6, fat_g: 82 } })], async () => hits);
    expect(m.food?.id).toBe('butter');
  });
  it('names meet on a shared word or stem', () => {
    expect(namesMeet('Nudeln, gekocht', 'Nudel gekochte')).toBe(true);
    expect(namesMeet('Banane, roh', 'Apfel')).toBe(false);
  });
});

describe('analysis on the server', () => {
  const db = () => {
    const tables: Record<string, Record<string, unknown>[]> = { ai_usage: [], photo_analyses: [] };
    const q = (table: string) => {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let inserted: Record<string, unknown> | null = null;
      const api = {
        select: () => api,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c] ?? new Date().toISOString()) >= v), api),
        insert: (row: Record<string, unknown>) => ((inserted = { id: `id-${(tables[table] ??= []).length}`, ...row }), tables[table].push(inserted), api),
        single: () => Promise.resolve({ data: inserted, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
      };
      return api;
    };
    return { tables, from: q, rpc: async () => ({ data: [{ id: 'pasta', name_de: 'Nudeln, gekocht', name_en: 'Pasta', user_id: null, kcal: 158 }, { id: 'other', name_de: 'Nudeln (fremd)', name_en: null, user_id: 'someone-else', kcal: 150 }], error: null }) };
  };
  const analyze = async () => ({ analysis: { meal_name: 'Pasta', items: [item()], notes: '' }, usage: { input_tokens: 10, output_tokens: 5 }, raw: {} });

  it('logs tokens and the analysis, matches only shared or own foods', async () => {
    const d = db();
    const r = await runAnalysis(d, { userId: 'u', kind: 'text', model: 'm', dailyLimit: 3, analyze, text: 'Nudeln' });
    expect(r.items[0].food?.id).toBe('pasta');
    expect(d.tables.ai_usage).toHaveLength(1);
    expect(d.tables.photo_analyses[0]).toMatchObject({ status: 'ok', input_tokens: 10, kind: 'text' });
  });
  it('stops at the daily limit', async () => {
    const d = db();
    for (let i = 0; i < 2; i++) await runAnalysis(d, { userId: 'u', kind: 'text', model: 'm', dailyLimit: 2, analyze, text: 'x' });
    await expect(runAnalysis(d, { userId: 'u', kind: 'text', model: 'm', dailyLimit: 2, analyze, text: 'x' })).rejects.toBeInstanceOf(LimitError);
  });
});

describe('Open Food Facts', () => {
  const product = {
    status: 1,
    product: {
      product_name: 'Haferdrink', product_name_de: 'Haferdrink Barista', brands: 'Oatly, Other', nova_group: 4, serving_quantity: 250, serving_size: '250 ml',
      nutriments: { 'energy-kcal_100g': 59, proteins_100g: 1, carbohydrates_100g: 6.6, fat_100g: 3, fiber_100g: 0.8, sugars_100g: 3.3, 'saturated-fat_100g': 0.3, salt_100g: 0.1, calcium_100g: 0.12, 'vitamin-d_100g': 0.0000011, 'vitamin-b12_100g': 0.00000038 },
    },
  };
  it('maps a product to per-100 g values in our units', () => {
    const f = mapOffProduct('7394376616037', product)!;
    expect(f).toMatchObject({ name_de: 'Haferdrink Barista', brand: 'Oatly', kcal: 59, carbs_g: 6.6, nova: 4, sodium_mg: 40 });
    expect(f.micros).toMatchObject({ calcium: 120, vit_d: 1.1, vit_b12: 0.38, sodium: 40 });
    expect(f.portion).toMatchObject({ grams: 250 });
    expect(f.completeness).toBeCloseTo(4 / 19, 3);
  });
  it('ignores unknown products and products without energy', () => {
    expect(mapOffProduct('1', { status: 0 })).toBeNull();
    expect(mapOffProduct('1', { status: 1, product: { nutriments: { proteins_100g: 1 } } })).toBeNull();
    expect(mapOffProduct('1', { status: 1, product: { nutriments: { energy_100g: 418.4, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } } })!.kcal).toBe(100);
  });
  it('checks the barcode digit', () => {
    expect(validBarcode('4006381333931')).toBe(true);
    expect(validBarcode('4006381333932')).toBe(false);
    expect(validBarcode('96385074')).toBe(true);
    expect(validBarcode('abc')).toBe(false);
  });
  it('caches a product once', async () => {
    const foods: Record<string, unknown>[] = [];
    let calls = 0;
    const q = (table: string) => {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let last: Record<string, unknown> | null = null;
      const api = {
        select: () => api, limit: () => api,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api),
        insert: (row: Record<string, unknown>) => { last = { id: `f${foods.length}`, ...row }; if (table === 'foods') foods.push(last); return api; },
        single: () => Promise.resolve({ data: last, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'foods' ? foods.filter((r) => filters.every((f) => f(r))) : [], error: null }).then(ok),
      };
      return api;
    };
    const d = { from: q, rpc: async () => ({ data: [], error: null }) };
    const fetchOff = async () => (calls++, product);
    expect(await lookupBarcode(d, '7394376616037', fetchOff)).toEqual({ id: 'f0' });
    expect(await lookupBarcode(d, '7394376616037', fetchOff)).toEqual({ id: 'f0' });
    expect(calls).toBe(1);
    expect(await lookupBarcode(d, '123', fetchOff)).toBeNull();
  });
});

describe('photo size', () => {
  it('long side at most 1024 px, never enlarged', () => {
    expect(fitSize(4032, 3024)).toEqual({ w: 1024, h: 768 });
    expect(fitSize(3024, 4032)).toEqual({ w: 768, h: 1024 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
