import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, GripVertical, LayoutGrid, Minus, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { GEAR, type Gear, type Routine, type RoutineExercise } from '../../../supabase/functions/_shared/strength';
import {
  GEAR_LABEL, alternatives, catalogEntry, customExercise, fromCatalog, restOf, routineMinutes, suggestRoutine, type CatalogExercise, type Setup, type StrengthType,
} from '../../lib/strengthPlan';
import { LIST_GROUPS, catalogOf, gearsOf, library, muscleLabel, needsNoGear, primaryMuscle, type Muscle } from '../../lib/exerciseInfo';
import type { ListGroup } from '../../../supabase/functions/_shared/exerciseListData';
import { exName, parseWeight, repsLabel, weightInput, weightText, type WeightUnit } from '../../lib/strengthFormat';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { Button, cx, Input } from '../ui';
import { ExerciseThumb, MuscleChips } from './ExerciseImage';

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

/** What a workout of this kind is about, for the list of exercises when the workout is still empty. */
const FOCUS_OF_TYPE: Partial<Record<StrengthType, Muscle[]>> = {
  lower: ['quads', 'hamstrings', 'glutes', 'calves', 'core'],
  upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
};

/** One exercise of the list: a picture, its name and muscles, and a button to take it. */
function PickCard({ x, label, onPick }: { x: CatalogExercise; label: string; onPick: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200 transition hover:ring-brand" data-testid="library-item">
      <ExerciseThumb exercise={x} size="card" className="w-full" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold leading-snug text-slate-900">{exName(x.name)}</div>
          <MuscleChips exercise={x} className="mt-1" />
        </div>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={onPick}>{label}</Button>
      </div>
    </div>
  );
}

/**
 * Every exercise the person can do with what they train with and nothing else (their place, machines and equipment from the
 * questionnaire, nothing that needs care, nothing they left out). The exercises for the muscles of the workout come first.
 */
