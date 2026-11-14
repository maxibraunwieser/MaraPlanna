// Import of the base food database from USDA FoodData Central (Foundation Foods + SR Legacy, public domain).
//
//   node scripts/import-foods.ts                 download (once, into out/usda), map, report
//   node scripts/import-foods.ts --translate     also translate missing German names with Claude (ANTHROPIC_API_KEY);
//                                                results are kept in scripts/data/usda-names-de.json, so this runs once
//   node scripts/import-foods.ts --sample        write the foods with a German name to src/sim/foodSample.json (simulation)
//   node scripts/import-foods.ts --apply         upsert into Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
//                                                needs the nutrition migration. Never run this against production
//                                                without the owner's OK.
//
// Values are per 100 g. A micronutrient the source has no value for is left out (not zero), and every food gets the
// share of tracked micronutrients it has values for (completeness), so analyses can say how complete they are.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const usdaDir = path.join(root, 'out', 'usda');
const namesFile = path.join(root, 'scripts', 'data', 'usda-names-de.json');
const sampleFile = path.join(root, 'src', 'sim', 'foodSample.json');

const DATASETS = [
  { key: 'FoundationFoods', file: 'FoodData_Central_foundation_food_json_2026-10-29' },
  { key: 'SRLegacyFoods', file: 'FoodData_Central_sr_legacy_food_json_2018-04' },
];

/** Our nutrient codes -> USDA nutrient numbers, first available wins. */
const MICROS: Record<string, string[]> = {
  iron: ['303'], vit_d: ['328'], calcium: ['301'], magnesium: ['304'], sodium: ['307'], potassium: ['306'], zinc: ['309'],
  vit_b12: ['418'], folate: ['435', '417'], vit_c: ['401'], vit_a: ['320'], vit_e: ['323'], vit_k: ['430'], vit_b1: ['404'],
  vit_b2: ['405'], vit_b6: ['415'], iodine: ['314'], selenium: ['317'],
};
const MICRO_COUNT = Object.keys(MICROS).length + 1; // + epa_dha

/** Portion words in German (USDA modifiers); unknown words stay English. */
const PORTION_DE: [RegExp, string][] = [
  [/^cup\b/, 'Tasse'], [/^tbsp\b|^tablespoon\b/, 'EL'], [/^tsp\b|^teaspoon\b/, 'TL'], [/^slice\b/, 'Scheibe'], [/^piece\b|^pieces\b|^item\b|^unit\b/, 'Stück'],
  [/^medium\b/, 'mittelgroß'], [/^large\b/, 'groß'], [/^small\b/, 'klein'], [/^extra large\b/, 'sehr groß'], [/^extra small\b/, 'sehr klein'],
  [/^serving\b|^nlea serving\b/, 'Portion'], [/^bar\b/, 'Riegel'], [/^fillet\b/, 'Filet'], [/^steak\b/, 'Steak'], [/^scoop\b/, 'Messlöffel'], [/^can\b/, 'Dose'],
  [/^package\b/, 'Packung'], [/^jar\b/, 'Glas'], [/^egg\b/, 'Ei'], [/^fruit\b/, 'Frucht'], [/^leaf\b/, 'Blatt'], [/^stalk\b/, 'Stange'], [/^clove\b/, 'Zehe'],
];
const SKIP_PORTION = /^(oz|lb|fl oz|quart|pint|gallon|racc|quantity not specified|cubic inch)\b/i;
/** Words after the portion word (cup, sliced); a label with a word not listed here stays English only. */
const WORDS_DE: Record<string, string> = {
  sliced: 'geschnitten', slices: 'Scheiben', chopped: 'gehackt', diced: 'gewürfelt', mashed: 'püriert', shredded: 'geraspelt', cubes: 'Würfel',
  cooked: 'gegart', raw: 'roh', whole: 'ganz', halves: 'Hälften', pieces: 'Stücke', or: 'oder', packed: 'gepresst', grated: 'gerieben',
  crumbled: 'zerbröselt', melted: 'geschmolzen', ground: 'gemahlen', drained: 'abgetropft', boneless: 'ohne Knochen', with: 'mit', without: 'ohne',
};

type Rec = Record<string, any>;

