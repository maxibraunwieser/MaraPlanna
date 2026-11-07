import { describe, expect, it } from 'vitest';
import { qualityFor, solveWeek, MIN_RUN_MIN, type WeekModelInput } from './weekModel';
import type { Weekday } from '../types';

const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

const input = (o: Partial<WeekModelInput> = {}): WeekModelInput => ({
  free: ALL, minutes: [], runs: 4, longDay: null, preferred: [], quality: 1, level: 'intermediate', strength: [], strengthMin: 40, sameDay: true, ...o,
});

describe('the run days', () => {
  it('puts the long run on the weekend and keeps hard days apart', () => {
    for (const runs of [3, 4, 5, 6]) {
      const s = solveWeek(input({ runs, quality: qualityFor('intermediate', runs) }));
      expect(s.runDays.length).toBe(runs);
      expect(s.longDay).toBe(6);
      for (const q of s.quality) {
        expect(gap(q, s.longDay)).toBeGreaterThan(1);
        for (const r of s.quality) if (r !== q) expect(gap(q, r)).toBeGreaterThan(1);
      }
      expect(s.week[s.longDay].run).toBe('long');
    }
  });

  it('the planner puts the long run on the day with the most time', () => {
    const s = solveWeek(input({ minutes: [45, 45, 45, 45, 45, 150, 60] }));
    expect(s.longDay).toBe(5);
    expect(s.longTight).toBe(false);
    // a day of 60 minutes is too short for a long run: marked when it is the only choice
    const tight = solveWeek(input({ free: [1, 3, 5], runs: 3, minutes: [0, 45, 0, 45, 0, 60, 0] }));
    expect(tight.longDay).toBe(5);
    expect(tight.longTight).toBe(true);
  });

  it('a long-run day the person fixed stays', () => {
    const s = solveWeek(input({ longDay: 2, minutes: [45, 45, 45, 45, 45, 150, 150] }));
    expect(s.longDay).toBe(2);
  });

  it('never uses a day without time and keeps to the days the person named', () => {
    const s = solveWeek(input({ free: [0, 2, 4, 5, 6], runs: 4 }));
    expect(s.runDays.every((d) => [0, 2, 4, 5, 6].includes(d))).toBe(true);
    const named = solveWeek(input({ runs: 3, preferred: [1, 3, 5] }));
    expect(named.runDays).toEqual([1, 3, 5]);
    // fewer named days than runs: the planner adds days
    expect(solveWeek(input({ runs: 3, preferred: [1, 3] })).runDays.length).toBe(3);
  });

  it('a quality run goes on a day with enough time', () => {
    const s = solveWeek(input({ runs: 4, minutes: [30, 90, 30, 90, 30, 90, 120] }));
    for (const q of s.quality) expect(s.week[q].run).toBe('quality');
    expect(s.quality.every((d) => [1, 3, 5].includes(d))).toBe(true);
    expect(MIN_RUN_MIN.quality).toBeGreaterThan(30);
  });
});

describe('strength next to the runs', () => {
  const legs = (s: ReturnType<typeof solveWeek>) => s.strength.filter((x) => x.kind !== 'upper');

  it('never on the long-run day; heavy legs not the day before the long run or a quality run', () => {
    for (const runs of [3, 4, 5]) {
      const s = solveWeek(input({ runs, quality: qualityFor('intermediate', runs), strength: ['lower', 'upper', 'full'] }));
      expect(s.unplaced).toBe(0);
      expect(s.strength.length).toBe(3);
      expect(s.strength.every((x) => x.day !== s.longDay)).toBe(true);
      for (const l of legs(s)) {
        expect((l.day + 1) % 7).not.toBe(s.longDay);
        expect(s.quality).not.toContain((l.day + 1) % 7);
      }
    }
  });

  it('two leg sessions are at least a day apart', () => {
    const s = solveWeek(input({ runs: 3, quality: 1, strength: ['lower', 'upper', 'full'] }));
    const [a, b] = legs(s);
    expect(gap(a.day, b.day)).toBeGreaterThan(1);
  });

  it('leg work stacks on a hard-run day when the day has the time, else it gets a day of its own', () => {
    const roomy = solveWeek(input({ runs: 3, quality: 1, strength: ['lower'], minutes: [120, 120, 120, 120, 120, 120, 120] }));
    expect(roomy.strength[0].why === 'hardDay' || roomy.strength[0].why === 'rest').toBe(true);
    // 45 minutes a day: run and strength cannot share a weekday
    const short = solveWeek(input({ runs: 3, quality: 1, strength: ['lower', 'upper'], strengthMin: 40, minutes: [45, 45, 45, 45, 45, 120, 120] }));
    for (const x of short.strength) if (x.day < 5) expect(short.week[x.day].run).toBe('rest');
  });

  it('every session fits into the minutes of its day', () => {
    const minutes = [45, 60, 45, 90, 45, 120, 120];
    const s = solveWeek(input({ runs: 4, quality: 1, strength: ['lower', 'upper', 'full'], strengthMin: 40, minutes }));
    for (const x of s.strength) {
      const run = s.week[x.day].run;
      const need = 40 + (run === 'rest' ? 0 : MIN_RUN_MIN[run === 'quality' ? 'quality' : run === 'recovery' ? 'recovery' : 'easy']);
      expect(minutes[x.day]).toBeGreaterThanOrEqual(run === 'rest' ? 30 : need);
    }
  });

  it('without double days a strength session only goes on a day without a run', () => {
    const s = solveWeek(input({ runs: 3, strength: ['lower', 'upper'], sameDay: false }));
    for (const x of s.strength) expect(s.week[x.day].run).toBe('rest');
    // more sessions than free days: the rest stay unplaced
    const many = solveWeek(input({ runs: 5, strength: ['lower', 'upper', 'full', 'lower'], sameDay: false }));
    expect(many.strength.length).toBe(1);
    expect(many.unplaced).toBe(3);
  });

  it('keeps one day with nothing planned, best right after the long run', () => {
    const s = solveWeek(input({ runs: 3, quality: 1, strength: ['lower', 'upper', 'full'] }));
    expect(s.restDays.length).toBeGreaterThanOrEqual(1);
    const full = solveWeek(input({ runs: 4, quality: 1, strength: ['lower', 'upper', 'full', 'upper'] }));
    expect(full.restDays.length).toBeGreaterThanOrEqual(1);
    const light = solveWeek(input({ runs: 3, quality: 1, strength: ['full'] }));
    expect(light.restDays).toContain(((light.longDay + 1) % 7) as Weekday);
  });

  it('a person with days without time has their rest days already', () => {
    const s = solveWeek(input({ free: [0, 1, 3, 4, 5, 6], runs: 3, strength: ['lower', 'upper', 'full'] }));
    expect(s.runDays.length + new Set(s.strength.map((x) => x.day).filter((d) => !s.runDays.includes(d as Weekday))).size).toBeLessThanOrEqual(6);
  });

  it('drops the sessions that do not fit rather than overfilling a day', () => {
    const s = solveWeek(input({ free: [1, 3, 5], runs: 3, strength: ['lower', 'upper'], minutes: [0, 45, 0, 45, 0, 60, 0] }));
    // three run days, no day left for strength, and no weekday with room for both
    expect(s.strength.length).toBe(0);
    expect(s.unplaced).toBe(2);
  });
});
