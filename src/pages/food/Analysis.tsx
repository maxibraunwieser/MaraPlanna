// Looking back: eaten against the targets per day (7 or 28 days), averages over the days with a diary, energy availability
// and the weight trend (smoothed, so one salty dinner does not look like a kilo).

import { useEffect, useMemo, useState } from 'react';
import { Scale, Trash2 } from 'lucide-react';
import { Button, Card, CardTitle, Field, Input, Notice, PageHeader, Segmented, Spinner, useToast } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { addDays } from '../../lib/planner/dates';
import { fmtDate } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import * as napi from '../../lib/nutrition/api';
import type { MealItem } from '../../../supabase/functions/_shared/nutrition/items';
import type { Rules } from '../../../supabase/functions/_shared/nutrition/targets';
import { eatenOn, energyCheck, fmt } from './parts';

/** Exponentially smoothed weights (like a trend line of a scale app). */
export function weightTrend(entries: { date: string; weight_kg: number }[], alpha = 0.35): { date: string; raw: number; trend: number }[] {
  const out: { date: string; raw: number; trend: number }[] = [];
  for (const e of entries) {
    const prev = out.at(-1)?.trend;
    out.push({ date: e.date, raw: e.weight_kg, trend: prev === undefined ? e.weight_kg : prev + alpha * (e.weight_kg - prev) });
  }
  return out;
}

