import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import type { PlannedWorkout } from './types';
import { buildIcs, foldLine, stepText, type CalWorkout } from '../../supabase/functions/_shared/calendar';
import { describeStep } from './format';
import { addDays } from './planner/dates';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { normalizeAnswers } from './answers';

const answers = normalizeAnswers({
  raceName: 'Vienna City Marathon', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
  extras: [{ id: 'lower', type: 'lower', perWeek: 1 }],
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' }), '2026-10-26');
const paces = gen.fitness.paces;
const workouts: CalWorkout[] = gen.workouts.map((d, i) => ({ ...d, id: `w${i}`, status: 'planned', note: null }));
const now = new Date('2026-10-29T08:00:00Z');
const ics = buildIcs({ name: 'MaraPlanna · Vienna City Marathon', workouts, paces, units: 'km', appUrl: 'https://example.github.io/MaraPlanna/plan', now });

describe('calendar feed', () => {
  it('is valid iCalendar with one all-day event per session', () => {
    const cal = new ICAL.Component(ICAL.parse(ics));
    const events = cal.getAllSubcomponents('vevent').map((e) => new ICAL.Event(e));
    expect(events).toHaveLength(workouts.length);
    const first = events[0];
    expect(first.startDate.isDate).toBe(true);
    expect(first.startDate.toString()).toBe(workouts[0].date);
    expect(first.endDate.toString()).toBe(addDays(workouts[0].date, 1));
    expect(cal.getFirstPropertyValue('x-wr-calname')).toBe('MaraPlanna · Vienna City Marathon');
    const race = events.find((e) => e.summary.includes('Race day'))!;
    expect(race.startDate.toString()).toBe('2027-04-18');
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  });

  it('describes every step exactly like the app does', () => {
    for (const w of gen.workouts) {
      for (const s of w.steps) {
        expect(stepText(s, paces, 'km')).toEqual(describeStep(s, paces, 'km'));
        expect(stepText(s, paces, 'mi')).toEqual(describeStep(s, paces, 'mi'));
      }
    }
    const cal = new ICAL.Component(ICAL.parse(ics));
    const ev = cal.getAllSubcomponents('vevent').map((e) => new ICAL.Event(e)).find((e) => e.summary.startsWith('Intervals') || e.summary.startsWith('Threshold') || e.summary.startsWith('Fartlek'))!;
    expect(ev.description).toMatch(/^\d+(\.\d)? km · ~\d+ min · key session\n\n1\. /);
    expect(ev.description).toContain('Open in MaraPlanna: https://example.github.io/MaraPlanna/plan');
  });

  it('folds long lines to ≤ 75 octets without breaking characters and uses CRLF', () => {
    const lines = ics.split('\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const long = 'SUMMARY:' + '× ü – 🏁 '.repeat(30);
    const folded = foldLine(long);
    expect(folded.split('\r\n ').join('')).toBe(long);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('escapes text and marks done, missed and skipped sessions', () => {
    const w = (over: Partial<CalWorkout>): CalWorkout => ({ ...workouts[0], id: 'x', ...over });
    const out = buildIcs({
      name: 'Test', paces, units: 'km', appUrl: '', now,
      workouts: [
        w({ id: 'a', title: 'Easy run, relaxed; really', status: 'completed', note: 'Line one\nline two' }),
        w({ id: 'b', status: 'missed' }),
        w({ id: 'c', status: 'skipped' }),
      ],
    });
    const events = new ICAL.Component(ICAL.parse(out)).getAllSubcomponents('vevent').map((e) => new ICAL.Event(e));
    expect(events.map((e) => e.uid)).toEqual(['a@maraplanna', 'b@maraplanna']);
    expect(events[0].summary).toBe(`✓ Easy run, relaxed; really · ${workouts[0].distance_km} km`);
    expect(events[0].description).toContain('Note: Line one\nline two');
    expect(events[1].summary.startsWith('(missed) ')).toBe(true);
  });

  it('uses miles when the user runs in miles and works without paces', () => {
    const mi = buildIcs({ name: 'Test', workouts: workouts.slice(0, 3) as (CalWorkout & PlannedWorkout)[], paces: null, units: 'mi', appUrl: '', now });
    const ev = new ICAL.Event(new ICAL.Component(ICAL.parse(mi)).getFirstSubcomponent('vevent')!);
    expect(ev.summary).toMatch(/ mi$/);
    expect(ev.description).not.toContain('/mi');
  });
});
