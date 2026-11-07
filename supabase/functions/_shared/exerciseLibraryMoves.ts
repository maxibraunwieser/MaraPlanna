// The movements of the exercise library (docs/uebungen/liste.txt): a few dozen archetypes (a standing curl, a press on a bench,
// a hang from a bar, ...) turned into key poses for the figure (see exercisePoses.ts for the angle conventions) and the
// equipment as shapes (see exerciseMoves.ts). An exercise of the library names an archetype and its options, e.g. "press:incline,kb".
// No imports of app code: it runs in the Edge Function (Deno), in the tests (Node) and in the website.

export type Shape = number[];
export interface Mv {
  /** 0 foot, 1 toe on the floor, 2 hand, 3 hip, 4 toe at a height */
  p: number;
  x: number;
  y: number;
  k: number[][];
  g: Shape[];
  /** a held position: the figure stands still (counted in seconds) */
  hold?: boolean;
}

/** One pose: torso, head, upper arm, forearm, thigh, shank, foot, far thigh, far shank, far upper arm, far forearm. */
const F = (t: number, h: number, ua: number, fa: number, th = 0, sh = 0, ft = 0, th2 = th, sh2 = sh, ua2 = ua, fa2 = fa): number[] => [t, h, ua, fa, th, sh, ft, th2, sh2, ua2, fa2];

// colours of the shapes: 0 frame, 1 iron, 2 pad, 3 light iron, 4 accent (band)
/** What the hands hold. */
export function held(impl: string): Shape[] {
  switch (impl) {
    case 'db': return [[8, 1, 0, 0]];
    case 'kb': return [[9, 1, 0, 0]];
    case 'mb': return [[3, 1, 0, 0, 12, 2]];
    case 'sb': return [[1, 1, -13, -9, 13, 9, 2]];
    case 'plate': return [[3, 1, 0, 0, 13, 1], [3, 1, 0, 0, 4.5, 3]];
    case 'none': case 'cable': case 'band': case 'machine': return [];
    default: return [[7, 1, 0, 0]]; // bb, ez, smith: the bar seen end-on
  }
}
/** A cable or band from a fixed point (x, y from the pinned point, y up is negative) to the hand. */
const lineTo = (x: number, y: number, band: boolean): Shape => [5, 0, x, y, 0, 0, band ? 4 : 0];
const BAR = [2, 1, -38, 0, 38, 0, 4.6, 0]; // a pull-up bar through the hands


// ---- bodies
const standing = (frames: number[][], g: Shape[] = []): Mv => ({ p: 1, x: 0, y: 0, k: frames, g });
const BENCH: Shape = [4, 0, -92, 24, -43, 9, 2];
/** Lying on a flat bench: hip pinned on it, feet on the floor. */
const onBench = (frames: number[][], g: Shape[] = []): Mv => ({ p: 3, x: 0, y: 56, k: frames, g: [BENCH, ...g] });
/** A backrest tilted by `t` degrees (torso angle, negative = leaning back) with a seat: shapes relative to the hip. */
function inclineBench(t: number): Shape[] {
  const r = (t * Math.PI) / 180;
  const ux = Math.sin(r), uy = -Math.cos(r), nx = Math.cos(r), ny = Math.sin(r);
  const pt = (a: number, b: number): number[] => [Math.round((ux * a - nx * b) * 10) / 10, Math.round((uy * a - ny * b) * 10) / 10];
  return [[6, 3, ...pt(-6, 12), ...pt(66, 12), ...pt(66, 20), ...pt(-6, 20), 2], [1, 3, -3, 20, 3, 56, 0], [1, 3, 0, 14, 28, 22, 2]];
}
const onIncline = (t: number, mk: (t: number) => number[][], g: Shape[] = []): Mv => ({ p: 3, x: 0, y: 56, k: mk(t), g: [...inclineBench(t), ...g] });
const lyingFloor = (frames: number[][], g: Shape[] = []): Mv => ({ p: 3, x: 0, y: 2, k: frames, g });
/** Seated at a machine or bench: hip pinned at seat height, thighs level. */
const SEAT: Shape[] = [[1, 3, -24, 5, 16, 12, 2], [1, 3, -3, 12, 3, 50, 0], [1, 3, -23, -42, -15, 8, 2]];
const seated = (frames: number[][], g: Shape[] = []): Mv => ({ p: 3, x: 0, y: 50, k: frames, g: [...SEAT, ...g] });
const hanging = (frames: number[][], g: Shape[] = []): Mv => ({ p: 2, x: 0, y: 226, k: frames, g: [BAR, ...g] });
const BARS: Shape[] = [[2, 0, -38, -118, -38, 0, 3, 0], [2, 0, 38, -118, 38, 0, 3, 0]];
const prone = (frames: number[][], g: Shape[] = []): Mv => ({ p: 1, x: 0, y: 0, k: frames, g });

// A standing figure with the arms in two poses (the legs straight): the most common shape of an exercise.
const arms = (a: [number, number], b: [number, number], g: Shape[] = [], lean: [number, number] = [0, 0]): Mv => standing([F(lean[0], 0, a[0], a[1], 1, -1), F(lean[1], 0, b[0], b[1], 1, -1)], g);

type Build = (o: string[], impl: string) => Mv;