export function Analysis() {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const { today } = useData();
  const [days, setDays] = useState<7 | 28>(7);
  const [data, setData] = useState<{ targets: napi.TargetRow[]; items: MealItem[]; weights: napi.WeightEntry[]; rules: Rules; profile: napi.NutritionProfile | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState('');

  const load = async () => {
    try {
      const from = addDays(today, -(days - 1));
      const profile = await napi.fetchNutritionProfile(user!.id);
      const [diary, weights, ruleRows, targets] = await Promise.all([
        napi.fetchDiary(user!.id, from, today),
        napi.fetchWeights(user!.id, addDays(today, -120)),
        supabase.from('nutrition_rules').select('key, value'),
        profile ? napi.fetchTargets(from, today, today).catch(() => [] as napi.TargetRow[]) : Promise.resolve([] as napi.TargetRow[]),
      ]);
      const rules: Rules = Object.fromEntries(((ruleRows.data ?? []) as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
      setData({ targets, items: diary.items, weights, rules, profile });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { setData(null); void load(); }, [days, user, today]);

  const rows = useMemo(() => (data?.targets ?? []).map((tg) => {
    const eaten = eatenOn(data!.items, tg.date);
    const logged = data!.items.filter((i) => i.date === tg.date).length > 0;
    return { date: tg.date, target: tg, eaten, logged };
  }), [data]);
  const logged = rows.filter((r) => r.logged && r.date < today);
  const avg = (f: (r: (typeof rows)[number]) => number) => (logged.length ? logged.reduce((m, r) => m + f(r), 0) / logged.length : 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.target.kcal, r.eaten.kcal ?? 0)));
  const ea = data ? energyCheck({ items: data.items, targets: data.targets, rules: data.rules }, today) : null;
  const trend = weightTrend(data?.weights ?? []);

  return (
    <div className="space-y-5">
      <PageHeader title={t('food.title')} subtitle={t('food.an.subtitle')} actions={
        <div className="w-44"><Segmented value={days} onChange={setDays} options={[{ value: 7, label: t('food.an.7') }, { value: 28, label: t('food.an.28') }]} /></div>
      } />
      {error && <Notice tone="error">{error}</Notice>}
      {!data ? <Spinner /> : !data.profile ? <Notice tone="info">{t('food.week.noProfile')}</Notice> : (
        <>
          <Card>
            <CardTitle>{t('food.an.energy')}</CardTitle>
            <div className="flex h-40 items-end gap-1" role="img" aria-label={t('food.an.energy')}>
              {rows.map((r) => (
                <div key={r.date} className="relative flex h-full flex-1 flex-col justify-end" title={`${fmtDate(r.date)}: ${fmt(r.eaten.kcal ?? 0)} / ${fmt(r.target.kcal)} kcal`}>
                  <div className="absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${(r.target.kcal / max) * 100}%` }} />
                  <div className={`rounded-t-md ${r.logged ? 'bg-brand' : 'bg-slate-200'}`} style={{ height: `${((r.eaten.kcal ?? 0) / max) * 100}%`, minHeight: 2 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{fmtDate(rows[0]?.date ?? today, { day: 'numeric', month: 'short' })}</span>
              <span>{t('food.an.legend')}</span>
              <span>{fmtDate(today, { day: 'numeric', month: 'short' })}</span>
            </div>
          </Card>

          <Card>
            <CardTitle>{t('food.an.avg', { n: logged.length })}</CardTitle>
            {logged.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ['kcal', avg((r) => r.eaten.kcal ?? 0), avg((r) => r.target.kcal), ''],
                  [t('food.macro.carbs'), avg((r) => r.eaten.carbs_g ?? 0), avg((r) => r.target.carbs_g), ' g'],
                  [t('food.macro.protein'), avg((r) => r.eaten.protein_g ?? 0), avg((r) => r.target.protein_g), ' g'],
                  [t('food.macro.fat'), avg((r) => r.eaten.fat_g ?? 0), avg((r) => r.target.fat_g), ' g'],
                ] as const).map(([label, v, tg, unit]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-lg font-semibold tabular-nums text-slate-900">{fmt(v)}{unit}</div>
                    <div className="text-xs text-slate-500">{t('food.an.ofTarget', { pct: fmt(tg ? (v / tg) * 100 : 0), target: `${fmt(tg)}${unit}` })}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">{t('food.an.noDays')}</p>}
            {ea && ea.judged > 0 && (
              <p className="mt-3 text-xs text-slate-500">{ea.low ? t('food.ea.text', { days: ea.lowDays, judged: ea.judged }) : t('food.ea.ok', { judged: ea.judged })}</p>
            )}
          </Card>

          <Card>
            <CardTitle icon={<Scale className="h-4 w-4 text-slate-500" />}>{t('food.an.weight')}</CardTitle>
            {trend.length >= 2 ? (
              <WeightChart points={trend} />
            ) : <p className="text-sm text-slate-500">{t('food.an.weight.few')}</p>}
            {trend.length > 0 && (
              <p className="mt-2 text-sm text-slate-700">
                {t('food.an.weight.trend', { kg: fmt(trend.at(-1)!.trend, 1) })}
                {trend.length >= 2 && ` · ${t('food.an.weight.change', { kg: `${trend.at(-1)!.trend - trend[0].trend >= 0 ? '+' : ''}${fmt(trend.at(-1)!.trend - trend[0].trend, 1)}`, since: fmtDate(trend[0].date, { day: 'numeric', month: 'short' }) })}`}
              </p>
            )}
            <div className="mt-4 flex items-end gap-2">
              <Field label={t('food.an.weight.today')} className="w-40"><Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" /></Field>
              <Button disabled={!(Number(weight.replace(',', '.')) >= 30)} onClick={async () => {
                try { await napi.saveWeight(user!.id, today, Number(weight.replace(',', '.')), null); setWeight(''); await load(); } catch (e) { toast((e as Error).message, 'error'); }
              }}>{t('food.save')}</Button>
            </div>
            {!!data.weights.length && (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {[...data.weights].reverse().slice(0, 5).map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-1.5">
                    <span className="text-slate-600">{fmtDate(w.date)} {w.source === 'garmin' && <span className="text-xs text-slate-400">· Garmin</span>}</span>
                    <span className="flex items-center gap-2 tabular-nums text-slate-900">{fmt(w.weight_kg, 1)} kg
                      {w.source === 'manual' && <button type="button" className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label={t('food.delete')} onClick={async () => { try { await napi.deleteWeight(w.id); await load(); } catch (e) { toast((e as Error).message, 'error'); } }}><Trash2 className="h-3.5 w-3.5" /></button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function WeightChart({ points }: { points: { date: string; raw: number; trend: number }[] }) {
  const w = 600, h = 140, pad = 8;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points.at(-1)!.date) || t0 + 1;
  const vals = points.flatMap((p) => [p.raw, p.trend]);
  const lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
  const x = (d: string) => pad + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label="weight">
      {points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.raw)} r={3.5} className="fill-slate-300" />)}
      <polyline fill="none" strokeWidth={2.5} className="stroke-brand" points={points.map((p) => `${x(p.date)},${y(p.trend)}`).join(' ')} />
    </svg>
  );
}
