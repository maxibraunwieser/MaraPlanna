// Wiederholungen je Übung: eine Wiederholung ist der Weg Ausgangspunkt → Umkehrpunkt → Ausgangspunkt, nie zwei.
// Für jede Bewegungsfamilie der Bibliothek (supabase/functions/_shared/strength.ts) wird die Bahn des Handgelenks nachgebildet:
// wie weit es sich bewegt (Meter), wie stark es sich dabei dreht (die Schwerkraft wandert über die Achsen) und in welchem
// Tempo (hoch, oben halten, runter, unten halten), dazu Rauschen. Der Zähler muss genau die gemachten Wiederholungen liefern
// und darf eine Wiederholung erst zählen, wenn der Umkehrpunkt erreicht ist.
// Übungen, bei denen sich das Handgelenk kaum bewegt (Beinpresse, Beinbeuger, Wadenheben an der Maschine, Liegestütz), zählt
// die Uhr nicht aus der Bewegung (CountMode.ASSIST: BACK beginnt den Satz, die Karte fragt nach); sie fehlen hier.

import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Test;

const TRACE_REPS = false;

// Lage auf der Bahn (0 Ausgangspunkt … 1 Umkehrpunkt) und ihre zweite Ableitung (1/s²) zur Zeit t innerhalb einer Wiederholung.
// ph = [hoch, oben, runter, unten] in Sekunden.
(:strength)
function repPath(t as Float, ph as Array<Float>) as Array<Float> {
    var up = ph[0];
    var top = ph[1];
    var down = ph[2];
    if (t < up) {
        var w = Math.PI / up;
        return [((1.0 - Math.cos(w * t)) / 2.0).toFloat(), (w * w / 2.0 * Math.cos(w * t)).toFloat()] as Array<Float>;
    }
    t -= up;
    if (t < top) {
        return [1.0, 0.0] as Array<Float>;
    }
    t -= top;
    if (t < down) {
        var w = Math.PI / down;
        return [((1.0 + Math.cos(w * t)) / 2.0).toFloat(), (-w * w / 2.0 * Math.cos(w * t)).toFloat()] as Array<Float>;
    }
    return [0.0, 0.0] as Array<Float>;
}

// Ein Satz einer Übung, Messpunkt für Messpunkt (25 je Sekunde): erst 3 s Ruhe, dann reps Wiederholungen, dann 20 s Ruhe.
// rot = Drehung des Handgelenks über die ganze Bahn (Grad), range = Weg (m), horiz = der Weg ist waagerecht statt senkrecht.
// Ergebnis: [Wiederholungen am Ende, höchster Zählerstand vor dem ersten Umkehrpunkt, höchster Zählerstand vor dem Umkehrpunkt
// der letzten Wiederholung]
(:strength)
function runProfile(c as RepCounter, reps as Number, ph as Array<Float>, rot as Float, range as Float, horiz as Boolean, seed as Number) as Array<Number> {
    var rep = ph[0] + ph[1] + ph[2] + ph[3];
    var total = 3.0 + reps * rep + 20.0;
    var n = (total * 25).toNumber();
    var early = 0;
    var lastEarly = 0;
    for (var i = 0; i < n; i++) {
        var t = i / 25.0;
        var p = 0.0;
        var acc = 0.0;
        var k = -1;
        if (t >= 3.0 && t < 3.0 + reps * rep) {
            var r = t - 3.0;
            k = (r / rep).toNumber();
            var q = repPath(r - k * rep, ph);
            p = q[0];
            acc = q[1];
        }
        // Drehung und Beschleunigung (milli-g) am Handgelenk
        var th = Math.toRadians(rot * p);
        var a = range * acc / 9.81 * 1000.0;
        var noise = Math.sin((seed + i) * 12.9898) * 5.0;
        var noise2 = Math.cos((seed + i) * 7.233) * 4.0;
        var x;
        var z;
        if (horiz) {
            // Zug nach hinten, während sich der Unterarm hebt. (Laufen Drehung und Zug auf derselben Achse gegeneinander, heben
            // sie sich bei 1 s je Richtung fast auf: dann zählt die Uhr zu wenig. Das ist eine bekannte Grenze; die Karte nach dem
            // Satz lässt die Zahl korrigieren.)
            x = 1000.0 * Math.sin(th) - a * Math.cos(th);
            z = 1000.0 * Math.cos(th) + a * Math.sin(th);
        } else {
            x = (1000.0 + a) * Math.sin(th);
            z = (1000.0 + a) * Math.cos(th);
        }
        // ein wenig Bewegung quer dazu (die Hand läuft nie ganz gerade)
        var y = 60.0 * Math.sin(Math.PI * p) + noise2;
        var before = c.reps();
        c.add((x + noise).toNumber(), y.toNumber(), (z + noise2).toNumber());
        if (TRACE_REPS && c.reps() != before && seed < 3000) {
            System.println("  t=" + t.format("%.2f") + " p=" + p.format("%.2f") + " reps=" + c.reps());
        }
        // vor dem Umkehrpunkt der ersten bzw. der letzten Wiederholung: höchster Stand des Zählers
        if (k >= 0) {
            var inRep = t - 3.0 - k * rep;
            if (inRep < ph[0]) {
                if (k == 0 && c.reps() > early) {
                    early = c.reps();
                }
                if (k == reps - 1 && c.reps() > lastEarly) {
                    lastEarly = c.reps();
                }
            }
        }
    }
    return [c.finished ? c.lastReps : -100 - c.reps(), early, lastEarly] as Array<Number>;
}