const has = (o: string[], k: string) => o.includes(k);
const IMPLS = ['bb', 'ez', 'db', 'kb', 'plate', 'mb', 'sb', 'smith', 'cable', 'band', 'machine', 'none'];
/** Splits "incline,kb" into the implement (kb) and the other options. */
export function parseOptions(s: string): { id: string; impl: string; o: string[] } {
  const [id, rest = ''] = s.split(':');
  const parts = rest ? rest.split(',') : [];
  return { id, impl: parts.find((p) => IMPLS.includes(p)) ?? 'bb', o: parts };
}

// Squat / lunge helpers ---------------------------------------------------------------------------------------------
const squatFrames = (hands: [number, number], hands2: [number, number], depth = 98, lean = 40): number[][] => [F(4, 0, hands[0], hands[1], 2, -2), F(lean, -20, hands2[0], hands2[1], depth, -30)];
const lungeFrames = (hands: [number, number], back = true): number[][] => [
  F(2, 0, hands[0], hands[1], 1, -1, 0, 1, -1),
  back ? F(6, 0, hands[0], hands[1], 78, -8, 0, -34, -92) : F(6, 0, hands[0], hands[1], 94, -2, 0, -40, -100),
];

export const ARCH: Record<string, Build> = {
  // ---------------------------------------------------------------- chest
  press: (o, i) => {
    const bar = held(i);
    if (has(o, 'incline')) return onIncline(-50, (t) => [F(t, 0, 30, 176, 85, -5), F(t, 0, 160, 176, 85, -5)], bar);
    if (has(o, 'decline')) return onBench([F(-96, 0, 30, 176, 85, -5), F(-96, 0, 172, 178, 85, -5)], bar);
    return onBench([F(-90, 0, 30, 176, 85, -5), F(-90, 0, 172, 178, 85, -5)], has(o, 'smith') ? [...bar, [2, 0, 30, -140, 30, -10, 3, 0]] : bar);
  },
  fly: (o, i) => (has(o, 'incline') ? onIncline(-50, (t) => [F(t, 0, 40, 70, 85, -5), F(t, 0, 160, 165, 85, -5)], held(i)) : onBench([F(-90, 0, 40, 70, 85, -5), F(-90, 0, 172, 172, 85, -5)], held(i))),
  pullover: (_o, i) => onBench([F(-90, 0, -115, -105, 85, -5), F(-90, 0, 172, 176, 85, -5)], held(i)),
  cablefly: (o) => {
    const y = has(o, 'high') ? -190 : has(o, 'low') ? -15 : -125;
    const a: [number, number] = has(o, 'high') ? [-50, -30] : has(o, 'low') ? [-30, -10] : [-80, -80];
    const b: [number, number] = has(o, 'high') ? [40, 20] : has(o, 'low') ? [95, 100] : [88, 88];
    return arms(a, b, [lineTo(-70, y, false)], [8, 8]);
  },
  cablepress1: () => arms([-20, 80], [90, 90], [lineTo(-60, -130, false)], [6, 6]),
  pecdeck: () => seated([F(-4, 0, 40, 70, 88, -4), F(-4, 0, 88, 90, 88, -4)]),
  bandfly: () => arms([-70, -60], [88, 88], [lineTo(-70, -125, true)], [4, 4]),
  bandpress: () => arms([-20, 80], [90, 90], [lineTo(-60, -130, true)], [6, 6]),
  pushupvar: (o, i) => {
    const down = F(86, -30, 70, 8, -84, -84, 72, -84, -84, 70, 8);
    if (has(o, 'decline')) return { p: 4, x: 0, y: 45, k: [F(100, -30, 4, 0, -100, -100, 72, -100, -100, 4, 0), F(104, -30, 70, 8, -104, -104, 72, -104, -104, 70, 8)], g: [[4, 0, -40, 22, -45, 8, 2]] };
    if (has(o, 'archer')) return prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), F(86, -30, 70, 8, -84, -84, 72, -84, -84, 4, 0)]);
    if (has(o, 'planche')) return prone([F(70, -30, 20, 0, -70, -70, 72, -70, -70, 20, 0), F(80, -30, 85, 30, -80, -80, 72, -80, -80, 85, 30)]);
    if (has(o, 'diamond')) return prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), F(86, -30, 80, 90, -84, -84, 72, -84, -84, 80, 90)]);
    if (has(o, 'kb')) return prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), down], i === 'kb' ? [[9, 1, 0, 14]] : []);
    if (has(o, 'band')) return prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), down], [[2, 2, -4, 0, -4, 1, 0, 0]]);
    return prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), down]);
  },
  dipschest: () => ({ p: 2, x: 0, y: 120, k: [F(24, 0, 0, 0, -5, -60), F(36, 0, -70, 60, -5, -60)], g: BARS }),
  // ---------------------------------------------------------------- back
  pullup: (o) => hanging([F(0, 0, 180, 180, 0, 0), F(-6, 0, -2, 30, 12, -10)], has(o, 'band') ? [[2, 5, -4, 12, -4, 40, 3, 4]] : []),
  muscleup: () => hanging([F(0, 0, 180, 180, 0, 0), F(-6, 0, -2, 30, 12, -10), F(6, 0, 80, 50, 5, -5)]),
  pulldown: (o, i) => {
    return { p: 3, x: 0, y: 50, k: [F(-10, 0, 172, 176, 86, -4), F(-16, 0, has(o, 'narrow') ? 6 : -12, 158, 86, -4)], g: [...SEAT, lineTo(0, -190, i === 'band'), [2, 3, -22, -30, 20, -30, 6, 0]] };
  },
  cablerow1: () => ({ p: 3, x: 0, y: 36, k: [F(18, 0, 93, 66, 96, 10), F(-2, 0, -24, 100, 96, 10)], g: [[2, 3, -7, 10, 36, 10, 7, 2], lineTo(120, -34, false)] }),
  rowbent: (o, i) => ({ p: 1, x: 0, y: 0, k: [F(78, 0, 0, 0, 15, -24), F(78, 0, -45, 72, 15, -24)], g: [...held(i), ...(has(o, 'bench') ? [[4, 0, -50, 30, -26, 8, 2] as Shape] : [])] }),
  chestrow: (_o, i) => onIncline(-110, () => [F(-110, 0, 0, 0, 85, -5), F(-110, 0, -50, 60, 85, -5)], held(i)),
  tbar: () => ({ p: 1, x: 0, y: 0, k: [F(60, 0, 0, 0, 18, -22), F(60, 0, -40, 80, 18, -22)], g: [[7, 1, 0, 8], [2, 1, 0, 8, -80, 30, 3, 3]] }),
  gorilla: (_o, i) => ({ p: 1, x: 0, y: 0, k: [F(60, 0, 0, 0, 30, -30), F(60, 0, -40, 80, 30, -30)], g: held(i) }),
  renegade: (_o, i) => prone([F(80, -30, 4, 0, -80, -80, 72, -80, -80, 4, 0), F(82, -30, 4, 0, -80, -80, 72, -80, -80, -45, 75)], held(i)),
  kbdlrow: () => standing([F(70, 0, 0, 0, 20, -26), F(70, 0, -45, 70, 20, -26)], [[9, 1, 0, 6]]),
  hyperext: () => ({ p: 3, x: 0, y: 70, k: [F(80, 0, 90, 90, -80, -80), F(10, 0, 90, 90, -80, -80)], g: [[1, 3, -40, 8, 30, 20, 2], [1, 3, 25, 20, 31, 70, 0]] }),
  superman: () => ({ p: 3, x: 0, y: 8, k: [F(88, 0, 170, 170, -88, -88), F(70, 0, 175, 175, -78, -78)], g: [] }),
  snowangel: () => ({ p: 3, x: 0, y: 8, k: [F(86, 0, 175, 175, -88, -88), F(86, 0, 95, 95, -88, -88)], g: [] }),
  bandrow: () => standing([F(0, 0, 90, 90, 1, -1), F(0, 0, -20, 90, 1, -1)], [lineTo(80, -120, true)]),
  bandface: () => standing([F(0, 0, 111, 78, 1, -1), F(0, 0, 197, 71, 1, -1)], [lineTo(110, -140, true)]),
  doorrow: () => standing([F(0, 0, 90, 90, 1, -1), F(0, 0, -20, 90, 1, -1)], [lineTo(90, -105, true), [3, 0, 90, -105, 4, 2]]),
  // ---------------------------------------------------------------- traps and neck
  shrug: (_o, i) => arms([2, 2], [4, 4], i === 'cable' ? [lineTo(30, -5, false)] : held(i), [0, 0]),
  upright: (_o, i) => arms([4, 4], [85, -160], held(i)),
  neckflex: () => standing([F(0, 0, 0, 0, 1, -1), F(0, 40, 0, 0, 1, -1)]),
  neckext: () => standing([F(0, 0, 0, 0, 1, -1), F(0, -35, 0, 0, 1, -1)]),
  neckband: (_o, i) => standing([F(0, 0, 0, 0, 1, -1), F(0, -30, 0, 0, 1, -1)], i === 'band' ? [lineTo(60, -165, true)] : []),
  neckmachine: () => seated([F(-4, 0, 0, 90, 88, -4), F(-4, -35, 0, 90, 88, -4)]),
  // ---------------------------------------------------------------- shoulders
  presssit: (o, i) => seated([F(-4, 0, 30, 176, 88, -4), F(-4, 0, 175, 178, 88, -4)], has(o, 'smith') ? [...held(i), [2, 0, 30, -140, 30, -10, 3, 0]] : held(i)),
  presstand: (_o, i) => standing([F(0, 0, 20, 160, 1, -1), F(0, 0, 178, 178, 1, -1)], i === 'band' ? [lineTo(10, -3, true)] : held(i)),
  arnold: () => standing([F(0, 0, 25, 170, 1, -1), F(0, 0, 100, 100, 1, -1), F(0, 0, 178, 178, 1, -1)], [[8, 1, 0, 0]]),
  presskneel: (o, i) => standing([F(0, 0, 20, 160, has(o, 'half') ? 94 : 0, has(o, 'half') ? -4 : -100, 0, has(o, 'half') ? -80 : 0, has(o, 'half') ? -100 : -100), F(0, 0, 178, 178, has(o, 'half') ? 94 : 0, has(o, 'half') ? -4 : -100, 0, has(o, 'half') ? -80 : 0, has(o, 'half') ? -100 : -100)], held(i)),
  bottomsup: () => standing([F(0, 0, 20, 160, 1, -1), F(0, 0, 178, 178, 1, -1)], [[9, 1, 0, -2]]),
  halo: () => standing([F(0, 0, 40, 170, 1, -1), F(0, 0, 150, -150, 1, -1)], [[9, 1, 0, 0]]),
  raise: (o, i) => {
    const front = has(o, 'front');
    if (i === 'cable') return standing([F(0, 0, 0, 0, 1, -1), F(0, 0, front ? 88 : 80, front ? 90 : 80, 1, -1)], [lineTo(30, -5, false)]);
    if (i === 'machine') return seated([F(-4, 0, 0, 90, 88, -4), F(-4, 0, 80, 90, 88, -4)]);
    if (i === 'band') return standing([F(0, 0, 0, 0, 1, -1), F(0, 0, front ? 88 : 80, front ? 90 : 80, 1, -1)], [lineTo(10, -3, true)]);
    return standing([F(0, 0, 0, 0, 1, -1), F(0, 0, front ? 88 : 80, front ? 90 : 80, 1, -1)], held(i));
  },
  reversecable: () => standing([F(0, 0, 88, 88, 1, -1), F(0, 0, 40, 40, 1, -1)], [lineTo(90, -125, false)]),
  handstandpush: () => ({ p: 2, x: 0, y: 4, k: [F(180, 0, 0, 0, 180, 180, 0, 180, 180), F(180, 0, 40, 100, 180, 180, 0, 180, 180)], g: [[1, 0, -4, -200, 4, 0, 0]] }),
  extrot: (_o, i) => standing([F(0, 0, 4, 90, 1, -1), F(0, 0, 4, 20, 1, -1)], i === 'band' ? [lineTo(80, -90, true)] : held(i)),
  // ---------------------------------------------------------------- arms
  curl: (o, i) => {
    if (has(o, 'preacher')) return seated([F(-4, 0, 80, 20, 88, -4), F(-4, 0, 80, 150, 88, -4)], [[1, 2, 0, 0, 40, 6, 2], ...held(i)]);
    if (has(o, 'incline')) return onIncline(-125, () => [F(-125, 0, 0, 0, 85, -5), F(-125, 0, 20, 150, 85, -5)], held(i));
    if (has(o, 'concentration')) return seated([F(40, 0, 6, 0, 80, -6), F(40, 0, 20, 150, 80, -6)], held(i));
    if (i === 'cable') return standing([F(0, 0, 4, 0, 1, -1), F(0, 0, 14, 150, 1, -1)], [lineTo(60, -4, false)]);
    if (i === 'band') return standing([F(0, 0, 4, 0, 1, -1), F(0, 0, 14, 150, 1, -1)], [lineTo(10, -3, true)]);
    if (i === 'machine') return seated([F(-4, 0, 70, 20, 88, -4), F(-4, 0, 70, 150, 88, -4)], [[1, 2, 0, 0, 36, 8, 2]]);
    return standing([F(1, 0, 2, 0, 1, -1), F(1, 0, 12, 150, 1, -1)], held(i));
  },
  benchdips: () => ({ p: 3, x: 0, y: 46, k: [F(0, 0, -20, 30, 70, -20), F(8, 0, -60, 80, 70, -20)], g: [[4, 0, -60, -8, -43, 9, 2]] }),
  skull: (_o, i) => onBench([F(-90, 0, 172, 176, 85, -5), F(-90, 0, 172, 60, 85, -5)], held(i)),
  tricepsoh: (_o, i) => standing([F(0, 0, 175, 178, 1, -1), F(0, 0, 175, 20, 1, -1)], held(i)),
  pushdown: (_o, i) => standing([F(0, 0, 4, 100, 1, -1), F(0, 0, 4, 4, 1, -1)], [lineTo(40, -190, i === 'band')]),
  ohcable: () => standing([F(0, 0, 160, 20, 1, -1), F(0, 0, 175, 170, 1, -1)], [lineTo(-40, -45, false)]),
  kickback: (_o, i) => standing([F(70, 0, -50, 80, 20, -26), F(70, 0, -80, -80, 20, -26)], i === 'cable' ? [lineTo(80, -40, false)] : i === 'band' ? [lineTo(80, -40, true)] : held(i)),
  tricepsmachine: () => seated([F(-4, 0, 60, 120, 88, -4), F(-4, 0, 60, 30, 88, -4)], [[1, 2, 0, 0, 36, 8, 2]]),
  wristcurl: (o, i) => seated([F(30, 0, 40, 80, 88, -4), F(30, 0, 40, has(o, 'rev') ? 55 : 100, 88, -4)], held(i)),
  wristcable: () => seated([F(30, 0, 40, 80, 88, -4), F(30, 0, 40, 105, 88, -4)], [lineTo(60, -10, false)]),
  deadhang: () => ({ ...hanging([F(0, 0, 180, 180, 0, 0)]), hold: true }),
  pinch: () => standing([F(0, 0, 4, 4, 1, -1), F(0, 0, 4, 4, 1, -1)], [[3, 1, 0, 0, 10, 1], [3, 1, 0, 0, 3, 3]]),
  // ---------------------------------------------------------------- quads, hamstrings, glutes, calves
  squat: (o, i) => {
    if (has(o, 'front')) return standing(squatFrames([40, 175], [40, 175]), [[7, 2, 6, -2]]);
    if (has(o, 'rack')) return standing(squatFrames([30, 150], [30, 150]), held(i));
    if (has(o, 'sumo')) return standing([F(4, 0, 4, 4, 14, -14, 0, -14, 14), F(30, 0, 14, 20, 82, -40, 0, -82, 40)], held(i));
    if (has(o, 'smith')) return standing(squatFrames([-30, 165], [-30, 165]), [[2, 0, -40, -200, -40, 0, 3, 0]]);
    if (has(o, 'band')) return standing(squatFrames([20, 120], [20, 120]), [lineTo(8, -2, true), [2, 4, 0, 0, 4, 0, 1, 4]]);
    if (has(o, 'spanish')) return standing([F(0, 0, 0, 0, 1, -1), F(-5, 0, 0, 0, 70, -70)], [lineTo(60, -30, true), lineTo(-60, -30, true)]);
    if (has(o, 'sissy')) return standing([F(0, 0, 90, 90, 1, -1), F(-10, 0, 90, 90, 100, -85)], []);
    return standing(squatFrames([-30, 165], [-30, 165]), [[2, 2, 0, 0, 2, -1, 3, 0]]);
  },
  hack: () => ({ p: 3, x: 0, y: 40, k: [F(-35, 0, 0, 0, 10, -10), F(-35, 0, 0, 0, 95, -45)], g: [[2, 3, -48, 34, -2, -50, 8, 0], [1, 3, -26, -22, -14, 8, 2]] }),
  lunge: (o, i) => {
    if (has(o, 'lateral')) return standing([F(0, 0, 40, 100, 1, -1, 0, 1, -1), F(10, 0, 40, 100, 80, -45, 0, -10, 10)], held(i));
    if (has(o, 'walk')) return standing([F(2, 0, 4, 4, 70, -8, 0, -30, -90), F(2, 0, 4, 4, 1, -1, 0, 60, -60)], held(i));
    return standing(lungeFrames([4, 4]), held(i));
  },
  pistol: (o, i) => standing([F(0, 0, 0, 0, 1, -1, 0, 1, -1, 90, 90), F(25, 0, 90, 90, 118, -38, 0, 90, 0, 90, 90)], has(o, 'kb') ? [[9, 1, 0, 6]] : i === 'none' ? [] : []),
  wallsit: () => ({ p: 3, x: 0, y: 50, k: [F(0, 0, 40, 10, 88, -4)], g: [[1, 3, -26, -50, -20, 50, 2]], hold: true }),
  hamstring: (o, i) => {
    if (has(o, 'curlseat')) return seated([F(0, 0, 40, 50, 88, -4, 0, 88, -4), F(0, 0, 40, 50, 88, -50, 0, 88, -50)]);
    if (has(o, 'cable')) return standing([F(0, 0, 4, 4, 1, -1, 0, 1, -1), F(0, 0, 4, 4, 1, -1, 0, -10, -100)], [lineTo(50, -6, false)]);
    if (has(o, 'band')) return standing([F(0, 0, 4, 4, 1, -1, 0, 1, -1), F(0, 0, 4, 4, 1, -1, 0, -10, -100)], [lineTo(50, -6, true)]);
    if (has(o, 'nordic')) return { p: 3, x: 0, y: 40, k: [F(0, 0, 10, 10, -5, -5), F(70, 0, 80, 80, -5, -5)], g: [[2, 3, -30, 38, -30, 4, 4, 0]] };
    if (has(o, 'ghr')) return { p: 3, x: 0, y: 70, k: [F(80, 0, 90, 90, -80, -80), F(10, 0, 90, 90, -80, -80)], g: [[1, 3, -30, 8, 30, 20, 2]] };
    if (has(o, 'goodmorning')) return standing([F(0, 0, 0, 0, 1, -1), F(75, 0, 0, 0, 20, -24)], [[2, 2, 0, 0, 2, -1, 3, 0]]);
    if (has(o, 'slider')) return lyingFloor([F(-90, 0, 0, 0, 40, 20), F(-90, 0, 0, 0, 60, 80)], [[3, 5, 0, 0, 3, 3]]);
    return standing([F(0, 0, 0, 0, 1, -1), F(75, 0, 0, 0, 14, -10)], held(i));
  },
  legextband: () => seated([F(0, 0, 40, 40, 88, -4), F(0, 0, 40, 40, 88, 86)], [[2, 5, -50, 0, 0, 0, 2, 4]]),
  sumodl: (_o, i) => standing([F(55, 0, 4, 4, 50, -20), F(0, 0, 4, 4, 2, -2)], held(i)),
  singledl: (_o, i) => standing([F(0, 0, 0, 0, 1, -1), F(84, 0, 0, 0, 24, -14, 0, -98, -98)], held(i)),
  glute: (o, i) => {
    if (has(o, 'kickcable')) return standing([F(20, 0, 60, 60, 1, -1, 0, 1, -1), F(20, 0, 60, 60, 1, -1, 0, -40, -40)], [lineTo(60, -5, false)]);
    if (has(o, 'kickmachine')) return standing([F(25, 0, 60, 60, 1, -1, 0, 1, -1), F(25, 0, 60, 60, 1, -1, 0, -45, -45)], [[1, 3, 8, 20, 16, 70, 2]]);
    if (has(o, 'abduct')) return seated([F(-4, 0, 30, 30, 70, -4, 0, 70, -4), F(-4, 0, 30, 30, 95, -4, 0, 95, -4)]);
    if (has(o, 'adduct')) return seated([F(-4, 0, 30, 30, 95, -4, 0, 95, -4), F(-4, 0, 30, 30, 70, -4, 0, 70, -4)]);
    if (has(o, 'cableabd')) return standing([F(0, 0, 4, 4, 1, -1, 0, 1, -1), F(0, 0, 4, 4, 1, -1, 0, 40, -40)], [lineTo(30, -6, false)]);
    if (has(o, 'band')) return lyingFloor([F(-90, 0, 0, 0, 146, 28), F(-90, 0, 0, 0, 85, -5)], [lineTo(0, -12, true), [3, 3, 0, 0, 3, 3]]);
    if (has(o, 'clam')) return lyingFloor([F(-90, 0, 0, 0, 100, 60), F(-90, 0, 0, 0, 100, 60, 0, 130, 60)], [lineTo(10, -20, true)]);
    if (has(o, 'sidestep')) return standing([F(0, 0, 4, 4, 30, -30, 0, -20, 20), F(0, 0, 4, 4, 1, -1)], [[2, 4, 0, 0, 28, 0, 3, 4]]);
    if (has(o, 'donkey')) return prone([F(86, -30, 4, 0, -80, -80, 72, 60, 0), F(86, -30, 4, 0, -80, -80, 72, 160, 20)]);
    if (has(o, 'hydrant')) return prone([F(86, -30, 4, 0, -80, -80, 72, 90, 0), F(86, -30, 4, 0, -80, -80, 72, 100, 10)]);
    if (has(o, 'bridge')) return lyingFloor([F(-90, 0, 0, 0, 146, 28), F(-90, 0, 0, 0, 85, -5)], held(i));
    return standing([F(0, 0, 4, 4, 1, -1), F(0, 0, 4, 4, 1, -1)]);
  },
  calfraise: (o, i) => {
    if (has(o, 'seated')) return seated([F(0, 0, 40, 60, 88, -4), F(0, 0, 40, 60, 88, -4, -20)], held(i));
    if (has(o, 'donkey')) return standing([F(80, 0, 90, 90, 1, -1), F(80, 0, 90, 90, 1, -1, 30)], [[1, 0, 30, -120, 60, -112, 2]]);
    if (has(o, 'stair')) return { p: 4, x: 0, y: 12, k: [F(0, 0, 4, 4, 1, -1, -10), F(0, 0, 4, 4, 1, -1, 30)], g: [[4, 0, -20, 20, -12, 12, 2]] };
    return standing([F(0, 0, 4, 4, 1, -1), F(0, 0, 4, 4, 1, -1, 30)], i === 'band' ? [lineTo(0, -4, true)] : []);
  },
  // ---------------------------------------------------------------- core
  crunch: (o) => {
    if (has(o, 'bicycle')) return lyingFloor([F(-60, 0, -20, 20, 146, 20, 0, 20, 70), F(-60, 0, -20, 20, 40, 70, 0, 146, 20)]);
    if (has(o, 'oblique')) return lyingFloor([F(-80, 0, -20, 20, 146, 28), F(-45, 20, -20, 20, 146, 28)]);
    if (has(o, 'toe')) return lyingFloor([F(-90, 0, 172, 172, 170, 170), F(-60, 0, 172, 172, 170, 170)]);
    if (has(o, 'band')) return lyingFloor([F(-80, 0, 172, 150, 146, 28), F(-45, 20, 172, 150, 146, 28)], [lineTo(-60, -140, true)]);
    return lyingFloor([F(-84, 0, -20, 20, 146, 28), F(-48, 24, -20, 20, 146, 28)]);
  },
  legraise: (o) => (has(o, 'hang') ? hanging([F(0, 0, 180, 180, 0, 0), F(-6, 0, 180, 180, 88, 80)]) : lyingFloor([F(-90, 0, 0, 0, 180, 180), F(-90, 0, 0, 0, 100, 100)])),
  dragon: () => onBench([F(-90, 0, 172, 172, 180, 180), F(-60, 0, 172, 172, 130, 130)]),
  hollow: () => ({ p: 3, x: 0, y: 6, k: [F(-70, 0, 175, 175, 170, 170)], g: [], hold: true }),
  twist: (_o, i) => ({ p: 3, x: 0, y: 6, k: [F(-40, 0, 70, 70, 130, 40), F(-40, 25, 95, 95, 130, 40)], g: held(i) }),
  chop: (_o, i) => {
    if (i === 'cable') return standing([F(0, 0, 180, 150, 1, -1), F(30, 0, 40, 40, 20, -20)], [lineTo(-60, -190, false)]);
    if (i === 'band') return standing([F(0, 0, 180, 150, 1, -1), F(30, 0, 40, 40, 20, -20)], [lineTo(-60, -190, true)]);
    return standing([F(-8, 0, 170, 150, 1, -1), F(40, 0, 40, 40, 30, -30)], held(i));
  },
  sidebend: (_o, i) => standing([F(0, 0, 3, 3, 1, -1), F(12, 0, 3, 3, 1, -1)], held(i)),
  kbcounter: () => standing([F(0, 0, 90, 90, 1, -1), F(0, 0, 90, 90, 70, -70)], [[9, 1, 0, 6]]),
  situp: (_o, i) => lyingFloor([F(-84, 0, 175, 175, 146, 28), F(-4, 0, 100, 100, 146, 28)], held(i)),
  cablecrunch: () => ({ p: 3, x: 0, y: 8, k: [F(8, 0, 120, 130, -30, -90), F(40, 0, 100, 130, -30, -90)], g: [lineTo(0, -190, false)] }),
  abmachine: () => seated([F(-4, 0, 70, 90, 88, -4), F(30, 0, 70, 90, 88, -4)]),
  abwheel: () => ({ p: 1, x: 0, y: 0, k: [F(8, 0, 0, 0, 100, -75), F(78, 0, 150, 150, 10, -76)], g: [[3, 1, 0, 0, 8, 1]] }),
  climbers: () => prone([F(80, -30, 4, 0, -80, -80, 72, 80, 0), F(82, -30, 4, 0, -80, -80, 72, 40, 10, 4, 0)]),
  plankdrag: () => prone([F(78, 0, 0, 90, -78, -78, 70, -78, -78, 4, 0), F(78, 0, 0, 90, -78, -78, 70, -78, -78, 80, 60)], [[9, 0, 80, 4]]),
  antirot: () => standing([F(0, 0, 80, 80, 1, -1), F(0, 0, 90, 90, 1, -1)], [lineTo(0, -125, true)]),
  hipflex: (o) => {
    if (has(o, 'bars')) return { p: 2, x: 0, y: 120, k: [F(0, 0, 0, 0, -5, -60), F(-6, 0, 0, 0, 95, -10)], g: BARS };
    if (has(o, 'lying')) return lyingFloor([F(-90, 0, 0, 0, 160, 60), F(-90, 0, 0, 0, 110, 40)]);
    if (has(o, 'cable')) return standing([F(0, 0, 40, 40, 1, -1), F(0, 0, 40, 40, 1, -1, 0, 88, -4)], [lineTo(-30, -6, false)]);
    if (has(o, 'band')) return standing([F(0, 0, 40, 40, 1, -1), F(0, 0, 40, 40, 1, -1, 0, 88, -4)], [lineTo(-30, -6, true)]);
    return hanging([F(0, 0, 180, 180, 0, 0), F(-6, 0, 180, 180, 95, -5)]);
  },
  // ---------------------------------------------------------------- calisthenics
  lever: (o) => (has(o, 'back') ? { p: 2, x: 0, y: 200, k: [F(0, 0, 180, 180, 0, 0), F(-90, 0, 180, 180, -90, -90)], g: [BAR], hold: true } : { p: 2, x: 0, y: 200, k: [F(0, 0, 180, 180, 0, 0), F(90, 0, 180, 180, -90, -90)], g: [BAR], hold: true }),
  flag: () => ({ p: 2, x: 0, y: 170, k: [F(90, 0, 180, 0, -90, -90)], g: [[1, 0, -4, -200, 4, 0, 0]], hold: true }),
  planche: () => ({ p: 2, x: 0, y: 12, k: [F(80, 0, 0, 0, -80, -80)], g: [], hold: true }),
  lsit: () => ({ p: 2, x: 0, y: 120, k: [F(0, 0, 0, 0, 90, 90)], g: BARS, hold: true }),
  vsit: () => ({ p: 3, x: 0, y: 8, k: [F(-30, 0, 90, 90, 130, 130)], g: [], hold: true }),
  handstand: (o) => (has(o, 'push') ? ({ p: 2, x: 0, y: 4, k: [F(180, 0, 0, 0, 180, 180, 0, 180, 180), F(180, 0, 40, 100, 180, 180, 0, 180, 180)], g: [] }) : ({ p: 2, x: 0, y: 4, k: [F(180, 0, 0, 0, 180, 180)], g: [], hold: true })),
  australian: () => ({ p: 1, x: 0, y: 0, k: [F(-72, 0, 170, 170, 72, 72), F(-72, 0, 60, 120, 72, 72)], g: [[2, 0, 120, -80, 120, -110, 3, 0]] }),
  // ---------------------------------------------------------------- full body
  burpee: (o) => standing([F(0, 0, 4, 4, 1, -1), F(60, 0, 20, 20, 110, -60, 0, 110, -60), F(86, -30, 4, 0, -80, -80, 72, -80, -80), has(o, 'jump') ? F(0, 0, 178, 178, 1, -1) : F(0, 0, 4, 4, 1, -1)]),
  swing: (o, i) => standing([F(58, 0, 14, -32, 45, -7), F(0, 0, has(o, 'high') ? 150 : 111, has(o, 'high') ? 110 : 78, 1, -1)], held(i)),
  clean: (o, i) => {
    const down = has(o, 'hang') ? F(40, 0, 14, 0, 40, -10) : F(55, 0, 14, 0, 70, -35);
    if (has(o, 'snatch')) return standing([down, F(0, 0, 178, 178, 1, -1)], held(i));
    if (has(o, 'jerk')) return standing([F(0, 0, 20, 160, 20, -20), F(0, 0, 178, 178, 1, -1)], held(i));
    if (has(o, 'press')) return standing([down, F(0, 0, 25, 160, 1, -1), F(0, 0, 178, 178, 1, -1)], held(i));
    if (has(o, 'squat')) return standing([down, F(4, 0, 25, 160, 98, -30)], held(i));
    return standing([down, F(0, 0, 25, 160, 1, -1)], held(i));
  },
  thruster: (_o, i) => standing([F(30, -10, 25, 160, 98, -30), F(0, 0, 178, 178, 1, -1)], held(i)),
  manmaker: (_o, i) => standing([F(86, -30, 4, 0, -80, -80, 72), F(86, -30, -45, 70, -80, -80, 72), F(0, 0, 178, 178, 1, -1)], held(i)),
  highpull: (_o, i) => standing([F(50, 0, 4, 4, 50, -20), F(0, 0, 85, -160, 1, -1)], held(i)),
  getup: () => lyingFloor([F(-90, 0, 172, 172, 146, 28), F(-30, 0, 172, 172, 120, 28), F(0, 0, 172, 172, 1, -1)], [[9, 1, 0, -20]]),
  kbpass: () => standing([F(60, 0, 20, 20, 40, -20, 0, 40, -20), F(60, 0, -15, -15, 40, -20, 0, 40, -20)], [[9, 1, 0, 6]]),
  carry: (o, i) => standing([F(0, 0, 2, 2, 20, -20, 0, -20, 20), F(0, 0, 2, 2, -20, 20, 0, 20, -20)], has(o, 'rack') ? [[9, 1, 0, -4]] : has(o, 'bottomsup') ? [[9, 1, 0, -4]] : held(i)),
  ropes: () => standing([F(10, 0, 70, 50, 60, -40), F(10, 0, 30, 100, 60, -40)], [[2, 1, 0, 0, 90, 20, 4, 3]]),
  wallball: () => standing([F(30, 0, 20, 160, 98, -30), F(0, 0, 178, 178, 1, -1)], [[3, 1, 0, 0, 12, 2]]),
  slam: () => standing([F(0, 0, 178, 178, 1, -1), F(50, 0, 20, 20, 60, -40)], [[3, 1, 0, 0, 12, 2]]),
  throw: () => standing([F(0, 0, 40, 90, 60, -40), F(0, 0, 100, 100, 1, -1)], [[3, 1, 0, 0, 12, 2]]),
  sled: (o) => (has(o, 'pull') ? standing([F(40, 0, 90, 90, 80, -40, 0, -20, 50), F(30, 0, 50, 90, 50, -40, 0, -40, 20)], [[1, 0, 70, -20, 130, -2, 0], [2, 1, 10, 0, 70, -14, 1.2, 0]]) : standing([F(60, 0, 80, 80, 60, -30, 0, -50, -70), F(60, 0, 90, 90, -10, -60, 0, 70, -20)], [[1, 0, 60, -40, 110, -4, 0], [2, 1, 6, 0, 60, -18, 1.2, 0]])),
  sandbag: () => standing([F(60, 0, 20, 20, 40, -20), F(0, 0, 10, 90, 1, -1)], [[1, 1, -12, -8, 12, 10, 2]]),
  bear: () => ({ p: 1, x: 0, y: 0, k: [F(60, -20, 0, 0, 100, -60, 0, 60, -80), F(60, -20, 0, 0, 60, -80, 0, 100, -60)], g: [] }),
  crab: () => ({ p: 3, x: 0, y: 40, k: [F(-70, 0, -30, -20, 80, -10, 0, 80, -10), F(-70, 0, -30, -20, 80, -10, 0, 80, -10)], g: [] }),
  jump: (o) => {
    if (has(o, 'box')) return { p: 1, x: 0, y: 0, k: [F(30, 0, -30, 20, 90, -50), F(0, 0, 170, 170, 1, -1, 30)], g: [[4, 0, 30, 70, -45, 8, 2]] };
    if (has(o, 'broad')) return standing([F(40, 0, -40, 20, 98, -50), F(-5, 0, 160, 160, 1, -1, 30)]);
    return standing([F(30, 0, -30, 20, 98, -50), F(0, 0, 170, 170, 1, -1, 30)]);
  },
  bandsquat: () => standing(squatFrames([20, 120], [20, 120]), [lineTo(8, -2, true)]),
  bandwood: () => standing([F(0, 0, 180, 150, 1, -1), F(30, 0, 40, 40, 20, -20)], [lineTo(-60, -190, true)]),
  nothing: () => standing([F(0, 0, 4, 4, 1, -1), F(0, 0, 4, 4, 1, -1)]),
};

/** The movement of an archetype with its options, e.g. build('press:incline,kb'). */
export function buildMove(spec: string): Mv {
  const { id, impl, o } = parseOptions(spec);
  const fn = ARCH[id];
  if (!fn) throw new Error(`unknown archetype ${id}`);
  const mv = fn(o, impl);
  // a held position has one pose: the figure needs two to move between
  const k = mv.k.length < 2 ? [mv.k[0], [...mv.k[0]]] : mv.k;
  return { ...mv, k, g: mv.g.map((s) => [...s]) };
}
