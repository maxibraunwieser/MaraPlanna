// Der animierte Mensch für die Übungen: ein Skelett in der Seitenansicht (Hüfte, Rumpf, Kopf, zwei Arme, zwei Beine),
// gezeichnet aus Polygonen mit Körperform, Kleidung, Schattierung und den Geräten (Hantel, Bank, Rack, Stange, Maschine).
// Das ist die Uhr-Fassung von tools/figure_preview.py (gleiche Maße, gleiche Formen); die Posen kommen aus dem Feed
// (supabase/functions/_shared/exercisePoses.ts, Beschreibung der Winkel dort). Nichts davon ist an eine Person gebunden.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

// Eine Übung als Bewegung: festgehaltener Punkt, Geräte, Dauer, Ausschnitt und Schlüsselposen.
(:strength)
class FigureMove {
    // 0 Fuß, 1 Zehen, 2 Hand, 3 Hüfte
    var pin as Number = 0;
    var px as Float = 0.0;
    var py as Float = 0.0;
    var equip as Number = 0;
    var ms as Number = 3000;
    // Ausschnitt [links, oben, rechts, unten] in cm, y nach unten, Boden = 0
    var view as Array<Float> = [-60.0, -180.0, 60.0, 4.0] as Array<Float>;
    var frames as Array<Array<Float>> = [] as Array<Array<Float>>;
    // Geräte als Formen: [Art, Anheftung, Zahlen ..., Farbe] (siehe supabase/functions/_shared/exerciseMoves.ts)
    var gear as Array<Array<Float>> = [] as Array<Array<Float>>;
    // Trainierte Muskeln als Bitmasken (Hauptmuskeln, Nebenmuskeln), siehe supabase/functions/_shared/figureMuscles.ts
    var musP as Number = 0;
    var musS as Number = 0;

    // Aus dem Feed ("an" der Übung); null, wenn die Angaben unbrauchbar sind.
    static function fromFeed(d as Dictionary?) as FigureMove? {
        if (d == null) {
            return null;
        }
        var k = StrengthPlan.g(d, "k");
        var v = StrengthPlan.g(d, "v");
        if (!(k instanceof Array) || k.size() < 2 || !(v instanceof Array) || v.size() < 4) {
            return null;
        }
        var m = new FigureMove();
        m.pin = StrengthPlan.toFloat(StrengthPlan.g(d, "p")).toNumber();
        m.px = StrengthPlan.toFloat(StrengthPlan.g(d, "x"));
        m.py = StrengthPlan.toFloat(StrengthPlan.g(d, "y"));
        m.equip = StrengthPlan.toFloat(StrengthPlan.g(d, "q")).toNumber();
        var ms = StrengthPlan.toFloat(StrengthPlan.g(d, "ms")).toNumber();
        m.ms = ms < 800 ? 3000 : ms;
        for (var i = 0; i < 4; i++) {
            m.view[i] = StrengthPlan.toFloat(v[i] as Object?);
        }
        for (var i = 0; i < k.size(); i++) {
            var row = k[i];
            if (!(row instanceof Array) || row.size() < 9) {
                return null;
            }
            var f = [] as Array<Float>;
            for (var j = 0; j < 9; j++) {
                f.add(StrengthPlan.toFloat(row[j] as Object?));
            }
            // Der ferne Arm (Winkel 9 und 10) folgt dem nahen, wenn die Pose ihn nicht eigens angibt.
            f.add(row.size() > 10 ? StrengthPlan.toFloat(row[9] as Object?) : f[2]);
            f.add(row.size() > 10 ? StrengthPlan.toFloat(row[10] as Object?) : f[3]);
            m.frames.add(f);
        }
        var u = StrengthPlan.g(d, "u");
        if (u instanceof Array && u.size() >= 2) {
            m.musP = StrengthPlan.toFloat(u[0] as Object?).toNumber();
            m.musS = StrengthPlan.toFloat(u[1] as Object?).toNumber();
        }
        var g = StrengthPlan.g(d, "g");
        if (g instanceof Array) {
            for (var i = 0; i < g.size(); i++) {
                var row = g[i];
                if (!(row instanceof Array) || row.size() < 3) {
                    continue;
                }
                var shape = [] as Array<Float>;
                for (var j = 0; j < row.size(); j++) {
                    shape.add(StrengthPlan.toFloat(row[j] as Object?));
                }
                m.gear.add(shape);
            }
        }
        return m;
    }
}

(:strength)
module Figure {
    // Maße in cm
    const TORSO = 50.0;
    const NECK = 6.0;
    const HEAD_R = 9.5;
    const UPPER_ARM = 30.0;
    const FOREARM = 26.0;
    const HAND_L = 4.0;
    const THIGH = 43.0;
    const SHANK = 42.0;
    const ANKLE_H = 8.0;
    const WS = 1.1;

    // Farben
    const SKIN = 0xD8B9A2;
    const SHIRT = 0xF97316;
    const SHORTS = 0x2B3445;
    const MUSCLE = 0xD62828;
    const MUSCLE2 = 0xEE7B5E;
    // wie weit die Shorts den Oberschenkel hinab reichen; die Muskeln des Oberschenkels beginnen darunter
    const SHORTS_T = 0.4;
    const SHOE = 0xF0F0F0;
    const SOLE = 0xA3E635;
    const HAIR = 0x3A2A22;
    const STEEL = 0xC9CED6;
    const IRON = 0x545A64;
    const IRON_LIGHT = 0x8C939E;
    const PAD = 0x606670;
    const FRAME = 0x464B54;
    const FLOOR = 0x2C2C2C;
    const SHADOW = 0x1A1A1A;
    const FAR = 0.68;
    // Licht von oben links
    const LIGHT_X = -0.45;
    const LIGHT_Y = -0.89;

    // Skelett-Felder: Paare (x, y) in cm
    const HIP = 0;
    const TOP = 2;
    const SJ = 4;
    const HEAD = 6;
    const ELBOW = 8;
    const WRIST = 10;
    const HAND = 12;
    const KNEE = 14;
    const ANKLE = 16;
    const FKNEE = 18;
    const FANKLE = 20;
    const UP = 22;
    const NORMAL = 24;
    const HEAD_UP = 26;
    const FOOT = 28;
    const FAR_FOOT = 29;
    const ELBOW2 = 32;
    const WRIST2 = 34;
    const HAND2 = 36;
    const TOE = 38;

