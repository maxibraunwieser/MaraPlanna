// Die Listen hinter "Absolviert" und "Trainingsplan" im Hauptmenü, als Karten (CardMenu).
//   Absolviert    "Diese Woche" (Wochenkilometer, WeekView), darunter die zuletzt absolvierten Einheiten, neueste zuerst
//   Trainingsplan jede Woche bis zum Ziel eine Karte (Kilometer, Zahl der Läufe und Kraft-Einheiten); Tippen zeigt die Einheiten
//                 der Woche in groben Zügen (Tag, Titel, Umfang), Tippen auf eine Einheit mit Schritten zeigt diese (DetailView).
//                 Ohne Wochendaten (alter Server): die Einheiten dieser und der nächsten Woche als Liste.
// Daten: PlanData (Server-Feed "plan" mit Schritten, "weeks" für alle Wochen, sonst "run", dazu die eigenen Läufe der Uhr).

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

(:details)
module SessionMenus {
    function miles() as Boolean {
        var zones = getApp().zones;
        return zones != null && (zones as PaceZones).miles;
    }

    // "Mi 5.11. · 9,0 km" bzw. "Heute · 20 min": Datum und Umfang einer Einheit.
    function subLabel(item as Dictionary, today as Number, mi as Boolean) as String {
        var day = item.get("day") as Number;
        var text = day == today ? "Heute" : SessionText.dateShort(day);
        var k = WeekPlan.toFloat(item.get("k") as Object?);
        var m = Pace.toNum(item.get("m") as Object?);
        if (k != null && k > 0) {
            text += " · " + SessionText.meters((k * 1000.0).toNumber(), mi, false);
        } else if (m != null && m > 0) {
            text += " · " + m + " min";
        }
        return text;
    }

    function title(item as Dictionary) as String {
        var t = item.get("t");
        return t instanceof String && t.length() > 0 ? t : "Lauf";
    }

    // Status einer Einheit des Plans: erledigt, ausgefallen, verpasst (vor heute offen), heute, geplant.
    function markOf(item as Dictionary, today as Number) as Number {
        var s = item.get("s");
        var day = item.get("day") as Number;
        if ("c".equals(s as Object?)) {
            return Mark.DONE;
        }
        if ("x".equals(s as Object?)) {
            return Mark.SKIPPED;
        }
        return day < today ? Mark.MISSED : (day == today ? Mark.TODAY : Mark.PLANNED);
    }

