// Block 3: do you have a Garmin watch, which data may we read, connect (or go on by hand), and "is this right?".

import { useEffect, useState } from 'react';
import { Loader2, PencilLine, RefreshCw, ShieldCheck, Watch } from 'lucide-react';
import { Badge, Button, Input, Notice } from '../../components/ui';
import { useData } from '../../lib/data';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateText } from '../../lib/i18n/dates';
import { applyGarmin, readGarmin, type GarminField } from '../../lib/onboarding/garmin';
import { clearGarminValues } from '../../lib/onboarding/apply';
import { fmtDuration, fmtNum } from '../../lib/format';
import { kgToLb } from '../../lib/onboarding/units';
import type { GarminScope } from '../../lib/types';
import { GarminKeyForm } from '../ConnectGarmin';
import type { StepApi } from './api';
import { CheckRow, Choice, MultiChips, OptionCard, Question, SourceBadge } from './kit';

const SCOPES: GarminScope[] = ['activities', 'heart', 'sleep', 'weight', 'status'];

export function HasGarminScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.t.hasGarmin')} required error={s.error('hasGarmin')}>
        <Choice
          label={t('ob.t.hasGarmin')}
          columns={2}
          value={setup.hasGarmin}
          onChange={(yes) => {
            s.touch('hasGarmin');
            s.update((x) => ({ ...x, setup: { ...x.setup!, hasGarmin: yes, garmin: yes ? (x.setup!.garmin === 'manual' ? null : x.setup!.garmin) : 'manual' } }));
          }}
          options={[
            { value: true, icon: <Watch className="h-5 w-5" />, title: t('ob.garmin.has.yes'), text: t('ob.garmin.has.yes.text') },
            { value: false, icon: <PencilLine className="h-5 w-5" />, title: t('ob.garmin.has.no'), text: t('ob.garmin.has.no.text') },
          ]}
        />
      </Question>
      {setup.hasGarmin === true && (
        <Question label={t('ob.garmin.model')}>
          <Input aria-label={t('ob.garmin.model')} placeholder={t('ob.garmin.model.ph')} maxLength={40} value={setup.garminModel} onChange={(e) => s.updateSetup({ garminModel: e.target.value })} />
        </Question>
      )}
      {setup.hasGarmin === false && <Notice tone="info">{t('ob.garmin.skipped')}</Notice>}
    </div>
  );
}

type Phase = 'choose' | 'connect' | 'importing' | 'done' | 'error';