    // Profile (Stelle 0..1 entlang der Achse, Breite in cm)
    const P_SHANK = [0.0, 9.6, 0.3, 10.8, 0.62, 8.6, 1.0, 6.4] as Array<Float>;
    const P_THIGH = [0.0, 16.5, 0.35, 16.0, 0.75, 12.0, 1.0, 10.2] as Array<Float>;
    const P_SHORTS = [0.0, 17.0, 0.6, 16.4, 1.0, 14.2] as Array<Float>;
    const P_FOREARM = [0.0, 7.4, 0.25, 7.8, 0.7, 6.2, 1.0, 4.8] as Array<Float>;
    const P_UPPER = [0.0, 10.4, 0.4, 9.8, 1.0, 7.6] as Array<Float>;
    const P_NECK = [0.0, 7.2, 1.0, 6.4] as Array<Float>;
    // Rumpf: Stelle, vorn, hinten
    const P_TORSO = [0.0, 11.5, 14.0, 0.2, 11.5, 13.0, 0.45, 10.0, 10.0, 0.7, 14.0, 10.5, 0.9, 12.5, 11.0, 1.0, 6.5, 8.5] as Array<Float>;

    // Wo ein Muskel sitzt: [Teil, von, bis, Seite von, Seite bis]. Teile: 0 Rumpf, 1 Oberschenkel, 2 Schienbein, 3 Oberarm, 4 Unterarm,
    // 5 Schulter, 6 Gesäß. Seiten quer dazu: -1 hinten, +1 vorn. Reihenfolge = Bits der Masken (MUSCLE_IDS im Server).
    const OVERLAY = [
        [0.0, 0.58, 0.93, 0.05, 1.0], [0.0, 0.3, 0.88, -1.0, -0.05], [0.0, 0.78, 1.0, -1.0, 0.4], [5.0, 0.0, 0.0, 0.0, 0.0],
        [3.0, 0.15, 0.85, 0.1, 1.0], [3.0, 0.12, 0.85, -1.0, -0.1], [4.0, 0.05, 0.82, -0.9, 0.9], [1.0, 0.08, 0.86, 0.0, 1.0],
        [1.0, 0.1, 0.86, -1.0, 0.0], [6.0, 0.0, 0.0, 0.0, 0.0], [2.0, 0.08, 0.64, -1.0, 0.1], [0.0, 0.1, 0.5, 0.1, 1.0],
        [0.0, 0.0, 0.4, -1.0, -0.1], [1.0, 0.0, 0.32, 0.0, 1.0], [1.0, 0.05, 0.56, -0.55, 0.65]
    ] as Array<Array<Float>>;

    function rad(deg as Float) as Float {
        return deg * 0.017453292;
    }

    function sinD(deg as Float) as Float {
        return Math.sin(rad(deg)).toFloat();
    }

    function cosD(deg as Float) as Float {
        return Math.cos(rad(deg)).toFloat();
    }

    function shade(c as Number, f as Float) as Number {
        var r = (((c >> 16) & 0xFF) * f).toNumber();
        var g = (((c >> 8) & 0xFF) * f).toNumber();
        var b = ((c & 0xFF) * f).toNumber();
        return (r << 16) | (g << 8) | b;
    }

    // Pose zwischen den Schlüsselposen: hin und zurück, weich ausgeblendet. phase 0..1 = eine Wiederholung.
    function pose(m as FigureMove, phase as Float) as Array<Float> {
        var fr = m.frames;
        var n = fr.size();
        var segs = 2 * (n - 1);
        var x = (phase - phase.toNumber()) * segs;
        var i = x.toNumber();
        if (i > segs - 1) {
            i = segs - 1;
        }
        var f = x - i;
        var s = f * f * (3.0 - 2.0 * f);
        var a = fr[i < n ? i : 2 * (n - 1) - i];
        var b = fr[i + 1 < n ? i + 1 : 2 * (n - 1) - (i + 1)];
        var out = [] as Array<Float>;
        for (var k = 0; k < 11; k++) {
            out.add(a[k] + (b[k] - a[k]) * s);
        }
        return out;
    }

