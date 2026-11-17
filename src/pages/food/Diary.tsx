// The day: targets that follow the training (type of day, energy, carbohydrate, protein, fat), what was eaten per meal,
// water, and a plain hint when the food does not cover the training over several days.

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Droplets, Plus, Settings2, Trash2, Undo2 } from 'lucide-react';
import { Badge, Button, Card, CardTitle, Field, Input, Modal, Notice, PageHeader, Spinner, cx, useToast } from '../../components/ui';
import { currentLang, useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { addDays } from '../../lib/planner/dates';
import { fmtDay, localTitle } from '../../lib/format';
import * as napi from '../../lib/nutrition/api';
import { SLOTS, slotForHour, type MealItem, type Slot } from '../../../supabase/functions/_shared/nutrition/items';
import { NutritionSettings } from './NutritionSettings';
import { MicroCard } from './Micros';
import { ageOn, type Person } from '../../../supabase/functions/_shared/nutrition/micros';
import { DAY_TONE, MacroBar, Ring, dayTypeLabel, eatenOn, energyCheck, fmt, slotLabel, useNutritionDay } from './parts';

const TRAINING_SLOTS: Slot[] = ['pre_workout', 'during_workout', 'post_workout'];

function Basis({ target }: { target: napi.TargetRow }) {
  const { t } = useI18n();
  const b = target.basis;
  const rows: [string, string][] = [
    [t('food.basis.bmr'), `${fmt(b.bmr)} kcal`],
    [t('food.basis.everyday', { pal: fmt(b.pal, 1) }), `${fmt(b.everyday)} kcal`],
    [b.trainingSource === 'garmin' ? t('food.basis.trainingGarmin') : b.trainingSource === 'mixed' ? t('food.basis.trainingMixed') : t('food.basis.training'), `${fmt(b.training)} kcal`],
  ];
  if (b.expenditureSource === 'garmin_total') rows.push([t('food.basis.garminTotal'), `${fmt(b.expenditure)} kcal`]);
  if (b.adjustment) rows.push([t(`food.basis.adj.${b.adjustmentReason}` as 'food.basis.adj.lose'), `${b.adjustment > 0 ? '+' : ''}${fmt(b.adjustment)} kcal`]);
  return (
    <div className="space-y-2 text-sm">
      <dl className="divide-y divide-slate-200 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-3.5 py-2"><dt className="text-slate-600">{k}</dt><dd className="font-medium tabular-nums text-slate-900">{v}</dd></div>
        ))}
      </dl>
      {b.adjustment === 0 && b.adjustmentReason !== 'none' && <p className="text-xs text-slate-500">{t(`food.basis.adj.${b.adjustmentReason}` as 'food.basis.adj.hard_day')}</p>}
      {b.raisedToFloor && <p className="text-xs text-slate-500">{t('food.basis.floor')}</p>}
      {b.raisedForMacros && <p className="text-xs text-slate-500">{t('food.basis.raised')}</p>}
      {b.hybrid && <p className="text-xs text-slate-500">{t('food.basis.hybrid')}</p>}
      <p className="text-xs text-slate-500">
        {t('food.basis.weight', { kg: fmt(b.weightKg, 1), source: t(`food.basis.weight.${b.weightSource}` as 'food.basis.weight.entry') })}
        {b.overridden.length ? ` · ${t('food.basis.overridden')}` : ''}
      </p>
    </div>
  );
}

