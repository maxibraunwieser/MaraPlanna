// The answers as the plan engine and the database take them: derived fields filled in, the week consistent, missing workouts
// suggested. The preview and "Start plan" both go through here, so what the person sees is what gets saved.

import { normalizePrefs, type StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import { applyAutoWeek } from '../planner/week';
import { deriveEquipment, setupOf, suggestRoutine, type StrengthType } from '../strengthPlan';
import type { OnboardingAnswers } from '../types';
import { applyPersonal, applyRaces } from './derive';
import { strengthPlanOf, syncStrength } from './apply';
import { isStrengthExtra } from './strengthMap';

export function finalize(input: OnboardingAnswers, strength: StrengthPrefs, today: string, now: string = new Date().toISOString()): { answers: OnboardingAnswers; prefs: StrengthPrefs | undefined } {
  let a = applyPersonal(input, today);
  if (a.setup!.racesDone.length) a = applyRaces(a);
  // Without a count from the strength screens, the share of running and the free days decide.
  const perWeek = strength.perWeek ?? (a.setup!.runPct >= 100 ? 0 : strengthPlanOf(a).count);
  if (!(a.scheduleMode === 'custom' && a.customWeek)) a = applyAutoWeek(a, perWeek);

  // Strength: every workout of the week exists (a missing or empty one gets the suggestion); the planner's equipment class follows the gear.
  const kinds = [...new Set(a.extras.filter(isStrengthExtra).map((e) => e.id as StrengthType))];
  let prefs: StrengthPrefs | undefined;
  if (kinds.length) {
    const base = syncStrength(normalizePrefs(strength), a.setup!);
    const filled = kinds.map((k) => {
      const mine = base.routines.find((r) => r.id === k);
      return mine && mine.exercises.length ? mine : suggestRoutine(k, setupOf(base), now);
    });
    prefs = { ...base, routines: [...base.routines.filter((r) => !kinds.includes(r.id as StrengthType)), ...filled], savedAt: now };
  }
  return {
    answers: normalizeAnswers({
      ...a,
      runDaysPerWeek: Math.min(a.runDaysPerWeek, a.availableDays.length),
      goalTimeS: a.goalType === 'time' ? a.goalTimeS : null,
      equipment: prefs ? deriveEquipment(prefs) : a.equipment,
    }),
    prefs,
  };
}
