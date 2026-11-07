// What every step of the setup gets from the wizard.

import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import type { FieldErrors } from '../../lib/onboarding/validate';
import type { Model } from '../../lib/onboarding/apply';
import type { ScreenId } from '../../lib/onboarding/screens';
import type { OnboardingAnswers, SetupExtras, Units } from '../../lib/types';
import type { SetupStep } from '../../lib/onboarding/draft';

export interface StepApi {
  a: OnboardingAnswers;
  setup: SetupExtras;
  strength: StrengthPrefs;
  units: Units;
  today: string;
  /** Change the answers (the wizard re-derives age, heart rate and so on afterwards). */
  update: (fn: (a: OnboardingAnswers) => OnboardingAnswers) => void;
  updateSetup: (patch: Partial<SetupExtras>) => void;
  updateStrength: (patch: Partial<StrengthPrefs>) => void;
  /** Change both parts at once (an answer that also changes the strength settings or the plan's fields). */
  updateAll: (fn: (m: Model) => Model) => void;
  errors: FieldErrors;
  /** Translated error of a field, once the person has been at it (or tried to continue). */
  error: (field: string) => string | null;
  touch: (field: string) => void;
  goTo: (step: SetupStep) => void;
  /** Continue to the next step (after the current one passed its checks). */
  next: () => void;
  /** Skip the current (optional) step: records "manual" for the Garmin step and moves on without further checks. */
  skip: () => void;
  step: ScreenId;
}
