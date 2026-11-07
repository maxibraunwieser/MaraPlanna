// The animated figure of EVERY exercise of the catalogue, in the format of the watch (see exercisePoses.ts for the angles).
// A few exercises have hand-tuned moves there (MOVES); all others are converted from the website's pictures (exerciseArtData.ts):
// the same poses and the same equipment, turned into the watch's skeleton and a list of shapes for the equipment.
// No imports of app code: it runs in the Edge Function (Deno), in the tests (Node) and in the figure preview.

import { ART } from './exerciseArtData.ts';
import type { Item, Pose } from './exerciseArt.ts';
import { MOVES, feedMove, type FeedMove } from './exercisePoses.ts';
import { CATALOG } from './exerciseCatalog.ts';
import { LIBRARY } from './exerciseLibrary.ts';
import { buildMove, held } from './exerciseLibraryMoves.ts';
import { fineMuscles } from './figureMuscles.ts';

// Maße der Uhr-Figur in cm (wie Figure.mc)
const TORSO = 50;
const NECK = 6;
const HEAD_R = 9.5;
const UPPER_ARM = 30;
const FOREARM = 26;
const HAND_L = 4;
const THIGH = 43;
const SHANK = 42;
const ANKLE_H = 8;
/** cm per unit of the website's pictures (the legs match: 17 + 16 units = 85 cm). */
const S = 2.55;

const rad = (d: number) => (d * Math.PI) / 180;
const sinD = (d: number) => Math.sin(rad(d));
const cosD = (d: number) => Math.cos(rad(d));

/** Catalogue keys whose hand-tuned move in MOVES is the right one. */
export const TUNED: Record<string, string> = {
  back_squat: 'squat', bench_press: 'bench_press', ohp: 'shoulder_press', bb_row: 'row', db_curl: 'bicep_curl', deadlift: 'deadlift',
  reverse_lunge_db: 'lunge', pull_up: 'pull_up', push_up: 'pushup', oh_triceps: 'triceps_ext', lat_pulldown: 'lat_pulldown', leg_press: 'leg_press',
};

/** Colours of the equipment shapes: 0 frame, 1 iron, 2 pad, 3 light iron, 4 orange (band, strap). */
const COLOUR: Record<string, number> = { gear: 0, accent: 1, light: 2, far: 3, near: 0, torso: 0, floor: 0 };
const AT: Record<string, number> = { hand: 1, shoulder: 2, hip: 3, knee: 4, ankle: 5, toe: 6, head: 7 };

/**
 * Shapes of the equipment (in the order of the feed): [type, at, ...numbers, colour]. `at` 0 = in the picture (cm from the floor
 * and from the pinned point), else a joint (1 hand, 2 shoulder, 3 hip, 4 knee, 5 ankle, 6 toe, 7 head) with the offset in cm.
 *   1 rect x0 y0 x1 y1   2 line x0 y0 x1 y1 width   3 disc x y r   4 stand (bench or box on the floor) x0 x1 top thickness
 *   5 cable from the point x y to the hand   6 polygon x y ...   7 barbell plate   8 dumbbell   9 kettlebell
 */
export type Shape = number[];

export interface Move2 {
  /** 0 foot, 1 toe on the floor, 2 hand, 3 hip, 4 toe at a height (x, y) */
  p: number;
  x: number;
  y: number;
  /** equipment bits of the old moves */
  q: number;
  ms: number;
  v: number[];
  /** key poses: torso, head, upper arm, forearm, thigh, shank, foot, far thigh, far shank, far upper arm, far forearm */
  k: number[][];
  /** equipment shapes */
  g?: Shape[];
  /** trained muscles as bit masks [main, secondary] (see figureMuscles.ts); the figure colours them */
  u?: number[];
}

type Pt = [number, number];

