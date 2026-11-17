// Micronutrients as a scale instead of numbers: the day's card in the diary and the detail of one meal.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardTitle, Notice, cx, useToast } from '../../components/ui';
import { amountText } from '../../../supabase/functions/_shared/nutrition/units';
import { currentLang, useI18n, type MsgKey } from '../../lib/i18n';
import * as napi from '../../lib/nutrition/api';
import { sumNutrients, type MealEntry, type MealItem, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { LEVEL_STEPS, dayMicros, mealMicros, microRulesMissing, overallLevel, type Level, type MealLevel, type NutrientInfo, type Person, type ReferenceRow } from '../../../supabase/functions/_shared/nutrition/micros';
import type { Rules } from '../../../supabase/functions/_shared/nutrition/targets';
import { NutrientLine } from './AddFood';
import { fmt, slotLabel } from './parts';

const TONE: Record<Level, string> = {
  very_good: 'bg-emerald-500', good: 'bg-emerald-400', fair: 'bg-amber-400', low: 'bg-orange-500', very_low: 'bg-red-500', too_much: 'bg-red-500', unknown: 'bg-slate-300',
};
const BADGE: Record<Level, 'green' | 'amber' | 'orange' | 'red' | 'slate'> = {
  very_good: 'green', good: 'green', fair: 'amber', low: 'orange', very_low: 'red', too_much: 'red', unknown: 'slate',
};
const MEAL_STEPS: Record<MealLevel, number> = { much: 3, some: 2, little: 1, none: 0, unknown: 0 };

const levelText = (t: (k: MsgKey) => string, l: Level) => t(`food.level.${l}` as MsgKey);
const nutrientName = (n: NutrientInfo | undefined, code: string) => (n ? (currentLang() === 'de' ? n.name_de : n.name_en) : code);

/** Five segments: how well a nutrient is covered (too much: all red). */
export function LevelScale({ level, label }: { level: Level; label: string }) {
  const steps = LEVEL_STEPS[level];
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx('h-2 w-4 rounded-full', i <= steps ? TONE[level] : 'bg-slate-200')} />
        ))}
      </div>
      <span className={cx('w-20 text-xs', level === 'unknown' ? 'text-slate-400' : 'font-medium text-slate-700')}>{label}</span>
    </div>
  );
}

/** The day's micronutrients: overall rating, the key ones for endurance athletes, the rest on request. */
export function MicroCard({ items, refs, nutrients, rules, person, sodiumTarget, isToday }: {
  items: MealItem[]; refs: ReferenceRow[]; nutrients: NutrientInfo[]; rules: Rules; person: Person | null; sodiumTarget: number | null; isToday: boolean;
}) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const missing = microRulesMissing(rules);
  const byCode = useMemo(() => new Map(nutrients.map((n) => [n.code, n])), [nutrients]);
  const list = useMemo(() => (person && !missing.length ? dayMicros(items, refs, person, rules, sodiumTarget ? { sodium: sodiumTarget } : {}) : []), [items, refs, person, rules, sodiumTarget, missing.length]);
  if (missing.length) return <Card><CardTitle>{t('food.micro.title')}</CardTitle><Notice tone="info">{t('food.micro.noRules')}</Notice></Card>;
  if (!person) return null;
  const sorted = [...list].sort((a, b) => (byCode.get(a.code)?.sort ?? 99) - (byCode.get(b.code)?.sort ?? 99));
  const key = sorted.filter((m) => byCode.get(m.code)?.endurance_key);
  const rest = sorted.filter((m) => !byCode.get(m.code)?.endurance_key);
  const overall = overallLevel(list, rules);
  return (
    <Card>
      <CardTitle action={<Badge tone={BADGE[overall.level]}>{levelText(t, overall.level)}</Badge>}>
        {isToday ? t('food.micro.titleToday') : t('food.micro.title')}
      </CardTitle>
      {!items.length ? (
        <p className="text-sm text-slate-500">{t('food.micro.empty')}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {overall.rated ? t('food.micro.summary', { good: overall.good, rated: overall.rated }) : t('food.micro.noneRated')}
            {isToday && ` ${t('food.micro.soFar')}`}
          </p>
          <MicroRows rows={key} byCode={byCode} />
          {all && <div className="mt-3 border-t border-slate-200 pt-3"><MicroRows rows={rest} byCode={byCode} /></div>}
          <button type="button" onClick={() => setAll(!all)} className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800" aria-expanded={all}>
            <ChevronDown className={cx('h-3.5 w-3.5 transition', all && 'rotate-180')} />{all ? t('food.micro.less') : t('food.micro.more', { n: rest.length })}
          </button>
          {list.some((m) => m.level === 'unknown') && <p className="mt-2 text-[11px] text-slate-500">{t('food.micro.unknownHint')}</p>}
        </>
      )}
    </Card>
  );
}

function MicroRows({ rows, byCode }: { rows: ReturnType<typeof dayMicros>; byCode: Map<string, NutrientInfo> }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-2">
      {rows.map((m) => (
        <li key={m.code} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-slate-800">{nutrientName(byCode.get(m.code), m.code)}</span>
          <LevelScale level={m.level} label={levelText(t, m.level)} />
        </li>
      ))}
    </ul>
  );
}

