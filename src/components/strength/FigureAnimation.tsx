// The animated figure of an exercise: the same figure, the same moves and the same coloured muscles as on the watch.

import { memo, useEffect, useMemo, useState } from 'react';
import { COLOR, drawFigure, type FigurePrim, type Move2 } from '../../lib/figure';

const css = (c: number): string => {
  // the floor and its shadow are drawn for the dark watch screen: lighter here
  if (c === COLOR.FLOOR) return '#cbd5e1';
  if (c === COLOR.SHADOW) return '#e2e8f0';
  return `#${c.toString(16).padStart(6, '0')}`;
};

const Prims = ({ prims }: { prims: FigurePrim[] }) => (
  <>
    {prims.map((p, i) =>
      p.t === 'poly' ? (
        <polygon key={i} points={p.p.reduce<string[]>((a, v, j) => (j % 2 ? ((a[a.length - 1] += `,${v}`), a) : [...a, `${v}`]), []).join(' ')} fill={css(p.c)} />
      ) : p.t === 'disc' ? (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={css(p.c)} />
      ) : p.t === 'ring' ? (
        <circle key={i} cx={p.x} cy={p.y} r={p.r - p.w / 2} fill="none" stroke={css(p.c)} strokeWidth={p.w} />
      ) : p.t === 'line' ? (
        <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={css(p.c)} strokeWidth={p.w} strokeLinecap="butt" />
      ) : (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={css(p.c)} />
      ),
    )}
  </>
);

const reduced = (): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `animate` runs the repetition in a loop; otherwise the figure stands in `phase` (0 start, 0.5 end). */
export const FigureAnimation = memo(function FigureAnimation({ move, label, animate = true, phase = 0.5, className }: { move: Move2; label: string; animate?: boolean; phase?: number; className?: string }) {
  const [ph, setPh] = useState(phase);
  useEffect(() => {
    if (!animate || reduced()) {
      setPh(phase);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setPh((((now - t0) % move.ms) + move.ms) / move.ms % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, phase, move]);
  const prims = useMemo(() => drawFigure(move, ph), [move, ph]);
  const [l, t, r, b] = move.v;
  return (
    <svg viewBox={`${l} ${t} ${r - l} ${b - t + 2}`} className={className ?? 'h-full w-full'} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <title>{label}</title>
      <Prims prims={prims} />
    </svg>
  );
});
