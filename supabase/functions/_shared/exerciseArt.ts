// Pictures of the exercises: a figure in its start and end position, drawn from joint angles. No image files: every exercise of the
// catalogue is a small description (two poses and the equipment) that is turned into shapes here, so the pictures work offline, look
// alike and follow the colours of the app.
//
// Angles are in degrees, seen from the side with the figure facing right: 0 = forward, 90 = down, 180 = back, -90 = up.

export type Vec = [number, number];
export type Joint = 'hand' | 'shoulder' | 'hip' | 'knee' | 'ankle' | 'toe' | 'head';

/** Lengths of the body (units of the picture; a standing figure is about 70 high). */
const L = { torso: 24, neck: 8, ua: 12, fa: 11, th: 17, sh: 16, ft: 6 };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const dir = (d: number): Vec => [Math.cos(rad(d)), Math.sin(rad(d))];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];

/** Two segments that reach a point: the angles of both (s = +1 bends the middle joint to the side above/in front of the line). */
function ik(l1: number, l2: number, dx: number, dy: number, s: 1 | -1): { a1: number; a2: number } {
  const reach = Math.hypot(dx, dy) || 0.001;
  const d = Math.min(reach, l1 + l2 - 0.01);
  const [tx, ty] = [(dx / reach) * d, (dy / reach) * d];
  const a = Math.atan2(ty, tx);
  const phi = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const t1 = a - s * phi;
  const t2 = Math.atan2(ty - l1 * Math.sin(t1), tx - l1 * Math.cos(t1));
  return { a1: deg(t1), a2: deg(t2) };
}

/** A leg that puts the ankle at (dx, dy) from the hip (s = +1: knee forward / up). */
export const legTo = (dx: number, dy: number, s: 1 | -1 = 1) => {
  const { a1, a2 } = ik(L.th, L.sh, dx, dy, s);
  return { th: a1, sh: a2 };
};
/** An arm that puts the wrist at (dx, dy) from the shoulder (s = +1: elbow above / in front of the line). */
export const armTo = (dx: number, dy: number, s: 1 | -1 = 1) => {
  const { a1, a2 } = ik(L.ua, L.fa, dx, dy, s);
  return { ua: a1, fa: a2 };
};

export interface Pose {
  /** Direction hip → shoulder. */
  torso: number;
  /** Direction shoulder → head; default: the torso's. */
  head?: number;
  /** Near arm: upper arm and forearm. The far arm follows unless given. */
  ua: number;
  fa: number;
  ua2?: number;
  fa2?: number;
  /** Near leg: thigh, shin, foot. The far leg follows unless given. */
  th: number;
  sh: number;
  ft?: number;
  th2?: number;
  sh2?: number;
  ft2?: number;
}

export type Item =
  | { k: 'rect'; x: number; y: number; w: number; h: number; c?: Colour; at?: Joint; f?: 'A' | 'B' }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number; c?: Colour; at?: Joint; f?: 'A' | 'B' }
  | { k: 'circle'; x: number; y: number; r: number; c?: Colour; fill?: boolean; at?: Joint; f?: 'A' | 'B' }
  | { k: 'poly'; pts: Vec[]; c?: Colour; at?: Joint; f?: 'A' | 'B' }
  /** A line from a fixed point to the hand (cable, band, strap). */
  | { k: 'to'; x: number; y: number; from?: 'ground'; c?: Colour; w?: number; f?: 'A' | 'B' }
  /** A bench or box that stands on the ground: x from–to, top at y (pose space; `h` = thickness). */
  | { k: 'stand'; x1: number; x2: number; y: number; h?: number; c?: Colour; f?: 'A' | 'B' };

export type Colour = 'near' | 'far' | 'torso' | 'gear' | 'accent' | 'floor' | 'light';

export interface ExerciseArt {
  a: Pose;
  b: Pose;
  /** What stays where when the pose changes: the planted foot, the hip (lying) or the hand (hanging). */
  pin?: 'foot' | 'hip' | 'hand';
  gear?: Item[];
  /** No floor line (hanging from a bar). */
  hang?: boolean;
  /** Held in one position (plank): one picture is enough. */
  still?: boolean;
}

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: Colour }
  | { t: 'circle'; x: number; y: number; r: number; c: Colour; fill: boolean }
  | { t: 'poly'; pts: Vec[]; c: Colour };

export interface Frame {
  prims: Prim[];
}
export interface Drawing {
  /** Size of one frame. */
  w: number;
  h: number;
  /** One picture is enough (a held position). */
  still: boolean;
  frames: [Frame, Frame];
}

