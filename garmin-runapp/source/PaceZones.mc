// Zielpaces je Lauftyp. Quelle in dieser Reihenfolge:
//   1. MaraPlanna (gekoppelte Uhr, zuletzt geladene Daten in Application.Storage "run")
//   2. App-Einstellungen aus der Garmin Connect App (Properties, Format "5:26-5:59" / "4:57")
// Ohne Paces bleibt nur "Freier Lauf".

import Toybox.Application;
import Toybox.Lang;

class PaceZones {
    var source as String = "";
    var vdot as Float? = null;
    var miles as Boolean = false;
    // Wunschzeit für den Marathon (Sekunden) aus MaraPlanna, für die Prognose-Seite
    var goalS as Float? = null;
    // Index wie Pace.ZONES → [lo, hi] oder null
    private var _ranges as Array = new [8];

    function initialize() {
        load();
    }

    function load() as Void {
        _ranges = new [8];
        vdot = null;
        goalS = null;
        source = "";
        var feed = Application.Storage.getValue("run");
        if (feed instanceof Dictionary && feed.get("paces") instanceof Dictionary) {
            loadFeed(feed as Dictionary);
        } else {
            loadSettings();
        }
    }

    // Aus den MaraPlanna-Daten (auch von den Tests genutzt).
    function loadFeed(feed as Dictionary) as Void {
        var paces = feed.get("paces") as Dictionary;
        for (var i = 1; i < Pace.ZONES.size(); i++) {
            _ranges[i] = Pace.fromFeed(paces.get(Pace.ZONES[i]) as Object?);
        }
        var v = feed.get("vdot");
        vdot = v instanceof Lang.Float || v instanceof Lang.Number || v instanceof Lang.Double ? (v as Lang.Numeric).toFloat() : null;
        miles = "mi".equals(feed.get("units") as Object?);
        var goal = feed.get("goal");
        if (goal instanceof Dictionary) {
            var g = Pace.toNum(goal.get("s") as Object?);
            goalS = g == null ? null : g.toFloat();
        }
        source = "MaraPlanna";
    }

    private function loadSettings() as Void {
        var any = false;
        for (var i = 1; i < Pace.ZONES.size(); i++) {
            var r = Pace.parseRange(property(Pace.ZONES[i]));
            _ranges[i] = r;
            any = any || r != null;
        }
        var v = property("vdot");
        if (v != null) {
            vdot = v.toFloat();
        }
        if (any) {
            source = "Einstellungen";
        }
    }

    private function property(key as String) as String? {
        try {
            var v = Application.Properties.getValue(key);
            return v instanceof String && v.length() > 0 ? v : null;
        } catch (e) {
            return null;
        }
    }

    function range(zone as Number) as Array<Number>? {
        return zone > 0 && zone < _ranges.size() ? _ranges[zone] as Array<Number>? : null;
    }

    function hasAny() as Boolean {
        for (var i = 1; i < _ranges.size(); i++) {
            if (_ranges[i] != null) {
                return true;
            }
        }
        return false;
    }
}
