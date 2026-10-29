import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, BatteryMedium, CalendarDays, Gauge, HeartPulse, History, Moon, Sparkles, Waves, Watch } from 'lucide-react';
import { analyze } from '../lib/analysis';
import { estimateMaxHr } from '../lib/planner/fitness';
import { fmtPace } from '../lib/format';
import { useData } from '../lib/data';
import { addDays, daysBetween, mondayOf, weekdayOf } from '../lib/planner/dates';
import { findEasySwap, isRunWorkout } from '../lib/planner/adapt';
import { readiness } from '../lib/planner/readiness';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtRelative, zonePaceText } from '../lib/format';
import { logAdjustment, updateWorkout } from '../lib/api';
import type { PlannedWorkout } from '../lib/types';
import { Badge, Button, Card, CardTitle, cx, Notice, Spinner, useToast } from '../components/ui';
import { KIND_STYLE, pressable, WorkoutDetail, WorkoutRow } from '../components/Workout';
import { BreakBanner, BreakButton } from '../components/BreakDialog';
import { dropClass, useWorkoutDnd } from '../components/MoveWorkout';
import { ReportTeaser } from './Progress';
import { breakPhase, visibleBreak } from '../lib/planner/breaks';
import { VolumeChart, type VolumePoint } from '../components/VolumeChart';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ReadinessCard() {
  const { plan, metrics, today, connection } = useData();
  const r = readiness(metrics, today);
  const brk = plan ? visibleBreak(plan, today) : null;
  const onBreak = !!brk && breakPhase(brk, today) === 'active';
  if (!connection) {
    return (
      <Card>
        <CardTitle icon={<HeartPulse className="h-5 w-5 text-brand" />}>Readiness</CardTitle>
        <p className="text-sm text-slate-600">Connect Garmin to see resting heart rate, HRV, sleep and Body Battery here.</p>
        <Link to="/connect" className="mt-3 inline-block text-sm font-semibold text-brand">Connect Garmin →</Link>
      </Card>
    );
  }
  const m = r.metric;
  const tone = onBreak ? 'blue' : r.level === 'good' ? 'green' : r.level === 'ok' ? 'amber' : r.level === 'low' ? 'red' : 'slate';
  const label = onBreak ? 'On a break' : { good: 'Ready to train', ok: 'Train with care', low: 'Take it easy', unknown: 'No data yet' }[r.level];
  const stat = (icon: ReactNode, name: string, value: string | null) => (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {name}
      </div>
      <div className="mt-1 font-semibold text-slate-900">{value ?? '–'}</div>
    </div>
  );
  return (
    <Card>
      <CardTitle icon={<HeartPulse className="h-5 w-5 text-brand" />} action={<Badge tone={tone}>{label}</Badge>}>
        Readiness
      </CardTitle>
      <div className="grid grid-cols-2 gap-2">
        {stat(<HeartPulse className="h-3.5 w-3.5" />, 'Resting HR', m?.resting_hr ? `${m.resting_hr} bpm` : null)}
        {stat(<Waves className="h-3.5 w-3.5" />, 'HRV', m?.hrv_last_night ? `${Math.round(m.hrv_last_night)} ms${m.hrv_status ? ` · ${m.hrv_status.toLowerCase()}` : ''}` : null)}
        {stat(<Moon className="h-3.5 w-3.5" />, 'Sleep', m?.sleep_s ? `${(m.sleep_s / 3600).toFixed(1)} h${m.sleep_score ? ` · ${m.sleep_score}` : ''}` : null)}
        {stat(<BatteryMedium className="h-3.5 w-3.5" />, 'Body Battery', m?.body_battery_high !== null && m?.body_battery_high !== undefined ? `${m.body_battery_high}` : null)}
      </div>
      {r.reasons.length > 0 && <p className="mt-3 text-xs text-slate-500">{r.reasons.join(' · ')}</p>}
      {m && m.date !== today && <p className="mt-2 text-xs text-slate-400">Latest data from {fmtDate(m.date)}.</p>}
    </Card>
  );
}

