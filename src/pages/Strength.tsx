import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Dumbbell, History, Sparkles, TrendingUp } from 'lucide-react';
import { isOwnRoutine, normalizePrefs, type Routine, type StrengthPrefs } from '../../supabase/functions/_shared/strength';
import { useAuth } from '../lib/auth';
import { useI18n, type MsgKey } from '../lib/i18n';
import { useData } from '../lib/data';
import { addDays, weekdayOf } from '../lib/planner/dates';
import { deleteRoutineSessions, deleteStrengthSession, fetchStrengthSets, insertOwnSessions, logStrengthSession, moveWorkouts, saveProfile, saveStrengthPrefs, updatePlanInputs, updateWorkoutSteps } from '../lib/api';
import { movePatches, movedDays, ownSessions, planEnd, routineIdOf, weekdaysOf, type MoveScope } from '../lib/strengthSchedule';
import { deriveEquipment, routineMinutes, routinePatches, routineSteps } from '../lib/strengthPlan';
import type { StrengthSetInsert } from '../lib/strengthLog';
import type { PlannedWorkout, StrengthSetRow } from '../lib/types';
import { hintFor } from '../lib/strengthFormat';
import { Button, Card, Notice, PageHeader } from '../components/ui';
import type { StrengthCtx } from '../components/strength/context';
import { WorkoutsTab } from '../components/strength/WorkoutsTab';
import { ProgressTab } from '../components/strength/ProgressTab';
import { HistoryTab } from '../components/strength/HistoryTab';

const TABS = [
  { id: 'workouts', label: 'sg.tab.workouts', icon: Dumbbell },
  { id: 'progress', label: 'sg.tab.progress', icon: TrendingUp },
  { id: 'history', label: 'sg.tab.history', icon: History },
] as const satisfies readonly { id: string; label: MsgKey; icon: unknown }[];
type TabId = (typeof TABS)[number]['id'];

