// Small building blocks of the nutrition tab: progress ring and bars, labels, number formats and the day's data.

import { useCallback, useEffect, useState } from 'react';
import { cx } from '../../components/ui';
import { currentLang, tr, type MsgKey } from '../../lib/i18n';
import { addDays } from '../../lib/planner/dates';
import { supabase } from '../../lib/supabase';
import * as napi from '../../lib/nutrition/api';
import { sumNutrients, type MealEntry, type MealItem, type Nutrients, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { energyAvailability, type DayType, type Rules } from '../../../supabase/functions/_shared/nutrition/targets';
import type { NutrientInfo, ReferenceRow } from '../../../supabase/functions/_shared/nutrition/micros';

export const fmt = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : new Intl.NumberFormat(currentLang() === 'de' ? 'de-AT' : 'en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);

export const dayTypeLabel = (t: DayType | string) => tr(`food.day.${t}` as MsgKey);
export const slotLabel = (s: Slot) => tr(`food.slot.${s}` as MsgKey);
export const DAY_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'orange' | 'blue' | 'violet'> = {
  rest: 'slate', easy: 'green', strength: 'violet', hard: 'orange', long_run: 'red', race: 'red', carb_loading: 'amber',
};

/** Ring of eaten against target; past the target it turns amber instead of growing. */
export function Ring({ value, target, size = 132, stroke = 12, label, sub }: { value: number; target: number; size?: number; stroke?: number; label: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = target > 0 ? value / target : 0;
  const over = share > 1.05;
  const dash = Math.min(1, share) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${fmt(value)} / ${fmt(target)}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} className={cx('transition-[stroke-dasharray] duration-500', over ? 'stroke-amber-500' : 'stroke-brand')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{fmt(value)}</span>
        <span className="text-[11px] text-slate-500">{sub ?? `/ ${fmt(target)}`}</span>
      </div>
    </div>
  );
}

/** A macro: eaten / target in grams with a bar. */
export function MacroBar({ label, value, target, color, range }: { label: string; value: number; target: number; color: string; range?: [number, number] }) {
  const share = target > 0 ? value / target : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-900">
          <span className="font-semibold">{fmt(value)}</span>
          <span className="text-slate-500"> / {fmt(target)} g</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={cx('h-full rounded-full transition-[width] duration-500', share > 1.1 ? 'bg-amber-500' : color)} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      {range && <div className="mt-1 text-[11px] text-slate-500">{tr('food.range', { lo: fmt(range[0]), hi: fmt(range[1]) })}</div>}
    </div>
  );
}

export interface DayData {
  loading: boolean;
  error: string | null;
  /** null = the person has not set up the tab yet */
  profile: napi.NutritionProfile | null;
  targets: napi.TargetRow[];
  targetsError: napi.TargetsUnavailable | null;
  entries: MealEntry[];
  items: MealItem[];
  water: napi.WaterEntry[];
  rules: Rules;
  nutrients: NutrientInfo[];
  refs: ReferenceRow[];
  reload: () => Promise<void>;
}

/** Everything the diary of a day needs: profile, targets of the last 7 days (for the energy check), diary, water, rules. */
export function useNutritionDay(userId: string, date: string, today: string): DayData {
  const [state, setState] = useState<Omit<DayData, 'reload'>>({ loading: true, error: null, profile: null, targets: [], targetsError: null, entries: [], items: [], water: [], rules: {}, nutrients: [], refs: [] });
  const load = useCallback(async () => {
    try {
      const from = addDays(date, -6);
      const [profile, diary, water, ruleRows, nutrientRows, refRows] = await Promise.all([
        napi.fetchNutritionProfile(userId),
        napi.fetchDiary(userId, from, date),
        napi.fetchWater(userId, date, date),
        supabase.from('nutrition_rules').select('key, value'),
        supabase.from('nutrients').select('*').order('sort', { ascending: true }),
        supabase.from('nutrient_references').select('nutrient_code, sex, age_min, age_max, target, upper_limit, athlete_extra_pct'),
      ]);
      const rules: Rules = Object.fromEntries(((ruleRows.data ?? []) as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
      let targets: napi.TargetRow[] = [];
      let targetsError: napi.TargetsUnavailable | null = null;
      if (profile) {
        try {
          targets = await napi.fetchTargets(from, date, today);
        } catch (e) {
          targetsError = e instanceof napi.TargetsUnavailable ? e : new napi.TargetsUnavailable('other', (e as Error).message);
        }
      }
      const nutrients = ((nutrientRows.data ?? []) as NutrientInfo[]).map((n) => ({ ...n, sort: Number(n.sort) }));
      const refs = ((refRows.data ?? []) as ReferenceRow[]).map((r) => ({ ...r, age_min: Number(r.age_min), age_max: r.age_max === null ? null : Number(r.age_max), target: Number(r.target), upper_limit: r.upper_limit === null ? null : Number(r.upper_limit), athlete_extra_pct: Number(r.athlete_extra_pct ?? 0) }));
      setState({ loading: false, error: null, profile, targets, targetsError, entries: diary.entries, items: diary.items, water, rules, nutrients, refs });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [userId, date, today]);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    void load();
  }, [load]);
  return { ...state, reload: load };
}

/** What was eaten on a day. */
export const eatenOn = (items: MealItem[], date: string): Nutrients => sumNutrients(items.filter((i) => i.date === date));

/** Low energy availability over the finished days of the week (only days with a real diary count). */
export function energyCheck(d: Pick<DayData, 'items' | 'targets' | 'rules'>, today: string) {
  const days = d.targets.filter((t) => t.date < today).map((t) => {
    const eaten = eatenOn(d.items, t.date);
    const count = d.items.filter((i) => i.date === t.date).length;
    return { date: t.date, intakeKcal: eaten.kcal ?? 0, trainingKcal: t.basis.training, ffmKg: t.basis.ffmKg, logged: count >= 3 && (eaten.kcal ?? 0) >= 0.4 * t.kcal };
  });
  return energyAvailability(days, d.rules);
}
