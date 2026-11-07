// Krafttraining auf der Uhr: Einstellungen, Einheiten und Übungen kommen von MaraPlanna. Auf der Uhr ist keine Übung und
// keine persönliche Angabe fest eingetragen: Handgelenk, Einheit, Übungsliste, die Einheiten von heute und ihre Figuren stammen
// von der Website (Seite "Strength"). Zwei Quellen, damit der Hauptfeed klein bleibt (ein Wert im Speicher der Uhr fasst 8 KB):
//
//   Hauptfeed "strength" (Sync.onRun, im Wert "run"):  {ready, w, u, auto, share}
//        ready  Einrichtung auf der Website gespeichert     w  Handgelenk l/r     u  Gewichtseinheit kg/lb
//        auto   Satz selbst abschließen                     share  Daten teilen
//   Eigene Anfrage GET /watch/strength (Sync.onStrength), gespeichert unter "str" (ohne Figuren) und "figs" (nur die Figuren):
//        d      Datum, für das die Einheiten gelten (ein anderer Tag zählt nicht als heute)
//        ex     [{i, n, f, a?, m, h?}]   die Übungsliste (Kennung, Name, Familie, Figur, Zählart, Halten in s)
//        sess   [{id, t, c, ex:[{i, n, f, s, r, k?, rest, a?, m, h?}]}]   die Einheiten von heute
//        sig    {Kennung: [n, Mittel (6), Streuung (6)]}   wie sich die Übungen dieser Person am Handgelenk anfühlen
//        an     {Figurenschlüssel: Bewegung}  →  "figs"
//   Zählart m: 0 aus der Bewegung, 1 die Uhr versucht es, fragt aber immer nach, 2 Halten mit Zeit.

import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

module StrengthStatus {
    // Kein "strength" im Feed (alter Stand oder offline)
    const NONE = 0;
    // Auf der Website noch nicht eingerichtet
    const SETUP = 1;
    const READY = 2;
}

module CountMode {
    const AUTO = 0;
    const ASSIST = 1;
    const TIME = 2;
}

(:strength)
class Planned {
    // Kennung der Bibliothek ('' für eine Übung außerhalb davon)
    var id as String;
    var name as String;
    var fam as String;
    var sets as Number;
    // Ziel-Wiederholungen (bei einem Halten 0)
    var reps as Number;
    // Gewicht vom letzten Mal in der Einheit des Nutzers, 0 = unbekannt
    var kg as Float;
    var rest as Number;
    // Schlüssel der Figur ('' ohne)
    var key as String = "";
    // Zählart (CountMode)
    var mode as Number = 0;
    // Sekunden zum Halten (nur CountMode.TIME)
    var hold as Number = 0;

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
    // Art der Einheit: lower, upper, full, core
    var kind as String = "";
    // Geplante Übungen der gewählten Einheit, in ihrer Reihenfolge (leer beim freien Training)
    var items as Array<Planned> = [] as Array<Planned>;
    // Auswahl beim Ändern der Übung und die Kandidaten der Erkennung: erst die geplanten, dann die eigene Liste
    var options as Array<Planned> = [] as Array<Planned>;
    var unit as String = "kg";
    var auto as Boolean = true;
    var share as Boolean = false;
    var wrist as String = "";
    // Figuren nach Schlüssel (roh aus dem Speicher); null = ausgeschaltet
    var figs as Dictionary? = null;
    // Gelernte Merkmale der Übungen nach Kennung
    var sigs as Dictionary? = null;
    private var _moves as Dictionary<String, FigureMove> = {} as Dictionary<String, FigureMove>;

    // Bewegung der Figur für einen Schlüssel (einmal gelesen); null ohne Eintrag.
    function move(key as String) as FigureMove? {
        if (figs == null || key.length() == 0) {
            return null;
        }
        var have = _moves.get(key);
        if (have != null) {
            return have as FigureMove;
        }
        var raw = g(figs as Dictionary, key);
        if (raw instanceof Dictionary) {
            var m = FigureMove.fromFeed(raw);
            if (m != null) {
                _moves.put(key, m as FigureMove);
                return m;
            }
        }
        return null;
    }

    // Was die Übung am Handgelenk bisher ergeben hat: [n, Mittel (6), Streuung (6)] oder null
    function sigOf(id as String) as Array<Number>? {
        if (sigs == null || id.length() == 0) {
            return null;
        }
        var raw = g(sigs as Dictionary, id);
        if (!(raw instanceof Array) || raw.size() < 13) {
            return null;
        }
        var out = [] as Array<Number>;
        for (var i = 0; i < 13; i++) {
            out.add(toFloat(raw[i] as Object?).toNumber());
        }
        return out;
    }

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

