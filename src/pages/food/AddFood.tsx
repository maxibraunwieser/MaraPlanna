// Adding food on its own page: search (own foods first, typos forgiven), recent and frequent foods, favourites, own
// recipes, quick add (only kcal and macros), photo, text and barcode. Picking a food asks for the amount in the unit people
// think in: ml for drinks, pieces for what you count (an egg, a banana), grams for the rest.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChefHat, ChevronLeft, Clock, Minus, Pencil, Plus, ScanLine, Search, Sparkles, Star, Trash2, Zap } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Notice, Select, Spinner, cx, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { fmtDay } from '../../lib/format';
import { defaultAmount, unitOptions } from '../../../supabase/functions/_shared/nutrition/units';
import { currentLang, useI18n } from '../../lib/i18n';
import { addDays } from '../../lib/planner/dates';
import * as napi from '../../lib/nutrition/api';
import { foodName, kcalFromMacros, scale, SLOTS, type Food, type Nutrients, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { fmt, slotLabel } from './parts';
import { RecipeEditor } from './RecipeEditor';
import { BarcodeStep, ConfirmMeal, PhotoStep, TextStep } from './SmartAdd';

type Tab = 'search' | 'favorites' | 'recipes' | 'quick';

/** Search field with results; while empty it shows recent and frequent foods. */
export function FoodSearch({ userId, onPick, autoFocus = true, showRecent = true }: { userId: string; onPick: (f: Food) => void; autoFocus?: boolean; showRecent?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Food[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ recent: Food[]; frequent: Food[] } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!showRecent) return;
    napi.recentFoods(userId, addDays(new Date().toISOString().slice(0, 10), -60)).then(setRecent).catch(() => setRecent({ recent: [], frequent: [] }));
  }, [userId, showRecent]);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setResults(null);
      return;
    }
    const n = ++seq.current;
    setBusy(true);
    const timer = setTimeout(() => {
      napi.searchFoods(text)
        .then((r) => n === seq.current && (setResults(r), setError(null)))
        .catch((e: Error) => n === seq.current && setError(e.message))
        .finally(() => n === seq.current && setBusy(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('food.search.placeholder')} className="pl-9" autoFocus={autoFocus} aria-label={t('food.search.placeholder')} />
      </div>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      {results !== null ? (
        <div className="mt-3">
          {busy && !results.length ? <Spinner /> : results.length ? <FoodList foods={results} onPick={onPick} /> : <p className="py-6 text-center text-sm text-slate-500">{t('food.search.none')}</p>}
        </div>
      ) : (
        showRecent && (
          <div className="mt-4 space-y-4">
            {recent === null ? <Spinner /> : !recent.recent.length && !recent.frequent.length ? (
              <p className="py-4 text-center text-sm text-slate-500">{t('food.recent.empty')}</p>
            ) : (
              <>
                {!!recent.frequent.length && <ListBlock title={t('food.frequent')} icon={<Star className="h-3.5 w-3.5" />}><FoodList foods={recent.frequent} onPick={onPick} /></ListBlock>}
                {!!recent.recent.length && <ListBlock title={t('food.recent')} icon={<Clock className="h-3.5 w-3.5" />}><FoodList foods={recent.recent} onPick={onPick} /></ListBlock>}
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

function ListBlock({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{title}</div>
      {children}
    </div>
  );
}

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const { t } = useI18n();
  const lang = currentLang();
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl ring-1 ring-slate-200">
      {foods.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => onPick(f)} className="flex w-full items-center justify-between gap-3 bg-white px-3.5 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-900">{foodName(f, lang)}</span>
              <span className="block text-xs text-slate-500">
                {t('food.per100', { kcal: fmt(Number(f.kcal)), p: fmt(Number(f.protein_g)), c: fmt(Number(f.carbs_g)), f: fmt(Number(f.fat_g)) })}
                {f.user_id && <span className="ml-1.5 text-brand">· {f.source === 'ai_estimate' ? t('food.source.ai') : t('food.source.own')}</span>}
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-brand" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Amount of one food in the unit people think in (ml for drinks, pieces for what you count, else grams). */
function AmountStep({ food, lastGrams, onAdd, favorite, onFavorite, slot, busy }: {
  food: napi.FoodDetail; lastGrams: number | null; onAdd: (grams: number, amount: number, unit: string) => void;
  favorite: boolean; onFavorite: () => void; slot: Slot; busy: boolean;
}) {
  const { t } = useI18n();
  const lang = currentLang();
  const units = useMemo(() => unitOptions(food, food.portions, lang), [food, lang]);
  const [unitKey, setUnitKey] = useState(units[0].key);
  const u = units.find((x) => x.key === unitKey) ?? units[0];
  const [amount, setAmount] = useState(() => String(defaultAmount(units[0], lastGrams)).replace('.', lang === 'de' ? ',' : '.'));
  const value = Number(amount.replace(',', '.'));
  const grams = Number.isFinite(value) && value > 0 ? value * u.grams : 0;
  const n = napi.foodNutrients(food, grams);
  const show = (v: number) => String(Math.round(v * 100) / 100).replace('.', lang === 'de' ? ',' : '.');
  const change = (key: string) => {
    const next = units.find((x) => x.key === key)!;
    setUnitKey(key);
    setAmount(show(grams > 0 ? defaultAmount(next, grams) : defaultAmount(next, null)));
  };
  const stepBy = (dir: 1 | -1) => setAmount(show(Math.max(0, Math.round(((Number.isFinite(value) ? value : 0) + dir * u.step) / u.step) * u.step)));
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">{foodName(food, lang)}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t('food.per100', { kcal: fmt(Number(food.kcal)), p: fmt(Number(food.protein_g)), c: fmt(Number(food.carbs_g)), f: fmt(Number(food.fat_g)) })}</p>
        </div>
        <button type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={t('food.favorite')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition active:scale-90 hover:bg-slate-100">
          <Star className={cx('h-6 w-6', favorite && 'fill-amber-400 text-amber-500')} />
        </button>
      </div>

      {units.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t('food.unit')}>
          {units.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={x.key === u.key} onClick={() => change(x.key)}
              className={cx('min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-95', x.key === u.key ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
              {x.kind === 'piece' || x.kind === 'measure' ? `${x.label} · ${fmt(x.grams)} g` : x.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={() => stepBy(-1)} aria-label={t('food.less')} className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-800 transition active:scale-90"><Minus className="h-6 w-6" /></button>
        <label className="flex items-baseline gap-2">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`${t('food.amount')} (${u.label})`}
            className="w-32 bg-transparent text-center font-display text-5xl font-bold tabular-nums text-slate-900 outline-none" />
          <span className="text-lg font-semibold text-slate-500">{u.kind === 'piece' || u.kind === 'measure' ? '×' : u.label}</span>
        </label>
        <button type="button" onClick={() => stepBy(1)} aria-label={t('food.more')} className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-800 transition active:scale-90"><Plus className="h-6 w-6" /></button>
      </div>
      <p className="-mt-3 text-center text-sm text-slate-500">
        {u.kind !== 'g' && t('food.equals', { g: fmt(grams) })}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {u.presets.map((p) => (
          <button key={p} type="button" onClick={() => setAmount(show(p))} className="min-h-11 rounded-full bg-slate-100 px-4 text-sm font-medium text-slate-700 transition active:scale-95 hover:bg-slate-200">
            {fmt(p, 2)}{u.kind === 'piece' || u.kind === 'measure' ? '×' : ` ${u.label}`}
          </button>
        ))}
      </div>

      <NutrientLine n={n} />

      <Button size="lg" className="w-full" onClick={() => onAdd(grams, value, u.kind === 'g' || u.kind === 'ml' || u.kind === 'l' ? u.label : u.label)} disabled={!(grams > 0)} loading={busy} icon={<Plus className="h-5 w-5" />}>
        {t('food.addTo', { slot: slotLabel(slot) })}
      </Button>
    </div>
  );
}

export function NutrientLine({ n, grams }: { n: Nutrients; grams?: number }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 text-center ring-1 ring-slate-200">
      {([['kcal', n.kcal, ''], [t('food.macro.carbs'), n.carbs_g, ' g'], [t('food.macro.protein'), n.protein_g, ' g'], [t('food.macro.fat'), n.fat_g, ' g']] as const).map(([label, v, unit]) => (
        <div key={label}>
          <div className="text-base font-semibold tabular-nums text-slate-900">{fmt(v ?? 0)}{unit}</div>
          <div className="text-[11px] text-slate-500">{label}</div>
        </div>
      ))}
      {grams !== undefined && <div className="col-span-4 text-[11px] text-slate-500">{t('food.forGrams', { g: fmt(grams) })}</div>}
    </div>
  );
}

function QuickAdd({ onAdd, busy }: { onAdd: (name: string, n: Nutrients) => void; busy: boolean }) {
  const { t } = useI18n();
  const [v, setV] = useState({ name: '', kcal: '', p: '', c: '', f: '' });
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const p = num(v.p) ?? 0, c = num(v.c) ?? 0, f = num(v.f) ?? 0;
  const kcal = num(v.kcal) ?? (p || c || f ? kcalFromMacros(p, c, f) : null);
  const ok = kcal !== null && kcal > 0 && kcal < 5000;
  return (
    <div className="space-y-3">
      <Field label={t('food.quick.name')}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t('food.quick.namePh')} /></Field>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="kcal"><Input inputMode="decimal" value={v.kcal} onChange={(e) => setV({ ...v, kcal: e.target.value })} placeholder={kcal && !v.kcal ? String(kcal) : ''} /></Field>
        <Field label={`${t('food.macro.carbs')} (g)`}><Input inputMode="decimal" value={v.c} onChange={(e) => setV({ ...v, c: e.target.value })} /></Field>
        <Field label={`${t('food.macro.protein')} (g)`}><Input inputMode="decimal" value={v.p} onChange={(e) => setV({ ...v, p: e.target.value })} /></Field>
        <Field label={`${t('food.macro.fat')} (g)`}><Input inputMode="decimal" value={v.f} onChange={(e) => setV({ ...v, f: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-slate-500">{t('food.quick.hint')}</p>
      <div className="flex justify-end">
        <Button disabled={!ok} loading={busy} onClick={() => onAdd(v.name.trim() || t('food.quick.default'), napi.quick({ kcal: kcal!, protein_g: p, carbs_g: c, fat_g: f }))} icon={<Zap className="h-4 w-4" />}>{t('food.add')}</Button>
      </div>
    </div>
  );
}

function RecipeList({ userId, onPick }: { userId: string; onPick: (r: napi.Recipe) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [recipes, setRecipes] = useState<napi.Recipe[] | null>(null);
  const [kcal, setKcal] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<napi.Recipe | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => napi.fetchRecipes(userId).then(async (list) => {
    setRecipes(list);
    const out: Record<string, number> = {};
    for (const r of list) out[r.id] = (await napi.recipeNutrients(r)).perServing.kcal ?? 0;
    setKcal(out);
  }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [userId]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!recipes) return <Spinner />;
  return (
    <div className="space-y-3">
      {!recipes.length && <p className="py-2 text-center text-sm text-slate-500">{t('food.recipes.empty')}</p>}
      <ul className="space-y-2">
        {recipes.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-slate-200">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPick(r)}>
              <span className="block truncate text-sm font-medium text-slate-900">{r.name}</span>
              <span className="text-xs text-slate-500">{t('food.recipes.meta', { n: r.items.length, s: fmt(r.servings, 1), kcal: fmt(kcal[r.id]) })}</span>
            </button>
            <button type="button" onClick={() => setEditing(r)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label={t('food.recipes.edit')}><Pencil className="h-4 w-4" /></button>
            <button type="button" onClick={async () => { if (!window.confirm(t('food.recipes.confirmDelete', { name: r.name }))) return; try { await napi.deleteRecipe(r.id); await load(); } catch (e) { toast((e as Error).message, 'error'); } }} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label={t('food.delete')}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" icon={<ChefHat className="h-4 w-4" />} onClick={() => setEditing('new')}>{t('food.recipes.new')}</Button>
      {editing && <RecipeEditor userId={userId} recipe={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function RecipeAmount({ recipe, onBack, onAdd, slot, onSlot, busy }: { recipe: napi.Recipe; onBack: () => void; onAdd: (servings: number, n: Nutrients, grams: number) => void; slot: Slot; onSlot: (s: Slot) => void; busy: boolean }) {
  const { t } = useI18n();
  const [servings, setServings] = useState('1');
  const [data, setData] = useState<Awaited<ReturnType<typeof napi.recipeNutrients>> | null>(null);
  useEffect(() => { napi.recipeNutrients(recipe).then(setData).catch(() => setData(null)); }, [recipe]);
  const s = Number(servings.replace(',', '.'));
  const ok = Number.isFinite(s) && s > 0;
  if (!data) return <Spinner />;
  const n = scale(data.perServing, ok ? s : 1);
  return (
    <div className="space-y-4">
      <div className="text-base font-semibold text-slate-900">{recipe.name}</div>
      <Field label={t('food.recipes.servings')}><Input inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} autoFocus /></Field>
      <NutrientLine n={n} />
      <Field label={t('food.slot')}>
        <Select value={slot} onChange={(e) => onSlot(e.target.value as Slot)}>{SLOTS.map((x) => <option key={x} value={x}>{slotLabel(x)}</option>)}</Select>
      </Field>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>{t('food.back')}</Button>
        <Button disabled={!ok} loading={busy} onClick={() => onAdd(s, n, (data.grams / recipe.servings) * s)} icon={<Plus className="h-4 w-4" />}>{t('food.add')}</Button>
      </div>
    </div>
  );
}

/** Adding food is its own page (not a popup): a header with the way back, the meal as chips, then search or photo / text / barcode. */
export function AddFoodPage() {
  const { t } = useI18n();
  const toast = useToast();
  const lang = currentLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { today } = useData();
  const userId = user!.id;
  const [params] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const slot0 = (SLOTS as readonly string[]).includes(params.get('slot') ?? '') ? (params.get('slot') as Slot) : 'snack';
  const [tab, setTab] = useState<Tab>('search');
  const [slot, setSlot] = useState<Slot>(slot0);
  const [picked, setPicked] = useState<{ food: napi.FoodDetail; lastGrams: number | null } | null>(null);
  const [recipe, setRecipe] = useState<napi.Recipe | null>(null);
  const [favorites, setFavorites] = useState<Food[] | null>(null);
  const [busy, setBusy] = useState(false);
  // photo / text / barcode first, then the confirmation of what Claude found
  const [smart, setSmart] = useState<'photo' | 'text' | 'barcode' | null>(null);
  const [analysis, setAnalysis] = useState<{ result: napi.AnalysisResult; photo: { path: string; url: string } | null; source: 'photo' | 'text' } | null>(null);
  const [via, setVia] = useState<'search' | 'barcode'>('search');

  useEffect(() => {
    napi.fetchFavorites(userId).then(setFavorites).catch(() => setFavorites([]));
  }, [userId]);
  useEffect(() => { window.scrollTo(0, 0); }, [picked, recipe, smart, analysis]);

  const leave = () => navigate(`/food?date=${date}`);
  /** One step back: from a sub-step to the list, from the list out of the page. */
  const back = () => {
    if (analysis) setAnalysis(null);
    else if (picked) setPicked(null);
    else if (recipe) setRecipe(null);
    else if (smart) setSmart(null);
    else leave();
  };
  const pick = async (f: Food) => {
    try {
      const details = await napi.fetchFoodDetails([f]);
      const recent = await napi.recentFoods(userId, addDays(date, -60)).catch(() => null);
      setPicked({ food: details.get(f.id)!, lastGrams: recent?.lastGrams.get(f.id) ?? null });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const done = (name: string, s: Slot = slot) => {
    toast(t('food.added', { name, slot: slotLabel(s) }), 'success');
    leave();
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const isFav = picked ? !!favorites?.some((f) => f.id === picked.food.id) : false;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'search', label: t('food.tab.search'), icon: <Search className="h-4 w-4" /> },
    { key: 'favorites', label: t('food.tab.favorites'), icon: <Star className="h-4 w-4" /> },
    { key: 'recipes', label: t('food.tab.recipes'), icon: <ChefHat className="h-4 w-4" /> },
    { key: 'quick', label: t('food.tab.quick'), icon: <Zap className="h-4 w-4" /> },
  ];
  const manual = () => { setSmart(null); setAnalysis(null); setTab('search'); };
  const title = analysis ? t('food.confirm.title') : picked ? t('food.amount') : recipe ? t('food.tab.recipes') : smart === 'photo' ? t('food.photo.title') : smart === 'text' ? t('food.text.title') : smart === 'barcode' ? t('food.barcode.title') : t('food.addPage');

  return (
    <div className="space-y-5 pb-24">
      <header className="flex items-center gap-2">
        <button type="button" onClick={back} aria-label={t('food.back')} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-90">
          <ChevronLeft className="h-7 w-7" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{fmtDay(date, today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      {!analysis && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t('food.slot')}>
          {SLOTS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={x === slot} onClick={() => setSlot(x)}
              className={cx('min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-95', x === slot ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
              {slotLabel(x)}
            </button>
          ))}
        </div>
      )}

      {analysis ? (
        <ConfirmMeal userId={userId} date={date} slot0={slot} result={analysis.result} photo={analysis.photo} source={analysis.source}
          onCancel={() => setAnalysis(null)} onSaved={(name, s) => done(name, s)} />
      ) : picked ? (
        <AmountStep
          food={picked.food} lastGrams={picked.lastGrams} slot={slot} busy={busy} favorite={isFav}
          onFavorite={() => run(async () => {
            await napi.setFavorite(userId, picked.food.id, !isFav);
            setFavorites(await napi.fetchFavorites(userId));
          })}
          onAdd={(grams, amount, unit) => run(async () => {
            const name = foodName(picked.food, lang);
            await napi.logMeal(userId, { date, slot, source: via }, [{ name, food_id: picked.food.id, grams, amount, unit_label: unit, nutrients: napi.foodNutrients(picked.food, grams) }]);
            done(name);
          })}
        />
      ) : recipe ? (
        <RecipeAmount
          recipe={recipe} onBack={() => setRecipe(null)} slot={slot} onSlot={setSlot} busy={busy}
          onAdd={(servings, n, grams) => run(async () => {
            await napi.logMeal(userId, { date, slot, source: 'recipe', name: recipe.name }, [{ name: recipe.name, recipe_id: recipe.id, grams: Math.round(grams), amount: servings, unit_label: t('food.recipes.serving'), nutrients: n }]);
            done(recipe.name);
          })}
        />
      ) : smart === 'photo' ? (
        <PhotoStep userId={userId} date={date} onManual={manual} onResult={(result, photo) => setAnalysis({ result, photo, source: 'photo' })} />
      ) : smart === 'text' ? (
        <TextStep onManual={manual} onResult={(result) => setAnalysis({ result, photo: null, source: 'text' })} />
      ) : smart === 'barcode' ? (
        <BarcodeStep onManual={manual} onFood={(f) => { setVia('barcode'); void pick(f); }} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {([['photo', Camera, t('food.smart.photo')], ['text', Sparkles, t('food.smart.text')], ['barcode', ScanLine, t('food.smart.barcode')]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setSmart(k)} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-brand/10 px-2 py-3 text-sm font-semibold text-brand ring-1 ring-brand/20 transition hover:bg-brand/15 active:scale-[0.97]">
                <Icon className="h-6 w-6" />{label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
            {tabs.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
                className={cx('flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-sm', tab === x.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                {x.icon}{x.label}
              </button>
            ))}
          </div>
          {tab === 'search' && <FoodSearch userId={userId} onPick={pick} />}
          {tab === 'favorites' && (favorites === null ? <Spinner /> : favorites.length ? <FoodList foods={favorites} onPick={pick} /> : <p className="py-6 text-center text-sm text-slate-500">{t('food.favorites.empty')}</p>)}
          {tab === 'recipes' && <RecipeList userId={userId} onPick={setRecipe} />}
          {tab === 'quick' && (
            <QuickAdd busy={busy} onAdd={(name, n) => run(async () => {
              await napi.logMeal(userId, { date, slot, source: 'quick_add', name }, [{ name, grams: null, nutrients: n, source: 'quick_add' }]);
              done(name);
            })} />
          )}
        </div>
      )}
    </div>
  );
}

