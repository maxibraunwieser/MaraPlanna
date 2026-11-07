import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, CalendarDays, Gauge, History, Sparkles, Watch } from 'lucide-react';
import { analyze } from '../lib/analysis';
import { estimateMaxHr } from '../lib/planner/fitness';
import { fmtPace } from '../lib/format';
import { useI18n, type MsgKey } from '../lib/i18n';
import { weekdayNames } from '../lib/i18n/dates';
import { useData } from '../lib/data';
import { addDays, englishWeekday, mondayOf, weekdayOf } from '../lib/planner/dates';
import { findEasySwap, isRunWorkout } from '../lib/planner/adapt';
import { readiness } from '../lib/planner/readiness';
import { useActivityDetails } from '../lib/details';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtRelative, localMessage, localTitle, zonePaceText } from '../lib/format';
import { logAdjustment, updateWorkout } from '../lib/api';
import type { PlannedWorkout } from '../lib/types';
import { Badge, Button, Card, CardTitle, cx, Notice, Spinner, useToast } from '../components/ui';
import { KIND_STYLE, pressable, WorkoutDetail, WorkoutRow } from '../components/Workout';
import { dropClass, useWorkoutDnd } from '../components/MoveWorkout';
import { ReportTeaser } from './Progress';
import { VolumeChart, type VolumePoint } from '../components/VolumeChart';
import { HomeHero } from '../components/home/HomeHero';

