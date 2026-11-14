// Own recipe: ingredients with grams and the number of servings; the nutrients per serving are calculated from the food
// database and shown while editing.

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Field, Input, Modal, Notice } from '../../components/ui';
import { currentLang, useI18n } from '../../lib/i18n';
import * as napi from '../../lib/nutrition/api';
import { foodName, forGrams, scale, sumNutrients, type Food } from '../../../supabase/functions/_shared/nutrition/items';
import { FoodSearch, NutrientLine } from './AddFood';
import { fmt } from './parts';

export function RecipeEditor({ userId, recipe, onClose, onSaved }: { userId: string; recipe: napi.Recipe | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const lang = currentLang();
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [items, setItems] = useState<{ food: Food; grams: string }[]>(() => (recipe?.items ?? []).filter((i) => i.food).map((i) => ({ food: i.food!, grams: String(i.grams) })));
  const [details, setDetails] = useState<Map<string, napi.FoodDetail>>(new Map());
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const missing = items.map((i) => i.food).filter((f) => !details.has(f.id));
    if (missing.length) napi.fetchFoodDetails(missing).then((d) => setDetails((prev) => new Map([...prev, ...d]))).catch((e: Error) => setError(e.message));
  }, [items, details]);

  const parts = items.map((i) => {
    const d = details.get(i.food.id);
    const g = Number(i.grams.replace(',', '.'));
    return d && g > 0 ? forGrams(d, d.micros, g) : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const s = Number(servings.replace(',', '.'));
  const perServing = scale(sumNutrients(parts), 1 / (s > 0 ? s : 1));
  const valid = name.trim().length > 0 && s > 0 && items.length > 0 && items.every((i) => Number(i.grams.replace(',', '.')) > 0);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await napi.saveRecipe(userId, { id: recipe?.id, name, servings: s }, items.map((i) => ({ food_id: i.food.id, grams: Number(i.grams.replace(',', '.')) })));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={recipe ? t('food.recipes.edit') : t('food.recipes.new')} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label={t('food.recipes.name')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('food.recipes.namePh')} /></Field>
          <Field label={t('food.recipes.servingsTotal')}><Input inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">{t('food.recipes.ingredients')}</div>
          {items.length ? (
            <ul className="divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200">
              {items.map((i, k) => (
                <li key={`${i.food.id}-${k}`} className="flex items-center gap-2 bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{foodName(i.food, lang)}</span>
                  <Input className="!w-20 text-right" inputMode="decimal" value={i.grams} aria-label={t('food.amount')} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, grams: e.target.value } : x)))} />
                  <span className="text-xs text-slate-500">g</span>
                  <button type="button" onClick={() => setItems(items.filter((_, j) => j !== k))} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label={t('food.delete')}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t('food.recipes.noIngredients')}</p>
          )}
          {adding ? (
            <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <FoodSearch userId={userId} showRecent={false} onPick={(f) => { setItems([...items, { food: f, grams: '100' }]); setAdding(false); }} />
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(false)}>{t('food.back')}</Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAdding(true)}>{t('food.recipes.addIngredient')}</Button>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">{t('food.recipes.perServing', { g: fmt(items.reduce((m, i) => m + (Number(i.grams.replace(',', '.')) || 0), 0) / (s > 0 ? s : 1)) })}</div>
          <NutrientLine n={perServing} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('food.cancel')}</Button>
          <Button onClick={save} disabled={!valid} loading={busy}>{t('food.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
