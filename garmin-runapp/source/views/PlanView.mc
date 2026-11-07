// "Trainingsplan": die Verbindung zur MaraPlanna-Web-App und das, was von dort kommt.
//   nicht gekoppelt   Kopplungscode zum Eingeben auf der Website
//   gekoppelt         Tage bis zum Rennen, Zielzeit und VDOT, Stand des Abgleichs; auf Uhren mit 128 KB Speicher auch die
//                     nächsten Einheiten (sonst stehen sie in der Liste "Trainingsplan", siehe SessionMenus; diese Seite
//                     öffnet sich dort über "Rennen & Stand")
// START bzw. Tippen lädt die Daten neu.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Unter der Rennzeile: die nächsten Einheiten (Uhren ohne die Liste "Trainingsplan") bzw. der Hinweis zum Aktualisieren.
module Upcoming {
    // Wie viele kommende Einheiten die Seite zeigt
    const COUNT = 3;

    (:nodetails)
    function draw(dc as Graphics.Dc, feed as Dictionary?, today as Number, miles as Boolean, next as Float) as Void {
        var h = dc.getHeight();
        // Die nächsten Einheiten ab heute (heute nur, solange sie noch offen ist)
        var rows = [] as Array<Number>;
        for (var d = 0; d < 14 && rows.size() < COUNT; d++) {
            var list = WeekPlan.sessions(feed, today + d);
            if (list.size() > 0 && !(d == 0 && WeekPlan.allDone(list))) {
                rows.add(today + d);
            }
        }
        if (rows.size() == 0) {
            Draw.lineAlt(dc, h * 0.68, Graphics.FONT_XTINY, Draw.GRAY, ["Keine Einheiten geplant" as String]);
            return;
        }
        var rowH = h * 0.1;
        var nameW = SessionRow.nameWidth(dc);
        for (var i = 0; i < rows.size(); i++) {
            SessionRow.draw(dc, next + h * 0.06 + rowH * (i + 0.5), rowH, rows[i], WeekPlan.sessions(feed, rows[i]), today, miles, nameW);
        }
    }

    // Die Einheiten selbst stehen in der Liste "Trainingsplan"; hier bleibt der Hinweis zum Aktualisieren.
    (:details)
    function draw(dc as Graphics.Dc, feed as Dictionary?, today as Number, miles as Boolean, next as Float) as Void {
        Draw.lineAlt(dc, dc.getHeight() * 0.68, Graphics.FONT_XTINY, Draw.GRAY, ["START: neu laden", "START = neu laden"] as Array<String>);
    }
}

class PlanView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.background(dc, true);
        var h = dc.getHeight();
        Draw.lineAlt(dc, h * 0.105, Graphics.FONT_XTINY, Draw.ORANGE, ["TRAININGSPLAN", "PLAN"] as Array<String>);
        var sync = getApp().sync;
        if (sync != null && !(sync as Sync).paired() && !Demo.active()) {
            unpaired(dc, sync as Sync);
        } else {
            paired(dc);
        }
        Draw.lineAlt(dc, h * 0.9, Graphics.FONT_XTINY, Draw.DIM, status(sync));
    }

    private function unpaired(dc as Graphics.Dc, sync as Sync) as Void {
        var h = dc.getHeight();
        Draw.lineAlt(dc, h * 0.25, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, ["Nicht gekoppelt"] as Array<String>);
        var code = sync.code();
        if (code != null && code.length() == 6) {
            Draw.lineFit(dc, h * 0.4, [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, Draw.ORANGE, code.substring(0, 3) + " " + code.substring(3, 6));
            Draw.lineAlt(dc, h * 0.58, Graphics.FONT_XTINY, Draw.GRAY, ["In MaraPlanna unter" as String]);
            Draw.lineAlt(dc, h * 0.66, Graphics.FONT_XTINY, Draw.GRAY, ["Einstellungen eingeben" as String]);
        } else {
            Draw.lineAlt(dc, h * 0.45, Graphics.FONT_XTINY, Draw.GRAY, ["Code wird geholt…", "Code wird geholt"] as Array<String>);
        }
    }

    private function paired(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var app = getApp();
        var feed = WeekPlan.feed();
        var today = WeekPlan.today();
        var zones = app.zones;

        var days = WeekPlan.raceDays(feed, today);
        var next = h * 0.5;
        if (days != null) {
            Draw.valueUnit(dc, h * 0.215, days.format("%d"), days == 1 ? "Tag" : "Tage", [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.15).toNumber(), Graphics.COLOR_WHITE);
            var name = WeekPlan.raceName(feed);
            Draw.lineAlt(dc, h * 0.325, Graphics.FONT_XTINY, Draw.GRAY, [name == null ? "bis zum Rennen" : "bis " + name, "bis zum Rennen"] as Array<String>);
            var goal = zones != null ? (zones as PaceZones).goalS : null;
            var vdot = zones != null ? (zones as PaceZones).vdot : null;
            var info = [] as Array<String>;
            if (goal != null) {
                info.add("Ziel " + Pace.time((goal * 1000).toNumber()));
            }
            if (vdot != null) {
                info.add("VDOT " + Pace.distance1(vdot * 1000.0, false));
            }
            if (info.size() > 0) {
                Draw.lineAlt(dc, h * 0.405, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, [info.size() == 2 ? info[0] + " · " + info[1] : info[0], info[0]] as Array<String>);
            }
        } else {
            Draw.lineAlt(dc, h * 0.23, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, ["Verbunden" as String]);
            Draw.lineAlt(dc, h * 0.33, Graphics.FONT_XTINY, Draw.GRAY, ["Kein Rennen im Plan" as String]);
            next = h * 0.43;
        }

        Upcoming.draw(dc, feed, today, zones != null && (zones as PaceZones).miles, next);
    }

    // Stand des Abgleichs, lang und kurz: "Stand: vor 5 Min" / "vor 5 Min", "Aktualisiere…" oder die Fehlernummer.
    private function status(sync as Sync?) as Array<String> {
        if (sync != null && (sync as Sync).busy()) {
            return ["Aktualisiere…", "Lade…"] as Array<String>;
        }
        var err = sync != null ? (sync as Sync).lastError : null;
        if (err != null) {
            return ["Offline (" + err + ")", "Offline"] as Array<String>;
        }
        var age = WeekPlan.syncedMinutes();
        if (age == null) {
            return ["Noch nicht geladen", "Nicht geladen"] as Array<String>;
        }
        if (age < 1) {
            return ["Stand: gerade eben", "Stand: jetzt", "jetzt"] as Array<String>;
        }
        var span = age < 60 ? age + " Min" : (age < 1440 ? (age / 60) + " Std" : (age / 1440) + " Tg");
        return ["Stand: vor " + span, "Stand " + span, "vor " + span] as Array<String>;
    }
}

class PlanDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    // START / Tippen: Daten neu laden
    function onSelect() as Boolean {
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            (sync as Sync).refresh();
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
