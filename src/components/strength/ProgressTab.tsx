import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Flame, Medal, Minus, TrendingUp } from 'lucide-react';
import { toUnit } from '../../../supabase/functions/_shared/strength';
import { exerciseProgress, exerciseSummaries, personalRecords, summarize, weeklyVolume } from '../../lib/strengthStats';
import { exName, weightText } from '../../lib/strengthFormat';
import { fmtDate, fmtNum } from '../../lib/format';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { numberText } from '../../lib/i18n/dates';
import { Badge, Card, CardTitle, cx } from '../ui';
import { ProgressChart, Sparkline, WeekBars, type ProgressPoint } from './Charts';
import type { StrengthCtx } from './context';

type Metric = 'e1rm' | 'weight' | 'volume' | 'reps';
const METRIC_KEY: Record<Metric, MsgKey> = { e1rm: 'pr.e1rm', weight: 'pr.weight', volume: 'pr.volume', reps: 'pr.reps' };

function Trend({ change, pct, suffix }: { change: number; pct?: number; suffix: string }) {
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-semibold', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-400')}>
      <Icon className="h-4 w-4" />
      {change > 0 ? '+' : ''}{fmtNum(change)}{suffix}{pct !== undefined && pct !== 0 ? ` (${pct > 0 ? '+' : ''}${fmtNum(pct)}%)` : ''}
    </span>
  );
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** How the strength developed: numbers of the last month, the development of every exercise, weekly volume and records. */
export function ProgressTab({ ctx }: { ctx: StrengthCtx }) {
  const { rows, unit, today, loaded } = ctx;
  const { t, lang } = useI18n();
  const summaries = useMemo(() => exerciseSummaries(rows), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const month = useMemo(() => summarize(rows, today), [rows, today]);
  const weeks = useMemo(() => weeklyVolume(rows, 12, today), [rows, today]);
  const records = useMemo(() => personalRecords(rows).slice(0, 8), [rows]);

  if (!loaded) return <Card><p className="text-sm text-slate-500">{t('hi.loading')}</p></Card>;
  if (!rows.length) {
    return (
      <Card className="text-center">
        <TrendingUp className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-2 text-base font-semibold text-slate-900">{t('pr.emptyTitle')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('pr.emptyText')}</p>
      </Card>
    );
  }

  const sel = summaries.find((s) => s.key === picked) ?? summaries[0];
  const pts = exerciseProgress(rows, sel.key);
  const weighted = sel.metric === 'e1rm';
  const active: Metric = metric && (weighted || metric === 'reps') ? metric : weighted ? 'e1rm' : 'reps';
  const conv = (kg: number) => toUnit(kg, unit);
  const setText = (s: { kg: number; reps: number }) => (s.kg ? `${fmtNum(toUnit(s.kg, unit), 2)}×${s.reps}` : `${s.reps}`);
  const value = (p: (typeof pts)[number]) => (active === 'e1rm' ? conv(p.e1rm) : active === 'weight' ? conv(p.topKg) : active === 'volume' ? Math.round(conv(p.volume)) : p.bestReps);
  const chart: ProgressPoint[] = pts.map((p) => ({
    date: p.date,
    value: value(p),
    detail: p.sets.map(setText).join(', '),
  }));
  const first = chart[0]?.value ?? 0;
  const lastV = chart.at(-1)?.value ?? 0;
  const delta = Math.round((lastV - first) * 10) / 10;
  const pct = first > 0 ? Math.round(((lastV - first) / first) * 1000) / 10 : 0;
  const unitLabel = active === 'reps' ? t('pr.reps') : active === 'volume' ? `${unit}·reps` : unit;
  const volDelta = month.previousVolume > 0 ? Math.round(((month.volume - month.previousVolume) / month.previousVolume) * 100) : null;
  const metrics: Metric[] = weighted ? ['e1rm', 'weight', 'volume'] : ['reps'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('pr.tile.workouts')} value={String(month.sessions)} sub={month.streakWeeks ? t(month.streakWeeks === 1 ? 'pr.streak1' : 'pr.streakN', { n: month.streakWeeks }) : t('pr.noStreak')} icon={<Flame className="h-3.5 w-3.5" />} />
        <Tile label={t('pr.tile.sets')} value={String(month.sets)} icon={<Minus className="h-3.5 w-3.5" />} />
        <Tile
          label={t('pr.tile.volume')}
          value={numberText(Math.round(toUnit(month.volume, unit)), lang)}
          sub={volDelta === null ? t('pr.lifted', { unit }) : <><Trend change={volDelta} suffix="%" /> <span>{t('pr.vsBefore')}</span></>}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <Tile label={t('pr.tile.records')} value={String(month.records)} sub={t('pr.bestE1rm')} icon={<Medal className="h-3.5 w-3.5" />} />
      </div>

      <Card>
        <CardTitle icon={<TrendingUp className="h-5 w-5 text-brand" />}>{t('pr.over')}</CardTitle>
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('pr.exercise')}>
          {summaries.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s.key === sel.key}
              onClick={() => { setPicked(s.key); setMetric(null); }}
              className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', s.key === sel.key ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}
            >
              {exName(s.label)}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-bold tabular-nums text-slate-900">{fmtNum(lastV)} <span className="text-base font-medium text-slate-500">{unitLabel}</span></div>
            <div className="text-sm text-slate-500">{t(METRIC_KEY[active])} · {chart.length > 1 ? <>{t('pr.since', { date: fmtDate(pts[0].date, { day: 'numeric', month: 'short' }) })}<Trend change={delta} pct={pct} suffix={active === 'reps' ? '' : ` ${unit}`} /></> : t('pr.firstSession')}</div>
          </div>
          {metrics.length > 1 && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label={t('pr.metric')}>
              {metrics.map((m) => (
                <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={m === active} className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', m === active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {t(METRIC_KEY[m])}
                </button>
              ))}
            </div>
          )}
        </div>
        <ProgressChart points={chart} unit={unitLabel} />

        <details className="mt-3 text-sm" open={pts.length <= 4}>
          <summary className="cursor-pointer select-none font-medium text-slate-700">{t('pr.sessions', { n: pts.length })}</summary>
          <table className="mt-2 w-full">
            <tbody>
              {[...pts].reverse().slice(0, 12).map((p) => (
                <tr key={p.session} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-500">{fmtDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td className="py-1.5 pr-3 text-slate-800">{p.sets.map(setText).join(' · ')}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{p.e1rm ? t('pr.oneRm', { w: weightText(p.e1rm, unit) }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>{t('pr.all')}</CardTitle>
          <ul className="space-y-2">
            {summaries.map((s) => (
              <li key={s.key} className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200">
                <button type="button" onClick={() => { setPicked(s.key); setMetric(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{exName(s.label)}</div>
                    <div className="text-xs text-slate-500">
                      {s.metric === 'e1rm' ? `${weightText(s.last.topKg, unit)} × ${s.last.topReps}` : t('pr.repsValue', { n: s.last.bestReps })} · {t(s.sessions === 1 ? 'pr.session1' : 'pr.sessionN', { n: s.sessions })}
                    </div>
                  </div>
                  <Sparkline values={s.trend.map((v) => (s.metric === 'e1rm' ? toUnit(v, unit) : v))} />
                  <div className="w-24 text-right text-xs">
                    {s.sessions > 1 ? <Trend change={s.metric === 'e1rm' ? toUnit(s.change, unit) : s.change} suffix={s.metric === 'e1rm' ? ` ${unit}` : ''} /> : <span className="text-slate-400">{t('pr.newLift')}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle>{t('pr.weekVolume')}</CardTitle>
            <WeekBars weeks={weeks} unitLabel={unit} convert={(kg) => toUnit(kg, unit)} />
          </Card>
          <Card>
            <CardTitle icon={<Medal className="h-5 w-5 text-brand" />}>{t('pr.records')}</CardTitle>
            {records.length === 0 ? (
              <p className="text-sm text-slate-500">{t('pr.recordsEmpty')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {records.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{exName(r.label)}</div>
                      <div className="text-xs text-slate-500">{weightText(r.kg, unit)} × {r.reps} · {fmtDate(r.date, { day: 'numeric', month: 'short' })}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-slate-900">{weightText(r.e1rm, unit)}</div>
                      {r.before > 0 && r.e1rm > r.before ? <Badge tone="green">+{fmtNum(toUnit(r.e1rm - r.before, unit), 2)} {unit}</Badge> : <span className="text-xs text-slate-400">{t('pr.rm')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