    // Gelenkpunkte (Hüfte im Ursprung); dann so verschoben, dass der festgehaltene Punkt (pin) an seinem Platz liegt.
    function skeleton(p as Array<Float>, pin as Number, px as Float, py as Float) as Array<Float> {
        var t = p[0];
        var ux = sinD(t);
        var uy = -cosD(t);
        var nx = cosD(t);
        var ny = sinD(t);
        var topX = TORSO * ux;
        var topY = TORSO * uy;
        var sjX = topX - 4.0 * ux;
        var sjY = topY - 4.0 * uy;
        var hux = sinD(t + p[1]);
        var huy = -cosD(t + p[1]);
        var headX = topX + (NECK + HEAD_R) * hux;
        var headY = topY + (NECK + HEAD_R) * huy;
        var elbX = sjX + UPPER_ARM * sinD(p[2]);
        var elbY = sjY + UPPER_ARM * cosD(p[2]);
        var wrX = elbX + FOREARM * sinD(p[3]);
        var wrY = elbY + FOREARM * cosD(p[3]);
        var handX = wrX + HAND_L * sinD(p[3]);
        var handY = wrY + HAND_L * cosD(p[3]);
        var elb2X = sjX + UPPER_ARM * sinD(p[9]);
        var elb2Y = sjY + UPPER_ARM * cosD(p[9]);
        var wr2X = elb2X + FOREARM * sinD(p[10]);
        var wr2Y = elb2Y + FOREARM * cosD(p[10]);
        var hand2X = wr2X + HAND_L * sinD(p[10]);
        var hand2Y = wr2Y + HAND_L * cosD(p[10]);
        var kX = THIGH * sinD(p[4]);
        var kY = THIGH * cosD(p[4]);
        var aX = kX + SHANK * sinD(p[5]);
        var aY = kY + SHANK * cosD(p[5]);
        var fkX = THIGH * sinD(p[7]);
        var fkY = THIGH * cosD(p[7]);
        var faX = fkX + SHANK * sinD(p[8]);
        var faY = fkY + SHANK * cosD(p[8]);
        var fft = p[6];
        if ((p[8] - p[5]).abs() >= 8.0) {
            // das hintere Bein bewegt sich anders: sein Fuß steht senkrecht zum Schienbein (z. B. auf den Zehen)
            fft = Math.toDegrees(Math.atan2(-sinD(p[8]), cosD(p[8]))).toFloat();
        }
        // Fuß: Richtung und Zehen (für die Befestigung der Geräte und den festgehaltenen Punkt)
        var d = [cosD(p[6]), sinD(p[6])] as Array<Float>;
        var nrm = [-d[1], d[0]] as Array<Float>;
        var heelY = aY + d[1] * -5.0 + nrm[1] * ANKLE_H;
        var toeX = aX + d[0] * 18.0 + nrm[0] * ANKLE_H;
        var toeY = aY + d[1] * 18.0 + nrm[1] * ANKLE_H;
        // festgehaltener Punkt
        var offX = 0.0;
        var offY = 0.0;
        if (pin == 3) {
            offX = px;
            offY = -py;
        } else if (pin == 2) {
            offX = px - handX;
            offY = -py - handY;
        } else {
            if (pin == 4) {
                // die Zehen auf einer Höhe (Kiste, Bank): px, py
                offX = px - toeX;
                offY = -py - toeY;
            } else if (pin == 1) {
                offX = px - toeX;
                offY = 0.0 - toeY;
            } else {
                offX = px - aX;
                offY = 0.0 - (heelY > toeY ? heelY : toeY);
            }
        }
        return [
            offX, offY, topX + offX, topY + offY, sjX + offX, sjY + offY, headX + offX, headY + offY,
            elbX + offX, elbY + offY, wrX + offX, wrY + offY, handX + offX, handY + offY,
            kX + offX, kY + offY, aX + offX, aY + offY, fkX + offX, fkY + offY, faX + offX, faY + offY,
            ux, uy, nx, ny, hux, huy, p[6], fft, p[0], p[1],
            elb2X + offX, elb2Y + offY, wr2X + offX, wr2Y + offY, hand2X + offX, hand2Y + offY, toeX + offX, toeY + offY
        ] as Array<Float>;
    }

    // Die Figur in den Kasten (bx, by, bw, bh) zeichnen. Der Ausschnitt der Bewegung wird eingepasst.
    function draw(dc as Graphics.Dc, m as FigureMove, phase as Float, bx as Number, by as Number, bw as Number, bh as Number) as Void {
        var v = m.view;
        var s = bw / (v[2] - v[0]);
        var sy = bh / (v[3] - v[1]);
        s = sy < s ? sy : s;
        var ox = bx + bw / 2.0 - (v[0] + v[2]) / 2.0 * s;
        var oy = by + bh / 2.0 - (v[1] + v[3]) / 2.0 * s;
        var sk = skeleton(pose(m, phase), m.pin, m.px, m.py);
        dc.setClip(bx, by, bw, bh);
        var r = new FigureRenderer(dc, s, ox, oy, bx, bw);
        r.setMuscles(m.musP, m.musS);
        r.draw(sk, m.equip, m.gear);
        dc.clearClip();
    }
}

(:strength)
class FigureRenderer {
    private var _dc as Graphics.Dc;
    private var _s as Float;
    private var _ox as Float;
    private var _oy as Float;
    private var _bx as Number;
    private var _bw as Number;
    private var _mp as Number = 0;
    private var _ms as Number = 0;

    function setMuscles(p as Number, s as Number) as Void {
        _mp = p;
        _ms = s;
    }

    function initialize(dc as Graphics.Dc, s as Float, ox as Float, oy as Float, bx as Number, bw as Number) {
        _dc = dc;
        _s = s;
        _ox = ox;
        _oy = oy;
        _bx = bx;
        _bw = bw;
    }

    private function X(x as Float) as Float {
        return _ox + x * _s;
    }

    private function Y(y as Float) as Float {
        return _oy + y * _s;
    }

    // Vieleck aus (x, y)-Paaren in cm
    private function poly(flat as Array<Float>, color as Number) as Void {
        var pts = [] as Array<Graphics.Point2D>;
        for (var i = 0; i + 1 < flat.size(); i += 2) {
            pts.add([X(flat[i]), Y(flat[i + 1])] as Graphics.Point2D);
        }
        _dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        _dc.fillPolygon(pts);
    }

    private function disc(x as Float, y as Float, r as Float, color as Number) as Void {
        _dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        _dc.fillCircle(X(x), Y(y), r * _s);
    }

    // Kreislinie von außen nach innen (wie ein Hantelring)
    private function ringLine(x as Float, y as Float, r as Float, w as Float, color as Number) as Void {
        var pw = (w * _s).toNumber();
        pw = pw < 1 ? 1 : pw;
        _dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        _dc.setPenWidth(pw);
        _dc.drawCircle(X(x), Y(y), r * _s - pw / 2.0);
        _dc.setPenWidth(1);
    }

    private function line(ax as Float, ay as Float, bx as Number or Float, by as Number or Float, w as Float, color as Number) as Void {
        _dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var pw = (w * _s).toNumber();
        _dc.setPenWidth(pw < 1 ? 1 : pw);
        _dc.drawLine(X(ax), Y(ay), X(bx.toFloat()), Y(by.toFloat()));
        _dc.setPenWidth(1);
    }

