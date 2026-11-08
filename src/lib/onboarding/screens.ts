// The questionnaire is a list of screens, one question or a small group of them each, in ten blocks. Which screens a person sees
// depends on their answers (no race, no race questions; no strength share, no strength block). The wizard walks this list.

import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { isRaceGoal } from '../planner/goals';
import type { OnboardingAnswers } from '../types';

export type BlockId = 'welcome' | 'personal' | 'everyday' | 'health' | 'goal' | 'garmin' | 'prefs' | 'running' | 'strength' | 'plan';

export type ScreenId =
  | 'consent'
  | 'name' | 'gender' | 'body'
  | 'lifestyle' | 'dayMinutes' | 'breaks'
  | 'injuryNow' | 'injuryRegions' | 'injuryPast' | 'parq' | 'pregnancy'
  | 'goal' | 'weighting' | 'race' | 'raceDetails' | 'raceTime' | 'strengthGoals' | 'planLength'
  | 'hasGarmin' | 'garminConnect' | 'garminReview'
  | 'motivation' | 'adapt'
  | 'runExperience' | 'runVolume' | 'runReference' | 'runHeart' | 'runDays' | 'runPlan'
  | 'strExperience' | 'strWhere' | 'strEquipment' | 'strFrequency' | 'double' | 'strWrist' | 'strengthPlan';

/** A screen of the questionnaire or the final overview. */
export type SetupStep = ScreenId | 'preview';

export interface ScreenDef {
  id: ScreenId;
  block: BlockId;
  /** Nothing is required: the person can skip it. */
  optional?: boolean;
}

/** The order of the blocks: everything about the person first, then the running plan, then the strength plan next to it. */
export const BLOCKS: BlockId[] = ['welcome', 'personal', 'everyday', 'health', 'goal', 'garmin', 'prefs', 'running', 'strength', 'plan'];

export const SCREENS: ScreenDef[] = [
  { id: 'consent', block: 'welcome' },
  { id: 'name', block: 'personal' },
  { id: 'gender', block: 'personal' },
  { id: 'body', block: 'personal' },
  { id: 'lifestyle', block: 'everyday', optional: true },
  { id: 'dayMinutes', block: 'everyday' },
  { id: 'breaks', block: 'everyday', optional: true },
  { id: 'injuryNow', block: 'health' },
  { id: 'injuryRegions', block: 'health' },
  { id: 'injuryPast', block: 'health', optional: true },
  { id: 'parq', block: 'health' },
  { id: 'pregnancy', block: 'health', optional: true },
  { id: 'goal', block: 'goal' },
  { id: 'weighting', block: 'goal' },
  { id: 'race', block: 'goal', optional: true },
  { id: 'raceDetails', block: 'goal' },
  { id: 'raceTime', block: 'goal', optional: true },
  { id: 'strengthGoals', block: 'goal', optional: true },
  { id: 'planLength', block: 'goal' },
  { id: 'hasGarmin', block: 'garmin' },
  { id: 'garminConnect', block: 'garmin' },
  { id: 'garminReview', block: 'garmin' },
  { id: 'motivation', block: 'prefs', optional: true },
  { id: 'adapt', block: 'prefs', optional: true },
  { id: 'runExperience', block: 'running' },
  { id: 'runVolume', block: 'running' },
  { id: 'runReference', block: 'running', optional: true },
  { id: 'runHeart', block: 'running', optional: true },
  { id: 'runDays', block: 'running' },
  { id: 'runPlan', block: 'running' },
  { id: 'strExperience', block: 'strength' },
  { id: 'strWhere', block: 'strength' },
  { id: 'strEquipment', block: 'strength' },
  { id: 'strFrequency', block: 'strength' },
  { id: 'double', block: 'strength', optional: true },
  { id: 'strWrist', block: 'strength' },
  { id: 'strengthPlan', block: 'strength' },
];

export interface Ctx {
  a: OnboardingAnswers;
  strength: StrengthPrefs;
  /** A running plan exists and stays as it is (strength is added later): the questions about the running are not asked. */
  keepRuns?: boolean;
}

