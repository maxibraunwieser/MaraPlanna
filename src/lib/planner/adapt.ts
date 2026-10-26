// Keeps the plan in sync with reality: links activities to workouts, marks
// misses, reschedules missed key sessions, rebuilds upcoming weeks after
// breaks or low compliance, and updates paces when fitness changes.

import type { Activity, DailyMetric, PlanFitness, PlannedWorkout, Sport, TrainingPlan, WorkoutKind } from '../types';
import { addDays, daysBetween, mondayOf, weekdayOf } from './dates';
import { estimateMaxHr, estimateRestingHr, heartRateVdot, paceFloorVdot } from './fitness';
import { withNewVdot } from './generate';

export type WorkoutPatch = Partial<
  Pick<PlannedWorkout, 'status' | 'status_source' | 'activity_id' | 'actual_distance_km' | 'date' | 'original_date' | 'note'>
>;

export interface AdaptResult {
  patches: { id: string; patch: WorkoutPatch }[];
  replan: { fromDate: string; startKm: number; startLongKm: number } | null;
  fitness: PlanFitness | null;
  messages: { kind: string; message: string }[];
}

const RUN_KINDS = new Set<WorkoutKind>([
  'easy', 'recovery', 'long', 'long_mp', 'threshold', 'intervals', 'marathon_pace', 'fartlek', 'shakeout', 'race',
]);
export const isRunWorkout = (w: { kind: WorkoutKind }) => RUN_KINDS.has(w.kind);
/** Which recorded activity types can complete a planned workout. */
const MATCHING_SPORTS: Partial<Record<WorkoutKind, Sport[]>> = {
  strength_upper: ['strength'],
  strength_lower: ['strength'],
  strength_full: ['strength'],
  core: ['strength', 'mobility', 'other'],
  mobility: ['mobility', 'other', 'strength'],
  plyo: ['strength', 'other'],
  bike: ['bike'],
  swim: ['swim'],
  custom: ['other', 'strength', 'bike', 'swim', 'mobility', 'walk'],
};
const sportsFor = (w: { kind: WorkoutKind }): Sport[] => (isRunWorkout(w) ? ['run'] : (MATCHING_SPORTS[w.kind] ?? ['strength']));
const sportOf = (w: PlannedWorkout) => sportsFor(w)[0];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayName = (iso: string) => DAY_NAMES[weekdayOf(iso)];
const km = (a: Activity) => (a.distance_m ?? 0) / 1000;

export class PatchSet {
  private map = new Map<string, WorkoutPatch>();
  apply(w: PlannedWorkout, patch: WorkoutPatch) {
    Object.assign(w, patch);
    this.map.set(w.id, { ...(this.map.get(w.id) ?? {}), ...patch });
  }
  list() {
    return [...this.map].map(([id, patch]) => ({ id, patch }));
  }
}

/** Link activities to planned workouts and mark past unmatched workouts as missed. */
export function reconcile(workouts: PlannedWorkout[], activities: Activity[], today: string, patches = new PatchSet()) {
  const ws = workouts.map((w) => ({ ...w }));
  const linked = new Set(ws.map((w) => w.activity_id).filter(Boolean) as string[]);
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) byDate.set(a.local_date, [...(byDate.get(a.local_date) ?? []), a]);

  const open = ws
    .filter((w) => w.status_source === 'auto' && !w.activity_id && (w.status === 'planned' || w.status === 'missed') && w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.key_session) - Number(a.key_session));

  for (const pass of [0, 1]) {
    for (const w of open) {
      if (w.activity_id) continue;
      const sport = sportOf(w);
      const sports = sportsFor(w);
      const dates = pass === 0 ? [w.date] : [addDays(w.date, -1), addDays(w.date, 1)];
      for (const d of dates) {
        if (d > today) continue;
        // On a neighbouring day only use activities that day's own plan doesn't need.
        if (pass === 1 && ws.some((o) => o.id !== w.id && o.date === d && sportOf(o) === sport && o.status !== 'skipped')) continue;
        const acts = (byDate.get(d) ?? []).filter((a) => sports.includes(a.sport) && !linked.has(a.id));
        if (!acts.length) continue;
        const target = w.distance_km ?? 0;
        const act = acts.sort((a, b) => Math.abs(km(a) - target) - Math.abs(km(b) - target))[0];
        linked.add(act.id);
        const actualKm = act.distance_m ? Math.round(km(act) * 10) / 10 : null;
        const ratio = w.distance_km && actualKm ? actualKm / w.distance_km : 1;
        patches.apply(w, { activity_id: act.id, actual_distance_km: actualKm, status: ratio >= 0.75 ? 'completed' : 'partial' });
        break;
      }
    }
  }

  for (const w of ws) {
    if (w.status === 'planned' && w.status_source === 'auto' && w.date < today && !w.activity_id) patches.apply(w, { status: 'missed' });
  }
  return { workouts: ws, patches };
}

