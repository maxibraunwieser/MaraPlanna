// Shared domain types. Dates are ISO calendar strings (YYYY-MM-DD) unless noted.

export type Units = 'km' | 'mi';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Approach = 'conservative' | 'balanced' | 'ambitious';
export type StrengthFocus = 'upper' | 'lower' | 'upper_lower' | 'full';
export type Equipment = 'bodyweight' | 'dumbbells' | 'gym';

/** Weekday index: 0 = Monday … 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OnboardingAnswers {
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

  runDaysPerWeek: number;
  availableDays: Weekday[];
  longRunDay: Weekday;
  weekdayMaxMinutes: number | null;

  strength: {
    enabled: boolean;
    focus: StrengthFocus;
    perWeek: number;
    equipment: Equipment;
  };

  age: number | null;
  sex: 'male' | 'female' | 'other' | null;
  maxHr: number | null;
  injuryProne: boolean;
  injuries: string;
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
}

export interface GarminProfile {
  vo2max?: number | null;
  maxHr?: number | null;
  restingHr?: number | null;
  lthr?: number | null;
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
  | { type: 'exercise'; name: string; sets: number; reps: string; note?: string };

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
  | 'strength_full';

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
  predictedMarathonS: number;
  targetMarathonS: number;
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

export interface Profile {
  id: string;
  display_name: string | null;
  units: Units;
  onboarding: OnboardingAnswers | null;
  onboarding_completed_at: string | null;
}
