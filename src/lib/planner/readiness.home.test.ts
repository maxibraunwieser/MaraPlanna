import { describe, expect, it } from 'vitest';
import { greetingPart, restingHrDelta, trainingReadiness } from './readiness';
import type { Activity, DailyMetric } from '../types';

const metric = (date: string, over: Partial<DailyMetric> = {}): DailyMetric => ({
  date, resting_hr: 50, hrv_last_night: 60, hrv_weekly_avg: 60, hrv_status: 'BALANCED', sleep_s: 8 * 3600, sleep_score: 85,
  stress_avg: 25, body_battery_high: 90, body_battery_low: 20, steps: 8000, ...over,
});
const run = (date: string, minutes: number) => ({ local_date: date, duration_s: minutes * 60 }) as Activity;

describe('greetingPart', () => {
  it('follows the hour of the day', () => {
    expect([4, 5, 10, 11, 16, 17, 21, 22, 0].map(greetingPart)).toEqual(['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night']);
  });
});

describe('trainingReadiness', () => {
  it('has no value without wellness data', () => {
    expect(trainingReadiness([], [], '2026-11-07')).toMatchObject({ score: null, level: 'unknown' });
  });
  it('takes the Garmin value when the watch reports one', () => {
    const r = trainingReadiness([metric('2026-11-07', { training_readiness: 62 })], [], '2026-11-07');
    expect(r).toMatchObject({ score: 62, source: 'garmin', level: 'ok' });
  });
  it('computes a high value for a rested body', () => {
    const r = trainingReadiness([metric('2026-11-07')], [run('2026-11-01', 60), run('2026-10-25', 60)], '2026-11-07');
    expect(r.source).toBe('calc');
    expect(r.score!).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe('good');
  });
  it('computes a low value after a bad night, a low HRV, a raised resting HR and a heavy few days', () => {
    const days = Array.from({ length: 10 }, (_, i) => metric(`2026-10-${String(20 + i).padStart(2, '0')}`));
    const today = metric('2026-11-07', { sleep_score: 35, hrv_last_night: 40, resting_hr: 60, body_battery_high: 30 });
    const acts = [run('2026-11-05', 120), run('2026-11-06', 120), run('2026-11-07', 90), run('2026-10-15', 30)];
    const r = trainingReadiness([...days, today], acts, '2026-11-07');
    expect(r.score!).toBeLessThan(45);
    expect(r.level).toBe('low');
  });
  it('falls back to yesterday', () => {
    expect(trainingReadiness([metric('2026-11-06')], [], '2026-11-07').metric?.date).toBe('2026-11-06');
  });
});

describe('restingHrDelta', () => {
  it('compares with the median of the three weeks before', () => {
    const base = Array.from({ length: 5 }, (_, i) => metric(`2026-10-${String(25 + i).padStart(2, '0')}`, { resting_hr: 50 }));
    const today = metric('2026-11-07', { resting_hr: 55 });
    expect(restingHrDelta([...base, today], today)).toBe(5);
    expect(restingHrDelta([today], today)).toBeNull();
  });
});
