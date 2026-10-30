// Die heutige MaraPlanna-Einheit Schritt für Schritt: jeder Schritt hat eine
// Länge (Meter "d" oder Sekunden "s") und optional einen Zielbereich ("lo"/"hi").
// Reine Logik – bekommt Zeit und Strecke vom Controller, damit sie testbar bleibt.

import Toybox.Lang;

class Workout {
    var title as String;
    var zone as Number;
    var index as Number = 0;
    var finished as Boolean = false;
    private var _steps as Array<Dictionary>;
    private var _startMs as Number = 0;
    private var _startDist as Float = 0.0;

    function initialize(title as String, zone as Number, steps as Array<Dictionary>) {
        self.title = title;
        self.zone = zone;
        _steps = steps;
    }

    // Aus den MaraPlanna-Daten; null, wenn keine (brauchbare) Einheit dabei ist.
    static function fromFeed(feed as Dictionary?) as Workout? {
        if (feed == null) {
            return null;
        }
        var w = feed.get("workout");
        if (!(w instanceof Dictionary)) {
            return null;
        }
        var steps = w.get("steps");
        var title = w.get("title");
        var zone = Pace.toNum(w.get("z") as Object?);
        if (!(steps instanceof Array) || steps.size() == 0 || !(title instanceof String)) {
            return null;
        }
        return new Workout(title, zone == null ? 0 : zone, steps as Array<Dictionary>);
    }

    function size() as Number {
        return _steps.size();
    }

    function current() as Dictionary? {
        return finished ? null : _steps[index];
    }

    function next() as Dictionary? {
        return finished || index + 1 >= _steps.size() ? null : _steps[index + 1];
    }

    function name(step as Dictionary?) as String {
        if (step == null) {
            return "";
        }
        var n = step.get("n");
        return n instanceof String ? n : "";
    }

    // Zielbereich des aktuellen Schritts (null = nach Gefühl, z. B. Trabpause).
    function target() as Array<Number>? {
        var s = current();
        if (s == null) {
            return null;
        }
        var lo = Pace.toNum(s.get("lo") as Object?);
        var hi = Pace.toNum(s.get("hi") as Object?);
        return lo == null || hi == null ? null : [lo, hi] as Array<Number>;
    }

    // Zonen-Nummer des aktuellen Schritts für die FIT-Datei.
    function stepZone() as Number {
        var s = current();
        var z = s == null ? null : Pace.toNum(s.get("z") as Object?);
        return z == null ? zone : z;
    }

    // Noch offene Meter bzw. Sekunden des aktuellen Schritts: [Wert, true = Meter].
    function remaining(timerMs as Number, dist as Float) as Array? {
        var s = current();
        if (s == null) {
            return null;
        }
        var d = Pace.toNum(s.get("d") as Object?);
        if (d != null) {
            var rest = d - (dist - _startDist);
            if (rest != rest) {
                return null; // NaN: Schritt nicht weiterschalten
            }
            var left = rest.toNumber();
            return [left < 0 ? 0 : left, true];
        }
        var sec = Pace.toNum(s.get("s") as Object?);
        if (sec != null) {
            var left = sec - (timerMs - _startMs) / 1000;
            return [left < 0 ? 0 : left, false];
        }
        return null;
    }

    // Sekunden seit Beginn des aktuellen Schritts.
    function stepSeconds(timerMs as Number) as Number {
        return (timerMs - _startMs) / 1000;
    }

    // Prüft, ob der Schritt erledigt ist; true, wenn zum nächsten gewechselt wurde.
    function update(timerMs as Number, dist as Float) as Boolean {
        var left = remaining(timerMs, dist);
        if (left == null || (left[0] as Numeric) > 0) {
            return false;
        }
        advance(timerMs, dist);
        return true;
    }

    // Nächster Schritt (auch per Runden-Taste); nach dem letzten ist die Einheit fertig.
    function advance(timerMs as Number, dist as Float) as Void {
        if (finished) {
            return;
        }
        index += 1;
        _startMs = timerMs;
        _startDist = dist;
        if (index >= _steps.size()) {
            finished = true;
            index = _steps.size() - 1;
        }
    }
}
