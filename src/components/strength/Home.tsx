// The Strength home in the design system's style (design-system/MASTER.md): the week with its training dots, today's
// workout with its muscles, today's run when it is a run day, the last sessions, the person's workouts and what comes next.

import { useMemo } from 'react';
import { CalendarClock, ChevronRight, Clock, Dumbbell, Gauge, Layers, ListChecks, Pencil, Play, Route, Trash2, Trophy } from 'lucide-react';
import { Button, cx } from '../ui';
import { DsCard, MuscleChips, SectionHeader, Stat, fmtVolume, type DayMark, type WeekDay } from '../ds';
import { MuscleMap } from './MuscleMap';
import { workoutMuscles } from '../../lib/exerciseInfo';
import { exName } from '../../lib/strengthFormat';
import { groupSessions, lastWeightOf, personalRecords, repRange, exerciseKeyOf, type SetRow } from '../../lib/strengthStats';
import { fmtDay, keyPace, localTitle } from '../../lib/format';
import { isRunWorkout } from '../../lib/planner/adapt';
import { addDays, mondayOf } from '../../lib/planner/dates';
import { useI18n } from '../../lib/i18n';
import type { Activity, Paces, PlannedWorkout, Units } from '../../lib/types';
import { isGymSession } from './context';

type Ex = { key?: string; id?: string; name: string; sets: number; reps: string; kg?: number | null };

/** Week Monday–Sunday: strength and run per day, done or planned. */
export function weekDays(today: string, workouts: PlannedWorkout[], rows: SetRow[], activities: Activity[]): WeekDay[] {
  const monday = mondayOf(today);
  const liftedOn = new Set(rows.map((r) => r.local_date));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const ofDay = workouts.filter((w) => w.date === date);
    const gym = ofDay.filter(isGymSession);
    const runs = ofDay.filter((w) => isRunWorkout(w));
    const ran = activities.some((a) => a.local_date === date && a.sport === 'run');
    const mark = (done: boolean, planned: boolean): DayMark => (done ? 'done' : planned ? 'planned' : null);
    return {
      date,
      strength: mark(liftedOn.has(date) || gym.some((w) => w.status === 'completed'), gym.some((w) => w.status === 'planned')),
      run: mark(ran || runs.some((w) => w.status === 'completed'), runs.some((w) => w.status === 'planned' || w.status === 'partial')),
    };
  });
}

/** Estimated volume of a workout from the weights of last time (null when no exercise has a weight yet). */
export function estimatedVolume(exercises: Ex[], last: Map<string, { kg: number; date: string }>): number | null {
  let kg = 0;
  let any = false;
  for (const x of exercises) {
    const w = x.kg ?? lastWeightOf(last, x)?.kg;
    const r = repRange(x.reps);
    if (!w || !r) continue;
    any = true;
    kg += w * x.sets * r[0];
  }
  return any ? kg : null;
}

/** Today's (or the next) strength workout: name, muscles, three stats, muscle chips, one start button. */
export function TodayHero({ title, dayText, minutes, exercises, last, onStart, onEdit, onMove }: {
  title: string; dayText: string; minutes: number; exercises: Ex[]; last: Map<string, { kg: number; date: string }>;
  onStart: () => void; onEdit: () => void; onMove: () => void;
}) {
  const { t } = useI18n();
  const load = useMemo(() => workoutMuscles(exercises), [exercises]);
  const vol = estimatedVolume(exercises, last);
  const v = vol ? fmtVolume(vol) : null;
  return (
    <DsCard className="!p-5" data-testid="today-hero">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-ds-caption font-semibold text-ds-text-2">
            <span className="h-2 w-2 rounded-full bg-ds-strength" aria-hidden />
            {dayText}
          </div>
          <h2 className="mt-1 font-display text-ds-display font-bold text-ds-text">{title}</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <Stat icon={Clock} value={minutes} unit="min" label={t('ds.stat.duration')} />
            <Stat icon={ListChecks} value={exercises.length} label={t('ds.stat.exercises')} />
            {v && <Stat icon={Dumbbell} value={`~${v.value}`} unit={v.unit} label={t('ds.stat.volumeEst')} />}
          </div>
          <MuscleChips load={load} className="mt-4" />
        </div>
        <MuscleMap load={load} variant="color" className="w-24 shrink-0 self-start sm:w-32" />
      </div>
      <div className="mt-5 flex gap-2">
        <Button size="lg" className="flex-1 !rounded-ds-md" icon={<Play className="h-5 w-5" />} onClick={onStart}>{t('wt.start')}</Button>
        <IconButton label={t('wt.edit')} onClick={onEdit}><Pencil className="h-5 w-5" /></IconButton>
        <IconButton label={t('smv.button')} onClick={onMove}><CalendarClock className="h-5 w-5" /></IconButton>
      </div>
    </DsCard>
  );
}

