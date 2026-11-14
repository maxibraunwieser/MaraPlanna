// Gym-Simulation für den Simulator (nur Demo-Build mit Demo.PILOT = "gym", gebaut von tools/gym-sim.ps1): ein Training wie im
// Studio, in Echtzeit, mit dem Oberkörper-Workout der Demo (Bankdrücken, Langhantelrudern, Bizepscurl).
//
//   Handgelenk   was die Uhr messen würde, Sekunde für Sekunde: Stehen (Ruhe mit Rauschen), Gehen zwischen den Geräten
//                (Armschwung 1 Hz mit Schrittstößen), Zurechtlegen (unregelmäßige Bewegungen), die Sätze (gleichmäßige
//                Wiederholungen, je Übung anders: Tempo, Achse, Lage des Handgelenks) und die Pausen.
//   Du           bedienst die Karte nach jedem Satz wie im Gym: nach 3 s START (zum Gewicht), beim ersten Satz AUF (+1 kg),
//                nach 2 weiteren Sekunden START (bestätigen, Pause). Am Ende speicherst du das Training.
// Jeder Abschnitt und jede Reaktion der Uhr steht in der Konsole ("GYM …"), damit man nachlesen kann, was erkannt wurde.

import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

(:demo :strength)
module Gym {
    const QUIET = 0;
    const WALK = 1;
    const FIDGET = 2;
    const SET = 3;
    // Programm "Push & Pull": Bankdrücken 3 Sätze, Langhantelrudern 3, Bizepscurl 2 (Gym.openPlan). Ablauf je Abschnitt:
    // [Art, Sekunden, Bewegungsmuster (Demo.pattern), Wiederholungen]. Zwischen zwei Sätzen derselben Übung 26 s Ruhe (Karte etwa
    // 6 s, dann 20 s Pause), vor jedem Satz kurz Zurechtlegen und 3 s Stillhalten.
    const SCRIPT = [
        [QUIET, 5, 0, 0], [WALK, 15, 0, 0], [FIDGET, 6, 0, 0], [QUIET, 3, 0, 0],
        [SET, 21, 0, 8], [QUIET, 26, 0, 0], [FIDGET, 3, 0, 0], [QUIET, 3, 0, 0],
        [SET, 21, 0, 8], [QUIET, 26, 0, 0], [FIDGET, 3, 0, 0], [QUIET, 3, 0, 0],
        [SET, 18, 0, 7], [QUIET, 12, 0, 0], [WALK, 12, 0, 0], [FIDGET, 4, 0, 0], [QUIET, 3, 0, 0],
        [SET, 13, 1, 10], [QUIET, 26, 0, 0], [FIDGET, 3, 0, 0], [QUIET, 3, 0, 0],
        [SET, 13, 1, 10], [QUIET, 26, 0, 0], [FIDGET, 3, 0, 0], [QUIET, 3, 0, 0],
        [SET, 13, 1, 10], [QUIET, 12, 0, 0], [WALK, 10, 0, 0], [FIDGET, 4, 0, 0], [QUIET, 3, 0, 0],
        [SET, 17, 2, 10], [QUIET, 26, 0, 0], [FIDGET, 3, 0, 0], [QUIET, 3, 0, 0],
        [SET, 17, 2, 10], [QUIET, 14, 0, 0]
    ] as Array<Array<Number>>;
    const SAY = [
        "Stehe am Eingang", "Gehe zur Hantelbank", "Lege mich hin, nehme die Stange", "Stange aus der Ablage",
        "Bankdrücken Satz 1 (8 Wdh)", "Stange ablegen, Pause", "Zurechtlegen", "Stange aus der Ablage",
        "Bankdrücken Satz 2 (8 Wdh)", "Pause", "Zurechtlegen", "Stange aus der Ablage",
        "Bankdrücken Satz 3 (nur 7 Wdh, müde)", "Stange ablegen", "Gehe zur Ruderstation", "Stange greifen", "Bereit",
        "Rudern Satz 1 (10 Wdh)", "Pause", "Stange greifen", "Bereit",
        "Rudern Satz 2 (10 Wdh)", "Pause", "Stange greifen", "Bereit",
        "Rudern Satz 3 (10 Wdh)", "Stange ablegen", "Gehe zu den Kurzhanteln", "Hanteln nehmen", "Bereit",
        "Bizepscurl Satz 1 (10 Wdh)", "Pause", "Hanteln nehmen", "Bereit",
        "Bizepscurl Satz 2 (10 Wdh)", "Fertig, Pause"
    ] as Array<String>;
    // Sätze je Übung im Programm (Reihenfolge der Übungen der Demo-Einheit Oberkörper)
    const SETS = [3, 3, 2] as Array<Number>;