/** One meal (all entries of a slot on a day), shown on its own page: photo, what was eaten, macros, and what it contributes to the micronutrients. */
export function MealDetail({ slot, entries, items, refs, nutrients, rules, person, sodiumTarget, onEditItem, onChanged, onClose }: {
  slot: Slot; entries: MealEntry[]; items: MealItem[]; refs: ReferenceRow[]; nutrients: NutrientInfo[]; rules: Rules; person: Person | null; sodiumTarget: number | null;
  onEditItem: (i: MealItem) => void; onChanged: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const byCode = useMemo(() => new Map(nutrients.map((n) => [n.code, n])), [nutrients]);
  const total = useMemo(() => sumNutrients(items), [items]);
  const micros = useMemo(() => (person && !microRulesMissing(rules).length ? mealMicros(items, refs, person, rules, sodiumTarget ? { sodium: sodiumTarget } : {}) : []), [items, refs, person, rules, sodiumTarget]);
  const shown = micros.filter((m) => m.level === 'much' || m.level === 'some' || m.level === 'little').sort((a, b) => b.pct - a.pct);
  const hardly = micros.filter((m) => m.level === 'none');
  const energy = (total.kcal ?? 0) || 1;
  const split = [
    [t('food.macro.carbs'), ((total.carbs_g ?? 0) * 4) / energy, 'bg-brand'],
    [t('food.macro.protein'), ((total.protein_g ?? 0) * 4) / energy, 'bg-sky-500'],
    [t('food.macro.fat'), ((total.fat_g ?? 0) * 9) / energy, 'bg-violet-500'],
  ] as const;

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      for (const e of entries.filter((x) => x.photo_path)) {
        const u = await napi.mealPhotoUrl(e.photo_path!).catch(() => null);
        if (u) urls.push(u);
      }
      if (alive) setPhotos(urls);
    })();
    return () => { alive = false; };
  }, [entries]);

  const remove = async () => {
    if (!window.confirm(t('food.meal.confirmDelete', { slot: slotLabel(slot) }))) return;
    setBusy(true);
    try {
      await napi.deleteMeals(entries);
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const names = entries.map((e) => e.name).filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {!!photos.length && (
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((u) => <img key={u} src={u} alt={t('food.meal.photo')} className="h-40 w-40 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />)}
          </div>
        )}
        {!!names.length && <p className="text-sm font-medium text-slate-700">{names.join(' · ')}</p>}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('food.meal.items', { n: items.length })}</h3>
          <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onEditItem(i)} className="flex w-full items-center justify-between gap-3 bg-white px-3.5 py-2.5 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900">{i.name}</span>
                    <span className="block text-xs text-slate-500">
                      {amountText(i.amount, i.unit_label, i.grams, fmt) || t('food.quick.short')}
                      {' · '}{t('food.macros.short', { c: fmt(i.carbs_g), p: fmt(i.protein_g), f: fmt(i.fat_g) })}
                      {i.source === 'ai_estimate' && <span className="ml-1 text-amber-600">· {t('food.source.ai')}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">{fmt(i.kcal)} kcal</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('food.meal.macros')}</h3>
          <NutrientLine n={total} />
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={t('food.meal.split')}>
            {split.map(([label, share, color]) => <div key={label} className={color} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {split.map(([label, share, color]) => <span key={label} className="flex items-center gap-1"><span className={cx('h-2 w-2 rounded-full', color)} />{label} {fmt(share * 100)} %</span>)}
            {total.fiber_g ? <span>{t('food.meal.fiber', { g: fmt(total.fiber_g, 1) })}</span> : null}
          </div>
        </section>

        {person && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900">{t('food.meal.micros')}</h3>
            <p className="mb-2 text-xs text-slate-500">{t('food.meal.microsHint')}</p>
            {shown.length ? (
              <ul className="space-y-2">
                {shown.map((m) => (
                  <li key={m.code} className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-slate-800">{nutrientName(byCode.get(m.code), m.code)}</span>
                    <span className="flex items-center gap-2">
                      <span className="flex gap-0.5">{[1, 2, 3].map((k) => <span key={k} className={cx('h-2 w-5 rounded-full', k <= MEAL_STEPS[m.level] ? 'bg-emerald-500' : 'bg-slate-200')} />)}</span>
                      <span className="w-14 text-xs font-medium text-slate-700">{t(`food.mlevel.${m.level}` as MsgKey)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">{t('food.meal.noMicros')}</p>}
            {!!hardly.length && <p className="mt-2 text-xs text-slate-500">{t('food.meal.hardly', { list: hardly.map((m) => nutrientName(byCode.get(m.code), m.code)).join(', ') })}</p>}
            {micros.some((m) => m.level === 'unknown') && <p className="mt-1 text-[11px] text-slate-400">{t('food.meal.unknown', { list: micros.filter((m) => m.level === 'unknown').map((m) => nutrientName(byCode.get(m.code), m.code)).join(', ') })}</p>}
          </section>
        )}

        <Button variant="ghost" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={remove} loading={busy}>{t('food.meal.delete')}</Button>
      </div>
    </div>
  );
}