export const FRAME_W = 100;
export const FRAME_H = 80;

interface Joints {
  hip: Vec; shoulder: Vec; head: Vec;
  elbow: Vec; hand: Vec; elbow2: Vec; hand2: Vec;
  knee: Vec; ankle: Vec; toe: Vec; knee2: Vec; ankle2: Vec; toe2: Vec;
}

function joints(p: Pose, hip: Vec = [0, 0]): Joints {
  const shoulder = add(hip, mul(dir(p.torso), L.torso));
  const head = add(shoulder, mul(dir(p.head ?? p.torso), L.neck));
  const elbow = add(shoulder, mul(dir(p.ua), L.ua));
  const hand = add(elbow, mul(dir(p.fa), L.fa));
  const elbow2 = add(shoulder, mul(dir(p.ua2 ?? p.ua), L.ua));
  const hand2 = add(elbow2, mul(dir(p.fa2 ?? p.fa), L.fa));
  const knee = add(hip, mul(dir(p.th), L.th));
  const ankle = add(knee, mul(dir(p.sh), L.sh));
  const toe = add(ankle, mul(dir(p.ft ?? 0), L.ft));
  const knee2 = add(hip, mul(dir(p.th2 ?? p.th), L.th));
  const ankle2 = add(knee2, mul(dir(p.sh2 ?? p.sh), L.sh));
  const toe2 = add(ankle2, mul(dir(p.ft2 ?? p.ft ?? 0), L.ft));
  return { hip, shoulder, head, elbow, hand, elbow2, hand2, knee, ankle, toe, knee2, ankle2, toe2 };
}

const POINTS = (j: Joints): Vec[] => [j.hip, j.shoulder, j.head, j.elbow, j.hand, j.elbow2, j.hand2, j.knee, j.ankle, j.toe, j.knee2, j.ankle2, j.toe2];

/** Where a frame's joints are, with the pin of the exercise keeping the planted part in the same place in both frames. */
function place(art: ExerciseArt): [Joints, Joints] {
  const ja = joints(art.a);
  const jb0 = joints(art.b);
  const anchor = (j: Joints): Vec => (art.pin === 'hip' ? j.hip : art.pin === 'hand' ? j.hand : j.toe);
  const shift = add(anchor(ja), mul(anchor(jb0), -1));
  return [ja, joints(art.b, shift)];
}

const jointAt = (j: Joints, at: Joint): Vec => (at === 'hand' ? j.hand : at === 'shoulder' ? j.shoulder : at === 'hip' ? j.hip : at === 'knee' ? j.knee : at === 'ankle' ? j.ankle : at === 'toe' ? j.toe : j.head);

