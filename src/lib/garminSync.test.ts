import { describe, expect, it } from 'vitest';
import { goneActivities, MASS_REMOVAL_MIN } from '../../supabase/functions/_shared/garminSync.ts';

const stored = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, external_id: `g${i}` }));
const seenOf = (ids: number[]) => new Set(ids.map((i) => `g${i}`));

describe('activities deleted in Garmin Connect', () => {
  it('removes what Garmin no longer lists', () => {
    expect(goneActivities(stored(6), seenOf([0, 1, 2, 4, 5]), false)).toEqual({ ids: ['id3'] });
  });

  it('removes nothing when everything is still listed (also a new activity we do not have yet)', () => {
    expect(goneActivities(stored(4), seenOf([0, 1, 2, 3, 9]), false)).toEqual({ ids: [] });
    expect(goneActivities([], seenOf([1, 2]), false)).toEqual({ ids: [] });
  });

  it('a single deletion, even of the only activity, is carried over', () => {
    expect(goneActivities(stored(1), seenOf([]), false)).toEqual({ ids: ['id0'] });
    expect(goneActivities(stored(3), seenOf([]), false).ids).toHaveLength(3);
  });

  it('an incomplete list (paging limit) never removes anything', () => {
    const r = goneActivities(stored(6), seenOf([0]), true);
    expect(r.ids).toEqual([]);
    expect(r.warning).toMatch(/cut off/);
  });

  it('a mass disappearance looks like a Garmin hiccup and is not applied', () => {
    const r = goneActivities(stored(10), seenOf([]), false);
    expect(r.ids).toEqual([]);
    expect(r.warning).toMatch(/nothing was removed/);
    // a larger clean-up that is less than half of what is stored is fine
    expect(goneActivities(stored(20), seenOf(Array.from({ length: 20 - MASS_REMOVAL_MIN }, (_, i) => i)), false).ids).toHaveLength(MASS_REMOVAL_MIN);
  });
});
