import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, Info, Lightbulb, Target, TrendingUp, XCircle } from 'lucide-react';
import { useData } from '../lib/data';
import { analyze, purposeFor, type CheckStatus } from '../lib/analysis';
import { fetchActivityDetails } from '../lib/api';
import { estimateMaxHr } from '../lib/planner/fitness';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtMinSec, fmtPace, KM_PER_MI } from '../lib/format';
import type { ActivityDetails } from '../lib/types';
import { Badge, Card, CardTitle, cx, Notice, Spinner } from '../components/ui';
import { KIND_STYLE } from '../components/Workout';
import { LineChart } from '../components/LineChart';

// Validated pair (dataviz validator, light surface): pace = blue, heart rate = orange.
const PACE_COLOR = '#6b8fd6';
const HR_COLOR = '#ea580c';
const ZONE_RAMP = ['#fde7d6', '#fbc89f', '#f59a5b', '#e46a24', '#b8460e'];

const STATUS_ICON: Record<CheckStatus, ReactElement> = {
  good: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="good" />,
  warn: <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-label="warning" />,
  bad: <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-label="off target" />,
  info: <Info className="h-5 w-5 shrink-0 text-slate-400" aria-label="info" />,
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? '#059669' : score >= 70 ? '#65a30d' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eef1f5" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div>
        <div className="text-4xl font-extrabold tabular-nums text-slate-900">{score}</div>
        <div className="text-sm font-semibold capitalize" style={{ color }}>
          {grade} execution
        </div>
      </div>
    </div>
  );
}

