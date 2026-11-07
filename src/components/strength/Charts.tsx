import { useState } from 'react';
import type { WeekVolume } from '../../lib/strengthStats';
import { fmtDate, fmtNum } from '../../lib/format';
import { tr } from '../../lib/i18n';
import { numberText } from '../../lib/i18n/dates';
import { currentLang } from '../../lib/i18n';
import { cx } from '../ui';

const ORANGE = '#ea580c';
const BLUE = '#6b8fd6';

export interface ProgressPoint {
  date: string;
  value: number;
  /** Shown in the tooltip, e.g. "62.5 × 5, 62.5 × 5, 60 × 6". */
  detail?: string;
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** A "nice" step for the axis (1, 2, 2.5, 5, 10 × 10ⁿ). */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Development of one exercise over time: a dot per session on a real time axis, the line through them, the best session
 * ringed. Hover shows the date and the sets.
 */
export function ProgressChart({ points, unit, height = 220, color = ORANGE }: { points: ProgressPoint[]; unit: string; height?: number; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const W = 640;
  const H = height;
  const pad = { l: 46, r: 14, t: 14, b: 26 };
  const xs = points.map((p) => dayNumber(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const ys = points.map((p) => p.value);
  const lo0 = Math.min(...ys);
  const hi0 = Math.max(...ys);
  const step = niceStep(Math.max(hi0 - lo0, hi0 * 0.1, 1), 4);
  const lo = Math.max(0, Math.floor((lo0 - step * 0.4) / step) * step);
  const hi = Math.ceil((hi0 + step * 0.4) / step) * step;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(xs[xs.length - 1]).toFixed(1)},${H - pad.b} L${sx(xs[0]).toFixed(1)},${H - pad.b} Z`;
  const best = ys.indexOf(hi0);
  const id = `grad-${color.replace('#', '')}`;
  const tip = hover !== null ? points[hover] : null;
  const tx = hover !== null ? sx(xs[hover]) : 0;
  const xTicks = points.length > 1 ? [0, 0.5, 1].map((f) => new Date((x0 + (x1 - x0) * f) * 86_400_000).toISOString().slice(0, 10)) : [points[0].date];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tr('ch.progress')}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 8} y={sy(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="11">{fmtNum(t, 2)}</text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={d + i} x={sx(dayNumber(d))} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 && xTicks.length > 1 ? 'end' : 'middle'} className="fill-slate-400" fontSize="11">
            {fmtDate(d, { day: 'numeric', month: 'short' })}
          </text>
        ))}
        {points.length > 1 && <path d={area} fill={`url(#${id})`} />}
        {points.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.date + i}>
            {i === best && <circle cx={sx(xs[i])} cy={sy(p.value)} r="9" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="2" />}
            <circle cx={sx(xs[i])} cy={sy(p.value)} r={hover === i ? 6 : 4.5} fill="#fff" stroke={color} strokeWidth="2.5" />
          </g>
        ))}
        {points.map((_, i) => (
          <rect
            key={`h${i}`}
            x={sx(xs[i]) - Math.max(10, (W - pad.l - pad.r) / points.length / 2)}
            y={pad.t}
            width={Math.max(20, (W - pad.l - pad.r) / points.length)}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
          />
        ))}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute top-1 z-10 max-w-56 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${Math.min(78, Math.max(2, (tx / W) * 100 - 8))}%` }}
        >
          <div className="font-semibold">{fmtDate(tip.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <div className="text-lg font-bold leading-tight">{fmtNum(tip.value)} <span className="text-xs font-medium text-slate-300">{unit}</span></div>
          {tip.detail && <div className="mt-0.5 text-slate-300">{tip.detail}</div>}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for the list of lifts. */
export function Sparkline({ values, color = ORANGE, className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return <div className={cx('h-8 w-24 rounded bg-slate-100', className)} />;
  const W = 96;
  const H = 32;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const sx = (i: number) => 3 + (i / (values.length - 1)) * (W - 6);
  const sy = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx('h-8 w-24', className)} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r="3" fill={color} />
    </svg>
  );
}

/** Training volume per week (tonnage). */
export function WeekBars({ weeks, unitLabel, convert }: { weeks: WeekVolume[]; unitLabel: string; convert: (kg: number) => number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 170;
  const pad = { l: 40, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...weeks.map((w) => convert(w.volume)));
  const step = niceStep(max, 3);
  const top = Math.ceil(max / step) * step;
  const slot = (W - pad.l - pad.r) / weeks.length;
  const bw = Math.max(6, Math.min(26, slot - 8));
  const sy = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const tip = hover !== null ? weeks[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tr('ch.volume')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="11">{t >= 1000 ? `${fmtNum(t / 1000)}k` : fmtNum(t)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const v = convert(w.volume);
          const x = pad.l + slot * i + (slot - bw) / 2;
          const h = Math.max(0, ((H - pad.t - pad.b) * v) / top);
          const current = i === weeks.length - 1;
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <rect x={x} y={sy(v)} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={current ? ORANGE : BLUE} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {(i % 2 === weeks.length % 2 || weeks.length < 8) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
                  {fmtDate(w.weekStart, { day: 'numeric', month: 'numeric' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg">
          <div className="font-semibold">{tr('ch.weekOf', { date: fmtDate(tip.weekStart, { day: 'numeric', month: 'short' }) })}</div>
          <div>{tr('ch.tip', { vol: numberText(Math.round(convert(tip.volume)), currentLang()), unit: unitLabel, sets: tip.sets, sessions: tr(tip.sessions === 1 ? 'ch.session1' : 'ch.sessionN', { n: tip.sessions }) })}</div>
        </div>
      )}
    </div>
  );
}
