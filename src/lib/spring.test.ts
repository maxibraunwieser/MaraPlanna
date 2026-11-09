import { describe, expect, it } from 'vitest';
import { project, rubberband, SHEET, SMOOTH, stepSpring, type SpringParams } from './spring';

/** Runs a spring until it settles; returns the path and the time it took. */
function settle(from: number, to: number, p: SpringParams, v = 0) {
  let x = from;
  let vel = v;
  const path: number[] = [];
  for (let t = 0; t < 3; t += 1 / 240) {
    [x, vel] = stepSpring(x, vel, to, p, 1 / 240);
    path.push(x);
    if (Math.abs(x - to) < 0.4 && Math.abs(vel) < 8) return { path, t };
  }
  return { path, t: Infinity };
}

describe('springs (damping ratio and response)', () => {
  it('a critically damped spring reaches the target without overshooting', () => {
    const { path, t } = settle(600, 0, SMOOTH);
    expect(t).toBeLessThan(1);
    expect(Math.min(...path)).toBeGreaterThan(-0.5);
  });

  it('the sheet spring overshoots a little after a flick, then settles', () => {
    const { path, t } = settle(200, 0, SHEET, -1500);
    expect(t).toBeLessThan(1.5);
    expect(Math.min(...path)).toBeLessThan(0);
    expect(Math.min(...path)).toBeGreaterThan(-60);
  });

  it('a shorter response is snappier', () => {
    expect(settle(600, 0, { damping: 1, response: 0.2 }).t).toBeLessThan(settle(600, 0, { damping: 1, response: 0.5 }).t);
  });
});

describe('momentum and edges', () => {
  it('projects where a flick comes to rest (faster goes further, the direction is kept)', () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(99, 0);
    expect(project(2000)).toBeGreaterThan(project(1000));
    expect(project(-1000)).toBeCloseTo(-99, 0);
  });

  it('past an edge the element follows less and less', () => {
    const a = rubberband(50, 600);
    const b = rubberband(500, 600);
    expect(a).toBeLessThan(50);
    expect(b).toBeLessThan(500);
    expect(b / 500).toBeLessThan(a / 50);
    expect(rubberband(-100, 600)).toBeLessThan(0);
  });
});
