// Which exercises a person can do with what they train with: the same rule on the website (lists, editor, plan) and in the
// Edge Function (the exercise lists of the watch). No imports of app code (types only).

import type { CatalogExercise } from './exerciseCatalog.ts';
import type { Gear, Limitation, TrainStyle } from './strength.ts';

export interface AvailSetup {
  equipment: TrainStyle | null;
  gear: Gear[];
  avoid: Limitation[];
  excluded?: string[];
}

export function hasGear(gear: Gear[], need: Gear): boolean {
  return need === 'machines' ? gear.includes('machines') || gear.includes('cable') : gear.includes(need);
}

/** Can the person do it with what they have, how they train and without aggravating a limitation? */
export function available(x: CatalogExercise, setup: AvailSetup): boolean {
  if (setup.excluded?.includes(x.key)) return false;
  if (x.avoid.some((l) => setup.avoid.includes(l))) return false;
  if (!x.needs.every((g) => hasGear(setup.gear, g))) return false;
  // one of several is enough (a barbell or a Smith machine), or none when the exercise works without gear
  if (x.anyOf?.length && !x.bodyOk && !x.anyOf.some((g) => hasGear(setup.gear, g))) return false;
  const style = setup.equipment ?? 'mixed';
  if (style === 'bodyweight') return x.style === 'body' || (x.style === 'free' && x.needs.every((g) => g === 'bands'));
  if (style === 'free') return x.style !== 'machine';
  if (style === 'machines') return x.style !== 'free' || x.needs.every((g) => g === 'bands');
  return true;
}
