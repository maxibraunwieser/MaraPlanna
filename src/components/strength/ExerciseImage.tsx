// The picture of an exercise (start and end position), a small version for lists and a bigger one with what it trains and needs.

import { memo, useMemo, useState } from 'react';
import { Dumbbell, Info } from 'lucide-react';
import { moveOf, type Move2 } from '../../lib/figure';
import { catalogOf, muscleLabel, musclesOfExercise } from '../../lib/exerciseInfo';
import { GEAR_LABEL, PATTERN_LABEL } from '../../lib/strengthPlan';
import { exName } from '../../lib/strengthFormat';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { Modal, cx } from '../ui';
import { FigureAnimation } from './FigureAnimation';

/** Vorerst keine Uebungsbilder und keine Animation (Website und Uhr): auf true setzen, um sie wieder zu zeigen. */
export const SHOW_IMAGES = false;

const cache = new Map<string, Move2 | null>();
export function moveFor(key: string): Move2 | null {
  if (!cache.has(key)) cache.set(key, moveOf(key));
  return cache.get(key)!;
}

/** The picture of an exercise (the animated figure, the trained muscles in red), or a plain tile for one without (an own exercise). */
export const ExerciseImage = memo(function ExerciseImage({ exercise, size = 'thumb', className }: { exercise: { key?: string; name: string }; size?: 'thumb' | 'card' | 'large'; className?: string }) {
  const entry = catalogOf(exercise);
  const move = useMemo(() => (entry ? moveFor(entry.key) : null), [entry]);
  const label = exName(exercise.name);
  if (!SHOW_IMAGES) return null;
  const box = size === 'thumb' ? 'h-12 w-[7.5rem] rounded-lg' : size === 'card' ? 'aspect-[5/2] w-full rounded-lg' : 'aspect-[5/3] w-full rounded-2xl';
  if (!move) {
    return (
      <span className={cx('flex shrink-0 items-center justify-center bg-slate-50 text-slate-300 ring-1 ring-slate-200', box, className)} role="img" aria-label={label}>
        <Dumbbell className={size === 'thumb' ? 'h-5 w-5' : 'h-10 w-10'} />
      </span>
    );
  }
  return (
    <span className={cx('block shrink-0 bg-slate-50 p-1 ring-1 ring-slate-200', box, className)} data-testid="exercise-image">
      <FigureAnimation move={move} label={label} animate={size !== 'thumb'} phase={0.5} />
    </span>
  );
});

export const MuscleChips = ({ exercise, max = 3, className }: { exercise: { key?: string; name: string }; max?: number; className?: string }) => {
  const entry = catalogOf(exercise);
  if (!entry) return null;
  return (
    <span className={cx('flex flex-wrap gap-1', className)}>
      {musclesOfExercise(entry).slice(0, max).map((m, i) => (
        <span key={m} className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none', i === 0 ? 'bg-brand-soft text-slate-800' : 'bg-slate-100 text-slate-500')}>{muscleLabel(m)}</span>
      ))}
    </span>
  );
};

/** What an exercise looks like, what it trains and what it needs. */
export function ExerciseDialog({ exercise, onClose }: { exercise: { key?: string; name: string } | null; onClose: () => void }) {
  const { t } = useI18n();
  const entry = exercise ? catalogOf(exercise) : undefined;
  return (
    <Modal open={!!exercise} onClose={onClose} title={exercise ? exName(exercise.name) : ''}>
      {exercise && (
        <div className="space-y-4" data-testid="exercise-dialog">
          <ExerciseImage exercise={exercise} size="large" />
          {entry ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ex.trains')}</dt>
                <dd><MuscleChips exercise={exercise} max={4} /></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ex.groups')}</dt>
                <dd className="flex flex-wrap gap-1.5">{entry.groups.map((g) => <span key={g} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{t(`sg.group.${g}` as MsgKey)}</span>)}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ex.movement')}</dt>
                <dd className="text-slate-700">{PATTERN_LABEL[entry.pattern]}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ex.needs')}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {entry.needs.map((g) => <span key={g} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{GEAR_LABEL[g]}</span>)}
                  {entry.anyOf?.length ? (
                    <>
                      <span className="self-center text-xs text-slate-500">{t('ex.needsAny')}:</span>
                      {entry.anyOf.map((g) => <span key={g} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{GEAR_LABEL[g]}</span>)}
                      {entry.bodyOk && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{t('lib.noGear')}</span>}
                    </>
                  ) : null}
                  {!entry.needs.length && !entry.anyOf?.length && <span className="text-slate-700">{t('ex.noGear')}</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">{t('ex.own')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The small picture as a button that opens the bigger one. */
export function ExerciseThumb({ exercise, className, size = 'thumb' }: { exercise: { key?: string; name: string }; className?: string; size?: 'thumb' | 'card' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!SHOW_IMAGES) {
    // ohne Bild: ein kleines Info-Symbol oeffnet die Angaben zur Uebung (Muskeln, Bewegung, Geraet)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={cx('shrink-0 rounded-full p-1.5 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand', className)} aria-label={t('ex.show', { name: exName(exercise.name) })} draggable={false}>
          <Info className="h-4 w-4" />
        </button>
        <ExerciseDialog exercise={open ? exercise : null} onClose={() => setOpen(false)} />
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('shrink-0 rounded-lg outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-brand', className)} aria-label={t('ex.show', { name: exName(exercise.name) })} draggable={false}>
        <ExerciseImage exercise={exercise} size={size} />
      </button>
      <ExerciseDialog exercise={open ? exercise : null} onClose={() => setOpen(false)} />
    </>
  );
}
