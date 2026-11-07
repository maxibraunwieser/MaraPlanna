// Daten für "Trainingsplan" und "Absolviert" (Application.Storage "plan", vom Server über /plan geliefert):
//   start  Montag der Startwoche, alle "i" zählen davon in Tagen (negativ = frühere Wochen)
//   days   Einheiten dieser und der nächsten Woche mit den Schritten ("st"): i, t (Titel), k (km), m (Minuten),
//          s (c = erledigt, p = geplant, x = ausgefallen)
//   done   zuletzt absolvierte Einheiten: Läufe (k km, s Sekunden, h Puls, e Anstieg, te, pk geplante km, ts Start)
//          und Krafttrainings (x = Zeilen "Übung", "3 × 8 · 60 kg")
// Fehlt "plan" (alter Server, noch nicht geladen), zeigt die Uhr aus dem Hauptfeed ("run") wenigstens Titel, Kilometer
// und Status. Eigene Läufe merkt sich die Uhr selbst (RunLog), bis der Server sie über Garmin Connect kennt.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:details)
module PlanData {
    function feed() as Dictionary? {
        var p = Application.Storage.getValue("plan");
        return p instanceof Dictionary ? p : null;
    }

    // Montag, ab dem die Tagesnummern "i" des Plans zählen.
    function start(p as Dictionary?) as Number? {
        return p != null ? WeekPlan.parse(p.get("start") as Object?) : null;
    }

    function items(p as Dictionary?, key as String) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var list = p != null ? p.get(key) : null;
        if (list instanceof Array) {
            for (var i = 0; i < list.size(); i++) {
                if (list[i] instanceof Dictionary) {
                    out.add(list[i] as Dictionary);
                }
            }
        }
        return out;
    }

    // Tagesnummer eines Eintrags: Start + "i".
    function dayOf(p as Dictionary, base as Number, item as Dictionary) as Number? {
        var n = WeekPlan.toFloat(item.get("i") as Object?);
        return n == null ? null : base + n.toNumber();
    }

    // Geplante Einheiten ab dem Montag der laufenden Woche, nach Tag sortiert; jede bekommt "day" (Tagesnummer).
    // Quelle ist der Plan mit Schritten, sonst der Hauptfeed (ohne Schritte).
    function planned(today as Number) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var p = feed();
        var base = start(p);
        var list = items(p, "days");
        if (base == null || list.size() == 0) {
            var f = WeekPlan.feed();
            base = WeekPlan.feedStart(f);
            list = items(f, "days");
        }
        if (base == null) {
            return out;
        }
        var from = WeekPlan.monday(today);
        for (var i = 0; i < list.size(); i++) {
            var n = WeekPlan.toFloat(list[i].get("i") as Object?);
            if (n != null && base + n.toNumber() >= from) {
                list[i].put("day", base + n.toNumber());
                out.add(list[i]);
            }
        }
        return out;
    }

    // Absolvierte Einheiten, neueste zuerst; jede bekommt "day" (Tagesnummer) und "ts" (Startzeit oder Mittag des Tages).
    // Eigene Läufe, die der Server noch nicht kennt (Startzeit innerhalb von MATCH_S), kommen dazu.
    function finished(today as Number) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var p = feed();
        var base = start(p);
        var list = items(p, "done");
        for (var i = 0; base != null && i < list.size(); i++) {
            var d = dayOf(p as Dictionary, base, list[i]);
            if (d != null) {
                list[i].put("day", d);
                if (!(list[i].get("ts") instanceof Lang.Number)) {
                    list[i].put("ts", d * WeekPlan.DAY_S + WeekPlan.DAY_S / 2);
                }
                out.add(list[i]);
            }
        }
        // Ohne Plandaten vom Server: erledigte Einheiten der Woche aus dem Hauptfeed
        if (base == null) {
            var f = WeekPlan.feed();
            var fb = WeekPlan.feedStart(f);
            var days = items(f, "days");
            for (var i = 0; fb != null && i < days.size(); i++) {
                var n = WeekPlan.toFloat(days[i].get("i") as Object?);
                if (n != null && "c".equals(days[i].get("s") as Object?)) {
                    var day = fb + n.toNumber();
                    days[i].put("day", day);
                    days[i].put("ts", day * WeekPlan.DAY_S + WeekPlan.DAY_S / 2);
                    days[i].put("fb", true);
                    out.add(days[i]);
                }
            }
        }
        var mine = RunLog.list();
        for (var i = 0; i < mine.size(); i++) {
            if (!RunLog.known(out, mine[i])) {
                mine[i].put("day", RunLog.dayOf(mine[i]));
                mine[i].put("k", (mine[i].get("m") as Number) / 1000.0);
                out.add(mine[i]);
            }
        }
        return sortNewest(out);
    }

    // Absteigend nach "ts" (Einfügesortierung: die Listen sind kurz).
    function sortNewest(list as Array<Dictionary>) as Array<Dictionary> {
        for (var i = 1; i < list.size(); i++) {
            var item = list[i];
            var ts = tsOf(item);
            var j = i - 1;
            while (j >= 0 && tsOf(list[j]) < ts) {
                list[j + 1] = list[j];
                j -= 1;
            }
            list[j + 1] = item;
        }
        return list;
    }

    function tsOf(item as Dictionary) as Number {
        var t = item.get("ts");
        return t instanceof Lang.Number ? t : 0;
    }
}

