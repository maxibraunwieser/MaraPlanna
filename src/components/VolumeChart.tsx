import { useState } from 'react';
import type { Units } from '../lib/types';
import { toUnit } from '../lib/format';

// Palette validated with the dataviz validator (light surface): all checks pass.
const PLANNED = '#6b8fd6';
const ACTUAL = '#ea580c';

export interface VolumePoint {
  label: string;
  sublabel: string;
  plannedKm: number;
  actualKm: number | null;
  current: boolean;
}

export function VolumeChart({ data, units }: { data: VolumePoint[]; units: Units }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 32, r: 8, t: 8, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(10, ...data.map((d) => Math.max(toUnit(d.plannedKm, units), toUnit(d.actualKm ?? 0, units))));
  const step = max > 80 ? 20 : max > 40 ? 10 : 5;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const slot = innerW / data.length;
  const barW = Math.max(3, Math.min(14, (slot - 8) / 2));
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;

  const bar = (x: number, value: number, color: string) => {
    const h = (value / top) * innerH;
    if (h <= 0) return null;
    const r = Math.min(4, h, barW / 2);
    const yTop = pad.t + innerH - h;
    // Rounded data-end, square at the baseline.
    const d = `M${x},${pad.t + innerH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${pad.t + innerH} Z`;
    return <path d={d} fill={color} />;
  };

  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PLANNED }} /> Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACTUAL }} /> Actual
        </span>
        <span className="ml-auto text-slate-400">{units} / week</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly running volume, planned versus actual">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : '#eef1f5'} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.l + i * slot + (slot - (barW * 2 + 2)) / 2;
            return (
              <g key={i}>
                {d.current && <rect x={pad.l + i * slot + 1} y={pad.t} width={slot - 2} height={innerH} rx={6} fill="#fff1e6" />}
                {hover === i && !d.current && <rect x={pad.l + i * slot + 1} y={pad.t} width={slot - 2} height={innerH} rx={6} fill="#f1f5f9" />}
                {bar(x0, toUnit(d.plannedKm, units), PLANNED)}
                {d.actualKm !== null && bar(x0 + barW + 2, toUnit(d.actualKm, units), ACTUAL)}
                <text x={pad.l + i * slot + slot / 2} y={H - 18} textAnchor="middle" fontSize="10" fill={d.current ? '#0f172a' : '#64748b'} fontWeight={d.current ? 700 : 400}>
                  {d.label}
                </text>
                <text x={pad.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
                  {d.current ? 'now' : d.sublabel}
                </text>
                <rect
                  x={pad.l + i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
            style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}
          >
            <div className="font-semibold text-slate-900">
              {h.label} · {h.sublabel}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: PLANNED }} /> Planned {toUnit(h.plannedKm, units).toFixed(1)}
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-sm" style={{ background: ACTUAL }} /> Actual {h.actualKm === null ? '–' : toUnit(h.actualKm, units).toFixed(1)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
