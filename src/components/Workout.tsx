import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Bike, Check, CircleDashed, Dumbbell, Flag, Footprints, Gauge, PersonStanding, RotateCcw, SkipForward, Sparkles, Target, Undo2, Waves, X, Zap } from 'lucide-react';
import { purposeFor } from '../lib/analysis';
import type { Activity, Paces, PlannedWorkout, Units, WorkoutKind } from '../lib/types';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtMinutes, fmtPace, keyPace, fromUnit, toUnit } from '../lib/format';
import { isRunWorkout, type WorkoutPatch } from '../lib/planner/adapt';
import { addDays } from '../lib/planner/dates';
import { canMove, inBounds, moveBounds, moveDays, movePatches, moveWarnings, swapCandidate } from '../lib/planner/move';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import * as api from '../lib/api';
import { Badge, Button, cx, Field, Input, Modal, Notice, useToast } from './ui';

export const KIND_STYLE: Record<WorkoutKind, { label: string; dot: string; bar: string; soft: string }> = {
  easy: { label: 'Easy', dot: 'bg-emerald-500', bar: 'border-l-emerald-500', soft: 'bg-emerald-50' },
  recovery: { label: 'Recovery', dot: 'bg-teal-400', bar: 'border-l-teal-400', soft: 'bg-teal-50' },
  long: { label: 'Long run', dot: 'bg-sky-600', bar: 'border-l-sky-600', soft: 'bg-sky-50' },
  long_mp: { label: 'Long + MP', dot: 'bg-indigo-600', bar: 'border-l-indigo-600', soft: 'bg-indigo-50' },
  threshold: { label: 'Threshold', dot: 'bg-orange-500', bar: 'border-l-orange-500', soft: 'bg-orange-50' },
  intervals: { label: 'Intervals', dot: 'bg-red-500', bar: 'border-l-red-500', soft: 'bg-red-50' },
  marathon_pace: { label: 'Marathon pace', dot: 'bg-fuchsia-600', bar: 'border-l-fuchsia-600', soft: 'bg-fuchsia-50' },
  fartlek: { label: 'Fartlek', dot: 'bg-amber-500', bar: 'border-l-amber-500', soft: 'bg-amber-50' },
  shakeout: { label: 'Shakeout', dot: 'bg-teal-400', bar: 'border-l-teal-400', soft: 'bg-teal-50' },
  race: { label: 'Race', dot: 'bg-yellow-400', bar: 'border-l-yellow-400', soft: 'bg-yellow-50' },
  strength_upper: { label: 'Upper body', dot: 'bg-violet-500', bar: 'border-l-violet-500', soft: 'bg-violet-50' },
  strength_lower: { label: 'Lower body', dot: 'bg-violet-600', bar: 'border-l-violet-600', soft: 'bg-violet-50' },
  strength_full: { label: 'Full body', dot: 'bg-violet-500', bar: 'border-l-violet-500', soft: 'bg-violet-50' },
  core: { label: 'Core', dot: 'bg-purple-400', bar: 'border-l-purple-400', soft: 'bg-purple-50' },
  mobility: { label: 'Mobility', dot: 'bg-lime-500', bar: 'border-l-lime-500', soft: 'bg-lime-50' },
  plyo: { label: 'Plyometrics', dot: 'bg-pink-500', bar: 'border-l-pink-500', soft: 'bg-pink-50' },
  bike: { label: 'Cycling', dot: 'bg-cyan-500', bar: 'border-l-cyan-500', soft: 'bg-cyan-50' },
  swim: { label: 'Swimming', dot: 'bg-blue-400', bar: 'border-l-blue-400', soft: 'bg-blue-50' },
  custom: { label: 'Own workout', dot: 'bg-slate-500', bar: 'border-l-slate-500', soft: 'bg-slate-50' },
};

export function StatusBadge({ w }: { w: PlannedWorkout }) {
  switch (w.status) {
    case 'completed':
      return <Badge tone="green"><Check className="h-3 w-3" /> Done</Badge>;
    case 'partial':
      return <Badge tone="amber">Partly done</Badge>;
    case 'missed':
      return <Badge tone="red"><X className="h-3 w-3" /> Missed</Badge>;
    case 'skipped':
      return <Badge>Skipped</Badge>;
    default:
      return w.original_date ? <Badge tone="blue"><ArrowRightLeft className="h-3 w-3" /> Moved</Badge> : null;
  }
}