/** Where the joints of one pose are (cm, y down, floor 0), with the pinned point where it is told (a port of Figure.skeleton). */
export function skeleton(p: number[], pin: number, px: number, py: number) {
  const t = p[0];
  const ux = sinD(t);
  const uy = -cosD(t);
  const topX = TORSO * ux;
  const topY = TORSO * uy;
  const sjX = topX - 4 * ux;
  const sjY = topY - 4 * uy;
  const hux = sinD(t + p[1]);
  const huy = -cosD(t + p[1]);
  const headX = topX + (NECK + HEAD_R) * hux;
  const headY = topY + (NECK + HEAD_R) * huy;
  const elbX = sjX + UPPER_ARM * sinD(p[2]);
  const elbY = sjY + UPPER_ARM * cosD(p[2]);
  const wrX = elbX + FOREARM * sinD(p[3]);
  const wrY = elbY + FOREARM * cosD(p[3]);
  const handX = wrX + HAND_L * sinD(p[3]);
  const handY = wrY + HAND_L * cosD(p[3]);
  const a2 = p.length > 10 ? p[9] : p[2];
  const f2 = p.length > 10 ? p[10] : p[3];
  const elb2X = sjX + UPPER_ARM * sinD(a2);
  const elb2Y = sjY + UPPER_ARM * cosD(a2);
  const hand2X = elb2X + FOREARM * sinD(f2) + HAND_L * sinD(f2);
  const hand2Y = elb2Y + FOREARM * cosD(f2) + HAND_L * cosD(f2);
  const kX = THIGH * sinD(p[4]);
  const kY = THIGH * cosD(p[4]);
  const aX = kX + SHANK * sinD(p[5]);
  const aY = kY + SHANK * cosD(p[5]);
  const fkX = THIGH * sinD(p[7]);
  const fkY = THIGH * cosD(p[7]);
  const faX = fkX + SHANK * sinD(p[8]);
  const faY = fkY + SHANK * cosD(p[8]);
  // the far foot: flat like the near one unless the far leg moves on its own (then it stands on its toes)
  const ft2 = Math.abs(p[8] - p[5]) >= 8 ? (Math.atan2(-sinD(p[8]), cosD(p[8])) * 180) / Math.PI : p[6];
  const dX2 = cosD(ft2);
  const dY2 = sinD(ft2);
  const nX2 = -dY2;
  const nY2 = dX2;
  let offX = 0;
  let offY = 0;
  const dX = cosD(p[6]);
  const dY = sinD(p[6]);
  const nX = -dY;
  const nY = dX;
  const toeX = aX + dX * 18 + nX * ANKLE_H;
  const toeY = aY + dY * 18 + nY * ANKLE_H;
  if (pin === 3) {
    offX = px;
    offY = -py;
  } else if (pin === 2) {
    offX = px - handX;
    offY = -py - handY;
  } else if (pin === 4) {
    offX = px - toeX;
    offY = -py - toeY;
  } else {
    const heelY = aY + dY * -5 + nY * ANKLE_H;
    if (pin === 1) {
      offX = px - toeX;
      offY = 0 - toeY;
    } else {
      offX = px - aX;
      offY = 0 - Math.max(heelY, toeY);
    }
  }
  const at = (x: number, y: number): Pt => [x + offX, y + offY];
  return {
    hip: at(0, 0), shoulder: at(sjX, sjY), head: at(headX, headY), elbow: at(elbX, elbY), wrist: at(wrX, wrY), hand: at(handX, handY),
    elbow2: at(elb2X, elb2Y), hand2: at(hand2X, hand2Y), knee: at(kX, kY), ankle: at(aX, aY), toe: at(toeX, toeY), knee2: at(fkX, fkY), ankle2: at(faX, faY),
    toe2: at(faX + dX2 * 18 + nX2 * ANKLE_H, faY + dY2 * 18 + nY2 * ANKLE_H),
  };
}

/** The feed's angles from the website's pose: 0 = down, + forward (the website: 0 = forward, 90 = down). */
const frameOf = (p: Pose): number[] => {
  const down = (deg: number) => Math.round(90 - deg);
  const th = p.th;
  const sh = p.sh;
  const out = [
    Math.round(p.torso + 90),
    Math.round((p.head ?? p.torso) - p.torso),
    down(p.ua),
    down(p.fa),
    down(th),
    down(sh),
    Math.round(p.ft ?? 0),
    down(p.th2 ?? th),
    down(p.sh2 ?? sh),
    down(p.ua2 ?? p.ua),
    down(p.fa2 ?? p.fa),
  ];
  return out;
};

