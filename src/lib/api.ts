// Database + Edge Function access.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { normalizeAnswers } from './answers';
import { currentLang, tr } from './i18n';
import { serverText } from '../../supabase/functions/_shared/content';
import type {
  Activity,
  ActivityDetails,
  DailyMetric,
  GarminConnection,
  OnboardingAnswers,
  PlanAdjustment,
  PlannedWorkout,
  StrengthSetRow,
  Profile,
  Step,
  TrainingPlan,
  WorkoutKind,
  WeekSummary,
  WorkoutDraft,
} from './types';
import type { AdaptResult, WorkoutPatch } from './planner/adapt';
import { exerciseById, sessionOrder, type Routine, type StrengthPrefs } from '../../supabase/functions/_shared/strength.ts';
import type { StrengthSetInsert } from './strengthLog';
import type { GeneratedPlan } from './planner/generate';
import { isRaceGoal } from './planner/goals';
import { inputsWithStrength, STRENGTH_DB_KINDS } from './planner/keepRuns';
import { generateWeeks } from './planner/generate';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const chunks = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const p = check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()) as Profile | null;
  return p && p.onboarding ? { ...p, onboarding: normalizeAnswers(p.onboarding) } : p;
}

export async function fetchConnection(userId: string): Promise<GarminConnection | null> {
  return check(await supabase.from('garmin_connections').select('*').eq('user_id', userId).maybeSingle()) as GarminConnection | null;
}

export async function fetchActivePlan(userId: string): Promise<TrainingPlan | null> {
  const plan = check(
    await supabase.from('training_plans').select('*').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ) as TrainingPlan | null;
  return plan ? { ...plan, inputs: normalizeAnswers(plan.inputs) } : null;
}

/** Laps + stream for one activity; fetched from Garmin on first use. */
export async function fetchActivityDetails(activity: Activity): Promise<ActivityDetails | null> {
  const { data, error } = await supabase.from('activities').select('details').eq('id', activity.id).maybeSingle();
  if (error) throw new Error(error.message.includes('details') ? tr('api.migration') : error.message);
  if (data?.details) return data.details as ActivityDetails;
  if (activity.source !== 'garmin') return null;
  const res = await invokeGarmin<{ details: ActivityDetails | null }>({ action: 'details', activityId: activity.id });
  return res.details;
}

/** Stored laps + streams of several activities in one query (activities without any are left out). */
export async function fetchStoredDetails(ids: string[]): Promise<Map<string, ActivityDetails>> {
  const out = new Map<string, ActivityDetails>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from('activities').select('id, details').in('id', ids).not('details', 'is', null);
  if (error) throw new Error(error.message.includes('details') ? tr('api.migration') : error.message);
  for (const row of (data ?? []) as { id: string; details: ActivityDetails }[]) out.set(row.id, row.details);
  return out;
}

export async function fetchWorkouts(planId: string): Promise<PlannedWorkout[]> {
  return check(await supabase.from('planned_workouts').select('*').eq('plan_id', planId).order('date').limit(5000)) as PlannedWorkout[];
}

export async function fetchActivities(userId: string, since: string): Promise<Activity[]> {
  return check(
    await supabase
      .from('activities')
      .select(
        'id,user_id,source,external_id,name,sport,sub_type,start_time,local_date,duration_s,moving_s,distance_m,avg_hr,max_hr,elevation_gain_m,calories,training_load,aerobic_te,vo2max',
      )
      .eq('user_id', userId)
      .gte('local_date', since)
      .order('start_time', { ascending: false })
      .limit(3000),
  ) as Activity[];
}

export async function fetchMetrics(userId: string, since: string): Promise<DailyMetric[]> {
  return check(
    await supabase.from('daily_metrics').select('*').eq('user_id', userId).gte('date', since).order('date'),
  ) as DailyMetric[];
}

