// A body from the front and the back with the muscles a workout trains in colour: its main muscles in red, the others it works
// in orange (the colours of the exercise figures).

import { memo } from 'react';
import { MUSCLES, muscleLabel, type Muscle, type MuscleLoad } from '../../lib/exerciseInfo';
import { useI18n } from '../../lib/i18n';
import { cx } from '../ui';

const BODY = '#64748b';
const COLOR: Record<MuscleLoad, string> = { primary: '#d62828', secondary: '#ee7b5e' };

type Shape = { e: [number, number, number, number, number?] } | { d: string };
/** The muscles as shapes on a figure 50 wide; `x` moves them to the figure (25 = front, 75 = back). */
const FRONT: Partial<Record<Muscle, Shape[]>> = {
  shoulders: [{ e: [17.4, 16.6, 2.7, 2.5] }, { e: [32.6, 16.6, 2.7, 2.5] }],
  chest: [{ e: [22.3, 20.2, 3.5, 2.8] }, { e: [27.7, 20.2, 3.5, 2.8] }],
  biceps: [{ e: [15.6, 23.4, 1.7, 4.1, -12] }, { e: [34.4, 23.4, 1.7, 4.1, 12] }],
  core: [{ d: 'M22.4,24.6 h5.2 a1.4,1.4 0 0 1 1.4,1.4 v11.6 a2.6,2.6 0 0 1 -2.6,2.6 h-2.8 a2.6,2.6 0 0 1 -2.6,-2.6 v-11.6 a1.4,1.4 0 0 1 1.4,-1.4 z' }],
  quads: [{ e: [21.8, 60, 2.9, 8.6, 2] }, { e: [28.2, 60, 2.9, 8.6, -2] }],
};
const BACK: Partial<Record<Muscle, Shape[]>> = {
  shoulders: [{ e: [17.4, 16.6, 2.7, 2.5] }, { e: [32.6, 16.6, 2.7, 2.5] }],
  back: [{ d: 'M25,13.6 L20.4,17 L25,23.4 L29.6,17 Z' }, { e: [21.6, 26, 3.2, 6.6, 8] }, { e: [28.4, 26, 3.2, 6.6, -8] }],
  triceps: [{ e: [15.6, 23.4, 1.7, 4.1, -12] }, { e: [34.4, 23.4, 1.7, 4.1, 12] }],
  glutes: [{ e: [22.6, 47.4, 3.2, 3] }, { e: [27.4, 47.4, 3.2, 3] }],
  hamstrings: [{ e: [21.8, 60.6, 2.8, 8.2, 2] }, { e: [28.2, 60.6, 2.8, 8.2, -2] }],
  calves: [{ e: [21.6, 79, 2.2, 6] }, { e: [28.4, 79, 2.2, 6] }],
};

/** The figure itself (head, trunk, arms, legs), drawn around x = 25. */
function Body({ x }: { x: number }) {
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number) => <line x1={x1 + x} y1={y1} x2={x2 + x} y2={y2} stroke={BODY} strokeWidth={w} strokeLinecap="round" />;
  return (
    <g>
      <circle cx={25 + x} cy={7} r={4.6} fill={BODY} />
      <path d={`M${17 + x},14.2 C${19 + x},12.6 ${31 + x},12.6 ${33 + x},14.2 L${32 + x},30 C${31.2 + x},36 ${30.2 + x},40 ${29.6 + x},44.5 L${20.4 + x},44.5 C${19.8 + x},40 ${18.8 + x},36 ${18 + x},30 Z`} fill={BODY} />
      <path d={`M${20.2 + x},43.5 L${29.8 + x},43.5 L${31.2 + x},51 L${18.8 + x},51 Z`} fill={BODY} />
      {limb(17.4, 15.6, 14.2, 29, 4.2)}
      {limb(14.2, 29, 12.8, 41, 3.3)}
      {limb(32.6, 15.6, 35.8, 29, 4.2)}
      {limb(35.8, 29, 37.2, 41, 3.3)}
      {limb(22, 50, 21.6, 71, 6)}
      {limb(21.6, 71, 21.6, 93, 4.4)}
      {limb(28, 50, 28.4, 71, 6)}
      {limb(28.4, 71, 28.4, 93, 4.4)}
    </g>
  );
}

function Muscles({ shapes, load, x }: { shapes: Partial<Record<Muscle, Shape[]>>; load: Partial<Record<Muscle, MuscleLoad>>; x: number }) {
  return (
    <g>
      {MUSCLES.flatMap((m) =>
        load[m] && shapes[m]
          ? shapes[m]!.map((s, i) =>
              'd' in s ? (
                <path key={`${m}${i}`} d={s.d} transform={`translate(${x} 0)`} fill={COLOR[load[m]!]} />
              ) : (
                <ellipse key={`${m}${i}`} cx={s.e[0] + x} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} transform={s.e[4] ? `rotate(${s.e[4]} ${s.e[0] + x} ${s.e[1]})` : undefined} fill={COLOR[load[m]!]} />
              ),
            )
          : [],
      )}
    </g>
  );
}

/** Front and back of a body with the trained muscles in colour. */
export const MuscleMap = memo(function MuscleMap({ load, className }: { load: Partial<Record<Muscle, MuscleLoad>>; className?: string }) {
  const { t } = useI18n();
  const main = MUSCLES.filter((m) => load[m] === 'primary').map(muscleLabel);
  const also = MUSCLES.filter((m) => load[m] === 'secondary').map(muscleLabel);
  const label = main.length ? t('mm.label', { main: main.join(', '), also: also.length ? also.join(', ') : '–' }) : t('mm.none');
  return (
    <svg viewBox="0 0 100 96" className={cx('h-auto', className ?? 'w-full')} role="img" aria-label={label} data-testid="muscle-map">
      <title>{label}</title>
      <Body x={0} />
      <Muscles shapes={FRONT} load={load} x={0} />
      <Body x={50} />
      <Muscles shapes={BACK} load={load} x={50} />
    </svg>
  );
});

/** The muscles of a workout as small labels: main ones first. */
export function MuscleLegend({ load, className }: { load: Partial<Record<Muscle, MuscleLoad>>; className?: string }) {
  const list = (['primary', 'secondary'] as const).flatMap((k) => MUSCLES.filter((m) => load[m] === k).map((m) => ({ m, k })));
  if (!list.length) return null;
  return (
    <span className={cx('flex flex-wrap gap-1', className)}>
      {list.map(({ m, k }) => (
        <span key={m} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR[k] }} />
          {muscleLabel(m)}
        </span>
      ))}
    </span>
  );
}