/** A point of the website's pose in the website's units: the joints of a pose, as the picture draws them. */
function artJoints(p: Pose, hip: Pt): Record<string, Pt> {
  const dir = (d: number): Pt => [Math.cos(rad(d)), Math.sin(rad(d))];
  const add = (a: Pt, b: Pt, k: number): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
  const shoulder = add(hip, dir(p.torso), 24);
  const head = add(shoulder, dir(p.head ?? p.torso), 8);
  const elbow = add(shoulder, dir(p.ua), 12);
  const hand = add(elbow, dir(p.fa), 11);
  const knee = add(hip, dir(p.th), 17);
  const ankle = add(knee, dir(p.sh), 16);
  const toe = add(ankle, dir(p.ft ?? 0), 6);
  const knee2 = add(hip, dir(p.th2 ?? p.th), 17);
  const ankle2 = add(knee2, dir(p.sh2 ?? p.sh), 16);
  const toe2 = add(ankle2, dir(p.ft2 ?? p.ft ?? 0), 6);
  return { hip, shoulder, head, elbow, hand, knee, ankle, toe, knee2, ankle2, toe2 };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** The move of an exercise of the catalogue: the hand-tuned one where there is one, else converted from its picture. */
export function moveOf(key: string): Move2 | null {
  const m = moveBase(key);
  const x = m ? CATALOG.find((c) => c.key === key) : undefined;
  if (!m || !x) return m;
  const { p, s } = fineMuscles(key, x.pattern);
  return { ...m, u: [p, s] };
}

/** The move of a library exercise: an archetype, or the move of a catalogue exercise with another implement ("~key:kb"). */
function libMove(spec: string): Move2 | null {
  if (spec.startsWith('~')) {
    const [bk, impl] = spec.slice(1).split(':');
    const base = moveBase(bk);
    if (!base) return null;
    // the implement in the hands changes: dumbbell, plate and kettlebell shapes at the hand are replaced
    const g = (base.g ?? []).filter((s) => !((s[0] === 7 || s[0] === 8 || s[0] === 9) && s[1] === 1));
    const extra = impl === 'band' ? [[2, 3, -22, -4, 22, -4, 2.6, 4]] : held(impl);
    const m: Move2 = { ...base, q: base.q & ~(1 | 4), g: [...g, ...extra] };
    m.v = viewOf(m);
    return m;
  }
  const mv = buildMove(spec);
  const m: Move2 = { p: mv.p, x: mv.x, y: mv.y, q: 0, ms: mv.hold ? 3000 : 3000, v: [0, 0, 0, 0], k: mv.k, ...(mv.g.length ? { g: mv.g } : {}) };
  m.v = viewOf(m);
  return m;
}
const LIB_MOVE: Record<string, string> = Object.fromEntries(LIBRARY.map((x) => [x.key, x.move]));

function moveBase(key: string): Move2 | null {
  if (LIB_MOVE[key]) return libMove(LIB_MOVE[key]);
  return moveBaseOf(key);
}

function moveBaseOf(key: string): Move2 | null {
  const tuned = TUNED[key];
  if (tuned && MOVES[tuned]) {
    const f = feedMove(MOVES[tuned]);
    return { ...f, k: f.k.map((row) => [...row, row[2], row[3]]) };
  }
  const art = ART[key];
  if (!art) return null;
  const A = artJoints(art.a, [0, 0]);
  // the pinned point of the picture: its place in B follows from keeping it in A's place
  const anchorOf = (j: Record<string, Pt>) => (art.pin === 'hip' ? j.hip : art.pin === 'hand' ? j.hand : j.toe);
  const B0 = artJoints(art.b, [0, 0]);
  const shift: Pt = [anchorOf(A)[0] - anchorOf(B0)[0], anchorOf(A)[1] - anchorOf(B0)[1]];
  const B = artJoints(art.b, shift);
  const all = [...Object.values(A), ...Object.values(B)];
  const maxY = Math.max(...all.map((q) => q[1]));
  const height = (q: Pt) => (maxY - q[1]) * S; // above the lowest point of the pictures, cm
  const anchor = anchorOf(A);
  const frames = [frameOf(art.a), frameOf(art.b)];

  // pin
  let p = 1;
  let px = 0;
  let py = 0;
  if (art.pin === 'hip') {
    p = 3;
    py = height(A.hip);
  } else if (art.pin === 'hand') {
    p = 2;
    py = height(A.hand) + (art.hang ? 22 : 0);
  } else {
    const h = height(A.toe);
    if (h > 4) {
      p = 4;
      py = h;
    }
  }

  // equipment: in the picture relative to the pinned point, or on a joint
  const world = (x: number, y: number): Pt => [px + (x - anchor[0]) * S, (y - maxY) * S + (art.hang ? -22 : 0)];
  const g: Shape[] = [];
  const colour = (c?: string) => COLOUR[c ?? 'gear'] ?? 0;
  for (const it of art.gear ?? ([] as Item[])) {
    const at = 'at' in it && it.at ? AT[it.at] : 0;
    if (key === 'kb_swing') continue;
    if (it.k === 'circle') {
      const [ox, oy] = [it.x * S, it.y * S];
      if (it.at && it.r >= 6) g.push([7, at, r1(ox), r1(oy)]);
      else if (it.at && it.r >= 3.5) g.push([8, at, r1(ox), r1(oy)]);
      else if (it.at) g.push([3, at, r1(ox), r1(oy), 2.6, 3]);
      else {
        const [wx, wy] = world(it.x, it.y);
        g.push([3, 0, r1(wx), r1(wy), r1(it.r * S), colour(it.c)]);
      }
    } else if (it.k === 'rect') {
      if (it.at) g.push([1, at, r1(it.x * S), r1(it.y * S), r1((it.x + it.w) * S), r1((it.y + it.h) * S), colour(it.c)]);
      else {
        const [x0, y0] = world(it.x, it.y);
        const [x1, y1] = world(it.x + it.w, it.y + it.h);
        g.push([1, 0, r1(x0), r1(y0), r1(x1), r1(y1), colour(it.c)]);
      }
    } else if (it.k === 'line') {
      if (it.at) g.push([2, at, r1(it.x1 * S), r1(it.y1 * S), r1(it.x2 * S), r1(it.y2 * S), r1((it.w ?? 2) * S * 0.7), colour(it.c)]);
      else {
        const [x0, y0] = world(it.x1, it.y1);
        const [x1, y1] = world(it.x2, it.y2);
        g.push([2, 0, r1(x0), r1(y0), r1(x1), r1(y1), r1((it.w ?? 2) * S * 0.7), colour(it.c)]);
      }
    } else if (it.k === 'stand') {
      const [x0, y0] = world(it.x1, it.y);
      const [x1] = world(it.x2, it.y);
      g.push([4, 0, r1(x0), r1(x1), r1(y0), r1((it.h ?? 4) * S * 0.9), colour(it.c)]);
    } else if (it.k === 'to') {
      const [x0, y0] = world(it.x, it.y);
      g.push([5, 0, r1(x0), r1(y0), 0, 0, it.c === 'accent' ? 4 : 0]);
    } else if (it.k === 'poly') {
      const pts = it.pts.flatMap((q) => (it.at ? [r1(q[0] * S), r1(q[1] * S)] : world(q[0], q[1]).map(r1)));
      g.push([6, at, ...pts, colour(it.c)]);
    }
  }
  if (key === 'kb_swing') g.push([9, AT.hand, 0, 6]);

  const move: Move2 = { p, x: px, y: r1(py), q: 0, ms: 3000, v: [0, 0, 0, 0], k: frames, ...(g.length ? { g } : {}) };
  move.v = viewOf(move);
  return move;
}

/** The part of the picture to show: the figure in both poses and the equipment, with a margin (cm, y down, floor 0). */
export function viewOf(m: Move2): number[] {
  const xs: number[] = [];
  const ys: number[] = [0];
  for (const f of m.k) {
    const j = skeleton(f, m.p, m.x, m.y);
    for (const q of Object.values(j)) {
      xs.push(q[0]);
      ys.push(q[1]);
    }
    xs.push(j.head[0] - HEAD_R, j.head[0] + HEAD_R);
    ys.push(j.head[1] - HEAD_R);
    // the feet reach about 20 cm in front of the ankle
    xs.push(j.toe[0] + 3, j.ankle[0] - 7);
  }
  const first = skeleton(m.k[0], m.p, m.x, m.y);
  for (const s of m.g ?? []) {
    const at = s[1];
    const base: Pt = at === 0 ? [0, 0] : ((): Pt => {
      const j = [first.hand, first.shoulder, first.hip, first.knee, first.ankle, first.toe, first.head][at - 1];
      return j;
    })();
    const nums = s.slice(2, s[0] === 6 ? s.length - 1 : 6);
    if (s[0] === 4) {
      xs.push(nums[0], nums[1]);
      ys.push(nums[2]);
    } else if (s[0] === 7) {
      xs.push(base[0] + nums[0] - 23, base[0] + nums[0] + 23);
      ys.push(base[1] + nums[1] - 23, base[1] + nums[1] + 23);
    } else if (s[0] === 5) {
      xs.push(nums[0]);
      ys.push(nums[1]);
    } else if (s[0] === 9 || s[0] === 8 || s[0] === 3) {
      xs.push(base[0] + nums[0] - 10, base[0] + nums[0] + 10);
      ys.push(base[1] + nums[1] - 10, base[1] + nums[1] + 10);
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        xs.push(base[0] + nums[i]);
        ys.push(base[1] + nums[i + 1]);
      }
    }
  }
  const pad = 8;
  const l = Math.min(...xs) - pad;
  const r = Math.max(...xs) + pad;
  const top = Math.min(...ys) - pad;
  const bottom = Math.max(...ys) + 4;
  return [Math.round(l), Math.round(top), Math.round(r), Math.round(bottom)];
}

/** What the watch gets for an exercise (null when there is no picture). */
export const feedMove2 = (key: string): Move2 | FeedMove | null => moveOf(key);
