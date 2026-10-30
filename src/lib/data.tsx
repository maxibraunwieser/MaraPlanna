// Loads the user's data, keeps Garmin in sync and lets the planner adapt.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import * as api from './api';
import { adaptPlan } from './planner/adapt';
import { addDays, todayISO } from './planner/dates';
import type { Activity, DailyMetric, GarminConnection, PlanAdjustment, PlannedWorkout, Profile, TrainingPlan, Units } from './types';
import { useToast } from '../components/ui';

const AUTO_SYNC_MINUTES = 20;

/** Message after the sync removed activities that were deleted in Garmin Connect. */
const removedText = (n: number) => `${n} ${n === 1 ? 'activity' : 'activities'} deleted in Garmin Connect removed here too.`;

export interface DataState {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
  activities: Activity[];
  metrics: DailyMetric[];
  connection: GarminConnection | null;
  adjustments: PlanAdjustment[];
  units: Units;
  syncing: boolean;
  today: string;
  reload: () => Promise<void>;
  syncNow: (full?: boolean) => Promise<void>;
  /** Re-run reconciliation/adaptation (after manual changes). */
  adapt: () => Promise<void>;
}

export const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({
    loading: true,
    error: null as string | null,
    profile: null as Profile | null,
    plan: null as TrainingPlan | null,
    workouts: [] as PlannedWorkout[],
    activities: [] as Activity[],
    metrics: [] as DailyMetric[],
    connection: null as GarminConnection | null,
    adjustments: [] as PlanAdjustment[],
  });
  const [syncing, setSyncing] = useState(false);
  const adapting = useRef(false);
  const autoSynced = useRef(false);
  const today = todayISO();

  const load = useCallback(async () => {
    if (!user) return null;
    const [profile, connection, plan, activities, metrics] = await Promise.all([
      api.fetchProfile(user.id),
      api.fetchConnection(user.id),
      api.fetchActivePlan(user.id),
      api.fetchActivities(user.id, addDays(today, -400)),
      api.fetchMetrics(user.id, addDays(today, -60)),
    ]);
    const [workouts, adjustments] = plan
      ? await Promise.all([api.fetchWorkouts(plan.id), api.fetchAdjustments(plan.id)])
      : [[], []];
    const next = { loading: false, error: null, profile, connection, plan, activities, metrics, workouts, adjustments };
    setState(next);
    return next;
  }, [user, today]);

  const runAdapt = useCallback(
    async (snapshot?: Awaited<ReturnType<typeof load>>) => {
      const s = snapshot ?? (await load());
      if (!s?.plan || adapting.current) return;
      adapting.current = true;
      try {
        const result = adaptPlan({ plan: s.plan, workouts: s.workouts, activities: s.activities, metrics: s.metrics, today });
        if (result.patches.length || result.replan || result.fitness || result.messages.length) {
          await api.persistAdaptation(s.plan, result);
          for (const m of result.messages) toast(m.message, 'info');
          await load();
        }
      } catch (e) {
        toast(`Could not update the plan: ${(e as Error).message}`, 'error');
      } finally {
        adapting.current = false;
      }
    },
    [load, today, toast],
  );

  const syncNow = useCallback(
    async (full = false) => {
      setSyncing(true);
      try {
        const res = await api.invokeGarmin({ action: 'sync', full });
        toast(`Garmin synced: ${res.activities} activities, ${res.days} days of wellness data.`, 'success');
        if (res.removed) toast(removedText(res.removed), 'info');
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setSyncing(false);
      }
      await runAdapt();
    },
    [runAdapt, toast],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await load();
        if (cancelled || !s) return;
        const stale =
          s.connection?.status === 'connected' &&
          (!s.connection.last_sync_at || Date.now() - Date.parse(s.connection.last_sync_at) > AUTO_SYNC_MINUTES * 60_000);
        if (stale && !autoSynced.current) {
          autoSynced.current = true;
          setSyncing(true);
          try {
            const res = await api.invokeGarmin({ action: 'sync' });
            if (res.removed) toast(removedText(res.removed), 'info');
          } catch (e) {
            toast(`Garmin sync: ${(e as Error).message}`, 'error');
          } finally {
            setSyncing(false);
          }
          await runAdapt();
        } else {
          await runAdapt(s);
        }
      } catch (e) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: (e as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const value: DataState = {
    ...state,
    units: state.profile?.units ?? 'km',
    syncing,
    today,
    reload: async () => {
      await load();
    },
    syncNow,
    adapt: () => runAdapt(),
  };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
