// Blocks 7 and 8: injuries and the health check, then motivation and how the plan adapts.

import { Input, Notice, Textarea } from '../../components/ui';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { PARQ, REGIONS, parqFlagged } from '../../lib/onboarding/catalog';
import type { InjuryArea, Motivation, ParqKey, Pregnancy, Structure } from '../../lib/types';
import type { StepApi } from './api';
import { CheckRow, Choice, Chip, MultiChips, Question, Slider } from './kit';

export function InjuryNowScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <Question label={t('ob.t.injuryNow')} required error={s.error('injuriesNow')}>
        <Choice
          label={t('ob.t.injuryNow')}
          columns={2}
          value={s.setup.injuriesNow}
          onChange={(yes) => {
            s.touch('injuriesNow');
            s.updateSetup(yes ? { injuriesNow: true } : { injuriesNow: false, injuryAreas: [], injuryDetail: {} });
          }}
          options={[
            { value: true, title: t('ob.injury.yes') },
            { value: false, title: t('ob.injury.no') },
          ]}
        />
      </Question>
      <Notice tone="info">{t('ob.injury.disclaimer')}</Notice>
    </div>
  );
}

export function InjuryRegionsScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { a, setup } = s;
  const toggle = (r: InjuryArea) => {
    s.touch('areas');
    const has = setup.injuryAreas.includes(r);
    const detail = { ...setup.injuryDetail };
    if (has) delete detail[r];
    else detail[r] = { severity: 3, since: '' };
    s.updateSetup({ injuryAreas: has ? setup.injuryAreas.filter((x) => x !== r) : [...setup.injuryAreas, r], injuryDetail: detail });
  };
  const put = (r: InjuryArea, patch: Partial<{ severity: number; since: string }>) =>
    s.updateSetup({ injuryDetail: { ...setup.injuryDetail, [r]: { severity: 3, since: '', ...setup.injuryDetail[r], ...patch } } });
  return (
    <div className="space-y-6">
      <Question label={t('ob.injury.regions')} required error={s.error('areas')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ob.injury.regions')}>
          {REGIONS.map((r) => (
            <Chip key={r} on={setup.injuryAreas.includes(r)} onClick={() => toggle(r)}>{t(`injury.${r}` as MsgKey)}</Chip>
          ))}
        </div>
      </Question>
      {setup.injuryAreas.map((r) => {
        const d = setup.injuryDetail[r] ?? { severity: 3, since: '' };
        return (
          <div key={r} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">{t(`injury.${r}` as MsgKey)}</div>
            <Question label={t('ob.injury.severity')} error={s.error(`severity.${r}`)}>
              <Slider label={`${t(`injury.${r}` as MsgKey)}: ${t('ob.injury.severity')}`} min={0} max={10} value={d.severity} display={`${d.severity} / 10`} onChange={(v) => put(r, { severity: v })} />
            </Question>
            <Question label={t('ob.injury.since')}>
              <Input type="date" max={s.today} className="max-w-48" aria-label={`${t(`injury.${r}` as MsgKey)}: ${t('ob.injury.since')}`} value={d.since} onChange={(e) => put(r, { since: e.target.value })} />
            </Question>
          </div>
        );
      })}
      <Question label={t('personal.injuryNote')}>
        <Textarea className="!min-h-20" placeholder={t('personal.injuryNote.ph')} aria-label={t('personal.injuryNote')} value={a.injuries} onChange={(e) => s.update((x) => ({ ...x, injuries: e.target.value.slice(0, 500) }))} />
      </Question>
    </div>
  );
}

export function InjuryPastScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.injury.past')}>
        <MultiChips label={t('ob.injury.past')} values={setup.injuriesPast} onChange={(v) => s.updateSetup({ injuriesPast: v })} options={REGIONS.map((r) => ({ value: r, label: t(`injury.${r}` as MsgKey) }))} />
      </Question>
      <Question label={t('ob.injury.pastNote')} hint={t('ob.optionalQ')}>
        <Input aria-label={t('ob.injury.pastNote')} placeholder={t('ob.injury.pastNote.ph')} maxLength={200} value={setup.injuriesPastNote} onChange={(e) => s.updateSetup({ injuriesPastNote: e.target.value })} />
      </Question>
    </div>
  );
}