function WorkoutIcon({ kind, className }: { kind: WorkoutKind; className?: string }) {
  if (kind.startsWith('strength')) return <Dumbbell className={className} />;
  if (kind === 'core') return <Target className={className} />;
  if (kind === 'mobility') return <PersonStanding className={className} />;
  if (kind === 'plyo') return <Zap className={className} />;
  if (kind === 'bike') return <Bike className={className} />;
  if (kind === 'swim') return <Waves className={className} />;
  if (kind === 'custom') return <Sparkles className={className} />;
  if (kind === 'race') return <Flag className={className} />;
  return <Footprints className={className} />;
}

function StatusIcon({ w }: { w: PlannedWorkout }) {
  if (w.status === 'completed') return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Done" />;
  if (w.status === 'partial') return <Check className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Partly done" />;
  if (w.status === 'missed') return <X className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Missed" />;
  if (w.status === 'skipped') return <SkipForward className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Skipped" />;
  if (w.original_date) return <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-label="Moved" />;
  return null;
}

export function WorkoutRow({ w, paces, units, onClick, compact }: { w: PlannedWorkout; paces: Paces; units: Units; onClick?: () => void; compact?: boolean }) {
  const style = KIND_STYLE[w.kind];
  const pace = isRunWorkout(w) ? keyPace(w.steps, paces, units) : null;
  const muted = w.status === 'skipped' || w.status === 'missed';
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cx('w-full rounded-lg border-l-[3px] bg-white px-2 py-1.5 text-left ring-1 ring-slate-200 transition hover:ring-slate-300', style.bar, muted && 'opacity-60')}
      >
        <div className="flex items-center gap-1">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{style.label}</span>
          {w.key_session && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" title="Key session" />}
          <span className="ml-auto">
            <StatusIcon w={w} />
          </span>
        </div>
        <div className={cx('text-[13px] leading-snug font-semibold text-slate-900', w.status === 'skipped' && 'line-through')}>{w.title}</div>
        <div className="text-[11px] text-slate-500">
          {w.distance_km ? fmtDistance(w.distance_km, units) : `~${fmtMinutes(w.duration_min)}`}
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={cx(
        'group w-full rounded-xl border-l-4 bg-white p-3 text-left ring-1 ring-slate-200 transition hover:ring-slate-300 hover:shadow-sm',
        style.bar,
        muted && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <WorkoutIcon kind={w.kind} className="h-3.5 w-3.5" />
            {style.label}
            {w.key_session && <span className="text-brand">· key</span>}
          </div>
          <div className={cx('mt-0.5 font-semibold text-slate-900', compact ? 'text-sm' : 'text-[15px]', w.status === 'skipped' && 'line-through')}>{w.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {w.distance_km ? <span>{fmtDistance(w.distance_km, units)}</span> : null}
            {w.duration_min ? <span>~{fmtMinutes(w.duration_min)}</span> : null}
            {pace && !compact && <span>{pace}</span>}
          </div>
        </div>
        <StatusBadge w={w} />
      </div>
    </button>
  );
}

type Patches = { id: string; patch: WorkoutPatch }[];

/** Pick a day (a week around the workout, or any date) and move or swap. */
function MovePanel({ w, busy, onMove }: { w: PlannedWorkout; busy: boolean; onMove: (patches: Patches, message: string) => void }) {
  const { plan, workouts, today } = useData();
  const [target, setTarget] = useState<string | null>(null);
  if (!plan) return null;
  const bounds = moveBounds(today, plan.race_date);
  const days = moveDays(w, today, plan.race_date);
  const dayName = (d: string) => (d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : fmtDate(d, { weekday: 'short' }));
  const onDay = (d: string) => workouts.filter((o) => o.id !== w.id && o.date === d && o.status !== 'skipped');
  const valid = !!target && target !== w.date && inBounds(target, bounds);
  const swap = valid ? swapCandidate(workouts, w, target, today) : null;
  const warnings = valid ? moveWarnings(workouts, movePatches(workouts, w, target, today, !!swap)) : [];

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-900">Move to</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {days.map((d) => {
          const current = d === w.date;
          const items = onDay(d);
          return (
            <button
              key={d}
              type="button"
              disabled={current}
              onClick={() => setTarget(d)}
              className={cx(
                'rounded-lg p-2 text-left transition',
                target === d ? 'bg-brand-soft ring-2 ring-brand' : 'bg-white ring-1 ring-slate-200 hover:ring-slate-300',
                current && 'cursor-default opacity-50',
              )}
            >
              <div className="text-xs font-semibold text-slate-900">{dayName(d)}</div>
              <div className="truncate text-[11px] text-slate-500">
                {fmtDate(d, { day: 'numeric', month: 'short' })} · {current ? 'now' : items.length ? items.map((o) => KIND_STYLE[o.kind].label).join(' + ') : 'Rest'}
              </div>
              {d === w.original_date && !current && <div className="text-[11px] font-semibold text-sky-700">Original day</div>}
            </button>
          );
        })}
      </div>
      <Field label="Or any other day">
        <Input type="date" min={bounds.min} max={bounds.max} value={target && !days.includes(target) ? target : ''} onChange={(e) => setTarget(e.target.value || null)} />
      </Field>
      {target && !valid && target !== w.date && (
        <Notice tone="error">Pick a day from today until {fmtDate(bounds.max)} – workouts can't move into the past.</Notice>
      )}
      {valid && (
        <>
          {warnings.map((m) => (
            <Notice key={m} tone="warn">{m}</Notice>
          ))}
          <div className="flex flex-wrap gap-2">
            {swap && (
              <Button loading={busy} onClick={() => onMove(movePatches(workouts, w, target, today, true), `Swapped with ${swap.title}`)} icon={<ArrowRightLeft className="h-4 w-4" />}>
                Swap days
              </Button>
            )}
            <Button variant={swap ? 'secondary' : 'primary'} loading={busy} onClick={() => onMove(movePatches(workouts, w, target, today, false), `Moved to ${fmtDate(target)}`)}>
              {swap ? 'Move – keep both' : `Move to ${fmtDate(target)}`}
            </Button>
          </div>
          {swap && (
            <p className="text-xs text-slate-500">
              Swap puts "{swap.title}" on {fmtDate(w.date)} instead.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function WorkoutDetail({ w, onClose }: { w: PlannedWorkout | null; onClose: () => void }) {
  const { plan, units, activities, workouts, adapt, reload, today } = useData();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'log' | 'move'>('view');
  const [logKm, setLogKm] = useState('');
  const [logMin, setLogMin] = useState('');

  if (!w || !plan) return null;
  const paces = plan.fitness.paces;
  const activity: Activity | undefined = activities.find((a) => a.id === w.activity_id);
  const run = isRunWorkout(w);

  const act = async (fn: () => Promise<void>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg, 'success');
      await reload();
      await adapt();
      setMode('view');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const persist = async (patches: Patches) => {
    await Promise.all(patches.map((p) => api.updateWorkout(p.id, p.patch)));
  };
  const home = w.original_date && w.original_date !== w.date ? w.original_date : null;
  const canGoHome = !!home && canMove(w) && inBounds(home, moveBounds(today, plan.race_date));

  const logDone = () =>
    act(async () => {
      const km = run ? fromUnit(Number(logKm || toUnit(w.distance_km ?? 0, units)), units) : null;
      const minutes = Number(logMin || w.duration_min || 0);
      const [created] = await api.insertActivities([
        {
          user_id: user!.id,
          source: 'manual',
          external_id: null,
          name: w.title,
          sport: run ? 'run' : 'strength',
          sub_type: 'manual',
          start_time: `${w.date}T12:00:00Z`,
          local_date: w.date,
          duration_s: minutes ? Math.round(minutes * 60) : null,
          moving_s: minutes ? Math.round(minutes * 60) : null,
          distance_m: km ? Math.round(km * 1000) : null,
          avg_hr: null,
          max_hr: null,
          elevation_gain_m: null,
          calories: null,
          training_load: null,
          aerobic_te: null,
          vo2max: null,
        },
      ]);
      await api.updateWorkout(w.id, {
        status: km && w.distance_km && km / w.distance_km < 0.75 ? 'partial' : 'completed',
        status_source: 'user',
        activity_id: created?.id ?? null,
        actual_distance_km: km ? Math.round(km * 10) / 10 : null,
      });
    }, 'Logged – nice work!');

  return (
    <Modal open={!!w} onClose={onClose} title={<span>{w.title}</span>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span>·</span>
          <span className="capitalize">{w.phase} phase</span>
          <StatusBadge w={w} />
        </div>
        {home && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
            <span className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4 shrink-0" /> Originally planned for {fmtDate(home, { weekday: 'long', day: 'numeric', month: 'short' })}.
            </span>
            {canGoHome && (
              <Button size="sm" variant="secondary" loading={busy} icon={<Undo2 className="h-4 w-4" />}
                onClick={() => act(() => persist(movePatches(workouts, w, home, today, false)), 'Back on its original day')}>
                Move back
              </Button>
            )}
          </div>
        )}
        <div className="rounded-xl bg-brand-soft/60 p-3 text-sm">
          <div className="font-semibold text-slate-900">Why: {purposeFor(w.kind).headline}</div>
          <p className="mt-0.5 text-slate-700">{purposeFor(w.kind).why}</p>
        </div>
        {w.note && <Notice tone="warn">{w.note}</Notice>}

        <div className="flex gap-4 rounded-xl bg-slate-50 p-3 text-sm">
          {w.distance_km ? (
            <div>
              <div className="text-xs text-slate-500">Distance</div>
              <div className="font-semibold">{fmtDistance(w.distance_km, units)}</div>
            </div>
          ) : null}
          {w.duration_min ? (
            <div>
              <div className="text-xs text-slate-500">Time</div>
              <div className="font-semibold">~{fmtMinutes(w.duration_min)}</div>
            </div>
          ) : null}
        </div>

        <ol className="space-y-2">
          {w.steps.map((s, i) => {
            const d = describeStep(s, paces, units);
            return (
              <li key={i} className="flex gap-3 rounded-xl ring-1 ring-slate-200 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium text-slate-900 first-letter:uppercase">{d.main}</div>
                  {d.detail && <div className="text-xs text-slate-500">{d.detail}</div>}
                </div>
              </li>
            );
          })}
        </ol>

        {activity && (
          <Link to={`/analysis/${activity.id}`} onClick={onClose} className="block">
            <Button className="w-full" variant="dark" icon={<Gauge className="h-4 w-4" />}>
              Open workout analysis
            </Button>
          </Link>
        )}
        {activity && (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
            <div className="font-semibold text-emerald-900">{activity.name ?? 'Activity'} ({activity.source === 'garmin' ? 'Garmin' : activity.source === 'fit' ? 'FIT file' : 'logged manually'})</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-emerald-900/80">
              {activity.distance_m ? <span>{fmtDistance(activity.distance_m / 1000, units, 2)}</span> : null}
              {activity.moving_s || activity.duration_s ? <span>{fmtDuration(activity.moving_s ?? activity.duration_s)}</span> : null}
              {activity.distance_m && (activity.moving_s ?? activity.duration_s) ? (
                <span>{fmtPace((activity.moving_s ?? activity.duration_s)! / (activity.distance_m / 1000), units)}</span>
              ) : null}
              {activity.avg_hr ? <span>♥ {activity.avg_hr} bpm</span> : null}
            </div>
          </div>
        )}

        {mode === 'log' && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
            {run && (
              <Field label={`Distance (${units})`}>
                <Input type="number" inputMode="decimal" step="0.1" placeholder={toUnit(w.distance_km ?? 0, units).toFixed(1)} value={logKm} onChange={(e) => setLogKm(e.target.value)} />
              </Field>
            )}
            <Field label="Duration (min)">
              <Input type="number" inputMode="numeric" placeholder={String(w.duration_min ?? '')} value={logMin} onChange={(e) => setLogMin(e.target.value)} />
            </Field>
            <Button className="col-span-2" loading={busy} onClick={logDone} icon={<Check className="h-4 w-4" />}>
              Save as done
            </Button>
          </div>
        )}

        {mode === 'move' && <MovePanel w={w} busy={busy} onMove={(patches, message) => act(() => persist(patches), message)} />}

        {mode === 'view' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {(w.status === 'planned' || w.status === 'missed') && w.date <= today && (
              <Button size="sm" onClick={() => setMode('log')} icon={<Check className="h-4 w-4" />}>
                Log as done
              </Button>
            )}
            {canMove(w) && (
              <Button size="sm" variant="secondary" onClick={() => setMode('move')} icon={<ArrowRightLeft className="h-4 w-4" />}>
                Move
              </Button>
            )}
            {w.status === 'planned' && w.kind !== 'race' && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => act(() => api.updateWorkout(w.id, { status: 'skipped', status_source: 'user' }), 'Workout skipped')}
                  icon={<SkipForward className="h-4 w-4" />}
                >
                  Skip
                </Button>
              </>
            )}
            {w.status !== 'planned' && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() =>
                  act(() =>
                    api.updateWorkout(w.id, { status: 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, note: null }),
                  )
                }
                icon={<RotateCcw className="h-4 w-4" />}
              >
                Reset
              </Button>
            )}
            {w.status === 'planned' && w.date > today && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <CircleDashed className="h-3.5 w-3.5" /> Syncs automatically from Garmin once done.
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
