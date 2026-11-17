// In which unit a person thinks about a food: drinks in ml (or l), things you count in pieces (an egg, a banana, a slice of
// bread), everything else in grams. The first option is the default; the others stay one tap away. Every option converts
// to grams, because the nutrients are per 100 g.

export type UnitKind = 'g' | 'ml' | 'l' | 'piece' | 'measure';

export interface UnitOption {
  key: string;
  kind: UnitKind;
  /** Short label for the amount ("g", "ml", "Stück", "mittelgroß", "EL"). */
  label: string;
  /** Grams of one unit. */
  grams: number;
  /** Step of the − / + buttons. */
  step: number;
  /** Quick amounts. */
  presets: number[];
}

interface FoodLike {
  name_de: string | null;
  name_en: string | null;
  category?: string | null;
}
interface PortionLike {
  id: string;
  label_de: string | null;
  label_en: string;
  grams: number;
}

const LIQUID = /\b(milch|milk|saft|juice|nektar|wasser|water|kaffee|coffee|espresso|tee\b|tea\b|drink|getränk|beverage|smoothie|kefir|buttermilch|ayran|cola|limonade|limo|soda|bier|beer|wein|wine|brühe|broth|bouillon|suppe|soup|shake|iso|sportgetränk|kakao\b)/i;
const NOT_LIQUID = /(pulver|powder|schokolade|chocolate|käse|cheese|riegel|bar\b|getrocknet|dried|flocken|flakes|joghurt|yogurt|quark|eis\b|ice cream)/i;
const DRINK_CATEGORY = /beverage|getränk/i;
/** Portions that are one countable thing. */
const PIECE = /^(\d+([.,]\d+)?\s+)?(stück|piece|pieces|item|unit|scheibe|slice|ei\b|egg|frucht|fruit|riegel|bar|mittelgroß|medium|groß|large|klein|small|sehr groß|extra large|sehr klein|extra small|zehe|clove|blatt|leaf|stange|stalk|brötchen|roll|bagel|croissant|tortilla|patty|fillet|filet|steak)/i;
/** Household measures that are not a piece (cup, spoon). */
const MEASURE = /^(\d+([.,]\d+)?\s+)?(tasse|cup|el\b|tbsp|tablespoon|tl\b|tsp|teaspoon|messlöffel|scoop|portion|serving|nlea serving|glas|jar|dose|can|packung|package)/i;
const ML_PER_CUP = 236.6;

export function isLiquid(food: FoodLike): boolean {
  const name = `${food.name_de ?? ''} ${food.name_en ?? ''}`;
  if (NOT_LIQUID.test(name)) return false;
  return LIQUID.test(name) || DRINK_CATEGORY.test(food.category ?? '');
}

/** Grams per ml: from a cup portion when there is one (milk ≈ 1.03), else water. */
export function density(portions: PortionLike[]): number {
  const cup = portions.find((p) => /^(1\s+)?cup\b/i.test(p.label_en));
  const d = cup ? cup.grams / ML_PER_CUP : 1;
  return d > 0.5 && d < 1.6 ? d : 1;
}

const label = (p: PortionLike, lang: 'de' | 'en') => ((lang === 'de' ? p.label_de : null) ?? p.label_en).replace(/^1\s+/, '');

/** The units of a food, the most natural one first. */
export function unitOptions(food: FoodLike, portions: PortionLike[], lang: 'de' | 'en'): UnitOption[] {
  const grams: UnitOption = { key: 'g', kind: 'g', label: 'g', grams: 1, step: 10, presets: [30, 50, 100, 150, 200] };
  const out: UnitOption[] = [];
  if (isLiquid(food)) {
    const d = density(portions);
    out.push({ key: 'ml', kind: 'ml', label: 'ml', grams: d, step: 50, presets: [100, 200, 250, 330, 500] });
    out.push({ key: 'l', kind: 'l', label: 'l', grams: d * 1000, step: 0.25, presets: [0.25, 0.5, 0.75, 1, 1.5] });
    out.push(grams);
    return out;
  }
  // pieces: a "medium" one first, then the other sizes
  const pieces = portions.filter((p) => PIECE.test(p.label_en) || (p.label_de && PIECE.test(p.label_de)));
  // a medium one (or a plain piece / slice) first, the other sizes from small to large
  const order = (p: PortionLike) => (/medium|mittel/i.test(`${p.label_en} ${p.label_de}`) ? 0 : /^(1\s+)?(piece|stück|slice|scheibe|egg|ei|item|unit)/i.test(p.label_en) ? 1 : 2);
  pieces.sort((a, b) => order(a) - order(b) || a.grams - b.grams);
  for (const p of pieces) {
    const amount = Number(p.label_en.match(/^(\d+(\.\d+)?)\s/)?.[1] ?? 1) || 1;
    out.push({ key: p.id, kind: 'piece', label: label(p, lang).replace(/^\d+([.,]\d+)?\s+/, ''), grams: p.grams / amount, step: 0.5, presets: [0.5, 1, 2, 3, 4] });
  }
  out.push(grams);
  for (const p of portions.filter((x) => !pieces.includes(x) && MEASURE.test(x.label_en))) {
    const amount = Number(p.label_en.match(/^(\d+(\.\d+)?)\s/)?.[1] ?? 1) || 1;
    out.push({ key: p.id, kind: 'measure', label: label(p, lang).replace(/^\d+([.,]\d+)?\s+/, ''), grams: p.grams / amount, step: 0.5, presets: [0.5, 1, 2, 3] });
  }
  return out;
}

/** A sensible first amount in a unit: what was eaten last time (grams), else one piece / 250 ml / 100 g. */
export function defaultAmount(u: UnitOption, lastGrams: number | null): number {
  if (lastGrams && lastGrams > 0) {
    const v = lastGrams / u.grams;
    const step = u.kind === 'g' ? 5 : u.kind === 'ml' ? 10 : u.kind === 'l' ? 0.25 : 0.5;
    return Math.max(step, Math.round(v / step) * step);
  }
  return u.kind === 'g' ? 100 : u.kind === 'ml' ? 250 : u.kind === 'l' ? 0.5 : 1;
}

/** How an amount reads in the diary: "250 ml", "1,5 l", "150 g", "2 × mittelgroß". */
export function amountText(amount: number | null, unit: string | null, grams: number | null, fmt: (v: number, d?: number) => string): string {
  if (amount && unit && ['g', 'ml', 'l'].includes(unit)) return `${fmt(amount, unit === 'l' ? 2 : 0)} ${unit}`;
  if (amount && unit) return `${fmt(amount, 2)} × ${unit}`;
  return grams ? `${fmt(grams)} g` : '';
}