export async function fetchAdjustments(planId: string): Promise<PlanAdjustment[]> {
  return check(
    await supabase.from('plan_adjustments').select('*').eq('plan_id', planId).order('created_at', { ascending: false }).limit(30),
  ) as PlanAdjustment[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveProfile(userId: string, patch: Partial<Profile>) {
  check(await supabase.from('profiles').upsert({ id: userId, ...patch, updated_at: new Date().toISOString() }));
}

/**
 * The unfinished setup, saved while the person fills it in. Needs the column from
 * supabase/migrations/20261106000000_onboarding_draft.sql; without it this returns false and the browser copy is all there is.
 */
export async function saveOnboardingDraft(userId: string, draft: unknown): Promise<boolean> {
  const { error } = await supabase.from('profiles').upsert({ id: userId, onboarding_draft: draft, updated_at: new Date().toISOString() });
  return !error;
}

export async function saveOnboarding(userId: string, answers: OnboardingAnswers, strength?: StrengthPrefs) {
  await saveProfile(userId, {
    ...(answers.setup?.name.trim() ? { display_name: answers.setup.name.trim() } : {}),
    onboarding: answers,
    onboarding_completed_at: new Date().toISOString(),
    units: answers.units,
    ...(strength ? { strength } : {}),
  });
}

const workoutRows = (drafts: WorkoutDraft[], planId: string, userId: string) =>
  drafts.map((d) => ({ ...d, plan_id: planId, user_id: userId }));

export async function createPlan(userId: string, answers: OnboardingAnswers, generated: GeneratedPlan, startDate: string) {
  check(await supabase.from('training_plans').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'active'));
  const plan = check(
    await supabase
      .from('training_plans')
      .insert({
        user_id: userId,
        race_name: answers.raceName,
        race_date: answers.raceDate,
        start_date: startDate,
        inputs: answers,
        fitness: generated.fitness,
        weeks: generated.weeks,
      })
      .select()
      .single(),
  ) as TrainingPlan;
  for (const batch of chunks(workoutRows(generated.workouts, plan.id, userId), 250)) {
    check(await supabase.from('planned_workouts').insert(batch));
  }
  check(
    await supabase.from('plan_adjustments').insert({
      plan_id: plan.id,
      user_id: userId,
      kind: 'created',
      // Stored in English, translated when shown (supabase/functions/_shared/content.ts).
      message: isRaceGoal(answers.goal) ? `Plan created: ${generated.weeks.length} weeks to ${answers.raceName || 'race day'}.` : `Plan created: ${generated.weeks.length} weeks.`,
    }),
  );
  return plan;
}

/**
 * Strength is added to a running plan that stays as it is: no run is moved, changed or created again (the coach's changes to it
 * are kept). The open strength sessions are replaced by `sessions` (planner/keepRuns.ts places them around the stored runs).
 */
export async function addStrengthToPlan(userId: string, plan: TrainingPlan, answers: OnboardingAnswers, sessions: WorkoutDraft[], today: string) {
  check(await supabase.from('planned_workouts').delete().eq('plan_id', plan.id).eq('status', 'planned').gte('date', today).in('kind', STRENGTH_DB_KINDS));
  for (const batch of chunks(workoutRows(sessions, plan.id, userId), 250)) {
    check(await supabase.from('planned_workouts').insert(batch));
  }
  await updatePlanInputs(plan.id, inputsWithStrength(plan.inputs, answers));
  await logAdjustment(plan, 'strength', `Strength added: ${answers.extras.reduce((n, e) => n + ((STRENGTH_DB_KINDS as string[]).includes(`strength_${e.id}`) ? e.perWeek : 0), 0)} per week. Your running plan stays as it is.`);
  return sessions.length;
}

export async function updateWorkout(id: string, patch: WorkoutPatch) {
  check(await supabase.from('planned_workouts').update(patch).eq('id', id));
}

/** Replace what a session consists of (when the coach shortens or lengthens it). */
export async function updateWorkoutContent(
  id: string,
  patch: { steps: Step[]; title: string; distance_km: number | null; duration_min: number | null; kind?: WorkoutKind; key_session?: boolean },
) {
  check(await supabase.from('planned_workouts').update(patch).eq('id', id));
}

export async function updatePlanInputs(planId: string, inputs: OnboardingAnswers) {
  check(await supabase.from('training_plans').update({ inputs, updated_at: new Date().toISOString() }).eq('id', planId));
}

export async function logAdjustment(plan: TrainingPlan, kind: string, message: string) {
  check(await supabase.from('plan_adjustments').insert({ plan_id: plan.id, user_id: plan.user_id, kind, message }));
}

/** Persist the outcome of adaptPlan(). Returns true if anything changed. */
export async function persistAdaptation(plan: TrainingPlan, result: AdaptResult, routines?: Routine[]): Promise<boolean> {
  const { patches, replan, fitness, messages } = result;
  for (const batch of chunks(patches, 20)) await Promise.all(batch.map((p) => updateWorkout(p.id, p.patch)));

  let weeks: WeekSummary[] | null = null;
  if (replan && fitness) {
    const generated = generateWeeks({
      answers: plan.inputs,
      fitness,
      planStart: plan.weeks[0]?.startDate ?? plan.start_date,
      firstDate: replan.fromDate,
      startKm: replan.startKm,
      startLongKm: replan.startLongKm,
      routines,
    });
    check(
      await supabase.from('planned_workouts').delete().eq('plan_id', plan.id).in('status', ['planned', 'skipped']).gte('date', replan.fromDate),
    );
    for (const batch of chunks(workoutRows(generated.workouts, plan.id, plan.user_id), 250)) {
      check(await supabase.from('planned_workouts').insert(batch));
    }
    const firstWeek = generated.weeks[0]?.week ?? Infinity;
    weeks = [...plan.weeks.filter((w) => w.week < firstWeek), ...generated.weeks];
  }

  if (fitness || weeks) {
    check(
      await supabase
        .from('training_plans')
        .update({ ...(fitness ? { fitness } : {}), ...(weeks ? { weeks } : {}), updated_at: new Date().toISOString() })
        .eq('id', plan.id),
    );
  }
  if (messages.length) {
    check(
      await supabase
        .from('plan_adjustments')
        .insert(messages.map((m) => ({ plan_id: plan.id, user_id: plan.user_id, kind: m.kind, message: m.message }))),
    );
  }
  return patches.length > 0 || !!fitness || !!weeks || messages.length > 0;
}

export type ActivityInsert = Omit<Activity, 'id'> & { raw?: unknown };

export async function insertActivities(rows: ActivityInsert[]) {
  const withId = rows.filter((r) => r.external_id);
  const manual = rows.filter((r) => !r.external_id);
  for (const batch of chunks(withId, 200)) {
    check(await supabase.from('activities').upsert(batch, { onConflict: 'user_id,source,external_id' }));
  }
  const created: Activity[] = [];
  for (const batch of chunks(manual, 200)) {
    created.push(...(check(await supabase.from('activities').insert(batch).select()) as Activity[]));
  }
  return created;
}

export async function deleteActivity(id: string) {
  check(await supabase.from('activities').delete().eq('id', id));
}

export async function deleteActivePlan(userId: string) {
  check(await supabase.from('training_plans').delete().eq('user_id', userId).eq('status', 'active'));
}

// ---------------------------------------------------------------------------
// Calendar subscription (served by the "calendar" Edge Function)
// ---------------------------------------------------------------------------

export interface CalendarFeed {
  user_id: string;
  token: string;
  app_url: string | null;
  created_at: string;
  last_fetched_at: string | null;
}

const calendarError = (message: string) => (/calendar_feeds|schema cache|does not exist/.test(message) ? tr('api.migrationCal') : message);

export async function fetchCalendarFeed(userId: string): Promise<CalendarFeed | null> {
  const { data, error } = await supabase.from('calendar_feeds').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(calendarError(error.message));
  return data as CalendarFeed | null;
}

/** Creates the feed, or replaces its secret token (old subscriptions stop updating). */
export async function createCalendarFeed(userId: string, appUrl: string): Promise<CalendarFeed> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await supabase
    .from('calendar_feeds')
    .upsert({ user_id: userId, token, app_url: appUrl, created_at: new Date().toISOString(), last_fetched_at: null })
    .select()
    .single();
  if (error) throw new Error(calendarError(error.message));
  return data as CalendarFeed;
}