    // Verjüngtes Körperteil von a nach b, Profil = Paare (Stelle, Breite); ws macht es dicker oder dünner.
    private function limb(ax as Float, ay as Float, bx as Float, by as Float, prof as Array<Float>, ws as Float, color as Number, shading as Boolean) as Void {
        var dx = bx - ax;
        var dy = by - ay;
        var len = Math.sqrt(dx * dx + dy * dy).toFloat();
        if (len < 0.001) {
            len = 1.0;
        }
        var nx = -dy / len;
        var ny = dx / len;
        var n = prof.size() / 2;
        var left = [] as Array<Float>;
        var right = [] as Array<Float>;
        for (var i = 0; i < n; i++) {
            var t = prof[2 * i];
            var w = prof[2 * i + 1] * ws;
            var cx = ax + dx * t;
            var cy = ay + dy * t;
            left.add(cx + nx * w / 2.0);
            left.add(cy + ny * w / 2.0);
            right.add(cx - nx * w / 2.0);
            right.add(cy - ny * w / 2.0);
        }
        var flat = [] as Array<Float>;
        flat.addAll(left);
        for (var i = n - 1; i >= 0; i--) {
            flat.add(right[2 * i]);
            flat.add(right[2 * i + 1]);
        }
        poly(flat, color);
        if (shading) {
            // dunklerer Streifen auf der Seite, die vom Licht abgewandt ist: gibt Volumen
            var sgn = (nx * Figure.LIGHT_X + ny * Figure.LIGHT_Y) < 0.0 ? 1.0 : -1.0;
            var strip = [] as Array<Float>;
            for (var i = 0; i < n; i++) {
                var w = prof[2 * i + 1] * ws;
                strip.add(ax + dx * prof[2 * i] + sgn * nx * w * 0.12);
                strip.add(ay + dy * prof[2 * i] + sgn * ny * w * 0.12);
            }
            for (var i = n - 1; i >= 0; i--) {
                var w = prof[2 * i + 1] * ws;
                strip.add(ax + dx * prof[2 * i] + sgn * nx * w * 0.5);
                strip.add(ay + dy * prof[2 * i] + sgn * ny * w * 0.5);
            }
            poly(strip, Figure.shade(color, 0.8));
        }
        disc(ax + dx * prof[0], ay + dy * prof[0], prof[1] * ws / 2.0, color);
        disc(ax + dx * prof[2 * n - 2], ay + dy * prof[2 * n - 2], prof[2 * n - 1] * ws / 2.0, color);
    }

    private function leg(sk as Array<Float>, kx as Float, ky as Float, ax as Float, ay as Float, ft as Float, k as Float) as Void {
        var skin = Figure.shade(Figure.SKIN, k);
        var shorts = Figure.shade(Figure.SHORTS, k);
        var hx = sk[Figure.HIP];
        var hy = sk[Figure.HIP + 1];
        limb(kx, ky, ax, ay, Figure.P_SHANK, Figure.WS, skin, true);
        limb(hx, hy, kx, ky, Figure.P_THIGH, Figure.WS, skin, true);
        limb(hx, hy, hx + (kx - hx) * Figure.SHORTS_T, hy + (ky - hy) * Figure.SHORTS_T, Figure.P_SHORTS, Figure.WS, shorts, true);
        limbMuscles(2, kx, ky, ax, ay, Figure.P_SHANK, k);
        limbMuscles(1, hx, hy, kx, ky, Figure.P_THIGH, k);
        // Schuh
        var dX = Figure.cosD(ft);
        var dY = Figure.sinD(ft);
        var nX = -dY;
        var nY = dX;
        var shoe = [-6.2, -4.5, -7.0, 3.0, -6.2, Figure.ANKLE_H, 19.0, Figure.ANKLE_H, 21.5, 5.2, 17.0, 0.0, 7.0, -3.2, 3.4, -6.6] as Array<Float>;
        poly(footPoints(shoe, ax, ay, dX, dY, nX, nY), Figure.shade(Figure.SHOE, k));
        var sole = [-6.2, Figure.ANKLE_H - 1.8, 19.2, Figure.ANKLE_H - 1.8, 19.0, Figure.ANKLE_H, -6.2, Figure.ANKLE_H] as Array<Float>;
        poly(footPoints(sole, ax, ay, dX, dY, nX, nY), Figure.shade(Figure.SOLE, k));
    }

    // Punkte (entlang, quer) des Fußes in Weltpunkte umrechnen
    private function footPoints(ab as Array<Float>, ax as Float, ay as Float, dX as Float, dY as Float, nX as Float, nY as Float) as Array<Float> {
        var out = [] as Array<Float>;
        for (var i = 0; i + 1 < ab.size(); i += 2) {
            out.add(ax + dX * ab[i] + nX * ab[i + 1]);
            out.add(ay + dY * ab[i] + nY * ab[i + 1]);
        }
        return out;
    }

    private function arm(sk as Array<Float>, k as Float, far as Boolean) as Void {
        var skin = Figure.shade(Figure.SKIN, k);
        var sx = sk[Figure.SJ];
        var sy = sk[Figure.SJ + 1];
        var ei = far ? Figure.ELBOW2 : Figure.ELBOW;
        var wi = far ? Figure.WRIST2 : Figure.WRIST;
        var hi = far ? Figure.HAND2 : Figure.HAND;
        var ex = sk[ei];
        var ey = sk[ei + 1];
        limb(ex, ey, sk[wi], sk[wi + 1], Figure.P_FOREARM, Figure.WS, skin, true);
        disc(sk[hi], sk[hi + 1], 4.5, skin);
        limb(sx, sy, ex, ey, Figure.P_UPPER, Figure.WS, skin, true);
        limbMuscles(4, ex, ey, sk[wi], sk[wi + 1], Figure.P_FOREARM, k);
        limbMuscles(3, sx, sy, ex, ey, Figure.P_UPPER, k);
        // Schulter: eine Scheibe auf dem Gelenk
        if ((_ms & 8) != 0) {
            disc(sx, sy, 6.4, Figure.shade(Figure.MUSCLE2, k));
        }
        if ((_mp & 8) != 0) {
            disc(sx, sy, 6.4, Figure.shade(Figure.MUSCLE, k));
        }
    }

