#!/usr/bin/env python3
"""Rendert eine Uebungsanimation (animierte WebP, transparent) aus einer JSON-Datei.
Aufruf: python render_exercise.py exercises/xyz.json out/
Aus dem Skill exercise-animations (.claude/skills/exercise-animations/SKILL.md); Konstanten nicht pro Uebung aendern."""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS, FRAMES = 512, 2, 48
# Visible part of the 100 x 100 scene: a little more above the head than the original skill, so arms overhead (presses,
# pull-ups) stay in the picture. The same for every exercise, so all figures keep one size.
VIEW_X0, VIEW_Y0, VIEW = -8.0, -14.0, 116.0
U = SIZE * SS / VIEW
X = lambda x: (x - VIEW_X0) * U
Y = lambda y: (y - VIEW_Y0) * U
GROUND_Y, FOOT_T = 90.0, 2.5
BONE = dict(torso=26, neck=3, head_r=5.5, arm=15, fore=14, thigh=22, shin=21, foot=8)
W = dict(torso=14, neck=4, arm=5, fore=4.4, thigh=8, shin=6, foot=3.6)
NEAR, FAR = "#C3CAD6", "#9CA6B5"
EQUIP, EQUIP_DK, FLOOR = "#4B5563", "#374151", "#9CA3AF"

COLORS = {
    "chest": "#EF4444", "back": "#3B82F6", "traps": "#6366F1", "shoulders": "#F97316",
    "biceps": "#A855F7", "triceps": "#EC4899", "forearms": "#14B8A6", "quads": "#22C55E",
    "hamstrings": "#65A30D", "glutes": "#D97706", "calves": "#06B6D4", "core": "#FACC15",
    "hip_flexors": "#0EA5E9",
}
# ("seg", Teil, t0, t1, Breitenfaktor, Offset nach vorn) oder ("dot", Teil, Radius, Offset nach vorn)
ZONES = {
    "chest": [("seg", "torso", .55, .95, .75, 2.5)],
    "back": [("seg", "torso", .35, .95, .75, -2.5)],
    "traps": [("seg", "torso", .88, 1.0, .8, -1.0), ("seg", "neck", 0, 1, .6, 0)],
    "shoulders": [("dot", "shoulder", 5.0, 0), ("seg", "arm", 0, .3, .9, 0)],
    "biceps": [("seg", "arm", .15, .85, .85, 0)],
    "triceps": [("seg", "arm", .15, .85, .85, 0)],
    "forearms": [("seg", "fore", .1, .95, .9, 0)],
    "quads": [("seg", "thigh", .1, .9, .85, 0)],
    "hamstrings": [("seg", "thigh", .1, .9, .85, 0)],
    "glutes": [("dot", "hip", 6.5, -2.0)],
    "calves": [("seg", "shin", .1, .75, .85, 0)],
    "core": [("seg", "torso", .05, .5, .8, 1.5)],
    "hip_flexors": [("dot", "hip", 4.5, 2.5), ("seg", "thigh", 0, .25, .8, 0)],
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return "#%02X%02X%02X" % tuple(round(x + (y - x) * t) for x, y in zip(rgb(a), rgb(b)))


def capsule(d, p, q, w, col):
    P, Q = (X(p[0]), Y(p[1])), (X(q[0]), Y(q[1]))
    r = w * U / 2
    d.line([P, Q], fill=col, width=max(1, int(round(w * U))))
    for c in (P, Q):
        d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=col)


def dot(d, c, r, col):
    d.ellipse([X(c[0] - r), Y(c[1] - r), X(c[0] + r), Y(c[1] + r)], fill=col)


