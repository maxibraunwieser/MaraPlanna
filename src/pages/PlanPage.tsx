import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Info } from 'lucide-react';
import { useData } from '../lib/data';
import { addDays, mondayOf, weekdayOf } from '../lib/planner/dates';
import { isRunWorkout } from '../lib/planner/adapt';
import { fmtDate, fmtDistance } from '../lib/format';
import type { PlannedWorkout, WeekSummary } from '../lib/types';
import { useI18n, type MsgKey } from '../lib/i18n';
import { weekdayNames } from '../lib/i18n/dates';
import { Badge, Card, cx, Modal, PageHeader, Spinner } from '../components/ui';
import { KIND_STYLE, WorkoutDetail, WorkoutRow } from '../components/Workout';
import { dropClass, useWorkoutDnd } from '../components/MoveWorkout';

const PHASE_TONE = { base: 'green', build: 'blue', peak: 'orange', taper: 'violet' } as const;

/** One week as a box: the summary is always visible, the sessions of the week open up in detail. All weeks start closed; the current one is scrolled into view. */
function WeekCard({ week, workouts, current, past }: { week: WeekSummary; workouts: PlannedWorkout[]; current: boolean; past: boolean }) {
  const { plan, units, activities, today } = useData();
  const { t, lang } = useI18n();
  const dayShort = weekdayNames(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlannedWorkout | null>(null);
  const dnd = useWorkoutDnd();
  const end = addDays(week.startDate, 6);
  const live = workouts.filter((w) => w.status !== 'skipped');
  const planned = live.filter(isRunWorkout).reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const done = activities
    .filter((a) => a.sport === 'run' && a.local_date >= week.startDate && a.local_date <= end)
    .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i));
  const showDone = past || current;

  return (
    <Card className={cx('!p-0', current && 'ring-2 ring-brand')}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full p-4 text-left sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-slate-900">{t('common.week', { n: week.week })}</span>
              <Badge tone={PHASE_TONE[week.phase]}>{t(`phase.${week.phase}` as MsgKey)}</Badge>
              {week.recovery && <Badge>{t('plan.recoveryWeek')}</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {current && <Badge tone="orange">{t('plan.thisWeek')}</Badge>}
              <span>{fmtDate(week.startDate, { day: 'numeric', month: 'short' })} – {fmtDate(end, { day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            <div className="text-right">
              <div className="text-base font-bold tabular-nums text-slate-900">{fmtDistance(planned, units)}</div>
              {showDone && <div className="text-xs text-slate-500">{t('plan.run', { km: fmtDistance(done, units) })}</div>}
            </div>
            <ChevronDown className={cx('mt-0.5 h-5 w-5 text-slate-400 transition', open && 'rotate-180')} />
          </div>
        </div>

        {showDone && planned > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (done / planned) * 100)}%` }} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1.5 text-xs text-slate-600">
            <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">{live.length === 1 ? t('plan.session1') : t('plan.sessions', { n: live.length })}</span>
            {week.longKm > 0 && <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">{t('plan.longRun', { km: fmtDistance(week.longKm, units) })}</span>}
          </div>
          <div className="flex gap-1" aria-hidden>
            {days.map((d) => {
              const items = workouts.filter((w) => w.date === d && w.status !== 'skipped');
              return (
                <div key={d} className={cx('flex w-6 flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium', d === today ? 'bg-brand-soft text-brand-dark' : 'text-slate-400')}>
                  {dayShort[weekdayOf(d)].slice(0, 2)}
                  <span className="flex h-2 items-center gap-0.5">
                    {items.length ? items.slice(0, 2).map((w) => <span key={w.id} className={cx('h-1.5 w-1.5 rounded-full', KIND_STYLE[w.kind].dot)} />) : <span className="h-px w-1.5 bg-slate-300" />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </button>

      {open && plan && (
        <div className="grid gap-3 border-t border-slate-100 p-3 sm:p-4 md:grid-cols-2">
          {days.map((d) => {
            const items = workouts.filter((w) => w.date === d);
            return (
              <div key={d} data-day={d} {...dnd.dropProps(d)} className={cx('rounded-xl p-3 transition', d === today ? 'bg-brand-soft' : 'bg-slate-50', dropClass(dnd.dropState(d)))}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                  <span>{fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                  {d === today && <Badge tone="orange">{t('common.today')}</Badge>}
                </div>
                {items.length ? (
                  <div className="space-y-2">
                    {items.map((w) => (
                      <WorkoutRow key={w.id} w={w} paces={plan.fitness.paces} units={units} onClick={() => setSelected(w)} drag={dnd.dragProps(w)} dragging={dnd.isDragging(w)} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Check className="h-3.5 w-3.5" /> {t('dash.rest')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <WorkoutDetail w={selected} onClose={() => setSelected(null)} />
      {dnd.dialog}
    </Card>
  );
}

/** The explanation of the plan that used to sit as four phase cards on the page. */
function PlanInfo({ phases, weeks, onClose }: { phases: readonly (keyof typeof PHASE_TONE)[]; weeks: WeekSummary[]; onClose: () => void }) {
  const { t } = useI18n();
  const box = 'rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200';
  const more: [string, string][] = [
    [t('plan.info.recovery.title'), t('plan.info.recovery.text')],
    [t('plan.info.key.title'), t('plan.info.key.text')],
    [t('plan.info.adapt.title'), t('plan.info.adapt.text')],
    [t('plan.info.move.title'), t('plan.drag')],
  ];
  return (
    <Modal open onClose={onClose} title={t('plan.info.title')} wide>
      <p className="mb-4 text-sm text-slate-600">{t('plan.info.intro')}</p>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('plan.info.phases')}</h3>
      <div className="space-y-2">
        {phases.map((p) => {
          const ws = weeks.filter((w) => w.phase === p);
          return (
            <div key={p} className={box}>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={PHASE_TONE[p]}>{t(`phase.${p}` as MsgKey)}</Badge>
                <span className="text-xs text-slate-500">{t('plan.weeksRange', { a: ws[0].week, b: ws[ws.length - 1].week })}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{t(`plan.phase.${p}` as MsgKey)}</p>
            </div>
          );
        })}
      </div>
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('plan.info.more')}</h3>
      <div className="space-y-2">
        {more.map(([title, text]) => (
          <div key={title} className={box}>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <p className="mt-1 text-sm text-slate-700">{text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function PlanPage() {
  const { loading, plan, workouts, today } = useData();
  const { t } = useI18n();
  const [showPast, setShowPast] = useState(false);
  const [info, setInfo] = useState(false);
  const currentRef = useRef<HTMLDivElement>(null);
  const thisMonday = mondayOf(today);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan?.id]);

  if (loading) return <Spinner />;
  if (!plan) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">{t('plan.none')}</p>
        <Link to="/plan/new" className="mt-3 inline-block font-semibold text-brand">{t('plan.create')}</Link>
      </Card>
    );
  }

  const weeks = plan.weeks.length
    ? plan.weeks
    : [...new Set(workouts.map((w) => w.week))].map((n) => {
        const ws = workouts.filter((w) => w.week === n);
        return { week: n, startDate: mondayOf(ws[0].date), phase: ws[0].phase, targetKm: 0, longKm: 0, recovery: false };
      });
  const past = weeks.filter((w) => w.startDate < thisMonday);
  const upcoming = weeks.filter((w) => w.startDate >= thisMonday);
  const phases = (['base', 'build', 'peak', 'taper'] as const).filter((p) => weeks.some((w) => w.phase === p));

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t('plan.title')}
            <button
              type="button"
              onClick={() => setInfo(true)}
              aria-label={t('plan.info.aria')}
              title={t('plan.info.aria')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 outline-none transition hover:bg-white/10 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Info className="h-4 w-4" />
            </button>
          </span>
        }
        subtitle={
          plan.fitness.raceDistanceM === null
            ? t('plan.sub.norace', { weeks: weeks.length, date: fmtDate(plan.race_date, { day: 'numeric', month: 'long', year: 'numeric' }) })
            : t('plan.sub.race', { weeks: weeks.length, race: plan.race_name || t('plan.sub.raceDay'), date: fmtDate(plan.race_date, { day: 'numeric', month: 'long', year: 'numeric' }) })
        }
      />

      {past.length > 0 && (
        <button onClick={() => setShowPast(!showPast)} className="mb-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
          {showPast ? (past.length > 1 ? t('plan.pastHide', { n: past.length }) : t('plan.pastHide1')) : past.length > 1 ? t('plan.pastShow', { n: past.length }) : t('plan.pastShow1')}
        </button>
      )}
      <div className="space-y-5">
        {showPast &&
          past.map((w) => (
            <WeekCard key={w.week} week={w} workouts={workouts.filter((x) => x.date >= w.startDate && x.date <= addDays(w.startDate, 6))} current={false} past />
          ))}
        {upcoming.map((w) => (
          <div key={w.week} ref={w.startDate === thisMonday ? currentRef : undefined} className="scroll-mt-20">
            <WeekCard
              week={w}
              workouts={workouts.filter((x) => x.date >= w.startDate && x.date <= addDays(w.startDate, 6))}
              current={w.startDate === thisMonday}
              past={false}
            />
          </div>
        ))}
      </div>
      {info && <PlanInfo phases={phases} weeks={weeks} onClose={() => setInfo(false)} />}
    </div>
  );
}
