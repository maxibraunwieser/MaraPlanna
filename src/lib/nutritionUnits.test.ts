import { describe, expect, it } from 'vitest';
import { amountText, defaultAmount, density, isLiquid, unitOptions } from '../../supabase/functions/_shared/nutrition/units';

const p = (id: string, label_en: string, grams: number, label_de: string | null = null) => ({ id, label_en, label_de, grams });

describe('units people think in', () => {
  it('drinks in ml and l, with the density from a cup', () => {
    const milk = { name_de: 'Milch, 2 % Fett', name_en: 'Milk, reduced fat', category: 'Dairy and Egg Products' };
    expect(isLiquid(milk)).toBe(true);
    const u = unitOptions(milk, [p('c', 'cup', 244, 'Tasse')], 'de');
    expect(u.map((x) => x.kind)).toEqual(['ml', 'l', 'g']);
    expect(u[0].grams).toBeCloseTo(244 / 236.6, 3);
    expect(density([])).toBe(1);
    expect(isLiquid({ name_de: 'Leitungswasser', name_en: 'Water, tap', category: 'Beverages' })).toBe(true);
    expect(isLiquid({ name_de: 'Whey-Proteinpulver', name_en: 'Protein powder whey based', category: 'Beverages' })).toBe(false);
    expect(isLiquid({ name_de: 'Naturjoghurt', name_en: 'Yogurt, plain', category: 'Dairy and Egg Products' })).toBe(false);
  });

  it('things you count in pieces, a medium one first', () => {
    const banana = { name_de: 'Banane, roh', name_en: 'Bananas, raw', category: 'Fruits and Fruit Juices' };
    const u = unitOptions(banana, [p('m', 'cup, mashed', 225, 'Tasse püriert'), p('s', 'small', 101, 'klein'), p('md', 'medium', 118, 'mittelgroß'), p('l', 'large', 136, 'groß')], 'de');
    expect(u[0]).toMatchObject({ kind: 'piece', label: 'mittelgroß', grams: 118 });
    expect(u.map((x) => x.kind)).toEqual(['piece', 'piece', 'piece', 'g', 'measure']);
    expect(u.map((x) => x.label).slice(0, 3)).toEqual(['mittelgroß', 'klein', 'groß']);
    const egg = unitOptions({ name_de: 'Ei, hart gekocht', name_en: 'Egg, whole, cooked, hard-boiled' }, [p('t', 'tbsp', 8.5, 'EL'), p('lg', 'large', 50, 'groß')], 'de');
    expect(egg[0]).toMatchObject({ kind: 'piece', grams: 50 });
  });

  it('everything else in grams, spoons and cups as extra options', () => {
    const oats = unitOptions({ name_de: 'Haferflocken', name_en: 'Cereals, oats' }, [p('c', 'cup', 81, 'Tasse')], 'de');
    expect(oats.map((x) => x.kind)).toEqual(['g', 'measure']);
    const oil = unitOptions({ name_de: 'Olivenöl', name_en: 'Oil, olive' }, [p('t', 'tbsp', 13.5, 'EL')], 'de');
    expect(oil[0].kind).toBe('g');
    expect(oil[1]).toMatchObject({ label: 'EL', grams: 13.5 });
  });

  it('starting amount and how it reads', () => {
    const ml = { key: 'ml', kind: 'ml' as const, label: 'ml', grams: 1.03, step: 50, presets: [] };
    expect(defaultAmount(ml, null)).toBe(250);
    expect(defaultAmount(ml, 206)).toBe(200);
    const piece = { key: 'p', kind: 'piece' as const, label: 'mittelgroß', grams: 118, step: 0.5, presets: [] };
    expect(defaultAmount(piece, 236)).toBe(2);
    expect(defaultAmount(piece, 148)).toBe(1.5);
    const f = (v: number, d = 0) => String(Number(v.toFixed(d)));
    expect(amountText(250, 'ml', 257, f)).toBe('250 ml');
    expect(amountText(2, 'mittelgroß', 236, f)).toBe('2 × mittelgroß');
    expect(amountText(null, null, 150, f)).toBe('150 g');
  });
});