    // Absolviert
    function showDone() as Void {
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            (sync as Sync).refreshIfStale();
        }
        var feed = WeekPlan.feed();
        var today = WeekPlan.today();
        var mi = miles();
        var list = PlanData.finished(today);
        var items = [new CardItem(:week, "Diese Woche", MainMenu.weekInfo(feed, today), Draw.GREEN)] as Array<CardItem>;
        for (var i = 0; i < list.size(); i++) {
            var item = new CardItem(i, title(list[i]), subLabel(list[i], today, mi) + extra(list[i]), Draw.GREEN);
            item.mark = Mark.DONE;
            items.add(item);
        }
        if (list.size() == 0) {
            var none = new CardItem(:none, "Noch nichts absolviert", null, Draw.GRAY);
            none.enabled = false;
            items.add(none);
        }
        Cards.show(MainMenu.text(Rez.Strings.MenuWeek), items, new SessionListener(list, true), WatchUi.SLIDE_LEFT);
    }

    // Krafttrainings zeigen hinter dem Datum die Zahl der Übungen (Läufe schon den Umfang aus subLabel).
    function extra(item as Dictionary) as String {
        var x = item.get("x");
        return x instanceof Array ? " · " + x.size() + (x.size() == 1 ? " Übung" : " Übungen") : "";
    }

    // Trainingsplan: ohne Kopplung der Kopplungscode, sonst die Wochen.
    function openPlan() as Void {
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            (sync as Sync).refreshIfStale();
        }
        if (sync != null && !(sync as Sync).paired() && !Demo.active()) {
            WatchUi.pushView(new PlanView(), new PlanDelegate(), WatchUi.SLIDE_LEFT);
            return;
        }
        showPlan();
    }

    // Farbe der Phase (Grundlage grün, Aufbau blau, Spitze orange, Tapering violett)
    function phaseTone(p as Object?) as Number {
        return "u".equals(p) ? Draw.BLUE : ("p".equals(p) ? Draw.ORANGE : ("t".equals(p) ? Draw.VIOLET : Draw.GREEN));
    }

    // Eine Karte je Woche: "Woche 7 · 46 km", darunter "5 Lauf · 1 Kraft"
    function weekCard(w as Dictionary, index as Number, mi as Boolean) as CardItem {
        var n = Pace.toNum(w.get("n") as Object?);
        var k = Pace.toNum(w.get("k") as Object?);
        var r = Pace.toNum(w.get("r") as Object?);
        var st = Pace.toNum(w.get("s") as Object?);
        var title = "Woche " + (n != null ? n : 0);
        if (k != null && k > 0) {
            title += " · " + SessionText.meters(k * 1000, mi, false);
        }
        var sub = "";
        if (r != null && r > 0) {
            sub = r + " Lauf";
        }
        if (st != null && st > 0) {
            sub += (sub.length() > 0 ? " · " : "") + st + " Kraft";
        }
        var card = new CardItem(index, title, sub.length() > 0 ? sub : null, phaseTone(w.get("p") as Object?));
        if (index == 0) {
            // die laufende Woche: oranger Ring wie "heute"
            card.mark = Mark.TODAY;
        }
        return card;
    }

    function showPlan() as Void {
        var feed = WeekPlan.feed();
        var today = WeekPlan.today();
        var mi = miles();
        var weeks = WeeksData.weeks();
        if (weeks.size() == 0) {
            showPlanList(feed, today, mi);
            return;
        }
        var items = [] as Array<CardItem>;
        for (var i = 0; i < weeks.size(); i++) {
            items.add(weekCard(weeks[i], i, mi));
        }
        items.add(new CardItem(:race, "Rennen & Stand", MainMenu.planInfo(feed, today), Draw.GRAY));
        Cards.show(MainMenu.text(Rez.Strings.MenuPlan), items, new WeeksListener(weeks), WatchUi.SLIDE_LEFT);
    }

    // Die Einheiten einer Woche in groben Zügen: Status, Titel, darunter Tag und Umfang.
    function showWeek(w as Dictionary, index as Number) as Void {
        var today = WeekPlan.today();
        var mi = miles();
        var monday = WeeksData.monday(w);
        var sessions = w.get("d");
        var items = [] as Array<CardItem>;
        var detail = PlanData.planned(today);
        var steps = [] as Array<Dictionary?>;
        if (monday != null && sessions instanceof Array) {
            for (var i = 0; i < sessions.size(); i++) {
                var row = sessions[i];
                if (!(row instanceof Array) || row.size() < 5) {
                    continue;
                }
                var day = (monday as Number) + (Pace.toNum(row[0] as Object?) as Number);
                var entry = { "day" => day, "s" => row[4] } as Dictionary;
                var km = WeekPlan.toFloat(row[2] as Object?);
                var min = Pace.toNum(row[3] as Object?);
                var amount = km != null && km > 0 ? SessionText.meters((km * 1000.0).toNumber(), mi, false) : (min != null && min > 0 ? min + " min" : "");
                var card = new CardItem(items.size(), row[1] as String, SessionRow.dayName(day) + (amount.length() > 0 ? " · " + amount : ""), Draw.GRAY);
                card.mark = markOf(entry, today);
                items.add(card);
                steps.add(withSteps(detail, day, row[1] as String));
            }
        }
        if (items.size() == 0) {
            var none = new CardItem(:none, "Keine Einheiten", null, Draw.GRAY);
            none.enabled = false;
            items.add(none);
        }
        var n = Pace.toNum(w.get("n") as Object?);
        Cards.show(index == 0 ? "Diese Woche" : "Woche " + (n != null ? n : 0), items, new WeekSessionsListener(steps), WatchUi.SLIDE_LEFT);
    }

    // Der Eintrag mit Schritten zu einer Einheit (Tag und Titel gleich), sonst null (spätere Wochen haben keine Schritte).
    function withSteps(detail as Array<Dictionary>, day as Number, title as String) as Dictionary? {
        for (var i = 0; i < detail.size(); i++) {
            if ((detail[i].get("day") as Number) == day && title.equals(detail[i].get("t") as Object?)) {
                return detail[i];
            }
        }
        return null;
    }

    // Ohne Wochendaten: die Einheiten dieser und der nächsten Woche als Liste
    function showPlanList(feed as Dictionary?, today as Number, mi as Boolean) as Void {
        var list = PlanData.planned(today);
        var items = [] as Array<CardItem>;
        for (var i = 0; i < list.size(); i++) {
            var card = new CardItem(i, title(list[i]), subLabel(list[i], today, mi), Draw.GRAY);
            card.mark = markOf(list[i], today);
            items.add(card);
        }
        if (list.size() == 0) {
            var none = new CardItem(:none, "Keine Einheiten geplant", null, Draw.GRAY);
            none.enabled = false;
            items.add(none);
        }
        items.add(new CardItem(:race, "Rennen & Stand", MainMenu.planInfo(feed, today), Draw.GRAY));
        Cards.show(MainMenu.text(Rez.Strings.MenuPlan), items, new SessionListener(list, false), WatchUi.SLIDE_LEFT);
    }

    // Detailseite zu einem Eintrag der Liste.
    function openDetail(item as Dictionary, done as Boolean) as Void {
        var today = WeekPlan.today();
        var mi = miles();
        var day = item.get("day") as Number;
        var lines = done ? SessionText.doneLines(item, mi) : SessionText.planLines(item, mi);
        var sub = done ? "" : SessionText.planSummary(item, today, mi);
        var view = new DetailView(SessionText.dateLong(day), title(item), sub, lines);
        WatchUi.pushView(view, new DetailDelegate(view), WatchUi.SLIDE_LEFT);
    }
}