    private function torso(sk as Array<Float>) as Void {
        var hx = sk[Figure.HIP];
        var hy = sk[Figure.HIP + 1];
        var ux = sk[Figure.UP];
        var uy = sk[Figure.UP + 1];
        var nx = sk[Figure.NORMAL];
        var ny = sk[Figure.NORMAL + 1];
        var prof = Figure.P_TORSO;
        var n = prof.size() / 3;
        var front = [] as Array<Float>;
        var back = [] as Array<Float>;
        var deep = [] as Array<Float>;
        for (var i = 0; i < n; i++) {
            var t = prof[3 * i];
            var cx = hx + ux * Figure.TORSO * t;
            var cy = hy + uy * Figure.TORSO * t;
            front.add(cx + nx * prof[3 * i + 1]);
            front.add(cy + ny * prof[3 * i + 1]);
            back.add(cx - nx * prof[3 * i + 2]);
            back.add(cy - ny * prof[3 * i + 2]);
            deep.add(cx - nx * prof[3 * i + 2] * 0.45);
            deep.add(cy - ny * prof[3 * i + 2] * 0.45);
        }
        var shirt = [] as Array<Float>;
        shirt.addAll(front);
        var shade = [] as Array<Float>;
        shade.addAll(deep);
        for (var i = n - 1; i >= 0; i--) {
            shirt.add(back[2 * i]);
            shirt.add(back[2 * i + 1]);
            shade.add(back[2 * i]);
            shade.add(back[2 * i + 1]);
        }
        poly(shirt, Figure.shade(Figure.SKIN, 0.97));
        poly(shade, Figure.shade(Figure.SKIN, 0.82));
        trunkMuscles(hx, hy, ux, uy, nx, ny);
        disc(hx, hy, 12.5 * Figure.WS, Figure.SHORTS);
        var cx = hx + ux * 7.0;
        var cy = hy + uy * 7.0;
        poly([cx + nx * 11.0, cy + ny * 11.0, cx - nx * 13.0, cy - ny * 13.0, cx - nx * 13.0 - ux * 9.0, cy - ny * 13.0 - uy * 9.0, cx + nx * 11.0 - ux * 9.0, cy + ny * 11.0 - uy * 9.0] as Array<Float>, Figure.SHORTS);
        // Gesäß: eine Scheibe auf den Shorts, hinter der Hüfte
        if (((_mp | _ms) & 512) != 0) {
            disc(hx - nx * 5.5 - ux * 1.5, hy - ny * 5.5 - uy * 1.5, 9.5, (_mp & 512) != 0 ? Figure.MUSCLE : Figure.MUSCLE2);
        }
    }

    // Breite eines Profils (Paare Stelle, Breite) an der Stelle t
    private function widthAt(prof as Array<Float>, t as Float) as Float {
        var n = prof.size() / 2;
        if (t <= prof[0]) {
            return prof[1];
        }
        for (var i = 1; i < n; i++) {
            if (t <= prof[2 * i]) {
                var f = (t - prof[2 * i - 2]) / (prof[2 * i] - prof[2 * i - 2]);
                return prof[2 * i - 1] + (prof[2 * i + 1] - prof[2 * i - 1]) * f;
            }
        }
        return prof[2 * n - 1];
    }

    // Ein Muskel auf einem Körperteil von a nach b: ein bauchiges Stück zwischen zwei Seiten des Teils
    private function patch(ax as Float, ay as Float, bx as Float, by as Float, prof as Array<Float>, ov as Array<Float>, color as Number) as Void {
        var dx = bx - ax;
        var dy = by - ay;
        var len = Math.sqrt(dx * dx + dy * dy).toFloat();
        if (len < 0.001) {
            len = 1.0;
        }
        // vorn: die Seite, zu der die Figur blickt (Richtung oben nach unten, um 90 Grad gedreht)
        var fx = dy / len;
        var fy = -dx / len;
        var t0 = ov[1];
        var t1 = ov[2];
        if (ov[0] == 1.0 && t1 > Figure.SHORTS_T) {
            t0 = t0 > Figure.SHORTS_T + 0.02 ? t0 : Figure.SHORTS_T + 0.02;
        }
        var lo = [] as Array<Float>;
        var hi = [] as Array<Float>;
        for (var i = 0; i <= 6; i++) {
            var u = i / 6.0;
            var t = t0 + (t1 - t0) * u;
            var hw = widthAt(prof, t) * Figure.WS / 2.0;
            var env = 0.5 + 0.5 * Math.sin(3.14159265 * u).toFloat();
            var cx = ax + dx * t;
            var cy = ay + dy * t;
            var mid = (ov[3] + ov[4]) / 2.0;
            var half = (ov[4] - ov[3]) / 2.0 * env;
            lo.add(cx + fx * hw * (mid - half));
            lo.add(cy + fy * hw * (mid - half));
            hi.add(cx + fx * hw * (mid + half));
            hi.add(cy + fy * hw * (mid + half));
        }
        var flat = [] as Array<Float>;
        flat.addAll(lo);
        for (var i = 6; i >= 0; i--) {
            flat.add(hi[2 * i]);
            flat.add(hi[2 * i + 1]);
        }
        poly(flat, color);
    }

    // Die Muskeln eines Gliedes (1 Oberschenkel, 2 Schienbein, 3 Oberarm, 4 Unterarm); k dunkelt die ferne Seite ab
    private function limbMuscles(seg as Number, ax as Float, ay as Float, bx as Float, by as Float, prof as Array<Float>, k as Float) as Void {
        if ((_mp | _ms) == 0) {
            return;
        }
        for (var i = 0; i < Figure.OVERLAY.size(); i++) {
            var ov = Figure.OVERLAY[i];
            if (ov[0].toNumber() != seg) {
                continue;
            }
            var bit = 1 << i;
            if ((_ms & bit) != 0) {
                patch(ax, ay, bx, by, prof, ov, Figure.shade(Figure.MUSCLE2, k));
            }
            if ((_mp & bit) != 0) {
                patch(ax, ay, bx, by, prof, ov, Figure.shade(Figure.MUSCLE, k));
            }
        }
    }

    // Breite des Rumpfprofils (Stelle, vorn, hinten) an der Stelle t: col 1 vorn, 2 hinten
    private function trunkWidth(t as Float, col as Number) as Float {
        var prof = Figure.P_TORSO;
        var n = prof.size() / 3;
        for (var i = 1; i < n; i++) {
            if (t <= prof[3 * i]) {
                var f = (t - prof[3 * i - 3]) / (prof[3 * i] - prof[3 * i - 3]);
                return prof[3 * i - 3 + col] + (prof[3 * i + col] - prof[3 * i - 3 + col]) * f;
            }
        }
        return prof[3 * n - 3 + col];
    }

