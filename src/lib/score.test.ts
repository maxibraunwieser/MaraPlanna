import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, ActivityDetails, ActivitySample, PlannedWorkout, TrainingPlan } from './types';
import { analyze } from './analysis';
import { weekReport } from './report';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { mondayOf } from './planner/dates';
import { normalizeAnswers } from './answers';

const stored = new Map<string, ActivityDetails>();
const fetchStoredDetails = vi.fn(async (ids: string[]) => new Map([...stored].filter(([id]) => ids.includes(id))));
const fetchActivityDetails = vi.fn(async (_a: Activity): Promise<ActivityDetails | null> => ({ laps: [], samples: [] }));
vi.mock('./api', () => ({
  fetchStoredDetails: (ids: string[]) => fetchStoredDetails(ids),
  fetchActivityDetails: (a: Activity) => fetchActivityDetails(a),
}));
const { loadDetails, detailsFor } = await import('./details');

const START = '2026-10-26';
const answers = normalizeAnswers({
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: START }), START);
const plan: TrainingPlan = {
  id: 'p', user_id: 'u', status: 'active', race_name: 'Vienna', race_date: answers.raceDate, start_date: START, inputs: answers,
  fitness: gen.fitness, weeks: gen.weeks, created_at: START, updated_at: START,
};
const P = plan.fitness.paces;

/** The reported case: a quality session whose work reps were ~7 % slower than target. */
function slowRepsSession() {
  const draft = gen.workouts.find((w) => w.kind === 'threshold' || w.kind === 'intervals')!;
  const main = draft.steps.find((s) => s.type === 'run' && s.repeat && s.repeat > 1) as Extract<(typeof draft.steps)[number], { type: 'run' }>;
  const target = main.zone === 'threshold' ? P.threshold : P.interval;
  const samples: ActivitySample[] = [];
  let t = 0;
  let d = 0;
  const seg = (sec: number, pace: number, hr: number) => {
    for (let i = 0; i < sec; i += 10) {
      samples.push({ t, d, hr, v: 1000 / pace, alt: 100 });
      t += 10;
      d += (10 * 1000) / pace;
    }
  };
  seg(720, P.easy[1], 132);
  for (let r = 0; r < main.repeat!; r++) {
    seg(main.durationMin ? main.durationMin * 60 : (main.distanceKm ?? 1) * target * 1.07, target * 1.07, 168);
    if (r < main.repeat! - 1) seg(main.recoveryMin ? main.recoveryMin * 60 : 120, P.recovery[1], 140);
  }
  seg(540, P.easy[1], 136);
  const activity: Activity = {
    id: 'a1', user_id: 'u', source: 'garmin', external_id: '1', name: 'Run', sport: 'run', sub_type: 'running', start_time: `${draft.date}T07:00:00Z`,
    local_date: draft.date, duration_s: t, moving_s: t, distance_m: d, avg_hr: 155, max_hr: 175, elevation_gain_m: 0, calories: 0, training_load: 0, aerobic_te: 0, vo2max: null,
  };
  const workout: PlannedWorkout = {
    ...draft, id: 'w1', plan_id: 'p', user_id: 'u', status: 'completed', status_source: 'auto', activity_id: 'a1', actual_distance_km: d / 1000, original_date: null, note: null,
  };
  return { activity, workout, details: { laps: [], samples } as ActivityDetails };
}

describe('execution score is the same everywhere', () => {
  const { activity, workout, details } = slowRepsSession();
  const full = analyze({ workout, activity, details, plan, activities: [activity], metrics: [], maxHr: 190 });
  const averagesOnly = analyze({ workout, activity, details: null, plan, activities: [activity], metrics: [], maxHr: 190 });

  it('without lap data a quality session looks much better than it was (the reported bug)', () => {
    expect(full.reps?.length).toBeGreaterThan(0);
    expect(full.score!).toBeLessThan(averagesOnly.score! - 10);
  });

  it('the weekly report scores the run exactly like the full analysis', () => {
    const r = weekReport({
      plan, workouts: [workout], activities: [activity], metrics: [], weekStart: mondayOf(activity.local_date), today: '2026-12-31',
      maxHr: 190, units: 'km', detailsOf: (a) => (a.id === activity.id ? details : null),
    });
    expect(r.items.find((i) => i.activity?.id === 'a1')?.score).toBe(full.score);
    expect(r.avgScore).toBe(full.score);
  });
});

describe('shared lap-data cache', () => {
  const run = (id: string, over: Partial<Activity> = {}): Activity => ({ ...slowRepsSession().activity, id, ...over });
  beforeEach(() => {
    fetchStoredDetails.mockClear();
    fetchActivityDetails.mockClear();
  });

  it('uses stored data, downloads missing Garmin runs once and remembers everything', async () => {
    const { details } = slowRepsSession();
    stored.set('s1', details);
    const list = [run('s1'), run('g1'), run('m1', { source: 'manual' }), run('b1', { sport: 'bike' })];
    await loadDetails(list);
    expect(fetchStoredDetails).toHaveBeenCalledTimes(1);
    expect(fetchActivityDetails).toHaveBeenCalledTimes(1); // only the Garmin run without stored data
    expect(detailsFor(list[0])).toBe(details);
    expect(detailsFor(list[1])).toEqual({ laps: [], samples: [] });
    expect(detailsFor(list[2])).toBeNull();

    await loadDetails(list); // dashboard, report and analysis asking again
    expect(fetchStoredDetails).toHaveBeenCalledTimes(1);
    expect(fetchActivityDetails).toHaveBeenCalledTimes(1);
  });

  it('concurrent requests for the same run share one download', async () => {
    const a = run('c1');
    await Promise.all([loadDetails([a]), loadDetails([a]), loadDetails([a])]);
    expect(fetchActivityDetails).toHaveBeenCalledTimes(1);
  });

  it('a failed download falls back to averages instead of failing the page', async () => {
    fetchActivityDetails.mockRejectedValueOnce(new Error('Garmin rate limit'));
    const a = run('f1');
    await loadDetails([a]);
    expect(detailsFor(a)).toBeNull();
  });
});