export function Analysis() {
  const { activityId } = useParams();
  const { plan, workouts, activities, metrics, units, connection, today } = useData();
  const [details, setDetails] = useState<ActivityDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activity = activities.find((a) => a.id === activityId) ?? null;
  const workout = workouts.find((w) => w.activity_id === activityId) ?? null;

  useEffect(() => {
    if (!activity) return;
    if (activity.details) {
      setDetails(activity.details);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchActivityDetails(activity)
      .then((d) => !cancelled && setDetails(d))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activity?.id]);

  const maxHr = plan ? estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today) : null;
  const result = useMemo(
    () => (plan && activity ? analyze({ workout, activity, details, plan, activities, metrics, maxHr }) : null),
    [plan, activity, workout, details, activities, metrics, maxHr],
  );

  if (!plan || !activity || !result) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <p className="text-slate-600">Activity not found.</p>
        <Link to="/activities" className="mt-3 inline-block font-semibold text-brand">Back to activities</Link>
      </Card>
    );
  }

  const kind = workout?.kind ?? (activity.sport === 'run' ? 'easy' : 'custom');
  const style = KIND_STYLE[kind];
  const paces = plan.fitness.paces;
  const purpose = workout ? result.purpose : purposeFor(kind);
  const isRun = activity.sport === 'run';
  const km = (activity.distance_m ?? 0) / 1000;
  const moving = activity.moving_s ?? activity.duration_s ?? 0;
  const unitDiv = units === 'mi' ? KM_PER_MI : 1;
  const samples = details?.samples ?? [];
  const pacePoints = samples
    .filter((s) => s.v && s.v > 1.2)
    .map((s) => ({ x: s.d / 1000, y: (1000 / s.v!) * unitDiv }));
  const hrPoints = samples.filter((s) => s.hr).map((s) => ({ x: s.d / 1000, y: s.hr! }));
  const main = workout?.steps.find((s) => s.type === 'run' && s.label !== 'Warm-up' && s.label !== 'Cool-down');
  const zone = main && main.type === 'run' ? main.zone : 'easy';
  const zp = paces[zone];
  const band: [number, number] = Array.isArray(zp) ? [zp[0] * unitDiv, zp[1] * unitDiv] : [zp * 0.97 * unitDiv, zp * 1.03 * unitDiv];
  const fmtX = (x: number) => `${(units === 'mi' ? x / KM_PER_MI : x).toFixed(1)} ${units}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to={workout ? '/plan' : '/activities'} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className={cx('h-2.5 w-2.5 rounded-full', style.dot)} />
            {style.label}
            {!workout && <Badge>Unplanned</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{workout?.title ?? activity.name ?? 'Activity'}</h1>
          <p className="text-sm text-slate-500">{fmtDate(activity.local_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {result.score !== null && result.grade && <ScoreRing score={result.score} grade={result.grade} />}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle icon={<Target className="h-5 w-5 text-brand" />}>Goal of this session</CardTitle>
          <div className="text-lg font-semibold text-slate-900">{purpose.headline}</div>
          <p className="mt-1 text-sm text-slate-600">{purpose.why}</p>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <b className="text-slate-800">Marathon benefit:</b> {purpose.marathon}
          </p>
          {workout && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {workout.steps.map((s, i) => {
                const d = describeStep(s, paces, units);
                return (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span>
                      <span className="font-medium text-slate-800">{d.main.charAt(0).toUpperCase() + d.main.slice(1)}</span>
                      {d.detail && <span className="text-slate-500"> · {d.detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>What you did</CardTitle>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {isRun && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Distance</dt>
                <dd className="text-lg font-semibold">{fmtDistance(km, units, 2)}</dd>
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Moving time</dt>
              <dd className="text-lg font-semibold">{fmtDuration(moving)}</dd>
            </div>
            {isRun && km > 0 && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Avg pace</dt>
                <dd className="text-lg font-semibold">{fmtPace(moving / km, units)}</dd>
              </div>
            )}
            {activity.avg_hr && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Avg / max HR</dt>
                <dd className="text-lg font-semibold">
                  {activity.avg_hr}
                  {activity.max_hr ? ` / ${activity.max_hr}` : ''} bpm
                </dd>
              </div>
            )}
            {activity.elevation_gain_m ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Elevation gain</dt>
                <dd className="text-lg font-semibold">{Math.round(activity.elevation_gain_m)} m</dd>
              </div>
            ) : null}
            {activity.aerobic_te ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Aerobic effect (Garmin)</dt>
                <dd className="text-lg font-semibold">{activity.aerobic_te.toFixed(1)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {result.checks.length > 0 && (
        <Card>
          <CardTitle>Execution check</CardTitle>
          <ul className="divide-y divide-slate-100">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 py-3">
                {STATUS_ICON[c.status]}
                <div>
                  <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                  <div className="text-sm text-slate-600">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isRun && (
        <Card>
          <CardTitle>Pace & heart rate</CardTitle>
          {loading ? (
            <Spinner label="Loading lap data from Garmin…" />
          ) : samples.length ? (
            <div className="space-y-4">
              <LineChart
                label={`Pace (/${units}) – shaded: target range`}
                points={pacePoints}
                color={PACE_COLOR}
                invert
                band={band}
                formatY={(v) => fmtMinSec(v)}
                formatX={fmtX}
              />
              {hrPoints.length > 1 && <LineChart label="Heart rate (bpm)" points={hrPoints} color={HR_COLOR} formatY={(v) => `${Math.round(v)}`} formatX={fmtX} />}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {activity.source === 'manual' ? 'Manually logged – no stream data.' : 'No lap or GPS data available for this activity.'}
            </p>
          )}
        </Card>
      )}

      {result.reps && result.reps.length > 0 && (
        <Card>
          <CardTitle>Work segments</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Distance</th>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Pace</th>
                  <th className="py-2 pr-3 font-medium">Target</th>
                  <th className="py-2 pr-3 font-medium">vs target</th>
                  <th className="py-2 font-medium">HR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {result.reps.map((r) => (
                  <tr key={r.index}>
                    <td className="py-2 pr-3 text-slate-500">{r.index}</td>
                    <td className="py-2 pr-3">{r.distanceM < 2000 ? `${Math.round(r.distanceM)} m` : fmtDistance(r.distanceM / 1000, units, 2)}</td>
                    <td className="py-2 pr-3">{fmtDuration(r.durationS)}</td>
                    <td className="py-2 pr-3 font-semibold">{fmtPace(r.paceS, units)}</td>
                    <td className="py-2 pr-3 text-slate-500">{fmtPace(r.targetPaceS, units)}</td>
                    <td className={cx('py-2 pr-3 font-medium', Math.abs(r.deviationPct) <= 3 ? 'text-emerald-700' : Math.abs(r.deviationPct) <= 6 ? 'text-amber-700' : 'text-red-700')}>
                      {r.deviationPct > 0 ? '+' : ''}
                      {r.deviationPct.toFixed(1)} %
                    </td>
                    <td className="py-2">{r.avgHr ? Math.round(r.avgHr) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Positive = slower than target, negative = faster.</p>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {result.zones && (
          <Card>
            <CardTitle>Heart-rate zones</CardTitle>
            <div className="space-y-2">
              {result.zones.map((z, i) => (
                <div key={z.zone} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-slate-600">
                    Z{z.zone} <span className="text-xs text-slate-400">{z.label}</span>
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${z.pct}%`, background: ZONE_RAMP[i] }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums text-slate-700">
                    {Math.round(z.pct)} % · {Math.round(z.seconds / 60)}′
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Zones as % of max HR ({maxHr} bpm).</p>
          </Card>
        )}

        <Card>
          <CardTitle icon={<TrendingUp className="h-5 w-5 text-brand" />}>Fitness & marathon projection</CardTitle>
          <dl className="space-y-3 text-sm">
            {result.fitness.vdot && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Fitness shown by this run</dt>
                <dd className="font-semibold">
                  VDOT {result.fitness.vdot.toFixed(1)} <span className="font-normal text-slate-400">(plan {result.fitness.planVdot.toFixed(1)})</span>
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Plan projection (race day)</dt>
              <dd className="font-semibold">{fmtDuration(result.projection.planS)}</dd>
            </div>
            {result.projection.tandaS && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Training-based projection now</dt>
                <dd className="font-semibold">{fmtDuration(result.projection.tandaS)}</dd>
              </div>
            )}
            {result.projection.deltaS !== null && (
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Effect of this run on the projection</div>
                <div className={cx('text-lg font-bold', result.projection.deltaS <= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  {result.projection.deltaS <= 0 ? '−' : '+'}
                  {fmtDuration(Math.abs(result.projection.deltaS))}
                </div>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            {result.projection.tandaS
              ? `Training-based projection: Tanda (2011) model from your last 8 weeks – ${result.projection.weeklyKm8?.toFixed(0)} km/week average. Most accurate for 2:45–3:40 marathoners.`
              : 'The training-based projection needs about 8 weeks of synced runs.'}
            {result.fitness.method ? ` Fitness estimated from ${result.fitness.method}.` : ''}
          </p>
        </Card>
      </div>

      {result.insights.length > 0 && (
        <Card>
          <CardTitle icon={<Lightbulb className="h-5 w-5 text-brand" />}>Coach notes</CardTitle>
          <ul className="space-y-3">
            {result.insights.map((t) => (
              <li key={t} className="flex gap-3 text-sm text-slate-700">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