export function ParqScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-4">
      {s.error('parq') && <p role="alert" className="text-xs font-medium text-red-600">{s.error('parq')}</p>}
      <ul className="space-y-3">
        {PARQ.map((k: ParqKey) => (
          <li key={k} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
            <span className="min-w-0 flex-1 text-sm text-slate-800">{t(`ob.parq.${k}` as MsgKey)}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t(`ob.parq.${k}` as MsgKey)}>
              <Chip on={setup.parq[k] === true} onClick={() => { s.touch('parq'); s.updateSetup({ parq: { ...setup.parq, [k]: true } }); }}>{t('ob.yes')}</Chip>
              <Chip on={setup.parq[k] === false} onClick={() => { s.touch('parq'); s.updateSetup({ parq: { ...setup.parq, [k]: false } }); }}>{t('ob.no')}</Chip>
            </div>
          </li>
        ))}
      </ul>
      {parqFlagged(setup.parq) && <Notice tone="warn">{t('ob.parq.warn')}</Notice>}
    </div>
  );
}

const PREG: Pregnancy[] = ['yes', 'no', 'none'];

export function PregnancyScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Choice label={t('ob.t.pregnancy')} columns={3} value={s.setup.pregnancy} onChange={(v) => s.updateSetup({ pregnancy: v })} options={PREG.map((v) => ({ value: v, title: t(`ob.preg.${v}` as MsgKey) }))} />
      {s.setup.pregnancy === 'yes' && <Notice tone="info">{t('ob.preg.note')}</Notice>}
    </div>
  );
}

const MOTIVATIONS: Motivation[] = ['health', 'performance', 'looks', 'fun', 'competition', 'routine'];
const STRUCTURES: Structure[] = ['strict', 'flexible'];

export function MotivationScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.motivation.label')}>
        <MultiChips label={t('ob.motivation.label')} values={setup.motivation} onChange={(v) => s.updateSetup({ motivation: v })} options={MOTIVATIONS.map((m) => ({ value: m, label: t(`ob.motivation.${m}` as MsgKey) }))} />
      </Question>
      <Question label={t('ob.structure.label')}>
        <Choice label={t('ob.structure.label')} columns={2} value={setup.structure} onChange={(v) => s.updateSetup({ structure: v })} options={STRUCTURES.map((v) => ({ value: v, title: t(`ob.structure.${v}` as MsgKey), text: t(`ob.structure.${v}.text` as MsgKey) }))} />
      </Question>
    </div>
  );
}

export function AdaptScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const n = setup.notifications;
  const setN = (patch: Partial<typeof n>) => s.updateSetup({ notifications: { ...n, ...patch } });
  return (
    <div className="space-y-6">
      <Question label={t('ob.adapt.label')}>
        <Choice
          label={t('ob.adapt.label')}
          columns={2}
          value={setup.autoAdapt}
          onChange={(v) => s.updateSetup({ autoAdapt: v })}
          options={[
            { value: true, title: t('ob.adapt.auto'), text: t('ob.adapt.auto.text') },
            { value: false, title: t('ob.adapt.ask'), text: t('ob.adapt.ask.text') },
          ]}
        />
      </Question>
      <Question label={t('ob.notify.label')}>
        <div className="space-y-2.5">
          <CheckRow checked={n.reminder} onChange={(v) => setN({ reminder: v })}>{t('ob.notify.reminder')}</CheckRow>
          <CheckRow checked={n.review} onChange={(v) => setN({ review: v })}>{t('ob.notify.review')}</CheckRow>
          {(n.reminder || n.review) && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('ob.notify.time')}</span>
              <Input type="time" className="max-w-36" aria-label={t('ob.notify.time')} value={n.time} onChange={(e) => setN({ time: e.target.value })} />
            </label>
          )}
        </div>
        <Notice tone="info" className="mt-3">{t('ob.notify.note')}</Notice>
      </Question>
    </div>
  );
}