export function IconButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ds-md bg-ds-surface-2 text-ds-text-2 transition duration-150 hover:text-ds-text active:scale-95', className)}>
      {children}
    </button>
  );
}

/** Today's run on a run day: distance, duration, key pace. */
export function RunToday({ w, paces, units }: { w: PlannedWorkout; paces: Paces | null; units: Units }) {
  const { t } = useI18n();
  const pace = paces ? keyPace(w.steps, paces, units) : null;
  return (
    <DsCard data-testid="run-today">
      <div className="flex items-center gap-2 text-ds-caption font-semibold text-ds-text-2">
        <span className="h-2 w-2 rounded-full bg-ds-run" aria-hidden />{t('ds.runToday')}
      </div>
      <h2 className="mt-1 text-ds-title font-semibold text-ds-text">{localTitle(w.title)}</h2>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {w.distance_km != null && <Stat icon={Route} value={new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(units === 'mi' ? w.distance_km / 1.609344 : w.distance_km)} unit={units} label={t('ds.stat.distance')} />}
        {w.duration_min != null && <Stat icon={Clock} value={w.duration_min} unit="min" label={t('ds.stat.duration')} />}
        {pace && <Stat icon={Gauge} value={pace} label={t('ds.stat.pace')} />}
      </div>
    </DsCard>
  );
}