export function GarminConnectScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { connection, activities, metrics, reload, today } = useData();
  const connected = connection?.status === 'connected';
  const [phase, setPhase] = useState<Phase>(s.setup.garmin === 'connected' && connected ? 'done' : connected && s.setup.garmin === null ? 'importing' : 'choose');
  const [checked, setChecked] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  // Read what Garmin has once the data of the connection is loaded (only what the person allowed).
  useEffect(() => {
    if (phase !== 'importing') return;
    if (connected) {
      s.update((a) => applyGarmin(a, readGarmin({ connection, activities, metrics, today, scopes: a.setup!.garminScopes })));
      setFresh(true);
      setPhase('done');
    } else if (checked > 0) {
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, checked, connected, connection, activities, metrics]);

  // Right after the import the person is taken to the review (the answers have been updated by then).
  useEffect(() => {
    if (phase === 'done' && fresh && s.setup.garmin === 'connected') s.next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fresh, s.setup.garmin]);

  const onConnected = async () => {
    setPhase('importing');
    setLoadError(null);
    try {
      await reload();
    } catch (e) {
      setLoadError((e as Error).message);
    }
    setChecked((c) => c + 1);
  };
  const manual = () => s.skip();

  if (phase === 'importing') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <div className="text-sm font-semibold text-slate-800">{t('garmin.loading')}</div>
        <div className="text-xs text-slate-500">{t('garmin.loading.text')}</div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <Notice tone="error">
          <div className="font-semibold">{t('garmin.error')}</div>
          <div className="mt-0.5">{loadError ?? t('garmin.error.text')}</div>
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => setPhase('connect')}>{t('garmin.retry')}</Button>
          <Button variant="secondary" onClick={manual}>{t('garmin.continueManual')}</Button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          <div className="font-semibold">{t('garmin.done')}</div>
          <div className="mt-0.5">{t('garmin.disconnect')}</div>
        </Notice>
        <Button variant="ghost" size="sm" onClick={() => { s.updateSetup({ garmin: null }); setFresh(false); setPhase('choose'); }}>{t('garmin.change')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Question label={t('ob.garmin.scopes')} hint={t('ob.garmin.scopes.note')}>
        <MultiChips label={t('ob.garmin.scopes')} values={s.setup.garminScopes} onChange={(v) => s.updateSetup({ garminScopes: v })} options={SCOPES.map((x) => ({ value: x, label: t(`ob.garmin.scope.${x}` as MsgKey) }))} />
      </Question>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('ob.t.garminConnect')}>
        <OptionCard on={phase === 'connect'} onClick={() => setPhase('connect')} icon={<Watch className="h-5 w-5" />} title={t('garmin.connect')} text={t('garmin.connect.text')} />
        <OptionCard on={false} onClick={manual} icon={<PencilLine className="h-5 w-5" />} title={t('garmin.manual')} text={t('garmin.manual.text')} />
      </div>
      {phase === 'connect' && (
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <GarminKeyForm onConnected={() => void onConnected()} />
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={manual}>{t('garmin.manual')}</Button>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        {t('garmin.privacy')}
      </p>
    </div>
  );
}

const ROWS: { field: GarminField; label: MsgKey }[] = [
  { field: 'restingHr', label: 'garmin.row.resting' },
  { field: 'maxHr', label: 'garmin.row.max' },
  { field: 'weightKg', label: 'garmin.row.weight' },
  { field: 'weeklyKm', label: 'garmin.row.weekly' },
  { field: 'runsNow', label: 'garmin.row.runs' },
  { field: 'longest', label: 'garmin.row.longest' },
  { field: 'vo2max', label: 'garmin.row.vo2' },
];

