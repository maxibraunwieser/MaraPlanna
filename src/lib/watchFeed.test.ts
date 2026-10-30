import { describe, expect, it } from 'vitest';
import { buildWatchFeed, mondayOf as feedMonday, addDays as feedAddDays } from '../../supabase/functions/_shared/watchFeed.ts';
import type { CalWorkout } from '../../supabase/functions/_shared/calendar.ts';
import { assessFitness } from './planner/fitness';
import { buildPlan } from './planner/generate';
import { addDays, mondayOf } from './planner/dates';
import { normalizeAnswers } from './answers';
import { keyPace } from './format';

const answers = normalizeAnswers({
  raceName: 'Vienna', raceDate: '2027-04-18', goalType: 'time', goalTimeS: 13500, level: 'intermediate', marathonsCompleted: 1,
  recentRace: { distanceM: 21_097, timeS: 6480, date: '2026-09-20' }, currentWeeklyKm: 35, longestRecentRunKm: 16, runDaysPerWeek: 5, longRunDay: 6,
  extras: [{ id: 'core', type: 'core', perWeek: 2 }],
});
const gen = buildPlan(answers, assessFitness({ answers, activities: [], metrics: [], garmin: null, today: '2026-10-26' }), '2026-10-26');
const paces = gen.fitness.paces;
const workouts: CalWorkout[] = gen.workouts.map((d, i) => ({ ...d, id: `w${i}`, status: 'planned', note: null }));
const base = { raceDate: answers.raceDate, predictedS: gen.fitness.predictedMarathonS, paces, units: 'km' as const, workouts, weekDoneKm: 0, hasPlan: true };

describe('watch feed', () => {
  const keyDay = workouts.find((w) => w.key_session && w.kind !== 'long')!;
  const feed = buildWatchFeed({ ...base, date: keyDay.date });

  it('shows today\'s session with distance and the same key pace as the app', () => {
    expect(feed.today.label.startsWith(`TODAY · ${keyDay.kind === 'threshold' ? 'THRESHOLD' : keyDay.kind === 'fartlek' ? 'FARTLEK' : keyDay.kind.toUpperCase()}`)).toBe(true);
    expect(feed.today.title).toBe(keyDay.title);
    expect(feed.today.line).toBe(`${keyDay.distance_km} km · ${keyPace(keyDay.steps, paces, 'km')}`);
    expect(feed.today.done).toBe(false);
    expect(feed.today.rest).toBe(false);
  });

  it('adds extra sessions of the day to the label', () => {
    const core = workouts.find((w) => w.kind === 'core')!;
    const f = buildWatchFeed({ ...base, workouts: [...workouts, { ...core, id: 'extra', date: keyDay.date }], date: keyDay.date });
    expect(f.today.label).toMatch(/ \+ CORE$/);
  });

  it('marks done days and rest days', () => {
    const done = workouts.map((w) => (w.date === keyDay.date ? { ...w, status: 'completed' } : w));
    expect(buildWatchFeed({ ...base, workouts: done, date: keyDay.date }).today.done).toBe(true);
    const restDay = addDays(keyDay.date, 1);
    const rest = buildWatchFeed({ ...base, workouts: workouts.filter((w) => w.date !== restDay), date: restDay });
    expect(rest.today).toMatchObject({ rest: true, title: 'Rest day', label: 'TODAY' });
    expect(rest.next?.label.startsWith('TOMORROW')).toBe(true);
  });

  it('adds up the week and counts down to race day', () => {
    const monday = mondayOf(keyDay.date);
    const planned = workouts.filter((w) => w.date >= monday && w.date <= addDays(monday, 6) && w.distance_km).reduce((s, w) => s + w.distance_km!, 0);
    const f = buildWatchFeed({ ...base, date: keyDay.date, weekDoneKm: 12.34 });
    expect(f.week).toEqual({ done: 12.3, planned: Math.round(planned * 10) / 10, text: `12 / ${Math.round(planned)} km` });
    expect(f.race?.days).toBe(Math.round((Date.parse('2027-04-18') - Date.parse(keyDay.date)) / 86_400_000));
    expect(f.proj).toMatch(/^\d:\d\d$/);
    expect(buildWatchFeed({ ...base, date: '2027-04-18' }).race?.text).toBe('Race day!');
    expect(buildWatchFeed({ ...base, date: '2027-04-18' }).today.label).toBe('TODAY · RACE');
    expect(buildWatchFeed({ ...base, date: '2027-04-20' }).race).toBeNull();
  });

  it('uses miles for runners in miles', () => {
    const f = buildWatchFeed({ ...base, units: 'mi', date: keyDay.date, weekDoneKm: 16.09 });
    expect(f.week.done).toBe(10);
    expect(f.today.line).toMatch(/ mi · .* \/mi$/);
  });

  it('says so when there is no plan', () => {
    expect(buildWatchFeed({ ...base, hasPlan: false, date: '2026-10-30' }).today.title).toBe('No plan yet');
  });

  it('stays small for the watch (background memory) and date helpers match the app', () => {
    for (const w of workouts.slice(0, 40)) expect(JSON.stringify(buildWatchFeed({ ...base, date: w.date })).length).toBeLessThan(900);
    for (const d of ['2026-10-26', '2026-11-01', '2027-02-28', '2027-03-29']) {
      expect(feedMonday(d)).toBe(mondayOf(d));
      expect(feedAddDays(d, 9)).toBe(addDays(d, 9));
    }
  });
});

describe('watch text', () => {
  it('keeps Latin-1 (fonts on the watch) and swaps the rest', async () => {
    const { glyphs } = await import('../../supabase/functions/_shared/watchFeed.ts');
    expect(glyphs('5:58–6:34 /km · 5 × 1000 m')).toBe('5:58-6:34 /km · 5 × 1000 m');
    expect(glyphs('Race day 🏁 “Vienna” …')).toBe('Race day "Vienna" ...');
  });

  it('pace ranges arrive without en dashes', () => {
    const easyDay = workouts.find((w) => w.kind === 'easy' && w.title === 'Easy run')!;
    expect(buildWatchFeed({ ...base, date: easyDay.date }).today.line).toMatch(/^\d+(\.\d)? km · \d:\d\d-\d:\d\d \/km$/);
  });
});
