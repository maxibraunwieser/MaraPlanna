// Turns a workout done on the website into rows of strength_sets (the same table the watch fills).

import { exerciseById } from '../../supabase/functions/_shared/strength';

export interface LoggedSet {
  reps: number;
  /** Weight in kg; null for bodyweight. */
  kg: number | null;
}

export interface LoggedExercise {
  name: string;
  /** Library id when the watch knows the exercise. */
  id?: string;
  /** True when the exercise is the one the plan had; false when the person picked another. */
  planned: boolean;
  sets: LoggedSet[];
}

export interface StrengthSetInsert {
  session_key: string;
  idx: number;
  workout_id: string | null;
  local_date: string;
  started_at: string;
  duration_s: number | null;
  exercise_id: string | null;
  exercise_name: string;
  reps: number;
  weight_kg: number | null;
  source: 'plan' | 'pick';
  confidence: null;
  wrist: null;
  diag: null;
}

/**
 * One row per finished set (sets with no repetitions are left out). The session key is the start time in seconds like the
 * watch uses, so saving the same workout twice changes nothing. Both the library id and the name are stored: the id lets
 * the watch know the exercise, the name keeps "Back squat" apart from "Goblet squat" in the progress charts.
 */
export function toSetRows(input: { workoutId: string | null; date: string; startedAt: Date; exercises: LoggedExercise[] }): StrengthSetInsert[] {
  const key = String(Math.floor(input.startedAt.getTime() / 1000));
  const rows: StrengthSetInsert[] = [];
  for (const ex of input.exercises) {
    for (const s of ex.sets) {
      if (!(s.reps > 0)) continue;
      const idx = rows.length;
      rows.push({
        session_key: key,
        idx,
        workout_id: input.workoutId,
        local_date: input.date,
        started_at: new Date(input.startedAt.getTime() + idx * 90_000).toISOString(),
        duration_s: null,
        exercise_id: ex.id && exerciseById(ex.id) ? ex.id : null,
        exercise_name: ex.name.trim().slice(0, 60),
        reps: Math.min(999, Math.round(s.reps)),
        weight_kg: s.kg && s.kg > 0 ? Math.round(s.kg * 100) / 100 : null,
        source: ex.planned ? 'plan' : 'pick',
        confidence: null,
        wrist: null,
        diag: null,
      });
    }
  }
  return rows;
}
