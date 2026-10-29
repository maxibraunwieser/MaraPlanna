// Sick, injured or otherwise off: pause the plan and come back gradually.
//
// A break is stored with the plan (fitness.breaks). Creating, extending, ending
// early and cancelling all go through planBreak(), which returns the same kind
// of result as adaptPlan(), so it is saved by persistAdaptation().
//
// Comeback rules (heuristics built on):
// - ≤ 2 lost days cost no fitness: sessions are paused, nothing is rebuilt.
// - VO₂max and endurance drop measurably after ~2 weeks without training
//   (Coyle et al. 1984; Mujika & Padilla 2000), so longer breaks restart at a
//   lower volume, with easy days first and slightly slower paces.
// - Easy running during a mild illness keeps most of the fitness, so an
//   "easy only" break counts about a third of its days as lost.
// - Illness: return once symptoms are gone and you have been fever-free; an
//   extra easy day. Injuries come back more gradually still.

import type { Activity, BreakKind, PlanBreak, PlanFitness, PlannedWorkout, TrainingPlan } from '../types';
import { PatchSet, type AdaptResult, type WorkoutPatch } from './adapt';
import { keepDuring } from './breakRules';
import { addDays, daysBetween, maxDate, mondayOf } from './dates';
import { withNewVdot } from './generate';

export interface BreakDraft {
  id?: string;
  kind: BreakKind;
  mode: 'rest' | 'easy';
  from: string;
  /** Last day of the break (inclusive). */
  to: string;
}

export interface Comeback {
  days: number;
  /** Days that count as fully lost training. */
  lostDays: number;
  /** Factors on the pre-break weekly volume and long run. */
  volume: number;
  long: number;
  /** Easy-only days after the return. */
  easyDays: number;
  /** Share of VDOT lost. */
  vdotDrop: number;
  replan: boolean;
}

export function comeback(b: Pick<BreakDraft, 'kind' | 'mode' | 'from' | 'to'>): Comeback {
  const days = daysBetween(b.from, b.to) + 1;
  const lostDays = b.mode === 'rest' ? days : Math.round(days * 0.35);
  let c: Omit<Comeback, 'days' | 'lostDays'>;
  if (lostDays <= 2) c = { volume: 1, long: 1, easyDays: 0, vdotDrop: 0, replan: false };
  else if (lostDays <= 4) c = { volume: 0.85, long: 0.85, easyDays: 2, vdotDrop: 0, replan: true };
  else if (lostDays <= 7) c = { volume: 0.75, long: 0.8, easyDays: 3, vdotDrop: 0, replan: true };
  else if (lostDays <= 14) c = { volume: 0.6, long: 0.7, easyDays: 5, vdotDrop: 0.02, replan: true };
  else if (lostDays <= 28) c = { volume: 0.5, long: 0.6, easyDays: 8, vdotDrop: 0.045, replan: true };
  else c = { volume: 0.4, long: 0.5, easyDays: 12, vdotDrop: 0.07, replan: true };
  if (c.replan && b.kind === 'injury') c = { ...c, volume: c.volume - 0.05, long: c.long - 0.05, easyDays: c.easyDays + 2 };
  if (c.replan && b.kind === 'sick' && b.mode === 'rest') c = { ...c, easyDays: c.easyDays + 1 };
  return { days, lostDays, ...c };
}

// ---------------------------------------------------------------------------
// What happens to each session during a break
// ---------------------------------------------------------------------------

const NOTE_PREFIX = 'Break:';
export const isBreakNote = (note: string | null | undefined) => !!note?.startsWith(NOTE_PREFIX);

export { keepDuring };

const skipNote = (b: Pick<BreakDraft, 'kind'>) =>
  b.kind === 'sick'
    ? `${NOTE_PREFIX} sick – rest. Sleep, fluids, no training.`
    : b.kind === 'injury'
      ? `${NOTE_PREFIX} injured – this session is paused.`
      : `${NOTE_PREFIX} time off – this session is paused.`;

