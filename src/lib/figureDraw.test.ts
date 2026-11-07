import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../supabase/functions/_shared/exerciseCatalog';
import { moveOf } from '../../supabase/functions/_shared/exerciseMoves';
import { drawFigure, poseAt, skeletonRaw } from '../../supabase/functions/_shared/figureDraw';
import { MUSCLE_IDS, OVERLAY, bitOf, fineMuscles, musclesIn } from '../../supabase/functions/_shared/figureMuscles';

describe('muscles of the figure', () => {
  it('every muscle has a place on the body, and the bits are distinct', () => {
    expect(Object.keys(OVERLAY).sort()).toEqual([...MUSCLE_IDS].sort());
    expect(new Set(MUSCLE_IDS.map(bitOf)).size).toBe(MUSCLE_IDS.length);
  });

  it('every exercise of the catalogue has a main muscle and its secondary ones are not main too', () => {
    for (const x of CATALOG) {
      const { p, s } = fineMuscles(x.key, x.pattern);
      expect(p, x.key).not.toBe(0);
      expect(p & s, x.key).toBe(0);
    }
  });

  it('the feed move carries the masks, e.g. the bench press trains the chest first', () => {
    const m = moveOf('bench_press')!;
    expect(m.u).toBeDefined();
    expect(musclesIn(m.u![0])).toContain('chest');
    expect(musclesIn(m.u![1])).toContain('triceps');
    expect(musclesIn(moveOf('plank')!.u![0])).toEqual(['abs']);
  });
});

describe('the drawing of the figure', () => {
  it('draws every exercise at both ends of the move with finite shapes, and the muscles add shapes', { timeout: 60000 }, () => {
    for (const x of CATALOG) {
      const m = moveOf(x.key)!;
      for (const ph of [0, 0.25, 0.5, 0.75]) {
        const prims = drawFigure(m, ph);
        expect(prims.length, x.key).toBeGreaterThan(30);
        for (const p of prims) for (const v of Object.values(p)) if (typeof v === 'number') expect(Number.isFinite(v), `${x.key} ${p.t}`).toBe(true);
        for (const p of prims) if (p.t === 'poly') for (const v of p.p) expect(Number.isFinite(v), x.key).toBe(true);
      }
      expect(drawFigure(m, 0.5).length, x.key).toBeGreaterThan(drawFigure(m, 0.5, { muscles: false }).length);
    }
  });

  it('pose between key poses goes there and back', () => {
    const fr = [[0, 0, 10, 20, 0, 0, 0, 0, 0, 10, 20], [90, 0, 30, 40, 0, 0, 0, 0, 0, 30, 40]];
    expect(poseAt(fr, 0)[0]).toBe(0);
    expect(poseAt(fr, 0.5)[0]).toBe(90);
    expect(poseAt(fr, 0.25)[0]).toBeCloseTo(45, 5);
    expect(poseAt(fr, 0.999)[0]).toBeLessThan(5);
  });

  it('the pinned toe stands on the floor', () => {
    const m = moveOf('push_up')!;
    const sk = skeletonRaw(m.k[0], m.p, m.x, m.y);
    expect(sk[38 + 1]).toBeCloseTo(0, 5);
  });
});
