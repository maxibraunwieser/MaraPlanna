// Zielzeit-Prognose. Reine Rechnung ohne Zustand, damit sie testbar ist.
//
// Mit Einheit (Workout): Verhältnis aus tatsächlicher und geplanter Zeit für das bisher
// Gelaufene, angewendet auf den Rest des Plans. Läuft man bisher 3 % langsamer als geplant,
// werden auch für den Rest 3 % mehr gerechnet.
// Ohne Einheit: bisherige Zeit + Restdistanz × Ø-Pace.

import Toybox.Lang;

module Prediction {
    // Erst nach so viel geplanter Zeit ist das Verhältnis aussagekräftig.
    const MIN_PLANNED_S = 90.0;
    // Das Verhältnis wird begrenzt, damit ein Stehenbleiben die Prognose nicht sprengt.
    const RATIO_MIN = 0.7;
    const RATIO_MAX = 1.5;
    // Standarddistanzen für die Prognose ohne Einheit (m)
    const DISTANCES = [5000.0, 10000.0, 21097.5, 42195.0] as Array<Float>;
    const DISTANCE_NAMES = ["5 km", "10 km", "Halbmarathon", "Marathon"] as Array<String>;

    // Prognose der Gesamtzeit in Sekunden; null, solange es zu früh dafür ist.
    function finish(planned as Float, plannedDone as Float, actual as Float) as Float? {
        if (plannedDone < MIN_PLANNED_S || actual <= 0) {
            return null;
        }
        var r = actual / plannedDone;
        r = r < RATIO_MIN ? RATIO_MIN : (r > RATIO_MAX ? RATIO_MAX : r);
        return actual + (planned - plannedDone) * r;
    }

    // -1 = schneller als das Ziel, 0 = im Ziel, 1 = langsamer. Toleranz: 1 %, mindestens 15 s.
    function status(predicted as Float, planned as Float) as Number {
        var tol = planned * 0.01;
        tol = tol < 15.0 ? 15.0 : tol;
        var diff = predicted - planned;
        return diff > tol ? 1 : (diff < -tol ? -1 : 0);
    }

    // Zeit in Sekunden bis zur Distanz targetM bei gleichbleibender Pace (s/km);
    // null, wenn die Distanz schon erreicht ist oder noch keine Pace bekannt ist.
    function atPace(elapsedS as Float, dist as Float, targetM as Float, pace as Float?) as Float? {
        if (pace == null || dist >= targetM) {
            return null;
        }
        return elapsedS + (targetM - dist) / 1000.0 * (pace as Float);
    }

    // Sekunden → "1:02:03" bzw. "52:30"; "--:--" ohne Wert; Vorzeichen für Differenzen.
    function clock(s as Float?) as String {
        if (s == null || s != s) {
            return "--:--";
        }
        var v = s as Float;
        return Pace.time((v * 1000).toNumber());
    }

    function signed(s as Float) as String {
        var a = s.abs();
        return (s < 0 ? "-" : "+") + Pace.time((a * 1000).toNumber());
    }
}
