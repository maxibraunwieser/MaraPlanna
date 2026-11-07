import { describe, expect, it } from 'vitest';
import { applyAutoWeek, autoWeek, manualWeek, statesOf, usableLongDay, weekIssues, type DayState, type WeekInput } from './week';
import { strengthExtras, strengthKinds, strengthPerWeek, withStrengthSessions } from '../onboarding/strengthMap';
import { normalizeAnswers } from '../answers';
import type { DayTemplate, Weekday } from '../types';

const base = (over: Partial<WeekInput> = {}): WeekInput => ({ runDays: 4, longDay: 6, unavailable: [], level: 'intermediate', extras: strengthExtras(2), ...over });
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
const days = (w: DayTemplate[], f: (d: DayTemplate) => boolean) => w.flatMap((d, i) => (f(d) ? [i] : []));

describe('strength sessions per week', () => {
  it('maps the answer to lower / upper / full sessions', () => {
    expect(strengthKinds(0)).toEqual([]);
    expect(strengthKinds(1)).toEqual(['full']);
    expect(strengthKinds(2)).toEqual(['lower', 'upper']);
    expect(strengthKinds(4)).toEqual(['lower', 'upper', 'lower', 'upper']);
    expect(strengthKinds(9)).toHaveLength(4);
  });

  it('counts back to the same number and keeps other extras', () => {
    for (const n of [0, 1, 2, 3, 4]) expect(strengthPerWeek(strengthExtras(n))).toBe(n);
    const core = { id: 'core', type: 'core' as const, perWeek: 2 };
    const out = withStrengthSessions([{ id: 'lower', type: 'lower', perWeek: 1 }, core], 3);
    expect(out.find((e) => e.id === 'core')).toEqual(core);
    expect(strengthPerWeek(out)).toBe(3);
  });
});

describe('plan for me', () => {
  it('puts nothing on the days the person cannot train and the long run on the chosen day', () => {
    const { week } = autoWeek(base({ unavailable: [1, 3] }));
    for (const d of [1, 3]) expect(week[d]).toEqual({ run: 'rest', extras: [] });
    expect(days(week, (d) => d.run === 'long')).toEqual([6]);
  });

  it('moves a blocked long-run day to the nearest free day', () => {
    expect(usableLongDay(6, [6])).not.toBe(6);
    const { week, longDay } = autoWeek(base({ unavailable: [6] }));
    expect(week[longDay].run).toBe('long');
    expect(week[6].run).toBe('rest');
  });

  it('never puts hard runs on consecutive days', () => {
    for (const runDays of [3, 4, 5, 6]) {
      for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
        const { week } = autoWeek(base({ runDays, level }));
        const hard = days(week, (d) => d.run === 'quality' || d.run === 'long');
        for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) expect(gap(hard[i], hard[j])).toBeGreaterThan(1);
      }
    }
  });

  it('keeps heavy leg work off the long-run day and the day before it', () => {
    for (const perWeek of [1, 2, 3, 4]) {
      for (const runDays of [3, 4, 5]) {
        const { week } = autoWeek(base({ runDays, extras: strengthExtras(perWeek) }));
        const long = week.findIndex((d) => d.run === 'long');
        const legs = (d: DayTemplate) => d.extras.includes('lower') || d.extras.includes('full');
        expect(legs(week[long])).toBe(false);
        expect(legs(week[(long + 6) % 7])).toBe(false);
      }
    }
  });

  it('leaves at least one day empty unless the person runs on all seven days', () => {
    for (const runDays of [3, 4, 5, 6]) {
      const { week } = autoWeek(base({ runDays, extras: strengthExtras(4) }));
      expect(week.some((d) => d.run === 'rest' && d.extras.length === 0)).toBe(true);
    }
    const seven = autoWeek(base({ runDays: 7, extras: [] })).week;
    expect(seven.every((d) => d.run !== 'rest')).toBe(true);
  });

  it('places every wanted strength session when there is room', () => {
    for (const perWeek of [1, 2, 3, 4]) {
      const r = autoWeek(base({ runDays: 4, extras: strengthExtras(perWeek) }));
      expect(r.unplaced).toBe(0);
      expect(r.week.flatMap((d) => d.extras)).toHaveLength(perWeek);
    }
  });

  it('reports sessions that find no day', () => {
    const r = autoWeek(base({ runDays: 3, unavailable: [0, 1, 2, 3, 4] as Weekday[], extras: strengthExtras(4) }));
    expect(r.unplaced).toBeGreaterThan(0);
  });
});