    // Das Programm öffnen: die Oberkörper-Einheit der Demo mit mehr Sätzen und eigenem Namen, gleich beginnbereit
    function openPlan() as Void {
        var plan = StrengthPlan.fromFeed(WeekPlan.feed(), 0);
        if (plan == null) {
            System.println("GYM: keine Krafteinheit in der Demo");
            return;
        }
        var p = plan as StrengthPlan;
        p.title = "Push & Pull";
        for (var i = 0; i < p.items.size(); i++) {
            p.items[i].sets = i < SETS.size() ? SETS[i] : 2;
        }
        System.println("GYM Programm: " + p.title + " · " + p.items.size() + " Übungen");
        StrengthEntry.start(p);
    }
    const STATES = ["bereit", "Pause / nächste Übung", "Satz läuft", "Karte", "pausiert", "gespeichert", "Halten"] as Array<String>;

    var _phase as Number = -1;
    var _state as Number = -1;
    var _cardAt as Number = -1;
    var _cards as Number = 0;
    var _saved as Boolean = false;

    // Abschnitt und Sekunde darin zu einer Sekunde des Trainings; [-1, 0] nach dem Ende
    function phaseAt(second as Number) as Array<Number> {
        var start = 0;
        for (var i = 0; i < SCRIPT.size(); i++) {
            var len = SCRIPT[i][1];
            if (second < start + len) {
                return [i, second - start] as Array<Number>;
            }
            start += len;
        }
        return [-1, 0] as Array<Number>;
    }

    // Eine Sekunde Handgelenk (25 Messpunkte je Achse)
    function batch(second as Number) as Array<Array<Number>> {
        var at = phaseAt(second);
        var kind = at[0] < 0 ? QUIET : SCRIPT[at[0]][0];
        var xs = [] as Array<Number>;
        var ys = [] as Array<Number>;
        var zs = [] as Array<Number>;
        var p = Demo.pattern(at[0] < 0 ? 0 : SCRIPT[at[0]][2]);
        for (var j = 0; j < 25; j++) {
            var t = at[1] + j / 25.0;
            var noise = Math.sin((second * 25 + j) * 12.9898) * 6.0;
            var x = 0.0;
            var y = 1000.0;
            var z = 0.0;
            if (kind == WALK) {
                // Arm hängt (Schwerkraft entlang y), schwingt mit 1 Hz vor und zurück, dazu die Schrittstöße mit 2 Hz
                x = 280.0 * Math.sin(2.0 * Math.PI * t);
                z = 90.0 * Math.cos(2.0 * Math.PI * t) + 60.0 * Math.sin(4.0 * Math.PI * t);
            } else if (kind == FIDGET) {
                // unregelmäßig wie echtes Hantieren: jede Sekunde ein anderes Tempo (0,3 bis 1,8 Hz), eine andere Stärke und Richtung
                var r1 = (Math.sin(second * 78.233) * 43758.5453).abs();
                var r2 = (Math.sin(second * 12.9898 + 4.1) * 24634.6345).abs();
                var f = 0.3 + 1.5 * (r1 - Math.floor(r1));
                var amp = 60.0 + 180.0 * (r2 - Math.floor(r2));
                x = amp * Math.sin(2.0 * Math.PI * f * t + second);
                z = amp * 0.6 * Math.cos(2.0 * Math.PI * f * 1.7 * t);
                y = 950.0 + amp * 0.3 * Math.sin(2.0 * Math.PI * f * 0.5 * t);
            } else if (kind == SET) {
                var reps = SCRIPT[at[0]][3];
                var moving = t < reps / p[0];
                var w = moving ? Math.sin(2.0 * Math.PI * p[0] * t) : 0.0;
                x = p[4] + p[1] * w;
                y = p[5] + p[2] * w;
                z = p[6] + p[3] * w;
            } else if (kind == QUIET && at[0] >= 0 && at[0] + 1 < SCRIPT.size() && SCRIPT[at[0] + 1][0] == SET) {
                // Stillhalten direkt vor einem Satz: die Stange ist schon in Position, das Handgelenk liegt wie in der Übung
                var q = Demo.pattern(SCRIPT[at[0] + 1][2]);
                x = q[4];
                y = q[5];
                z = q[6];
            } else if (at[0] >= 0 && at[0] > 0 && SCRIPT[at[0] - 1][0] == SET) {
                // Ruhe direkt nach einem Satz: das Handgelenk liegt noch wie in der Übung
                var q = Demo.pattern(SCRIPT[at[0] - 1][2]);
                x = q[4];
                y = q[5];
                z = q[6];
            }
            xs.add((x + noise).toNumber());
            ys.add((y + noise * 0.7).toNumber());
            zs.add((z + noise * 0.4).toNumber());
        }
        return [xs, ys, zs] as Array<Array<Number>>;
    }

