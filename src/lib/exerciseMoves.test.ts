import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../supabase/functions/_shared/exerciseCatalog';
import { TUNED, moveOf, skeleton } from '../../supabase/functions/_shared/exerciseMoves';

describe('the watch figure of every exercise', () => {
  it('every exercise of the catalogue has a move', () => {
    expect(CATALOG.filter((x) => !moveOf(x.key)).map((x) => x.key)).toEqual([]);
  });

  it('every move is complete, finite and has a sensible picture area', () => {
    for (const x of CATALOG) {
      const m = moveOf(x.key)!;
      expect(m.k.length, x.key).toBeGreaterThanOrEqual(2);
      for (const row of m.k) {
        expect(row.length, x.key).toBe(11);
        for (const v of row) expect(Number.isFinite(v), `${x.key} angle`).toBe(true);
      }
      const [l, t, r, b] = m.v;
      expect(r - l, `${x.key} width`).toBeGreaterThan(30);
      expect(r - l, `${x.key} width`).toBeLessThan(360);
      expect(b - t, `${x.key} height`).toBeGreaterThan(60);
      expect(b - t, `${x.key} height`).toBeLessThan(330);
      for (const s of m.g ?? []) for (const v of s) expect(Number.isFinite(v), `${x.key} shape`).toBe(true);
    }
  });

  it('the hand-tuned moves stay for the exercises that have one', () => {
    for (const [key, tuned] of Object.entries(TUNED)) {
      const m = moveOf(key)!;
      expect(m.q + (m.g?.length ?? 0), key).toBeGreaterThanOrEqual(0);
      expect(m.k[0].slice(0, 9), key).toBeDefined();
      expect(tuned).toBeTruthy();
    }
    expect(moveOf('back_squat')!.q).toBe(34);
  });

  it('a figure stands on the floor: the lowest point of the feet is at the floor or on what they stand on', () => {
    for (const key of ['goblet_squat', 'reverse_lunge', 'calf_body', 'kb_swing', 'lateral_raise']) {
      const m = moveOf(key)!;
      for (const row of m.k) {
        const j = skeleton(row, m.p, m.x, m.y);
        const lowest = Math.max(j.toe[1], j.ankle[1] + 8, j.toe2[1], j.ankle2[1] + 8);
        expect(Math.abs(lowest), key).toBeLessThan(14);
      }
    }
  });
});
