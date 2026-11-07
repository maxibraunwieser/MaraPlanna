"""Preview of the exercise figure: renders the moves of supabase/functions/_shared/exercisePoses.ts as pictures.

The drawing code here is the template for garmin-runapp/source/strength/Figure.mc (same skeleton, same shapes),
so what looks right here looks right on the watch.

    node tools/dump-poses.cjs > bin/poses.json
    python tools/figure_preview.py bin/poses.json bin/figures.png [exercise ...]
"""
import json
import math
import sys

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- body (cm)
TORSO, NECK, HEAD_R = 50.0, 6.0, 9.5
UA, FA, HAND_L = 30.0, 26.0, 4.0
TH, SH = 43.0, 42.0
ANKLE_H = 8.0

SKIN = (224, 172, 136)
SHIRT = (249, 115, 22)
SHORTS = (52, 66, 88)
SHOE = (240, 240, 240)
SOLE = (163, 230, 53)
HAIR = (58, 42, 34)
STEEL = (201, 206, 214)
IRON = (84, 90, 100)
IRON_LIGHT = (140, 147, 158)
PAD = (96, 102, 112)
FRAME = (70, 75, 84)
FLOOR = (44, 44, 44)
FAR = 0.68  # far side is darker
LIGHT = (-0.45, -0.89)  # light from the upper left
WS = 1.1  # body thickness factor


def shade(c, f):
    return tuple(int(v * f) for v in c)


def dirv(a):
    r = math.radians(a)
    return (math.sin(r), math.cos(r))


def up(t):
    r = math.radians(t)
    return (math.sin(r), -math.cos(r))


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- skeleton
def skeleton(p):
    t, hd, ua, fa, th, sh, ft, fth, fsh = p
    hip = (0.0, 0.0)
    U = up(t)
    N = (math.cos(math.radians(t)), math.sin(math.radians(t)))  # front of the chest
    top = add(hip, U, TORSO)
    sj = add(top, U, -4.0)
    HU = up(t + hd)
    head = add(top, HU, NECK + HEAD_R)
    elbow = add(sj, dirv(ua), UA)
    wrist = add(elbow, dirv(fa), FA)
    hand = add(wrist, dirv(fa), HAND_L)
    knee = add(hip, dirv(th), TH)
    ankle = add(knee, dirv(sh), SH)
    fknee = add(hip, dirv(fth), TH)
    fankle = add(fknee, dirv(fsh), SH)
    if abs(fsh - sh) < 8:
        fft = ft
    else:
        sd = dirv(fsh)
        fft = math.degrees(math.atan2(-sd[0], sd[1]))
    return dict(p=p, fft=fft, hip=hip, U=U, N=N, top=top, sj=sj, HU=HU, head=head, elbow=elbow, wrist=wrist, hand=hand,
                knee=knee, ankle=ankle, fknee=fknee, fankle=fankle, ft=ft)


def foot_pts(ankle, ft):
    d = (math.cos(math.radians(ft)), math.sin(math.radians(ft)))
    n = (-d[1], d[0])  # the side of the sole
    def pt(a, b):
        return (ankle[0] + d[0] * a + n[0] * b, ankle[1] + d[1] * a + n[1] * b)
    return d, n, pt


def place(sk, pin):
    kind, px, py = pin
    if kind == 'hip':
        o = (px - sk['hip'][0], -py - sk['hip'][1])
    elif kind == 'hand':
        o = (px - sk['hand'][0], -py - sk['hand'][1])
    else:
        _, _, pt = foot_pts(sk['ankle'], sk['ft'])
        heel, toe = pt(-5, ANKLE_H), pt(18, ANKLE_H)
        if kind == 'toe':
            o = (px - toe[0], 0 - toe[1])
        else:
            low = max(heel[1], toe[1])
            o = (px - sk['ankle'][0], 0 - low)
    out = {}
    for k, v in sk.items():
        if isinstance(v, tuple) and len(v) == 2 and k not in ('U', 'N', 'HU'):
            out[k] = (v[0] + o[0], v[1] + o[1])
        else:
            out[k] = v
    return out


