import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Info, TrendingUp } from 'lucide-react';
import { useData } from '../lib/data';
import { projectionHistory } from '../lib/projection';
import { weekReport, type ReportItem, type ReportNote, type WeekReport } from '../lib/report';
import { estimateMaxHr } from '../lib/planner/fitness';
import { addDays, mondayOf, weekdayOf } from '../lib/planner/dates';
import { isRunWorkout } from '../lib/planner/adapt';
import { isBreakNote } from '../lib/planner/breaks';
import { fmtDate, fmtDistance, fmtDuration, fmtPace } from '../lib/format';
import { Badge, Card, CardTitle, cx, PageHeader, Spinner } from '../components/ui';
import { KIND_STYLE } from '../components/Workout';
import { ProjectionChart, hm } from '../components/ProjectionChart';

const PHASE_TONE = { base: 'green', build: 'blue', peak: 'orange', taper: 'violet' } as const;

/** "−4 min" / "+2 min" for a change in seconds (negative = faster). */
const delta = (s: number | null) => (s === null || Math.abs(s) < 30 ? null : `${s < 0 ? '−' : '+'}${Math.round(Math.abs(s) / 60)} min`);

function Stat({ label, value, sub, change, good }: { label: string; value: string; sub: ReactNode; change?: string | null; good?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</span>
        {change && <span className={cx('text-xs font-semibold', good ? 'text-emerald-600' : 'text-amber-600')}>{change}</span>}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function ProjectionCard() {
  const { plan, activities, today, units } = useData();
  const h = useMemo(() => (plan ? projectionHistory(plan, activities, today) : null), [plan, activities, today]);
  if (!plan || !h) return null;
  const goal = h.goalS;
  const assessment = { realistic: 'on track', ambitious: 'ambitious', very_ambitious: 'a big stretch', none: '' }[plan.fitness.goalAssessment];
  return (
    <Card>
      <CardTitle icon={<TrendingUp className="h-5 w-5 text-brand" />}>Marathon projection</CardTitle>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Training-based"
          value={h.current.tandaS ? hm(h.current.tandaS) : '–'}
          change={delta(h.tandaChangeS) && `${delta(h.tandaChangeS)} since plan start`}
          good={(h.tandaChangeS ?? 0) < 0}
          sub={h.current.tandaS ? 'From your last 8 weeks of running' : 'Needs 8 weeks of runs with Garmin or FIT data'}
        />
        <Stat
          label="Race-day projection"
          value={hm(h.current.planS)}
          change={delta(h.planChangeS) && `${delta(h.planChangeS)} since plan start`}
          good={h.planChangeS < 0}
          sub="Fitness (VDOT) plus the training still ahead"
        />
        <Stat label="Goal" value={goal ? hm(goal) : 'Finish'} sub={goal ? `Currently ${assessment}` : 'No time goal set'} />
      </div>
      <ProjectionChart points={h.points} goalS={goal} planStart={h.planStart} />
      {h.drivers && (h.tandaChangeS ?? 0) > 30 && h.drivers.kmNow > h.drivers.kmStart && h.drivers.paceNow > h.drivers.paceStart + 3 && (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
          Why the training-based estimate looks slower: your weekly volume went up ({fmtDistance(h.drivers.kmStart, units, 0)} → {fmtDistance(h.drivers.kmNow, units, 0)} per week), but your average
          training pace got slower ({fmtPace(h.drivers.paceStart, units)} → {fmtPace(h.drivers.paceNow, units)}) because easy runs are now really easy. Tanda's formula rewards a fast average pace, so
          it underrates well-run easy days – it catches up as your easy pace gets faster at the same effort.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        The training-based estimate (Tanda 2011) moves every week with your volume and average pace. The race-day projection is the number on your dashboard; it changes when your runs show a change in fitness.
      </p>
    </Card>
  );
}

const NOTE_ICON = {
  good: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />,
  warn: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />,
  info: <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />,
};

function Notes({ notes }: { notes: ReportNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.text} className="flex gap-2.5 text-sm text-slate-700">
          {NOTE_ICON[n.tone]}
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

const scoreTone = (s: number) => (s >= 85 ? 'bg-emerald-100 text-emerald-800' : s >= 70 ? 'bg-lime-100 text-lime-800' : s >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700');

function ItemRow({ item }: { item: ReportItem }) {
  const { units, today } = useData();
  const { workout: w, activity: a } = item;
  const kind = w?.kind ?? 'easy';
  const moving = a ? (a.moving_s ?? a.duration_s ?? 0) : 0;
  const status = !w
    ? 'Extra run'
    : w.status === 'skipped'
      ? isBreakNote(w.note)
        ? 'Paused (break)'
        : w.status_source === 'auto'
          ? 'Replaced'
          : 'Skipped'
      : w.status === 'missed'
        ? 'Missed'
        : w.status === 'planned'
          ? w.date < today
            ? 'Not done'
            : 'Planned'
          : null;
  const actual = a
    ? [a.distance_m ? fmtDistance(a.distance_m / 1000, units) : null, a.distance_m && moving ? fmtPace(moving / (a.distance_m / 1000), units) : moving ? fmtDuration(moving) : null, a.avg_hr ? `♥ ${a.avg_hr}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;
  const body = (
    <div className={cx('flex items-center gap-3 py-2.5', (w?.status === 'skipped' || w?.status === 'missed') && 'opacity-60')}>
      <div className="w-11 shrink-0 text-xs leading-tight text-slate-500">
        <div className="font-semibold text-slate-700">{fmtDate(item.date, { weekday: 'short' })}</div>
        {fmtDate(item.date, { day: 'numeric', month: 'short' })}
      </div>
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', KIND_STYLE[kind].dot)} />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm font-medium text-slate-900', w?.status === 'skipped' && 'line-through')}>{w?.title ?? a?.name ?? 'Run'}</div>
        <div className="truncate text-xs text-slate-500">
          {actual ?? (w?.distance_km ? fmtDistance(w.distance_km, units) : w?.duration_min ? `${w.duration_min} min` : '')}
          {status && <span className={cx(actual || w?.distance_km || w?.duration_min ? 'ml-1.5' : '', status === 'Missed' || status === 'Not done' ? 'text-red-600' : '')}>{actual || w?.distance_km || w?.duration_min ? '· ' : ''}{status}</span>}
          {item.tooFast && <span className="ml-1.5 text-amber-600">· too fast for easy</span>}
        </div>
      </div>
      {item.score !== null && <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', scoreTone(item.score))}>{item.score}</span>}
      {a && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
    </div>
  );
  return a ? (
    <Link to={`/analysis/${a.id}`} className="block rounded-lg px-1 hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    <div className="px-1">{body}</div>
  );
}

function Kpi({ label, value, sub, pct }: { label: string; value: ReactNode; sub?: ReactNode; pct?: number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</div>
      {pct !== undefined && pct !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Marker({ label, now, prev, unit, digits = 0, higherIsBetter }: { label: string; now: number | null; prev: number | null; unit: string; digits?: number; higherIsBetter: boolean }) {
  if (now === null) return null;
  const d = prev !== null ? now - prev : null;
  const better = d !== null && (higherIsBetter ? d > 0 : d < 0);
  const show = d !== null && Math.abs(d) >= (digits ? 0.2 : 1);
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-semibold tabular-nums text-slate-900">
          {now.toFixed(digits)} {unit}
        </span>
        {show && <span className={cx('text-xs font-semibold', better ? 'text-emerald-600' : 'text-amber-600')}>{d! > 0 ? '▲' : '▼'} {Math.abs(d!).toFixed(digits)}</span>}
      </div>
      <div className="text-[11px] text-slate-400">avg · vs. week before</div>
    </div>
  );
}

function ReportBody({ r }: { r: WeekReport }) {
  const { units } = useData();
  const so = r.state === 'current';
  const ref = so ? r.plannedToDateKm : r.plannedKm;
  const keyText = r.key.planned ? `${r.key.done} / ${r.key.planned}` : '–';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={so ? 'Distance so far' : 'Distance'} value={fmtDistance(r.doneKm, units)} sub={`of ${fmtDistance(ref, units)}${so ? ' due' : ' planned'}`} pct={r.pct} />
        <Kpi label="Sessions" value={`${r.sessions.done} / ${r.sessions.planned}`} sub={so ? 'up to today' : 'done'} />
        <Kpi label="Key sessions" value={keyText} sub={r.key.missed.length ? `${r.key.missed.length} missed` : 'done'} />
        <Kpi label="Long run" value={r.long.doneKm !== null ? fmtDistance(r.long.doneKm, units) : r.long.workout ? '–' : 'none'} sub={r.long.workout ? `planned ${fmtDistance(r.long.workout.distance_km, units)}` : ''} />
        <Kpi label="Time trained" value={r.movingS ? fmtDuration(r.movingS).replace(/:\d\d$/, ' h') : '–'} sub="all sessions" />
        <Kpi label="Execution" value={r.avgScore ?? '–'} sub="avg score of runs" />
      </div>

      {r.notes.length > 0 && (
        <div className="rounded-xl bg-brand-soft/50 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-900">Coach notes</div>
          <Notes notes={r.notes} />
        </div>
      )}

      <div>
        <div className="mb-1 text-sm font-semibold text-slate-900">Day by day</div>
        {r.items.length ? (
          <div className="divide-y divide-slate-100">{r.items.map((it) => <ItemRow key={(it.workout?.id ?? '') + (it.activity?.id ?? '')} item={it} />)}</div>
        ) : (
          <p className="text-sm text-slate-500">No sessions this week.</p>
        )}
      </div>

      {(r.wellness.restingHr.now !== null || r.wellness.hrv.now !== null || r.wellness.sleepH.now !== null) && (
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-900">Recovery</div>
          <div className="grid grid-cols-3 gap-2">
            <Marker label="Resting HR" unit="bpm" now={r.wellness.restingHr.now} prev={r.wellness.restingHr.prev} higherIsBetter={false} />
            <Marker label="HRV" unit="ms" now={r.wellness.hrv.now} prev={r.wellness.hrv.prev} higherIsBetter />
            <Marker label="Sleep" unit="h" digits={1} now={r.wellness.sleepH.now} prev={r.wellness.sleepH.prev} higherIsBetter />
          </div>
        </div>
      )}

      {r.next && (r.next.week || r.next.long || r.next.key.length > 0) && (
        <div className="rounded-xl ring-1 ring-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            Next week
            {r.next.week && <Badge tone={PHASE_TONE[r.next.week.phase]} className="capitalize">{r.next.week.phase}</Badge>}
            {r.next.week?.recovery && <Badge>Recovery week</Badge>}
            <span className="ml-auto font-normal text-slate-500">{fmtDistance(r.next.plannedKm, units, 0)} planned</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {r.next.key.map((w) => (
              <li key={w.id} className="flex gap-2">
                <span className="w-16 shrink-0 text-slate-500">{fmtDate(w.date, { weekday: 'short', day: 'numeric' })}</span>
                {w.title}
              </li>
            ))}
            {r.next.long && (
              <li className="flex gap-2">
                <span className="w-16 shrink-0 text-slate-500">{fmtDate(r.next.long.date, { weekday: 'short', day: 'numeric' })}</span>
                {r.next.long.title} · {fmtDistance(r.next.long.distance_km, units)}
              </li>
            )}
          </ul>
          {r.next.week?.recovery && <p className="mt-2 text-xs text-slate-500">Lighter week: volume drops so your body can absorb the training.</p>}
        </div>
      )}
    </div>
  );
}

/** The week a report opens on: last week early in the week, otherwise this week. */
export const defaultReportWeek = (today: string) => (weekdayOf(today) <= 1 ? addDays(mondayOf(today), -7) : mondayOf(today));

function WeeklyReportCard() {
  const { plan, workouts, activities, metrics, units, today, connection } = useData();
  const [params, setParams] = useSearchParams();
  const thisMonday = mondayOf(today);
  const weeks = useMemo(() => (plan ? plan.weeks.map((w) => w.startDate).filter((d) => d <= thisMonday) : []), [plan, thisMonday]);
  const wanted = params.get('week');
  const fallback = weeks.includes(defaultReportWeek(today)) ? defaultReportWeek(today) : weeks[weeks.length - 1];
  const start = wanted && weeks.includes(wanted) ? wanted : fallback;
  const report = useMemo(() => {
    if (!plan || !start) return null;
    const maxHr = estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today);
    return weekReport({ plan, workouts, activities, metrics, weekStart: start, today, maxHr, units });
  }, [plan, workouts, activities, metrics, start, today, units, connection]);
  if (!plan || !report || !start) return null;

  const i = weeks.indexOf(start);
  const go = (d: string) => setParams((p) => {
    p.set('week', d);
    return p;
  }, { replace: true });
  const label = start === thisMonday ? 'This week' : start === addDays(thisMonday, -7) ? 'Last week' : null;
  return (
    <Card>
      <CardTitle icon={<ClipboardCheck className="h-5 w-5 text-brand" />}>Weekly report</CardTitle>
      <div className="mb-4 flex items-center gap-2">
        <button className="rounded-lg p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30" disabled={i <= 0} onClick={() => go(weeks[i - 1])} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 font-semibold text-slate-900">
            Week {report.week?.week ?? '–'}
            {report.week && <Badge tone={PHASE_TONE[report.week.phase]} className="capitalize">{report.week.phase}</Badge>}
            {label && <Badge tone="orange">{label}</Badge>}
          </div>
          <div className="text-xs text-slate-500">
            {fmtDate(report.start, { day: 'numeric', month: 'short' })} – {fmtDate(report.end, { day: 'numeric', month: 'short' })}
            {report.state === 'current' ? ' · in progress' : ''}
          </div>
        </div>
        <button className="rounded-lg p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30" disabled={i >= weeks.length - 1} onClick={() => go(weeks[i + 1])} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <ReportBody r={report} />
    </Card>
  );
}

export function Progress() {
  const { loading, plan } = useData();
  if (loading) return <Spinner />;
  if (!plan) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">No plan yet.</p>
        <Link to="/plan/new" className="mt-3 inline-block font-semibold text-brand">Create your plan →</Link>
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Progress" subtitle="How your marathon fitness develops – and how each week went." />
      <WeeklyReportCard />
      <ProjectionCard />
    </div>
  );
}

/** Dashboard teaser for last week's report, shown early in the week. */
export function ReportTeaser() {
  const { plan, workouts, activities, metrics, units, today, connection } = useData();
  const start = addDays(mondayOf(today), -7);
  const report = useMemo(() => {
    if (!plan || weekdayOf(today) > 2 || !plan.weeks.some((w) => w.startDate === start)) return null;
    const maxHr = estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today);
    return weekReport({ plan, workouts, activities, metrics, weekStart: start, today, maxHr, units });
  }, [plan, workouts, activities, metrics, start, today, units, connection]);
  if (!report || (!report.sessions.planned && !report.doneKm)) return null;
  const runsPlanned = workouts.some((w) => w.date >= start && w.date <= report.end && isRunWorkout(w));
  return (
    <Card>
      <CardTitle
        icon={<ClipboardCheck className="h-5 w-5 text-brand" />}
        action={
          <Link to={`/progress?week=${start}`} className="text-sm font-semibold text-brand hover:underline">
            Open report →
          </Link>
        }
      >
        Week {report.week?.week} in review
      </CardTitle>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {runsPlanned && (
          <span>
            <b className="tabular-nums">{fmtDistance(report.doneKm, units)}</b> <span className="text-slate-500">of {fmtDistance(report.plannedKm, units)}</span>
          </span>
        )}
        <span>
          <b className="tabular-nums">{report.sessions.done}/{report.sessions.planned}</b> <span className="text-slate-500">sessions</span>
        </span>
        {report.key.planned > 0 && (
          <span>
            <b className="tabular-nums">{report.key.done}/{report.key.planned}</b> <span className="text-slate-500">key sessions</span>
          </span>
        )}
        {report.avgScore !== null && (
          <span>
            <b className="tabular-nums">{report.avgScore}</b> <span className="text-slate-500">avg execution</span>
          </span>
        )}
      </div>
      {report.notes[0] && (
        <div className="mt-3">
          <Notes notes={report.notes.slice(0, 2)} />
        </div>
      )}
    </Card>
  );
}