export function Strength() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { profile, plan, workouts, today, reload } = useData();
  const [params] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'workouts') as TabId;
  const prefs = useMemo(() => normalizePrefs(profile?.strength), [profile?.strength]);
  const [sets, setSets] = useState<StrengthSetRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    if (!user) return;
    try {
      setSets(await fetchStrengthSets(user.id, addDays(today, -400)));
      setSetsError(null);
    } catch (e) {
      setSetsError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [user, today]);
  useEffect(() => void loadSets(), [loadSets]);

  const end = plan ? planEnd(plan, workouts) : null;
  const savePrefsOnly = (next: StrengthPrefs) => saveStrengthPrefs(user!.id, { ...next, savedAt: next.savedAt ?? new Date().toISOString() });

  const ctx: StrengthCtx = {
    userId: user!.id,
    prefs,
    unit: prefs.weightUnit,
    rows: sets,
    loaded,
    setsError: setsError ? hintFor(setsError) : null,
    plan,
    workouts,
    today,
    savePrefs: async (next: StrengthPrefs, applyToPlan = false) => {
      await saveStrengthPrefs(user!.id, { ...next, savedAt: next.savedAt ?? new Date().toISOString() });
      let changed = 0;
      if (applyToPlan && plan) {
        const patches = routinePatches(workouts, next.routines, plan.weeks, today);
        for (const p of patches) await updateWorkoutSteps(p.id, p.steps, p.duration_min);
        changed = patches.length;
        // The plan's other sessions (core, plyometrics) follow the equipment the person has.
        const equipment = deriveEquipment(next);
        if (plan.inputs.equipment !== equipment) {
          await updatePlanInputs(plan.id, { ...plan.inputs, equipment });
          if (profile?.onboarding) await saveProfile(user!.id, { onboarding: { ...profile.onboarding, equipment } });
        }
      }
      await reload();
      return changed;
    },
    saveSession: async (w: PlannedWorkout, r: Routine) => {
      await updateWorkoutSteps(w.id, routineSteps(r), routineMinutes(r));
      await reload();
    },
    logSets: async (rows: StrengthSetInsert[], workoutId: string | null) => {
      await logStrengthSession(user!.id, rows, workoutId);
      await Promise.all([loadSets(), workoutId ? reload() : Promise.resolve()]);
    },
    deleteSession: async (key: string) => {
      await deleteStrengthSession(user!.id, key);
      await loadSets();
    },
    planEnd: end,
    deleteRoutine: async (id: string) => {
      if (plan) await deleteRoutineSessions(plan.id, id, today);
      let perWeek = prefs.perWeek;
      if (!isOwnRoutine(id)) {
        // A planner kind: the plan (and the saved answers) no longer schedule it, so a rebuilt plan does not bring it back.
        const removed = plan?.inputs.extras.find((e) => e.id === id)?.perWeek ?? 0;
        if (plan) await updatePlanInputs(plan.id, { ...plan.inputs, extras: plan.inputs.extras.filter((e) => e.id !== id) });
        if (profile?.onboarding) await saveProfile(user!.id, { onboarding: { ...profile.onboarding, extras: profile.onboarding.extras.filter((e) => e.id !== id) } });
        perWeek = perWeek === null ? null : Math.max(0, perWeek - removed);
      }
      await savePrefsOnly({ ...prefs, perWeek, routines: prefs.routines.filter((r) => r.id !== id) });
      await reload();
    },
    saveOwnRoutine: async (r: Routine) => {
      const routine = { ...r, by: 'own' as const, updatedAt: new Date().toISOString() };
      const routines = prefs.routines.some((x) => x.id === r.id) ? prefs.routines.map((x) => (x.id === r.id ? routine : x)) : [...prefs.routines, routine];
      await savePrefsOnly({ ...prefs, routines });
      let planned = 0;
      if (plan) {
        // The sessions from today on follow the (new) schedule and exercises; done ones stay as they were.
        await deleteRoutineSessions(plan.id, r.id, today);
        const left = workouts.filter((w) => !(routineIdOf(w) === r.id && w.status === 'planned' && w.date >= today));
        const drafts = ownSessions(routine, plan, left, today);
        await insertOwnSessions(plan, drafts);
        planned = drafts.length;
      }
      await reload();
      return planned;
    },
    moveSession: async (w: PlannedWorkout, date: string, scope: MoveScope) => {
      if (!plan || !end) return 0;
      const patches = movePatches(workouts, w, date, scope, end);
      await moveWorkouts(patches);
      const id = routineIdOf(w);
      const from = weekdayOf(w.date);
      const to = weekdayOf(date);
      const own = id ? prefs.routines.find((r) => r.id === id && isOwnRoutine(r.id)) : undefined;
      if (own?.schedule) {
        // The workout's schedule follows: a single date moves, a series keeps its new weekday.
        const schedule = own.schedule.mode === 'once' ? { ...own.schedule, date } : scope === 'series' ? { ...own.schedule, days: movedDays(own.schedule.days, from, to) } : own.schedule;
        if (schedule !== own.schedule) await savePrefsOnly({ ...prefs, routines: prefs.routines.map((r) => (r.id === own.id ? { ...r, schedule } : r)) });
      } else if (id && scope === 'series') {
        // A planner kind: the plan keeps the new weekday when it is rebuilt.
        const days = movedDays(weekdaysOf(workouts, id, today), from, to);
        await updatePlanInputs(plan.id, { ...plan.inputs, setup: { ...plan.inputs.setup!, strengthDays: { ...(plan.inputs.setup?.strengthDays ?? {}), [id]: days } } });
      }
      await reload();
      return patches.length;
    },
  };

  const setupDone = !!prefs.savedAt && prefs.routines.some((r) => r.exercises.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={t('sg.title')} />


      {ctx.setsError && <Notice tone="warn">{ctx.setsError}</Notice>}

      {!setupDone && tab === 'workouts' && (
        <Card className="border-l-4 border-brand">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[14rem] flex-1">
              <h2 className="text-base font-semibold text-slate-900">{t('sg.setup.title')}</h2>
              <p className="mt-0.5 text-sm text-slate-600">{t('sg.setup.text')}</p>
            </div>
            <Link to={ctx.plan ? '/onboarding?edit=1&add=strength' : '/onboarding?edit=1'}><Button icon={<Sparkles className="h-4 w-4" />}>{t('sg.setup.start')}</Button></Link>
          </div>
        </Card>
      )}
      {tab === 'workouts' && setupDone && <WorkoutsTab ctx={ctx} />}
      {tab === 'progress' && <ProgressTab ctx={ctx} />}
      {tab === 'history' && <HistoryTab ctx={ctx} />}
    </div>
  );
}
