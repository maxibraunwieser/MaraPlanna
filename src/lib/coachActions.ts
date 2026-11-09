// Turning the coach's confirmed proposals into changes of the plan. Uses the same tested planner
// functions as the rest of the app (moving, rebuilding weeks), so a coach change behaves exactly
// like one made by hand.

import type { CoachAction, PlanChanges } from '../../supabase/functions/_shared/coachTools.ts';
import { coachLine } from '../../supabase/functions/_shared/content';
import { currentLang, tr, type MsgKey } from './i18n';
import { localTitle } from './format';
import * as api from './api';
import { normalizeAnswers } from './answers';
import { normalizePrefs } from '../../supabase/functions/_shared/strength.ts';
import type { Activity, OnboardingAnswers, PlannedWorkout, Profile, TrainingPlan, Weekday } from './types';
import { addDays, daysBetween, mondayOf, weekdayOf } from './planner/dates';
import { canMove, inBounds, moveBounds, movePatches } from './planner/move';
import { scaleWorkout } from './planner/scale';
import { editWorkout, type WorkoutEdit } from './planner/edit';
import { customExercise } from './strengthPlan';
import { deleteRoutine, newOwnId, saveOwnRoutine } from './strengthActions';

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
      if (!w) return tr('ca.gone');
      if (!canMove(w)) return tr('ca.cantMove', { title: localTitle(w.title), status: tr(`ca.status.${w.status}` as MsgKey) });
      if (!inBounds(a.date, moveBounds(ctx.today, ctx.plan.race_date))) return tr('ca.dayGone');
      return null;
    }
    case 'skip_workouts': {
      const open = a.workoutIds.map((id) => byId(ctx.workouts, id)).filter((w) => w && w.status === 'planned' && w.date >= ctx.today);
      return open.length ? null : tr('ca.skipGone');
    }
    case 'delete_workouts': {
      const left = a.workoutIds.map((id) => byId(ctx.workouts, id)).filter((w) => w && w.status !== 'completed' && w.status !== 'partial');
      return left.length ? null : tr('ca.gone');
    }
    case 'scale_workouts': {
      const open = a.items.filter((i) => {
        const w = byId(ctx.workouts, i.workoutId);
        return w && w.status === 'planned' && w.date >= ctx.today && scaleWorkout(w, i.factor, ctx.plan.fitness.paces);
      });
      return open.length ? null : tr('ca.scaleGone');
    }
    case 'edit_workouts':
      // Only remembering "no strides" needs no open session.
      return a.edits.length === 0 || editable(a, ctx).length ? null : tr('ca.editGone');
    case 'change_plan':
      return replanStart(ctx.plan, ctx.activities, ctx.today).tooLate ? tr('ca.tooLate') : null;
    case 'delete_routine':
      return normalizePrefs(ctx.profile?.strength).routines.some((r) => r.id === a.routineId) ? null : tr('ca.gone');
    case 'add_routine':
      return a.schedule.mode === 'once' && a.schedule.date < ctx.today ? tr('ca.dayGone') : null;
  }
}

/** The lines shown on the confirmation card: what will really happen, not what the coach estimated. */
export function previewAction(a: CoachAction, ctx: ActionContext): string[] {
  if (a.tool === 'edit_workouts') {
    const rows = editable(a, ctx);
    const shown = rows.slice(0, 6).map(({ w, result }) => {
      const now = result.title !== w.title ? tr('ca.now', { title: localTitle(result.title) }) : '';
      return tr('ca.line', { title: localTitle(w.title), date: w.date, a: w.distance_km ?? '?', b: result.distance_km ?? '?', now });
    });
    const more = rows.length > 6 ? [tr('ca.more', { n: rows.length - 6 })] : [];
    const remember = a.summary.split('\n').filter((l) => /^(From now on|Easy runs may)/.test(l)).map((l) => coachLine(l, currentLang()));
    return [...shown, ...more, ...remember];
  }
  if (a.tool !== 'scale_workouts') return a.summary.split('\n').map((l) => coachLine(l, currentLang()));
  return a.items.map((i) => {
    const w = byId(ctx.workouts, i.workoutId);
    if (!w) return tr('ca.oneGone');
    const s = scaleWorkout(w, i.factor, ctx.plan.fitness.paces);
    if (!s) return tr('ca.noChange', { title: localTitle(w.title) });
    return tr('ca.line', { title: localTitle(w.title), date: w.date, a: w.distance_km ?? '?', b: s.distance_km ?? '?', now: s.title !== w.title ? tr('ca.now', { title: localTitle(s.title) }) : '' });
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
  } else if (a.tool === 'delete_workouts') {
    const ids = a.workoutIds.filter((id) => {
      const w = byId(ctx.workouts, id);
      return w && w.kind !== 'race' && w.status !== 'completed' && w.status !== 'partial';
    });
    await api.deleteWorkouts(ids);
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
  } else if (a.tool === 'delete_routine') {
    await deleteRoutine({ userId: plan.user_id, plan, profile: ctx.profile, prefs: normalizePrefs(ctx.profile?.strength), id: a.routineId, today });
  } else if (a.tool === 'add_routine') {
    // The exercises are matched to the catalogue by name (so the watch can count them and show their figures).
    const exercises = a.exercises.map((x) => ({ ...customExercise(x.name), sets: x.sets, reps: x.reps, kg: x.kg ?? null }));
    const routine = { id: newOwnId(), name: a.name, exercises, by: 'own' as const, updatedAt: null, schedule: a.schedule };
    await saveOwnRoutine({ userId: plan.user_id, plan, workouts: ctx.workouts, prefs: normalizePrefs(ctx.profile?.strength), routine, today });
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
      normalizePrefs(ctx.profile?.strength).routines,
    );
    return;
  }
  await api.logAdjustment(plan, 'coach', `Coach: ${a.summary.split('\n')[0]}${a.summary.includes('\n') ? ' …' : ''}`);
}
