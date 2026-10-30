import { describe, expect, it } from 'vitest';
import { buildRunFeed, paceRange, runSteps, stepName, ZONES } from '../../supabase/functions/_shared/runFeed.ts';
import type { CalWorkout } from '../../supabase/functions/_shared/calendar.ts';
import type { Step } from './types';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { workoutKm } from './planner/workouts';
import { normalizeAnswers } from './answers';

const answers = normalizeAnswers({
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
  extras: [{ id: 'core', type: 'core', perWeek: 1 }],
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' }), '2026-10-26');
const paces = gen.fitness.paces;
const workouts: CalWorkout[] = gen.workouts.map((d, i) => ({ ...d, id: `w${i}`, status: 'planned', note: null }));

describe('run app feed', () => {
  it('writes out repeats with recoveries between them (none after the last rep)', () => {
    const steps: Step[] = [
      { type: 'run', label: 'Warm-up', zone: 'easy', distanceKm: 2.5 },
      { type: 'run', label: 'Interval', zone: 'interval', distanceKm: 1, repeat: 5, recoveryKm: 0.4 },
      { type: 'run', label: 'Cool-down', zone: 'easy', distanceKm: 1.5 },
    ];
    const out = runSteps(steps, paces);
    expect(out.map((s) => s.n)).toEqual(['Einlaufen', 'Interval 1/5', 'Trabpause', 'Interval 2/5', 'Trabpause', 'Interval 3/5', 'Trabpause', 'Interval 4/5', 'Trabpause', 'Interval 5/5', 'Auslaufen']);
    expect(out[0]).toMatchObject({ t: 'w', d: 2500, lo: Math.round(paces.easy[0]), hi: Math.round(paces.easy[1]), z: ZONES.indexOf('easy') });
    expect(out[1]).toMatchObject({ t: 'a', d: 1000, lo: Math.round(paces.interval - 5), hi: Math.round(paces.interval + 5), z: ZONES.indexOf('interval') });
    expect(out[2]).toEqual({ n: 'Trabpause', t: 'r', d: 400, z: ZONES.indexOf('recovery') });
    expect(out[10].t).toBe('c');
  });

  it('time-based reps and strides (by feel, no target)', () => {
    const out = runSteps(
      [
        { type: 'run', label: 'Easy', zone: 'easy', distanceKm: 8 },
        { type: 'run', label: 'Strides (20 s fast, relaxed)', zone: 'repetition', durationMin: 1 / 3, repeat: 6, recoveryMin: 1 },
      ],
      paces,
    );
    expect(out).toHaveLength(1 + 6 + 5);
    expect(out[1]).toEqual({ n: 'Steigerung 1/6', t: 'a', s: 20, z: ZONES.indexOf('repetition') });
    expect(out[2]).toMatchObject({ n: 'Trabpause', s: 60 });
  });

  it('covers the whole planned distance of every run in the plan', () => {
    for (const w of gen.workouts.filter((x) => x.distance_km && x.kind !== 'race').slice(0, 60)) {
      const out = runSteps(w.steps, paces);
      const metres = out.reduce((s, x) => s + (x.d ?? 0), 0);
      const timed = out.some((x) => x.s);
      if (!timed) expect(Math.abs(metres / 1000 - workoutKm(w.steps, paces))).toBeLessThan(0.01);
      expect(out.every((x) => (x.d ?? 0) > 0 || (x.s ?? 0) > 0)).toBe(true);
      expect(out.every((x) => x.lo === undefined || (x.lo < x.hi! && x.lo > 150 && x.hi! < 600))).toBe(true);
    }
  });

  it("today's key session becomes the workout; paces, VDOT and units come along", () => {
    const key = workouts.find((w) => w.key_session && w.kind !== 'long')!;
    const day = workouts.filter((w) => w.date === key.date);
    const f = buildRunFeed({ vdot: 46.33, paces, units: 'km', workouts: day });
    expect(f.vdot).toBe(46.3);
    expect(f.paces).toBe(paces);
    expect(f.workout?.title).toBe(key.title);
    expect(f.workout?.steps.length).toBeGreaterThan(2);
    expect(paceRange(paces, 'marathon')).toEqual([Math.round(paces.marathon - 5), Math.round(paces.marathon + 5)]);
  });

  it('no run today, a skipped run, or no plan → no workout', () => {
    const core = workouts.filter((w) => w.kind === 'core');
    expect(buildRunFeed({ vdot: 45, paces, units: 'km', workouts: core }).workout).toBeNull();
    const run = workouts.find((w) => w.kind === 'easy')!;
    expect(buildRunFeed({ vdot: 45, paces, units: 'km', workouts: [{ ...run, status: 'skipped' }] }).workout).toBeNull();
    expect(buildRunFeed({ vdot: null, paces: null, units: 'km', workouts: [run] }).workout).toBeNull();
  });

  it('stays small enough for the watch', () => {
    for (const w of workouts.filter((x) => x.distance_km).slice(0, 80)) {
      expect(JSON.stringify(buildRunFeed({ vdot: 45, paces, units: 'km', workouts: [w] })).length).toBeLessThan(2500);
    }
  });

  it('names: German for warm-up, cool-down, recoveries and strides; run types as on the website', () => {
    expect(stepName('Warm-up')).toBe('Einlaufen');
    expect(stepName('Cool-down')).toBe('Auslaufen');
    expect(stepName('Threshold')).toBe('Threshold');
    const labels = new Set(workouts.flatMap((w) => w.steps.filter((x) => x.type === 'run').map((x) => x.label)));
    expect(labels.has('Warm-up')).toBe(true);
    // Watch fonts are Latin-1 only.
    for (const l of labels) expect(stepName(l)).toMatch(/^[\x20-\xff]+$/);
  });
});