// Absolviert und die Liste ohne Wochendaten: Tippen zeigt die Detailseite, "Diese Woche" die Wochenansicht, "Rennen & Stand" den Stand.
(:details)
class SessionListener extends CardMenuListener {
    private var _list as Array<Dictionary>;
    private var _done as Boolean;

    function initialize(list as Array<Dictionary>, done as Boolean) {
        CardMenuListener.initialize();
        _list = list;
        _done = done;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id instanceof Lang.Number) {
            if (id >= 0 && id < _list.size()) {
                SessionMenus.openDetail(_list[id], _done);
            }
        } else if (id == :week) {
            WatchUi.pushView(new WeekView(), new WeekDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :race) {
            WatchUi.pushView(new PlanView(), new PlanDelegate(), WatchUi.SLIDE_LEFT);
        }
    }
}

// Trainingsplan nach Wochen: eine Woche öffnet ihre Einheiten, "Rennen & Stand" den Stand.
(:details)
class WeeksListener extends CardMenuListener {
    private var _weeks as Array<Dictionary>;

    function initialize(weeks as Array<Dictionary>) {
        CardMenuListener.initialize();
        _weeks = weeks;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id instanceof Lang.Number) {
            if (id >= 0 && id < _weeks.size()) {
                SessionMenus.showWeek(_weeks[id], id);
            }
        } else if (id == :race) {
            WatchUi.pushView(new PlanView(), new PlanDelegate(), WatchUi.SLIDE_LEFT);
        }
    }
}

// Einheiten einer Woche: mit Schritten (diese und die nächste Woche) öffnet die Detailseite, sonst bleibt es bei der Übersicht.
(:details)
class WeekSessionsListener extends CardMenuListener {
    private var _steps as Array<Dictionary?>;

    function initialize(steps as Array<Dictionary?>) {
        CardMenuListener.initialize();
        _steps = steps;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id instanceof Lang.Number && id >= 0 && id < _steps.size() && _steps[id] != null) {
            SessionMenus.openDetail(_steps[id] as Dictionary, false);
        }
    }
}
