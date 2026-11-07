// "Your everyday life" and the double days of the strength part: minutes per day, breaks, whether a run and a strength session may share a day.

import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Notice } from '../../components/ui';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { weekdayNames } from '../../lib/i18n/dates';
import { ALL_DAYS, DAY_MINUTES } from '../../lib/onboarding/catalog';
import { setMinutes, setStrengthTime } from '../../lib/onboarding/apply';
import type { DoubleOrder, TimeOfDay } from '../../lib/types';
import type { StepApi } from './api';
import { Choice, Chip, Question } from './kit';

const TIMES: TimeOfDay[] = ['morning', 'noon', 'evening'];

export function DayMinutesScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { setup } = s;
  const names = weekdayNames(lang, 'long');
  return (
    <div className="space-y-7">
      <Question label={t('ob.minutes.label')} required hint={t('ob.minutes.hint')} error={s.error('days')}>
        <ul className="space-y-2">
          {ALL_DAYS.map((d) => (
            <li key={d} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <span className="w-28 text-sm font-semibold text-slate-800">{names[d]}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={names[d]}>
                {DAY_MINUTES.map((m) => (
                  <Chip key={m} on={(setup.minutesPerDay[d] ?? null) === m} onClick={() => { s.touch('days'); s.updateAll((x) => setMinutes(x, d, m)); }}>
                    {m === 0 ? t('ob.minutes.zero') : m === 120 ? t('ob.minutes.unlimited') : t('ob.minutes.value', { m })}
                  </Chip>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Question>
      <Question label={t('ob.tod.label')} why={t('week.time.why')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ob.tod.label')}>
          {TIMES.map((x) => (
            <Chip key={x} on={setup.preferredTime === x} onClick={() => s.updateSetup({ preferredTime: x })}>{t(`time.${x}` as MsgKey)}</Chip>
          ))}
          <Chip on={setup.preferredTime === null} onClick={() => s.updateSetup({ preferredTime: null })}>{t('ob.tod.flexible')}</Chip>
        </div>
      </Question>
    </div>
  );
}

const ORDERS: DoubleOrder[] = ['run', 'strength', 'any'];

export function DoubleScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.double.label')}>
        <Choice
          label={t('ob.double.label')}
          columns={2}
          value={setup.doubles}
          onChange={(v) => s.updateAll((m) => setStrengthTime(m, { doubles: v }))}
          options={[
            { value: true, title: t('ob.double.yes'), text: t('ob.double.yes.text') },
            { value: false, title: t('ob.double.no'), text: t('ob.double.no.text') },
          ]}
        />
      </Question>
      {setup.doubles === true && (
        <Question label={t('ob.double.order')}>
          <Choice label={t('ob.double.order')} columns={3} value={setup.doubleOrder} onChange={(v) => s.updateSetup({ doubleOrder: v })} options={ORDERS.map((o) => ({ value: o, title: t(`ob.double.order.${o}` as MsgKey) }))} />
        </Question>
      )}
      <Notice tone="info">{t('ob.double.note')}</Notice>
    </div>
  );
}

export function BreaksScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const set = (i: number, patch: Partial<{ from: string; to: string }>) => s.updateSetup({ breaks: setup.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <div className="space-y-4">
      {setup.breaks.length === 0 && <p className="text-sm text-slate-500">{t('ob.breaks.none')}</p>}
      {setup.breaks.map((b, i) => {
        const err = s.error(`break.${i}`);
        return (
          <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{t('ob.breaks.from')}</span>
                <Input type="date" aria-label={`${t('ob.breaks.from')} ${i + 1}`} value={b.from} onChange={(e) => { s.touch(`break.${i}`); set(i, { from: e.target.value, to: b.to && b.to < e.target.value ? e.target.value : b.to }); }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{t('ob.breaks.to')}</span>
                <Input type="date" aria-label={`${t('ob.breaks.to')} ${i + 1}`} min={b.from || undefined} value={b.to} onChange={(e) => { s.touch(`break.${i}`); set(i, { to: e.target.value }); }} />
              </label>
              <Button variant="ghost" size="sm" aria-label={t('ob.breaks.remove')} onClick={() => s.updateSetup({ breaks: setup.breaks.filter((_, j) => j !== i) })} icon={<Trash2 className="h-4 w-4" />} />
            </div>
            {err && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{err}</p>}
          </div>
        );
      })}
      <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => s.updateSetup({ breaks: [...setup.breaks, { from: '', to: '' }] })}>{t('ob.breaks.add')}</Button>
    </div>
  );
}
