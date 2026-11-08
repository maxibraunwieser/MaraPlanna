// The dialogs of the workout list: a workout of the person's own (name, exercises, once on a date or as a weekly series), moving
// a planned session (only this one or the whole series) and deleting a workout.

import { useState } from 'react';
import type { Routine, RoutineSchedule } from '../../../supabase/functions/_shared/strength';
import { useI18n } from '../../lib/i18n';
import { weekdayNames } from '../../lib/i18n/dates';
import { weekdayOf } from '../../lib/planner/dates';
import type { WeightUnit } from '../../lib/strengthFormat';
import type { Setup } from '../../lib/strengthPlan';
import { scheduleDates, type MoveScope } from '../../lib/strengthSchedule';
import { localTitle, fmtDate } from '../../lib/format';
import type { PlannedWorkout } from '../../lib/types';
import { Button, Input, Modal, Notice, Segmented, cx } from '../ui';
import { RoutineEditor } from './RoutineEditor';

const newId = (): string => `own-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A workout of the person's own: new (routine null) or one to change. */
export function OwnWorkoutDialog({
  open, routine, setup, unit, today, planEnd, onClose, onSave,
}: {
  open: boolean;
  routine: Routine | null;
  setup: Setup;
  unit: WeightUnit;
  today: string;
  /** Last day of the plan; null without a plan (the workout is kept, nothing is planned). */
  planEnd: string | null;
  onClose: () => void;
  onSave: (r: Routine) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const short = weekdayNames(lang);
  const start: RoutineSchedule = routine?.schedule ?? { mode: 'series', days: [weekdayOf(today)], from: today, until: null };
  const [draft, setDraft] = useState<Routine>(routine ?? { id: newId(), name: '', exercises: [], by: 'own', updatedAt: null });
  const [mode, setMode] = useState<'once' | 'series'>(start.mode);
  const [date, setDate] = useState(start.mode === 'once' ? start.date : today);
  const [days, setDays] = useState<number[]>(start.mode === 'series' ? start.days : [weekdayOf(today)]);
  const [from, setFrom] = useState(start.mode === 'series' ? start.from : today);
  const [until, setUntil] = useState<string>(start.mode === 'series' ? (start.until ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedule: RoutineSchedule = mode === 'once' ? { mode, date } : { mode, days: [...days].sort(), from, until: until || null };
  const count = planEnd ? scheduleDates(schedule, today, planEnd).length : 0;
  const name = (draft.name ?? '').trim();
  const problem = !name
    ? t('ow.err.name')
    : !draft.exercises.length
      ? t('ow.err.exercises')
      : mode === 'series' && !days.length
        ? t('ow.err.days')
        : mode === 'once' && date < today
          ? t('ow.err.past')
          : null;

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name, schedule });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide open={open} onClose={onClose} title={routine ? t('ow.editTitle') : t('ow.newTitle')}>
      <div className="space-y-5" data-testid="own-workout">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-900">{t('ow.name')}</span>
          <Input value={draft.name ?? ''} maxLength={50} placeholder={t('ow.name.ph')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label={t('ow.name')} />
        </label>

        <div>
          <div className="mb-1 text-sm font-semibold text-slate-900">{t('ow.exercises')}</div>
          <RoutineEditor routine={draft} type={null} setup={setup} unit={unit} suggestible={false} onChange={(r) => setDraft({ ...r, name: draft.name, id: draft.id })} />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-900">{t('ow.when')}</div>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'once' as const, label: t('ow.once') }, { value: 'series' as const, label: t('ow.series') }]} />
          {mode === 'once' ? (
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-medium text-slate-500">{t('ow.date')}</span>
              <Input type="date" value={date} min={today} max={planEnd ?? undefined} onChange={(e) => setDate(e.target.value)} aria-label={t('ow.date')} />
            </label>
          ) : (
            <div className="space-y-3">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-500">{t('ow.days')}</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ow.days')}>
                  {DAYS.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                        className={cx('min-w-11 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 transition', on ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-700 ring-slate-300 hover:ring-slate-400')}
                      >
                        {short[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">{t('ow.from')}</span>
                  <Input type="date" value={from} min={today} max={planEnd ?? undefined} onChange={(e) => setFrom(e.target.value || today)} aria-label={t('ow.from')} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">{t('ow.until')}</span>
                  <Input type="date" value={until} min={from} max={planEnd ?? undefined} onChange={(e) => setUntil(e.target.value)} aria-label={t('ow.until')} />
                </label>
              </div>
            </div>
          )}
          {planEnd ? (
            <p className="text-xs text-slate-500" data-testid="own-count">{count === 1 ? t('ow.count1') : t('ow.count', { n: count })}</p>
          ) : (
            <Notice tone="info">{t('ow.noPlan')}</Notice>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('wt.cancel')}</Button>
          <Button loading={busy} onClick={save}>{t('wt.saveWorkout')}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** A planned session on another date: only this one, or this one and every later one of its series. */
export function MoveDialog({
  w, today, planEnd, series, onClose, onSave,
}: {
  w: PlannedWorkout | null;
  today: string;
  planEnd: string | null;
  /** The session belongs to a series (a planner kind or a weekly workout of the person's own). */
  series: boolean;
  onClose: () => void;
  onSave: (date: string, scope: MoveScope) => Promise<void>;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(w?.date ?? today);
  const [scope, setScope] = useState<MoveScope>('one');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!w) return null;
  const save = async () => {
    if (date < today || (planEnd && date > planEnd)) return setError(t('smv.err.range'));
    setBusy(true);
    setError(null);
    try {
      await onSave(date, scope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${t('smv.title')} · ${localTitle(w.title)}`}>
      <div className="space-y-4" data-testid="move-session">
        <p className="text-sm text-slate-600">{t('smv.now', { date: fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' }) })}</p>
        <label className="block max-w-xs">
          <span className="mb-1 block text-xs font-medium text-slate-500">{t('smv.date')}</span>
          <Input type="date" value={date} min={today} max={planEnd ?? undefined} onChange={(e) => setDate(e.target.value)} aria-label={t('smv.date')} />
        </label>
        {series && (
          <div className="space-y-1.5" role="radiogroup" aria-label={t('smv.scope')}>
            {(['one', 'series'] as const).map((s) => (
              <label key={s} className={cx('flex cursor-pointer items-start gap-2 rounded-xl p-3 ring-1', scope === s ? 'bg-brand-soft ring-brand' : 'ring-slate-200')}>
                <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{t(s === 'one' ? 'smv.one' : 'smv.series')}</span>
                  <span className="block text-xs text-slate-500">{t(s === 'one' ? 'smv.one.text' : 'smv.series.text')}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('wt.cancel')}</Button>
          <Button loading={busy} disabled={date === w.date} onClick={save}>{t('smv.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** "Delete this workout?" with what happens to the plan. */
export function DeleteWorkoutDialog({ name, planned, onClose, onDelete }: { name: string | null; planned: number; onClose: () => void; onDelete: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={name !== null} onClose={onClose} title={t('dw.title', { name: name ?? '' })}>
      <div className="space-y-4" data-testid="delete-workout">
        <p className="text-sm text-slate-600">{planned ? t('dw.text', { n: planned }) : t('dw.textNone')}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('wt.cancel')}</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {t('dw.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
