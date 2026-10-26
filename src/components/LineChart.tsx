import { useState, type MouseEvent } from 'react';

export interface LinePoint {
  x: number;
  y: number;
}

/**
 * Single-series line chart with a crosshair tooltip. `invert` puts small values
 * at the top (pace: faster = higher). An optional band marks the target range.
 */
export function LineChart({
  points,
  color,
  height = 140,
  invert,
  band,
  formatY,
  formatX,
  label,
}: {
  points: LinePoint[];
  color: string;
  height?: number;
  invert?: boolean;
  band?: [number, number] | null;
  formatY: (v: number) => string;
  formatX: (v: number) => string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 8, t: 8, b: 20 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const sorted = [...ys].sort((a, b) => a - b);
  // Robust y-range: ignore the most extreme 2 % (GPS spikes, stops).
  let lo = sorted[Math.floor(sorted.length * 0.02)];
  let hi = sorted[Math.ceil(sorted.length * 0.98) - 1];
  if (band) {
    lo = Math.min(lo, band[0]);
    hi = Math.max(hi, band[1]);
  }
  const span = Math.max(1, hi - lo);
  lo -= span * 0.08;
  hi += span * 0.08;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => {
    const c = Math.min(hi, Math.max(lo, y));
    const f = (c - lo) / (hi - lo);
    return pad.t + (invert ? f : 1 - f) * (H - pad.t - pad.b);
  };
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const xTicks = [0.25, 0.5, 0.75, 1].map((f) => x0 + (x1 - x0) * f);
  const h = hover !== null ? points[hover] : null;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = x0 + ((e.clientX - rect.left) / rect.width) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
    setHover(best);
  };

  return (
    <div className="relative">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {band && (
          <rect
            x={pad.l}
            width={W - pad.l - pad.r}
            y={Math.min(sy(band[0]), sy(band[1]))}
            height={Math.abs(sy(band[0]) - sy(band[1]))}
            fill={color}
            opacity={0.1}
          />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#eef1f5" />
            <text x={pad.l - 6} y={sy(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={H - 5} textAnchor="end" fontSize="10" fill="#94a3b8">
            {formatX(t)}
          </text>
        ))}
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {h && (
          <>
            <line x1={sx(h.x)} x2={sx(h.x)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={sx(h.x)} cy={sy(h.y)} r={4} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-5 z-10 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-slate-200"
          style={{ left: `${(sx(h.x) / W) * 100}%` }}
        >
          <span className="font-semibold text-slate-900">{formatY(h.y)}</span>
          <span className="text-slate-500"> · {formatX(h.x)}</span>
        </div>
      )}
    </div>
  );
}
