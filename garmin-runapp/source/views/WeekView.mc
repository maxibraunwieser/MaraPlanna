// "Diese Woche": Kilometer der Woche (gelaufen / geplant) mit Balken und darunter jeder Wochentag
// mit seiner Einheit und einem Status – erledigt (Haken), geplant (Kreis), verpasst (roter Kreis),
// ausgefallen (Kreuz). Heute ist hervorgehoben. Die Daten kommen aus MaraPlanna (WeekPlan).

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

module SessionRow {
    // Kurzname des Wochentags in der Sprache der Uhr ("Mo").
    function dayName(day as Number) as String {
        var info = Gregorian.utcInfo(new Time.Moment(day * WeekPlan.DAY_S + WeekPlan.DAY_S / 2), Time.FORMAT_MEDIUM);
        return info.day_of_week as String;
    }

    // Breite des längsten Wochentagsnamens ("Mi", im Englischen "Wed"): so beginnen alle Titel an derselben Stelle.
    function nameWidth(dc as Graphics.Dc) as Number {
        var monday = WeekPlan.monday(WeekPlan.today());
        var widest = 0;
        for (var d = 0; d < 7; d++) {
            var w = dc.getTextWidthInPixels(dayName(monday + d), Graphics.FONT_XTINY);
            widest = w > widest ? w : widest;
        }
        return widest;
    }

    // Titel des Tages: die erste nicht ausgefallene Einheit, bei mehreren "+n".
    function title(list as Array<Dictionary>) as String {
        var pick = list[0];
        for (var i = 0; i < list.size(); i++) {
            if (!"x".equals(list[i].get("s") as Object?)) {
                pick = list[i];
                break;
            }
        }
        var t = pick.get("t");
        var text = t instanceof String ? t : "";
        return list.size() > 1 ? text + " +" + (list.size() - 1) : text;
    }

    // Kilometer des Tages (ohne ausgefallene Einheiten).
    function km(list as Array<Dictionary>) as Float {
        var sum = 0.0;
        for (var i = 0; i < list.size(); i++) {
            var k = WeekPlan.toFloat(list[i].get("k") as Object?);
            if (k != null && !"x".equals(list[i].get("s") as Object?)) {
                sum += k;
            }
        }
        return sum;
    }

    function skippedAll(list as Array<Dictionary>) as Boolean {
        for (var i = 0; i < list.size(); i++) {
            if (!"x".equals(list[i].get("s") as Object?)) {
                return false;
            }
        }
        return list.size() > 0;
    }

    // Eine Zeile mit Mittelpunkt y: Wochentag, Titel, Kilometer, Status. nameW = nameWidth().
    function draw(dc as Graphics.Dc, y as Float, rowH as Float, day as Number, list as Array<Dictionary>, today as Number, miles as Boolean, nameW as Number) as Void {
        var font = Graphics.FONT_XTINY;
        var m = Draw.margin(dc);
        var avail = Draw.widthAt(dc, y, rowH * 0.6) - m;
        var xL = (dc.getWidth() - avail) / 2.0;
        var xR = xL + avail;
        var isToday = day == today;
        if (isToday) {
            dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(xL - m * 0.6, y - rowH / 2.0 + 1, avail + m * 1.2, rowH - 2, rowH / 2.0);
        }
        var rest = list.size() == 0;
        var skipped = skippedAll(list);
        var done = WeekPlan.allDone(list);

        dc.setColor(isToday ? Draw.ORANGE : Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xL, y, font, dayName(day), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        var titleX = xL + nameW + rowH * 0.3;

        // Status ganz rechts
        var r = rowH * 0.3;
        var ix = xR - r;
        if (!rest) {
            if (skipped) {
                dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(Draw.penWidth(r, 0.3));
                dc.drawLine(ix - r * 0.6, y - r * 0.6, ix + r * 0.6, y + r * 0.6);
                dc.drawLine(ix - r * 0.6, y + r * 0.6, ix + r * 0.6, y - r * 0.6);
                dc.setPenWidth(1);
            } else if (done) {
                dc.setColor(Draw.GREEN, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(ix, y, r);
                Draw.check(dc, ix, y, r * 1.25, Graphics.COLOR_BLACK);
            } else {
                dc.setColor(day < today ? Draw.RED : (isToday ? Draw.ORANGE : Draw.DIM), Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(Draw.penWidth(r, 0.28));
                dc.drawCircle(ix, y, r * 0.85);
                dc.setPenWidth(1);
            }
        }

        // Kilometer rechts vom Titel, Titel füllt den Rest
        var kmText = !rest && !skipped && km(list) > 0 ? Pace.distance1(km(list) * 1000.0, miles) : "";
        var kmW = kmText.length() > 0 ? dc.getTextWidthInPixels(kmText, font) : 0;
        var right = xR - r * 2 - rowH * 0.3;
        if (kmW > 0) {
            dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(right, y, font, kmText, Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        var maxW = (right - kmW - (kmW > 0 ? rowH * 0.3 : 0) - titleX).toNumber();
        var text = rest ? "Ruhetag" : title(list);
        dc.setColor(rest || skipped ? Draw.DIM : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(titleX, y, font, Draw.fit(dc, text, font, maxW), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

class WeekView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.background(dc, true);
        var h = dc.getHeight();
        var feed = WeekPlan.feed();
        var today = WeekPlan.today();
        var monday = WeekPlan.monday(today);
        var zones = getApp().zones;
        var miles = zones != null && (zones as PaceZones).miles;

        var done = WeekPlan.doneKm(feed, today);
        var planned = WeekPlan.plannedKm(feed, today);
        var text = done == null ? "--" : Pace.distance1(done * 1000.0, miles);
        if (planned != null) {
            text += " / " + Pace.distance1(planned * 1000.0, miles);
        }
        // Große Schrift mit Einheit, bei Platzmangel ohne Einheit, dann kleinere Schrift
        Draw.lineAny(dc, h * 0.135, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [text + (miles ? " mi" : " km"), text] as Array<String>);
        if (planned != null && planned > 0 && done != null) {
            Draw.bar(dc, h * 0.215, done / planned, done >= planned ? Draw.GREEN : Draw.ORANGE);
        }

        if (!WeekPlan.covers(feed, today)) {
            Draw.lineAlt(dc, h * 0.5, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, ["Keine Plandaten" as String]);
            Draw.lineAlt(dc, h * 0.62, Graphics.FONT_XTINY, Draw.GRAY, ["Im Trainingsplan aktualisieren", "Plan aktualisieren"] as Array<String>);
            return;
        }
        var top = h * 0.26;
        var bottom = h * 0.89;
        var rowH = (bottom - top) / 7.0;
        var nameW = SessionRow.nameWidth(dc);
        for (var d = 0; d < 7; d++) {
            SessionRow.draw(dc, top + rowH * (d + 0.5), rowH, monday + d, WeekPlan.sessions(feed, monday + d), today, miles, nameW);
        }
    }
}

class WeekDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
