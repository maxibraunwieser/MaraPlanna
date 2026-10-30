// Turning the coach's confirmed proposals into changes of the plan. Uses the same tested planner
// functions as the rest of the app (moving, rebuilding weeks), so a coach change behaves exactly
// like one made by hand.

import type { CoachAction, PlanChanges } from '../../supabase/functions/_shared/coachTools.ts';
import * as api from './api';
import { normalizeAnswers } from './answers';
import type { Activity, OnboardingAnswers, PlannedWorkout, Profile, TrainingPlan, Weekday } from './types';
import { addDays, daysBetween, mondayOf, weekdayOf } from './planner/dates';
import { canMove, inBounds, moveBounds, movePatches } from './planner/move';
import { scaleWorkout } from './planner/scale';
import { editWorkout, type WorkoutEdit } from './planner/edit';

export type { CoachAction };

export interface ActionContext {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
  activities: Activity[];
  profile: Profile | null;
  today: string;
}

const byId = (workouts: PlannedWorkout[], id: string) => workouts.find((w) => w.id === id);

const specOf = (e: { removeStrides?: boolean; addStrides?: boolean; distanceKm?: number; makeEasy?: boolean }): WorkoutEdit => ({
  removeStrides: e.removeStrides,
  addStrides: e.addStrides,
  distanceKm: e.distanceKm,
  makeEasy: e.makeEasy,
});

/** The sessions of an edit proposal that can still be changed, with their result. */
function editable(a: Extract<CoachAction, { tool: 'edit_workouts' }>, ctx: ActionContext) {
  return a.edits.flatMap((e) => {
    const w = byId(ctx.workouts, e.workoutId);
    if (!w || w.status !== 'planned' || w.date < ctx.today) return [];
    const result = editWorkout(w, specOf(e), ctx.plan.fitness.paces);
    return result ? [{ w, result }] : [];
  });
}

/** The questionnaire answers after the proposed changes. */
export function answersFromChanges(current: OnboardingAnswers, c: PlanChanges): OnboardingAnswers {
  const next: OnboardingAnswers = { ...current };
  if (c.availableDays) next.availableDays = c.availableDays as Weekday[];
  if (c.runsPerWeek !== undefined) next.runDaysPerWeek = c.runsPerWeek;
  if (c.longRunDay !== undefined) next.longRunDay = c.longRunDay as Weekday;
  if ('weekdayMaxMinutes' in c) next.weekdayMaxMinutes = c.weekdayMaxMinutes ?? null;
  if (c.approach) next.approach = c.approach;
  if (c.injuryProne !== undefined) next.injuryProne = c.injuryProne;
  if (c.injuries !== undefined) next.injuries = c.injuries;
  next.runDaysPerWeek = Math.min(next.runDaysPerWeek, next.availableDays.length);
  return normalizeAnswers(next);
}

/** Where the rebuilt weeks start and at what weekly volume (from what the athlete really ran lately). */
export function replanStart(plan: TrainingPlan, activities: Activity[], today: string) {
  const fromDate = weekdayOf(today) <= 1 ? today : addDays(mondayOf(today), 7);
  const runs = activities.filter((a) => a.sport === 'run' && (a.distance_m ?? 0) > 500);
  const km = (a: Activity) => (a.distance_m ?? 0) / 1000;
  const last28 = runs.filter((a) => daysBetween(a.local_date, today) >= 0 && daysBetween(a.local_date, today) < 28).reduce((s, a) => s + km(a), 0);
  const longest = Math.max(0, ...runs.filter((a) => daysBetween(a.local_date, today) >= 0 && daysBetween(a.local_date, today) < 21).map(km));
  const peak = plan.fitness.peakWeeklyKm || 80;
  return {
    fromDate,
    startKm: Math.min(peak, Math.max(10, Math.round(last28 / 4))),
    startLongKm: Math.max(6, Math.round(longest)),
    tooLate: fromDate >= mondayOf(plan.race_date),
  };
}

/** Why a proposal no longer applies (null = it does). The plan may have changed since the coach wrote it. */
export function staleReason(a: CoachAction, ctx: ActionContext): string | null {
  switch (a.tool) {
    case 'move_workout': {
      const w = byId(ctx.workouts, a.workoutId);
      if (!w) return 'That session is no longer in your plan.';
      if (!canMove(w)) return `"${w.title}" is already ${w.status} and can't be moved.`;
      if (!inBounds(a.date, moveBounds(ctx.today, ctx.plan.race_date))) return 'That day is no longer possible.';
      return null;
    }
    case 'skip_workouts': {
      const open = a.workoutIds.map((id) => byId(ctx.workouts, id)).filter((w) => w && w.status === 'planned' && w.date >= ctx.today);
      return open.length ? null : 'Those sessions are no longer open.';
    }
    case 'scale_workouts': {
      const open = a.items.filter((i) => {
        const w = byId(ctx.workouts, i.workoutId);
        return w && w.status === 'planned' && w.date >= ctx.today && scaleWorkout(w, i.factor, ctx.plan.fitness.paces);
      });
      return open.length ? null : 'Those sessions are no longer open or would not change.';
    }
    case 'edit_workouts':
      // Only remembering "no strides" needs no open session.
      return a.edits.length === 0 || editable(a, ctx).length ? null : 'Those sessions are no longer open or already look like that.';
    case 'change_plan':
      return replanStart(ctx.plan, ctx.activities, ctx.today).tooLate ? 'Too close to the race to rebuild the plan.' : null;
  }
}

