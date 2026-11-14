// Nutrition profile: goal, everyday activity, diet, body data the targets need, and manual targets. The same form sets the
// tab up on the first visit and edits it later. Height and birth date stay in the setup answers (one place for body data);
// the weight becomes a weigh-in of today.

import { useEffect, useState } from 'react';
import { Button, Field, Input, Notice, Segmented, Select } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../lib/data';
import { saveProfile } from '../../lib/api';
import * as napi from '../../lib/nutrition/api';

type Form = {
  goal: napi.NutritionProfile['goal'];
  activity: napi.NutritionProfile['activity_level'];
  diet: napi.NutritionProfile['diet'];
  height: string;
  birth: string;
  weight: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

export function NutritionSettings({ userId, profile, onSaved, onCancel, firstTime }: { userId: string; profile: napi.NutritionProfile | null; onSaved: () => void; onCancel?: () => void; firstTime?: boolean }) {
  const { t } = useI18n();
  const data = useData();
  const setup = data.profile?.onboarding?.setup;
  const [weights, setWeights] = useState<napi.WeightEntry[] | null>(null);
  const [form, setForm] = useState<Form>({
    goal: profile?.goal ?? 'maintain',
    activity: profile?.activity_level ?? 'light',
    diet: profile?.diet ?? 'omnivore',
    height: setup?.heightCm ? String(setup.heightCm) : '',
    birth: setup?.birthDate ?? '',
    weight: '',
    kcal: profile?.overrides?.kcal != null ? String(profile.overrides.kcal) : '',
    protein: profile?.overrides?.protein_g != null ? String(profile.overrides.protein_g) : '',
    carbs: profile?.overrides?.carbs_g != null ? String(profile.overrides.carbs_g) : '',
    fat: profile?.overrides?.fat_g != null ? String(profile.overrides.fat_g) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    napi.fetchWeights(userId, '2000-01-01').then((w) => {
      setWeights(w);
      const last = w.at(-1)?.weight_kg ?? (data.connection?.profile as { weightKg?: number } | null)?.weightKg ?? setup?.weightKg ?? null;
      setForm((f) => ({ ...f, weight: f.weight || (last ? String(last) : '') }));
    }).catch(() => setWeights([]));
  }, [userId]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const height = num(form.height);
  const weight = num(form.weight);
  const bodyOk = height !== null && height >= 120 && height <= 230 && /^\d{4}-\d{2}-\d{2}$/.test(form.birth) && weight !== null && weight >= 30 && weight <= 250;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const overrides: napi.NutritionProfile['overrides'] = {};
      for (const [k, v] of [['kcal', form.kcal], ['protein_g', form.protein], ['carbs_g', form.carbs], ['fat_g', form.fat]] as const) {
        const n = num(v);
        if (n !== null && n > 0) overrides[k] = Math.round(n);
      }
      await napi.saveNutritionProfile(userId, { goal: form.goal, activity_level: form.activity, diet: form.diet, overrides });
      if (data.profile?.onboarding && (setup?.heightCm !== height || setup?.birthDate !== form.birth)) {
        const answers = data.profile.onboarding;
        await saveProfile(userId, { onboarding: { ...answers, setup: { ...answers.setup!, heightCm: height, birthDate: form.birth } } });
        await data.reload();
      }
      const last = weights?.at(-1)?.weight_kg;
      if (weight !== null && weight !== last) await napi.saveWeight(userId, data.today, weight, null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {firstTime && <p className="text-sm text-slate-600">{t('food.setup.intro')}</p>}
      <Field label={t('food.set.goal')}>
        <Segmented value={form.goal} onChange={(v) => set({ goal: v })} columns={3} options={[
          { value: 'maintain', label: t('food.goal.maintain'), hint: t('food.goal.maintain.hint') },
          { value: 'lose', label: t('food.goal.lose'), hint: t('food.goal.lose.hint') },
          { value: 'gain', label: t('food.goal.gain'), hint: t('food.goal.gain.hint') },
        ]} />
      </Field>
      <Field label={t('food.set.activity')} hint={t('food.set.activity.hint')}>
        <Segmented value={form.activity} onChange={(v) => set({ activity: v })} columns={2} options={(['sedentary', 'light', 'moderate', 'heavy'] as const).map((a) => ({ value: a, label: t(`food.act.${a}`), hint: t(`food.act.${a}.hint`) }))} />
      </Field>
      <Field label={t('food.set.diet')}>
        <Select value={form.diet} onChange={(e) => set({ diet: e.target.value as Form['diet'] })}>
          {(['omnivore', 'pescetarian', 'vegetarian', 'vegan'] as const).map((d) => <option key={d} value={d}>{t(`food.diet.${d}`)}</option>)}
        </Select>
      </Field>
      <div>
        <div className="mb-1.5 text-sm font-medium text-slate-700">{t('food.set.body')}</div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('food.set.height')}><Input inputMode="numeric" value={form.height} onChange={(e) => set({ height: e.target.value })} /></Field>
          <Field label={t('food.set.birth')}><Input type="date" value={form.birth} onChange={(e) => set({ birth: e.target.value })} /></Field>
          <Field label={t('food.set.weight')}><Input inputMode="decimal" value={form.weight} onChange={(e) => set({ weight: e.target.value })} /></Field>
        </div>
        <p className="mt-1 text-xs text-slate-500">{t('food.set.body.hint')}</p>
      </div>
      {!firstTime && (
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">{t('food.set.overrides')}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="kcal"><Input inputMode="numeric" value={form.kcal} onChange={(e) => set({ kcal: e.target.value })} placeholder={t('food.set.auto')} /></Field>
            <Field label={`${t('food.macro.carbs')} (g)`}><Input inputMode="numeric" value={form.carbs} onChange={(e) => set({ carbs: e.target.value })} placeholder={t('food.set.auto')} /></Field>
            <Field label={`${t('food.macro.protein')} (g)`}><Input inputMode="numeric" value={form.protein} onChange={(e) => set({ protein: e.target.value })} placeholder={t('food.set.auto')} /></Field>
            <Field label={`${t('food.macro.fat')} (g)`}><Input inputMode="numeric" value={form.fat} onChange={(e) => set({ fat: e.target.value })} placeholder={t('food.set.auto')} /></Field>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('food.set.overrides.hint')}</p>
        </div>
      )}
      <Notice tone="info">{t('food.disclaimer')}</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('food.cancel')}</Button>}
        <Button onClick={save} disabled={!bodyOk} loading={busy}>{firstTime ? t('food.setup.start') : t('food.save')}</Button>
      </div>
    </div>
  );
}