/** Can `day` take a key session without stacking hard days? Returns the easy run it would replace, if any. */
function canHostKey(ws: PlannedWorkout[], day: string, movingId: string, today: string, plan: TrainingPlan) {
  if (day < today || day >= mondayOf(plan.race_date)) return null;
  const active = (w: PlannedWorkout) => w.id !== movingId && isRunWorkout(w) && w.status !== 'skipped' && w.status !== 'missed';
  for (const d of [addDays(day, -1), day, addDays(day, 1)]) {
    if (ws.some((w) => w.date === d && active(w) && w.key_session)) return null;
  }
  const runs = ws.filter((w) => w.date === day && active(w));
  if (runs.some((w) => w.status !== 'planned')) return null;
  if (!runs.length && !plan.inputs.availableDays.includes(weekdayOf(day))) return null;
  return { replace: runs[0] ?? null };
}

export function adaptPlan(input: {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
  activities: Activity[];
  metrics: DailyMetric[];
  today: string;
}): AdaptResult & { workouts: PlannedWorkout[] } {
  const { plan, activities, metrics, today } = input;
  const messages: AdaptResult['messages'] = [];
  const patches = new PatchSet();
  const { workouts: ws } = reconcile(input.workouts, activities, today, patches);

  // 1. Reschedule recently missed key sessions into the next 3 days.
  const recentMisses = ws
    .filter((w) => w.status === 'missed' && w.key_session && w.kind !== 'race' && !w.original_date && !w.note && daysBetween(w.date, today) <= 3)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const missed of recentMisses) {
    const window = [0, 1, 2, 3].map((i) => addDays(today, i));
    const hosts = window.map((d) => ({ d, host: canHostKey(ws, d, missed.id, today, plan) }));
    const choice = hosts.find((h) => h.host?.replace) ?? hosts.find((h) => h.host);
    if (choice?.host) {
      const from = missed.date;
      if (choice.host.replace) {
        patches.apply(choice.host.replace, { status: 'skipped', note: `Replaced by your rescheduled ${missed.title}` });
      }
      patches.apply(missed, { date: choice.d, original_date: from, status: 'planned' });
      messages.push({
        kind: 'reschedule',
        message: `Missed "${missed.title}" on ${dayName(from)} – moved to ${choice.d === today ? 'today' : dayName(choice.d)}${choice.host.replace ? ' in place of an easy run' : ''}.`,
      });
    } else {
      patches.apply(missed, { note: 'Not made up – protecting recovery before your next key session.' });
      messages.push({
        kind: 'skip',
        message: `Missed "${missed.title}" on ${dayName(missed.date)}. It was not squeezed in so you stay fresh for the next key session.`,
      });
    }
  }

  // 2. Breaks / low compliance → rebuild upcoming weeks from current level.
  const runs = activities.filter((a) => a.sport === 'run' && (a.distance_m ?? 0) > 500);
  const inRange = (a: Activity, from: string, to: string) => a.local_date >= from && a.local_date <= to;
  const windowStart = addDays(today, -14);
  const yesterday = addDays(today, -1);
  const planned14 = ws
    .filter((w) => isRunWorkout(w) && w.date >= windowStart && w.date <= yesterday && !(w.status === 'skipped' && w.status_source === 'auto'))
    .reduce((s, w) => s + (w.distance_km ?? 0), 0);
  const actual14 = runs.filter((a) => inRange(a, windowStart, yesterday)).reduce((s, a) => s + km(a), 0);
  const lastRun = runs.reduce<string | null>((max, a) => (a.local_date < today && (!max || a.local_date > max) ? a.local_date : max), null);
  const planAgeDays = daysBetween(plan.start_date, today);
  const daysSinceRun = lastRun ? daysBetween(lastRun, today) : planAgeDays;
  const recentlyReplanned = plan.fitness.lastReplanAt && daysBetween(plan.fitness.lastReplanAt, today) < 7;
  const raceWeekStart = mondayOf(plan.race_date);

  let replan: AdaptResult['replan'] = null;
  let fitness: PlanFitness | null = null;
  const fromDate = weekdayOf(today) <= 1 ? today : addDays(mondayOf(today), 7);

  if (!recentlyReplanned && planAgeDays >= 7 && fromDate < raceWeekStart) {
    const longest = (from: string, to: string) => Math.max(0, ...runs.filter((a) => inRange(a, from, to)).map(km));
    if (daysSinceRun >= 7) {
      const breakWeeks = Math.floor(daysSinceRun / 7);
      const before = lastRun ? runs.filter((a) => inRange(a, addDays(lastRun, -27), lastRun)).reduce((s, a) => s + km(a), 0) / 4 : plan.fitness.startWeeklyKm;
      const startKm = Math.max(10, Math.round(before * Math.max(0.5, 1 - 0.12 * breakWeeks)));
      const startLongKm = Math.max(6, Math.round((lastRun ? longest(addDays(lastRun, -20), lastRun) : 8) * 0.8));
      replan = { fromDate, startKm, startLongKm };
      if (daysSinceRun >= 10) {
        const drop = Math.min(3, 0.4 * (daysSinceRun / 7));
        fitness = withNewVdot(plan.fitness, plan.inputs, plan.fitness.vdot - drop, today, `${daysSinceRun} days without running`);
      }
      messages.push({
        kind: 'replan',
        message: `No runs logged for ${daysSinceRun} days. The plan restarts gently at about ${startKm} km/week${fitness ? ' and paces were eased' : ''}.`,
      });
    } else if (planned14 >= 15 && actual14 / planned14 < 0.7) {
      const startKm = Math.max(10, Math.round((actual14 / 2) * 1.1));
      const startLongKm = Math.max(6, Math.round(longest(addDays(today, -21), yesterday)));
      replan = { fromDate, startKm, startLongKm };
      messages.push({
        kind: 'replan',
        message: `You ran ${Math.round(actual14)} of ${Math.round(planned14)} planned km in the last 2 weeks. Upcoming weeks were rebuilt from your current level (~${startKm} km/week).`,
      });
    }
  }

  // 3. Fitness drift → update paces (at most every 14 days).
  const lastChange = plan.fitness.history[plan.fitness.history.length - 1]?.date ?? plan.start_date;
  if (!fitness && daysBetween(lastChange, today) >= 14) {
    const recent = runs.filter((a) => daysBetween(a.local_date, today) < 28);
    const restingHr = estimateRestingHr(metrics, null, today);
    const maxHr = estimateMaxHr(plan.inputs, null, activities, today);
    const hr = heartRateVdot(recent, restingHr, maxHr);
    const floor = paceFloorVdot(recent);
    const current = plan.fitness.vdot;
    let estimate = hr.count >= 4 ? hr.vdot : null;
    if (floor && floor > (estimate ?? current) + 0.5) estimate = floor;
    if (estimate) {
      const delta = estimate - current;
      // Heart rate drifts with heat, fatigue and illness, so downgrades need
      // a larger, well-supported gap and move in smaller steps than upgrades.
      if (delta >= 1 || (delta <= -3 && hr.count >= 8)) {
        const next = current + Math.max(-1, Math.min(1.5, delta));
        fitness = withNewVdot(plan.fitness, plan.inputs, next, today, delta > 0 ? 'Recent runs faster at same effort' : 'Recent runs slower at same effort');
        messages.push({
          kind: 'paces',
          message: `Your recent runs suggest your fitness ${delta > 0 ? 'improved' : 'dipped'} (VDOT ${current.toFixed(1)} → ${next.toFixed(1)}). Training paces were updated.`,
        });
      }
    }
  }

  if (replan) {
    fitness = { ...(fitness ?? plan.fitness), lastReplanAt: today };
  }

  return { patches: patches.list(), replan, fitness, messages, workouts: ws };
}

/**
 * If readiness is low on a key-session day, find the nearest easy run in the
 * next 3 days to swap with.
 */
export function findEasySwap(workouts: PlannedWorkout[], today: string) {
  const key = workouts.find((w) => w.date === today && w.key_session && w.status === 'planned' && w.kind !== 'race' && isRunWorkout(w));
  if (!key) return null;
  for (let i = 1; i <= 3; i++) {
    const d = addDays(today, i);
    const easy = workouts.find((w) => w.date === d && w.status === 'planned' && !w.key_session && isRunWorkout(w));
    const neighboursKey = workouts.some(
      (w) => w.id !== key.id && w.key_session && w.status !== 'skipped' && (w.date === addDays(d, 1) || w.date === addDays(d, -1)) && w.date !== today,
    );
    if (easy && !neighboursKey) return { key, easy };
  }
  return null;
}
