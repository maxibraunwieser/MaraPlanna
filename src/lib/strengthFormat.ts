// Weight and prescription texts for the strength screens. Weights are stored in kg and shown in the person's unit.

import { toKg, toUnit } from '../../supabase/functions/_shared/strength';
import { exerciseName, repsText } from '../../supabase/functions/_shared/content';
import type { RoutineExercise } from '../../supabase/functions/_shared/strength';
import type { Step } from './types';
import { catalogEntry, customExercise } from './strengthPlan';
import { fmtNum } from './format';
import { currentLang, tr } from './i18n';

export type WeightUnit = 'kg' | 'lb';

const trim = (n: number) => fmtNum(n, 2);

/** Name of an exercise in the language of the page (names the person typed stay as they are). */
export const exName = (name: string): string => exerciseName(name, currentLang());

/** "10 / side" -> "10 / Seite". */
export const repsLabel = (reps: string): string => repsText(reps, currentLang());

/** "62.5 kg" / "135 lb"; empty without a weight. */
export const weightText = (kg: number | null | undefined, unit: WeightUnit): string => (kg && kg > 0 ? `${trim(toUnit(kg, unit))} ${unit}` : '');

/** Value for a weight input in the person's unit ("" without a weight). */
export const weightInput = (kg: number | null | undefined, unit: WeightUnit): string => (kg && kg > 0 ? trim(toUnit(kg, unit)) : '');

/** What a weight input holds, in kg (null for empty or invalid text). */
export function parseWeight(text: string, unit: WeightUnit): number | null {
  const v = Number(text.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? toKg(v, unit) : null;
}

/** "4 × 5 · 80 kg" */
export const rxText = (x: { sets: number; reps: string; kg?: number | null }, unit: WeightUnit): string =>
  `${x.sets} × ${repsLabel(x.reps)}${x.kg && x.kg > 0 ? ` · ${weightText(x.kg, unit)}` : ''}`;

/** Exercises of a planned session as an editable workout. */
export function stepsToExercises(steps: Step[]): RoutineExercise[] {
  return steps.flatMap((s): RoutineExercise[] => {
    if (s.type !== 'exercise') return [];
    const hit = customExercise(s.name);
    return [{ key: hit.key, name: s.name, ...(s.id ? { id: s.id } : hit.id ? { id: hit.id } : {}), sets: s.sets, reps: s.reps, kg: s.kg ?? null }];
  });
}

/** The most common reason for a failing save: the database update was not run yet. */
export const hintFor = (message: string) => (/strength|schema cache|column|does not exist/i.test(message) ? tr('st.dbHint') : message);

/** Where an exercise belongs, for grouping and labels. */
export const patternOf = (x: Pick<RoutineExercise, 'key'>) => catalogEntry(x.key)?.pattern ?? null;
