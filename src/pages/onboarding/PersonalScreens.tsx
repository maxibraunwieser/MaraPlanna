// Blocks 0 and 1: consent, name and birth date, sex, height / weight / units, everyday life.

import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Input, Notice, Segmented } from '../../components/ui';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { ageFromBirthDate } from '../../lib/hrZones';
import { addDays } from '../../lib/planner/dates';
import { cmToFtIn, cmToMeters, ftInToCm, kgToLb, lbToKg, metersToCm, round1 } from '../../lib/onboarding/units';
import type { DailyActivity, SetupExtras, SleepBand, Units } from '../../lib/types';
import type { StepApi } from './api';
import { CheckRow, Choice, Chip, NumField, Question } from './kit';

export function ConsentScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const c = s.setup.consent;
  const set = (patch: Partial<typeof c>) => {
    const next = { ...c, ...patch };
    s.touch('consent');
    s.updateSetup({ consent: { ...next, at: next.health ? (c.at ?? new Date().toISOString()) : null } });
  };
  return (
    <div className="space-y-4">
      <CheckRow checked={c.health} onChange={(v) => set({ health: v })} required hint={t('ob.consent.health.note')}>{t('ob.consent.health')}</CheckRow>
      {s.error('consent') && <p role="alert" className="text-xs font-medium text-red-600">{s.error('consent')}</p>}
      <CheckRow checked={c.analytics} onChange={(v) => set({ analytics: v })}>{t('ob.consent.analytics')}</CheckRow>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <Link to="/privacy" target="_blank" rel="noreferrer" className="font-medium text-slate-700 underline">{t('ob.consent.privacy')}</Link>
      </p>
    </div>
  );
}

export function NameScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const err = (f: string) => s.error(f);
  const age = ageFromBirthDate(setup.birthDate, s.today);
  return (
    <div className="space-y-6">
      <Question label={t('ob.name.label')} required why={t('personal.name.why')} error={err('name')}>
        <Input
          autoComplete="given-name"
          aria-label={t('personal.name')}
          placeholder={t('personal.name.ph')}
          maxLength={40}
          value={setup.name}
          aria-invalid={!!err('name')}
          onChange={(e) => s.updateSetup({ name: e.target.value })}
          onBlur={() => s.touch('name')}
        />
      </Question>
      <Question label={t('personal.birth')} required why={t('personal.birth.why')} error={err('birthDate')}>
        <Input
          type="date"
          autoComplete="bday"
          aria-label={t('personal.birth')}
          min={addDays(s.today, -92 * 366)}
          max={addDays(s.today, -10 * 365)}
          value={setup.birthDate ?? ''}
          aria-invalid={!!err('birthDate')}
          onChange={(e) => {
            s.touch('birthDate');
            s.updateSetup({ birthDate: e.target.value || null });
          }}
          onBlur={() => s.touch('birthDate')}
        />
      </Question>
      {age !== null && age < 18 && age >= 10 && <Notice tone="warn">{t('ob.birth.minor')}</Notice>}
    </div>
  );
}

const GENDERS: NonNullable<SetupExtras['gender']>[] = ['male', 'female', 'diverse', 'none'];
const SEX_OF: Record<NonNullable<SetupExtras['gender']>, 'male' | 'female' | 'other' | null> = { male: 'male', female: 'female', diverse: 'other', none: null };

export function GenderScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <Question label={t('ob.gender.label')} required why={t('personal.gender.why')} error={s.error('gender')}>
      <Choice
        label={t('ob.gender.label')}
        columns={2}
        value={s.setup.gender}
        onChange={(g) => {
          s.touch('gender');
          s.update((x) => ({ ...x, sex: SEX_OF[g], setup: { ...x.setup!, gender: g } }));
        }}
        options={GENDERS.map((g) => ({ value: g, title: t(`gender.${g}` as MsgKey) }))}
      />
    </Question>
  );
}