function LatestRun() {
  const { plan, workouts, activities, metrics, units, connection, today } = useData();
  if (!plan) return null;
  const run = activities.find((a) => a.sport === 'run' && (a.distance_m ?? 0) > 1000);
  if (!run) return null;
  const workout = workouts.find((w) => w.activity_id === run.id) ?? null;
  const maxHr = estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today);
  const res = analyze({ workout, activity: run, details: null, plan, activities, metrics, maxHr });
  const moving = run.moving_s ?? run.duration_s ?? 0;
  const tone = res.score === null ? 'text-slate-500' : res.score >= 85 ? 'text-emerald-600' : res.score >= 70 ? 'text-lime-600' : res.score >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <Card>
      <CardTitle icon={<Gauge className="h-5 w-5 text-brand" />} action={<Link to={`/analysis/${run.id}`}><Button size="sm" variant="secondary">Full analysis</Button></Link>}>
        Latest run
      </CardTitle>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {res.score !== null && (
          <div>
            <div className={`text-3xl font-extrabold tabular-nums ${tone}`}>{res.score}</div>
            <div className="text-xs capitalize text-slate-500">{res.grade} execution</div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{workout?.title ?? run.name ?? 'Run'}</div>
          <div className="text-sm text-slate-500">
            {fmtDate(run.local_date)} · {fmtDistance((run.distance_m ?? 0) / 1000, units)} · {fmtDuration(moving)}
            {run.distance_m ? ` · ${fmtPace(moving / (run.distance_m / 1000), units)}` : ''}
            {run.avg_hr ? ` · ♥ ${run.avg_hr}` : ''}
          </div>
          <div className="mt-1 text-sm text-slate-700">
            <b>{res.purpose.headline}:</b> {res.insights[0] ?? res.purpose.marathon}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { loading, error, profile, plan, workouts, activities, metrics, adjustments, units, today, connection, reload, adapt } = useData();
  const [open, setOpen] = useState<PlannedWorkout | null>(null);
  const [swapping, setSwapping] = useState(false);
  const toast = useToast();
  const dnd = useWorkoutDnd();

  const volume = useMemo<VolumePoint[]>(() => {
    if (!plan) return [];
    const thisMonday = mondayOf(today);
    const runKm = (from: string, to: string) =>
      activities.filter((a) => a.sport === 'run' && a.local_date >= from && a.local_date <= to).reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
    const points: VolumePoint[] = [];
    for (let i = -6; i <= 6; i++) {
      const start = addDays(thisMonday, i * 7);
      const end = addDays(start, 6);
      if (end < plan.start_date && i < -2) continue;
      if (start > plan.race_date) break;
      const planned = workouts
        .filter((w) => isRunWorkout(w) && w.date >= start && w.date <= end && !(w.status === 'skipped' && w.status_source === 'auto'))
        .reduce((s, w) => s + (w.distance_km ?? 0), 0);
      const week = plan.weeks.find((w) => w.startDate === start);
      points.push({
        label: week ? `W${week.week}` : fmtDate(start, { day: 'numeric', month: 'short' }),
        sublabel: week ? week.phase : '',
        plannedKm: planned,
        actualKm: i <= 0 ? runKm(start, end) : null,
        current: i === 0,
      });
    }
    return points;
  }, [plan, workouts, activities, today]);

  if (loading) return <Spinner label="Loading your training…" />;
  if (error) return <Notice tone="error">{error}</Notice>;

  if (!plan) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-brand" />
        <h1 className="mt-4 text-2xl font-bold">Let's build your marathon plan</h1>
        <p className="mt-2 text-slate-600">
          {profile?.onboarding ? 'Your answers are saved – review your fitness and create the plan.' : 'Answer a few questions about your race and training first.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {!connection && (
            <Link to="/connect">
              <Button variant="secondary" icon={<Watch className="h-4 w-4" />}>Connect Garmin</Button>
            </Link>
          )}
          <Link to={profile?.onboarding ? '/plan/new' : '/onboarding'}>
            <Button>{profile?.onboarding ? 'Create my plan' : 'Start'}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const daysToRace = daysBetween(today, plan.race_date);
  const currentWeek = plan.weeks.find((w) => w.startDate === mondayOf(today));
  const totalWeeks = plan.weeks[plan.weeks.length - 1]?.week ?? 0;
  const todays = workouts.filter((w) => w.date === today && w.status !== 'skipped');
  const weekStart = mondayOf(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekRuns = workouts.filter((w) => isRunWorkout(w) && w.date >= weekStart && w.date <= addDays(weekStart, 6) && w.status !== 'skipped');
  const weekPlanned = weekRuns.reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const weekDone = activities
    .filter((a) => a.sport === 'run' && a.local_date >= weekStart && a.local_date <= addDays(weekStart, 6))
    .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
  const r = readiness(metrics, today);
  const brk = visibleBreak(plan, today);
  const onBreak = !!brk && breakPhase(brk, today) === 'active';
  const swap = r.level === 'low' && !onBreak ? findEasySwap(workouts, today) : null;
  const name = profile?.display_name?.split(' ')[0];

  const doSwap = async () => {
    if (!swap) return;
    setSwapping(true);
    try {
      await updateWorkout(swap.key.id, { date: swap.easy.date, original_date: swap.key.original_date ?? today });
      await updateWorkout(swap.easy.id, { date: today, original_date: swap.easy.original_date ?? swap.easy.date });
      await logAdjustment(plan, 'readiness', `Low readiness: "${swap.key.title}" moved to ${fmtDate(swap.easy.date, { weekday: 'long' })}, easy run today instead.`);
      await reload();
      await adapt();
      toast('Swapped – easy day today.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink to-ink-soft p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-slate-300">{name ? `Hi ${name} – ` : ''}{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{plan.race_name || 'Marathon'}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {currentWeek ? (
                <>
                  Week {currentWeek.week} of {totalWeeks} · <span className="capitalize">{currentWeek.phase}</span>
                  {currentWeek.recovery ? ' · recovery week' : ''}
                </>
              ) : (
                fmtDate(plan.race_date, { day: 'numeric', month: 'long', year: 'numeric' })
              )}
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-4xl font-extrabold tabular-nums text-brand">{Math.max(0, daysToRace)}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">days to go</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold tabular-nums">{fmtDuration(plan.fitness.predictedMarathonS).replace(/:\d\d$/, '')}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">projected h:mm</div>
            </div>
          </div>
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, ((currentWeek?.week ?? 0) / Math.max(1, totalWeeks)) * 100)}%` }} />
        </div>
      </div>

      <BreakBanner />

      {swap && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your body signals fatigue today ({r.reasons.join(', ').toLowerCase()}). Swap <b>{swap.key.title}</b> with the easy run on{' '}
              {fmtDate(swap.easy.date, { weekday: 'long' })}?
            </span>
            <Button size="sm" variant="dark" loading={swapping} onClick={doSwap}>
              Make today easy
            </Button>
          </div>
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={<ActivityIcon className="h-5 w-5 text-brand" />} action={(!brk || breakPhase(brk, today) === 'comeback') && <BreakButton className="-mr-2 text-slate-500" />}>
            Today
          </CardTitle>
          {todays.length ? (
            <div className="space-y-5">
              {todays.map((w) => (
                <div key={w.id}>
                  <WorkoutRow w={w} paces={plan.fitness.paces} units={units} onClick={() => setOpen(w)} />
                  <ul className="mt-3 space-y-1.5 px-1">
                    {w.steps.map((s, i) => {
                      const d = describeStep(s, plan.fitness.paces, units);
                      return (
                        <li key={i} className="flex gap-2.5 text-sm">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          <span>
                            <span className="font-medium text-slate-800">{d.main.charAt(0).toUpperCase() + d.main.slice(1)}</span>
                            {d.detail && <span className="text-slate-500"> · {d.detail}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-6 text-center">
              <div className="text-lg font-semibold">{onBreak ? 'No training today' : 'Rest day'}</div>
              <p className="mt-1 text-sm text-slate-500">
                {onBreak
                  ? brk!.kind === 'sick'
                    ? 'Get well soon – rest is training too. Your plan waits for you.'
                    : 'Give it time to heal. Your plan waits for you.'
                  : 'Recovery is where the adaptation happens. Sleep well, eat well.'}
              </p>
            </div>
          )}
        </Card>
        <ReadinessCard />
      </div>

      <ReportTeaser />

      <LatestRun />

      <Card>
        <CardTitle
          icon={<CalendarDays className="h-5 w-5 text-brand" />}
          action={
            <span className="flex items-center gap-3 text-sm text-slate-500">
              {fmtDistance(weekDone, units)} of {fmtDistance(weekPlanned, units)}
              <Link to="/progress" className="font-semibold text-brand hover:underline">
                Report →
              </Link>
            </span>
          }
        >
          This week
        </CardTitle>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (weekDone / Math.max(1, weekPlanned)) * 100)}%` }} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {weekDays.map((d) => {
            const items = workouts.filter((w) => w.date === d);
            return (
              <div key={d} data-day={d} {...dnd.dropProps(d)} className={cx('rounded-xl p-2 transition', d === today ? 'bg-brand-soft ring-2 ring-brand' : 'bg-slate-50', dropClass(dnd.dropState(d)))}>
                <div className="mb-1.5 flex items-baseline justify-between px-1 sm:block">
                  <span className="text-xs font-semibold text-slate-700">{DAY_SHORT[weekdayOf(d)]}</span>
                  <span className="text-xs text-slate-400 sm:ml-1">{fmtDate(d, { day: 'numeric' })}</span>
                </div>
                <div className="space-y-1.5">
                  {items.length ? (
                    items.map((w) => (
                      <div
                        key={w.id}
                        {...pressable(() => setOpen(w))}
                        {...dnd.dragProps(w)}
                        className={cx(
                          'w-full cursor-pointer rounded-lg bg-white px-2 py-1.5 text-left text-xs ring-1 ring-slate-200 outline-none hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-brand/60',
                          (w.status === 'skipped' || w.status === 'missed') && 'opacity-50',
                          dnd.isDragging(w) && 'opacity-30',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cx('h-2 w-2 shrink-0 rounded-full', KIND_STYLE[w.kind].dot)} />
                          <span className={cx('truncate font-medium', w.status === 'skipped' && 'line-through')}>{KIND_STYLE[w.kind].label}</span>
                          {w.status === 'completed' && <span className="ml-auto text-emerald-600">✓</span>}
                          {w.status === 'missed' && <span className="ml-auto text-red-500">✕</span>}
                        </span>
                        {w.distance_km ? <span className="mt-0.5 block text-slate-500">{fmtDistance(w.distance_km, units)}</span> : null}
                      </div>
                    ))
                  ) : (
                    <div className="px-1 text-xs text-slate-400">Rest</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Weekly volume</CardTitle>
          <VolumeChart data={volume} units={units} />
        </Card>
        <Card>
          <CardTitle icon={<Sparkles className="h-5 w-5 text-brand" />} action={<Badge tone="orange">VDOT {plan.fitness.vdot.toFixed(1)}</Badge>}>
            Your paces
          </CardTitle>
          <div className="space-y-2 text-sm">
            {(
              [
                ['easy', 'Easy'],
                ['long', 'Long run'],
                ['marathon', 'Marathon pace'],
                ['threshold', 'Threshold'],
                ['interval', 'Intervals'],
              ] as const
            ).map(([z, label]) => (
              <div key={z} className="flex justify-between gap-3">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold tabular-nums">{zonePaceText(plan.fitness.paces, z, units)}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Paces update automatically when your Garmin runs show a change in fitness.</p>
        </Card>
      </div>

      <Card>
        <CardTitle icon={<History className="h-5 w-5 text-brand" />} action={connection && <span className="text-xs text-slate-400">Garmin synced {fmtRelative(connection.last_sync_at)}</span>}>
          Plan adjustments
        </CardTitle>
        {adjustments.length ? (
          <ul className="space-y-3">
            {adjustments.slice(0, 8).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <p className="text-slate-800">{a.message}</p>
                  <p className="text-xs text-slate-400">{fmtRelative(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No changes yet. When you miss or move sessions, the planner explains what it adjusted here.</p>
        )}
      </Card>

      <WorkoutDetail w={open} onClose={() => setOpen(null)} />
      {dnd.dialog}
    </div>
  );
}