export function EditItem({ item, onClose, onChanged }: { item: MealItem; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  // The amount is changed in the unit it was logged in (250 ml, 2 × mittelgroß, 150 g); grams follow.
  const unit = item.amount && item.unit_label ? item.unit_label : 'g';
  const perUnit = item.amount && item.unit_label && item.grams ? item.grams / item.amount : 1;
  const start = unit === 'g' ? item.grams : item.amount;
  const [value, setValue] = useState(String(start ?? '').replace('.', currentLang() === 'de' ? ',' : '.'));
  const [busy, setBusy] = useState(false);
  const v = Number(value.replace(',', '.'));
  const g = v * perUnit;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={item.name}>
      <div className="space-y-4">
        {item.grams ? (
          <Field label={`${t('food.amount')} (${['g', 'ml', 'l'].includes(unit) ? unit : `× ${unit}`})`} hint={unit !== 'g' && g > 0 ? t('food.equals', { g: fmt(g) }) : undefined}>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
        ) : (
          <p className="text-sm text-slate-600">{t('food.quick.noAmount', { kcal: fmt(item.kcal) })}</p>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => run(() => napi.deleteItem(item))} disabled={busy}>{t('food.delete')}</Button>
          {!!item.grams && <Button disabled={!(g > 0) || v === start} loading={busy} onClick={() => run(() => napi.updateItemGrams(item, g, unit === 'g' ? g : v, item.unit_label))}>{t('food.save')}</Button>}
        </div>
      </div>
    </Modal>
  );
}

export function Diary() {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const { today, profile: appProfile } = useData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });
  const day = useNutritionDay(user!.id, date, today);
  const [settings, setSettings] = useState(false);
  const [why, setWhy] = useState(false);
  const [copyFrom, setCopyFrom] = useState<Slot | null>(null);
  // sex and age for the reference values (from the setup answers)
  const person: Person | null = useMemo(() => {
    const a = appProfile?.onboarding;
    const age = ageOn(a?.setup?.birthDate ?? null, date, a?.age ?? null);
    return age === null ? null : { sex: a?.sex === 'male' || a?.sex === 'female' ? a.sex : null, age };
  }, [appProfile, date]);

  const target = day.targets.find((x) => x.date === date) ?? null;
  const eaten = useMemo(() => eatenOn(day.items, date), [day.items, date]);
  const water = day.water.reduce((m, w) => m + w.ml, 0);
  const ea = useMemo(() => energyCheck(day, today), [day, today]);
  const hasTraining = !!target?.basis.sessions.length;
  const slots = SLOTS.filter((s) => !TRAINING_SLOTS.includes(s) || hasTraining || day.items.some((i) => i.date === date && day.entries.find((e) => e.id === i.meal_entry_id)?.slot === s));
  const itemsOf = (slot: Slot) => day.items.filter((i) => i.date === date && day.entries.find((e) => e.id === i.meal_entry_id)?.slot === slot);
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  const header = (
    <PageHeader
      title={t('food.title')}
      subtitle={fmtDay(date, today, { weekday: 'long', day: 'numeric', month: 'long' })}
      actions={
        <div className="flex items-center gap-1">
          <Button variant="dark" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label={t('food.prevDay')}><ChevronLeft className="h-4 w-4" /></Button>
          {date !== today && <Button variant="dark" size="sm" onClick={() => setDate(today)}>{t('food.today')}</Button>}
          <Button variant="dark" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label={t('food.nextDay')}><ChevronRight className="h-4 w-4" /></Button>
          {day.profile && <Button variant="dark" size="sm" onClick={() => setSettings(true)} aria-label={t('food.settings')}><Settings2 className="h-4 w-4" /></Button>}
        </div>
      }
    />
  );

  if (day.loading && !day.profile && !day.error) return <>{header}<Spinner /></>;
  if (day.error) return <>{header}<Notice tone="error">{day.error}</Notice></>;
  if (!day.profile) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <CardTitle>{t('food.setup.title')}</CardTitle>
          <NutritionSettings userId={user!.id} profile={null} firstTime onSaved={() => void day.reload()} />
        </Card>
      </div>
    );
  }

  const copy = async (slot: Slot, from: string) => {
    try {
      const n = await napi.copyMeals(user!.id, from, date, slot);
      toast(n ? t('food.copied', { n }) : t('food.copy.none'), n ? 'success' : 'info');
      setCopyFrom(null);
      await day.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {header}

      {day.targetsError && (
        <Notice tone={day.targetsError.code === 'no_body' ? 'warn' : 'error'}>
          {day.targetsError.message}
          {day.targetsError.code === 'no_body' && <button type="button" className="ml-2 font-semibold underline" onClick={() => setSettings(true)}>{t('food.settings')}</button>}
        </Notice>
      )}

      {target && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={DAY_TONE[target.day_type] ?? 'slate'}>{dayTypeLabel(target.day_type)}</Badge>
            {target.basis.sessions.map((s, i) => (
              <span key={i} className="text-xs text-slate-500">
                {(s.title ? localTitle(s.title) : null) ?? t(`food.session.${s.kind}` as 'food.session.run_easy')}
                {s.km ? ` · ${fmt(s.km, 1)} km` : s.minutes ? ` · ${fmt(s.minutes)} min` : ''}
                {` · ${s.source === 'garmin' ? t('food.session.done') : t('food.session.planned')}`}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <Ring value={eaten.kcal ?? 0} target={target.kcal} label="kcal" sub={t('food.ring.sub', { target: fmt(target.kcal) })} />
            <div className="w-full flex-1 space-y-3">
              <MacroBar label={t('food.macro.carbs')} value={eaten.carbs_g ?? 0} target={target.carbs_g} color="bg-brand" range={target.basis.carbsRange} />
              <MacroBar label={t('food.macro.protein')} value={eaten.protein_g ?? 0} target={target.protein_g} color="bg-sky-500" />
              <MacroBar label={t('food.macro.fat')} value={eaten.fat_g ?? 0} target={target.fat_g} color="bg-violet-500" />
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t('food.fiber', { v: fmt(eaten.fiber_g ?? 0), t: fmt(target.fiber_g) })}</span>
                <span>{t('food.left', { kcal: fmt(Math.max(0, target.kcal - (eaten.kcal ?? 0))) })}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setWhy(!why)} className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800" aria-expanded={why}>
            <ChevronDown className={cx('h-3.5 w-3.5 transition', why && 'rotate-180')} />{t('food.basis.title')}
          </button>
          {why && <div className="mt-3"><Basis target={target} /></div>}
        </Card>
      )}

      <MicroCard items={day.items.filter((i) => i.date === date)} refs={day.refs} nutrients={day.nutrients} rules={day.rules} person={person} sodiumTarget={target?.sodium_mg ?? null} isToday={date === today} />

      {ea.low && (
        <Notice tone="warn">
          <div className="font-semibold">{t('food.ea.title')}</div>
          <div>{t('food.ea.text', { days: ea.lowDays, judged: ea.judged })}</div>
        </Notice>
      )}

      <Card>
        <CardTitle icon={<Droplets className="h-4 w-4 text-sky-500" />} action={
          day.water.length ? <Button variant="ghost" size="sm" icon={<Undo2 className="h-4 w-4" />} onClick={async () => { try { await napi.deleteWater(day.water.at(-1)!.id); await day.reload(); } catch (e) { toast((e as Error).message, 'error'); } }}>{t('food.water.undo')}</Button> : undefined
        }>
          {t('food.water.title')}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{(water / 1000).toLocaleString(currentLang() === 'de' ? 'de-AT' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>
            {target && <span className="text-slate-500"> / {fmt(target.water_ml / 1000, 1)} l</span>}
            {target && target.sodium_mg > 1500 && <div className="text-xs text-slate-500">{t('food.water.sodium', { mg: fmt(target.sodium_mg) })}</div>}
          </div>
          <div className="flex gap-2">
            {[250, 500].map((ml) => (
              <Button key={ml} variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={async () => { try { await napi.addWater(user!.id, date, ml); await day.reload(); } catch (e) { toast((e as Error).message, 'error'); } }}>
                {ml} ml
              </Button>
            ))}
          </div>
        </div>
        {target && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-sky-500 transition-[width] duration-500" style={{ width: `${Math.min(100, (water / target.water_ml) * 100)}%` }} /></div>}
      </Card>

      {slots.map((slot) => {
        const items = itemsOf(slot);
        const sum = items.reduce((m, i) => m + (i.kcal ?? 0), 0);
        return (
          <Card key={slot} className="!p-4">
            <div className="flex items-center justify-between gap-2">
              {items.length ? (
                <button type="button" onClick={() => navigate(`/food/meal?date=${date}&slot=${slot}`)} className="group flex items-center gap-1 text-left text-base font-semibold text-slate-900" aria-label={t('food.meal.open', { slot: slotLabel(slot) })}>
                  {slotLabel(slot)}<ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </button>
              ) : (
                <h2 className="text-base font-semibold text-slate-900">{slotLabel(slot)}</h2>
              )}
              <div className="flex items-center gap-1">
                {!!sum && <span className="mr-1 text-sm tabular-nums text-slate-500">{fmt(sum)} kcal</span>}
                <button type="button" onClick={() => setCopyFrom(slot)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t('food.copy.title', { slot: slotLabel(slot) })}><Copy className="h-4 w-4" /></button>
                <button type="button" onClick={() => navigate(`/food/add?date=${date}&slot=${slot}`)} className="rounded-full bg-brand/10 p-2 text-brand hover:bg-brand/20" aria-label={t('food.addTo', { slot: slotLabel(slot) })}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            {items.length ? (
              <button type="button" onClick={() => navigate(`/food/meal?date=${date}&slot=${slot}`)} className="mt-0.5 block text-left text-xs tabular-nums text-slate-500 hover:text-slate-700">
                {t('food.macros.short', { c: fmt(items.reduce((m, i) => m + (i.carbs_g ?? 0), 0)), p: fmt(items.reduce((m, i) => m + (i.protein_g ?? 0), 0)), f: fmt(items.reduce((m, i) => m + (i.fat_g ?? 0), 0)) })}
              </button>
            ) : (
              <p className="mt-1 text-xs text-slate-400">{t('food.slot.empty')}</p>
            )}
          </Card>
        );
      })}

      <p className="px-1 text-xs text-slate-500">{t('food.disclaimer')}</p>

      <button
        type="button"
        onClick={() => navigate(`/food/add?date=${date}&slot=${slotForHour(date === today ? hour : 12)}`)}
        className="fixed bottom-[calc(var(--fab-bottom,6rem)+4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand shadow-xl shadow-black/30 ring-1 ring-black/5 transition active:scale-95 sm:bottom-24 sm:right-6"
        aria-label={t('food.add')}
      >
        <Plus className="h-7 w-7" />
      </button>

      {copyFrom && (
        <Modal open onClose={() => setCopyFrom(null)} title={t('food.copy.title', { slot: slotLabel(copyFrom) })}>
          <CopyChooser date={date} onCopy={(from) => copy(copyFrom, from)} />
        </Modal>
      )}
      <Modal open={settings} onClose={() => setSettings(false)} title={t('food.settings')} wide>
        {settings && <NutritionSettings userId={user!.id} profile={day.profile} onCancel={() => setSettings(false)} onSaved={() => { setSettings(false); void day.reload(); }} />}
      </Modal>
    </div>
  );
}

function CopyChooser({ date, onCopy }: { date: string; onCopy: (from: string) => void }) {
  const { t } = useI18n();
  const [other, setOther] = useState(addDays(date, -2));
  const lang = currentLang();
  const name = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full justify-start" onClick={() => onCopy(addDays(date, -1))}>{t('food.copy.yesterday', { day: name(addDays(date, -1)) })}</Button>
      <Button variant="secondary" className="w-full justify-start" onClick={() => onCopy(addDays(date, -7))}>{t('food.copy.weekday', { day: name(addDays(date, -7)) })}</Button>
      <div className="flex items-end gap-2 pt-2">
        <Field label={t('food.copy.other')} className="flex-1"><Input type="date" value={other} max={date} onChange={(e) => setOther(e.target.value)} /></Field>
        <Button onClick={() => onCopy(other)} disabled={!other || other === date}>{t('food.copy.do')}</Button>
      </div>
    </div>
  );
}