/** The lines shown on the confirmation card: what will really happen, not what the coach estimated. */
export function previewAction(a: CoachAction, ctx: ActionContext): string[] {
  if (a.tool === 'edit_workouts') {
    const rows = editable(a, ctx);
    const shown = rows.slice(0, 6).map(({ w, result }) => {
      const now = result.title !== w.title ? ` (now "${result.title}")` : '';
      return `${w.title} on ${w.date}: ${w.distance_km ?? '?'} km → ${result.distance_km} km${now}`;
    });
    const more = rows.length > 6 ? [`… and ${rows.length - 6} more sessions like these`] : [];
    const remember = a.summary.split('\n').filter((l) => /^(From now on|Easy runs may)/.test(l));
    return [...shown, ...more, ...remember];
  }
  if (a.tool !== 'scale_workouts') return a.summary.split('\n');
  return a.items.map((i) => {
    const w = byId(ctx.workouts, i.workoutId);
    if (!w) return 'A session is no longer in your plan.';
    const s = scaleWorkout(w, i.factor, ctx.plan.fitness.paces);
    if (!s) return `"${w.title}": no change possible`;
    return `${w.title} on ${w.date}: ${w.distance_km ?? '?'} km → ${s.distance_km} km${s.title !== w.title ? ` (now "${s.title}")` : ''}`;
  });
}

/** Applies a confirmed proposal. Throws a readable error when it can't be applied any more. */
export async function applyAction(a: CoachAction, ctx: ActionContext): Promise<void> {
  const stale = staleReason(a, ctx);
  if (stale) throw new Error(stale);
  const { plan, today } = ctx;

  if (a.tool === 'move_workout') {
    const w = byId(ctx.workouts, a.workoutId)!;
    for (const p of movePatches(ctx.workouts, w, a.date, today, false)) await api.updateWorkout(p.id, p.patch);
  } else if (a.tool === 'skip_workouts') {
    for (const id of a.workoutIds) {
      const w = byId(ctx.workouts, id);
      if (w && w.status === 'planned' && w.date >= today) await api.updateWorkout(id, { status: 'skipped', status_source: 'user' });
    }
  } else if (a.tool === 'scale_workouts') {
    for (const item of a.items) {
      const w = byId(ctx.workouts, item.workoutId);
      const s = w && w.status === 'planned' && w.date >= today ? scaleWorkout(w, item.factor, plan.fitness.paces) : null;
      if (w && s) await api.updateWorkoutContent(w.id, { steps: s.steps, title: s.title, distance_km: s.distance_km, duration_min: s.duration_min });
    }
  } else if (a.tool === 'edit_workouts') {
    for (const { w, result } of editable(a, ctx)) {
      await api.updateWorkoutContent(w.id, {
        steps: result.steps,
        title: result.title,
        kind: result.kind,
        key_session: result.key_session,
        distance_km: result.distance_km,
        duration_min: result.duration_min,
      });
    }
    if (a.noStridesDays !== undefined) {
      const inputs = { ...plan.inputs, noStridesDays: a.noStridesDays as Weekday[] };
      await api.updatePlanInputs(plan.id, inputs);
      if (ctx.profile?.onboarding) await api.saveProfile(plan.user_id, { onboarding: { ...ctx.profile.onboarding, noStridesDays: a.noStridesDays as Weekday[] } });
    }
  } else {
    const inputs = answersFromChanges(plan.inputs, a.changes);
    const start = replanStart(plan, ctx.activities, today);
    await api.updatePlanInputs(plan.id, inputs);
    if (ctx.profile?.onboarding) await api.saveProfile(plan.user_id, { onboarding: inputs });
    await api.persistAdaptation(
      { ...plan, inputs },
      {
        patches: [],
        replan: { fromDate: start.fromDate, startKm: start.startKm, startLongKm: start.startLongKm },
        fitness: { ...plan.fitness, lastReplanAt: today },
        messages: [{ kind: 'coach', message: `Plan rebuilt from ${start.fromDate} at your coach's suggestion (about ${start.startKm} km/week to start).` }],
      },
    );
    return;
  }
  await api.logAdjustment(plan, 'coach', `Coach: ${a.summary.split('\n')[0]}${a.summary.includes('\n') ? ' …' : ''}`);
}
