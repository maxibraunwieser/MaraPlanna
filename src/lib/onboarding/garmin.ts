// What Garmin can tell the setup, and how it fills the answers without overwriting what the person typed.

import { daysBetween, todayISO } from '../planner/dates';
import type { Activity, DailyMetric, GarminConnection, GarminScope, OnboardingAnswers } from '../types';

export type GarminField = 'restingHr' | 'maxHr' | 'weightKg' | 'weeklyKm' | 'runsNow' | 'longest' | 'vo2max';

export interface GarminImport {
  values: Partial<Record<GarminField, number>>;
  /** Fields Garmin had no value for; the setup asks for those by hand. */
  missing: GarminField[];
  syncedAt: string | null;
  /** Runs of the last 4 weeks that the numbers rest on. */
  runCount: number;
}

const ALL: GarminField[] = ['restingHr', 'maxHr', 'weightKg', 'weeklyKm', 'runsNow', 'longest', 'vo2max'];
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Reads the values the setup uses out of what the Garmin sync stored. Nothing is guessed: a value without data stays missing. */
export function readGarmin(input: { connection: GarminConnection | null; activities: Activity[]; metrics: DailyMetric[]; today?: string; scopes?: GarminScope[] }): GarminImport {
  const { connection } = input;
  // Only what the person allowed is read (no list = everything).
  const allow = (scope: GarminScope) => !input.scopes || input.scopes.includes(scope);
  const activities = allow('activities') ? input.activities : [];
  const metrics = allow('heart') ? input.metrics : [];
  const today = input.today ?? todayISO();
  const values: GarminImport['values'] = {};
  if (!connection || connection.status !== 'connected') return { values, missing: [...ALL], syncedAt: null, runCount: 0 };
  const profile = connection.profile ?? {};

  // Resting heart rate: the average of the last 7 days (at least three readings), else Garmin's own value.
  const rest = metrics.filter((m) => m.resting_hr && daysBetween(m.date, today) >= 0 && daysBetween(m.date, today) < 7).map((m) => m.resting_hr!);
  if (rest.length >= 3) values.restingHr = Math.round(avg(rest));
  else if (profile.restingHr && allow('heart')) values.restingHr = profile.restingHr;

  // Maximum heart rate: only the one set in Garmin. The highest rate of a few easy runs says little about the real maximum,
  // so without Garmin's value the setup estimates it from age (and says so).
  if (profile.maxHr && allow('heart')) values.maxHr = profile.maxHr;

  if (profile.weightKg && allow('weight')) values.weightKg = Math.round(profile.weightKg * 10) / 10;
  if (profile.vo2max && allow('status')) values.vo2max = Math.round(profile.vo2max * 10) / 10;

  // Running: the last 4 weeks (needs a few runs to mean anything).
  const runs = activities.filter((a) => a.sport === 'run' && (a.distance_m ?? 0) > 1000);
  const last28 = runs.filter((a) => daysBetween(a.local_date, today) >= 0 && daysBetween(a.local_date, today) < 28);
  if (last28.length >= 3) {
    values.weeklyKm = Math.round(last28.reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0) / 4);
    values.runsNow = Math.min(7, Math.round((last28.length / 4) * 10) / 10 >= 6.5 ? 7 : Math.round(last28.length / 4));
    values.longest = Math.round(Math.max(...last28.map((a) => (a.distance_m ?? 0) / 1000)) * 10) / 10;
  }
  return { values, missing: ALL.filter((f) => values[f] === undefined), syncedAt: connection.last_sync_at, runCount: last28.length };
}

/** Puts the Garmin values into the answers, except where the person already typed something. Returns the new answers. */
export function applyGarmin(a: OnboardingAnswers, imp: GarminImport): OnboardingAnswers {
  const s = a.setup!;
  const from = new Set(s.fromGarmin);
  const next: OnboardingAnswers = { ...a, setup: { ...s, hrSource: { ...s.hrSource } } };
  const manual = (field: GarminField) => !from.has(field) && isSet(a, field);
  const v = imp.values;
  const put = (field: GarminField, apply: (n: number) => void) => {
    if (v[field] === undefined || manual(field)) return;
    apply(v[field]!);
    from.add(field);
  };
  put('restingHr', (n) => {
    next.setup!.restingHr = n;
    next.setup!.hrSource.rest = 'garmin';
  });
  put('maxHr', (n) => {
    next.maxHr = n;
    next.setup!.hrSource.max = 'garmin';
  });
  put('weightKg', (n) => {
    next.setup!.weightKg = n;
  });
  put('weeklyKm', (n) => {
    next.currentWeeklyKm = n;
  });
  put('runsNow', (n) => {
    next.setup!.runsNow = n;
  });
  put('longest', (n) => {
    next.longestRecentRunKm = n;
  });
  put('vo2max', (n) => {
    next.setup!.vo2max = n;
  });
  next.setup!.fromGarmin = [...from];
  next.setup!.hrSyncedAt = imp.syncedAt;
  next.setup!.garmin = 'connected';
  return next;
}

/** Has the person entered a value for this field themselves (so a sync must not replace it)? */
function isSet(a: OnboardingAnswers, f: GarminField): boolean {
  const s = a.setup!;
  switch (f) {
    case 'restingHr': return s.restingHr !== null && s.hrSource.rest === 'manual';
    case 'maxHr': return a.maxHr !== null && s.hrSource.max === 'manual';
    case 'weightKg': return s.weightKg !== null;
    // The running numbers start with defaults; they only count as typed once the person edited them (tracked by source).
    case 'weeklyKm': case 'runsNow': case 'longest': return false;
    case 'vo2max': return s.vo2max !== null;
  }
}

