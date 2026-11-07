import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Timer, TrendingUp, X } from 'lucide-react';
import type { RoutineExercise } from '../../../supabase/functions/_shared/strength';
import { exerciseProgress, progressionHint, repRange, type SetRow } from '../../lib/strengthStats';
import { toSetRows, type LoggedExercise, type StrengthSetInsert } from '../../lib/strengthLog';
import { ExerciseThumb } from './ExerciseImage';
import { exName, parseWeight, repsLabel, weightInput, weightText, type WeightUnit } from '../../lib/strengthFormat';
import { fmtDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Button, cx, Input, Modal, Notice } from '../ui';

interface SetState {
  kg: string;
  reps: string;
  done: boolean;
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Track a workout: for every exercise the planned sets with weight and repetitions to fill in, what happened last time and
 * what to try now. Ticking a set starts the rest timer; finishing saves the ticked sets.
 */
export function Logger({
  open,
  onClose,
  title,
  date,
  workoutId,
  exercises,
  history,
  unit,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  date: string;
  /** Planned session this belongs to (it counts as completed); null for a free workout. */
  workoutId: string | null;
  exercises: RoutineExercise[];
  history: SetRow[];
  unit: WeightUnit;
  onSave: (rows: StrengthSetInsert[], workoutId: string | null) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const step = unit === 'lb' ? 5 : 2.5;
  // What each exercise starts with: the plan's repetitions, and a weight from the last time (with a hint) or the plan.
  const initial = useMemo(
    () =>
      exercises.map((x) => {
        const last = exerciseProgress(history, x.name.toLowerCase()).at(-1);
        const hint = progressionHint(last, x.reps, unit === 'lb' ? 2.268 : 2.5);
        const range = repRange(x.reps);
        const kg = hint?.kg ?? last?.topKg ?? x.kg ?? null;
        return {
          last,
          hint,
          sets: Array.from({ length: x.sets }, (): SetState => ({ kg: weightInput(kg, unit), reps: range ? String(range[1]) : '', done: false })),
        };
      }),
    [exercises, history, unit, lang],
  );
  const [sets, setSets] = useState<SetState[][]>(() => initial.map((i) => i.sets));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const startedAt = useRef(new Date());

  useEffect(() => {
    setSets(initial.map((i) => i.sets));
    setError(null);
    setRest(null);
    startedAt.current = new Date();
  }, [initial, open]);

  // Rest timer: counts down once a set is ticked.
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      setRest(null);
      return;
    }
    const t = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const patch = (i: number, j: number, p: Partial<SetState>) => setSets((all) => all.map((list, a) => (a === i ? list.map((s, b) => (b === j ? { ...s, ...p } : s)) : list)));
  const toggle = (i: number, j: number) => {
    const s = sets[i][j];
    patch(i, j, { done: !s.done });
    if (!s.done) setRest(exercises[i].sets >= 4 || /^\d+$/.test(exercises[i].reps) ? 120 : 75);
  };
  const addSet = (i: number) => setSets((all) => all.map((list, a) => (a === i ? [...list, { ...(list.at(-1) ?? { kg: '', reps: '' }), done: false }] : list)));

  const doneCount = sets.reduce((n, list) => n + list.filter((s) => s.done).length, 0);
  const totalCount = sets.reduce((n, list) => n + list.length, 0);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const logged: LoggedExercise[] = exercises.map((x, i) => ({
        name: x.name,
        ...(x.id ? { id: x.id } : {}),
        planned: true,
        sets: sets[i].filter((s) => s.done).map((s) => ({ reps: Number(s.reps) || 0, kg: parseWeight(s.kg, unit) })),
      }));
      const rows = toSetRows({ workoutId, date, startedAt: startedAt.current, exercises: logged });
      if (!rows.length) throw new Error(t('lg.tick'));
      await onSave(rows, workoutId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={<span>{title}<span className="ml-2 text-sm font-normal text-slate-500">{fmtDate(date)}</span></span>}>
      <div className="-mx-1 space-y-4">
        {rest !== null && (
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl bg-ink px-4 py-2.5 text-white shadow">
            <span className="flex items-center gap-2 text-sm"><Timer className="h-4 w-4 text-lime" /> {t('lg.rest')} <b className="tabular-nums">{fmtClock(rest)}</b></span>
            <button type="button" onClick={() => setRest(null)} className="rounded-lg p-1 hover:bg-white/10" aria-label={t('lg.skipRest')}><X className="h-4 w-4" /></button>
          </div>
        )}

        {exercises.map((x, i) => {
          const info = initial[i];
          const target = `${x.sets} × ${repsLabel(x.reps)}${x.kg ? ` · ${weightText(x.kg, unit)}` : ''}`;
          return (
            <section key={`${x.name}-${i}`} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-2 flex items-center gap-3">
                <ExerciseThumb exercise={x} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{exName(x.name)}</h3>
                  <span className="text-xs text-slate-500">{t('lg.plan', { target })}</span>
                </div>
              </div>
              {info.last && (
                <p className="mb-2 text-xs text-slate-500">
                  {t('lg.last', { date: fmtDate(info.last.date, { day: 'numeric', month: 'short' }), sets: info.last.sets.map((s) => `${s.kg ? `${weightText(s.kg, unit).replace(` ${unit}`, '')}×` : ''}${s.reps}`).join(', ') })}
                </p>
              )}
              {info.hint && info.hint.kg > 0 && (
                <button
                  type="button"
                  onClick={() => setSets((all) => all.map((list, a) => (a === i ? list.map((s) => (s.done ? s : { ...s, kg: weightInput(info.hint!.kg, unit) })) : list)))}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> {t('lg.try', { weight: weightText(info.hint.kg, unit), reason: info.hint.reason })}
                </button>
              )}
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1.5rem_1fr_1fr_2.5rem] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>{t('lg.set')}</span><span>{unit}</span><span>{t('lg.reps')}</span><span />
                </div>
                {sets[i]?.map((s, j) => (
                  <div key={j} className={cx('grid grid-cols-[1.5rem_1fr_1fr_2.5rem] items-center gap-2 rounded-xl px-1 py-1 transition', s.done && 'bg-emerald-50')}>
                    <span className="text-center text-sm font-semibold text-slate-500">{j + 1}</span>
                    <Input aria-label={t('lg.setWeight', { name: exName(x.name), n: j + 1 })} inputMode="decimal" placeholder={unit} className="!px-2 !py-2 text-center" value={s.kg} onChange={(e) => patch(i, j, { kg: e.target.value })} />
                    <Input aria-label={t('lg.setReps', { name: exName(x.name), n: j + 1 })} inputMode="numeric" placeholder={t('lg.repsPh')} className="!px-2 !py-2 text-center" value={s.reps} onChange={(e) => patch(i, j, { reps: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    <button
                      type="button"
                      onClick={() => toggle(i, j)}
                      aria-pressed={s.done}
                      aria-label={t('lg.setDone', { name: exName(x.name), n: j + 1 })}
                      className={cx('flex h-9 w-9 items-center justify-center rounded-xl ring-1 transition', s.done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white text-slate-300 ring-slate-300 hover:text-slate-500')}
                    >
                      <Check className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addSet(i)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                <Plus className="h-3.5 w-3.5" /> {t('lg.addSet')}
              </button>
            </section>
          );
        })}

        {error && <Notice tone="error">{error}</Notice>}
        <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-white/10 bg-surface px-1 pt-3">
          <span className="text-sm text-slate-500">{t('lg.progress', { done: doneCount, total: totalCount, step: weightText(step, unit) })}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button loading={saving} disabled={doneCount === 0} icon={<Check className="h-4 w-4" />} onClick={finish}>{t('lg.finish')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