describe('manual week', () => {
  const states: DayState[] = ['strength', 'run', 'rest', 'run', 'both', 'rest', 'run'];

  it('runs where the person said run, strength where they said strength, both on both', () => {
    const week = manualWeek(states, 6, 'intermediate');
    expect(statesOf(week)).toEqual(states);
    expect(week[6].run).toBe('long');
  });

  it('assigns the hard runs so they are not back to back', () => {
    const week = manualWeek(['run', 'run', 'run', 'run', 'run', 'rest', 'run'], 6, 'advanced');
    const hard = days(week, (d) => d.run === 'quality' || d.run === 'long');
    for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) expect(gap(hard[i], hard[j])).toBeGreaterThan(1);
  });

  it('puts leg work on a day that is not before the long run', () => {
    const week = manualWeek(['both', 'run', 'strength', 'run', 'run', 'strength', 'run'], 6, 'intermediate');
    const legs = (d: DayTemplate) => d.extras.includes('lower') || d.extras.includes('full');
    expect(legs(week[6])).toBe(false);
    expect(legs(week[5])).toBe(false);
  });
});

describe('week issues', () => {
  const ctx = (over = {}) => ({ extras: strengthExtras(2), runsWanted: 4, strengthWanted: 2, ...over });

  it('has none for a week the planner made', () => {
    const { week } = autoWeek(base());
    expect(weekIssues(week, ctx())).toEqual([]);
  });

  it('needs exactly one long run', () => {
    const week = manualWeek(['run', 'run', 'rest', 'run', 'rest', 'rest', 'run'], 6, 'intermediate');
    week[6].run = 'easy';
    expect(weekIssues(week, ctx()).some((i) => i.key === 'noLong' && i.severity === 'error')).toBe(true);
  });

  it('warns, without blocking, about back-to-back hard days and legs before the long run', () => {
    const week = manualWeek(['rest', 'run', 'run', 'rest', 'rest', 'strength', 'run'], 6, 'intermediate');
    week[4].run = 'quality';
    week[5] = { run: 'quality', extras: ['lower'] };
    const issues = weekIssues(week, ctx({ runsWanted: null, strengthWanted: null }));
    const keys = issues.map((i) => i.key);
    expect(keys).toContain('hardBackToBack');
    expect(keys).toContain('legsBeforeLong');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('hints when the counts differ from the answers', () => {
    const { week } = autoWeek(base({ runDays: 3 }));
    const keys = weekIssues(week, ctx({ runsWanted: 5, strengthWanted: 3 })).map((i) => i.key);
    expect(keys).toContain('runsMismatch');
    expect(keys).toContain('strengthMismatch');
  });

  it('accepts running on all seven days', () => {
    const week = manualWeek(Array(7).fill('run') as DayState[], 6, 'advanced');
    expect(weekIssues(week, ctx({ extras: [], runsWanted: 7, strengthWanted: null })).map((i) => i.key)).not.toContain('noRest');
  });
});

describe('applying the automatic week to the answers', () => {
  it('keeps the number of runs the person asked for, even while many days are blocked', () => {
    const a = normalizeAnswers({ runDaysPerWeek: 5 });
    const blocked = applyAutoWeek({ ...a, setup: { ...a.setup!, unavailableDays: [0, 1, 2, 3, 4, 5] } }, 2);
    expect(blocked.runDaysPerWeek).toBe(5);
    expect(blocked.availableDays).toEqual([6]);
    const back = applyAutoWeek({ ...blocked, setup: { ...blocked.setup!, unavailableDays: [] } }, 2);
    expect(back.runDaysPerWeek).toBe(5);
    expect(back.availableDays).toHaveLength(7);
  });
});

describe('manual week keeps rest days free', () => {
  it('other extras (core, mobility) never land on a day the person marked as rest', () => {
    const states: DayState[] = ['run', 'rest', 'run', 'strength', 'rest', 'run', 'run'];
    const week = manualWeek(states, 6, 'intermediate', [{ id: 'core', type: 'core', perWeek: 2 }, { id: 'mobility', type: 'mobility', perWeek: 1 }]);
    expect(week[1]).toEqual({ run: 'rest', extras: [] });
    expect(week[4]).toEqual({ run: 'rest', extras: [] });
    expect(week.flatMap((d) => d.extras).filter((id) => id === 'core')).toHaveLength(2);
  });
});