interface FoodOut {
  source: 'usda';
  external_id: string;
  name_en: string;
  name_de: string | null;
  category: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sat_fat_g: number | null;
  sodium_mg: number | null;
  completeness: number;
  micros: Record<string, number>;
  portions: { label_en: string; label_de: string | null; grams: number; sort: number }[];
}

function ensureData() {
  mkdirSync(usdaDir, { recursive: true });
  for (const d of DATASETS) {
    const json = path.join(usdaDir, `${d.file}.json`);
    if (existsSync(json)) continue;
    const zip = path.join(usdaDir, `${d.file}.zip`);
    if (!existsSync(zip)) {
      console.log(`downloading ${d.file}.zip …`);
      execFileSync('curl', ['-sSL', '-o', zip, `https://fdc.nal.usda.gov/fdc-datasets/${d.file}.zip`], { stdio: 'inherit' });
    }
    execFileSync('unzip', ['-o', '-q', zip, '-d', usdaDir], { stdio: 'inherit' });
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function mapFood(f: Rec, names: Record<string, string>): FoodOut | null {
  const by = new Map<string, number>();
  for (const n of f.foodNutrients ?? []) {
    const num = n?.nutrient?.number;
    const amount = typeof n?.amount === 'number' ? n.amount : null;
    if (num && amount !== null && !by.has(num)) by.set(num, amount);
  }
  const pick = (...nums: string[]) => {
    for (const n of nums) if (by.has(n)) return by.get(n)!;
    return null;
  };
  const protein = pick('203');
  const fat = pick('204', '298');
  const carbs = pick('205', '205.2');
  let kcal = pick('208', '958', '957');
  if (kcal === null && protein !== null && fat !== null && carbs !== null) kcal = 4 * protein + 4 * carbs + 9 * fat;
  if (kcal === null || protein === null || fat === null || carbs === null) return null;
  const micros: Record<string, number> = {};
  for (const [code, nums] of Object.entries(MICROS)) {
    const v = pick(...nums);
    if (v !== null) micros[code] = r3(v);
  }
  const epa = pick('629');
  const dha = pick('621');
  if (epa !== null || dha !== null) micros.epa_dha = r3(((epa ?? 0) + (dha ?? 0)) * 1000);
  const portions: FoodOut['portions'] = [];
  for (const p of f.foodPortions ?? []) {
    const unit = p?.measureUnit?.name && !['undetermined', 'RACC'].includes(p.measureUnit.name) ? p.measureUnit.name : '';
    const text = `${unit} ${p?.modifier ?? ''}`.trim().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ');
    const grams = Number(p?.gramWeight);
    if (!text || SKIP_PORTION.test(text) || !(grams > 0)) continue;
    const amount = Number(p?.amount ?? p?.value ?? 1) || 1;
    const label = `${amount !== 1 ? `${amount} ` : ''}${text}`;
    const lower = text.toLowerCase();
    const de = PORTION_DE.find(([re]) => re.test(lower));
    let labelDe: string | null = null;
    if (de) {
      const rest = lower.replace(de[0], '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
      if (rest.every((w) => WORDS_DE[w])) labelDe = `${amount !== 1 ? `${amount} ` : ''}${[de[1], ...rest.map((w) => WORDS_DE[w])].join(' ')}`;
    }
    if (portions.some((x) => x.label_en === label)) continue;
    portions.push({ label_en: label, label_de: labelDe, grams: r1(grams), sort: Number(p?.sequenceNumber ?? portions.length) });
  }
  const id = String(f.fdcId);
  return {
    source: 'usda', external_id: id, name_en: String(f.description).trim(), name_de: names[id] ?? null,
    category: f.foodCategory?.description ?? null,
    kcal: r1(kcal), protein_g: r1(protein), carbs_g: r1(carbs), fat_g: r1(fat),
    fiber_g: pick('291', '293'), sugar_g: pick('269', '269.3'), sat_fat_g: pick('606'), sodium_mg: pick('307'),
    completeness: r3(Object.keys(micros).length / MICRO_COUNT), micros, portions: portions.sort((a, b) => a.sort - b.sort),
  };
}

async function translate(foods: FoodOut[], names: Record<string, string>) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error('--translate needs ANTHROPIC_API_KEY in the environment.');
  const model = process.env.TRANSLATE_MODEL ?? 'claude-haiku-5-5';
  const todo = foods.filter((f) => !names[f.external_id]);
  console.log(`translating ${todo.length} names with ${model} …`);
  for (let i = 0; i < todo.length; i += 80) {
    const batch = todo.slice(i, i + 80);
    const list = Object.fromEntries(batch.map((f) => [f.external_id, f.name_en]));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: 'You translate USDA food descriptions into short, natural German food names as a German or Austrian food diary would show them (e.g. "Haferflocken", "Hähnchenbrust, gebraten"). Keep the preparation (roh, gekocht, gebraten) when it matters for nutrition, drop US-specific details. Answer with one JSON object mapping each id to its German name, nothing else.',
        messages: [{ role: 'user', content: JSON.stringify(list) }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = body.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
    for (const f of batch) {
      const v = json[f.external_id];
      if (typeof v === 'string' && v.trim() && v.length < 120) names[f.external_id] = v.trim();
    }
    writeFileSync(namesFile, JSON.stringify(names, null, 2) + '\n');
    console.log(`  ${Math.min(i + 80, todo.length)} / ${todo.length}`);
  }
}

async function rest(url: string, key: string, pathAndQuery: string, init: RequestInit & { prefer?: string }) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.prefer ? { Prefer: init.prefer } : {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathAndQuery.split('?')[0]} ${res.status}: ${text}`);
  // writes without return=representation answer with an empty body
  return text.trim() ? JSON.parse(text) : null;
}

async function apply(foods: FoodOut[]) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  for (let i = 0; i < foods.length; i += 150) {
    const batch = foods.slice(i, i + 150);
    const saved = (await rest(url, key, 'foods?on_conflict=source,external_id&select=id,external_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(batch.map(({ micros: _m, portions: _p, ...row }) => ({ ...row, updated_at: new Date().toISOString() }))),
    })) as { id: string; external_id: string }[];
    const idOf = new Map(saved.map((s) => [s.external_id, s.id]));
    const nutrients = batch.flatMap((f) => Object.entries(f.micros).map(([code, amount]) => ({ food_id: idOf.get(f.external_id), nutrient_code: code, amount })));
    if (nutrients.length) await rest(url, key, 'food_nutrients?on_conflict=food_id,nutrient_code', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(nutrients) });
    const ids = [...idOf.values()];
    await rest(url, key, `food_portions?food_id=in.(${ids.join(',')})`, { method: 'DELETE' });
    const portions = batch.flatMap((f) => f.portions.map((p) => ({ ...p, food_id: idOf.get(f.external_id) })));
    if (portions.length) await rest(url, key, 'food_portions', { method: 'POST', body: JSON.stringify(portions) });
    console.log(`  applied ${Math.min(i + 150, foods.length)} / ${foods.length}`);
  }
}

async function main() {
  ensureData();
  const names = existsSync(namesFile) ? (JSON.parse(readFileSync(namesFile, 'utf8')) as Record<string, string>) : {};
  const foods: FoodOut[] = [];
  let skipped = 0;
  for (const d of DATASETS) {
    const data = JSON.parse(readFileSync(path.join(usdaDir, `${d.file}.json`), 'utf8')) as Rec;
    for (const f of data[d.key] as Rec[]) {
      const m = mapFood(f, names);
      if (m) foods.push(m);
      else skipped++;
    }
  }
  if (args.has('--translate')) {
    await translate(foods, names);
    for (const f of foods) f.name_de = names[f.external_id] ?? null;
  }
  const avg = foods.reduce((m, f) => m + f.completeness, 0) / foods.length;
  const coverage = Object.fromEntries([...Object.keys(MICROS), 'epa_dha'].map((c) => [c, `${Math.round((foods.filter((f) => c in f.micros).length / foods.length) * 100)} %`]));
  console.log(JSON.stringify({ foods: foods.length, skippedWithoutMacros: skipped, withGermanName: foods.filter((f) => f.name_de).length, averageCompleteness: r3(avg), coverage }, null, 2));

  if (args.has('--sample')) {
    const sample = foods.filter((f) => f.name_de).map((f) => ({ ...f, portions: f.portions.slice(0, 6) }));
    writeFileSync(sampleFile, JSON.stringify(sample) + '\n');
    console.log(`wrote ${sample.length} foods to ${path.relative(root, sampleFile)}`);
  }
  if (args.has('--apply')) await apply(foods);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
