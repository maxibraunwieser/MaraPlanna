import { describe, expect, it } from 'vitest';
import { draw, FRAME_H, FRAME_W } from './exerciseArt';
import { ART } from './exerciseArtData';
import { MUSCLES, catalogOf, library, musclesOf, musclesOfExercise, primaryMuscle } from './exerciseInfo';
import { CATALOG, available, type Setup } from './strengthPlan';
import { LIBRARY } from '../../supabase/functions/_shared/exerciseLibrary';

const setup = (over: Partial<Setup> = {}): Setup => ({ equipment: null, gear: ['barbell', 'dumbbell', 'bench', 'rack', 'pullup', 'cable', 'machines', 'kettlebell', 'bands'], avoid: [], goal: null, level: 'experienced', minutes: 60, ...over });

describe('the pictures of the exercises', () => {
  it('every exercise of the catalogue has one, and nothing else is drawn', () => {
    // the library of docs/uebungen/liste.txt has its own moves (see exerciseLibraryMoves.ts, tested in exerciseLibrary.test.ts)
    const first = CATALOG.filter((x) => !LIBRARY.some((l) => l.key === x.key));
    expect(first.filter((x) => !ART[x.key]).map((x) => x.key)).toEqual([]);
    expect(Object.keys(ART).filter((k) => !CATALOG.some((x) => x.key === k))).toEqual([]);
  });

  it('every picture is a finished drawing inside its frame', () => {
    for (const x of CATALOG.filter((c) => ART[c.key])) {
      const d = draw(ART[x.key]);
      for (const f of d.frames) {
        expect(f.prims.length, x.key).toBeGreaterThan(6);
        for (const p of f.prims) {
          const values = p.t === 'line' ? [p.x1, p.y1, p.x2, p.y2, p.w] : p.t === 'circle' ? [p.x, p.y, p.r] : p.pts.flat();
          for (const v of values) expect(Number.isFinite(v), `${x.key} ${p.t}`).toBe(true);
          if (p.t === 'line' && p.c !== 'floor' && p.c !== 'gear' && p.c !== 'light') {
            for (const [px, py] of [[p.x1, p.y1], [p.x2, p.y2]]) {
              expect(px, `${x.key} x`).toBeGreaterThan(-1);
              expect(px, `${x.key} x`).toBeLessThan(FRAME_W + 1);
              expect(py, `${x.key} y`).toBeGreaterThan(-1);
              expect(py, `${x.key} y`).toBeLessThan(FRAME_H + 1);
            }
          }
        }
      }
    }
  });

  it('the start and the end of a moving exercise differ; a held one shows one picture', () => {
    for (const x of CATALOG.filter((c) => ART[c.key])) {
      const same = JSON.stringify(ART[x.key].a) === JSON.stringify(ART[x.key].b);
      expect(same, x.key).toBe(!!ART[x.key].still);
    }
  });
});

describe('what an exercise trains', () => {
  it('every exercise trains at least one muscle, the main one first', () => {
    for (const x of CATALOG) {
      expect(musclesOfExercise(x).length, x.key).toBeGreaterThan(0);
      expect(MUSCLES).toContain(primaryMuscle(x));
    }
    expect(musclesOf('back_squat')[0]).toBe('quads');
    expect(musclesOf('bench_press')[0]).toBe('chest');
    expect(musclesOf('pull_up')[0]).toBe('back');
    expect(musclesOf('hip_thrust')[0]).toBe('glutes');
    expect(musclesOf('pushdown')).toEqual(['triceps']);
    expect(catalogOf({ name: 'Back squat' })?.key).toBe('back_squat');
    expect(catalogOf({ key: '', name: 'my own thing' })).toBeUndefined();
  });
});

describe('the list of all exercises', () => {
  const keys = (l: ReturnType<typeof library>) => [...l.same, ...l.others.flatMap((g) => g.items)].map((x) => x.key);

  it('has only what the person can do', () => {
    const body = setup({ equipment: 'bodyweight', gear: [] });
    const l = library(body, { focus: [] });
    expect(keys(l).length).toBeGreaterThan(10);
    for (const k of keys(l)) expect(available(CATALOG.find((x) => x.key === k)!, body), k).toBe(true);
    expect(keys(l)).not.toContain('back_squat');
    expect(keys(l)).not.toContain('leg_press');
    // machines only: no free weights
    const machines = library(setup({ equipment: 'machines', gear: ['machines', 'cable'] }), { focus: [] });
    expect(keys(machines)).toContain('leg_press');
    expect(keys(machines)).not.toContain('back_squat');
    expect(keys(machines)).not.toContain('goblet_squat');
    // what needs care and what was left out
    expect(keys(library(setup({ avoid: ['knee'] }), { focus: [] }))).not.toContain('bulgarian');
    expect(keys(library(setup({ excluded: ['push_up'] }), { focus: [] }))).not.toContain('push_up');
    // what is in the workout already is not offered again
    expect(keys(library(setup(), { focus: [], taken: ['push_up'] }))).not.toContain('push_up');
  });

  it('puts the exercises for the muscles of the workout first', () => {
    const l = library(setup(), { focus: ['chest', 'back'] });
    expect(l.same.length).toBeGreaterThan(5);
    expect(l.same.every((x) => ['chest', 'back'].includes(primaryMuscle(x)))).toBe(true);
    expect(l.others.every((g) => !['chest', 'back'].includes(g.muscle))).toBe(true);
    // chest before back, as in the workout
    const firstBack = l.same.findIndex((x) => primaryMuscle(x) === 'back');
    expect(l.same.slice(0, firstBack).every((x) => primaryMuscle(x) === 'chest')).toBe(true);
    // everything is still there
    expect(keys(l).length).toBe(keys(library(setup(), { focus: [] })).length);
  });

  it('searches in the name and filters by muscle', () => {
    const squat = keys(library(setup(), { focus: [], query: 'squat' }));
    expect(squat).toContain('back_squat');
    expect(squat).toContain('goblet_squat');
    expect(squat).not.toContain('bench_press');
    // by a muscle, too
    expect(keys(library(setup(), { focus: [], query: 'glutes' }))).toContain('hip_thrust');
    const calves = library(setup(), { focus: [], muscle: 'calves' });
    expect(keys(calves).length).toBeGreaterThan(0);
    expect(keys(calves).every((k) => musclesOf(k).includes('calves'))).toBe(true);
  });
});