/** Units: metric or imperial in one go, or each of distance, weight and height on its own. */
export function UnitsQuestion({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const setDistance = (u: Units) => s.update((x) => ({ ...x, units: u }));
  const preset = (u: Units) => {
    setDistance(u);
    s.updateSetup({ weightUnit: u === 'mi' ? 'lb' : 'kg', heightUnit: u === 'mi' ? 'ft' : 'm' });
  };
  const allMetric = s.units === 'km' && setup.weightUnit === 'kg' && setup.heightUnit === 'm';
  const allImperial = s.units === 'mi' && setup.weightUnit === 'lb' && setup.heightUnit === 'ft';
  return (
      <Question label={t('personal.units')} why={t('personal.units.why')}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip on={allMetric} onClick={() => preset('km')}>{t('units.metric')} · {t('units.metric.hint')}</Chip>
          <Chip on={allImperial} onClick={() => preset('mi')}>{t('units.imperial')} · {t('units.imperial.hint')}</Chip>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">{t('units.distance')}</div>
            <Segmented value={s.units} onChange={setDistance} options={[{ value: 'km' as Units, label: 'km' }, { value: 'mi' as Units, label: 'mi' }]} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">{t('units.weight')}</div>
            <Segmented value={setup.weightUnit} onChange={(u) => s.updateSetup({ weightUnit: u })} options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">{t('units.height')}</div>
            <Segmented value={setup.heightUnit} onChange={(u) => s.updateSetup({ heightUnit: u })} options={[{ value: 'm' as const, label: 'm / cm' }, { value: 'ft' as const, label: 'ft / in' }]} />
          </div>
        </div>
      </Question>
  );
}

export function BodyScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const weightLb = setup.weightUnit === 'lb';
  const err = (f: string) => s.error(f);
  const ftIn = setup.heightCm ? cmToFtIn(setup.heightCm) : { ft: null, inch: null };
  // Metric height is typed as metres and centimetres; "175" in the centimetre field is understood as 1 m 75 cm.
  const mc = setup.heightCm ? cmToMeters(setup.heightCm) : { m: null, cm: null };
  const mShown = setup.heightCm !== null && setup.heightCm >= 100 ? mc.m : null;
  const cmShown = setup.heightCm === null ? null : setup.heightCm >= 100 ? mc.cm : setup.heightCm;

  return (
    <div className="space-y-6">
      <UnitsQuestion s={s} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Question label={t('personal.height')} required why={t('personal.height.why')} error={err('heightCm')}>
          {setup.heightUnit === 'ft' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label={t('unit.ft')}
                suffix="ft"
                value={ftIn.ft}
                invalid={!!err('heightCm')}
                onBlur={() => s.touch('heightCm')}
                onChange={(ft) => s.updateSetup({ heightCm: ft === null && ftIn.inch === null ? null : ftInToCm(ft ?? 0, ftIn.inch ?? 0) })}
              />
              <NumField
                label={t('unit.in')}
                suffix="in"
                value={ftIn.inch}
                invalid={!!err('heightCm')}
                onBlur={() => s.touch('heightCm')}
                onChange={(inch) => s.updateSetup({ heightCm: ftIn.ft === null && inch === null ? null : ftInToCm(ftIn.ft ?? 0, inch ?? 0) })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label={t('unit.m')}
                suffix="m"
                value={mShown}
                invalid={!!err('heightCm')}
                onBlur={() => s.touch('heightCm')}
                onChange={(m) => s.updateSetup({ heightCm: m === null && cmShown === null ? null : metersToCm(m ?? 0, cmShown ?? 0) })}
              />
              <NumField
                label={t('unit.cm')}
                suffix="cm"
                value={cmShown}
                invalid={!!err('heightCm')}
                onBlur={() => s.touch('heightCm')}
                onChange={(c) => s.updateSetup({ heightCm: c === null && mShown === null ? null : metersToCm(mShown ?? 0, c ?? 0) })}
              />
            </div>
          )}
        </Question>

        <Question label={t('personal.weight')} required why={t('personal.weight.why')} error={err('weightKg')}>
          <NumField
            label={t('personal.weight')}
            suffix={weightLb ? 'lb' : 'kg'}
            value={setup.weightKg === null ? null : weightLb ? round1(kgToLb(setup.weightKg)) : setup.weightKg}
            invalid={!!err('weightKg')}
            onBlur={() => s.touch('weightKg')}
            onChange={(v) =>
              s.updateSetup({
                weightKg: v === null ? null : weightLb ? Math.round(lbToKg(v) * 10) / 10 : v,
                fromGarmin: setup.fromGarmin.filter((f) => f !== 'weightKg'),
              })
            }
          />
        </Question>
      </div>

      <Question label={t('ob.fat.label')} hint={t('ob.fat.hint')} error={err('bodyFat')}>
        <NumField className="max-w-40" label={t('ob.fat.label')} suffix="%" value={setup.bodyFatPct} invalid={!!err('bodyFat')} onBlur={() => s.touch('bodyFat')} onChange={(v) => s.updateSetup({ bodyFatPct: v })} />
      </Question>
    </div>
  );
}

const ACTIVITY: DailyActivity[] = ['sitting', 'mixed', 'standing', 'heavy'];
const SLEEP: SleepBand[] = ['lt6', 'h6to7', 'h7to8', 'gt8'];

export function LifestyleScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Question label={t('ob.activity.label')}>
        <Choice label={t('ob.activity.label')} columns={2} value={s.setup.dailyActivity} onChange={(v) => s.updateSetup({ dailyActivity: v })} options={ACTIVITY.map((v) => ({ value: v, title: t(`ob.activity.${v}` as MsgKey) }))} />
      </Question>
      <Question label={t('ob.sleep.label')}>
        <Choice label={t('ob.sleep.label')} columns={2} value={s.setup.sleep} onChange={(v) => s.updateSetup({ sleep: v })} options={SLEEP.map((v) => ({ value: v, title: t(`ob.sleep.${v}` as MsgKey) }))} />
      </Question>
    </div>
  );
}