/** "Is this right?": what Garmin filled in, a question where it differs from what the person typed, and the watch wishes. */
export function GarminReviewScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { connection, activities, metrics, today } = useData();
  const { setup } = s;
  const [keptMine, setKeptMine] = useState(false);
  const imp = readGarmin({ connection, activities, metrics, today, scopes: setup.garminScopes });
  const profile = setup.garminScopes.includes('status') ? (connection?.profile ?? null) : null;
  const imperial = s.units === 'mi';
  const weightLb = setup.weightUnit === 'lb';
  const kg = (v: number) => (weightLb ? `${fmtNum(kgToLb(v))} lb` : `${fmtNum(v)} kg`);
  const value = (f: GarminField): string | null => {
    const v = imp.values[f];
    if (v === undefined) return null;
    switch (f) {
      case 'restingHr': case 'maxHr': return `${v} bpm`;
      case 'weightKg': return kg(v);
      case 'weeklyKm': case 'longest': return imperial ? `${fmtNum(v / 1.609344)} mi` : `${fmtNum(v)} km`;
      case 'runsNow': return `${v}×`;
      case 'vo2max': return fmtNum(v);
    }
  };
  const garminWeight = imp.values.weightKg;
  const conflict = !keptMine && garminWeight !== undefined && setup.weightKg !== null && !setup.fromGarmin.includes('weightKg') && Math.abs(garminWeight - setup.weightKg) >= 0.1;
  const missing = ROWS.filter((r) => imp.values[r.field] === undefined && r.field !== 'vo2max');
  const synced = setup.hrSyncedAt ? dateText(setup.hrSyncedAt, lang) : '–';

  return (
    <div className="space-y-5">
      <Notice tone="success">
        <div className="font-semibold">{imp.runCount > 0 ? t('ob.garmin.found', { n: imp.runCount }) : t('ob.garmin.found.none')}</div>
        <div className="mt-0.5">{t('garmin.done.text', { date: synced })}</div>
      </Notice>

      <dl className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {ROWS.map((r) => {
          const v = value(r.field);
          if (!v && r.field === 'vo2max') return null;
          return (
            <div key={r.field} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <dt className="text-slate-600">{t(r.label)}</dt>
              <dd className="flex items-center gap-2">
                {v ? (
                  <>
                    {r.field === 'weightKg' && setup.weightKg !== null && !setup.fromGarmin.includes('weightKg') && (
                      <span className="text-xs text-slate-400">{t('garmin.weight.kept', { value: kg(setup.weightKg) })}</span>
                    )}
                    <span className="font-semibold tabular-nums text-slate-900">{v}</span>
                    <SourceBadge source="garmin" />
                  </>
                ) : (
                  <span className="text-xs text-slate-400">{t('garmin.row.none')}</span>
                )}
              </dd>
            </div>
          );
        })}
        {profile?.lthr ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-slate-600">{t('garmin.row.lthr')}</dt>
            <dd className="flex items-center gap-2"><span className="font-semibold tabular-nums">{profile.lthr} bpm</span><SourceBadge source="garmin" /></dd>
          </div>
        ) : null}
        {profile?.zones && profile.zones.length >= 5 ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-slate-600">{t('garmin.row.zones')}</dt>
            <dd className="flex items-center gap-2"><span className="text-xs tabular-nums text-slate-700">{profile.zones.slice(0, 5).join(' · ')}</span><SourceBadge source="garmin" /></dd>
          </div>
        ) : null}
        {profile?.racePredictions && Object.keys(profile.racePredictions).length ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-slate-600">{t('garmin.row.predictions')}</dt>
            <dd className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {(['5k', '10k', 'half', 'marathon'] as const).filter((k) => profile.racePredictions?.[k]).map((k) => (
                <span key={k} className="text-xs tabular-nums text-slate-700">{t(`race.${k}` as MsgKey)} {fmtDuration(profile.racePredictions![k]!)}</span>
              ))}
              <SourceBadge source="garmin" />
            </dd>
          </div>
        ) : null}
      </dl>

      {conflict && garminWeight !== undefined && setup.weightKg !== null && (
        <Notice tone="warn">
          <div className="font-semibold">{t('ob.garmin.weight.conflict', { mine: kg(setup.weightKg), theirs: kg(garminWeight) })}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setKeptMine(true)}>{t('ob.garmin.weight.mine', { mine: kg(setup.weightKg) })}</Button>
            <Button size="sm" onClick={() => s.update((x) => ({ ...x, setup: { ...x.setup!, weightKg: garminWeight, fromGarmin: [...new Set([...x.setup!.fromGarmin, 'weightKg'])] } }))}>{t('ob.garmin.weight.theirs', { theirs: kg(garminWeight) })}</Button>
          </div>
        </Notice>
      )}

      {missing.length > 0 && <Notice tone="info">{t('garmin.missing', { list: missing.map((m) => t(m.label).toLowerCase()).join(', ') })}</Notice>}
      <p className="text-xs text-slate-500">{t('garmin.editable')}</p>

      <div>
        <Button variant="secondary" size="sm" onClick={() => { s.update(clearGarminValues); }} disabled={setup.fromGarmin.length === 0}>{t('ob.garmin.own')}</Button>
      </div>

      <CheckRow checked={setup.garminPush} onChange={(v) => s.updateSetup({ garminPush: v })} hint={t('ob.garmin.push.text')}>
        <span className="inline-flex flex-wrap items-center gap-2">{t('ob.garmin.push')}<Badge tone="violet">{t('ob.garmin.soon')}</Badge></span>
      </CheckRow>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        {t('garmin.privacy')} {t('garmin.disconnect')}
      </p>
    </div>
  );
}
