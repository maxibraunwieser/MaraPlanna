// Shared domain types. Dates are ISO calendar strings (YYYY-MM-DD) unless noted.

import type { StrengthPrefs } from '../../supabase/functions/_shared/strength.ts';
import type { GoalKind } from './planner/goals';

export type Units = 'km' | 'mi';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Approach = 'conservative' | 'balanced' | 'ambitious';
export type StrengthFocus = 'upper' | 'lower' | 'upper_lower' | 'full';
export type Equipment = 'bodyweight' | 'dumbbells' | 'gym';

/** Non-running sessions the user can add (multi-select). */
export type ExtraType = 'upper' | 'lower' | 'full' | 'core' | 'mobility' | 'plyo' | 'bike' | 'swim' | 'custom';

export interface ExtraSession {
  id: string;
  type: ExtraType;
  perWeek: number;
  /** custom sessions only */
  name?: string;
  hard?: boolean;
  minutes?: number;
}

export type RunSlot = 'rest' | 'easy' | 'quality' | 'long' | 'recovery';

/** One weekday of a user-defined week: the run type plus extra-session ids. */
export interface DayTemplate {
  run: RunSlot;
  extras: string[];
}

/** Weekday index: 0 = Monday … 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Where a value of the setup came from, so a later Garmin sync never overwrites something the person typed. */
export type Source = 'garmin' | 'manual' | 'estimated';
export type InjuryArea = 'knee' | 'achilles' | 'shin' | 'hip' | 'back' | 'shoulder' | 'wrist' | 'foot' | 'other';
export type RaceKey = '5k' | '10k' | 'half' | 'marathon';
export type Intensity = 'easy' | 'mixed' | 'structured';
export type Surface = 'road' | 'trail' | 'treadmill' | 'track';
export type TimeOfDay = 'morning' | 'noon' | 'evening';
export type SecondaryGoal = 'strength' | 'weight' | 'injury';

// The questionnaire (catalog of the hybrid app): the answers that are only stored or only steer the setup.
export type PrimaryGoal = 'running' | 'strength' | 'hybrid' | 'lose' | 'fitness';
export type DailyActivity = 'sitting' | 'mixed' | 'standing' | 'heavy';
export type SleepBand = 'lt6' | 'h6to7' | 'h7to8' | 'gt8';
export type StrengthGoalKind = 'maxStrength' | 'muscle' | 'prevention' | 'composition' | 'functional';
export type GarminScope = 'activities' | 'heart' | 'sleep' | 'weight' | 'status';
export type RunStarted = 'never' | 'lt6m' | 'm6to12' | 'y1to3' | 'gt3y';
export type IntervalXp = 'never' | 'rare' | 'regular';
export type StrengthXp = 'none' | 'lt6m' | 'm6to24' | 'gt2y';
export type TrainLocation = 'gym' | 'homeGym' | 'bodyweight' | 'outdoor';
export type LiftKey = 'squat' | 'deadlift' | 'bench' | 'press' | 'row';
export type SkillKey = 'squat' | 'deadlift' | 'lunge' | 'pushup' | 'pullup';
export type SkillLevel = 'unsure' | 'ok' | 'sure';
export type TrainStyleChoice = 'full' | 'split' | 'upperlower' | 'any';
export type LiftControl = 'kg' | 'rpe' | 'feel';
export type DoubleOrder = 'run' | 'strength' | 'any';
export type ParqKey = 'heart' | 'dizzy' | 'chest' | 'meds';
export type Pregnancy = 'yes' | 'no' | 'none';
export type Motivation = 'health' | 'performance' | 'looks' | 'fun' | 'competition' | 'routine';
export type Structure = 'strict' | 'flexible';

