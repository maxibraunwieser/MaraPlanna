// Krafttraining auf der Uhr: Einstellungen und Übungen kommen aus dem Feed von MaraPlanna ("strength",
// geladen wie die Läufe in Sync). Auf der Uhr ist keine Übung und keine persönliche Angabe fest eingetragen:
// Handgelenk, Einheit, Übungsliste und die heutige Einheit stammen von der Website (Seite "Strength").
//
// Feed (Kurzformen wie im Rest des Feeds):
//   ready  Einrichtung auf der Website gespeichert
//   w      Handgelenk l/r        u  Gewichtseinheit kg/lb      auto  Satz selbst abschließen    share  Daten teilen
//   ex     [{i, n, f}]           die eigene Übungsliste (Kennung, Name, Familie)
//   today  {id, t, ex:[{i, n, f, s, r, k?, rest}]}   Einheit von heute: Übungen mit Sätzen, Wdh, letztes Gewicht, Pause

import Toybox.Lang;
import Toybox.WatchUi;

module StrengthStatus {
    // Kein "strength" im Feed (alter Stand oder offline)
    const NONE = 0;
    // Auf der Website noch nicht eingerichtet
    const SETUP = 1;
    const READY = 2;
}

(:strength)
class Planned {
    var id as String;
    var name as String;
    var fam as String;
    var sets as Number;
    var reps as Number;
    // Gewicht vom letzten Mal in der Einheit des Nutzers, 0 = unbekannt
    var kg as Float;
    var rest as Number;

    function initialize(id as String, name as String, fam as String, sets as Number, reps as Number, kg as Float, rest as Number) {
        self.id = id;
        self.name = name;
        self.fam = fam;
        self.sets = sets;
        self.reps = reps;
        self.kg = kg;
        self.rest = rest;
    }

    // Gleiche Übung? (Kennung, bei Übungen außerhalb der Bibliothek der Name)
    function same(other as Planned) as Boolean {
        return id.length() > 0 ? id.equals(other.id) : name.equals(other.name);
    }
}

(:strength)
class StrengthPlan {
    var title as String = "";
    var workoutId as String = "";
    // Geplante Übungen von heute, in der Reihenfolge der Einheit (leer beim freien Training)
    var items as Array<Planned> = [] as Array<Planned>;
    // Auswahl beim Ändern der Übung: erst die geplanten, dann die eigene Liste
    var options as Array<Planned> = [] as Array<Planned>;
    var unit as String = "kg";
    var auto as Boolean = true;
    var share as Boolean = false;
    var wrist as String = "";

    // Gewichtsschritt beim Einstellen
    function step() as Float {
        return unit.equals("lb") ? 5.0 : 2.5;
    }

    function planned() as Boolean {
        return items.size() > 0;
    }

    static function g(d as Dictionary, k as String) as Object? {
        return d.get(k) as Object?;
    }

    static function flag(d as Dictionary, k as String, dflt as Boolean) as Boolean {
        var v = g(d, k);
        return v instanceof Boolean ? v : dflt;
    }

    static function block(feed as Dictionary?) as Dictionary? {
        if (feed == null) {
            return null;
        }
        var b = g(feed, "strength");
        return b instanceof Dictionary ? b : null;
    }

    static function status(feed as Dictionary?) as Number {
        var b = block(feed);
        if (b == null) {
            return StrengthStatus.NONE;
        }
        return flag(b, "ready", false) ? StrengthStatus.READY : StrengthStatus.SETUP;
    }

    static function toFloat(o as Object?) as Float {
        if (o instanceof Number) {
            return o.toFloat();
        }
        if (o instanceof Float) {
            return o;
        }
        if (o instanceof Double) {
            return o.toFloat();
        }
        return 0.0;
    }

    static function str(o as Object?) as String {
        return o instanceof String ? o : "";
    }

    // Plan aus dem Feed. today = false: freies Training ohne Vorgabe. null, wenn nicht eingerichtet.
    static function fromFeed(feed as Dictionary?, today as Boolean) as StrengthPlan? {
        var b = block(feed);
        if (b == null || !flag(b, "ready", false)) {
            return null;
        }
        var p = new StrengthPlan();
        p.unit = str(g(b, "u")).equals("lb") ? "lb" : "kg";
        p.auto = flag(b, "auto", true);
        p.share = flag(b, "share", false);
        p.wrist = str(g(b, "w"));
        p.title = WatchUi.loadResource(Rez.Strings.StrengthFreeTitle) as String;

        var t = g(b, "today");
        if (today && t instanceof Dictionary) {
            p.title = str(g(t, "t"));
            p.workoutId = str(g(t, "id"));
            var rows = g(t, "ex");
            if (rows instanceof Array) {
                for (var i = 0; i < rows.size(); i++) {
                    var r = rows[i];
                    if (!(r instanceof Dictionary)) {
                        continue;
                    }
                    var sets = toFloat(g(r, "s")).toNumber();
                    var rest = toFloat(g(r, "rest")).toNumber();
                    p.items.add(new Planned(str(g(r, "i")), str(g(r, "n")), str(g(r, "f")), sets < 1 ? 1 : sets, toFloat(g(r, "r")).toNumber(), toFloat(g(r, "k")), rest < 15 ? 90 : rest));
                }
            }
        }
        for (var i = 0; i < p.items.size(); i++) {
            p.options.add(p.items[i]);
        }
        var own = g(b, "ex");
        if (own instanceof Array) {
            for (var i = 0; i < own.size(); i++) {
                var r = own[i];
                if (!(r instanceof Dictionary)) {
                    continue;
                }
                var e = new Planned(str(g(r, "i")), str(g(r, "n")), str(g(r, "f")), 0, 0, 0.0, 90);
                var known = false;
                for (var j = 0; j < p.options.size(); j++) {
                    known = known || p.options[j].same(e);
                }
                if (!known) {
                    p.options.add(e);
                }
            }
        }
        return p.options.size() > 0 ? p : null;
    }
}