export async function deleteCalendarFeed(userId: string) {
  const { error } = await supabase.from('calendar_feeds').delete().eq('user_id', userId);
  if (error) throw new Error(calendarError(error.message));
}

export const calendarFeedUrl = (token: string, lang: 'en' | 'de' = 'en') => `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/calendar/${token}.ics${lang === 'de' ? '?lang=de' : ''}`;

// ---------------------------------------------------------------------------
// Garmin Edge Function
// ---------------------------------------------------------------------------

export interface SyncResult {
  activities: number;
  /** Activities that were deleted in Garmin Connect and therefore removed here (older function versions omit it). */
  removed?: number;
  days: number;
  warnings: string[];
}

/** Deletes the account of the signed-in person with all their data (the Edge Function removes the account; the tables cascade). */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null);
    throw new Error(serverText(payload?.error ?? tr('api.deleteFailed', { status: error.context.status }), currentLang()));
  }
  throw new Error(error.message.includes('Failed to send') || error.message.includes('fetch') ? tr('api.deleteUnreachable') : error.message);
}

export async function invokeGarmin<T = SyncResult>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('garmin', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(serverText(payload?.error ?? tr('api.garminFailed', { status: error.context.status }), currentLang()));
    }
    throw new Error(
      error.message.includes('Failed to send') || error.message.includes('fetch')
        ? tr('api.garminUnreachable')
        : error.message,
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Garmin watch face (served by the "watch" Edge Function)
// ---------------------------------------------------------------------------

export interface WatchDevice {
  id: string;
  model: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
}

async function invokeWatch<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('watch', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(serverText(payload?.error ?? tr('api.watchFailed', { status: error.context.status }), currentLang()));
    }
    throw new Error(error.message.includes('fetch') ? tr('api.watchUnreachable') : error.message);
  }
  return data as T;
}