    // Die Muskeln des Rumpfes: zwischen Rücken- (-1) und Brustkante (+1) des Profils
    private function trunkMuscles(hx as Float, hy as Float, ux as Float, uy as Float, nx as Float, ny as Float) as Void {
        if ((_mp | _ms) == 0) {
            return;
        }
        for (var i = 0; i < Figure.OVERLAY.size(); i++) {
            var ov = Figure.OVERLAY[i];
            var bit = 1 << i;
            if (ov[0].toNumber() != 0 || ((_mp | _ms) & bit) == 0) {
                continue;
            }
            var lo = [] as Array<Float>;
            var hi = [] as Array<Float>;
            for (var j = 0; j <= 6; j++) {
                var u = j / 6.0;
                var t = ov[1] + (ov[2] - ov[1]) * u;
                t = t > 1.0 ? 1.0 : t;
                var env = 0.5 + 0.5 * Math.sin(3.14159265 * u).toFloat();
                var mid = (ov[3] + ov[4]) / 2.0;
                var half = (ov[4] - ov[3]) / 2.0 * env;
                var a = mid - half;
                var b = mid + half;
                var da = a >= 0.0 ? trunkWidth(t, 1) * a : trunkWidth(t, 2) * a;
                var db = b >= 0.0 ? trunkWidth(t, 1) * b : trunkWidth(t, 2) * b;
                lo.add(hx + ux * Figure.TORSO * t + nx * da);
                lo.add(hy + uy * Figure.TORSO * t + ny * da);
                hi.add(hx + ux * Figure.TORSO * t + nx * db);
                hi.add(hy + uy * Figure.TORSO * t + ny * db);
            }
            var flat = [] as Array<Float>;
            flat.addAll(lo);
            for (var j = 6; j >= 0; j--) {
                flat.add(hi[2 * j]);
                flat.add(hi[2 * j + 1]);
            }
            poly(flat, (_mp & bit) != 0 ? Figure.MUSCLE : Figure.MUSCLE2);
        }
    }

    private function head(sk as Array<Float>) as Void {
        var cx = sk[Figure.HEAD];
        var cy = sk[Figure.HEAD + 1];
        var hux = sk[Figure.HEAD_UP];
        var huy = sk[Figure.HEAD_UP + 1];
        limb(sk[Figure.TOP] - hux * 2.0, sk[Figure.TOP + 1] - huy * 2.0, cx, cy, Figure.P_NECK, 1.0, Figure.shade(Figure.SKIN, 0.9), true);
        disc(cx, cy, Figure.HEAD_R, Figure.SKIN);
        // f = Blickrichtung, u = oben (am Kopf)
        var a = sk[30] + sk[31];
        var fx = Figure.cosD(a);
        var fy = Figure.sinD(a);
        var hair = [] as Array<Float>;
        for (var d = 20; d < 262; d += 12) {
            hair.add(cx + (fx * Figure.cosD(d.toFloat()) + hux * Figure.sinD(d.toFloat())) * Figure.HEAD_R * 1.04);
            hair.add(cy + (fy * Figure.cosD(d.toFloat()) + huy * Figure.sinD(d.toFloat())) * Figure.HEAD_R * 1.04);
        }
        for (var d = 250; d > 34; d -= 14) {
            hair.add(cx + (fx * Figure.cosD(d.toFloat()) + hux * Figure.sinD(d.toFloat())) * Figure.HEAD_R * 0.62);
            hair.add(cy + (fy * Figure.cosD(d.toFloat()) + huy * Figure.sinD(d.toFloat())) * Figure.HEAD_R * 0.62);
        }
        poly(hair, Figure.HAIR);
        var r = Figure.HEAD_R;
        disc(cx + (fx * Figure.cosD(150.0) + hux * Figure.sinD(150.0)) * r * 0.2, cy + (fy * Figure.cosD(150.0) + huy * Figure.sinD(150.0)) * r * 0.2, 1.8, Figure.shade(Figure.SKIN, 0.82));
        disc(cx + (fx * Figure.cosD(-2.0) + hux * Figure.sinD(-2.0)) * r * 0.98, cy + (fy * Figure.cosD(-2.0) + huy * Figure.sinD(-2.0)) * r * 0.98, 1.1, Figure.shade(Figure.SKIN, 0.9));
        disc(cx + (fx * Figure.cosD(14.0) + hux * Figure.sinD(14.0)) * r * 0.62, cy + (fy * Figure.cosD(14.0) + huy * Figure.sinD(14.0)) * r * 0.62, 1.0, 0x281E1C);
    }

    // Hantelscheibe von der Seite: Ring, feiner Innenring, Nabe
    private function plate(x as Float, y as Float) as Void {
        ringLine(x, y, 22.5, 4.2, Figure.IRON);
        ringLine(x, y, 18.3, 0.9, Figure.IRON_LIGHT);
        disc(x, y, 6.5, Figure.IRON);
        disc(x, y, 2.4, Figure.STEEL);
    }

    // Kurzhantel von der Seite: Sechseck
    private function hexagon(x as Float, y as Float) as Void {
        var outer = [] as Array<Float>;
        var inner = [] as Array<Float>;
        for (var i = 0; i < 6; i++) {
            var a = 60.0 * i + 30.0;
            outer.add(x + 8.5 * Figure.cosD(a));
            outer.add(y + 8.5 * Figure.sinD(a));
            inner.add(x + 6.3 * Figure.cosD(a));
            inner.add(y + 6.3 * Figure.sinD(a));
        }
        poly(outer, Figure.IRON);
        poly(inner, Figure.PAD);
        disc(x, y, 2.2, Figure.STEEL);
    }

    private function rect(x0 as Float, y0 as Float, x1 as Float, y1 as Float, color as Number) as Void {
        poly([x0, y0, x1, y0, x1, y1, x0, y1] as Array<Float>, color);
    }

