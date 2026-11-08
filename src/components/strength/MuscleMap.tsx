// A body from the front and the back, drawn as clean line art with every muscle outlined; the muscles a workout trains are
// filled: its main muscles in red, the others it works in light red. The figure is our own drawing (point lists turned into
// smooth outlines, the left half mirrored to the right).

import { memo } from 'react';
import { MUSCLES, muscleLabel, type Muscle, type MuscleLoad } from '../../lib/exerciseInfo';
import { useI18n } from '../../lib/i18n';
import { cx } from '../ui';

const SKIN = '#f1f5f9';
const OUTLINE = '#475569';
const LINE = '#64748b';
const FILL: Record<MuscleLoad, string> = { primary: '#dc2626', secondary: '#fca5a5' };

type Pt = [number, number];
type Part = [Muscle | null, Pt[]];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A smooth outline through the points (Catmull-Rom as cubic Bézier curves). */
function smooth(pts: Pt[], closed = true, t = 0.5): string {
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) * t) / 3, p1[1] + ((p2[1] - p0[1]) * t) / 3];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * t) / 3, p2[1] - ((p3[1] - p1[1]) * t) / 3];
    d += ` C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(p2[0])},${r1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [100 - x, y] as Pt);

// The figure is 100 wide and 228 high; these are its left half (the viewer's left).
const BODY: Pt[] = [
  [45.5, 26], [45, 32], [41, 36.5], [35, 39], [29.5, 40.5], [25, 43], [22.4, 48], [21.6, 55], [20.6, 64], [19.4, 74], [18.6, 84],
  [17.4, 90], [16, 98], [14.6, 108], [13.8, 118], [13.4, 126], [12.4, 132], [12.2, 139], [14, 144.5], [16.6, 143], [17.6, 137],
  [18, 130], [19, 124], [20.6, 114], [22.2, 104], [23.6, 96], [24.6, 90], [26, 80], [27.4, 70], [28.6, 64], [30.2, 62.5], [31, 70],
  [31.8, 80], [33, 92], [34, 100], [32.8, 106], [31, 114], [30, 124], [30, 136], [31, 148], [32.6, 158], [33.6, 165], [33, 172],
  [32.2, 180], [32.6, 190], [34.4, 200], [36, 208], [35.2, 214], [36.2, 219], [42.4, 219.6], [43.8, 216.2], [43, 208], [42.8, 200],
  [44, 190], [44.6, 180], [44, 172], [44.6, 165], [45.6, 154], [46.8, 142], [48, 130], [50, 124],
];

const ARM_UPPER: Pt[] = [[28.2, 60.6], [24.8, 60], [22.2, 64.6], [20.8, 73], [20.2, 82], [22.2, 88.4], [25, 84.6], [26.8, 74], [27.6, 66]];
const FOREARM: Pt[] = [[21.6, 91.2], [18, 92.4], [16, 101], [14.8, 112], [14.6, 122], [17.8, 123], [19.6, 113], [21.6, 103], [23.4, 95]];

const FRONT: Part[] = [
  ['back', [[44.6, 31.6], [43.4, 36], [38, 38.6], [31.6, 40.4], [37.6, 36.6]]], // upper trapezius
  ['shoulders', [[35.4, 40.2], [29.6, 40.8], [25.2, 43.4], [23, 48.6], [22.6, 55.6], [24.6, 59], [27.6, 55], [30.4, 48.4], [33, 44]]],
  ['chest', [[49, 43.4], [42.6, 41.4], [36.4, 41.4], [31.6, 46], [29.8, 53.6], [31.6, 60.2], [37.2, 63.2], [44, 62.8], [49, 60.6]]],
  ['biceps', ARM_UPPER],
  [null, FOREARM],
  ['core', [[31.4, 63.2], [30.8, 70], [31.6, 80], [32.8, 91], [36.6, 97], [38.6, 88], [37.6, 76], [35.6, 65.4]]], // obliques
  ['core', [[49, 65], [41.4, 65.2], [39, 72], [38.8, 84], [40.2, 96], [43.8, 103.6], [49, 106]]], // abdominals
  [null, [[48.6, 110], [44, 112], [40.6, 120], [42.6, 134], [45.6, 147], [47.4, 134]]], // adductors
  ['quads', [[39, 106.4], [33.8, 110.4], [31.2, 120], [30.8, 134], [32.2, 150], [35.2, 161.4], [39.6, 163.4], [44, 158.8], [45.2, 148], [42.4, 136], [40.2, 122]]],
  ['calves', [[34, 172], [32.8, 181], [33.4, 192], [35.8, 204], [38.4, 202], [39.2, 188], [39.4, 176], [37.6, 170.6]]], // shin
  ['calves', [[40.8, 171], [43.8, 177], [44, 188], [42.2, 198.6], [40.4, 196], [40.2, 182]]], // inner calf
];
const FRONT_LINES: Pt[][] = [
  [[40, 75.6], [49, 75]], [[40.2, 85.6], [49, 85]], [[41.6, 95.4], [49, 95]], // abdominals
  [[44.2, 156.4], [41.2, 153.4], [40.2, 147.6], [41.6, 142]], // inner quadriceps
  [[46, 27.4], [47.4, 33.6], [49.2, 40]], // neck
];

const BACK: Part[] = [
  ['back', [[50, 28], [45.4, 32.4], [38, 37.8], [30.6, 40.8], [37.6, 44.6], [44.4, 52], [47.6, 62], [50, 72]]], // trapezius
  ['shoulders', [[35.4, 40.6], [29.6, 41], [25.2, 43.6], [23, 48.6], [22.6, 55.6], [24.6, 59], [27.6, 55], [30.4, 48.4], [33, 44.4]]],
  ['back', [[38.4, 46.4], [32.6, 47.4], [30.6, 54], [32.4, 60.6], [39.6, 61.4], [44, 55.6]]], // shoulder blade
  ['back', [[44.4, 62.2], [36.4, 63.4], [31.6, 66], [31.6, 78], [33.4, 92], [39.4, 99.4], [45.8, 96.6], [48.2, 84], [47.6, 72]]], // latissimus
  ['back', [[49.2, 76], [47.2, 86], [46.4, 98], [47, 106], [49.2, 108]]], // lower back
  ['triceps', ARM_UPPER],
  [null, FOREARM],
  ['core', [[32.6, 94], [32, 102], [33.6, 108], [38.4, 103.4], [36.6, 97.4]]], // obliques
  ['glutes', [[49, 108.6], [41.6, 106.6], [34.4, 109.4], [31, 118], [31.6, 128], [37.4, 133.6], [44.6, 133], [49, 130]]],
  ['hamstrings', [[32.2, 134], [31.2, 146], [32.8, 158], [36.6, 164], [41, 163], [45, 156], [46.4, 146], [46, 137], [40.4, 136]]],
  ['calves', [[34.6, 170], [32.8, 180], [33.4, 192], [36.4, 199.4], [39.2, 194], [39.8, 182], [39, 172]]],
  ['calves', [[40.6, 171], [43.6, 176], [44, 188], [42, 198], [40.4, 194], [40.2, 182]]],
];
const BACK_LINES: Pt[][] = [[[40.4, 138], [40, 150], [39.6, 162]]];

/** Both halves of a side as ready paths (computed once). */
function side(parts: Part[], lines: Pt[][]) {
  return {
    muscles: parts.flatMap(([m, pts]) => [{ m, d: smooth(pts) }, { m, d: smooth(mirror(pts)) }]),
    lines: lines.flatMap((pts) => [smooth(pts, false), smooth(mirror(pts), false)]),
  };
}
const OUTLINE_D = smooth([...BODY, ...mirror(BODY).reverse().slice(1)]);
const FRONT_SIDE = side(FRONT, FRONT_LINES);
const BACK_SIDE = side(BACK, BACK_LINES);
const SPINE = 'M50,74 L50,104';

const thin = { vectorEffect: 'non-scaling-stroke' as const };

function Figure({ part, load, front }: { part: ReturnType<typeof side>; load: Partial<Record<Muscle, MuscleLoad>>; front: boolean }) {
  return (
    <g>
      <path d={OUTLINE_D} fill={SKIN} stroke={OUTLINE} strokeWidth={1.1} strokeLinejoin="round" style={thin} />
      <ellipse cx={50} cy={15.5} rx={9.2} ry={12} fill={SKIN} stroke={OUTLINE} strokeWidth={1.1} style={thin} />
      {part.muscles.map(({ m, d }, i) => (
        <path key={i} d={d} fill={m && load[m] ? FILL[load[m]!] : SKIN} stroke={LINE} strokeWidth={0.7} strokeLinejoin="round" style={thin} />
      ))}
      {part.lines.map((d, i) => <path key={`l${i}`} d={d} fill="none" stroke={LINE} strokeWidth={0.6} strokeLinecap="round" style={thin} />)}
      {front
        ? [38.8, 61.2].map((x) => <ellipse key={x} cx={x} cy={167.2} rx={3.4} ry={3.6} fill="none" stroke={LINE} strokeWidth={0.6} style={thin} />)
        : <path d={SPINE} stroke={LINE} strokeWidth={0.6} style={thin} />}
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
    <svg viewBox="0 0 200 228" className={cx('h-auto', className ?? 'w-full')} role="img" aria-label={label} data-testid="muscle-map">
      <title>{label}</title>
      <Figure part={FRONT_SIDE} load={load} front />
      <g transform="translate(100 0)">
        <Figure part={BACK_SIDE} load={load} front={false} />
      </g>
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
          <span className="h-2 w-2 rounded-full" style={{ background: FILL[k] }} />
          {muscleLabel(m)}
        </span>
      ))}
    </span>
  );
}
