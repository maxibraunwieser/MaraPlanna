// Welche Muskeln ein Krafttraining beansprucht hat (Ansicht am Ende, StrengthView.drawMuscles).
//   Jede Übung trägt zwei Bitmasken: Hauptmuskeln und Nebenmuskeln (vom Server, siehe supabase/functions/_shared/figureMuscles.ts
//   MUSCLE_IDS; fehlen sie, schätzt ofFamily sie aus der Bewegungsart). Jeder gemachte Satz zählt für einen Hauptmuskel 1, für einen
//   Nebenmuskel 0,5. Die Ansicht zeigt die Muskeln nach dieser Last geordnet: stark (ab zwei Dritteln des stärksten), mittel, leicht.

import Toybox.Lang;

(:strength)
module Muscles {
    // Reihenfolge = Bits der Masken (wie MUSCLE_IDS im Server)
    const NAMES = [
        "Brust", "Rücken", "Nacken", "Schultern", "Bizeps", "Trizeps", "Unterarme", "Quadrizeps", "Beinbeuger", "Gesäß", "Waden",
        "Bauch", "Unt. Rücken", "Hüftbeuger", "Adduktoren"
    ] as Array<String>;

    // Haupt- und Nebenmuskeln je Bewegungsart (wenn der Server keine Masken schickt)
    function ofFamily(fam as String) as Array<Number> {
        var map = {
            "push_h" => [1, 8 | 32],
            "push_v" => [8, 32 | 4],
            "pull_h" => [2, 16 | 4 | 8],
            "pull_v" => [2, 16 | 64],
            "curl" => [16, 64],
            "triceps" => [32, 0],
            "squat" => [128 | 512, 256 | 4096 | 16384],
            "hinge" => [256 | 512, 4096 | 64],
            "lunge" => [128 | 512, 256 | 16384],
            "pushup" => [1, 32 | 8 | 2048],
            "glute" => [512, 256],
            "calf" => [1024, 0],
            "delts" => [8, 0],
            "core" => [2048, 8192],
            "leg_iso" => [128, 0]
        } as Dictionary<String, Array<Number>>;
        var m = map.get(fam);
        return m != null ? m : [0, 0] as Array<Number>;
    }

    // Last je Muskel aus den Masken der gemachten Sätze ([Haupt, Neben] je Satz)
    function load(masks as Array<Array<Number>>) as Array<Float> {
        var out = [] as Array<Float>;
        for (var i = 0; i < NAMES.size(); i++) {
            out.add(0.0);
        }
        for (var k = 0; k < masks.size(); k++) {
            for (var i = 0; i < NAMES.size(); i++) {
                var bit = 1 << i;
                if ((masks[k][0] & bit) != 0) {
                    out[i] += 1.0;
                } else if ((masks[k][1] & bit) != 0) {
                    out[i] += 0.5;
                }
            }
        }
        return out;
    }

    // Die beanspruchten Muskeln, stärkste zuerst: Indizes in NAMES (höchstens max)
    function ranked(load as Array<Float>, max as Number) as Array<Number> {
        var out = [] as Array<Number>;
        var used = [] as Array<Boolean>;
        for (var i = 0; i < load.size(); i++) {
            used.add(false);
        }
        while (out.size() < max) {
            var best = -1;
            for (var i = 0; i < load.size(); i++) {
                if (!used[i] && load[i] > 0.0 && (best < 0 || load[i] > load[best])) {
                    best = i;
                }
            }
            if (best < 0) {
                break;
            }
            used[best] = true;
            out.add(best);
        }
        return out;
    }

    // 2 stark, 1 mittel, 0 leicht (im Verhältnis zum am stärksten beanspruchten Muskel)
    function level(v as Float, top as Float) as Number {
        if (top <= 0.0) {
            return 0;
        }
        var r = v / top;
        return r >= 0.66 ? 2 : (r >= 0.33 ? 1 : 0);
    }
}