function Library({
  setup, taken, focus, swapName, onPick, onOwn, onClose,
}: {
  setup: Setup;
  taken: string[];
  focus: Muscle[];
  /** Set when an exercise is being swapped: the list is about the muscles of that one. */
  swapName: string | null;
  onPick: (x: CatalogExercise) => void;
  onOwn: (name: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ListGroup | null>(null);
  const [gear, setGear] = useState<Gear | 'none' | null>(null);
  const all = useMemo(() => library(setup, { taken, focus: [] }), [setup, taken]);
  const allItems = useMemo(() => [...all.same, ...all.others.flatMap((g) => g.items)], [all]);
  // the filters offer only what exists for this person: the muscle groups and the equipment of the exercises they can do
  const groups = useMemo(() => LIST_GROUPS.filter((g) => allItems.some((x) => x.groups.includes(g))), [allItems]);
  const gears = useMemo(() => GEAR.filter((g) => allItems.some((x) => gearsOf(x).includes(g))), [allItems]);
  const anyNoGear = useMemo(() => allItems.some(needsNoGear), [allItems]);
  const lib = useMemo(() => library(setup, { taken, focus, query: q, group, gear }), [setup, taken, focus, q, group, gear, lang]);
  const total = lib.same.length + lib.others.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="exercise-library">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{swapName ? t('lib.swapTitle', { name: swapName }) : t('lib.title')}</h3>
          <p className="text-xs text-slate-500">{t('lib.sub')}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={t('lib.close')}><X className="h-4 w-4" /></button>
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder={t('re.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('re.search')} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('lib.filter')}>
        <button type="button" onClick={() => setGroup(null)} aria-pressed={group === null} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', group === null ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}>{t('lib.all')}</button>
        {groups.map((g) => (
          <button key={g} type="button" onClick={() => setGroup(group === g ? null : g)} aria-pressed={group === g} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', group === g ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}>{t(`sg.group.${g}` as MsgKey)}</button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={t('lib.filterGear')}>
        <span className="self-center pr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('lib.filterGear')}</span>
        <button type="button" onClick={() => setGear(null)} aria-pressed={gear === null} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', gear === null ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}>{t('lib.all')}</button>
        {anyNoGear && <button type="button" onClick={() => setGear(gear === 'none' ? null : 'none')} aria-pressed={gear === 'none'} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', gear === 'none' ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}>{t('lib.noGear')}</button>}
        {gears.map((g) => (
          <button key={g} type="button" onClick={() => setGear(gear === g ? null : g)} aria-pressed={gear === g} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', gear === g ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}>{GEAR_LABEL[g]}</button>
        ))}
      </div>
      <div className="mt-1 text-right text-[11px] text-slate-400">{t('lib.count', { n: total })}</div>
      <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
        {lib.same.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand">{swapName ? t('lib.sameSwap', { name: swapName }) : t('lib.same')}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {lib.same.map((x) => <PickCard key={x.key} x={x} label={swapName ? t('lib.use') : t('lib.add')} onPick={() => onPick(x)} />)}
            </div>
          </section>
        )}
        {lib.others.map((g) => (
          <section key={g.muscle}>
            <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{lib.same.length ? `${t('lib.other')} · ` : ''}{muscleLabel(g.muscle)}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.items.map((x) => <PickCard key={x.key} x={x} label={swapName ? t('lib.use') : t('lib.add')} onPick={() => onPick(x)} />)}
            </div>
          </section>
        ))}
        {total === 0 && <p className="py-3 text-sm text-slate-500">{t('re.nothing')}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" disabled={!q.trim()} icon={<Plus className="h-4 w-4" />} onClick={() => onOwn(q)}>
          {t('re.addOwn', { name: q.trim() || '…' })}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, label, fewer, more }: { value: number; onChange: (v: number) => void; label: string; fewer: string; more: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white ring-1 ring-slate-300" role="group" aria-label={label}>
      <button type="button" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label={fewer}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={value >= 10} onClick={() => onChange(value + 1)} aria-label={more}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Edit a workout: a clear list of exercises (picture, name, muscles, sets and weight at a glance), details behind a button,
 * swap for one that does the same job, or open the list of all exercises the person can do.
 */
export function RoutineEditor({
  routine,
  type,
  setup,
  unit,
  onChange,
  suggestible = true,
}: {
  routine: Routine;
  /** Kind of session, for the suggestion; null when editing a single planned session. */
  type: StrengthType | null;
  setup: Setup;
  unit: WeightUnit;
  onChange: (r: Routine) => void;
  suggestible?: boolean;
}) {
  const { t } = useI18n();
  const [listing, setListing] = useState<{ swap: number | null } | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const edit = (exercises: RoutineExercise[]) => onChange({ ...routine, exercises, by: 'own' });
  const patch = (i: number, p: Partial<RoutineExercise>) => edit(routine.exercises.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const minutes = routineMinutes(routine);
  const sets = routine.exercises.reduce((n, x) => n + x.sets, 0);
  const taken = useMemo(() => routine.exercises.map((x) => x.key).filter(Boolean), [routine.exercises]);

  // The muscles of the workout (or of the exercise being swapped): the list shows their exercises first.
  const focus = useMemo<Muscle[]>(() => {
    if (listing?.swap != null) {
      const x = catalogOf(routine.exercises[listing.swap]);
      return x ? [primaryMuscle(x)] : [];
    }
    const own = routine.exercises.flatMap((x) => {
      const c = catalogOf(x);
      return c ? [primaryMuscle(c)] : [];
    });
    return [...new Set(own.length ? own : (type ? FOCUS_OF_TYPE[type] ?? [] : []))];
  }, [listing, routine.exercises, type]);
  const swapName = listing?.swap != null && routine.exercises[listing.swap] ? exName(routine.exercises[listing.swap].name) : null;

  const pick = (x: CatalogExercise) => {
    if (listing?.swap != null) {
      const i = listing.swap;
      const next = fromCatalog(x, setup);
      edit(routine.exercises.map((y, j) => (j === i ? { ...next, sets: y.sets, reps: y.reps, kg: null } : y)));
      setListing(null);
      setSwapping(null);
    } else {
      edit([...routine.exercises, fromCatalog(x, setup)]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {suggestible && type && (
          <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4 text-brand" />} onClick={() => onChange(suggestRoutine(type, setup, new Date().toISOString()))}>
            {routine.exercises.length ? (routine.by === 'own' ? t('re.reset') : t('re.again')) : t('re.suggest')}
          </Button>
        )}
        <Button size="sm" variant={listing && listing.swap === null ? 'primary' : 'secondary'} icon={<LayoutGrid className="h-4 w-4" />} aria-expanded={!!listing} onClick={() => setListing(listing ? null : { swap: null })}>
          {listing && listing.swap === null ? t('lib.hide') : t('lib.showAll')}
        </Button>
        {suggestible && type && routine.exercises.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...routine, exercises: [], by: 'own' })}>{t('re.scratch')}</Button>
        )}
        {routine.exercises.length > 0 && <span className="ml-auto text-xs text-slate-500">{t('re.summary', { n: routine.exercises.length, sets, min: minutes })}</span>}
      </div>
      {suggestible && type && <p className="-mt-1 text-xs text-slate-500">{t('re.basis')}</p>}

      {routine.exercises.length === 0 && !listing && (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{t('re.empty')}</p>
      )}

      <ol className="space-y-2">
        {routine.exercises.map((x, i) => {
          const entry = catalogEntry(x.key);
          const alts = swapping === i ? alternatives(x, setup) : [];
          const detail = open === i;
          const summary = [t('re.sum.sets', { sets: x.sets, reps: repsLabel(x.reps) }), weightText(x.kg, unit), t('re.sum.rest', { s: restOf(x) })].filter(Boolean).join(' · ');
          return (
            <li
              key={`${x.key || x.name}-${i}`}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== i) edit(move(routine.exercises, dragging, i));
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              className={cx('rounded-xl bg-white ring-1 transition', over === i && dragging !== i ? 'ring-2 ring-brand' : 'ring-slate-200', dragging === i && 'opacity-50')}
              data-testid="routine-exercise"
            >
              <div className="flex items-center gap-2.5 p-2.5">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden />
                <ExerciseThumb exercise={x} className="hidden sm:block" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
                    <span className="text-sm font-semibold leading-snug text-slate-900">{exName(x.name)}</span>
                  </div>
                  <MuscleChips exercise={x} className="mt-1" />
                  <div className="mt-1 text-xs text-slate-500">{summary}{x.id ? t('re.watch') : ''}</div>
                </div>
                <div className="flex shrink-0 items-center">
                  {suggestible && entry && (
                    <button type="button" onClick={() => setSwapping(swapping === i ? null : i)} className={cx('rounded-lg p-1.5 hover:bg-slate-100', swapping === i ? 'text-brand' : 'text-slate-400')} aria-label={t('re.swap', { name: exName(x.name) })} title={t('re.swapTitle')}>
                      <ArrowLeftRight className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(detail ? null : i)} aria-expanded={detail} className={cx('rounded-lg p-1.5 hover:bg-slate-100', detail ? 'text-brand' : 'text-slate-400')} aria-label={detail ? t('re.hideDetails') : t('re.detailsOf', { name: exName(x.name) })} title={t('re.details')}>
                    <ChevronDown className={cx('h-4 w-4 transition', detail && 'rotate-180')} />
                  </button>
                  <button type="button" onClick={() => edit(routine.exercises.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('re.remove', { name: exName(x.name) })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {detail && (
                <div className="space-y-2 border-t border-slate-100 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('re.sets')}</span>
                      <Stepper value={x.sets} onChange={(v) => patch(i, { sets: v })} label={t('re.sets')} fewer={t('re.fewerSets')} more={t('re.moreSets')} />
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('re.reps')}</span>
                      <Input className="!px-2 !py-1.5 text-center" value={repsLabel(x.reps)} aria-label={t('re.repsOf', { name: exName(x.name) })} onChange={(e) => patch(i, { reps: e.target.value.slice(0, 14) })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('re.weight', { unit })}</span>
                      <Input
                        className="!px-2 !py-1.5 text-center"
                        inputMode="decimal"
                        placeholder="–"
                        aria-label={t('re.weightOf', { name: exName(x.name) })}
                        defaultValue={weightInput(x.kg, unit)}
                        key={`${x.name}-${unit}`}
                        onBlur={(e) => patch(i, { kg: parseWeight(e.target.value, unit) })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('re.rest')}</span>
                      <Input
                        className="!px-2 !py-1.5 text-center"
                        inputMode="numeric"
                        aria-label={t('re.restOf', { name: exName(x.name) })}
                        defaultValue={restOf(x)}
                        key={`${x.name}-rest-${x.restS ?? 'auto'}`}
                        onBlur={(e) => {
                          const n = Math.round(Number(e.target.value));
                          patch(i, { restS: Number.isFinite(n) && n >= 10 ? Math.min(600, n) : undefined });
                        }}
                      />
                    </label>
                  </div>
                  <Input
                    className="!px-2.5 !py-1.5 text-xs"
                    placeholder={t('re.note')}
                    aria-label={t('re.noteFor', { name: exName(x.name) })}
                    defaultValue={x.note ?? ''}
                    key={`${x.name}-note`}
                    maxLength={80}
                    onBlur={(e) => patch(i, { note: e.target.value.trim() || undefined })}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" disabled={i === 0} icon={<ArrowUp className="h-4 w-4" />} onClick={() => edit(move(routine.exercises, i, i - 1))} aria-label={t('re.up', { name: exName(x.name) })}>{t('re.moveUp')}</Button>
                    <Button size="sm" variant="ghost" disabled={i === routine.exercises.length - 1} icon={<ArrowDown className="h-4 w-4" />} onClick={() => edit(move(routine.exercises, i, i + 1))} aria-label={t('re.down', { name: exName(x.name) })}>{t('re.moveDown')}</Button>
                  </div>
                </div>
              )}

              {swapping === i && (
                <div className="space-y-2 border-t border-slate-100 p-3">
                  <div className="text-xs font-medium text-slate-500">{t('re.instead', { name: exName(x.name) })}</div>
                  {alts.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {alts.map((a) => (
                        <PickCard
                          key={a.key}
                          x={a}
                          label={t('lib.use')}
                          onPick={() => {
                            const next = fromCatalog(a, setup);
                            edit(routine.exercises.map((y, j) => (j === i ? { ...next, sets: y.sets, reps: y.reps, kg: null } : y)));
                            setSwapping(null);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">{t('re.noneFits')}</span>
                  )}
                  <Button size="sm" variant="ghost" icon={<LayoutGrid className="h-4 w-4" />} onClick={() => setListing({ swap: i })}>{t('lib.showAll')}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {listing ? (
        <Library
          setup={setup}
          taken={taken}
          focus={focus}
          swapName={swapName}
          onPick={pick}
          onOwn={(name) => {
            const own = customExercise(name);
            if (listing.swap != null) {
              const i = listing.swap;
              edit(routine.exercises.map((y, j) => (j === i ? { ...own, sets: y.sets, reps: y.reps } : y)));
              setListing(null);
              setSwapping(null);
            } else edit([...routine.exercises, own]);
          }}
          onClose={() => setListing(null)}
        />
      ) : (
        routine.exercises.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setListing({ swap: null })}>{t('re.add')}</Button>
          </div>
        )
      )}
    </div>
  );
}
