// Which component draws which screen of the questionnaire.

import type { ComponentType } from 'react';
import type { ScreenId } from '../../lib/onboarding/screens';
import type { StepApi } from './api';
import { GarminConnectScreen, GarminReviewScreen, HasGarminScreen } from './GarminScreens';
import { GoalScreen, PlanLengthScreen, RaceDetailsScreen, RaceScreen, RaceTimeScreen, StrengthGoalsScreen, WeightingScreen } from './GoalScreens';
import { AdaptScreen, InjuryNowScreen, InjuryPastScreen, InjuryRegionsScreen, MotivationScreen, ParqScreen, PrefsScreen, PregnancyScreen } from './HealthScreens';
import { BodyScreen, ConsentScreen, GenderScreen, LifestyleScreen, NameScreen } from './PersonalScreens';
import { RunDaysScreen, RunExperienceScreen, RunHeartScreen, RunReferenceScreen, RunVolumeScreen } from './RunScreens';
import { StrEquipmentScreen, StrExperienceScreen, StrFrequencyScreen, StrWhereScreen, StrWristScreen } from './StrengthScreens';
import { BreaksScreen, DayMinutesScreen, DoubleScreen } from './TimeScreens';
import { RunPlanScreen, StrengthPlanScreen } from './PlanScreens';

export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType<{ s: StepApi }>> = {
  consent: ConsentScreen,
  name: NameScreen,
  gender: GenderScreen,
  body: BodyScreen,
  lifestyle: LifestyleScreen,
  goal: GoalScreen,
  weighting: WeightingScreen,
  race: RaceScreen,
  raceDetails: RaceDetailsScreen,
  raceTime: RaceTimeScreen,
  strengthGoals: StrengthGoalsScreen,
  planLength: PlanLengthScreen,
  hasGarmin: HasGarminScreen,
  garminConnect: GarminConnectScreen,
  garminReview: GarminReviewScreen,
  runExperience: RunExperienceScreen,
  runVolume: RunVolumeScreen,
  runReference: RunReferenceScreen,
  runHeart: RunHeartScreen,
  strExperience: StrExperienceScreen,
  strWhere: StrWhereScreen,
  strEquipment: StrEquipmentScreen,
  strFrequency: StrFrequencyScreen,
  strWrist: StrWristScreen,
  dayMinutes: DayMinutesScreen,
  double: DoubleScreen,
  breaks: BreaksScreen,
  injuryNow: InjuryNowScreen,
  injuryRegions: InjuryRegionsScreen,
  injuryPast: InjuryPastScreen,
  parq: ParqScreen,
  pregnancy: PregnancyScreen,
  motivation: MotivationScreen,
  adapt: AdaptScreen,
  prefs: PrefsScreen,
  runDays: RunDaysScreen,
  runPlan: RunPlanScreen,
  strengthPlan: StrengthPlanScreen,
};