def pose_at(move, phase):
    """phase 0..1 over one repetition: through the frames and back, eased."""
    fr = move['frames']
    path = fr + fr[-2::-1]
    n = len(path) - 1
    x = (phase % 1.0) * n
    i = min(int(x), n - 1)
    s = smooth(x - i)
    return [lerp(path[i][k], path[i + 1][k], s) for k in range(9)]


# ---------------------------------------------------------------- drawing
class Canvas:
    def __init__(self, w, h, ss, scale, ox, oy):
        self.ss, self.s, self.ox, self.oy = ss, scale * ss, ox * ss, oy * ss
        self.im = Image.new('RGB', (w * ss, h * ss), (0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.w, self.h = w, h

    def P(self, p):
        return (self.ox + p[0] * self.s, self.oy + p[1] * self.s)

    def poly(self, pts, fill):
        self.d.polygon([self.P(p) for p in pts], fill=fill)

    def circle(self, c, r, fill=None, outline=None, width=0):
        x, y = self.P(c)
        r *= self.s
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=outline, width=int(width * self.s))

    def line(self, a, b, w, fill):
        self.d.line([self.P(a), self.P(b)], fill=fill, width=max(1, int(w * self.s)))
        self.circle(a, w / 2, fill)
        self.circle(b, w / 2, fill)

    def limb(self, a, b, prof, fill, caps=True, shade_side=True):
        """Tapered limb from a to b; prof = [(t, width)] along the axis."""
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        ux, uy = dx / L, dy / L
        nx, ny = -uy, ux
        left, right = [], []
        for t, w in prof:
            c = (a[0] + dx * t, a[1] + dy * t)
            left.append((c[0] + nx * w / 2, c[1] + ny * w / 2))
            right.append((c[0] - nx * w / 2, c[1] - ny * w / 2))
        self.poly(left + right[::-1], fill)
        if shade_side:
            sgn = 1 if (nx * LIGHT[0] + ny * LIGHT[1]) < 0 else -1
            inner = [(a[0] + dx * t + sgn * nx * w * 0.12, a[1] + dy * t + sgn * ny * w * 0.12) for t, w in prof]
            outer = [(a[0] + dx * t + sgn * nx * w * 0.5, a[1] + dy * t + sgn * ny * w * 0.5) for t, w in prof]
            self.poly(inner + outer[::-1], shade(fill, 0.8))
        if caps:
            self.circle(add(a, (dx, dy), prof[0][0]), prof[0][1] / 2, fill)
            self.circle(add(a, (dx, dy), prof[-1][0]), prof[-1][1] / 2, fill)

    def out(self):
        return self.im.resize((self.w, self.h), Image.LANCZOS)


def draw_leg(cv, hip, knee, ankle, ft, k):
    skin, shorts, shoe = shade(SKIN, k), shade(SHORTS, k), shade(SHOE, k)
    # shank, then thigh (skin), shorts over the upper part of the thigh
    cv.limb(knee, ankle, [(0, 9.6 * WS), (0.3, 10.8 * WS), (0.62, 8.6 * WS), (1, 6.4 * WS)], skin)
    cv.limb(hip, knee, [(0, 16.5 * WS), (0.35, 16.0 * WS), (0.75, 12.0 * WS), (1, 10.2 * WS)], skin)
    cut = 0.58
    mid = (hip[0] + (knee[0] - hip[0]) * cut, hip[1] + (knee[1] - hip[1]) * cut)
    cv.limb(hip, mid, [(0, 17.0 * WS), (0.6, 16.4 * WS), (1, 14.2 * WS)], shorts)
    d, n, pt = foot_pts(ankle, ft)
    cv.poly([pt(-6.2, -4.5), pt(-7.0, 3), pt(-6.2, ANKLE_H), pt(19, ANKLE_H), pt(21.5, 5.2), pt(17, 0), pt(7, -3.2), pt(3.4, -6.6)], shoe)
    cv.poly([pt(-6.2, ANKLE_H - 1.8), pt(19.2, ANKLE_H - 1.8), pt(19, ANKLE_H), pt(-6.2, ANKLE_H)], shade(SOLE, k))


def draw_arm(cv, sj, elbow, wrist, hand, k, front=True):
    skin, shirt = shade(SKIN, k), shade(SHIRT, k)
    cv.limb(elbow, wrist, [(0, 7.4 * WS), (0.25, 7.8 * WS), (0.7, 6.2 * WS), (1, 4.8 * WS)], skin)
    cv.circle(hand, 4.5, skin)
    cv.limb(sj, elbow, [(0, 10.4 * WS), (0.4, 9.8 * WS), (1, 7.6 * WS)], skin)
    mid = add(sj, (elbow[0] - sj[0], elbow[1] - sj[1]), 0.62)
    cv.limb(sj, mid, [(0, 11.0 * WS), (0.6, 10.4 * WS), (1, 9.2 * WS)], shirt)


def draw_torso(cv, s):
    hip, U, N = s['hip'], s['U'], s['N']
    prof = [(0.0, 11.5, 14), (0.2, 11.5, 13), (0.45, 10, 10), (0.7, 14, 10.5), (0.9, 12.5, 11), (1.0, 6.5, 8.5)]
    front, back = [], []
    for t, f, b in prof:
        c = add(hip, U, TORSO * t)
        front.append(add(c, N, f))
        back.append(add(c, N, -b))
    cv.poly(front + back[::-1], SHIRT)
    deep = [add(add(hip, U, TORSO * t), N, -b * 0.45) for t, f, b in prof]
    cv.poly(deep + back[::-1], shade(SHIRT, 0.82))
    cv.circle(hip, 12.5 * WS, SHORTS)
    # waist band of the shorts
    c = add(hip, U, 7.0)
    cv.poly([add(c, N, 11), add(c, N, -13), add(add(c, N, -13), U, -9), add(add(c, N, 11), U, -9)], SHORTS)


def draw_head(cv, s):
    c, HU, N = s['head'], s['HU'], s['N']
    # neck
    cv.limb(add(s['top'], HU, -2), c, [(0, 7.2), (1, 6.4)], shade(SKIN, 0.9))
    cv.circle(c, HEAD_R, SKIN)
    # head frame: f = face direction, u = up
    t, hd = s['p'][0], s['p'][1]
    r = math.radians(t + hd)
    f = (math.cos(r), math.sin(r))
    uu = HU
    def hp(a, rad):
        ar = math.radians(a)
        return (c[0] + (f[0] * math.cos(ar) + uu[0] * math.sin(ar)) * rad, c[1] + (f[1] * math.cos(ar) + uu[1] * math.sin(ar)) * rad)
    outer = [hp(a, HEAD_R * 1.04) for a in range(20, 262, 12)]
    inner = [hp(a, HEAD_R * 0.62) for a in range(250, 34, -14)]
    cv.poly(outer + inner, HAIR)
    cv.circle(hp(150, HEAD_R * 0.2), 1.8, shade(SKIN, 0.82))  # ear
    cv.circle(hp(-2, HEAD_R * 0.98), 1.1, shade(SKIN, 0.9))  # nose tip
    cv.circle(hp(14, HEAD_R * 0.62), 1.0, (40, 30, 28))  # eye


def ring(cv, c, r=22.5):
    cv.circle(c, r, fill=None, outline=IRON, width=4.2)
    cv.circle(c, r - 4.2, fill=None, outline=IRON_LIGHT, width=0.9)
    cv.circle(c, 6.5, fill=IRON)
    cv.circle(c, 2.4, fill=STEEL)


def hexagon(cv, c, r=8.5):
    pts = [(c[0] + r * math.cos(math.radians(60 * i + 30)), c[1] + r * math.sin(math.radians(60 * i + 30))) for i in range(6)]
    cv.poly(pts, IRON)
    cv.d.polygon([cv.P((c[0] + (r - 2.2) * math.cos(math.radians(60 * i + 30)), c[1] + (r - 2.2) * math.sin(math.radians(60 * i + 30)))) for i in range(6)], fill=PAD)
    cv.circle(c, 2.2, STEEL)


def equipment(cv, s, move, layer):
    eq = move['equip']
    h = s['hip']
    if layer == 'mid':
        if 'bb' in eq:
            ring(cv, s['wrist'])
        if 'bbs' in eq:
            ring(cv, add(add(s['top'], s['U'], 1.0), s['N'], -4.5))
        if 'lp' in eq:
            r = (math.cos(math.radians(40)), -math.sin(math.radians(40)))
            n = (math.sin(math.radians(40)), math.cos(math.radians(40)))
            c = add(s['ankle'], r, ANKLE_H + 1.5)
            start = add(h, (-6, 30))
            cv.line(start, add(c, r, -6), 3.0, FRAME)
            cv.line(add(start, n, 9), add(add(c, r, -6), n, 9), 3.0, FRAME)
            cv.limb(add(c, n, -38), add(c, n, 38), [(0, 5.0), (1, 5.0)], IRON_LIGHT)
            cv.limb(add(c, r, -6.5), add(add(c, r, -6.5), n, 12), [(0, 7.0), (1, 7.0)], FRAME)
        return
    if layer == 'front':
        if 'db' in eq:
            hexagon(cv, s['hand'])
        if 'dbv' in eq:
            dd = dirv(s['p'][3])
            c = add(s['hand'], dd, -10)
            cv.limb(s['hand'], add(s['hand'], dd, -17), [(0, 3.2), (1, 3.2)], STEEL)
            cv.poly([add(c, (1, 0), 9), add(c, (1, 0), -9), add(add(c, (1, 0), -9), dd, -6), add(add(c, (1, 0), 9), dd, -6)], IRON)
            cv.poly([add(add(s['hand'], dd, -1), (1, 0), 8), add(add(s['hand'], dd, -1), (1, 0), -8), add(add(s['hand'], dd, 3), (1, 0), -8), add(add(s['hand'], dd, 3), (1, 0), 8)], IRON)
        if 'pull' in eq:
            px = h[0] + 44
            cv.line((px - 40, -245), s['hand'], 1.4, STEEL)
            cv.circle((px - 40, -245), 5.5, fill=IRON_LIGHT)
            cv.circle(s['hand'], 2.0, STEEL)
        return
    if layer == 'back':
        if 'bench' in eq:
            cv.poly([(-92, -43), (24, -43), (24, -34), (-92, -34)], PAD)
            cv.poly([(-92, -43), (24, -43), (24, -41.2), (-92, -41.2)], IRON_LIGHT)
            for x in (-82, 14):
                cv.poly([(x - 2.5, -34), (x + 2.5, -34), (x + 2.5, 0), (x - 2.5, 0)], FRAME)
        if 'rack' in eq:
            x = -96 if 'bench' in eq else -44
            top = 150
            cv.poly([(x - 2.5, 0), (x + 2.5, 0), (x + 2.5, -top), (x - 2.5, -top)], FRAME)
            y = -112 if 'bench' in eq else -141
            cv.poly([(x, y - 3), (x + 30, y - 3), (x + 30, y), (x, y + 1)], IRON_LIGHT)
        if 'bar' in eq:
            x = s['hand'][0]
            top = s['hand'][1]
            cv.poly([(x + 55, 0), (x + 61, 0), (x + 61, top - 12), (x + 55, top - 12)], FRAME)
            cv.poly([(x, top - 4), (x + 61, top - 12), (x + 61, top - 6), (x, top + 2)], FRAME)
        if 'pull' in eq:
            cv.poly([(h[0] - 24, h[1] + 5), (h[0] + 16, h[1] + 5), (h[0] + 16, h[1] + 12), (h[0] - 24, h[1] + 12)], PAD)
            cv.poly([(h[0] - 3, h[1] + 12), (h[0] + 3, h[1] + 12), (h[0] + 3, 0), (h[0] - 3, 0)], FRAME)
            px = h[0] + 44
            cv.poly([(px - 3, 0), (px + 3, 0), (px + 3, -246), (px - 3, -246)], FRAME)
            cv.poly([(px - 40, -250), (px + 3, -250), (px + 3, -240), (px - 40, -240)], FRAME)
        if 'lp' in eq:
            back_pad0 = add(h, s['N'], -13)
            back_pad1 = add(add(h, s['U'], 52), s['N'], -13)
            cv.limb(back_pad0, back_pad1, [(0, 8), (1, 8)], PAD)
            cv.poly([(h[0] - 20, h[1] + 14), (h[0] + 8, h[1] + 14), (h[0] + 8, h[1] + 20), (h[0] - 20, h[1] + 20)], PAD)


def draw_figure(cv, move, phase, ground=True):
    s = place(skeleton(pose_at(move, phase)), move['pin'])
    if ground:
        cv.d.rectangle([0, cv.P((0, 0))[1], cv.im.width, cv.P((0, 0))[1] + 1.6 * cv.s], fill=FLOOR)
        # grounding shadow
        fx = s['ankle'][0]
        cv.d.ellipse([cv.P((fx - 30, -1.2))[0], cv.P((0, -1.2))[1], cv.P((fx + 34, 3))[0], cv.P((0, 3))[1]], fill=(26, 26, 26))
    equipment(cv, s, move, 'back')
    draw_arm(cv, s['sj'], s['elbow'], s['wrist'], s['hand'], FAR, False)
    draw_leg(cv, s['hip'], s['fknee'], s['fankle'], s['fft'], FAR)
    equipment(cv, s, move, 'mid')
    draw_torso(cv, s)
    draw_leg(cv, s['hip'], s['knee'], s['ankle'], s['ft'], 1.0)
    draw_head(cv, s)
    draw_arm(cv, s['sj'], s['elbow'], s['wrist'], s['hand'], 1.0)
    equipment(cv, s, move, 'front')
    return s


def bounds(move):
    xs, ys = [], []
    for i in range(0, 21):
        s = place(skeleton(pose_at(move, i / 20)), move['pin'])
        for k in ('hip', 'top', 'head', 'elbow', 'hand', 'knee', 'ankle', 'fknee', 'fankle'):
            xs.append(s[k][0])
            ys.append(s[k][1])
    return min(xs), max(xs), min(ys), max(ys)


def auto_view(move):
    """Box [x0, y0, x1, y1] in cm (y down, floor = 0) around everything the move draws, found by rendering it."""
    sc = 2.0
    cv = Canvas(700, 700, 1, sc, 350, 560)
    cv.d.rectangle([0, 0, 700, 700], fill=(0, 0, 0))
    for i in range(41):
        draw_figure(cv, move, i / 40, ground=False)
    box = cv.im.convert('L').point(lambda v: 255 if v > 6 else 0).getbbox()
    x0, y0, x1, y1 = box
    return [round((x0 - 350) / sc - 3), round((y0 - 560) / sc - 3), round((x1 - 350) / sc + 3), max(round((y1 - 560) / sc + 3), 3)]


def main():
    if sys.argv[1] == '--views':
        moves = json.load(open(sys.argv[2], encoding='utf-8'))
        print(json.dumps({k: auto_view(m) for k, m in moves.items()}))
        return
    src, dst = sys.argv[1], sys.argv[2]
    moves = json.load(open(src, encoding='utf-8'))
    ids = sys.argv[3:] or list(moves)
    cell_w, cell_h, phases = 300, 300, [0.0, 0.25, 0.5]
    sheet = Image.new('RGB', (cell_w * len(phases), cell_h * len(ids)), (0, 0, 0))
    for r, i in enumerate(ids):
        m = moves[i]
        x0, x1, y0, y1 = bounds(m)
        # equipment extends the box a little
        x0, x1, y0, y1 = x0 - 50, x1 + 50, min(y0 - 20, -170), 14
        sc = min((cell_w - 30) / (x1 - x0), (cell_h - 24) / (y1 - y0))
        for c, ph in enumerate(phases):
            cv = Canvas(cell_w, cell_h, 3, sc, cell_w / 2 - sc * (x0 + x1) / 2, (cell_h - sc * (y1 - y0)) / 2 - sc * y0)
            draw_figure(cv, m, ph)
            sheet.paste(cv.out(), (c * cell_w, r * cell_h))
    sheet.save(dst)
    print('saved', dst, sheet.size)


if __name__ == '__main__':
    main()
