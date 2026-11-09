// Deleting a workout and saving a workout of the person's own, with everything that follows in the plan. The Strength page and
// the coach's confirmed proposals both use these, so a change made either way does the same.

import { isOwnRoutine, type Routine, type StrengthPrefs } from '../../supabase/functions/_shared/strength';
import { deleteRoutineSessions, insertOwnSessions, saveProfile, saveStrengthPrefs, updatePlanInputs } from './api';
import { ownSessions, routineIdOf } from './strengthSchedule';
import type { PlannedWorkout, Profile, TrainingPlan } from './types';

const savePrefs = (userId: string, next: StrengthPrefs) => saveStrengthPrefs(userId, { ...next, savedAt: next.savedAt ?? new Date().toISOString() });

/** A new id for a workout of the person's own. */
export const newOwnId = (): string => `own-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A workout leaves the list and its planned sessions from today leave the plan (done ones and logged sets stay). A planner kind
 * (lower, upper …) also leaves the plan's inputs and the saved answers, so a rebuilt plan does not bring it back.
 */
export async function deleteRoutine(o: { userId: string; plan: TrainingPlan | null; profile: Profile | null; prefs: StrengthPrefs; id: string; today: string }) {
  const { userId, plan, profile, prefs, id, today } = o;
  if (plan) await deleteRoutineSessions(plan.id, id, today);
  let perWeek = prefs.perWeek;
  if (!isOwnRoutine(id)) {
    const removed = plan?.inputs.extras.find((e) => e.id === id)?.perWeek ?? 0;
    if (plan) await updatePlanInputs(plan.id, { ...plan.inputs, extras: plan.inputs.extras.filter((e) => e.id !== id) });
    if (profile?.onboarding) await saveProfile(userId, { onboarding: { ...profile.onboarding, extras: profile.onboarding.extras.filter((e) => e.id !== id) } });
    perWeek = perWeek === null ? null : Math.max(0, perWeek - removed);
  }
  await savePrefs(userId, { ...prefs, perWeek, routines: prefs.routines.filter((r) => r.id !== id) });
}

/** A workout of the person's own, new or changed: saved, and its sessions from today follow its schedule. Returns how many are planned. */
export async function saveOwnRoutine(o: { userId: string; plan: TrainingPlan | null; workouts: PlannedWorkout[]; prefs: StrengthPrefs; routine: Routine; today: string }): Promise<number> {
  const { userId, plan, workouts, prefs, today } = o;
  const routine: Routine = { ...o.routine, by: 'own', updatedAt: new Date().toISOString() };
  const routines = prefs.routines.some((x) => x.id === routine.id) ? prefs.routines.map((x) => (x.id === routine.id ? routine : x)) : [...prefs.routines, routine];
  await savePrefs(userId, { ...prefs, routines });
  if (!plan) return 0;
  // The sessions from today on follow the (new) schedule and exercises; done ones stay as they were.
  await deleteRoutineSessions(plan.id, routine.id, today);
  const left = workouts.filter((w) => !(routineIdOf(w) === routine.id && w.status === 'planned' && w.date >= today));
  const drafts = ownSessions(routine, plan, left, today);
  await insertOwnSessions(plan, drafts);
  return drafts.length;
}