// Läufe, die diese App aufgezeichnet hat: Startzeit "ts" (Sekunden), Meter "m", Sekunden "s", Ø-Puls "h", Titel "t".
// Höchstens KEEP Stück, nicht älter als MAX_AGE_S. Sobald der Server einen Lauf kennt (gleiche Startzeit), zählt er nur dort.
(:details)
module RunLog {
    const KEEP = 6;
    const MAX_AGE_S = 28 * 86400;
    // Startzeiten von Uhr und Garmin Connect weichen um Sekunden ab; so viel Spielraum gilt als derselbe Lauf.
    const MATCH_S = 300;

    function list() as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var saved = Application.Storage.getValue("runLog");
        if (saved instanceof Array) {
            var now = Time.now().value();
            for (var i = 0; i < saved.size(); i++) {
                var e = saved[i];
                if (e instanceof Dictionary && e.get("ts") instanceof Lang.Number && now - (e.get("ts") as Number) < MAX_AGE_S) {
                    out.add(e as Dictionary);
                }
            }
        }
        return out;
    }

    function add(ts as Number, meters as Float, seconds as Number, hr as Number?, title as String) as Void {
        var entry = { "ts" => ts, "m" => meters.toNumber(), "s" => seconds, "t" => title.length() > 26 ? title.substring(0, 26) : title } as Dictionary;
        if (hr != null && hr > 0) {
            entry.put("h", hr);
        }
        var all = list();
        all.add(entry);
        while (all.size() > KEEP) {
            all = all.slice(1, null) as Array<Dictionary>;
        }
        Application.Storage.setValue("runLog", all as Array<Application.Storage.ValueType>);
    }

    // Kennt die Liste (vom Server) diesen Lauf schon?
    function known(server as Array<Dictionary>, mine as Dictionary) as Boolean {
        var ts = PlanData.tsOf(mine);
        for (var i = 0; i < server.size(); i++) {
            var s = server[i];
            if (s.get("fb") != null) {
                // Aus dem Hauptfeed: nur der Tag ist bekannt, nicht die Startzeit
                if (s.get("day") == dayOf(mine) && s.get("k") != null) {
                    return true;
                }
            } else if (s.get("k") != null && (PlanData.tsOf(s) - ts).abs() <= MATCH_S) {
                return true;
            }
        }
        return false;
    }

    // Lokaler Kalendertag des Laufs (Tagesnummer).
    function dayOf(e as Dictionary) as Number {
        var t = Gregorian.info(new Time.Moment(PlanData.tsOf(e)), Time.FORMAT_SHORT);
        return WeekPlan.dayNumber(t.year, t.month as Number, t.day);
    }
}

// Alle Wochen des Plans ab dieser Woche (Application.Storage "weeks", vom Server über /weeks geliefert):
//   start  Montag der laufenden Woche, "i" einer Woche zählt davon in Tagen
//   weeks  n (Wochennummer), i, p (Phase b/u/p/t), k (km), r (Läufe), s (Kraft), e (Erholungswoche) und
//          d: Einheiten [Tag 0-6, Titel, km, Minuten, Status c/p/x]
(:details)
module WeeksData {
    function feed() as Dictionary? {
        var w = Application.Storage.getValue("weeks");
        return w instanceof Dictionary ? w : null;
    }

    function weeks() as Array<Dictionary> {
        return PlanData.items(feed(), "weeks");
    }

    // Tagesnummer des Montags einer Woche
    function monday(w as Dictionary) as Number? {
        var base = WeekPlan.parse(feed() != null ? (feed() as Dictionary).get("start") as Object? : null);
        var i = Pace.toNum(w.get("i") as Object?);
        return base != null && i != null ? (base as Number) + (i as Number) : null;
    }
}
