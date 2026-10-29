import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ProjectionPoint } from '../lib/projection';
import { daysBetween } from '../lib/planner/dates';
import { fmtDate } from '../lib/format';

// Same validated pair as the volume chart: plan = blue, what you actually ran = orange.
const TRAINING = '#ea580c';
const PLAN = '#6b8fd6';
const GOAL = '#94a3b8';

/** Marathon time as h:mm. */
export const hm = (s: number) => {
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Marathon projection per week. Faster times are higher, so improvement goes up.
 * Training-based estimate as a line, the plan's race-day projection as steps
 * (it only changes when VDOT is updated), the goal as a dashed reference.
 */
export function ProjectionChart({ points, goalS, planStart }: { points: ProjectionPoint[]; goalS: number | null; planStart: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return <p className="py-8 text-center text-sm text-slate-500">Not enough data yet – the chart fills in week by week.</p>;

  // Drawn 1:1 at the container width so labels keep their size on small screens.
  const W = Math.max(300, width);
  const H = W < 480 ? 220 : 240;
  const pad = { l: 44, r: 52, t: 14, b: 24 };
  const t0 = points[0].date;
  const span = Math.max(1, daysBetween(t0, points[points.length - 1].date));
  const sx = (d: string) => pad.l + (daysBetween(t0, d) / span) * (W - pad.l - pad.r);

  const values = points.flatMap((p) => [p.tandaS, p.planS]).filter((v): v is number => v !== null);
  if (goalS) values.push(goalS);
  const step = [300, 600, 900, 1800, 3600].find((s) => (Math.max(...values) - Math.min(...values)) / s <= 4) ?? 3600;
  const lo = Math.floor((Math.min(...values) - step * 0.3) / step) * step;
  const hi = Math.ceil((Math.max(...values) + step * 0.3) / step) * step;
  // Inverted: fast (small) at the top.
  const sy = (s: number) => pad.t + ((s - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  const linePath = (key: 'tandaS' | 'planS', stepped: boolean) => {
    let d = '';
    let prev: { x: number; y: number } | null = null;
    for (const p of points) {
      const v = p[key];
      if (v === null) {
        prev = null;
        continue;
      }
      const x = sx(p.date);
      const y = sy(v);
      if (!prev) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
      else if (stepped) d += `H${x.toFixed(1)}V${y.toFixed(1)}`;
      else d += `L${x.toFixed(1)},${y.toFixed(1)}`;
      prev = { x, y };
    }
    return d;
  };

  const months = points.filter((p, i) => i === 0 || p.date.slice(0, 7) !== points[i - 1].date.slice(0, 7));
  const last = points[points.length - 1];
  const lastOf = (key: 'tandaS' | 'planS') => [...points].reverse().find((p) => p[key] !== null) ?? null;
  // Direct labels at the right edge, nudged apart if they would collide.
  const ends = (
    [
      { key: 'tandaS' as const, color: TRAINING },
      { key: 'planS' as const, color: PLAN },
    ]
      .map((s) => ({ ...s, p: lastOf(s.key) }))
      .filter((s) => s.p && s.p.date === last.date) as { key: 'tandaS' | 'planS'; color: string; p: ProjectionPoint }[]
  ).map((s) => ({ ...s, y: sy(s.p[s.key]!) }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 12) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const [a, b] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
    a.y = mid - 6;
    b.y = mid + 6;
  }

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = pad.l + ((e.clientX - rect.left) / rect.width) * (W - pad.l - pad.r);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(sx(points[i].date) - x) < Math.abs(sx(points[best].date) - x)) best = i;
    setHover(best);
  };
  const h = hover !== null ? points[hover] : null;
  const startX = planStart > t0 ? sx(planStart) : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: TRAINING }} /> Training-based
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: PLAN }} /> Race-day projection
        </span>
        {goalS && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: GOAL }} /> Goal
          </span>
        )}
        <span className="ml-auto text-slate-400">faster ↑</span>
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Marathon projection per week">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#eef1f5" />
              <text x={pad.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                {hm(t)}
              </text>
            </g>
          ))}
          {months.map((p) => (
            <text key={p.date} x={sx(p.date)} y={H - 6} textAnchor="start" fontSize="10" fill="#94a3b8">
              {fmtDate(p.date, { month: 'short' })}
            </text>
          ))}
          {startX !== null && (
            <g>
              <line x1={startX} x2={startX} y1={pad.t} y2={H - pad.b} stroke="#cbd5e1" strokeDasharray="2 3" />
              <text x={startX + 4} y={pad.t + 8} fontSize="10" fill="#94a3b8">
                Plan start
              </text>
            </g>
          )}
          {goalS && (
            <g>
              <line x1={pad.l} x2={W - pad.r} y1={sy(goalS)} y2={sy(goalS)} stroke={GOAL} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={W - pad.r + 6} y={sy(goalS) + 3} fontSize="10" fill="#64748b">
                Goal {hm(goalS)}
              </text>
            </g>
          )}
          <path d={linePath('planS', true)} fill="none" stroke={PLAN} strokeWidth={2} strokeLinejoin="round" />
          <path d={linePath('tandaS', false)} fill="none" stroke={TRAINING} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {ends.map((s) => (
            <g key={s.key}>
              <circle cx={sx(s.p.date)} cy={sy(s.p[s.key]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              <text x={W - pad.r + 6} y={s.y + 3} fontSize="11" fontWeight={600} fill="#334155">
                {hm(s.p[s.key]!)}
              </text>
            </g>
          ))}
          {h && (
            <g>
              <line x1={sx(h.date)} x2={sx(h.date)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeDasharray="3 3" />
              {h.planS !== null && <circle cx={sx(h.date)} cy={sy(h.planS)} r={4.5} fill={PLAN} stroke="#fff" strokeWidth={2} />}
              {h.tandaS !== null && <circle cx={sx(h.date)} cy={sy(h.tandaS)} r={4.5} fill={TRAINING} stroke="#fff" strokeWidth={2} />}
            </g>
          )}
          <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onMove} />
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
            style={{ left: `${Math.min(85, Math.max(15, (sx(h.date) / W) * 100))}%` }}
          >
            <div className="font-semibold text-slate-900">{h.date === last.date ? 'Today' : `Week to ${fmtDate(h.date, { day: 'numeric', month: 'short' })}`}</div>
            <div className="mt-1 flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: TRAINING }} /> Training-based {h.tandaS !== null ? hm(h.tandaS) : '–'}
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: PLAN }} /> Race-day {h.planS !== null ? hm(h.planS) : '–'}
            </div>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-slate-400">
              <th className="py-1 font-medium">Week to</th>
              <th className="py-1 font-medium">Training-based</th>
              <th className="py-1 font-medium">Race-day</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date} className="border-t border-slate-100 text-slate-700">
                <td className="py-1">{fmtDate(p.date, { day: 'numeric', month: 'short' })}</td>
                <td className="py-1">{p.tandaS !== null ? hm(p.tandaS) : '–'}</td>
                <td className="py-1">{p.planS !== null ? hm(p.planS) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
