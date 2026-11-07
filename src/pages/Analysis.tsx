import { useMemo, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, Info, Lightbulb, Target, TrendingUp, XCircle } from 'lucide-react';
import { useData } from '../lib/data';
import { analyze, purposeFor, type CheckStatus } from '../lib/analysis';
import { useActivityDetails } from '../lib/details';
import { estimateMaxHr } from '../lib/planner/fitness';
import { describeStep, fmtDate, fmtDistance, fmtDuration, fmtMinSec, fmtNum, fmtPace, KM_PER_MI, localTitle } from '../lib/format';
import { useI18n, tr, type MsgKey } from '../lib/i18n';
import { Badge, Card, CardTitle, cx, Notice, Spinner } from '../components/ui';
import { KIND_STYLE } from '../components/Workout';
import { LineChart } from '../components/LineChart';

// Validated pair (dataviz validator, light surface): pace = blue, heart rate = orange.
const PACE_COLOR = '#6b8fd6';
const HR_COLOR = '#ea580c';
const ZONE_RAMP = ['#fde7d6', '#fbc89f', '#f59a5b', '#e46a24', '#b8460e'];

const statusIcon = (status: CheckStatus): ReactElement =>
  status === 'good' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label={tr('ana.good')} />
  : status === 'warn' ? <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-label={tr('ana.warn')} />
  : status === 'bad' ? <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-label={tr('ana.bad')} />
  : <Info className="h-5 w-5 shrink-0 text-slate-400" aria-label={tr('ana.info')} />;

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const { t } = useI18n();
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
        <div className="text-sm font-semibold" style={{ color }}>
          {t(`dash.grade.${grade}` as MsgKey)}
        </div>
      </div>
    </div>
  );
}

