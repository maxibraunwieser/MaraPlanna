// The server side of photo / text analysis and barcode lookup, independent of where it runs: the Edge Function hands in a
// Supabase service-role client and the real Claude call, the simulation its in-memory database and a local proxy.

import { matchItems, type AnalyzeInput, type AiUsage, type FoodHit, type MatchedItem, type MealAnalysis } from './ai.ts';
import { mapOffProduct, validBarcode } from './off.ts';

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export class LimitError extends Error {
  constructor(public limit: number) {
    super(`limit ${limit}`);
  }
}

export interface AnalysisResult {
  analysis_id: string | null;
  meal_name: string;
  notes: string;
  model: string;
  items: MatchedItem[];
}

export type Analyze = (input: Omit<AnalyzeInput, 'apiKey' | 'model' | 'baseUrl'>) => Promise<{ analysis: MealAnalysis; usage: AiUsage; raw: unknown }>;

/** AI calls of the last 24 hours. */
export async function usedToday(db: Db, userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data, error } = await db.from('ai_usage').select('id').eq('user_id', userId).gte('created_at', since);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/** Database search for the matching: shared foods and the person's own, nothing of other people. */
export function foodSearch(db: Db, userId: string) {
  return async (q: string): Promise<FoodHit[]> => {
    const { data, error } = await db.rpc('search_foods', { q, lim: 8 });
    if (error) throw new Error(error.message);
    return ((data ?? []) as FoodHit[]).filter((f) => f.user_id === null || f.user_id === userId);
  };
}

export async function runAnalysis(
  db: Db,
  o: { userId: string; kind: 'photo' | 'text'; model: string; dailyLimit: number; analyze: Analyze; image?: AnalyzeInput['image']; text?: string; note?: string; photoPath?: string },
): Promise<AnalysisResult> {
  if ((await usedToday(db, o.userId)) >= o.dailyLimit) throw new LimitError(o.dailyLimit);
  const base = { user_id: o.userId, kind: o.kind, photo_path: o.photoPath ?? null, input_text: o.kind === 'text' ? o.text ?? null : o.note ?? null, model: o.model };
  let result: Awaited<ReturnType<Analyze>>;
  try {
    result = await o.analyze({ image: o.image, text: o.text, note: o.note });
  } catch (e) {
    await db.from('photo_analyses').insert({ ...base, status: 'error', error: (e as Error).message.slice(0, 500) });
    throw e;
  }
  await db.from('ai_usage').insert({ user_id: o.userId, feature: o.kind, model: o.model, input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens });
  const items = await matchItems(result.analysis.items, foodSearch(db, o.userId));
  const confidence = items.length ? items.reduce((m, i) => m + i.confidence, 0) / items.length : null;
  const { data } = await db
    .from('photo_analyses')
    .insert({
      ...base, status: items.length ? 'ok' : 'empty', raw: result.raw, items, confidence,
      input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens,
    })
    .select('id')
    .single();
  return { analysis_id: (data as { id?: string } | null)?.id ?? null, meal_name: result.analysis.meal_name, notes: result.analysis.notes, model: o.model, items };
}

/**
 * A food by barcode: from the cache (foods with that barcode), else from Open Food Facts, stored in the shared database with
 * its micronutrients and serving. null when the code is invalid or the product is unknown / has no nutrients.
 */
export async function lookupBarcode(db: Db, code: string, fetchOff: (code: string) => Promise<unknown>): Promise<{ id: string } | null> {
  if (!validBarcode(code)) return null;
  const { data: cached } = await db.from('foods').select('id').eq('barcode', code).is('user_id', null).limit(1);
  if (cached?.length) return { id: cached[0].id };
  const food = mapOffProduct(code, await fetchOff(code));
  if (!food) return null;
  const { micros, portion, ...row } = food;
  const { data: saved, error } = await db.from('foods').insert({ ...row, user_id: null }).select('id').single();
  if (error || !saved) throw new Error(error?.message ?? 'saving the product failed');
  const nutrients = Object.entries(micros).map(([nutrient_code, amount]) => ({ food_id: saved.id, nutrient_code, amount }));
  if (nutrients.length) await db.from('food_nutrients').insert(nutrients);
  if (portion) await db.from('food_portions').insert({ food_id: saved.id, ...portion, sort: 0 });
  return { id: saved.id };
}
