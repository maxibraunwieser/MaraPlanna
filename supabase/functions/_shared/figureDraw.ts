// The figure of the watch, drawn for the website: a line-by-line port of garmin-runapp/source/strength/Figure.mc (skeleton, limbs,
// trunk, head, equipment, and the coloured muscles), so the picture on the website and on the watch is the same.
// It returns a list of shapes in cm (y down, floor 0); the website turns them into SVG. No imports of app code.

import { MUSCLE_IDS, OVERLAY } from './figureMuscles.ts';

export type FigurePrim =
  | { t: 'poly'; p: number[]; c: number }
  | { t: 'disc'; x: number; y: number; r: number; c: number }
  | { t: 'ring'; x: number; y: number; r: number; w: number; c: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: number }
  | { t: 'ellipse'; x: number; y: number; rx: number; ry: number; c: number };

/** What the drawing needs of a move (the feed format, see exerciseMoves.ts Move2). */
export interface DrawMove {
  p: number;
  x: number;
  y: number;
  q: number;
  ms: number;
  v: number[];
  k: number[][];
  g?: number[][];
  /** muscles: [main mask, secondary mask] (see figureMuscles.ts) */
  u?: number[];
}

const TORSO = 50, NECK = 6, HEAD_R = 9.5, UPPER_ARM = 30, FOREARM = 26, HAND_L = 4, THIGH = 43, SHANK = 42, ANKLE_H = 8, WS = 1.1;

export const COLOR = {
  SKIN: 0xd8b9a2, SHORTS: 0x2b3445, SHOE: 0xf0f0f0, SOLE: 0xa3e635, HAIR: 0x3a2a22, STEEL: 0xc9ced6, IRON: 0x545a64, IRON_LIGHT: 0x8c939e,
  PAD: 0x606670, FRAME: 0x464b54, FLOOR: 0x2c2c2c, SHADOW: 0x1a1a1a, ACCENT: 0xf97316, MUSCLE: 0xd62828, MUSCLE2: 0xee7b5e,
};
const FAR = 0.68;
/** How far down the thigh the shorts reach; the muscles of the thigh start below (the hip flexor, above, is drawn over them). */
const SHORTS_T = 0.4;
const LIGHT_X = -0.45, LIGHT_Y = -0.89;

// skeleton fields (pairs x, y in cm)
const HIP = 0, TOP = 2, SJ = 4, HEAD = 6, ELBOW = 8, WRIST = 10, HAND = 12, KNEE = 14, ANKLE = 16, FKNEE = 18, FANKLE = 20, UP = 22, NORMAL = 24, HEAD_UP = 26, FOOT = 28, FAR_FOOT = 29, ELBOW2 = 32, WRIST2 = 34, HAND2 = 36, TOE = 38;

const P_SHANK = [0, 9.6, 0.3, 10.8, 0.62, 8.6, 1, 6.4];
const P_THIGH = [0, 16.5, 0.35, 16, 0.75, 12, 1, 10.2];
const P_SHORTS = [0, 17, 0.6, 16.4, 1, 14.2];
const P_FOREARM = [0, 7.4, 0.25, 7.8, 0.7, 6.2, 1, 4.8];
const P_UPPER = [0, 10.4, 0.4, 9.8, 1, 7.6];
const P_NECK = [0, 7.2, 1, 6.4];
const P_TORSO = [0, 11.5, 14, 0.2, 11.5, 13, 0.45, 10, 10, 0.7, 14, 10.5, 0.9, 12.5, 11, 1, 6.5, 8.5];

