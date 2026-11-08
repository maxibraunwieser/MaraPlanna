import type { Routine, StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import type { StrengthSetInsert } from '../../lib/strengthLog';
import type { WeightUnit } from '../../lib/strengthFormat';
import type { SetRow } from '../../lib/strengthStats';
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
}

export const isGymSession = (w: Pick<PlannedWorkout, 'kind'>) => w.kind === 'strength_lower' || w.kind === 'strength_upper' || w.kind === 'strength_full' || w.kind === 'strength_cali' || w.kind === 'core';