/** Answers of the setup that the plan engine does not read directly but the setup, the preview and the profile do. */
export interface SetupExtras {
  name: string;
  /** What the person picked; `sex` of the answers follows from it (diverse -> other, no answer -> null). */
  gender: 'male' | 'female' | 'diverse' | 'none' | null;
  /** Runs per week the person asked for (the week step compares the drawn week with it). */
  runsWanted: number | null;
  /** How long the person has been running; maps to the level the plan engine uses. */
  experience: 'new' | 'some' | 'long' | null;
  /** YYYY-MM-DD; age (for the heart-rate estimate) is derived from it. */
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** How height and body weight are shown and typed (stored in cm and kg either way); the distance unit is `units`. */
  heightUnit: 'm' | 'ft';
  weightUnit: 'kg' | 'lb';
  injuryAreas: InjuryArea[];
  restingHr: number | null;
  /** Source of the resting and the maximum heart rate. */
  hrSource: { rest: Source | null; max: Source | null };
  /** When the Garmin values were read. */
  hrSyncedAt: string | null;
  racesDone: { distance: RaceKey; pbS: number | null }[];
  /** Comfortable pace in s/km; null = "I don't know". */
  easyPaceS: number | null;
  intensity: Intensity;
  surface: Surface | null;
  /** Runs per week right now (the plan's frequency is `runDaysPerWeek`). */
  runsNow: number;
  secondaryGoal: SecondaryGoal | null;
  /** Days the person cannot train at all (automatic week). */
  unavailableDays: Weekday[];
  preferredTime: TimeOfDay | null;
  garmin: 'connected' | 'manual' | null;
  /** Names of the values that were filled from Garmin (badge in the setup). */
  fromGarmin: string[];

  // ---- Consent and body
  consent: { health: boolean; analytics: boolean; at: string | null };
  bodyFatPct: number | null;
  dailyActivity: DailyActivity | null;
  sleep: SleepBand | null;

  // ---- Goal and focus
  primary: PrimaryGoal | null;
  /** Share of running in the training, 0–100 (the rest is strength). */
  runPct: number;
  hasRace: boolean | null;
  /** The target time is not known: the plan estimates it from the performance data. */
  timeUnknown: boolean;
  strengthGoals: StrengthGoalKind[];
  strengthNote: string;

  // ---- Garmin
  hasGarmin: boolean | null;
  garminModel: string;
  garminScopes: GarminScope[];
  garminPush: boolean;

  // ---- Running
  runStarted: RunStarted | null;
  peakKm: number | null;
  vo2max: number | null;
  surfaces: Surface[];
  intervals: IntervalXp | null;
  /** The reference result (4.6); `refNone` = "I have none". */
  refRace: { distance: RaceKey; timeS: number | null; date: string | null } | null;
  refNone: boolean;

  // ---- Strength
  strengthXp: StrengthXp | null;
  locations: TrainLocation[];
  /** Strength sessions per week right now. */
  strengthNow: number | null;
  /** Strength sessions per week the person chose in the plan (null = the planner's recommendation). */
  strengthWanted: number | null;
  /** Strength added to a running plan that exists: keep that plan as it is (true), change it (false), not answered yet (null). */
  keepRunPlan?: boolean | null;
  /** Strength added to a running plan that is kept: the week of that plan with the strength days, as the person moved them. */
  keptWeek?: DayTemplate[] | null;
  lifts: Partial<Record<LiftKey, { kg: number | null; reps: number | null }>>;
  skills: Partial<Record<SkillKey, SkillLevel>>;
  /** Catalogue keys the person does not want / likes, picked from the list, and what they wrote besides. */
  excluded: string[];
  excludedNote: string;
  favorites: string[];
  favoritesNote: string;
  trainStyle: TrainStyleChoice | null;
  liftControl: LiftControl | null;

  // ---- Time
  totalSessions: number | null;
  /** The days the person can train (6.1). */
  daysAvail: Weekday[];
  /** Minutes per weekday, index 0 = Monday: 0 = no time that day, null = not answered (any length), 120 = 120 or more. */
  minutesPerDay: (number | null)[];
  /** Days that have to stay free (6.6). */
  restDays: Weekday[];
  /** "Any day" for the long run (the planner picks). */
  longRunAny: boolean;
  /** The days the person likes to run on (empty = the planner picks among the days with time). */
  runDays: Weekday[];
  /** "auto": the planner picks the run days from the time the person has on each weekday; "manual": the person picks them. */
  runDaysMode: 'auto' | 'manual';
  doubles: boolean | null;
  doubleOrder: DoubleOrder | null;
  breaks: { from: string; to: string }[];

  // ---- Health
  injuriesNow: boolean | null;
  /** Severity (0–10) and since when, per area of `injuryAreas`. */
  injuryDetail: Partial<Record<InjuryArea, { severity: number; since: string }>>;
  injuriesPast: InjuryArea[];
  injuriesPastNote: string;
  parq: Partial<Record<ParqKey, boolean>>;
  pregnancy: Pregnancy | null;