/** The last sessions: mini body, date, three stats, a trophy when a record was set. */
export function RecentSessions({ rows, today, onAll }: { rows: SetRow[]; today: string; onAll: () => void }) {
  const { t } = useI18n();
  const sessions = useMemo(() => groupSessions(rows).slice(0, 4), [rows]);
  const records = useMemo(() => personalRecords(rows), [rows]);
  if (!sessions.length) return null;
  return (
    <section>
      <SectionHeader title={t('ds.recent')} action={<button type="button" onClick={onAll} className="flex min-h-11 items-center gap-1 text-ds-caption font-semibold text-ds-accent">{t('ds.all')}<ChevronRight className="h-4 w-4" /></button>} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {sessions.map((s) => {
          const load = workoutMuscles(s.exercises.map((name) => ({ name })));
          const keys = new Set(s.sets.map(exerciseKeyOf));
          const pr = records.some((r) => r.date === s.date && keys.has(r.key));
          const v = fmtVolume(s.volume);
          return (
            <li key={s.key}>
              <DsCard className="flex items-center gap-3 !p-3">
                <MuscleMap load={load} variant="color" className="w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-ds-body font-semibold text-ds-text">{fmtDay(s.date, today, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {pr && <Trophy className="h-4 w-4 text-ds-accent" aria-label={t('ds.pr')} />}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <Stat icon={ListChecks} value={s.exercises.length} label={t('ds.stat.exercises')} />
                    <Stat icon={Layers} value={s.sets.length} label={t('ds.stat.sets')} />
                    {s.volume > 0 && <Stat icon={Dumbbell} value={v.value} unit={v.unit} label={t('ds.stat.volume')} />}
                  </div>
                </div>
              </DsCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One of the person's workouts: name, muscles, duration and exercise count, start. */
export function RoutineCard({ name, badge, minutes, exercises, onStart, onEdit, onDelete, open, onToggle, children }: {
  name: string; badge: string; minutes: number; exercises: Ex[]; onStart: () => void; onEdit: () => void; onDelete: () => void;
  open: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const load = useMemo(() => workoutMuscles(exercises), [exercises]);
  return (
    <DsCard className="flex flex-col">
      <div className="flex gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="text-ds-caption font-semibold text-ds-text-3">{badge}</span>
          <span className="block text-ds-title font-semibold text-ds-text">{name}</span>
          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Stat icon={Clock} value={minutes} unit="min" label={t('ds.stat.duration')} />
            <Stat icon={ListChecks} value={exercises.length} label={t('ds.stat.exercises')} />
          </span>
          <MuscleChips load={load} className="mt-3" max={5} />
        </button>
        <MuscleMap load={load} variant="color" className="w-20 shrink-0 self-start" />
      </div>
      <div className="fold" data-open={open}>
        <div>
          <ul className="mt-4 divide-y divide-ds-line rounded-ds-md bg-ds-surface-2">
            {exercises.map((x, i) => (
              <li key={`${x.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0 truncate text-ds-body text-ds-text">{exName(x.name)}</span>
                <span className="shrink-0 text-ds-caption tabular-nums text-ds-text-2">{x.sets} × {x.reps}</span>
              </li>
            ))}
          </ul>
          {children}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1 !rounded-ds-md" disabled={!exercises.length} icon={<Play className="h-4 w-4" />} onClick={onStart}>{t('wt.startNow')}</Button>
        <IconButton label={t('wt.edit')} onClick={onEdit}><Pencil className="h-5 w-5" /></IconButton>
        <IconButton label={t('dw.button')} onClick={onDelete}><Trash2 className="h-5 w-5" /></IconButton>
      </div>
    </DsCard>
  );
}

/** What comes next: date, workout, muscles; the actions as icons. */
export function UpcomingList({ sessions, onEdit, onMove, onLog, toExercises }: {
  sessions: PlannedWorkout[]; onEdit: (w: PlannedWorkout) => void; onMove: (w: PlannedWorkout) => void; onLog: (w: PlannedWorkout) => void;
  toExercises: (w: PlannedWorkout) => Ex[];
}) {
  const { t } = useI18n();
  if (!sessions.length) return null;
  return (
    <section>
      <SectionHeader title={t('wt.coming')} />
      <ul className="space-y-2">
        {sessions.map((w) => {
          const ex = toExercises(w);
          return (
            <li key={w.id}>
              <DsCard className="flex items-center gap-3 !p-3">
                <div className="w-12 shrink-0 text-center">
                  <div className="text-ds-caption text-ds-text-3">{new Date(`${w.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</div>
                  <div className="font-display text-ds-title font-bold tabular-nums text-ds-text">{new Date(`${w.date}T12:00:00Z`).getUTCDate()}</div>
                </div>
                <button type="button" onClick={() => onEdit(w)} className="min-w-0 flex-1 text-left" aria-label={`${t('wt.edit')}: ${localTitle(w.title)}`}>
                  <div className="truncate text-ds-body font-semibold text-ds-text">{localTitle(w.title)}</div>
                  <MuscleChips load={workoutMuscles(ex)} max={5} className="mt-1.5" />
                </button>
                <div className="flex shrink-0 gap-1">
                  <IconButton label={t('smv.aria', { name: localTitle(w.title) })} onClick={() => onMove(w)}><CalendarClock className="h-4 w-4" /></IconButton>
                  <IconButton label={t('wt.log')} onClick={() => onLog(w)}><Play className="h-4 w-4" /></IconButton>
                </div>
              </DsCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