// Bewegungsfamilien: Name, Drehung (Grad), Weg (m), waagerecht, und die Tempos [hoch, oben, runter, unten]
(:strength)
function repProfiles() as Array<Array> {
    return [
        ["curl", 140.0, 0.35, false],
        ["triceps", 120.0, 0.30, false],
        ["push_v", 10.0, 0.45, false],
        ["push_h", 5.0, 0.40, false],
        ["pull_h", 25.0, 0.35, true],
        ["pull_v", 15.0, 0.50, false],
        ["squat", 5.0, 0.50, false],
        ["hinge", 10.0, 0.55, false],
        ["lunge", 8.0, 0.40, false],
        ["glute", 20.0, 0.25, false],
        ["swing", 100.0, 0.80, false]
    ] as Array<Array>;
}

(:strength)
function repTempos() as Array<Array<Float>> {
    return [
        // gleichmäßig 1 s hoch, 1 s runter
        [1.0, 0.0, 1.0, 0.0],
        // langsam runter (3 s), kurz oben und unten
        [1.0, 0.3, 3.0, 0.3],
        // oben 1,5 s halten (Klimmzug, Rudern)
        [1.2, 1.5, 1.5, 0.3],
        // unten absetzen (Kreuzheben)
        [1.5, 0.2, 1.5, 1.2],
        // zügig (Swing, Kniebeuge mit Körpergewicht)
        [0.7, 0.0, 0.8, 0.0]
    ] as Array<Array<Float>>;
}

(:test)
function testOneRepIsThereAndBack(logger as Logger) as Boolean {
    var profiles = repProfiles();
    var tempos = repTempos();
    var bad = 0;
    var seed = 0;
    for (var i = 0; i < profiles.size(); i++) {
        var pr = profiles[i];
        for (var j = 0; j < tempos.size(); j++) {
            var reps = 8;
            var c = new RepCounter(25);
            seed += 977;
            var r = runProfile(c, reps, tempos[j], pr[1] as Float, pr[2] as Float, pr[3] as Boolean, seed);
            var ok = r[0] == reps && r[1] == 0 && r[2] <= reps - 1;
            if (!ok) {
                bad += 1;
            }
            logger.debug((ok ? "ok   " : "FAIL ") + (pr[0] as String) + " tempo " + j + ": " + r[0] + " Wdh (Soll " + reps + "), vor 1. Umkehr " + r[1] + ", vor letzter Umkehr " + r[2]);
        }
    }
    logger.debug("Profile mit Fehler: " + bad);
    Test.assertEqual(bad, 0);
    return true;
}

// Die Bewegungen der Gym-Simulation (Demo.pattern: Bankdrücken, Rudern, Curl), 8 Wiederholungen ab dem Nulldurchgang
(:test)
function testGymPatternsCountExactly(logger as Logger) as Boolean {
    var pats = [
        [0.4, 0.0, 0.0, 380.0, 0.0, 0.0, 1000.0],
        [0.8, 300.0, 60.0, 0.0, 0.0, 1000.0, 0.0],
        [0.6, 330.0, 150.0, 0.0, 0.0, 500.0, 850.0]
    ] as Array<Array<Float>>;
    var bad = 0;
    for (var k = 0; k < pats.size(); k++) {
        var p = pats[k];
        var c = new RepCounter(25);
        var reps = 8;
        var n = ((3.0 + reps / p[0] + 12.0) * 25).toNumber();
        for (var i = 0; i < n; i++) {
            var t = i / 25.0 - 3.0;
            var w = t >= 0.0 && t < reps / p[0] ? Math.sin(2.0 * Math.PI * p[0] * t) : 0.0;
            var noise = Math.sin(i * 12.9898) * 6.0;
            c.add((p[4] + p[1] * w + noise).toNumber(), (p[5] + p[2] * w + noise * 0.7).toNumber(), (p[6] + p[3] * w + noise * 0.4).toNumber());
        }
        var got = c.finished ? c.lastReps : -1;
        logger.debug("Muster " + k + ": " + got + " Wdh (Soll " + reps + ")");
        if (got != reps) {
            bad += 1;
        }
    }
    Test.assertEqual(bad, 0);
    return true;
}
