import { describe, expect, it } from 'vitest';
import {
  e1rm, exerciseKeyOf, exerciseLabel, exerciseProgress, exerciseSummaries, groupSessions, personalRecords, progressionHint, repRange, summarize, weeklyVolume,
  type SetRow,
} from './strengthStats';
import { toSetRows } from './strengthLog';

let n = 0;
const row = (session: string, date: string, idx: number, name: string | null, reps: number, kg: number | null, id: string | null = null): SetRow => ({
  session_key: session, local_date: date, idx, exercise_id: id, exercise_name: name, reps, weight_kg: kg,
});
void n;

// Squat: 60 -> 62.5 -> 65 kg over three weeks, bench from the watch (library id only), push-ups without weight.
const rows: SetRow[] = [
  row('100', '2026-10-12', 0, 'Back squat', 5, 60), row('100', '2026-10-12', 1, 'Back squat', 5, 60), row('100', '2026-10-12', 2, 'Back squat', 4, 60),
  row('100', '2026-10-12', 3, null, 8, 40, 'bench_press'),
  row('200', '2026-10-19', 0, 'Back squat', 5, 62.5), row('200', '2026-10-19', 1, 'Back squat', 5, 62.5), row('200', '2026-10-19', 2, 'Back squat', 5, 62.5),
  row('200', '2026-10-19', 3, 'Push-up', 12, null), row('200', '2026-10-19', 4, 'Push-up', 10, null),
  row('300', '2026-10-26', 0, 'Back squat', 5, 65), row('300', '2026-10-26', 1, 'Back squat', 5, 65), row('300', '2026-10-26', 2, 'Back squat', 3, 65),
  row('300', '2026-10-26', 3, 'Bench press', 8, 42.5, 'bench_press'),
  row('300', '2026-10-26', 4, 'Push-up', 14, null),
];

describe('estimated one-repetition maximum', () => {
  it('Epley; none for no weight, bodyweight or very high repetitions', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(60, 5)).toBeCloseTo(70, 5);
    expect(e1rm(null, 5)).toBeNull();
    expect(e1rm(60, 0)).toBeNull();
    expect(e1rm(20, 25)).toBeNull();
  });
});

describe('names', () => {
  it('the watch (library id) and the website (name) share one key for the same exercise', () => {
    expect(exerciseKeyOf(row('1', 'd', 0, null, 5, 50, 'bench_press'))).toBe('bench press');
    expect(exerciseKeyOf(row('1', 'd', 0, 'Bench press', 5, 50, 'bench_press'))).toBe('bench press');
    expect(exerciseLabel(row('1', 'd', 0, null, 5, 50, 'squat'))).toBe('Squat');
  });
});

describe('sessions', () => {
  it('are grouped newest first with reps, volume and exercise names', () => {
    const s = groupSessions(rows);
    expect(s.map((x) => x.key)).toEqual(['300', '200', '100']);
    expect(s[2]).toMatchObject({ date: '2026-10-12', reps: 22, volume: Math.round(60 * 14 + 40 * 8) });
    expect(s[0].exercises).toEqual(['Back squat', 'Bench press', 'Push-up']);
  });
});