export const linkWatch = (code: string) => invokeWatch<{ linked: boolean }>({ action: 'link', code });
export const listWatches = () => invokeWatch<{ devices: WatchDevice[] }>({ action: 'list' });
export const unlinkWatch = (id: string) => invokeWatch<{ unlinked: boolean }>({ action: 'unlink', id });


// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

export async function saveStrengthPrefs(userId: string, prefs: StrengthPrefs) {
  await saveProfile(userId, { strength: prefs });
}

/** All recorded sets since a date (the database returns at most 1000 rows per request, so this pages through them). */
export async function fetchStrengthSets(userId: string, since: string): Promise<StrengthSetRow[]> {
  const out: StrengthSetRow[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const page = check(
      await supabase
        .from('strength_sets')
        .select('*')
        .eq('user_id', userId)
        .gte('local_date', since)
        .order('local_date', { ascending: false })
        .order('session_key', { ascending: false })
        .order('idx')
        .range(from, from + 999),
    ) as StrengthSetRow[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** Save the sets of a workout done on the website; the planned session (if any) counts as completed. */
export async function logStrengthSession(userId: string, rows: StrengthSetInsert[], workoutId: string | null) {
  if (!rows.length) return;
  check(await supabase.from('strength_sets').upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,session_key,idx' }));
  if (workoutId) await updateWorkout(workoutId, { status: 'completed', status_source: 'user' });
}

export async function deleteStrengthSession(userId: string, sessionKey: string) {
  check(await supabase.from('strength_sets').delete().eq('user_id', userId).eq('session_key', sessionKey));
}

/** New exercises (and a new duration) for sessions that have not happened yet. */
export async function updateWorkoutSteps(id: string, steps: Step[], durationMin: number | null) {
  check(await supabase.from('planned_workouts').update({ steps, duration_min: durationMin }).eq('id', id));
}

/** A short strength session for today in the active plan, built from the user's exercises, so the watch has something to run. */
export async function createTestStrengthWorkout(userId: string, plan: TrainingPlan, workouts: PlannedWorkout[], date: string, exerciseIds: string[]) {
  const picked = sessionOrder(exerciseIds).slice(0, 5).flatMap((id) => {
    const e = exerciseById(id);
    return e ? [e] : [];
  });
  if (!picked.length) throw new Error(tr('api.pickExercise'));
  // Week and phase of the plan at that date (the closest session on or before it, else the first one).
  const ref = [...workouts].filter((w) => w.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? workouts[0];
  if (!ref) throw new Error(tr('api.noSessions'));
  check(await supabase.from('planned_workouts').delete().eq('plan_id', plan.id).eq('date', date).like('title', 'Strength test%'));
  const steps: Step[] = picked.map((e) => ({ type: 'exercise', id: e.id, name: e.en, sets: e.sets, reps: String(e.reps) }));
  check(
    await supabase.from('planned_workouts').insert({
      plan_id: plan.id,
      user_id: userId,
      date,
      week: ref.week,
      phase: ref.phase,
      kind: 'strength_full',
      title: 'Strength test',
      steps,
      distance_km: null,
      duration_min: 30,
      key_session: false,
      status: 'planned',
    }),
  );
}