  // ---- Preferences
  motivation: Motivation[];
  structure: Structure | null;
  autoAdapt: boolean;
  notifications: { reminder: boolean; review: boolean; time: string };
}

export interface OnboardingAnswers {
  /** Setup answers beyond what the engine reads; always present after normalizeAnswers. */
  setup?: SetupExtras;
  /** What the plan is for (see planner/goals.ts); missing in answers saved before goals existed = marathon. */
  goal?: GoalKind;
  /** Race or time-trial distance in metres when the goal has one; missing = marathon (or none for plans without a race). */
  raceDistanceM?: number | null;
  /** Plan length in weeks when the person has no date; the end date is derived from it. */
  planWeeks?: number | null;
  raceName: string;
  raceDate: string;
  goalType: 'finish' | 'time';
  goalTimeS: number | null;
  raceTerrain: 'flat' | 'rolling' | 'hilly';

  level: Level;
  yearsRunning: number;
  marathonsCompleted: number;
  recentRace: { distanceM: number; timeS: number; date: string | null } | null;

  currentWeeklyKm: number;
  longestRecentRunKm: number;

  /** 'auto': the planner picks days; 'custom': the user fixed what happens on each day. */
  scheduleMode: 'auto' | 'custom';
  /** 7 entries (Mon–Sun) when scheduleMode is 'custom'. */
  customWeek: DayTemplate[] | null;
  runDaysPerWeek: number;
  availableDays: Weekday[];
  longRunDay: Weekday;
  weekdayMaxMinutes: number | null;

  extras: ExtraSession[];
  equipment: Equipment;

  age: number | null;
  sex: 'male' | 'female' | 'other' | null;
  maxHr: number | null;
  injuryProne: boolean;
  injuries: string;
  /** Weekdays whose easy runs get no strides (set through the coach). */
  noStridesDays?: Weekday[];
  approach: Approach;
  units: Units;
}

export type Sport = 'run' | 'strength' | 'bike' | 'swim' | 'walk' | 'mobility' | 'other';

export interface Activity {
  id: string;
  user_id: string;
  source: 'garmin' | 'fit' | 'manual';
  external_id: string | null;
  name: string | null;
  sport: Sport;
  sub_type: string | null;
  start_time: string;
  local_date: string;
  duration_s: number | null;
  moving_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  calories: number | null;
  training_load: number | null;
  aerobic_te: number | null;
  vo2max: number | null;
  details?: ActivityDetails | null;
}

/** Lap + downsampled stream data from the original FIT file. */
export interface ActivityLap {
  startS: number;
  durationS: number;
  distanceM: number;
  avgSpeed: number | null;
  avgHr: number | null;
  maxHr: number | null;
  cadence: number | null;
  intensity: string | null;
}

export interface ActivitySample {
  /** seconds since start */
  t: number;
  /** metres since start */
  d: number;
  hr: number | null;
  /** m/s */
  v: number | null;
  alt: number | null;
}

export interface ActivityDetails {
  laps: ActivityLap[];
  samples: ActivitySample[];
}

export interface DailyMetric {
  date: string;
  resting_hr: number | null;
  hrv_last_night: number | null;
  hrv_weekly_avg: number | null;
  hrv_status: string | null;
  sleep_s: number | null;
  sleep_score: number | null;
  stress_avg: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  steps: number | null;
  /** Garmin's own Training Readiness (0-100) when the watch reports it; otherwise the app computes one. */
  training_readiness?: number | null;
}

export interface GarminProfile {
  vo2max?: number | null;
  maxHr?: number | null;
  restingHr?: number | null;
  lthr?: number | null;
  /** Lower bounds (bpm) of the five heart-rate zones as set in Garmin Connect, when Garmin returns them. */
  zones?: number[] | null;
  weightKg?: number | null;
  /** Garmin's race predictions in seconds. */
  racePredictions?: Partial<Record<RaceKey, number>> | null;
}

export interface GarminConnection {
  user_id: string;
  status: 'connected' | 'error' | 'expired';
  display_name: string | null;
  profile: GarminProfile | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  connected_at: string;
}

export type PaceZone = 'recovery' | 'easy' | 'long' | 'marathon' | 'threshold' | 'interval' | 'repetition';