    // Geräte hinter der Figur (Bank, Rack, Stange, Maschine)
    private function gearBack(sk as Array<Float>, eq as Number) as Void {
        var hx = sk[Figure.HIP];
        var hy = sk[Figure.HIP + 1];
        if ((eq & 16) != 0) {
            rect(-92.0, -43.0, 24.0, -34.0, Figure.PAD);
            rect(-92.0, -43.0, 24.0, -41.2, Figure.IRON_LIGHT);
            rect(-84.5, -34.0, -79.5, 0.0, Figure.FRAME);
            rect(11.5, -34.0, 16.5, 0.0, Figure.FRAME);
        }
        if ((eq & 32) != 0) {
            var x = (eq & 16) != 0 ? -96.0 : -44.0;
            rect(x - 2.5, -150.0, x + 2.5, 0.0, Figure.FRAME);
            var y = (eq & 16) != 0 ? -112.0 : -141.0;
            poly([x, y - 3.0, x + 30.0, y - 3.0, x + 30.0, y, x, y + 1.0] as Array<Float>, Figure.IRON_LIGHT);
        }
        if ((eq & 64) != 0) {
            var x = sk[Figure.HAND];
            var top = sk[Figure.HAND + 1];
            rect(x + 55.0, top - 12.0, x + 61.0, 0.0, Figure.FRAME);
            poly([x, top - 4.0, x + 61.0, top - 12.0, x + 61.0, top - 6.0, x, top + 2.0] as Array<Float>, Figure.FRAME);
        }
        if ((eq & 128) != 0) {
            rect(hx - 24.0, hy + 5.0, hx + 16.0, hy + 12.0, Figure.PAD);
            rect(hx - 3.0, hy + 12.0, hx + 3.0, 0.0, Figure.FRAME);
            var px = hx + 44.0;
            rect(px - 3.0, -246.0, px + 3.0, 0.0, Figure.FRAME);
            rect(px - 40.0, -250.0, px + 3.0, -240.0, Figure.FRAME);
        }
        if ((eq & 256) != 0) {
            var ux = sk[Figure.UP];
            var uy = sk[Figure.UP + 1];
            var nx = sk[Figure.NORMAL];
            var ny = sk[Figure.NORMAL + 1];
            limb(hx - nx * 13.0, hy - ny * 13.0, hx + ux * 52.0 - nx * 13.0, hy + uy * 52.0 - ny * 13.0, [0.0, 8.0, 1.0, 8.0] as Array<Float>, 1.0, Figure.PAD, false);
            rect(hx - 20.0, hy + 14.0, hx + 8.0, hy + 20.0, Figure.PAD);
        }
    }

    // Hantelscheiben und Fußplatte hinter dem Körper, damit die Figur frei bleibt (die Hände greifen davor)
    private function gearMid(sk as Array<Float>, eq as Number) as Void {
        if ((eq & 1) != 0) {
            plate(sk[Figure.WRIST], sk[Figure.WRIST + 1]);
        }
        if ((eq & 2) != 0) {
            plate(sk[Figure.TOP] + sk[Figure.UP] * 1.0 - sk[Figure.NORMAL] * 4.5, sk[Figure.TOP + 1] + sk[Figure.UP + 1] * 1.0 - sk[Figure.NORMAL + 1] * 4.5);
        }
        if ((eq & 256) != 0) {
            // Beinpresse: Schiene unter 40 Grad, Schlitten mit Platte am Fuß
            var rx = Figure.cosD(40.0);
            var ry = -Figure.sinD(40.0);
            var nx = Figure.sinD(40.0);
            var ny = Figure.cosD(40.0);
            var cx = sk[Figure.ANKLE] + rx * (Figure.ANKLE_H + 1.5);
            var cy = sk[Figure.ANKLE + 1] + ry * (Figure.ANKLE_H + 1.5);
            var sx = sk[Figure.HIP] - 6.0;
            var sy = sk[Figure.HIP + 1] + 30.0;
            line(sx, sy, cx - rx * 6.0, cy - ry * 6.0, 3.0, Figure.FRAME);
            line(sx + nx * 9.0, sy + ny * 9.0, cx - rx * 6.0 + nx * 9.0, cy - ry * 6.0 + ny * 9.0, 3.0, Figure.FRAME);
            limb(cx - nx * 38.0, cy - ny * 38.0, cx + nx * 38.0, cy + ny * 38.0, [0.0, 5.0, 1.0, 5.0] as Array<Float>, 1.0, Figure.IRON_LIGHT, false);
            limb(cx - rx * 6.5, cy - ry * 6.5, cx - rx * 6.5 + nx * 12.0, cy - ry * 6.5 + ny * 12.0, [0.0, 7.0, 1.0, 7.0] as Array<Float>, 1.0, Figure.FRAME, false);
        }
    }

    // Geräte vor der Figur (Kurzhanteln, Kabel)
    private function gearFront(sk as Array<Float>, eq as Number) as Void {
        var handX = sk[Figure.HAND];
        var handY = sk[Figure.HAND + 1];
        if ((eq & 4) != 0) {
            hexagon(handX, handY);
        }
        if ((eq & 8) != 0) {
            // eine Kurzhantel, senkrecht von beiden Händen gehalten; sie hängt unter den Händen
            var dx = Figure.sinD(forearmAngle(sk));
            var dy = Figure.cosD(forearmAngle(sk));
            var cx = handX - dx * 10.0;
            var cy = handY - dy * 10.0;
            limb(handX, handY, handX - dx * 17.0, handY - dy * 17.0, [0.0, 3.2, 1.0, 3.2] as Array<Float>, 1.0, Figure.STEEL, false);
            poly([cx + 9.0, cy, cx - 9.0, cy, cx - 9.0 - dx * 6.0, cy - dy * 6.0, cx + 9.0 - dx * 6.0, cy - dy * 6.0] as Array<Float>, Figure.IRON);
            poly([handX + 8.0, handY - dy, handX - 8.0, handY - dy, handX - 8.0 + dx * 3.0, handY + dy * 3.0, handX + 8.0 + dx * 3.0, handY + dy * 3.0] as Array<Float>, Figure.IRON);
        }
        if ((eq & 128) != 0) {
            var px = sk[Figure.HIP] + 44.0 - 40.0;
            line(px, -245.0, handX, handY, 1.4, Figure.STEEL);
            disc(px, -245.0, 5.5, Figure.IRON_LIGHT);
            disc(handX, handY, 2.0, Figure.STEEL);
        }
    }

