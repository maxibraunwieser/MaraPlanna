// Erkennt, welche Übung gerade gemacht wird, aus den Übungen der gewählten Einheit (der Sammlung), der Reihenfolge und dem,
// wie sich die Übungen der Person am Handgelenk anfühlen. Reine Logik ohne Zugriff auf die Uhr, damit sie testbar bleibt.
//
// Die Uhr misst nur die Bewegung des Handgelenks (RepCounter.features()). Daraus allein sind 30 Übungen nicht sicher zu trennen,
// aber aus 4 bis 8 Übungen einer Einheit schon, wenn man Vorwissen dazunimmt:
//   Vorwissen   die nächste geplante Übung ist am wahrscheinlichsten, ein weiterer Satz derselben Übung auch, eine andere
//               geplante etwas weniger, eine Übung außerhalb der Einheit am wenigsten. Eine Haltedauer (Plank) kommt nie aus Bewegung.
//   Gelernt     was die Übung am Handgelenk dieser Person bisher ergeben hat (vom Server, aus bestätigten Sätzen früherer
//               Trainings) und was in dieser Einheit schon bestätigt wurde. Je mehr Sätze, desto enger der Maßstab.
// Eine Übung ohne bisherige Sätze hat nur das Vorwissen. Die Zahlen sind Schätzwerte, die sich mit echten Sätzen bewähren müssen.

import Toybox.Lang;
import Toybox.Math;

// Eine Übung als Kandidat für den Satz
(:strength)
class Cand {
    // Offene Sätze der geplanten Übung, -1 = nicht in der heutigen Einheit
    var open as Number;
    // Die nächste geplante Übung
    var next as Boolean;
    // Die Übung des letzten bestätigten Satzes
    var last as Boolean;
    // 0 aus der Bewegung, 1 mit Rückfrage, 2 Halten mit Zeit
    var mode as Number;
    // Bisher gelernt: [Anzahl, Mittelwerte (6), Streuungen (6)]
    var sig as Array<Number>?;
    var sess as Array<Number>?;

    function initialize(open as Number, next as Boolean, last as Boolean, mode as Number, sig as Array<Number>?, sess as Array<Number>?) {
        self.open = open;
        self.next = next;
        self.last = last;
        self.mode = mode;
        self.sig = sig;
        self.sess = sess;
    }
}

(:strength)
module Recognizer {
    const FEATURES = 6;
    // Kleinste Streuung je Merkmal: Zehntelsekunden, milli-g, %, drei Richtungen
    const FLOOR = [4.0, 25.0, 10.0, 8.0, 8.0, 8.0] as Array<Float>;
    // Wie stark die Bewegung gegen das Vorwissen zählt (kleiner = vorsichtiger)
    const WEIGHT = 0.6;
    // So sicher (Anteil) muss die Erkennung sein, damit ein Satz sich selbst abschließen darf
    const SURE = 0.6;
    // Passt ein Satz zu dem, was eine Übung bisher ergeben hat, spricht das für sie (je Satz, höchstens fünf): eine Übung ohne bisherige
    // Sätze hat dafür nichts vorzuweisen. Passt er schlecht, wiegt die Abweichung schwerer.
    const BONUS = 0.5;
    // Wert von "keine dieser Übungen": passt der Satz zu keiner (auch die beste Übung passt schlecht), sinkt die Sicherheit
    const OTHER = -3.0;

    // Zwei Angaben [n, Mittel, Streuung] zusammenlegen (gewichtet nach n, die größere Streuung gilt).
    function merge(a as Array<Number>?, b as Array<Number>?) as Array<Number>? {
        if (a == null || a.size() < 1 + 2 * FEATURES || a[0] < 1) {
            return b != null && b.size() >= 1 + 2 * FEATURES && b[0] >= 1 ? b : null;
        }
        if (b == null || b.size() < 1 + 2 * FEATURES || b[0] < 1) {
            return a;
        }
        var n = a[0] + b[0];
        var out = [n] as Array<Number>;
        for (var j = 0; j < FEATURES; j++) {
            out.add(((a[1 + j] * a[0] + b[1 + j] * b[0]) / n.toFloat() + 0.5).toNumber());
        }
        for (var j = 0; j < FEATURES; j++) {
            var sa = a[1 + FEATURES + j];
            var sb = b[1 + FEATURES + j];
            out.add(sa > sb ? sa : sb);
        }
        return out;
    }

