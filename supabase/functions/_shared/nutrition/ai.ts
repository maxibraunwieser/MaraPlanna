// Meal analysis with Claude: a photo or a sentence ("2 Eier, 1 Scheibe Vollkornbrot") becomes a list of foods with estimated
// grams. Claude only estimates WHAT and HOW MUCH; the nutrients come from the food database (matchItems). Only when nothing in
// the database fits, Claude's own per-100 g estimate is used and marked as such. Pure functions with an injected fetch, shared
// by the "nutrition" Edge Function and the website's simulation.

export interface AiItem {
  name_de: string;
  name_en: string;
  /** Short generic term to look the food up in the database (German). */
  search: string;
  estimated_grams: number;
  confidence: number;
  /** Claude's estimate per 100 g, used only when the database has no match. */
  per100: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
}

export interface MealAnalysis {
  meal_name: string;
  items: AiItem[];
  notes: string;
}

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
}

export const MAX_ITEMS = 15;

// The answer is forced into this JSON schema (structured outputs: output_config.format). Limits that the schema format does
// not support (number ranges, item counts) are applied afterwards in cleanAnalysis.
export const MEAL_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      meal_name: { type: 'string', description: 'Short name of the whole meal in German, e.g. "Pasta Bolognese".' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name_de: { type: 'string', description: 'Food in German as a food diary shows it, with preparation, e.g. "Spaghetti, gekocht".' },
            name_en: { type: 'string', description: 'The same food in English, e.g. "Spaghetti, cooked".' },
            search: { type: 'string', description: 'One to three generic German words to find it in a food database, e.g. "Nudeln gekocht", "Banane", "Olivenöl".' },
            estimated_grams: { type: 'number', description: 'Estimated weight in grams as eaten (cooked weight for cooked food).' },
            confidence: { type: 'number', description: 'How sure you are about food and amount, 0 to 1.' },
            per100: {
              type: 'object',
              additionalProperties: false,
              description: 'Typical nutrients per 100 g of this food as eaten.',
              properties: { kcal: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } },
              required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
            },
          },
          required: ['name_de', 'name_en', 'search', 'estimated_grams', 'confidence', 'per100'],
        },
      },
      notes: { type: 'string', description: 'One short German sentence about the estimate (e.g. "Portion eher groß", "Sauce schwer zu schätzen"), or why nothing could be recognised.' },
    },
    required: ['meal_name', 'items', 'notes'],
};

const SYSTEM = [
  'You estimate meals for the food diary of an endurance athlete.',
  'List every component separately, including the parts people forget: oil or butter used for cooking, sauces, dressings, toppings, drinks.',
  'Estimate grams as eaten from visible cues (plate about 26 cm, fork, hand, packaging) and the note of the person; when the person states an amount, use it.',
  'Use generic foods unless a brand is clearly readable. Do not invent foods you cannot see or that are not mentioned.',
  'If the picture shows no food or the text names no food, return an empty list and say why in notes.',
  `List at most ${MAX_ITEMS} components. Answer only with the JSON of the given schema.`,
].join(' ');

const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Checks and clamps what Claude returned (a tool input is still model output). */
export function cleanAnalysis(raw: unknown): MealAnalysis {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items: AiItem[] = [];
  for (const x of Array.isArray(r.items) ? r.items.slice(0, MAX_ITEMS) : []) {
    const it = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const name = str(it.name_de) || str(it.name_en);
    if (!name) continue;
    const p = (it.per100 && typeof it.per100 === 'object' ? it.per100 : {}) as Record<string, unknown>;
    items.push({
      name_de: str(it.name_de) || name,
      name_en: str(it.name_en) || name,
      search: str(it.search, 60) || name,
      estimated_grams: Math.round(num(it.estimated_grams, 1, 2000, 100)),
      confidence: Math.round(num(it.confidence, 0, 1, 0.5) * 100) / 100,
      per100: { kcal: num(p.kcal, 0, 900, 0), protein_g: num(p.protein_g, 0, 100, 0), carbs_g: num(p.carbs_g, 0, 100, 0), fat_g: num(p.fat_g, 0, 100, 0) },
    });
  }
  return { meal_name: str(r.meal_name) || items[0]?.name_de || '', items, notes: str(r.notes, 300) };
}

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AnalyzeInput {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** base64 JPEG/PNG/WebP */
  image?: { data: string; mediaType: string };
  text?: string;
  note?: string;
}

/** One call to the Messages API; the answer is JSON of MEAL_SCHEMA (structured outputs). */
export async function analyzeMeal(fetchFn: typeof fetch, input: AnalyzeInput): Promise<{ analysis: MealAnalysis; usage: AiUsage; raw: unknown }> {
  const content: unknown[] = [];
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  const words = [
    input.image ? 'What is in this meal and how much of each?' : `The person ate: ${input.text ?? ''}`,
    input.note ? `Note of the person: ${input.note}` : '',
  ].filter(Boolean).join('\n');
  content.push({ type: 'text', text: words });
  const res = await fetchFn(`${(input.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: MEAL_SCHEMA } },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiError(res.status, `Claude ${res.status}: ${body.slice(0, 300)}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Partial<AiUsage>; stop_reason?: string };
  const text = body.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError(502, `Claude gave no analysis (stop: ${body.stop_reason ?? 'unknown'}).`);
  }
  return {
    analysis: cleanAnalysis(parsed),
    usage: { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 },
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// Matching the estimate to the food database
// ---------------------------------------------------------------------------

export interface FoodHit {
  id: string;
  name_de: string | null;
  name_en: string | null;
  user_id: string | null;
  kcal: number;
}

export interface MatchedItem extends AiItem {
  /** The database food the nutrients come from; null = Claude's estimate is used (source ai_estimate). */
  food: FoodHit | null;
}

const words = (s: string) => s.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

/** Do two names share a word (or the first five letters of one, so "Nudeln"/"Nudel" and "gekocht"/"gekochte" meet)? */
export function namesMeet(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  return wa.some((x) => wb.some((y) => x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5))));
}

/** The main word of a database name: its first word ("Croissants, butter" is a croissant, not butter). */
const head = (name: string | null) => words(name ?? '')[0] ?? '';

/** Does the database food's main word (German or English name) appear among the words of the item? */
export function headMeets(hit: Pick<FoodHit, 'name_de' | 'name_en'>, itemText: string): boolean {
  return [head(hit.name_de), head(hit.name_en)].some((h) => !!h && namesMeet(h, itemText));
}

/**
 * The best database food for each item: the first search hit (own foods come first) whose main word meets the item's name, and
 * whose energy is plausible (within a factor of 3 of Claude's estimate when that is not tiny). No such hit: estimate.
 */
export async function matchItems(items: AiItem[], search: (q: string) => Promise<FoodHit[]>): Promise<MatchedItem[]> {
  const out: MatchedItem[] = [];
  for (const it of items) {
    let food: FoodHit | null = null;
    for (const q of [it.search, it.name_de, it.name_en]) {
      if (!q) continue;
      const hits = await search(q).catch(() => [] as FoodHit[]);
      food = hits.find((h) => {
        if (!headMeets(h, `${it.search} ${it.name_de} ${it.name_en}`)) return false;
        const k = Number(h.kcal);
        return it.per100.kcal < 30 || (k >= it.per100.kcal / 3 && k <= it.per100.kcal * 3);
      }) ?? null;
      if (food) break;
    }
    out.push({ ...it, food });
  }
  return out;
}
