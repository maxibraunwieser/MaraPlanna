import { useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { isOwnRoutine, type Routine } from '../../../supabase/functions/_shared/strength';
import { STRENGTH_TYPES, TYPE_LABEL, isStrengthType, routineKind, routineMinutes, setupOf, type StrengthType } from '../../lib/strengthPlan';
import { stepsToExercises } from '../../lib/strengthFormat';
import { lastWeights } from '../../lib/strengthStats';
import { fmtDate, fmtDay, localTitle } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import type { PlannedWorkout } from '../../lib/types';
import { Button, Modal, Notice, useToast } from '../ui';
import { routineIdOf, sessionsOf } from '../../lib/strengthSchedule';
import { DeleteWorkoutDialog, MoveDialog, OwnWorkoutDialog } from './WorkoutDialogs';
import { Logger } from './Logger';
import { RoutineEditor } from './RoutineEditor';
import { isGymSession, type StrengthCtx } from './context';
import { RecentSessions, RoutineCard, RunToday, TodayHero, UpcomingList, weekDays } from './Home';
import { DsCard, SectionHeader, WeekStrip } from '../ds';
import { isRunWorkout } from '../../lib/planner/adapt';
import { useData } from '../../lib/data';
import { useNavigate } from 'react-router-dom';

export const dayLabel = (date: string, today: string): string => fmtDay(date, today, { weekday: 'long', day: 'numeric', month: 'short' });

/** The workouts, the next session and what is coming up. */
export function WorkoutsTab({ ctx }: { ctx: StrengthCtx }) {
  const { prefs, unit, workouts, today, rows } = ctx;
  const { t, lang } = useI18n();
  const toast = useToast();
  const { activities, units } = useData();
  const navigate = useNavigate();
  const [logging, setLogging] = useState<{ title: string; date: string; workout: PlannedWorkout | null; exercises: ReturnType<typeof stepsToExercises> } | null>(null);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [editingSession, setEditingSession] = useState<{ w: PlannedWorkout; r: Routine } | null>(null);
  const [saving, setSaving] = useState(false);
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

  const todayRun = workouts.find((w) => w.date === today && isRunWorkout(w) && (w.status === 'planned' || w.status === 'partial'));
  const toExercises = (w: PlannedWorkout) => stepsToExercises(w.steps);

  return (
    <div className="space-y-6">
      <WeekStrip days={weekDays(today, workouts, rows, activities)} today={today} label={t('ds.week')} progressLabel={t('ds.weekProgress')} />

      {todayRun && (!next || next.date !== today) && <RunToday w={todayRun} paces={ctx.plan?.fitness.paces ?? null} units={units} />}

      {next ? (
        <TodayHero
          title={localTitle(next.title)}
          dayText={next.date === today ? t('ds.today') : t('wt.next', { day: dayLabel(next.date, today) })}
          minutes={next.duration_min ?? routineMinutes({ id: '', exercises: toExercises(next), by: 'own', updatedAt: null })}
          exercises={toExercises(next)}
          last={last}
          onStart={() => startSession(next)}
          onEdit={() => setEditingSession({ w: next, r: { id: '', exercises: toExercises(next), by: 'own', updatedAt: null } })}
          onMove={() => setMoving(next)}
        />
      ) : (
        <DsCard>
          <h2 className="text-ds-title font-semibold text-ds-text">{t('wt.nextTitle')}</h2>
          <p className="mt-1 text-ds-body text-ds-text-2">{ctx.plan ? t('wt.noSession.plan') : t('wt.noSession.none')}</p>
        </DsCard>
      )}

      <RecentSessions rows={rows} today={today} onAll={() => navigate('/strength?tab=history')} />

      <section>
        <SectionHeader
          title={t('wt.yours')}
          action={<Button size="sm" variant="secondary" className="min-h-11 shrink-0 !rounded-ds-md" icon={<Plus className="h-4 w-4" />} onClick={() => setOwn('new')}>{t('ow.add')}</Button>}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {routines.map((r) => {
            const mine = isOwnRoutine(r.id);
            const open = openRoutine === r.id;
            return (
              <div key={r.id} data-testid={'routine-' + r.id}>
                <RoutineCard
                  name={nameOf(r)}
                  badge={mine ? t('ow.badge') : r.by === 'own' ? t('wt.own') : t('wt.suggested')}
                  minutes={routineMinutes(r)}
                  exercises={r.exercises}
                  open={open}
                  onToggle={() => setOpenRoutine(open ? null : r.id)}
                  onStart={() => startRoutine(r)}
                  onEdit={() => (mine ? setOwn(r) : setEditing(r))}
                  onDelete={() => setDeleting(r)}
                >
                  {!r.exercises.length && <p className="mt-3 text-ds-body text-ds-text-2">{t('wt.emptyAdd')}</p>}
                </RoutineCard>
              </div>
            );
          })}
          {withoutRoutine.map((kind) => (
            <DsCard key={kind} className="flex flex-col items-start gap-2">
              <h3 className="text-ds-title font-semibold text-ds-text">{TYPE_LABEL[kind]}</h3>
              <p className="text-ds-body text-ds-text-2">{t('wt.noWorkout')}</p>
              <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setEditing({ id: kind, exercises: [], by: 'suggested', updatedAt: null })}>{t('wt.create')}</Button>
            </DsCard>
          ))}
        </div>
      </section>

      <UpcomingList
        sessions={upcoming}
        toExercises={toExercises}
        onEdit={(w) => setEditingSession({ w, r: { id: '', exercises: toExercises(w), by: 'own', updatedAt: null } })}
        onMove={setMoving}
        onLog={startSession}
      />

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

