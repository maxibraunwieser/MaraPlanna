import type { Routine, StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import type { StrengthSetInsert } from '../../lib/strengthLog';
import type { WeightUnit } from '../../lib/strengthFormat';
import type { SetRow } from '../../lib/strengthStats';
import type { MoveScope } from '../../lib/strengthSchedule';
import type { PlannedWorkout, TrainingPlan } from '../../lib/types';

/** Everything the tabs of the Strength page share. */
export interface StrengthCtx {
  userId: string;
  prefs: StrengthPrefs;
  unit: WeightUnit;
  /** All recorded sets of the last year (watch and website). */
  rows: SetRow[];
  loaded: boolean;
  setsError: string | null;
  plan: TrainingPlan | null;
  workouts: PlannedWorkout[];
  today: string;
  /** Saves the setup; with `applyToPlan` the sessions that have not happened yet get the new workouts. Returns how many changed. */
  savePrefs: (next: StrengthPrefs, applyToPlan?: boolean) => Promise<number>;
  /** New exercises for one planned session. */
  saveSession: (w: PlannedWorkout, r: Routine) => Promise<void>;
  logSets: (rows: StrengthSetInsert[], workoutId: string | null) => Promise<void>;
  deleteSession: (sessionKey: string) => Promise<void>;
  /** The last day of the plan (null without a plan). */
  planEnd: string | null;
  /** A workout leaves the list and its planned sessions from today leave the plan (a planner kind also leaves the plan's inputs). */
  deleteRoutine: (id: string) => Promise<void>;
  /** A workout of the person's own, new or changed: saved, and its sessions from today follow its schedule. Returns how many are planned. */
  saveOwnRoutine: (r: Routine) => Promise<number>;
  /** A planned session on another date: only this one, or this one and every later one of its series. Returns how many moved. */
  moveSession: (w: PlannedWorkout, date: string, scope: MoveScope) => Promise<number>;
}

export const isGymSession = (w: Pick<PlannedWorkout, 'kind' | 'routine_id'>) =>
  w.kind === 'strength_lower' || w.kind === 'strength_upper' || w.kind === 'strength_full' || w.kind === 'strength_cali' || w.kind === 'core' || !!w.routine_id;