describe('progress per exercise', () => {
  it('one point per session: top weight, reps at it, estimated 1RM, volume', () => {
    const p = exerciseProgress(rows, 'back squat');
    expect(p.map((x) => x.date)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(p.map((x) => x.topKg)).toEqual([60, 62.5, 65]);
    expect(p[2]).toMatchObject({ topReps: 5, volume: 65 * 13 });
    expect(p[1].e1rm).toBeCloseTo(62.5 * (1 + 5 / 30), 0);
  });

  it('summaries rank by sessions and judge weighted lifts by 1RM, bodyweight by repetitions', () => {
    const s = exerciseSummaries(rows);
    expect(s[0]).toMatchObject({ label: 'Back squat', sessions: 3, metric: 'e1rm' });
    expect(s[0].change).toBeGreaterThan(5);
    expect(s[0].changePct).toBeGreaterThan(8);
    const push = s.find((x) => x.label === 'Push-up')!;
    expect(push).toMatchObject({ metric: 'reps', change: 2 });
    expect(push.trend).toEqual([12, 14]);
    const bench = s.find((x) => x.key === 'bench press')!;
    expect(bench.sessions).toBe(2);
    expect(bench.label).toBe('Bench press');
  });

  it('personal records: best set per weighted exercise with the best before it', () => {
    const prs = personalRecords(rows);
    const squat = prs.find((x) => x.key === 'back squat')!;
    expect(squat).toMatchObject({ kg: 65, reps: 5, date: '2026-10-26' });
    expect(squat.before).toBeLessThan(squat.e1rm);
    expect(prs.some((x) => x.key === 'push-up')).toBe(false);
  });
});

describe('weeks and the 30-day summary', () => {
  const today = '2026-10-28'; // Wednesday

  it('volume per week, current week last', () => {
    const w = weeklyVolume(rows, 4, today);
    expect(w).toHaveLength(4);
    expect(w[3].weekStart).toBe('2026-10-26');
    expect(w[3]).toMatchObject({ sessions: 1, sets: 5 });
    expect(w[0].volume).toBe(0);
    expect(w.map((x) => x.sessions)).toEqual([0, 1, 1, 1]);
  });

  it('sessions, sets, volume, records and the weekly streak', () => {
    const s = summarize(rows, today);
    expect(s.sessions).toBe(3);
    expect(s.sets).toBe(rows.length);
    expect(s.streakWeeks).toBe(3);
    expect(s.records).toBeGreaterThanOrEqual(2); // squat 62.5 and 65, bench 42.5
    expect(summarize([], today)).toMatchObject({ sessions: 0, volume: 0, streakWeeks: 0, records: 0 });
  });

  it('a week without a session so far does not break the streak while the week is young', () => {
    expect(summarize(rows, '2026-11-03').streakWeeks).toBe(3); // Tuesday of the next week
    expect(summarize(rows, '2026-11-12').streakWeeks).toBe(0); // a whole week missed
  });
});

describe('what to lift next', () => {
  const squat = exerciseProgress(rows, 'back squat');
  it('adds weight when every working set reached the top of the repetition range', () => {
    expect(progressionHint(squat[1], '5')).toEqual({ kg: 65, reason: 'all sets reached 5 reps last time' });
  });
  it('repeats the weight when a set fell short', () => {
    expect(progressionHint(squat[2], '5')).toEqual({ kg: 65, reason: 'repeat until every set reaches 5 reps' });
    expect(progressionHint(squat[0], '5–6')?.kg).toBe(60);
  });
  it('says nothing without history, for timed or bodyweight exercises', () => {
    expect(progressionHint(undefined, '5')).toBeNull();
    expect(progressionHint(squat[0], '45 s')).toBeNull();
    expect(progressionHint(exerciseProgress(rows, 'push-up')[0], '10')).toBeNull();
  });
  it('parses repetition ranges', () => {
    expect(repRange('8')).toEqual([8, 8]);
    expect(repRange('8–10')).toEqual([8, 10]);
    expect(repRange('45 s')).toBeNull();
    expect(repRange('10 / side')).toEqual([10, 10]);
  });
});

describe('logging a workout', () => {
  it('writes one row per finished set with library id, name, source and a stable key', () => {
    const out = toSetRows({
      workoutId: 'w1',
      date: '2026-11-06',
      startedAt: new Date('2026-11-06T17:00:00Z'),
      exercises: [
        { name: 'Back squat', id: 'squat', planned: true, sets: [{ reps: 5, kg: 80 }, { reps: 5, kg: 80 }, { reps: 0, kg: 80 }] },
        { name: 'Sled push', planned: false, sets: [{ reps: 10, kg: null }] },
      ],
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ session_key: String(Date.parse('2026-11-06T17:00:00Z') / 1000), idx: 0, exercise_id: 'squat', exercise_name: 'Back squat', weight_kg: 80, source: 'plan', workout_id: 'w1' });
    expect(out[2]).toMatchObject({ idx: 2, exercise_id: null, exercise_name: 'Sled push', weight_kg: null, source: 'pick' });
    expect(new Set(out.map((r) => r.session_key)).size).toBe(1);
    // and the stats read it back as the same exercise as the watch's
    expect(exerciseKeyOf({ exercise_id: out[0].exercise_id, exercise_name: out[0].exercise_name })).toBe('back squat');
  });
});
