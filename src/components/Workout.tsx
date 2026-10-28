import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Bike, Check, CircleDashed, Dumbbell, Flag, Footprints, Gauge, PersonStanding, RotateCcw, SkipForward, Sparkles, Target, Waves, X, Zap } from 'lucide-react';
import { purposeFor } from '../lib/analysis';
import type { Activity, Paces, PlannedWorkout, Units, WorkoutKind } from '../lib/types';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtMinutes, fmtPace, keyPace, fromUnit, toUnit } from '../lib/format';
import { isRunWorkout } from '../lib/planner/adapt';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import * as api from '../lib/api';
import { Badge, Button, cx, Field, Input, Modal, Notice, useToast } from './ui';
import { SendToWatch } from './WatchSync';

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

export function WorkoutDetail({ w, onClose }: { w: PlannedWorkout | null; onClose: () => void }) {
  const { plan, units, activities, adapt, reload, today } = useData();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'log' | 'move'>('view');
  const [logKm, setLogKm] = useState('');
  const [logMin, setLogMin] = useState('');
  const [moveTo, setMoveTo] = useState('');

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
        {w.original_date && <Notice tone="info">Moved from {fmtDate(w.original_date)} by the planner.</Notice>}
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

        <SendToWatch w={w} />

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

        {mode === 'move' && (
          <div className="flex items-end gap-2 rounded-xl bg-slate-50 p-3">
            <Field label="Move to" className="flex-1">
              <Input type="date" min={today} max={plan.race_date} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
            </Field>
            <Button
              disabled={!moveTo}
              loading={busy}
              onClick={() => act(() => api.updateWorkout(w.id, { date: moveTo, original_date: w.original_date ?? w.date, status: 'planned', status_source: 'auto' }), 'Workout moved')}
            >
              Move
            </Button>
          </div>
        )}

        {mode === 'view' && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {(w.status === 'planned' || w.status === 'missed') && w.date <= today && (
              <Button size="sm" onClick={() => setMode('log')} icon={<Check className="h-4 w-4" />}>
                Log as done
              </Button>
            )}
            {w.status === 'planned' && w.kind !== 'race' && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setMode('move')} icon={<ArrowRightLeft className="h-4 w-4" />}>
                  Move
                </Button>
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