/** The picture of an exercise: both frames, scaled and moved to fit, standing on one ground line. */
export function draw(art: ExerciseArt): Drawing {
  const js = place(art);
  const pts = js.flatMap(POINTS);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  // Equipment that sits at a fixed place counts for the size of the picture.
  for (const it of art.gear ?? []) {
    if (it.k === 'rect' && !it.at) {
      xs.push(it.x, it.x + it.w);
      ys.push(it.y, it.y + it.h);
    } else if (it.k === 'stand') {
      xs.push(it.x1, it.x2);
      ys.push(it.y);
    } else if (it.k === 'line' && !it.at) {
      xs.push(it.x1, it.x2);
      ys.push(it.y1, it.y2);
    } else if (it.k === 'to') {
      xs.push(it.x);
      ys.push(it.y);
    } else if (it.k === 'circle' && it.at) {
      for (const j of js) {
        const q = jointAt(j, it.at);
        xs.push(q[0] + it.x - it.r, q[0] + it.x + it.r);
        ys.push(q[1] + it.y - it.r, q[1] + it.y + it.r);
      }
    } else if (it.k === 'poly' && !it.at) {
      for (const p of it.pts) {
        xs.push(p[0]);
        ys.push(p[1]);
      }
    }
  }
  const [x0, x1] = [Math.min(...xs) - 6, Math.max(...xs) + 6];
  const [y0, y1] = [Math.min(...ys) - 9, Math.max(...ys) + 3];
  // The ground: the lowest point of either frame (equipment that stands on the floor reaches down to it).
  const ground = Math.max(...pts.map((p) => p[1])) + 3;
  const scale = Math.min(1.25, (FRAME_W - 4) / (x1 - x0), (FRAME_H - 4) / (Math.max(y1, ground) - y0));
  const cx = (x0 + x1) / 2;
  const fx = (p: Vec): Vec => [FRAME_W / 2 + (p[0] - cx) * scale, FRAME_H - 5 + (p[1] - ground) * scale];

  const frame = (j: Joints, which: 'A' | 'B'): Frame => {
    const prims: Prim[] = [];
    const g = (p: Vec) => fx(p);
    const seg = (p: Vec, q: Vec, w: number, c: Colour) => {
      const [a, b] = [g(p), g(q)];
      prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: w * scale, c });
    };
    // the ground
    const gy = fx([0, ground])[1];
    if (!art.hang) prims.push({ t: 'line', x1: 4, y1: gy, x2: FRAME_W - 4, y2: gy, w: 1.2, c: 'floor' });
    // equipment behind the body
    for (const it of art.gear ?? []) if (!it.f || it.f === which) item(it, j, true);
    // far limbs, then the body, then the near limbs
    seg(j.hip, j.knee2, 4.6, 'far');
    seg(j.knee2, j.ankle2, 4.2, 'far');
    seg(j.ankle2, j.toe2, 3.4, 'far');
    seg(j.shoulder, j.elbow2, 3.8, 'far');
    seg(j.elbow2, j.hand2, 3.4, 'far');
    seg(j.hip, j.shoulder, 7.2, 'torso');
    seg(j.hip, j.knee, 5.4, 'near');
    seg(j.knee, j.ankle, 4.8, 'near');
    seg(j.ankle, j.toe, 3.8, 'near');
    const hd = g(j.head);
    prims.push({ t: 'circle', x: hd[0], y: hd[1], r: 5.6 * scale, c: 'near', fill: true });
    seg(j.shoulder, j.elbow, 4.4, 'near');
    seg(j.elbow, j.hand, 3.8, 'near');
    // equipment in front of the body
    for (const it of art.gear ?? []) if (!it.f || it.f === which) item(it, j, false);
    return { prims };

    function item(it: Item, jj: Joints, behind: boolean) {
      // Weights and straps are drawn in front of the hand, everything that stands on the floor behind the figure.
      const front = it.k === 'circle' || it.k === 'to' || (it.k === 'line' && !!it.at);
      if (front === behind) return;
      const off = (it as { at?: Joint }).at ? jointAt(jj, (it as { at: Joint }).at) : ([0, 0] as Vec);
      const P = (x: number, y: number): Vec => g([off[0] + x, off[1] + y]);
      const c = (it as { c?: Colour }).c ?? 'gear';
      if (it.k === 'rect') {
        const [a, b] = [P(it.x, it.y), P(it.x + it.w, it.y + it.h)];
        prims.push({ t: 'poly', pts: [a, [b[0], a[1]], b, [a[0], b[1]]], c });
      } else if (it.k === 'poly') {
        prims.push({ t: 'poly', pts: it.pts.map((q) => P(q[0], q[1])), c });
      } else if (it.k === 'line') {
        const [a, b] = [P(it.x1, it.y1), P(it.x2, it.y2)];
        prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: (it.w ?? 2) * scale, c });
      } else if (it.k === 'circle') {
        const a = P(it.x, it.y);
        prims.push({ t: 'circle', x: a[0], y: a[1], r: it.r * scale, c: it.c ?? 'accent', fill: it.fill ?? true });
      } else if (it.k === 'to') {
        const a = g([it.x, it.y]);
        const b = g(jj.hand);
        prims.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: (it.w ?? 1.4) * scale, c: it.c ?? 'gear' });
        prims.push({ t: 'circle', x: a[0], y: a[1], r: 2.2 * scale, c: 'gear', fill: false });
      } else if (it.k === 'stand') {
        const [a, b] = [g([it.x1, it.y]), g([it.x2, it.y + (it.h ?? 4)])];
        prims.push({ t: 'poly', pts: [a, [b[0], a[1]], b, [a[0], b[1]]], c });
        const bottom = gy;
        for (const x of [it.x1 + 3, it.x2 - 3]) {
          const p = g([x, it.y + (it.h ?? 4)]);
          prims.push({ t: 'line', x1: p[0], y1: p[1], x2: p[0], y2: bottom, w: 1.6 * scale, c });
        }
      }
    }
  };
  return { w: FRAME_W, h: FRAME_H, still: !!art.still, frames: [frame(js[0], 'A'), frame(js[1], 'B')] };
}
