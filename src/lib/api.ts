// Database + Edge Function access.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { normalizeAnswers } from './answers';
import type {
  Activity,
  ActivityDetails,
  DailyMetric,
  GarminConnection,
  OnboardingAnswers,
  PlanAdjustment,
  PlannedWorkout,
  Profile,
  TrainingPlan,
  WeekSummary,
  WorkoutDraft,
} from './types';
import type { AdaptResult, WorkoutPatch } from './planner/adapt';
import type { GeneratedPlan } from './planner/generate';
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
  if (error) throw new Error(error.message.includes('details') ? 'Database update needed – run the latest migration (see README).' : error.message);
  if (data?.details) return data.details as ActivityDetails;
  if (activity.source !== 'garmin') return null;
  const res = await invokeGarmin<{ details: ActivityDetails | null }>({ action: 'details', activityId: activity.id });
  return res.details;
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

export async function saveOnboarding(userId: string, answers: OnboardingAnswers) {
  await saveProfile(userId, { onboarding: answers, onboarding_completed_at: new Date().toISOString(), units: answers.units });
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
      message: `Plan created: ${generated.weeks.length} weeks to ${answers.raceName || 'race day'}.`,
    }),
  );
  return plan;
}

export async function updateWorkout(id: string, patch: WorkoutPatch) {
  check(await supabase.from('planned_workouts').update(patch).eq('id', id));
}

export async function logAdjustment(plan: TrainingPlan, kind: string, message: string) {
  check(await supabase.from('plan_adjustments').insert({ plan_id: plan.id, user_id: plan.user_id, kind, message }));
}

/** Persist the outcome of adaptPlan(). Returns true if anything changed. */
export async function persistAdaptation(plan: TrainingPlan, result: AdaptResult): Promise<boolean> {
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

const CALENDAR_MIGRATION = 'Database update needed: run supabase/migrations/20261029000000_calendar_feeds.sql in the Supabase SQL Editor.';
const calendarError = (message: string) => (/calendar_feeds|schema cache|does not exist/.test(message) ? CALENDAR_MIGRATION : message);

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

export const calendarFeedUrl = (token: string) => `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/calendar/${token}.ics`;

// ---------------------------------------------------------------------------
// Garmin Edge Function
// ---------------------------------------------------------------------------

export interface SyncResult {
  activities: number;
  days: number;
  warnings: string[];
}

export async function invokeGarmin<T = SyncResult>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('garmin', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? `Garmin sync failed (${error.context.status})`);
    }
    throw new Error(
      error.message.includes('Failed to send') || error.message.includes('fetch')
        ? 'Could not reach the MaraPlanna Garmin function. Is it deployed?'
        : error.message,
    );
  }
  return data as T;
}
