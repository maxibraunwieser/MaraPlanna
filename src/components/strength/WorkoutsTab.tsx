import { useMemo, useState } from 'react';
import { CalendarClock, CalendarDays, ChevronDown, Clock, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { isOwnRoutine, type Routine } from '../../../supabase/functions/_shared/strength';
import { Link } from 'react-router-dom';
import { STRENGTH_TYPES, TYPE_LABEL, isStrengthType, routineKind, routineMinutes, setupOf, type StrengthType } from '../../lib/strengthPlan';
import { exName, rxText, stepsToExercises, weightText } from '../../lib/strengthFormat';
import { lastWeightOf, lastWeights } from '../../lib/strengthStats';
import { fmtDate, fmtDay, localTitle } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import type { PlannedWorkout } from '../../lib/types';
import { Badge, Button, Card, CardTitle, Modal, Notice, useToast } from '../ui';
import { ExerciseThumb } from './ExerciseImage';
import { workoutMuscles } from '../../lib/exerciseInfo';
import { routineIdOf, sessionsOf } from '../../lib/strengthSchedule';
import { weekdayNames } from '../../lib/i18n/dates';
import { MuscleLegend, MuscleMap } from './MuscleMap';
import { DeleteWorkoutDialog, MoveDialog, OwnWorkoutDialog } from './WorkoutDialogs';
import { Logger } from './Logger';
import { RoutineEditor } from './RoutineEditor';
import { isGymSession, type StrengthCtx } from './context';

export const dayLabel = (date: string, today: string): string => fmtDay(date, today, { weekday: 'long', day: 'numeric', month: 'short' });

function ExerciseList({ exercises, unit, last }: { exercises: { key?: string; id?: string; name: string; sets: number; reps: string; kg?: number | null }[]; unit: 'kg' | 'lb'; last?: Map<string, { kg: number; date: string }> }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-2 text-sm">
      {exercises.map((x, i) => {
        // The weight of the last time (logged on the watch or here) is what the next session starts from.
        const prev = last ? lastWeightOf(last, x) : undefined;
        return (
          <li key={`${x.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2">
            <ExerciseThumb exercise={x} className="hidden sm:block" />
            <span className="min-w-0 flex-1 font-medium text-slate-800">{exName(x.name)}</span>
            <span className="shrink-0 text-right tabular-nums text-slate-500">
              {rxText(x, unit)}
              {prev && <span className="block text-[11px] text-emerald-600" data-testid="last-kg">{t('wt.lastKg', { kg: weightText(prev.kg, unit), date: fmtDate(prev.date, { day: 'numeric', month: 'short' }) })}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The exercise names in one small line, for a workout that is folded. */
const nameLine = (exercises: { name: string }[]): string => exercises.map((x) => exName(x.name)).join(' · ');

function Chevron({ open }: { open: boolean }) {
  return <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />;
}

/** The workouts, the next session and what is coming up. */
export function WorkoutsTab({ ctx }: { ctx: StrengthCtx }) {
  const { prefs, unit, workouts, today, rows } = ctx;
  const { t, lang } = useI18n();
  const toast = useToast();
  const [logging, setLogging] = useState<{ title: string; date: string; workout: PlannedWorkout | null; exercises: ReturnType<typeof stepsToExercises> } | null>(null);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [editingSession, setEditingSession] = useState<{ w: PlannedWorkout; r: Routine } | null>(null);
  const [saving, setSaving] = useState(false);
  const [openNext, setOpenNext] = useState(false);
  const [openRoutine, setOpenRoutine] = useState<string | null>(null);
  /** A workout of the person's own being added ('new') or changed. */
  const [own, setOwn] = useState<Routine | 'new' | null>(null);
  const [moving, setMoving] = useState<PlannedWorkout | null>(null);
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const setup = setupOf(prefs);
  const last = useMemo(() => lastWeights(rows), [rows]);

  const sessions = useMemo(
    () => workouts.filter((w) => isGymSession(w) && w.date >= today && w.status === 'planned' && w.steps.some((s) => s.type === 'exercise')).sort((a, b) => a.date.localeCompare(b.date)),
    [workouts, today],
  );
  const next = sessions[0];
  const upcoming = sessions.slice(1, 7);
  // The planner's workouts first, then the person's own.
  const routines = [...STRENGTH_TYPES.flatMap((t) => prefs.routines.filter((r) => r.id === t)), ...prefs.routines.filter((r) => isOwnRoutine(r.id))];
  const nameOf = (r: Routine) => r.name || TYPE_LABEL[r.id as StrengthType] || t('wt.workoutTitle');
  const plannedOf = (id: string) => sessionsOf(workouts, id).filter((w) => w.status === 'planned' && w.date >= today);
  /** A session that belongs to a series: a planner kind, or a weekly workout of the person's own. */
  const inSeries = (w: PlannedWorkout) => {
    const id = routineIdOf(w);
    if (!id) return false;
    return !isOwnRoutine(id) || prefs.routines.find((r) => r.id === id)?.schedule?.mode === 'series';
  };
  const scheduleText = (r: Routine) => {
    const s = r.schedule;
    if (!s) return null;
    if (s.mode === 'once') return t('ow.onceOn', { date: fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' }) });
    const names = weekdayNames(lang);
    return t('ow.seriesOn', { days: s.days.map((d) => names[d]).join(', '), until: s.until ? fmtDate(s.until, { day: 'numeric', month: 'short' }) : t('ow.planEnd') });
  };
  const withoutRoutine = STRENGTH_TYPES.filter((t) => !prefs.routines.some((r) => r.id === t) && workouts.some((w) => w.kind === routineKind(t)));

  const startSession = (w: PlannedWorkout) => setLogging({ title: localTitle(w.title), date: w.date <= today ? w.date : today, workout: w, exercises: stepsToExercises(w.steps) });
  const startRoutine = (r: Routine) => {
    const planned = sessions.find((w) => routineIdOf(w) === r.id && w.date === today);
    setLogging({ title: nameOf(r), date: today, workout: planned ?? null, exercises: r.exercises });
  };

  const saveRoutine = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const next = prefs.routines.some((r) => r.id === editing.id) ? prefs.routines.map((r) => (r.id === editing.id ? editing : r)) : [...prefs.routines, editing];
      const changed = await ctx.savePrefs({ ...prefs, routines: next.map((r) => (r.id === editing.id ? { ...r, updatedAt: new Date().toISOString() } : r)) }, true);
      toast(changed ? t(changed === 1 ? 'wt.saved1' : 'wt.savedN', { n: changed }) : t('wt.saved'), 'success');
      setEditing(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveSession = async () => {
    if (!editingSession) return;
    setSaving(true);
    try {
      await ctx.saveSession(editingSession.w, editingSession.r);
      toast(t('wt.sessionUpdated'), 'success');
      setEditingSession(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {next ? (
        <section className="overflow-hidden rounded-2xl bg-ink text-white shadow-sm">
          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-lime">
                <CalendarDays className="h-4 w-4" /> {t('wt.next', { day: dayLabel(next.date, today) })}
              </div>
              <button type="button" onClick={() => setOpenNext((v) => !v)} aria-expanded={openNext} className="mt-1 flex w-full items-start justify-between gap-3 text-left">
                <span className="min-w-0">
                  <span className="block text-2xl font-bold">{localTitle(next.title)}</span>
                  {!openNext && <span className="mt-1 line-clamp-2 block text-xs text-slate-300">{nameLine(stepsToExercises(next.steps))}</span>}
                </span>
                <ChevronDown className={`mt-1.5 h-5 w-5 shrink-0 text-slate-300 transition-transform ${openNext ? 'rotate-180' : ''}`} />
              </button>
              <div className="mt-1 flex items-center gap-3 text-sm text-slate-300">
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {t('wt.about', { min: next.duration_min ?? routineMinutes({ id: '', exercises: stepsToExercises(next.steps), by: 'own', updatedAt: null }) })}</span>
                <span>{t('wt.exercises', { n: next.steps.filter((s) => s.type === 'exercise').length })}</span>
              </div>
              {openNext && (
                <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {stepsToExercises(next.steps).map((x, i) => (
                    <li key={`${x.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2">
                      <ExerciseThumb exercise={x} className="hidden sm:block" />
                      <span className="min-w-0 flex-1 font-medium">{exName(x.name)}</span>
                      <span className="shrink-0 tabular-nums text-slate-300">{rxText(x, unit)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 sm:flex-col sm:justify-end">
              <Button size="lg" icon={<Play className="h-5 w-5" />} onClick={() => startSession(next)}>{t('wt.start')}</Button>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditingSession({ w: next, r: { id: '', exercises: stepsToExercises(next.steps), by: 'own', updatedAt: null } })}>{t('wt.editSession')}</Button>
              <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setMoving(next)}>{t('smv.button')}</Button>
            </div>
          </div>
        </section>
      ) : (
        <Card>
          <CardTitle icon={<CalendarDays className="h-5 w-5 text-brand" />}>{t('wt.nextTitle')}</CardTitle>
          <p className="text-sm text-slate-600">
            {ctx.plan ? t('wt.noSession.plan') : t('wt.noSession.none')}
          </p>
        </Card>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t('wt.yours')}</h2>
          <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setOwn('new')}>{t('ow.add')}</Button>
          <Link to={ctx.plan ? '/onboarding?edit=1&add=strength' : '/onboarding?edit=1'}><Button size="sm" variant="ghost" icon={<Sparkles className="h-4 w-4 text-brand" />}>{t('wt.change')}</Button></Link>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {routines.map((r) => {
            const mine = isOwnRoutine(r.id);
            const when = plannedOf(r.id).slice(0, 3);
            const load = workoutMuscles(r.exercises);
            const open = openRoutine === r.id;
            const plan = mine ? scheduleText(r) : null;
            return (
              <Card key={r.id} className="flex flex-col" data-testid={'routine-' + r.id}>
                <button type="button" onClick={() => setOpenRoutine(open ? null : r.id)} aria-expanded={open} className="mb-2 flex w-full items-start gap-3 text-left">
                  <MuscleMap load={load} className="w-16 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-slate-900">{nameOf(r)}</span>
                    {!open && r.exercises.length > 0 && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{nameLine(r.exercises)}</span>}
                  </span>
                  <Badge tone={r.by === 'own' ? 'blue' : 'violet'} className="shrink-0">{mine ? t('ow.badge') : r.by === 'own' ? t('wt.own') : t('wt.suggested')}</Badge>
                  <Chevron open={open} />
                </button>
                <p className="mb-2 text-xs text-slate-500">
                  {plan ? plan + ' · ' : ''}
                  {when.length ? t('wt.nextDates', { dates: when.map((w) => fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })).join(' · ') }) : t('wt.notOnCalendar')}
                  {' · '}{t('wt.about', { min: routineMinutes(r) })}
                </p>
                <div className="flex-1 space-y-3">
                  {open && <MuscleLegend load={load} />}
                  {!r.exercises.length ? <p className="py-3 text-sm text-slate-500">{t('wt.emptyAdd')}</p> : open ? <ExerciseList exercises={r.exercises} unit={unit} last={last} /> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={!r.exercises.length} icon={<Play className="h-4 w-4" />} onClick={() => startRoutine(r)}>{t('wt.startNow')}</Button>
                  <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => (mine ? setOwn(r) : setEditing(r))}>{t('wt.edit')}</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label={t('dw.aria', { name: nameOf(r) })} onClick={() => setDeleting(r)}>{t('dw.button')}</Button>
                </div>
              </Card>
            );
          })}
          {withoutRoutine.map((kind) => (
            <Card key={kind} className="flex flex-col items-start gap-2">
              <h3 className="text-base font-semibold text-slate-900">{TYPE_LABEL[kind]}</h3>
              <p className="text-sm text-slate-500">{t('wt.noWorkout')}</p>
              <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4 text-brand" />} onClick={() => setEditing({ id: kind, exercises: [], by: 'suggested', updatedAt: null })}>{t('wt.create')}</Button>
            </Card>
          ))}
        </div>
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardTitle icon={<CalendarDays className="h-5 w-5 text-brand" />}>{t('wt.coming')}</CardTitle>
          <ul className="space-y-2">
            {upcoming.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5">
                <div className="w-28 shrink-0 text-sm font-semibold text-slate-800">{dayLabel(w.date, today)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{localTitle(w.title)}</div>
                  <div className="truncate text-xs text-slate-500">{stepsToExercises(w.steps).map((x) => exName(x.name)).join(' · ')}</div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setEditingSession({ w, r: { id: '', exercises: stepsToExercises(w.steps), by: 'own', updatedAt: null } })}>{t('wt.edit')}</Button>
                  <Button size="sm" variant="ghost" icon={<CalendarClock className="h-4 w-4" />} aria-label={t('smv.aria', { name: localTitle(w.title) })} onClick={() => setMoving(w)}>{t('smv.button')}</Button>
                  <Button size="sm" variant="secondary" onClick={() => startSession(w)}>{t('wt.log')}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal wide open={!!editing} onClose={() => setEditing(null)} title={editing ? (TYPE_LABEL[editing.id as StrengthType] ?? t('wt.workoutTitle')) : ''}>
        {editing && (
          <div className="space-y-4">
            <Notice tone="info">
              {t('wt.changesApply', { type: isStrengthType(editing.id) ? (lang === 'de' ? TYPE_LABEL[editing.id] : TYPE_LABEL[editing.id].toLowerCase()) : '' })}
            </Notice>
            <RoutineEditor routine={editing} type={isStrengthType(editing.id) ? editing.id : null} setup={setup} unit={unit} onChange={setEditing} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>{t('wt.cancel')}</Button>
              <Button loading={saving} onClick={saveRoutine}>{t('wt.saveWorkout')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal wide open={!!editingSession} onClose={() => setEditingSession(null)} title={editingSession ? `${localTitle(editingSession.w.title)} · ${fmtDate(editingSession.w.date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}>
        {editingSession && (
          <div className="space-y-4">
            <Notice tone="info">{t('wt.onlyThis')}</Notice>
            <RoutineEditor routine={editingSession.r} type={null} setup={setup} unit={unit} suggestible={false} onChange={(r) => setEditingSession({ ...editingSession, r })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingSession(null)}>{t('wt.cancel')}</Button>
              <Button loading={saving} onClick={saveSession}>{t('wt.saveSession')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {own && (
        <OwnWorkoutDialog
          open
          routine={own === 'new' ? null : own}
          setup={setup}
          unit={unit}
          today={today}
          planEnd={ctx.plan ? ctx.planEnd : null}
          onClose={() => setOwn(null)}
          onSave={async (r) => {
            const n = await ctx.saveOwnRoutine(r);
            toast(!ctx.plan ? t('wt.saved') : n === 1 ? t('ow.saved1') : t('ow.saved', { n }), 'success');
            setOwn(null);
          }}
        />
      )}
      {moving && (
        <MoveDialog
          w={moving}
          today={today}
          planEnd={ctx.planEnd}
          series={inSeries(moving)}
          onClose={() => setMoving(null)}
          onSave={async (date, scope) => {
            const n = await ctx.moveSession(moving, date, scope);
            toast(t(n === 1 ? 'smv.done1' : 'smv.doneN', { n }), 'success');
            setMoving(null);
          }}
        />
      )}
      <DeleteWorkoutDialog
        name={deleting ? nameOf(deleting) : null}
        planned={deleting ? plannedOf(deleting.id).length : 0}
        onClose={() => setDeleting(null)}
        onDelete={async () => {
          await ctx.deleteRoutine(deleting!.id);
          toast(t('dw.done'), 'success');
          setDeleting(null);
        }}
      />

      {logging && (
        <Logger
          open
          onClose={() => setLogging(null)}
          title={logging.title}
          date={logging.date}
          workoutId={logging.workout?.id ?? null}
          exercises={logging.exercises}
          history={rows}
          unit={unit}
          onSave={async (r, id) => {
            await ctx.logSets(r, id);
            toast(t('wt.workoutSaved', { n: r.length }), 'success');
          }}
        />
      )}
    </div>
  );
}

