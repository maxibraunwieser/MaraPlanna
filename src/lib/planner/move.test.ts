import { describe, expect, it } from 'vitest';
import type { PlannedWorkout } from '../types';
import { reconcile } from './adapt';
import { canMove, inBounds, moveBounds, moveDays, movePatch, movePatches, moveWarnings, swapCandidate } from './move';

const w = (id: string, date: string, over: Partial<PlannedWorkout> = {}): PlannedWorkout => ({
  id, plan_id: 'p', user_id: 'u', date, week: 1, phase: 'base', kind: 'easy', title: `Run ${id}`, steps: [], distance_km: 8, duration_min: 45,
  key_session: false, status: 'planned', status_source: 'auto', activity_id: null, actual_distance_km: null, original_date: null, note: null, ...over,
});
const RACE = '2027-04-18';

describe('moving workouts', () => {
  it('a session moved to yesterday by mistake can go back to its day', () => {
    // Thursday's intervals were moved to Wednesday 28 Oct; on Thursday it shows as missed.
    const moved = w('thu', '2026-10-28', { kind: 'intervals', key_session: true, original_date: '2026-10-29' });
    const { workouts } = reconcile([moved], [], '2026-10-29');
    const missed = workouts[0];
    expect(missed.status).toBe('missed');
    expect(canMove(missed)).toBe(true);
    expect(moveDays(missed, '2026-10-29', RACE)[0]).toBe('2026-10-29');
    expect(movePatch(missed, '2026-10-29')).toEqual({ date: '2026-10-29', original_date: null, status: 'planned', status_source: 'auto', note: null });
  });

  it('never moves into the past or past race day, whatever the date picker allows', () => {
    const b = moveBounds('2026-10-29', RACE);
    expect(inBounds('2026-10-28', b)).toBe(false);
    expect(inBounds('2026-10-29', b)).toBe(true);
    expect(inBounds(RACE, b)).toBe(false);
    expect(inBounds('', b)).toBe(false);
    expect(moveDays(w('a', '2027-04-16'), '2027-04-15', RACE)).toEqual(['2027-04-15', '2027-04-16', '2027-04-17']);
  });

  it('keeps the race and finished sessions in place', () => {
    expect(canMove(w('r', RACE, { kind: 'race' }))).toBe(false);
    expect(canMove(w('d', '2026-10-27', { status: 'completed' }))).toBe(false);
    expect(canMove(w('s', '2026-10-30', { status: 'skipped', status_source: 'user' }))).toBe(true);
  });

  it('swaps two runs and remembers where each came from', () => {
    const tue = w('tue', '2026-11-03', { kind: 'threshold', key_session: true });
    const wed = w('wed', '2026-11-04');
    expect(swapCandidate([tue, wed], tue, '2026-11-04', '2026-10-29')?.id).toBe('wed');
    expect(movePatches([tue, wed], tue, '2026-11-04', '2026-10-29', true)).toEqual([
      { id: 'tue', patch: { date: '2026-11-04', original_date: '2026-11-03', status: 'planned', status_source: 'auto', note: null } },
      { id: 'wed', patch: { date: '2026-11-03', original_date: '2026-11-04', status: 'planned', status_source: 'auto', note: null } },
    ]);
  });

  it('warns about back-to-back hard days and two runs on one day', () => {
    const tempo = w('tempo', '2026-11-03', { kind: 'threshold', key_session: true, title: 'Tempo' });
    const long = w('long', '2026-11-08', { kind: 'long', key_session: true, title: 'Long run' });
    const easy = w('easy', '2026-11-07', { title: 'Easy run' });
    const all = [tempo, long, easy];
    const warnings = moveWarnings(all, movePatches(all, tempo, '2026-11-07', '2026-10-29', false));
    expect(warnings.some((m) => m.includes('Easy run') && m.includes('two runs'))).toBe(true);
    expect(warnings.some((m) => m.includes('Long run') && m.includes('day after'))).toBe(true);
    expect(moveWarnings(all, movePatches(all, tempo, '2026-11-05', '2026-10-29', false))).toEqual([]);
  });
});
