// Fluid motion after Apple's "Designing Fluid Interfaces" (WWDC 2018): springs described by damping ratio and response (not by
// mass and stiffness), the landing point of a flick projected from its velocity, and soft (rubber-band) edges. Pure functions plus
// a small rAF driver that always starts from the current value, so any animation can be grabbed and redirected mid-flight.

export interface SpringParams {
  /** 1 = critically damped (no overshoot); below 1 overshoots a little (only after a gesture that carried momentum). */
  damping: number;
  /** Seconds to (roughly) reach the target; not a duration, the settle time follows from the physics. */
  response: number;
}

/** The default for UI: no overshoot. */
export const SMOOTH: SpringParams = { damping: 1, response: 0.35 };
/** A sheet thrown by the finger: a little bounce. */
export const SHEET: SpringParams = { damping: 0.85, response: 0.3 };

/** One step of a damped spring (mass 1), semi-implicit Euler: returns the new position and velocity (units per second). */
export function stepSpring(x: number, v: number, target: number, p: SpringParams, dt: number): [number, number] {
  const k = (2 * Math.PI / p.response) ** 2;
  const c = (4 * Math.PI * p.damping) / p.response;
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

/** Where a flick comes to rest (Apple's projection, the deceleration of scrolling): distance travelled from the release velocity (px/s). */
export function project(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past an edge the element follows less and less (rubber-banding): how far it moves for `overshoot` past the edge. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** The user asked the system for less motion. */
export const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates a value with a spring on every frame, from where it is now with the velocity it has now (pass the finger's release
 * velocity). Returns a function that stops it (to grab it again). `onDone` runs once it has settled on the target.
 */
export function animateSpring(o: { from: number; to: number; velocity?: number; params?: SpringParams; onUpdate: (x: number) => void; onDone?: () => void }): () => void {
  const p = o.params ?? SMOOTH;
  let x = o.from;
  let v = o.velocity ?? 0;
  let last = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    // small fixed steps keep the integration stable when a frame comes late
    let dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      [x, v] = stepSpring(x, v, o.to, p, h);
      dt -= h;
    }
    if (Math.abs(x - o.to) < 0.4 && Math.abs(v) < 8) {
      o.onUpdate(o.to);
      o.onDone?.();
      return;
    }
    o.onUpdate(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