def lerp_pt(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def front_normal(a):
    r = math.radians(a)
    return (-math.cos(r), math.sin(r))


def fk(pose):
    def step(p, a, l):
        r = math.radians(a)
        return (p[0] + math.sin(r) * l, p[1] + math.cos(r) * l)
    hip, ta = tuple(pose["hip"]), pose["torso"]
    j = {"hip": hip, "neck": step(hip, ta, BONE["torso"]), "sh": step(hip, ta, BONE["torso"] * 0.92)}
    j["head"] = step(j["neck"], pose.get("head", ta), BONE["neck"] + BONE["head_r"])
    for s in "nf":
        ua, fa = pose["arm_" + s]
        el = step(j["sh"], ua, BONE["arm"])
        j["el_" + s], j["wr_" + s] = el, step(el, fa, BONE["fore"])
        th, sn, ft = pose["leg_" + s]
        kn = step(hip, th, BONE["thigh"])
        an = step(kn, sn, BONE["shin"])
        j["kn_" + s], j["an_" + s], j["to_" + s] = kn, an, step(an, ft, BONE["foot"])
    return j


def place(ex, pose, ref):
    j, mode = fk(pose), ex.get("ground", "feet")
    if mode == "none":
        return j
    if mode == "feet":
        low = max(j[k][1] for k in ("an_n", "to_n", "an_f", "to_f"))
        dx, dy = ref["an_n"][0] - j["an_n"][0], GROUND_Y - FOOT_T - low
    elif mode == "hands":
        low = max(j["wr_n"][1], j["wr_f"][1])
        dx, dy = ref["wr_n"][0] - j["wr_n"][0], GROUND_Y - 2.0 - low
    else:  # lying
        dx, dy = ref["sh"][0] - j["sh"][0], GROUND_Y - W["torso"] / 2 - j["sh"][1]
    return {k: (x + dx, y + dy) for k, (x, y) in j.items()}


def parts(j, s):
    return {
        "torso": (j["hip"], j["neck"], W["torso"]), "neck": (j["neck"], j["head"], W["neck"]),
        "arm": (j["sh"], j["el_" + s], W["arm"]), "fore": (j["el_" + s], j["wr_" + s], W["fore"]),
        "thigh": (j["hip"], j["kn_" + s], W["thigh"]), "shin": (j["kn_" + s], j["an_" + s], W["shin"]),
    }


def hl_colors(ex):
    out = {m: mix(NEAR, COLORS[m], .5) for m in ex.get("secondary", [])}
    out.update({m: COLORS[m] for m in ex.get("primary", [])})
    return out


def overlay(d, j, s, hl, ta, only, far):
    n, P = front_normal(ta), parts(j, s)
    for m, col in hl.items():
        col = mix(col, FAR, .25) if far else col
        for z in ZONES[m]:
            if z[1] not in only:
                continue
            if z[0] == "seg":
                p, q, w = P[z[1]]
                a, b = lerp_pt(p, q, z[2]), lerp_pt(p, q, z[3])
                if z[1] == "torso":
                    a = (a[0] + n[0] * z[5], a[1] + n[1] * z[5])
                    b = (b[0] + n[0] * z[5], b[1] + n[1] * z[5])
                capsule(d, a, b, w * z[4], col)
            else:
                c = j["sh"] if z[1] == "shoulder" else j["hip"]
                if z[1] == "hip":
                    c = (c[0] + n[0] * z[3], c[1] + n[1] * z[3])
                dot(d, c, z[2], col)


def draw_props(d, ex):
    if ex.get("floor", True):
        d.line([(X(4), Y(GROUND_Y)), (X(96), Y(GROUND_Y))], fill=FLOOR, width=max(1, int(U)))
    for p in ex.get("props", []):
        t = p["type"]
        if t in ("bench", "pad"):
            a, b = (p["x1"], p["y1"]), (p["x2"], p["y2"])
            capsule(d, a, b, p.get("w", 5), EQUIP)
            if t == "bench":
                for q in (a, b):
                    capsule(d, q, (q[0], GROUND_Y), 1.6, EQUIP_DK)
        elif t == "bar":
            capsule(d, (p["x"], p["y"]), (p["x"], GROUND_Y), 1.6, EQUIP_DK)
            dot(d, (p["x"], p["y"]), 2.2, EQUIP)
        elif t == "box":
            d.rounded_rectangle([X(p["x"]), Y(p["y"]), X(p["x"] + p["w"]), Y(p["y"] + p["h"])],
                                radius=U, fill=EQUIP)
        elif t == "wall":
            capsule(d, (p["x"], VIEW_Y0), (p["x"], GROUND_Y), 2.5, "#D1D5DB")
        elif t == "anchor":
            dot(d, (p["x"], p["y"]), 1.6, EQUIP_DK)


def draw_held(d, ex, j):
    for h in ex.get("held", []):
        c = j[h.get("at", "wr_n")]
        off = h.get("offset", [0, 0])
        c = (c[0] + off[0], c[1] + off[1])
        t = h["type"]
        if t == "dumbbell":
            dot(d, c, 3.4, EQUIP); dot(d, c, 1.6, EQUIP_DK)
        elif t in ("barbell", "ez_bar"):
            dot(d, c, 6.5, EQUIP); dot(d, c, 2.2, EQUIP_DK)
        elif t == "plate":
            dot(d, c, 7.5, EQUIP); dot(d, c, 2.2, EQUIP_DK)
        elif t == "ball":
            dot(d, c, 5.5, EQUIP)
        elif t == "handle":
            dot(d, c, 1.8, EQUIP)
        elif t == "kettlebell":
            a = math.radians(h.get("angle", 0))
            body = (c[0] + math.sin(a) * 5, c[1] + math.cos(a) * 5)
            dot(d, body, 4.8, EQUIP); dot(d, c, 3.0, EQUIP_DK)


def draw_lines(d, ex, j):
    anchors = {p["name"]: (p["x"], p["y"]) for p in ex.get("props", []) if p["type"] == "anchor"}
    def pt(s):
        return tuple(s) if isinstance(s, list) else (j[s] if s in j else anchors[s])
    for l in ex.get("lines", []):
        band = l.get("kind", "cable") == "band"
        capsule(d, pt(l["from"]), pt(l["to"]), 1.6 if band else 0.9, "#7C8AA0" if band else "#64748B")


def draw_frame(ex, j, pose):
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    d, hl, ta = ImageDraw.Draw(img), hl_colors(ex), pose["torso"]
    draw_props(d, ex)

    def arm(s):
        c = FAR if s == "f" else NEAR
        capsule(d, j["sh"], j["el_" + s], W["arm"], c)
        capsule(d, j["el_" + s], j["wr_" + s], W["fore"], c)
        dot(d, j["wr_" + s], 2.6, c)
        overlay(d, j, s, hl, ta, {"arm", "fore", "shoulder"}, s == "f")

    def leg(s):
        c = FAR if s == "f" else NEAR
        capsule(d, j["hip"], j["kn_" + s], W["thigh"], c)
        capsule(d, j["kn_" + s], j["an_" + s], W["shin"], c)
        capsule(d, j["an_" + s], j["to_" + s], W["foot"], c)
        overlay(d, j, s, hl, ta, {"thigh", "shin"}, s == "f")

    arm("f"); leg("f")
    capsule(d, j["hip"], j["neck"], W["torso"], NEAR)
    capsule(d, j["neck"], j["head"], W["neck"], NEAR)
    dot(d, j["head"], BONE["head_r"], NEAR)
    overlay(d, j, "n", hl, ta, {"torso", "neck", "hip"}, False)
    leg("n"); arm("n")
    draw_lines(d, ex, j)
    draw_held(d, ex, j)
    return img


def smooth(x):
    return x * x * (3 - 2 * x)


def blend(a, b, u):
    if isinstance(a, (int, float)):
        return a + (b - a) * u
    return [blend(x, y, u) for x, y in zip(a, b)]


def fill_keys(keys):
    cur, out = {}, []
    for k in keys:
        cur = {**cur, **k["pose"]}
        out.append((k["t"], dict(cur)))
    return out


def pose_at(keys, t):
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = smooth((t - t0) / (t1 - t0)) if t1 > t0 else 1.0
            return {k: blend(p0[k], p1[k], u) for k in p0}
    return keys[-1][1]


def load(path):
    path = Path(path)
    ex = json.loads(path.read_text(encoding="utf-8"))
    if "extends" in ex:
        base = load(path.parent / (ex["extends"] + ".json"))
        base.update({k: v for k, v in ex.items() if k != "extends"})
        return base
    return ex


def main(path, out_dir):
    ex = load(path)
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    keys = fill_keys(ex["keyframes"])
    ref = fk(keys[0][1])
    pingpong = ex.get("loop", "pingpong") == "pingpong"
    frames = []
    for i in range(FRAMES):
        s = 1 - abs(2 * i / FRAMES - 1) if pingpong else i / FRAMES
        pose = pose_at(keys, s)
        img = draw_frame(ex, place(ex, pose, ref), pose)
        frames.append(img.resize((SIZE, SIZE), Image.LANCZOS))
    ms = max(10, int(ex.get("seconds", 2.0) * 1000 / FRAMES))
    frames[0].save(out / f"{ex['id']}.webp", save_all=True, append_images=frames[1:],
                   duration=ms, loop=0, lossless=True)
    peak = frames[FRAMES // 2] if pingpong else frames[0]
    peak.save(out / f"{ex['id']}_poster.png")
    idx = [0, FRAMES // 4, FRAMES // 2, 3 * FRAMES // 4]
    sheet = Image.new("RGBA", (4 * 256, 256), "#F3F4F6")
    for n, i in enumerate(idx):
        f = frames[i].resize((256, 256), Image.LANCZOS)
        sheet.paste(f, (n * 256, 0), f)
    sheet.convert("RGB").save(out / f"{ex['id']}_check.png")
    print("ok", ex["id"], f"{FRAMES} frames, {ms} ms")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
