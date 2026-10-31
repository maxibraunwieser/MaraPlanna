// Woche und Plan aus den MaraPlanna-Daten (Application.Storage "run", vom Server geliefert):
//   week   Montag ("start") und Kilometer der Woche: gelaufen ("done") und geplant ("planned")
//   days   alle Einheiten dieser und der nächsten Woche: Tag ("i", Montag der Startwoche = 0),
//          Titel "t", Kilometer "k" (nur Läufe), Status "s": c = erledigt, p = geplant, x = ausgefallen
//   race   Datum und Name des Zielrennens
// Alle Tage sind "Tagesnummern" (Tage seit 1.1.1970), damit Rechnen über Monatsgrenzen einfach bleibt.
// Zusätzlich merkt sich die Uhr die eigenen Läufe der Woche, bis MaraPlanna sie über Garmin Connect kennt.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

module WeekPlan {
    const DAY_S = 86400;

    // Tagesnummer eines Datums, mittags gerechnet, damit die Zeitzone nichts verschiebt.
    function dayNumber(year as Number, month as Number, day as Number) as Number {
        return Gregorian.moment({ :year => year, :month => month, :day => day, :hour => 12 }).value() / DAY_S;
    }

    // Heute (lokales Datum der Uhr).
    function today() as Number {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return dayNumber(t.year, t.month as Number, t.day);
    }

    // "JJJJ-MM-TT" → Tagesnummer; null bei ungültigem Text.
    function parse(iso as Object?) as Number? {
        if (!(iso instanceof String) || iso.length() != 10) {
            return null;
        }
        var y = (iso.substring(0, 4) as String).toNumber();
        var m = (iso.substring(5, 7) as String).toNumber();
        var d = (iso.substring(8, 10) as String).toNumber();
        if (y == null || m == null || d == null || m < 1 || m > 12 || d < 1 || d > 31) {
            return null;
        }
        return dayNumber(y, m, d);
    }

    // Tagesnummer → "JJJJ-MM-TT"
    function iso(day as Number) as String {
        var t = Gregorian.utcInfo(new Time.Moment(day * DAY_S + DAY_S / 2), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }

    // Wochentag: Montag = 0 … Sonntag = 6 (der 1.1.1970 war ein Donnerstag).
    function weekday(day as Number) as Number {
        return (day + 3) % 7;
    }

    function monday(day as Number) as Number {
        return day - weekday(day);
    }

    function toFloat(v as Object?) as Float? {
        return v instanceof Lang.Number || v instanceof Lang.Float || v instanceof Lang.Double || v instanceof Lang.Long ? (v as Lang.Numeric).toFloat() : null;
    }

    function feed() as Dictionary? {
        var f = Application.Storage.getValue("run");
        return f instanceof Dictionary ? f : null;
    }

    // Montag der Woche, für die der Feed gilt.
    function feedStart(f as Dictionary?) as Number? {
        var week = f != null ? f.get("week") : null;
        return week instanceof Dictionary ? parse(week.get("start") as Object?) : null;
    }

    // Einheiten eines Tages: Wörterbücher mit "t", "k" (optional), "s".
    function sessions(f as Dictionary?, day as Number) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var start = feedStart(f);
        var days = f != null ? f.get("days") : null;
        if (start == null || !(days instanceof Array)) {
            return out;
        }
        for (var i = 0; i < days.size(); i++) {
            var d = days[i];
            if (d instanceof Dictionary) {
                var n = toFloat(d.get("i") as Object?);
                if (n != null && start + n.toNumber() == day) {
                    out.add(d);
                }
            }
        }
        return out;
    }

    // Gilt der Feed für die Woche, in der "day" liegt? (Zuletzt geladene Daten können von letzter Woche sein.)
    function covers(f as Dictionary?, day as Number) as Boolean {
        var start = feedStart(f);
        if (start == null) {
            return false;
        }
        var offset = day - start;
        return offset >= 0 && offset < 14;
    }

    // [gelaufen, geplant] in km für die Woche von "day"; null, wenn der Feed eine andere Woche beschreibt.
    function totals(f as Dictionary?, day as Number) as Array<Float>? {
        var start = feedStart(f);
        var week = f != null ? f.get("week") : null;
        if (start == null || !(week instanceof Dictionary) || start != monday(day)) {
            return null;
        }
        var done = toFloat(week.get("done") as Object?);
        var planned = toFloat(week.get("planned") as Object?);
        return done == null || planned == null ? null : [done, planned] as Array<Float>;
    }

    // Eigene Läufe dieser Woche (Meter), die diese App aufgezeichnet hat.
    function loggedMeters(day as Number) as Float? {
        var log = Application.Storage.getValue("weekLog");
        if (log instanceof Dictionary) {
            var mon = toFloat(log.get("mon") as Object?);
            if (mon != null && mon.toNumber() == monday(day)) {
                return toFloat(log.get("m") as Object?);
            }
        }
        return null;
    }

    function logRun(meters as Float, day as Number) as Void {
        var before = loggedMeters(day);
        var total = (before == null ? 0.0 : before) + (meters > 0 ? meters : 0.0);
        Application.Storage.setValue("weekLog", { "mon" => monday(day), "m" => total } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }

    // Kilometer der Woche: der größere Wert aus MaraPlanna (alle Läufe, auch von anderen Geräten, nach dem
    // Abgleich mit Garmin Connect) und den eigenen Läufen dieser Woche (sofort nach dem Speichern).
    // Beides zu addieren würde Läufe doppelt zählen, sobald MaraPlanna sie kennt. null = keine Daten.
    function doneKm(f as Dictionary?, day as Number) as Float? {
        var t = totals(f, day);
        var own = loggedMeters(day);
        if (t == null && own == null) {
            return null;
        }
        var server = t == null ? 0.0 : t[0];
        var mine = own == null ? 0.0 : own / 1000.0;
        return server > mine ? server : mine;
    }

    function plannedKm(f as Dictionary?, day as Number) as Float? {
        var t = totals(f, day);
        return t == null ? null : t[1];
    }

    // Tage bis zum Rennen (0 = heute); null ohne Rennen. Vergangene Rennen zählen nicht.
    function raceDays(f as Dictionary?, day as Number) as Number? {
        var race = f != null ? f.get("race") : null;
        var date = race instanceof Dictionary ? parse(race.get("date") as Object?) : null;
        return date == null || date < day ? null : date - day;
    }

    function raceName(f as Dictionary?) as String? {
        var race = f != null ? f.get("race") : null;
        var name = race instanceof Dictionary ? race.get("name") : null;
        return name instanceof String && name.length() > 0 ? name : null;
    }

    // Wie lange liegt der letzte erfolgreiche Abgleich zurück (Minuten); null = noch nie.
    function syncedMinutes() as Number? {
        var t = Application.Storage.getValue("synced");
        if (!(t instanceof Lang.Number)) {
            return null;
        }
        var age = Time.now().value() - t;
        return age < 0 ? 0 : age / 60;
    }

    // Ist alles erledigt, was an diesem Tag geplant war? false ohne Einheiten.
    function allDone(list as Array<Dictionary>) as Boolean {
        var any = false;
        for (var i = 0; i < list.size(); i++) {
            var s = list[i].get("s");
            if ("x".equals(s as Object?)) {
                continue;
            }
            any = true;
            if (!"c".equals(s as Object?)) {
                return false;
            }
        }
        return any;
    }
}