    function clock(s as Number) as String {
        return (s / 60) + ":" + (s % 60).format("%02d");
    }

    // Nach jeder Sekunde: erzählen, was passiert, und die Karte bedienen wie ein Mensch im Gym
    function tick(c as StrengthController, second as Number) as Void {
        var at = phaseAt(second);
        if (at[0] != _phase && at[0] >= 0) {
            _phase = at[0];
            System.println("GYM " + clock(second) + "  >> " + SAY[_phase]);
        }
        if (c.state != _state) {
            _state = c.state;
            var text = "GYM " + clock(second) + "     Uhr: " + STATES[_state];
            if (_state == Str.SET) {
                text += " (erkannt nach " + c.counter.reps() + " gleichmäßigen Wdh)";
            } else if (_state == Str.CONFIRM) {
                var e = c.plan.options[c.optIdx];
                text += " · " + e.name + (c.recognized() ? " (erkannt)" : "") + " · " + c.cReps + " Wdh · " + (c.cKg > 0.0 ? c.cKg.format("%.1f") + " " + c.plan.unit : "kein Gewicht");
                _cardAt = second;
            } else if (_state == Str.REST && c.sets.size() > 0) {
                var s = c.lastSet() as LoggedSet;
                text += " · gespeichert: " + s.name + " " + s.reps + " × " + s.kg.format("%.1f");
            }
            System.println(text);
        }
        // die Karte bedienen
        if (c.state == Str.CONFIRM && _cardAt >= 0) {
            var age = second - _cardAt;
            if (age == 3 && c.field == 0) {
                c.onStart();
                System.println("GYM " + clock(second) + "     Du: START -> Gewicht");
            } else if (age == 4 && _cards == 0 && c.field == 1) {
                c.onAdjust(1);
                System.println("GYM " + clock(second) + "     Du: AUF -> " + c.cKg.format("%.1f") + " " + c.plan.unit);
            } else if (age >= 5 && c.field == 1) {
                _cards += 1;
                _cardAt = -1;
                System.println("GYM " + clock(second) + "     Du: START -> bestätigt, Pause");
                c.onStart();
            }
        }
        // Ende: speichern
        if (at[0] < 0 && !_saved && c.state == Str.REST) {
            _saved = true;
            System.println("GYM " + clock(second) + "  >> Training speichern: " + c.sets.size() + " Sätze, " + c.totalReps() + " Wdh");
            c.save();
        }
    }
}