const keepNote = (b: Pick<BreakDraft, 'mode'>) =>
  b.mode === 'easy'
    ? `${NOTE_PREFIX} easy only – keep it short and relaxed, stop if you feel worse.`
    : `${NOTE_PREFIX} light session – only if it is completely pain-free.`;

export const BREAK_LABEL: Record<BreakKind, string> = { sick: 'Sick', injury: 'Injured', other: 'Time off' };

// ---------------------------------------------------------------------------
// Helpers for the rest of the app
// ---------------------------------------------------------------------------

export const breaksOf = (plan: Pick<TrainingPlan, 'fitness'>) => plan.fitness.breaks ?? [];

/** Days covered by a break, including its easy comeback days. */
export const affectedUntil = (b: PlanBreak) => b.comebackUntil ?? addDays(b.to, 1);

export const inBreak = (breaks: PlanBreak[], date: string) => breaks.some((b) => date >= b.from && date <= b.to);

/** The break that is running or coming up (the user can have one at a time). */
export const openBreak = (plan: Pick<TrainingPlan, 'fitness'>, today: string) =>
  breaksOf(plan).find((b) => b.to >= today) ?? null;

export type BreakPhase = 'upcoming' | 'active' | 'comeback' | 'over';
export function breakPhase(b: PlanBreak, today: string): BreakPhase {
  if (today < b.from) return 'upcoming';
  if (today <= b.to) return 'active';
  if (b.comebackUntil && today < b.comebackUntil) return 'comeback';
  return 'over';
}

/** Break shown on the dashboard: running first, then upcoming, then one in its comeback days. */
export function visibleBreak(plan: Pick<TrainingPlan, 'fitness'>, today: string) {
  const all = breaksOf(plan);
  for (const phase of ['active', 'upcoming', 'comeback'] as const) {
    const b = all.find((x) => breakPhase(x, today) === phase);
    if (b) return b;
  }
  return null;
}

export function validateBreak(d: BreakDraft, raceDate: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.from) || !/^\d{4}-\d{2}-\d{2}$/.test(d.to)) return 'Pick the first and last day of the break.';
  if (d.to < d.from) return 'The return day has to be after the first day of the break.';
  if (d.from < addDays(today, -21)) return 'A break can start at most 3 weeks ago.';
  if (d.to >= raceDate) return 'The break has to end before race day.';
  return null;
}