/** Pace in seconds per km. Ranges are [fast, slow]. */
export interface Paces {
  recovery: [number, number];
  easy: [number, number];
  long: [number, number];
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
}

export type Step =
  | {
      type: 'run';
      label: string;
      zone: PaceZone;
      distanceKm?: number;
      durationMin?: number;
      repeat?: number;
      recoveryKm?: number;
      recoveryMin?: number;
    }
  | { type: 'exercise'; name: string; sets: number; reps: string; note?: string; /** library id (supabase/functions/_shared/strength.ts) */ id?: string; /** catalogue key (supabase/functions/_shared/exerciseCatalog.ts): which exercise it is, for the watch's figure */ key?: string; /** target weight in kg (from the user's workout) */ kg?: number; /** rest between sets in seconds (only when the person set it) */ restS?: number };

export type WorkoutKind =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'long_mp'
  | 'threshold'
  | 'intervals'
  | 'marathon_pace'
  | 'fartlek'
  | 'shakeout'
  | 'race'
  | 'strength_upper'
  | 'strength_lower'
  | 'strength_full'
  | 'core'
  | 'mobility'
  | 'plyo'
  | 'bike'
  | 'swim'
  | 'custom';

export type Phase = 'base' | 'build' | 'peak' | 'taper';

export type WorkoutStatus = 'planned' | 'completed' | 'partial' | 'missed' | 'skipped';

/** A workout as produced by the generator (not yet persisted). */
export interface WorkoutDraft {
  date: string;
  week: number;
  phase: Phase;
  kind: WorkoutKind;
  title: string;
  steps: Step[];
  distance_km: number | null;
  duration_min: number | null;
  key_session: boolean;
}

export interface PlannedWorkout extends WorkoutDraft {
  id: string;
  plan_id: string;
  user_id: string;
  status: WorkoutStatus;
  status_source: 'auto' | 'user';
  activity_id: string | null;
  actual_distance_km: number | null;
  original_date: string | null;
  note: string | null;
}

export interface WeekSummary {
  week: number;
  startDate: string;
  phase: Phase;
  targetKm: number;
  longKm: number;
  recovery: boolean;
}

export interface FitnessAssessment {
  vdot: number;
  vdotSource: string;
  weeklyKm: number;
  weeklyKmSource: 'garmin' | 'answers';
  longestRunKm: number;
  runsPerWeek: number;
  restingHr: number | null;
  maxHr: number | null;
  runsAnalysed: number;
}

export interface PlanFitness {
  vdot: number;
  vdotSource: string;
  paces: Paces;
  /** Predicted and target time for the plan's distance (the marathon unless `raceDistanceM` says otherwise); names kept for saved plans. */
  predictedMarathonS: number;
  targetMarathonS: number;
  /** Distance of the race the times above are for; missing = marathon; null = the plan has no race. */
  raceDistanceM?: number | null;
  goalAssessment: 'none' | 'realistic' | 'ambitious' | 'very_ambitious';
  startWeeklyKm: number;
  peakWeeklyKm: number;
  peakLongKm: number;
  lastReplanAt: string | null;
  history: { date: string; vdot: number; reason: string }[];
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  status: 'active' | 'archived';
  race_name: string | null;
  race_date: string;
  start_date: string;
  inputs: OnboardingAnswers;
  fitness: PlanFitness;
  weeks: WeekSummary[];
  created_at: string;
  updated_at: string;
}

export interface PlanAdjustment {
  id: string;
  plan_id: string;
  kind: string;
  message: string;
  created_at: string;
}

/** One set recorded by the watch (table strength_sets). */
export interface StrengthSetRow {
  id: string;
  session_key: string;
  idx: number;
  workout_id: string | null;
  local_date: string;
  started_at: string;
  duration_s: number | null;
  exercise_id: string | null;
  exercise_name: string | null;
  reps: number;
  weight_kg: number | null;
  source: 'plan' | 'pick' | 'auto';
  confidence: number | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  units: Units;
  onboarding: OnboardingAnswers | null;
  onboarding_completed_at: string | null;
  /** Strength settings from the Strength page (see StrengthPrefs); null until saved. */
  strength?: StrengthPrefs | null;
  /** The unfinished setup (see lib/onboarding/draft.ts); needs supabase/migrations/20261106000000_onboarding_draft.sql. */
  onboarding_draft?: unknown;
}