    // Ein Kettlebell: Körper und Griff
    private function kettlebell(x as Float, y as Float) as Void {
        disc(x, y + 6.0, 10.5, Figure.IRON);
        disc(x - 3.0, y + 3.0, 2.8, Figure.IRON_LIGHT);
        ringLine(x, y - 7.0, 6.5, 2.6, Figure.IRON);
    }

    private function shapeColour(c as Float) as Number {
        var i = c.toNumber();
        return i == 1 ? Figure.IRON : (i == 2 ? Figure.PAD : (i == 3 ? Figure.IRON_LIGHT : (i == 4 ? Figure.SHIRT : Figure.FRAME)));
    }

    // Die Geräte einer Figur aus der Form-Liste des Feeds, in drei Schichten (Bank, Kiste, Stange, Polster hinten).
    private function shapes(sk as Array<Float>, g as Array<Array<Float>>, layer as Number) as Void {
        for (var i = 0; i < g.size(); i++) {
            var s = g[i];
            var t = s[0].toNumber();
            // 0 hinter der Figur, 1 hinter dem Körper (Hantelscheiben: die Hände greifen davor), 2 vor der Figur
            var l = (t == 1 || t == 4 || t == 6 || t == 2) ? 0 : (t == 7 ? 1 : 2);
            if (l != layer) {
                continue;
            }
            var at = s[1].toNumber();
            var bx = 0.0;
            var by = 0.0;
            if (at == 1) {
                bx = sk[Figure.HAND];
                by = sk[Figure.HAND + 1];
            } else if (at == 2) {
                bx = sk[Figure.SJ];
                by = sk[Figure.SJ + 1];
            } else if (at == 3) {
                bx = sk[Figure.HIP];
                by = sk[Figure.HIP + 1];
            } else if (at == 4) {
                bx = sk[Figure.KNEE];
                by = sk[Figure.KNEE + 1];
            } else if (at == 5) {
                bx = sk[Figure.ANKLE];
                by = sk[Figure.ANKLE + 1];
            } else if (at == 6) {
                bx = sk[Figure.TOE];
                by = sk[Figure.TOE + 1];
            } else if (at == 7) {
                bx = sk[Figure.HEAD];
                by = sk[Figure.HEAD + 1];
            }
            if (t == 1 && s.size() >= 7) {
                rect(bx + s[2], by + s[3], bx + s[4], by + s[5], shapeColour(s[6]));
            } else if (t == 2 && s.size() >= 8) {
                line(bx + s[2], by + s[3], bx + s[4], by + s[5], s[6], shapeColour(s[7]));
            } else if (t == 3 && s.size() >= 6) {
                disc(bx + s[2], by + s[3], s[4], shapeColour(s[5]));
            } else if (t == 4 && s.size() >= 7) {
                // Bank oder Kiste auf dem Boden: Platte oben, zwei Füße
                var col = shapeColour(s[6]);
                rect(s[2], s[4], s[3], s[4] + s[5], col);
                rect(s[2] + 3.0, s[4] + s[5], s[2] + 8.0, 0.0, Figure.FRAME);
                rect(s[3] - 8.0, s[4] + s[5], s[3] - 3.0, 0.0, Figure.FRAME);
            } else if (t == 5 && s.size() >= 7) {
                // Kabel oder Band von einem festen Punkt zur Hand
                var hx = sk[Figure.HAND];
                var hy = sk[Figure.HAND + 1];
                line(s[2], s[3], hx, hy, s[6].toNumber() == 4 ? 1.8 : 1.4, s[6].toNumber() == 4 ? Figure.SHIRT : Figure.STEEL);
                disc(s[2], s[3], 5.0, Figure.IRON_LIGHT);
                disc(hx, hy, 2.0, Figure.STEEL);
            } else if (t == 6 && s.size() >= 8) {
                var pts = [] as Array<Float>;
                for (var j = 2; j + 1 < s.size() - 1; j += 2) {
                    pts.add(bx + s[j]);
                    pts.add(by + s[j + 1]);
                }
                poly(pts, shapeColour(s[s.size() - 1]));
            } else if (t == 7 && s.size() >= 4) {
                plate(bx + s[2], by + s[3]);
            } else if (t == 8 && s.size() >= 4) {
                hexagon(bx + s[2], by + s[3]);
            } else if (t == 9 && s.size() >= 4) {
                kettlebell(bx + s[2], by + s[3]);
            }
        }
    }

    // Winkel des Unterarms aus Handgelenk und Ellbogen (Grad von senkrecht nach unten)
    private function forearmAngle(sk as Array<Float>) as Float {
        return Math.toDegrees(Math.atan2(sk[Figure.WRIST] - sk[Figure.ELBOW], sk[Figure.WRIST + 1] - sk[Figure.ELBOW + 1])).toFloat();
    }

    function draw(sk as Array<Float>, eq as Number, gear as Array<Array<Float>>) as Void {
        var fk = sk[Figure.FKNEE];
        // Boden und Schatten unter dem Fuß
        _dc.setColor(Figure.FLOOR, Graphics.COLOR_TRANSPARENT);
        _dc.fillRectangle(_bx, Y(0.0), _bw, (1.6 * _s).toNumber() + 1);
        _dc.setColor(Figure.SHADOW, Graphics.COLOR_TRANSPARENT);
        _dc.fillEllipse(X(sk[Figure.ANKLE] + 2.0), Y(0.9), 32.0 * _s, 2.2 * _s);
        gearBack(sk, eq);
        shapes(sk, gear, 0);
        // ferner Arm und fernes Bein
        arm(sk, Figure.FAR, true);
        leg(sk, fk, sk[Figure.FKNEE + 1], sk[Figure.FANKLE], sk[Figure.FANKLE + 1], sk[Figure.FAR_FOOT], Figure.FAR);
        gearMid(sk, eq);
        shapes(sk, gear, 1);
        torso(sk);
        leg(sk, sk[Figure.KNEE], sk[Figure.KNEE + 1], sk[Figure.ANKLE], sk[Figure.ANKLE + 1], sk[Figure.FOOT], 1.0);
        head(sk);
        arm(sk, 1.0, false);
        gearFront(sk, eq);
        shapes(sk, gear, 2);
    }
}