const rad = (d: number) => d * 0.017453292;
const sinD = (d: number) => Math.sin(rad(d));
const cosD = (d: number) => Math.cos(rad(d));
const shade = (c: number, f: number): number => {
  const r = Math.trunc(((c >> 16) & 0xff) * f);
  const g = Math.trunc(((c >> 8) & 0xff) * f);
  const b = Math.trunc((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
};

/** The pose between the key poses: there and back, eased. phase 0..1 = one repetition. */
export function poseAt(fr: number[][], phase: number): number[] {
  const n = fr.length;
  const segs = 2 * (n - 1);
  const x = (phase - Math.trunc(phase)) * segs;
  let i = Math.trunc(x);
  if (i > segs - 1) i = segs - 1;
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = fr[i < n ? i : 2 * (n - 1) - i];
  const b = fr[i + 1 < n ? i + 1 : 2 * (n - 1) - (i + 1)];
  const out: number[] = [];
  for (let k = 0; k < 11; k++) out.push(a[k] + (b[k] - a[k]) * s);
  return out;
}

/** The joints of a pose, the pinned point where it is told (see Figure.skeleton). */
export function skeletonRaw(p: number[], pin: number, px: number, py: number): number[] {
  const t = p[0];
  const ux = sinD(t), uy = -cosD(t), nx = cosD(t), ny = sinD(t);
  const topX = TORSO * ux, topY = TORSO * uy;
  const sjX = topX - 4 * ux, sjY = topY - 4 * uy;
  const hux = sinD(t + p[1]), huy = -cosD(t + p[1]);
  const headX = topX + (NECK + HEAD_R) * hux, headY = topY + (NECK + HEAD_R) * huy;
  const elbX = sjX + UPPER_ARM * sinD(p[2]), elbY = sjY + UPPER_ARM * cosD(p[2]);
  const wrX = elbX + FOREARM * sinD(p[3]), wrY = elbY + FOREARM * cosD(p[3]);
  const handX = wrX + HAND_L * sinD(p[3]), handY = wrY + HAND_L * cosD(p[3]);
  const elb2X = sjX + UPPER_ARM * sinD(p[9]), elb2Y = sjY + UPPER_ARM * cosD(p[9]);
  const wr2X = elb2X + FOREARM * sinD(p[10]), wr2Y = elb2Y + FOREARM * cosD(p[10]);
  const hand2X = wr2X + HAND_L * sinD(p[10]), hand2Y = wr2Y + HAND_L * cosD(p[10]);
  const kX = THIGH * sinD(p[4]), kY = THIGH * cosD(p[4]);
  const aX = kX + SHANK * sinD(p[5]), aY = kY + SHANK * cosD(p[5]);
  const fkX = THIGH * sinD(p[7]), fkY = THIGH * cosD(p[7]);
  const faX = fkX + SHANK * sinD(p[8]), faY = fkY + SHANK * cosD(p[8]);
  let fft = p[6];
  if (Math.abs(p[8] - p[5]) >= 8) fft = (Math.atan2(-sinD(p[8]), cosD(p[8])) * 180) / Math.PI;
  const d = [cosD(p[6]), sinD(p[6])];
  const nrm = [-d[1], d[0]];
  const heelY = aY + d[1] * -5 + nrm[1] * ANKLE_H;
  const toeX = aX + d[0] * 18 + nrm[0] * ANKLE_H;
  const toeY = aY + d[1] * 18 + nrm[1] * ANKLE_H;
  let offX = 0, offY = 0;
  if (pin === 3) { offX = px; offY = -py; }
  else if (pin === 2) { offX = px - handX; offY = -py - handY; }
  else if (pin === 4) { offX = px - toeX; offY = -py - toeY; }
  else if (pin === 1) { offX = px - toeX; offY = 0 - toeY; }
  else { offX = px - aX; offY = 0 - (heelY > toeY ? heelY : toeY); }
  return [
    offX, offY, topX + offX, topY + offY, sjX + offX, sjY + offY, headX + offX, headY + offY,
    elbX + offX, elbY + offY, wrX + offX, wrY + offY, handX + offX, handY + offY,
    kX + offX, kY + offY, aX + offX, aY + offY, fkX + offX, fkY + offY, faX + offX, faY + offY,
    ux, uy, nx, ny, hux, huy, p[6], fft, p[0], p[1],
    elb2X + offX, elb2Y + offY, wr2X + offX, wr2Y + offY, hand2X + offX, hand2Y + offY, toeX + offX, toeY + offY,
  ];
}

export interface FigureOptions {
  /** show the trained muscles (default true) */
  muscles?: boolean;
}

/** All shapes of the figure of a move at a phase (0..1), floor included; the view of the move says what part to show. */
export function drawFigure(m: DrawMove, phase: number, opts: FigureOptions = {}): FigurePrim[] {
  const sk = skeletonRaw(poseAt(m.k, phase), m.p, m.x, m.y);
  const out: FigurePrim[] = [];
  const mus = opts.muscles === false ? [0, 0] : [m.u?.[0] ?? 0, m.u?.[1] ?? 0];
  const poly = (p: number[], c: number) => out.push({ t: 'poly', p, c });
  const disc = (x: number, y: number, r: number, c: number) => out.push({ t: 'disc', x, y, r, c });
  const ring = (x: number, y: number, r: number, w: number, c: number) => out.push({ t: 'ring', x, y, r, w, c });
  const line = (x1: number, y1: number, x2: number, y2: number, w: number, c: number) => out.push({ t: 'line', x1, y1, x2, y2, w, c });
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number) => poly([x0, y0, x1, y0, x1, y1, x0, y1], c);

  const limb = (ax: number, ay: number, bx: number, by: number, prof: number[], ws: number, color: number, shading: boolean) => {
    const dx = bx - ax, dy = by - ay;
    let len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) len = 1;
    const nx = -dy / len, ny = dx / len;
    const n = prof.length / 2;
    const left: number[] = [], right: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = prof[2 * i], w = prof[2 * i + 1] * ws;
      const cx = ax + dx * t, cy = ay + dy * t;
      left.push(cx + (nx * w) / 2, cy + (ny * w) / 2);
      right.push(cx - (nx * w) / 2, cy - (ny * w) / 2);
    }
    const flat = [...left];
    for (let i = n - 1; i >= 0; i--) flat.push(right[2 * i], right[2 * i + 1]);
    poly(flat, color);
    if (shading) {
      const sgn = nx * LIGHT_X + ny * LIGHT_Y < 0 ? 1 : -1;
      const strip: number[] = [];
      for (let i = 0; i < n; i++) {
        const w = prof[2 * i + 1] * ws;
        strip.push(ax + dx * prof[2 * i] + sgn * nx * w * 0.12, ay + dy * prof[2 * i] + sgn * ny * w * 0.12);
      }
      for (let i = n - 1; i >= 0; i--) {
        const w = prof[2 * i + 1] * ws;
        strip.push(ax + dx * prof[2 * i] + sgn * nx * w * 0.5, ay + dy * prof[2 * i] + sgn * ny * w * 0.5);
      }
      poly(strip, shade(color, 0.8));
    }
    disc(ax + dx * prof[0], ay + dy * prof[0], (prof[1] * ws) / 2, color);
    disc(ax + dx * prof[2 * n - 2], ay + dy * prof[2 * n - 2], (prof[2 * n - 1] * ws) / 2, color);
  };

  /** Width of a profile (pairs t, w) at t. */
  const widthAt = (prof: number[], t: number): number => {
    const n = prof.length / 2;
    if (t <= prof[0]) return prof[1];
    for (let i = 1; i < n; i++) {
      if (t <= prof[2 * i]) {
        const f = (t - prof[2 * i - 2]) / (prof[2 * i] - prof[2 * i - 2]);
        return prof[2 * i - 1] + (prof[2 * i + 1] - prof[2 * i - 1]) * f;
      }
    }
    return prof[2 * n - 1];
  };

  /** The colour of the muscles of a mask on a body part (the main ones stronger), `k` darkens the far side. */
  const muscleColors = (k: number): [number, number] => [shade(COLOR.MUSCLE, k), shade(COLOR.MUSCLE2, k)];

  /** A muscle on a limb (from a to b): a belly-shaped patch between two sides of the limb. */
  const patch = (ax: number, ay: number, bx: number, by: number, prof: number[], ws: number, ov: number[], color: number) => {
    const dx = bx - ax, dy = by - ay;
    let len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) len = 1;
    // front: the side the figure faces (rotate the direction upper end -> lower end by -90 degrees)
    const fx = dy / len, fy = -dx / len;
    const [t0, t1, s0, s1] = [ov[1], ov[2], ov[3], ov[4]];
    const N = 6;
    const lo: number[] = [], hi: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const t = t0 + (t1 - t0) * u;
      const hw = (widthAt(prof, t) * ws) / 2;
      const env = 0.5 + 0.5 * Math.sin(Math.PI * u);
      const cx = ax + dx * t, cy = ay + dy * t;
      const mid = (s0 + s1) / 2, half = ((s1 - s0) / 2) * env;
      lo.push(cx + fx * hw * (mid - half), cy + fy * hw * (mid - half));
      hi.push(cx + fx * hw * (mid + half), cy + fy * hw * (mid + half));
    }
    const flat = [...lo];
    for (let i = N; i >= 0; i--) flat.push(hi[2 * i], hi[2 * i + 1]);
    poly(flat, color);
  };

  /** The muscles of a limb segment (seg 1 thigh, 2 shin, 3 upper arm, 4 forearm) with the colours of main / secondary. */
  const limbMuscles = (seg: number, ax: number, ay: number, bx: number, by: number, prof: number[], k: number) => {
    const [c1, c2] = muscleColors(k);
    for (let i = 0; i < MUSCLE_IDS.length; i++) {
      const ov0 = OVERLAY[MUSCLE_IDS[i]];
      if (ov0[0] !== seg) continue;
      const ov = seg === 1 && ov0[2] > SHORTS_T ? [ov0[0], Math.max(ov0[1], SHORTS_T + 0.02), ov0[2], ov0[3], ov0[4]] : ov0;
      const bit = 1 << i;
      if (mus[1] & bit) patch(ax, ay, bx, by, prof, WS, ov, c2);
      if (mus[0] & bit) patch(ax, ay, bx, by, prof, WS, ov, c1);
    }
  };

  const footPoints = (ab: number[], ax: number, ay: number, dX: number, dY: number, nX: number, nY: number): number[] => {
    const o: number[] = [];
    for (let i = 0; i + 1 < ab.length; i += 2) o.push(ax + dX * ab[i] + nX * ab[i + 1], ay + dY * ab[i] + nY * ab[i + 1]);
    return o;
  };

  const leg = (kx: number, ky: number, ax: number, ay: number, ft: number, k: number) => {
    const skin = shade(COLOR.SKIN, k), shorts = shade(COLOR.SHORTS, k);
    const hx = sk[HIP], hy = sk[HIP + 1];
    limb(kx, ky, ax, ay, P_SHANK, WS, skin, true);
    limb(hx, hy, kx, ky, P_THIGH, WS, skin, true);
    limb(hx, hy, hx + (kx - hx) * SHORTS_T, hy + (ky - hy) * SHORTS_T, P_SHORTS, WS, shorts, true);
    limbMuscles(2, kx, ky, ax, ay, P_SHANK, k);
    limbMuscles(1, hx, hy, kx, ky, P_THIGH, k);
    const dX = cosD(ft), dY = sinD(ft), nX = -dY, nY = dX;
    const shoe = [-6.2, -4.5, -7, 3, -6.2, ANKLE_H, 19, ANKLE_H, 21.5, 5.2, 17, 0, 7, -3.2, 3.4, -6.6];
    poly(footPoints(shoe, ax, ay, dX, dY, nX, nY), shade(COLOR.SHOE, k));
    const sole = [-6.2, ANKLE_H - 1.8, 19.2, ANKLE_H - 1.8, 19, ANKLE_H, -6.2, ANKLE_H];
    poly(footPoints(sole, ax, ay, dX, dY, nX, nY), shade(COLOR.SOLE, k));
  };

  const arm = (k: number, far: boolean) => {
    const skin = shade(COLOR.SKIN, k);
    const sx = sk[SJ], sy = sk[SJ + 1];
    const ei = far ? ELBOW2 : ELBOW, wi = far ? WRIST2 : WRIST, hi = far ? HAND2 : HAND;
    const ex = sk[ei], ey = sk[ei + 1];
    limb(ex, ey, sk[wi], sk[wi + 1], P_FOREARM, WS, skin, true);
    disc(sk[hi], sk[hi + 1], 4.5, skin);
    limb(sx, sy, ex, ey, P_UPPER, WS, skin, true);
    limbMuscles(4, ex, ey, sk[wi], sk[wi + 1], P_FOREARM, k);
    limbMuscles(3, sx, sy, ex, ey, P_UPPER, k);
    // shoulder muscle: a disc on the joint
    const [c1, c2] = muscleColors(k);
    const di = MUSCLE_IDS.indexOf('delts');
    if (mus[1] & (1 << di)) disc(sx, sy, 6.4, c2);
    if (mus[0] & (1 << di)) disc(sx, sy, 6.4, c1);
  };

  const torso = () => {
    const hx = sk[HIP], hy = sk[HIP + 1], ux = sk[UP], uy = sk[UP + 1], nx = sk[NORMAL], ny = sk[NORMAL + 1];
    const prof = P_TORSO;
    const n = prof.length / 3;
    const front: number[] = [], back: number[] = [], deep: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = prof[3 * i];
      const cx = hx + ux * TORSO * t, cy = hy + uy * TORSO * t;
      front.push(cx + nx * prof[3 * i + 1], cy + ny * prof[3 * i + 1]);
      back.push(cx - nx * prof[3 * i + 2], cy - ny * prof[3 * i + 2]);
      deep.push(cx - nx * prof[3 * i + 2] * 0.45, cy - ny * prof[3 * i + 2] * 0.45);
    }
    const body = [...front], dark = [...deep];
    for (let i = n - 1; i >= 0; i--) {
      body.push(back[2 * i], back[2 * i + 1]);
      dark.push(back[2 * i], back[2 * i + 1]);
    }
    poly(body, shade(COLOR.SKIN, 0.97));
    poly(dark, shade(COLOR.SKIN, 0.82));
    // muscles of the trunk: between the back edge (offset -1) and the front edge (+1) of the profile
    const at = (t: number, s: number): [number, number] => {
      const depth = s >= 0 ? widthTorso(t, 1) * s : widthTorso(t, 2) * s;
      return [hx + ux * TORSO * t + nx * depth, hy + uy * TORSO * t + ny * depth];
    };
    const widthTorso = (t: number, col: number): number => {
      for (let i = 1; i < n; i++) {
        if (t <= prof[3 * i]) {
          const f = (t - prof[3 * i - 3]) / (prof[3 * i] - prof[3 * i - 3]);
          return prof[3 * i - 3 + col] + (prof[3 * i + col] - prof[3 * i - 3 + col]) * f;
        }
      }
      return prof[3 * n - 3 + col];
    };
    for (let i = 0; i < MUSCLE_IDS.length; i++) {
      const ov = OVERLAY[MUSCLE_IDS[i]];
      if (ov[0] !== 0) continue;
      const bit = 1 << i;
      if (!((mus[0] | mus[1]) & bit)) continue;
      const [t0, t1, s0, s1] = [ov[1], ov[2], ov[3], ov[4]];
      const N = 6;
      const lo: number[] = [], hi: number[] = [];
      for (let j = 0; j <= N; j++) {
        const u = j / N;
        const t = t0 + (t1 - t0) * u;
        const env = 0.5 + 0.5 * Math.sin(Math.PI * u);
        const mid = (s0 + s1) / 2, half = ((s1 - s0) / 2) * env;
        lo.push(...at(Math.min(t, 1), mid - half));
        hi.push(...at(Math.min(t, 1), mid + half));
      }
      const flat = [...lo];
      for (let j = N; j >= 0; j--) flat.push(hi[2 * j], hi[2 * j + 1]);
      poly(flat, mus[0] & bit ? COLOR.MUSCLE : COLOR.MUSCLE2);
    }
    disc(hx, hy, 12.5 * WS, COLOR.SHORTS);
    const cx = hx + ux * 7, cy = hy + uy * 7;
    poly([cx + nx * 11, cy + ny * 11, cx - nx * 13, cy - ny * 13, cx - nx * 13 - ux * 9, cy - ny * 13 - uy * 9, cx + nx * 11 - ux * 9, cy + ny * 11 - uy * 9], COLOR.SHORTS);
    // buttock: a disc on the shorts, behind the hip
    const gi = MUSCLE_IDS.indexOf('glutes');
    if ((mus[0] | mus[1]) & (1 << gi)) {
      out.push({ t: 'ellipse', x: hx - nx * 5.5 - ux * 1.5, y: hy - ny * 5.5 - uy * 1.5, rx: 9.5, ry: 9.5, c: mus[0] & (1 << gi) ? COLOR.MUSCLE : COLOR.MUSCLE2 });
    }
  };

  const head = () => {
    const cx = sk[HEAD], cy = sk[HEAD + 1], hux = sk[HEAD_UP], huy = sk[HEAD_UP + 1];
    limb(sk[TOP] - hux * 2, sk[TOP + 1] - huy * 2, cx, cy, P_NECK, 1, shade(COLOR.SKIN, 0.9), true);
    disc(cx, cy, HEAD_R, COLOR.SKIN);
    const a = sk[30] + sk[31];
    const fx = cosD(a), fy = sinD(a);
    const hair: number[] = [];
    for (let d = 20; d < 262; d += 12) hair.push(cx + (fx * cosD(d) + hux * sinD(d)) * HEAD_R * 1.04, cy + (fy * cosD(d) + huy * sinD(d)) * HEAD_R * 1.04);
    for (let d = 250; d > 34; d -= 14) hair.push(cx + (fx * cosD(d) + hux * sinD(d)) * HEAD_R * 0.62, cy + (fy * cosD(d) + huy * sinD(d)) * HEAD_R * 0.62);
    poly(hair, COLOR.HAIR);
    const r = HEAD_R;
    const pt = (deg: number, k: number): [number, number] => [cx + (fx * cosD(deg) + hux * sinD(deg)) * r * k, cy + (fy * cosD(deg) + huy * sinD(deg)) * r * k];
    disc(...pt(150, 0.2), 1.8, shade(COLOR.SKIN, 0.82));
    disc(...pt(-2, 0.98), 1.1, shade(COLOR.SKIN, 0.9));
    disc(...pt(14, 0.62), 1.0, 0x281e1c);
  };

  // ---- equipment
  const plate = (x: number, y: number) => {
    ring(x, y, 22.5, 4.2, COLOR.IRON);
    ring(x, y, 18.3, 0.9, COLOR.IRON_LIGHT);
    disc(x, y, 6.5, COLOR.IRON);
    disc(x, y, 2.4, COLOR.STEEL);
  };
  const hexagon = (x: number, y: number) => {
    const outer: number[] = [], inner: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = 60 * i + 30;
      outer.push(x + 8.5 * cosD(a), y + 8.5 * sinD(a));
      inner.push(x + 6.3 * cosD(a), y + 6.3 * sinD(a));
    }
    poly(outer, COLOR.IRON);
    poly(inner, COLOR.PAD);
    disc(x, y, 2.2, COLOR.STEEL);
  };
  const kettlebell = (x: number, y: number) => {
    disc(x, y + 6, 10.5, COLOR.IRON);
    disc(x - 3, y + 3, 2.8, COLOR.IRON_LIGHT);
    ring(x, y - 7, 6.5, 2.6, COLOR.IRON);
  };
  const shapeColour = (c: number) => (c === 1 ? COLOR.IRON : c === 2 ? COLOR.PAD : c === 3 ? COLOR.IRON_LIGHT : c === 4 ? COLOR.ACCENT : COLOR.FRAME);

  const eq = m.q;
  const hx = sk[HIP], hy = sk[HIP + 1];

  const gearBack = () => {
    if (eq & 16) {
      rect(-92, -43, 24, -34, COLOR.PAD);
      rect(-92, -43, 24, -41.2, COLOR.IRON_LIGHT);
      rect(-84.5, -34, -79.5, 0, COLOR.FRAME);
      rect(11.5, -34, 16.5, 0, COLOR.FRAME);
    }
    if (eq & 32) {
      const x = eq & 16 ? -96 : -44;
      rect(x - 2.5, -150, x + 2.5, 0, COLOR.FRAME);
      const y = eq & 16 ? -112 : -141;
      poly([x, y - 3, x + 30, y - 3, x + 30, y, x, y + 1], COLOR.IRON_LIGHT);
    }
    if (eq & 64) {
      const x = sk[HAND], top = sk[HAND + 1];
      rect(x + 55, top - 12, x + 61, 0, COLOR.FRAME);
      poly([x, top - 4, x + 61, top - 12, x + 61, top - 6, x, top + 2], COLOR.FRAME);
    }
    if (eq & 128) {
      rect(hx - 24, hy + 5, hx + 16, hy + 12, COLOR.PAD);
      rect(hx - 3, hy + 12, hx + 3, 0, COLOR.FRAME);
      const px = hx + 44;
      rect(px - 3, -246, px + 3, 0, COLOR.FRAME);
      rect(px - 40, -250, px + 3, -240, COLOR.FRAME);
    }
    if (eq & 256) {
      const ux = sk[UP], uy = sk[UP + 1], nx = sk[NORMAL], ny = sk[NORMAL + 1];
      limb(hx - nx * 13, hy - ny * 13, hx + ux * 52 - nx * 13, hy + uy * 52 - ny * 13, [0, 8, 1, 8], 1, COLOR.PAD, false);
      rect(hx - 20, hy + 14, hx + 8, hy + 20, COLOR.PAD);
    }
  };
  const gearMid = () => {
    if (eq & 1) plate(sk[WRIST], sk[WRIST + 1]);
    if (eq & 2) plate(sk[TOP] + sk[UP] * 1 - sk[NORMAL] * 4.5, sk[TOP + 1] + sk[UP + 1] * 1 - sk[NORMAL + 1] * 4.5);
    if (eq & 256) {
      const rx = cosD(40), ry = -sinD(40), nx = sinD(40), ny = cosD(40);
      const cx = sk[ANKLE] + rx * (ANKLE_H + 1.5), cy = sk[ANKLE + 1] + ry * (ANKLE_H + 1.5);
      const sx = sk[HIP] - 6, sy = sk[HIP + 1] + 30;
      line(sx, sy, cx - rx * 6, cy - ry * 6, 3, COLOR.FRAME);
      line(sx + nx * 9, sy + ny * 9, cx - rx * 6 + nx * 9, cy - ry * 6 + ny * 9, 3, COLOR.FRAME);
      limb(cx - nx * 38, cy - ny * 38, cx + nx * 38, cy + ny * 38, [0, 5, 1, 5], 1, COLOR.IRON_LIGHT, false);
      limb(cx - rx * 6.5, cy - ry * 6.5, cx - rx * 6.5 + nx * 12, cy - ry * 6.5 + ny * 12, [0, 7, 1, 7], 1, COLOR.FRAME, false);
    }
  };
  const forearmAngle = () => (Math.atan2(sk[WRIST] - sk[ELBOW], sk[WRIST + 1] - sk[ELBOW + 1]) * 180) / Math.PI;
  const gearFront = () => {
    const handX = sk[HAND], handY = sk[HAND + 1];
    if (eq & 4) hexagon(handX, handY);
    if (eq & 8) {
      const dx = sinD(forearmAngle()), dy = cosD(forearmAngle());
      const cx = handX - dx * 10, cy = handY - dy * 10;
      limb(handX, handY, handX - dx * 17, handY - dy * 17, [0, 3.2, 1, 3.2], 1, COLOR.STEEL, false);
      poly([cx + 9, cy, cx - 9, cy, cx - 9 - dx * 6, cy - dy * 6, cx + 9 - dx * 6, cy - dy * 6], COLOR.IRON);
      poly([handX + 8, handY - dy, handX - 8, handY - dy, handX - 8 + dx * 3, handY + dy * 3, handX + 8 + dx * 3, handY + dy * 3], COLOR.IRON);
    }
    if (eq & 128) {
      const px = sk[HIP] + 44 - 40;
      line(px, -245, handX, handY, 1.4, COLOR.STEEL);
      disc(px, -245, 5.5, COLOR.IRON_LIGHT);
      disc(handX, handY, 2, COLOR.STEEL);
    }
  };
  const base = (at: number): [number, number] => {
    const idx = [0, HAND, SJ, HIP, KNEE, ANKLE, TOE, HEAD][at] ?? 0;
    return at === 0 ? [0, 0] : [sk[idx], sk[idx + 1]];
  };
  const shapes = (layer: number) => {
    for (const s of m.g ?? []) {
      const t = s[0];
      const l = t === 1 || t === 4 || t === 6 || t === 2 ? 0 : t === 7 ? 1 : 2;
      if (l !== layer) continue;
      const [bx, by] = base(s[1]);
      if (t === 1 && s.length >= 7) rect(bx + s[2], by + s[3], bx + s[4], by + s[5], shapeColour(s[6]));
      else if (t === 2 && s.length >= 8) line(bx + s[2], by + s[3], bx + s[4], by + s[5], s[6], shapeColour(s[7]));
      else if (t === 3 && s.length >= 6) disc(bx + s[2], by + s[3], s[4], shapeColour(s[5]));
      else if (t === 4 && s.length >= 7) {
        rect(s[2], s[4], s[3], s[4] + s[5], shapeColour(s[6]));
        rect(s[2] + 3, s[4] + s[5], s[2] + 8, 0, COLOR.FRAME);
        rect(s[3] - 8, s[4] + s[5], s[3] - 3, 0, COLOR.FRAME);
      } else if (t === 5 && s.length >= 7) {
        const hX = sk[HAND], hY = sk[HAND + 1];
        line(s[2], s[3], hX, hY, s[6] === 4 ? 1.8 : 1.4, s[6] === 4 ? COLOR.ACCENT : COLOR.STEEL);
        disc(s[2], s[3], 5, COLOR.IRON_LIGHT);
        disc(hX, hY, 2, COLOR.STEEL);
      } else if (t === 6 && s.length >= 8) {
        const pts: number[] = [];
        for (let j = 2; j + 1 < s.length - 1; j += 2) pts.push(bx + s[j], by + s[j + 1]);
        poly(pts, shapeColour(s[s.length - 1]));
      } else if (t === 7 && s.length >= 4) plate(bx + s[2], by + s[3]);
      else if (t === 8 && s.length >= 4) hexagon(bx + s[2], by + s[3]);
      else if (t === 9 && s.length >= 4) kettlebell(bx + s[2], by + s[3]);
    }
  };

  // floor and shadow
  const v = m.v;
  rect(v[0] - 200, 0, v[2] + 200, 1.6, COLOR.FLOOR);
  out.push({ t: 'ellipse', x: sk[ANKLE] + 2, y: 0.9, rx: 32, ry: 2.2, c: COLOR.SHADOW });
  gearBack();
  shapes(0);
  arm(FAR, true);
  leg(sk[FKNEE], sk[FKNEE + 1], sk[FANKLE], sk[FANKLE + 1], sk[FAR_FOOT], FAR);
  gearMid();
  shapes(1);
  torso();
  leg(sk[KNEE], sk[KNEE + 1], sk[ANKLE], sk[ANKLE + 1], sk[FOOT], 1);
  head();
  arm(1, false);
  gearFront();
  shapes(2);
  return out;
}