export function Analysis() {
  const { activityId } = useParams();
  const { t } = useI18n();
  const { plan, workouts, activities, metrics, units, connection, today } = useData();
  const activity = activities.find((a) => a.id === activityId) ?? null;
  const workout = workouts.find((w) => w.activity_id === activityId) ?? null;
  // Same source as the dashboard and the weekly report, so the score matches everywhere.
  const { ready, detailsOf, errorOf } = useActivityDetails(activity ? [activity] : []);
  const details = activity ? detailsOf(activity) : null;
  const loading = !!activity && !ready;
  const error = activity ? errorOf(activity) : null;

  const maxHr = plan ? estimateMaxHr(plan.inputs, connection?.profile ?? null, activities, today) : null;
  const result = useMemo(
    () => (plan && activity ? analyze({ workout, activity, details, plan, activities, metrics, maxHr }) : null),
    [plan, activity, workout, details, activities, metrics, maxHr],
  );

  if (!plan || !activity || !result) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <p className="text-slate-600">{t('ana.notFound')}</p>
        <Link to="/activities" className="mt-3 inline-block font-semibold text-brand">{t('ana.backToActivities')}</Link>
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
  const fmtX = (x: number) => `${fmtNum(units === 'mi' ? x / KM_PER_MI : x)} ${units}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to={workout ? '/plan' : '/activities'} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className={cx('h-2.5 w-2.5 rounded-full', style.dot)} />
            {style.label}
            {!workout && <Badge>{t('ana.unplanned')}</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{workout ? localTitle(workout.title) : (activity.name ?? t('wd.activity'))}</h1>
          <p className="text-sm text-slate-500">{fmtDate(activity.local_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {loading ? (
          <div className="h-24 w-24 animate-pulse rounded-full bg-slate-100" aria-label={t('ana.loadingScore')} />
        ) : (
          result.score !== null && result.grade && <ScoreRing score={result.score} grade={result.grade} />
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle icon={<Target className="h-5 w-5 text-brand" />}>{t('ana.goal')}</CardTitle>
          <div className="text-lg font-semibold text-slate-900">{purpose.headline}</div>
          <p className="mt-1 text-sm text-slate-600">{purpose.why}</p>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <b className="text-slate-800">{t('ana.benefit')}</b> {purpose.marathon}
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
          <CardTitle>{t('ana.did')}</CardTitle>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {isRun && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t('ana.distance')}</dt>
                <dd className="text-lg font-semibold">{fmtDistance(km, units, 2)}</dd>
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{t('ana.moving')}</dt>
              <dd className="text-lg font-semibold">{fmtDuration(moving)}</dd>
            </div>
            {isRun && km > 0 && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t('ana.avgPace')}</dt>
                <dd className="text-lg font-semibold">{fmtPace(moving / km, units)}</dd>
              </div>
            )}
            {activity.avg_hr && (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t('ana.avgMaxHr')}</dt>
                <dd className="text-lg font-semibold">
                  {activity.avg_hr}
                  {activity.max_hr ? ` / ${activity.max_hr}` : ''} bpm
                </dd>
              </div>
            )}
            {activity.elevation_gain_m ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t('ana.elevation')}</dt>
                <dd className="text-lg font-semibold">{Math.round(activity.elevation_gain_m)} m</dd>
              </div>
            ) : null}
            {activity.aerobic_te ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{t('ana.te')}</dt>
                <dd className="text-lg font-semibold">{fmtNum(activity.aerobic_te)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardTitle>{t('ana.check')}</CardTitle>
          <Spinner label={t('ana.checking')} />
        </Card>
      ) : result.checks.length > 0 && (
        <Card>
          <CardTitle>{t('ana.check')}</CardTitle>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-3">
                {statusIcon(c.status)}
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
          <CardTitle>{t('ana.paceHr')}</CardTitle>
          {loading ? (
            <Spinner label={t('ana.loadingLaps')} />
          ) : samples.length ? (
            <div className="space-y-4">
              <LineChart
                label={t('ana.paceChart', { unit: units })}
                points={pacePoints}
                color={PACE_COLOR}
                invert
                band={band}
                formatY={(v) => fmtMinSec(v)}
                formatX={fmtX}
              />
              {hrPoints.length > 1 && <LineChart label={t('ana.hrChart')} points={hrPoints} color={HR_COLOR} formatY={(v) => `${Math.round(v)}`} formatX={fmtX} />}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {activity.source === 'manual' ? t('ana.manualNoStream') : t('ana.noStream')}
            </p>
          )}
        </Card>
      )}

      {result.reps && result.reps.length > 0 && (
        <Card>
          <CardTitle>{t('ana.segments')}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">{t('ana.distance')}</th>
                  <th className="py-2 pr-3 font-medium">{t('ana.col.time')}</th>
                  <th className="py-2 pr-3 font-medium">{t('ana.col.pace')}</th>
                  <th className="py-2 pr-3 font-medium">{t('ana.col.target')}</th>
                  <th className="py-2 pr-3 font-medium">{t('ana.col.vs')}</th>
                  <th className="py-2 font-medium">{t('ana.col.hr')}</th>
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
                      {fmtNum(r.deviationPct)} %
                    </td>
                    <td className="py-2">{r.avgHr ? Math.round(r.avgHr) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('ana.segNote')}</p>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {result.zones && (
          <Card>
            <CardTitle>{t('ana.zones')}</CardTitle>
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
            <p className="mt-3 text-xs text-slate-500">{t('ana.zonesNote', { maxHr: maxHr ?? 0 })}</p>
          </Card>
        )}

        <Card>
          <CardTitle icon={<TrendingUp className="h-5 w-5 text-brand" />}>{t('ana.fitness')}</CardTitle>
          <dl className="space-y-3 text-sm">
            {!loading && result.fitness.vdot && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('ana.fitnessRun')}</dt>
                <dd className="font-semibold">
                  VDOT {fmtNum(result.fitness.vdot)} <span className="font-normal text-slate-400">{t('ana.plan', { vdot: fmtNum(result.fitness.planVdot) })}</span>
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('ana.planProjection')}</dt>
              <dd className="font-semibold">{fmtDuration(result.projection.planS)}</dd>
            </div>
            {result.projection.tandaS && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('ana.trainingProjection')}</dt>
                <dd className="font-semibold">{fmtDuration(result.projection.tandaS)}</dd>
              </div>
            )}
            {result.projection.deltaS !== null && (
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t('ana.effect')}</div>
                <div className={cx('text-lg font-bold', result.projection.deltaS <= 0 ? 'text-emerald-700' : 'text-amber-700')}>
                  {result.projection.deltaS <= 0 ? '−' : '+'}
                  {fmtDuration(Math.abs(result.projection.deltaS))}
                </div>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            {result.projection.tandaS
              ? t('ana.tandaNote', { km: result.projection.weeklyKm8?.toFixed(0) ?? 0 })
              : t('ana.tandaNeeds')}
            {result.fitness.method ? t('ana.method', { method: result.fitness.method }) : ''}
          </p>
        </Card>
      </div>

      {!loading && result.insights.length > 0 && (
        <Card>
          <CardTitle icon={<Lightbulb className="h-5 w-5 text-brand" />}>{t('ana.notes')}</CardTitle>
          <ul className="space-y-3">
            {result.insights.map((text) => (
              <li key={text} className="flex gap-3 text-sm text-slate-700">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                {text}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