    // Aus bestätigten Sätzen (je sechs Merkmale) eine Angabe [n, Mittel, Streuung] machen; null ohne Sätze.
    function summarize(rows as Array<Array<Number>>) as Array<Number>? {
        var n = rows.size();
        if (n < 1) {
            return null;
        }
        var out = [n] as Array<Number>;
        var means = [] as Array<Float>;
        for (var j = 0; j < FEATURES; j++) {
            var sum = 0.0;
            for (var i = 0; i < n; i++) {
                sum += rows[i][j];
            }
            means.add(sum / n);
            out.add((sum / n + 0.5).toNumber());
        }
        for (var j = 0; j < FEATURES; j++) {
            var sq = 0.0;
            for (var i = 0; i < n; i++) {
                var d = rows[i][j] - means[j];
                sq += d * d;
            }
            out.add(n > 1 ? (Math.sqrt(sq / n) + 0.5).toNumber() : 0);
        }
        return out;
    }

    // Wie gut passt der Satz zu dem, was die Übung bisher ergeben hat (0 = perfekt, kleiner = schlechter; 0 ohne Angabe).
    function fit(sig as Array<Number>?, f as Array<Number>) as Float {
        if (sig == null || sig.size() < 1 + 2 * FEATURES || sig[0] < 1 || f.size() < FEATURES) {
            return 0.0;
        }
        var n = sig[0].toFloat();
        var ll = 0.0;
        for (var j = 0; j < FEATURES; j++) {
            var sd = sig[1 + FEATURES + j].toFloat();
            if (sd < FLOOR[j]) {
                sd = FLOOR[j];
            }
            // Wenige Sätze: weiter Maßstab
            sd = sd * (1.0 + 2.0 / n);
            var z = (f[j] - sig[1 + j]) / sd;
            if (z > 4.0) {
                z = 4.0;
            } else if (z < -4.0) {
                z = -4.0;
            }
            ll -= 0.5 * z * z;
        }
        return ll * WEIGHT + BONUS * (n > 5.0 ? 5.0 : n);
    }

    // Vorwissen aus Plan und Reihenfolge
    function prior(c as Cand) as Float {
        if (c.mode == 2) {
            // Ein Halten (Plank) wird mit der Zeit gemacht, nicht aus Bewegung erkannt
            return -3.0;
        }
        var p = 0.0;
        if (c.open < 0) {
            p = -1.2;
        } else if (c.open == 0) {
            p = -0.3;
        } else {
            p = 0.7;
        }
        if (c.next) {
            p += 1.3;
        }
        if (c.last && c.open > 0) {
            p += 0.7;
        }
        return p;
    }

    // Wert je Kandidat (je höher, desto wahrscheinlicher). f: die sechs Merkmale des Satzes (auch eines laufenden).
    function scores(cands as Array<Cand>, f as Array<Number>, useMotion as Boolean) as Array<Float> {
        var out = [] as Array<Float>;
        for (var i = 0; i < cands.size(); i++) {
            var c = cands[i];
            var s = prior(c);
            if (useMotion) {
                s += fit(merge(c.sig, c.sess), f);
            }
            out.add(s);
        }
        return out;
    }

    // Anteile aus den Werten; der Rest (zusammen mit den Anteilen ergibt es 1) gehört zu "keine dieser Übungen"
    function probabilities(sc as Array<Float>) as Array<Float> {
        var top = OTHER;
        for (var i = 0; i < sc.size(); i++) {
            if (sc[i] > top) {
                top = sc[i];
            }
        }
        var sum = Math.pow(2.718281828, OTHER - top).toFloat();
        var e = [] as Array<Float>;
        for (var i = 0; i < sc.size(); i++) {
            var v = Math.pow(2.718281828, sc[i] - top).toFloat();
            e.add(v);
            sum += v;
        }
        var out = [] as Array<Float>;
        for (var i = 0; i < e.size(); i++) {
            out.add(sum > 0.0 ? e[i] / sum : 0.0);
        }
        return out;
    }

    function best(sc as Array<Float>) as Number {
        var b = 0;
        for (var i = 1; i < sc.size(); i++) {
            if (sc[i] > sc[b]) {
                b = i;
            }
        }
        return b;
    }
}