const RUN_SCREENS: ScreenId[] = ['race', 'raceDetails', 'raceTime', 'planLength', 'runExperience', 'runVolume', 'runReference', 'runHeart', 'runDays', 'runPlan'];

/** A race with a date: the plan runs until race day and no plan length is asked. */
export const hasRaceDate = (a: OnboardingAnswers): boolean => !!a.setup?.hasRace && !!a.goal && isRaceGoal(a.goal) && !a.planWeeks;

const runs = (c: Ctx) => (c.a.setup?.runPct ?? 50) > 0;
const lifts = (c: Ctx) => (c.a.setup?.runPct ?? 50) < 100;

const VISIBLE: Partial<Record<ScreenId, (c: Ctx) => boolean>> = {
  race: runs,
  raceDetails: (c) => runs(c) && c.a.setup?.hasRace === true,
  raceTime: (c) => runs(c) && c.a.setup?.hasRace === true,
  strengthGoals: lifts,
  planLength: (c) => !(runs(c) && c.a.setup?.hasRace === true),
  garminConnect: (c) => c.a.setup?.hasGarmin === true,
  garminReview: (c) => c.a.setup?.hasGarmin === true && c.a.setup?.garmin === 'connected',
  strExperience: lifts,
  strWhere: lifts,
  strEquipment: lifts,
  strFrequency: lifts,
  double: lifts,
  strWrist: (c) => lifts(c) && c.a.setup?.hasGarmin === true,
  strengthPlan: lifts,
  injuryRegions: (c) => c.a.setup?.injuriesNow === true,
  pregnancy: (c) => c.a.setup?.gender !== 'male',
};

export const isVisible = (id: ScreenId, c: Ctx): boolean => !(c.keepRuns && RUN_SCREENS.includes(id)) && (VISIBLE[id]?.(c) ?? true);

/** The screens this person sees, in order. */
export const visibleScreens = (c: Ctx): ScreenDef[] => SCREENS.filter((s) => isVisible(s.id, c));

export const screenDef = (id: ScreenId): ScreenDef => SCREENS.find((s) => s.id === id)!;

/** The screen after `id` (the overview after the last one), whatever the answers say about `id` itself. */
export function nextScreen(id: ScreenId, c: Ctx): SetupStep {
  const i = SCREENS.findIndex((s) => s.id === id);
  for (let j = i + 1; j < SCREENS.length; j++) if (isVisible(SCREENS[j].id, c)) return SCREENS[j].id;
  return 'preview';
}

/** The screen before `step` (null on the first). */
export function prevScreen(step: SetupStep, c: Ctx): ScreenId | null {
  const i = step === 'preview' ? SCREENS.length : SCREENS.findIndex((s) => s.id === step);
  for (let j = i - 1; j >= 0; j--) if (isVisible(SCREENS[j].id, c)) return SCREENS[j].id;
  return null;
}

/** First visible screen of a block (null when the block has none for this person). */
export const firstOfBlock = (block: BlockId, c: Ctx): ScreenId | null => visibleScreens(c).find((s) => s.block === block)?.id ?? null;

/** Blocks with at least one visible screen. */
export const visibleBlocks = (c: Ctx): BlockId[] => BLOCKS.filter((b) => firstOfBlock(b, c) !== null);

/** Position of a screen inside its block: [1-based index, count]. */
export function positionInBlock(id: ScreenId, c: Ctx): [number, number] {
  const def = screenDef(id);
  const list = visibleScreens(c).filter((s) => s.block === def.block);
  return [Math.max(1, list.findIndex((s) => s.id === id) + 1), list.length];
}

/** Share of the visible screens before this one (0–1), for the progress bar. */
export function progressOf(step: SetupStep, c: Ctx): number {
  const list = visibleScreens(c);
  if (step === 'preview') return 1;
  const i = list.findIndex((s) => s.id === step);
  return i < 0 ? 0 : i / list.length;
}