/** Weekly km and long run before the break: the plan's targets, capped by what was really run. */
export function baseLevel(plan: Pick<TrainingPlan, 'weeks' | 'fitness'>, activities: Activity[], from: string) {
  const idx = plan.weeks.findIndex((w) => w.startDate === mondayOf(from));
  const around = idx >= 0 ? [plan.weeks[idx], plan.weeks[idx - 1]].filter(Boolean) : plan.weeks.slice(0, 1);
  const planned = Math.max(0, ...around.map((w) => w.targetKm)) || plan.fitness.startWeeklyKm;
  const plannedLong = Math.max(0, ...around.map((w) => w.longKm)) || Math.max(10, plan.fitness.peakLongKm * 0.5);
  const end = addDays(mondayOf(from), -1);
  const runs = activities.filter((a) => a.sport === 'run' && a.local_date > addDays(end, -21) && a.local_date <= end && (a.distance_m ?? 0) > 500);
  if (!runs.length) return { km: Math.round(planned), longKm: Math.round(plannedLong) };
  const weekly = runs.reduce((s, a) => s + a.distance_m! / 1000, 0) / 3;
  const longest = Math.max(...runs.map((a) => a.distance_m! / 1000));
  return {
    km: Math.round(Math.min(planned, Math.max(weekly * 1.15, planned * 0.7))),
    longKm: Math.round(Math.min(plannedLong, Math.max(longest, plannedLong * 0.75))),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `b${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

// ---------------------------------------------------------------------------
// Create / change / end / cancel a break
// ---------------------------------------------------------------------------

export interface BreakSummary {
  days: number;
  paused: number;
  pausedKey: number;
  kept: number;
  returnDate: string | null;
  easyUntil: string | null;
  baseKm: number;
  startKm: number | null;
  vdotBefore: number;
  vdotAfter: number;
  replan: boolean;
  /** The return falls into the taper or race week. */
  taper: boolean;
}

export interface BreakResult extends AdaptResult {
  break: PlanBreak | null;
  summary: BreakSummary;
}

/**
 * `draft` creates or updates a break (`draft.id` = existing break). `draft: null`
 * with `cancelId` removes a break and restores the plan.
 */
export function planBreak(input: {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
  activities: Activity[];
  today: string;
  draft: BreakDraft | null;
  cancelId?: string;
}): BreakResult {
  const { plan, activities, today, draft } = input;
  const breaks = breaksOf(plan);
  const prevId = draft?.id ?? input.cancelId;
  const prev = prevId ? (breaks.find((b) => b.id === prevId) ?? null) : null;
  if (!draft && !prev) throw new Error('This break no longer exists.');
  if (draft) {
    const err = validateBreak(draft, plan.race_date, today);
    if (err) throw new Error(err);
    const clash = breaks.find((b) => b.id !== prev?.id && b.from <= draft.to && b.to >= draft.from);
    if (clash) throw new Error('This overlaps another break – change that one instead.');
  }

  const base = prev
    ? { km: prev.baseKm, longKm: prev.baseLongKm, vdot: prev.baseVdot }
    : { ...baseLevel(plan, activities, draft!.from), vdot: plan.fitness.vdot };
  const c = draft ? comeback(draft) : null;
  const next: PlanBreak | null = draft
    ? {
        id: prev?.id ?? draft.id ?? newId(),
        kind: draft.kind,
        mode: draft.mode,
        from: draft.from,
        to: draft.to,
        baseKm: base.km,
        baseLongKm: base.longKm,
        baseVdot: base.vdot,
        comebackUntil: null,
        replanned: false,
        createdAt: prev?.createdAt ?? today,
      }
    : null;

  // 1. Sessions inside the break are paused (or kept, if light enough);
  //    sessions the old version of this break had paused come back.
  const patches = new PatchSet();
  const set = (w: PlannedWorkout, patch: WorkoutPatch) => {
    const changed = (Object.keys(patch) as (keyof WorkoutPatch)[]).some((k) => w[k] !== patch[k]);
    if (changed) patches.apply(w, patch);
  };
  const ws = input.workouts.map((w) => ({ ...w }));
  let paused = 0;
  let pausedKey = 0;
  let kept = 0;
  for (const w of ws) {
    if (w.kind === 'race' || w.status === 'completed' || w.status === 'partial') continue;
    if (next && w.date >= next.from && w.date <= next.to) {
      if (keepDuring(w, next)) {
        kept++;
        if (w.date >= today) set(w, { status: 'planned', status_source: 'auto', note: keepNote(next) });
        // Optional during a break – not done doesn't count as missed.
        else if (w.status === 'missed') set(w, { status: 'skipped', status_source: 'user', note: keepNote(next) });
      } else {
        paused++;
        if (w.key_session) pausedKey++;
        set(w, { status: 'skipped', status_source: 'user', note: skipNote(next) });
      }
    } else if (prev && isBreakNote(w.note) && w.date >= today && w.date >= prev.from && w.date <= addDays(prev.to, 2)) {
      set(w, { status: 'planned', status_source: 'auto', note: null });
    }
  }

  // 2. Rebuild from the return day (or restore the plan when a rebuild is undone).
  const returnDate = next ? addDays(next.to, 1) : null;
  let replan: AdaptResult['replan'] = null;
  if (c?.replan || prev?.replanned) {
    const fromDate = returnDate ? maxDate(today, returnDate) : maxDate(today, prev!.from);
    if (fromDate < plan.race_date) {
      const reduce = c?.replan ? c : null;
      let easyUntil = reduce && returnDate && reduce.easyDays > 0 ? addDays(returnDate, reduce.easyDays) : null;
      if (easyUntil && easyUntil <= fromDate) easyUntil = null;
      replan = {
        fromDate,
        startKm: Math.max(10, Math.round(base.km * (reduce?.volume ?? 1))),
        startLongKm: Math.max(6, Math.round(base.longKm * (reduce?.long ?? 1))),
        easyUntil,
      };
    }
  }
  if (next && returnDate && !replan && next.kind !== 'other') {
    // Short break: no rebuild, just a heads-up on the first key session back.
    const first = ws.find(
      (w) => w.date >= returnDate && w.date <= addDays(next.to, 2) && w.status === 'planned' && w.key_session && w.kind !== 'race' && !w.note,
    );
    if (first) set(first, { note: `${NOTE_PREFIX} first hard session back – run it easier if you don't feel 100 %.` });
  }
  if (next) {
    next.comebackUntil = replan?.easyUntil ?? null;
    next.replanned = !!replan && !!c?.replan;
  }

  // 3. Paces: long rest breaks cost some fitness; restored when the break gets shorter or is cancelled.
  let fitness: PlanFitness = plan.fitness;
  const prevDrop = prev ? comeback(prev).vdotDrop : 0;
  const drop = c?.vdotDrop ?? 0;
  if (drop !== prevDrop) {
    const target = round1(base.vdot * (1 - drop));
    if (Math.abs(target - plan.fitness.vdot) >= 0.05) {
      const reason = drop > 0 ? `${c!.days}-day break (${BREAK_LABEL[draft!.kind].toLowerCase()})` : 'Break shortened or cancelled';
      fitness = withNewVdot(plan.fitness, plan.inputs, target, today, reason);
    }
  }
  const others = breaks.filter((b) => b.id !== prev?.id);
  fitness = {
    ...fitness,
    breaks: next ? [...others, next].sort((a, b) => a.from.localeCompare(b.from)) : others,
    ...(replan ? { lastReplanAt: today } : {}),
  };

  // 4. Explain it.
  const messages: AdaptResult['messages'] = [];
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (next && c) {
    const what = `${BREAK_LABEL[next.kind]} ${day(next.from)} – ${day(next.to)}: ${paused} session${paused === 1 ? '' : 's'} paused${kept ? `, ${kept} light one${kept === 1 ? '' : 's'} kept` : ''}.`;
    const back = replan
      ? ` From ${day(replan.fromDate)} the plan rebuilds from ~${replan.startKm} km/week${replan.easyUntil ? `, easy runs only until ${day(addDays(replan.easyUntil, -1))}` : ''}.`
      : ' Short break – no catch-up needed.';
    messages.push({ kind: 'break', message: what + back + (fitness.vdot < plan.fitness.vdot ? ` Paces eased (VDOT ${plan.fitness.vdot.toFixed(1)} → ${fitness.vdot.toFixed(1)}).` : '') });
  } else if (prev) {
    messages.push({ kind: 'break', message: `Break ${day(prev.from)} – ${day(prev.to)} cancelled${replan ? ' – the plan is back to its previous level' : ''}.` });
  }

  const taperStart = plan.weeks.find((w) => w.phase === 'taper')?.startDate ?? plan.race_date;
  return {
    patches: patches.list(),
    replan,
    fitness,
    messages,
    break: next,
    summary: {
      days: c?.days ?? 0,
      paused,
      pausedKey,
      kept,
      returnDate,
      easyUntil: replan?.easyUntil ?? null,
      baseKm: base.km,
      startKm: replan?.startKm ?? null,
      vdotBefore: plan.fitness.vdot,
      vdotAfter: fitness.vdot,
      replan: !!replan,
      taper: !!returnDate && returnDate >= taperStart,
    },
  };
}

/** "I'm feeling better": end the break yesterday – or cancel it if it hasn't really started. */
export function endBreakEarly(input: { plan: TrainingPlan; workouts: PlannedWorkout[]; activities: Activity[]; today: string; id: string }): BreakResult {
  const b = breaksOf(input.plan).find((x) => x.id === input.id);
  if (!b) throw new Error('This break no longer exists.');
  if (input.today <= b.from) return planBreak({ ...input, draft: null, cancelId: b.id });
  return planBreak({ ...input, draft: { id: b.id, kind: b.kind, mode: b.mode, from: b.from, to: addDays(input.today, -1) } });
}
