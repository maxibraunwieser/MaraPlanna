import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ChevronDown, Hand, RefreshCw } from 'lucide-react';
import { useData } from '../lib/data';
import { addDays, mondayOf } from '../lib/planner/dates';
import { isRunWorkout } from '../lib/planner/adapt';
import { fmtDate, fmtDistance } from '../lib/format';
import type { PlannedWorkout, WeekSummary } from '../lib/types';
import { Badge, Button, Card, cx, Modal, PageHeader, Spinner } from '../components/ui';
import { WorkoutDetail, WorkoutRow } from '../components/Workout';
import { dropClass, useWorkoutDnd } from '../components/MoveWorkout';
import { BreakBanner, BreakButton } from '../components/BreakDialog';
import { CalendarSubscribe } from '../components/CalendarFeed';

const PHASE_TONE = { base: 'green', build: 'blue', peak: 'orange', taper: 'violet' } as const;
const PHASE_TEXT = {
  base: 'Aerobic base: easy volume, strides and light speed.',
  build: 'Threshold work and marathon-pace running build race fitness.',
  peak: 'Biggest weeks: longest runs and race-specific sessions.',
  taper: 'Volume drops so you arrive fresh; intensity stays.',
};

function WeekCard({ week, workouts, current, past }: { week: WeekSummary; workouts: PlannedWorkout[]; current: boolean; past: boolean }) {
  const { plan, units, activities, today } = useData();
  const [open, setOpen] = useState(!past);
  const [selected, setSelected] = useState<PlannedWorkout | null>(null);
  const dnd = useWorkoutDnd();
  const end = addDays(week.startDate, 6);
  const planned = workouts.filter((w) => isRunWorkout(w) && w.status !== 'skipped').reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const done = activities
    .filter((a) => a.sport === 'run' && a.local_date >= week.startDate && a.local_date <= end)
    .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i));

  return (
    <Card className={cx('p-0', current && 'ring-2 ring-brand')}>
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-900">Week {week.week}</span>
            <Badge tone={PHASE_TONE[week.phase]} className="capitalize">{week.phase}</Badge>
            {week.recovery && <Badge>Recovery week</Badge>}
            {current && <Badge tone="orange">This week</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {fmtDate(week.startDate, { day: 'numeric', month: 'short' })} – {fmtDate(end, { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-900">{fmtDistance(planned, units)}</div>
            {(past || current) && <div className="text-xs text-slate-500">{fmtDistance(done, units)} run</div>}
          </div>
          <ChevronDown className={cx('h-5 w-5 text-slate-400 transition', open && 'rotate-180')} />
        </div>
      </button>
      {open && plan && (
        <div className="border-t border-slate-100 p-3 sm:p-4">
          <div className="grid gap-2 lg:grid-cols-7">
            {days.map((d) => {
              const items = workouts.filter((w) => w.date === d);
              return (
                <div key={d} data-day={d} {...dnd.dropProps(d)} className={cx('rounded-xl p-2 transition', d === today ? 'bg-brand-soft' : 'bg-slate-50', dropClass(dnd.dropState(d)))}>
                  <div className="mb-2 px-1 text-xs font-semibold text-slate-600">{fmtDate(d, { weekday: 'short', day: 'numeric' })}</div>
                  <div className="space-y-2">
                    {items.length ? (
                      items.map((w) => (
                        <WorkoutRow key={w.id} w={w} paces={plan.fitness.paces} units={units} compact onClick={() => setSelected(w)} drag={dnd.dragProps(w)} dragging={dnd.isDragging(w)} />
                      ))
                    ) : (
                      <div className="px-1 pb-1 text-xs text-slate-400">Rest</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <WorkoutDetail w={selected} onClose={() => setSelected(null)} />
      {dnd.dialog}
    </Card>
  );
}

export function PlanPage() {
  const { loading, plan, workouts, today, syncing, syncNow, connection } = useData();
  const [showPast, setShowPast] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const currentRef = useRef<HTMLDivElement>(null);
  const thisMonday = mondayOf(today);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [plan?.id]);

  if (loading) return <Spinner />;
  if (!plan) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">No plan yet.</p>
        <Link to="/plan/new" className="mt-3 inline-block font-semibold text-brand">Create your plan →</Link>
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
        title="Training plan"
        subtitle={`${weeks.length} weeks to ${plan.race_name || 'race day'} · ${fmtDate(plan.race_date, { day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <BreakButton />
            <Button variant="secondary" size="sm" onClick={() => setCalendar(true)} icon={<CalendarPlus className="h-4 w-4" />}>
              Calendar
            </Button>
            {connection && (
              <Button variant="secondary" size="sm" onClick={() => syncNow()} loading={syncing} icon={<RefreshCw className="h-4 w-4" />}>
                Sync Garmin
              </Button>
            )}
            <Link to="/plan/new">
              <Button variant="secondary" size="sm">Rebuild plan</Button>
            </Link>
          </>
        }
      />

      <BreakBanner className="mb-5" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {phases.map((p) => {
          const ws = weeks.filter((w) => w.phase === p);
          return (
            <div key={p} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <Badge tone={PHASE_TONE[p]} className="capitalize">{p}</Badge>
                <span className="text-xs text-slate-500">Weeks {ws[0].week}–{ws[ws.length - 1].week}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{PHASE_TEXT[p]}</p>
            </div>
          );
        })}
      </div>

      <p className="mb-3 hidden items-center gap-1.5 text-xs text-slate-500 [@media(pointer:fine)]:flex">
        <Hand className="h-3.5 w-3.5" /> Drag a session to another day to move it – or click it for details.
      </p>
      {past.length > 0 && (
        <button onClick={() => setShowPast(!showPast)} className="mb-3 text-sm font-semibold text-slate-600 hover:text-slate-900">
          {showPast ? 'Hide' : 'Show'} {past.length} past week{past.length > 1 ? 's' : ''}
        </button>
      )}
      <div className="space-y-3">
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
      <Modal open={calendar} onClose={() => setCalendar(false)} title="Your plan in your calendar">
        <CalendarSubscribe />
      </Modal>
    </div>
  );
}