    // Die Einheiten und Übungen von der Website (eigene Anfrage), nur wenn sie für heute gelten
    static function stored() as Dictionary? {
        var raw = Application.Storage.getValue("str") as Object?;
        if (!(raw instanceof Dictionary)) {
            return null;
        }
        var st = raw as Dictionary;
        var d = g(st, "d");
        if (d instanceof String && !d.equals(Sync.today())) {
            return null;
        }
        return st;
    }

    // Die Einheiten von heute (Titel und Zahl der Übungen) für das Menü
    static function sessions(feed as Dictionary?) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        if (status(feed) != StrengthStatus.READY) {
            return out;
        }
        var st = stored();
        var s = st == null ? null : g(st as Dictionary, "sess");
        if (s instanceof Array) {
            for (var i = 0; i < s.size() && i < 4; i++) {
                var x = s[i];
                if (x instanceof Dictionary) {
                    var ex = g(x, "ex");
                    out.add({ "t" => str(g(x, "t")), "n" => ex instanceof Array ? ex.size() : 0 } as Dictionary);
                }
            }
        }
        return out;
    }

    // Eine Übung aus der Liste oder aus einer Einheit
    static function fromRow(r as Dictionary, withSets as Boolean) as Planned {
        var sets = toFloat(g(r, "s")).toNumber();
        var rest = toFloat(g(r, "rest")).toNumber();
        var p = new Planned(str(g(r, "i")), str(g(r, "n")), str(g(r, "f")), withSets ? (sets < 1 ? 1 : sets) : 0, toFloat(g(r, "r")).toNumber(), toFloat(g(r, "k")), rest < 15 ? 90 : rest);
        p.key = str(g(r, "a"));
        p.mode = toFloat(g(r, "m")).toNumber();
        p.hold = toFloat(g(r, "h")).toNumber();
        return p;
    }

    // Freies Training mit einer gewählten Übung der Bibliothek (Zeile aus "lib.<Gruppe>"): sie ist die erste und einzige geplante,
    // die eigene Liste steht danach zur Auswahl. null, wenn nicht eingerichtet.
    static function fromPick(feed as Dictionary?, row as Dictionary) as StrengthPlan? {
        var p = fromFeed(feed, -1);
        if (p == null) {
            var b = block(feed);
            if (b == null || !flag(b, "ready", false)) {
                return null;
            }
            p = new StrengthPlan();
            p.unit = str(g(b, "u")).equals("lb") ? "lb" : "kg";
            p.auto = flag(b, "auto", true);
            p.share = flag(b, "share", false);
            p.wrist = str(g(b, "w"));
            p.title = WatchUi.loadResource(Rez.Strings.StrengthFreeTitle) as String;
        }
        var e = fromRow(row, true);
        var all = [e] as Array<Planned>;
        for (var i = 0; i < p.options.size(); i++) {
            if (!p.options[i].same(e)) {
                all.add(p.options[i]);
            }
        }
        p.items = [e] as Array<Planned>;
        p.options = all;
        return p;
    }

    // Plan aus Feed und Speicher. session = Nummer der Einheit von heute, -1 = freies Training ohne Vorgabe.
    // null, wenn nicht eingerichtet oder nichts zu machen.
    static function fromFeed(feed as Dictionary?, session as Number) as StrengthPlan? {
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
        var st = stored();
        if (st != null) {
            var figs = Application.Storage.getValue("figs") as Object?;
            if (figs instanceof Dictionary) {
                p.figs = figs as Dictionary;
            }
            var sig = g(st as Dictionary, "sig");
            if (sig instanceof Dictionary) {
                p.sigs = sig;
            }
            var sess = g(st as Dictionary, "sess");
            if (session >= 0 && sess instanceof Array && session < sess.size() && sess[session] instanceof Dictionary) {
                var t = sess[session] as Dictionary;
                p.title = str(g(t, "t"));
                p.workoutId = str(g(t, "id"));
                p.kind = str(g(t, "c"));
                var rows = g(t, "ex");
                if (rows instanceof Array) {
                    for (var i = 0; i < rows.size(); i++) {
                        var r = rows[i];
                        if (r instanceof Dictionary) {
                            p.items.add(fromRow(r, true));
                        }
                    }
                }
            }
        }
        for (var i = 0; i < p.items.size(); i++) {
            p.options.add(p.items[i]);
        }
        var own = st == null ? null : g(st as Dictionary, "ex");
        if (own instanceof Array) {
            for (var i = 0; i < own.size(); i++) {
                var r = own[i];
                if (!(r instanceof Dictionary)) {
                    continue;
                }
                var e = fromRow(r, false);
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