function LatestRun() {
  const { plan, workouts, activities, metrics, units, connection, today } = useData();
  const { t } = useI18n();
  const run = activities.find((a) => a.sport === 'run' && (a.distance_m ?? 0) > 1000);
  // Score from the same lap/stream data as the full analysis.
  const { ready, detailsOf } = useActivityDetails(run ? [run] : []);
  if (!plan || !run) return null;
  const workout = workouts.find((w) => w.activity_id === run.id) ?? null;
  const maxHr = estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today);
  const res = analyze({ workout, activity: run, details: detailsOf(run), plan, activities, metrics, maxHr });
  const moving = run.moving_s ?? run.duration_s ?? 0;
  const tone = res.score === null ? 'text-slate-500' : res.score >= 85 ? 'text-emerald-600' : res.score >= 70 ? 'text-lime-600' : res.score >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <Card>
      <CardTitle icon={<Gauge className="h-5 w-5 text-brand" />} action={<Link to={`/analysis/${run.id}`}><Button size="sm" variant="secondary">{t('dash.fullAnalysis')}</Button></Link>}>
        {t('dash.latest')}
      </CardTitle>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {!ready ? (
          <div className="w-16">
            <div className="h-8 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-1 h-3 animate-pulse rounded bg-slate-100" />
          </div>
        ) : (
          res.score !== null && (
            <div>
              <div className={`text-3xl font-extrabold tabular-nums ${tone}`}>{res.score}</div>
              <div className="text-xs text-slate-500">{res.grade ? t(`dash.grade.${res.grade}` as MsgKey) : ''}</div>
            </div>
          )
        )}
        <div className="min-w-[14rem] flex-1">
          <div className="font-semibold text-slate-900">{workout ? localTitle(workout.title) : (run.name ?? t('dash.run'))}</div>
          <div className="text-sm text-slate-500">
            {fmtDate(run.local_date)} · {fmtDistance((run.distance_m ?? 0) / 1000, units)} · {fmtDuration(moving)}
            {run.distance_m ? ` · ${fmtPace(moving / (run.distance_m / 1000), units)}` : ''}
            {run.avg_hr ? ` · ♥ ${run.avg_hr}` : ''}
          </div>
          <div className="mt-1 text-sm text-slate-700">
            <b>{res.purpose.headline}:</b> {ready ? (res.insights[0] ?? res.purpose.marathon) : res.purpose.marathon}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { loading, error, profile, plan, workouts, activities, metrics, adjustments, units, today, connection, reload, adapt } = useData();
  const { t, lang } = useI18n();
  const dayShort = weekdayNames(lang);
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
        label: week ? t('common.weekShort', { n: week.week }) : fmtDate(start, { day: 'numeric', month: 'short' }),
        sublabel: week ? t(`phase.${week.phase}` as MsgKey) : '',
        plannedKm: planned,
        actualKm: i <= 0 ? runKm(start, end) : null,
        current: i === 0,
      });
    }
    return points;
  }, [plan, workouts, activities, today]);

  if (loading) return <Spinner label={t('dash.loading')} />;
  if (error) return <Notice tone="error">{error}</Notice>;

  if (!plan) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-brand" />
        <h1 className="mt-4 text-2xl font-bold">{t('dash.build')}</h1>
        <p className="mt-2 text-slate-600">
          {profile?.onboarding ? t('dash.saved') : t('dash.first')}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {!connection && (
            <Link to="/connect">
              <Button variant="secondary" icon={<Watch className="h-4 w-4" />}>{t('sync.connect')}</Button>
            </Link>
          )}
          <Link to={profile?.onboarding ? '/plan/new' : '/onboarding'}>
            <Button>{profile?.onboarding ? t('dash.create') : t('dash.start')}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Plans saved before goals existed are marathons; plans without a race have null.
  const raceM = plan.fitness.raceDistanceM === undefined ? 42_195 : plan.fitness.raceDistanceM;
  const hasRace = raceM !== null;
  const todays = workouts.filter((w) => w.date === today && w.status !== 'skipped');
  const weekStart = mondayOf(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekRuns = workouts.filter((w) => isRunWorkout(w) && w.date >= weekStart && w.date <= addDays(weekStart, 6) && w.status !== 'skipped');
  const weekPlanned = weekRuns.reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const weekDone = activities
    .filter((a) => a.sport === 'run' && a.local_date >= weekStart && a.local_date <= addDays(weekStart, 6))
    .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
  const r = readiness(metrics, today);
  const swap = r.level === 'low' ? findEasySwap(workouts, today) : null;

  const doSwap = async () => {
    if (!swap) return;
    setSwapping(true);
    try {
      await updateWorkout(swap.key.id, { date: swap.easy.date, original_date: swap.key.original_date ?? today });
      await updateWorkout(swap.easy.id, { date: today, original_date: swap.easy.original_date ?? swap.easy.date });
      await logAdjustment(plan, 'readiness', `Low readiness: "${swap.key.title}" moved to ${englishWeekday(swap.easy.date)}, easy run today instead.`);
      await reload();
      await adapt();
      toast(t('dash.swapped'), 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="space-y-5">
      <HomeHero />

      {swap && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {t('dash.swapPre', { reasons: lang === 'de' ? r.reasons.join(', ') : r.reasons.join(', ').toLowerCase() })}<b>{localTitle(swap.key.title)}</b>{t('dash.swapPost', { day: fmtDate(swap.easy.date, { weekday: 'long' }) })}
            </span>
            <Button size="sm" variant="dark" loading={swapping} onClick={doSwap}>
              {t('dash.makeEasy')}
            </Button>
          </div>
        </Notice>
      )}

      <div>
        <Card>
          <CardTitle icon={<ActivityIcon className="h-5 w-5 text-brand" />}>{t('dash.today')}</CardTitle>
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
              <div className="text-lg font-semibold">{t('dash.restDay')}</div>
              <p className="mt-1 text-sm text-slate-500">{t('dash.restText')}</p>
            </div>
          )}
        </Card>
      </div>

      <ReportTeaser />

      <LatestRun />

      <Card>
        <CardTitle
          icon={<CalendarDays className="h-5 w-5 text-brand" />}
          action={
            <span className="flex items-center gap-3 text-sm text-slate-500">
              {t('dash.ofPlanned', { done: fmtDistance(weekDone, units), planned: fmtDistance(weekPlanned, units) })}
              <Link to="/progress" className="font-semibold text-brand hover:underline">
                {t('dash.report')}
              </Link>
            </span>
          }
        >
          {t('dash.thisWeek')}
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
                  <span className="text-xs font-semibold text-slate-700">{dayShort[weekdayOf(d)]}</span>
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
                    <div className="px-1 text-xs text-slate-400">{t('dash.rest')}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>{t('dash.volume')}</CardTitle>
          <VolumeChart data={volume} units={units} />
        </Card>
        <Card>
          <CardTitle icon={<Sparkles className="h-5 w-5 text-brand" />} action={<Badge tone="orange">VDOT {plan.fitness.vdot.toFixed(1)}</Badge>}>
            {t('dash.paces')}
          </CardTitle>
          <div className="space-y-2 text-sm">
            {(['easy', 'long', 'marathon', 'threshold', 'interval'] as const)
              .filter((z) => hasRace || z !== 'marathon')
              .map((z) => (
              <div key={z} className="flex justify-between gap-3">
                <span className="text-slate-500">{t(`pace.${z}` as MsgKey)}</span>
                <span className="font-semibold tabular-nums">{zonePaceText(plan.fitness.paces, z, units)}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">{t('dash.pacesNote')}</p>
        </Card>
      </div>

      <Card>
        <CardTitle icon={<History className="h-5 w-5 text-brand" />} action={connection && <span className="text-xs text-slate-400">{t('dash.synced', { when: fmtRelative(connection.last_sync_at) })}</span>}>
          {t('dash.adjust')}
        </CardTitle>
        {adjustments.length ? (
          <ul className="space-y-3">
            {adjustments.slice(0, 8).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <p className="text-slate-800">{localMessage(a.message)}</p>
                  <p className="text-xs text-slate-400">{fmtRelative(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('dash.noChanges')}</p>
        )}
      </Card>

      <WorkoutDetail w={open} onClose={() => setOpen(null)} />
      {dnd.dialog}
    </div>
  );
}
