// Live-Daten während des Laufs, drei Seiten (▲▼ bzw. Wischen/Tippen):
//   1  Zeit, Distanz, aktuelle Pace, Puls
//   2  Ø-Pace, Rundenpace, Rundendistanz, Rundenzeit
//   3  Zielbereich + Abweichung (+ Workout-Schritt)
// Aktualisierung jede Sekunde durch den RecordingController.

import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class DataView extends WatchUi.View {
    var page as Number = 0;
    private const PAGES = 3;
    private const HEADER_Y = 0.12;
    private const FOOTER_Y = 0.865;

    function initialize() {
        View.initialize();
    }

    function flip(step as Number) as Void {
        page = (page + step + PAGES) % PAGES;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var app = getApp();
        var c = app.controller as RecordingController;
        var miles = c.zones.miles;
        var info = Activity.getActivityInfo();
        var ms = c.timerMs(info);

        header(dc, c, app.gpsReady(), ms);

        // Raster zwischen Kopf- und Fußzeile
        var top = h * HEADER_Y + dc.getFontHeight(Graphics.FONT_XTINY) / 2 + 2;
        var bottom = h * FOOTER_Y - dc.getFontHeight(Graphics.FONT_SMALL) / 2 - 2;
        var white = Graphics.COLOR_WHITE;
        if (page == 0) {
            var hr = info != null ? info.currentHeartRate : null;
            Draw.grid(dc, top, bottom,
                ["ZEIT", miles ? "MEILEN" : "KM", "PACE", "PULS"] as Array<String>,
                [Pace.time(ms), Pace.distance(c.distance(info), miles), Pace.format(c.pace, miles), hr == null ? "--" : hr.format("%d")] as Array<String>,
                [white, white, paceColor(c.hint), white] as Array<Number>);
        } else if (page == 1) {
            Draw.grid(dc, top, bottom,
                ["Ø PACE", "RUNDE " + c.laps, "RD-DIST", "RD-ZEIT"] as Array<String>,
                [Pace.format(c.averagePace(), miles), Pace.format(c.lapPace(), miles), Pace.distance(c.lapDistance(), miles), Pace.time(c.lapMs())] as Array<String>,
                [white, white, white, white] as Array<Number>);
        } else {
            targetPage(dc, c, miles, ms, info, top, bottom);
        }

        footer(dc, c, app.gpsReady());
    }

    // Oben: Aufzeichnungsstatus, GPS, bei Workouts der aktuelle Schritt.
    private function header(dc as Graphics.Dc, c as RecordingController, gps as Boolean, ms as Number) as Void {
        var h = dc.getHeight();
        var status = c.state == Rec.PAUSED ? "PAUSE" : "REC";
        var color = c.state == Rec.PAUSED ? Draw.ORANGE : Draw.RED;
        var texts = [status + (gps ? "  GPS" : ""), status] as Array<String>;
        if (c.workout != null) {
            var wk = c.workout as Workout;
            var step = wk.finished ? "Einheit geschafft" : wk.name(wk.current());
            color = ms - c.stepChangedAt < 5000 ? Draw.GREEN : (c.state == Rec.PAUSED ? Draw.ORANGE : Draw.GRAY);
            texts = (c.state == Rec.PAUSED ? ["PAUSE · " + step, "PAUSE"] : [step]) as Array<String>;
        }
        Draw.lineAlt(dc, h * HEADER_Y, Graphics.FONT_XTINY, color, texts);
    }

    // Unten: Pace-Hinweis, sonst Bedienhinweis bzw. Seitenanzeige.
    // Ohne GPS-Fix wird weiter aufgezeichnet (z. B. Laufband), unten steht dann ein Hinweis.
    private function footer(dc as Graphics.Dc, c as RecordingController, gps as Boolean) as Void {
        var h = dc.getHeight();
        if (c.state == Rec.PAUSED) {
            Draw.lineAlt(dc, h * FOOTER_Y, Graphics.FONT_XTINY, Draw.ORANGE, ["START weiter · BACK Menü", "START: weiter", "PAUSE"] as Array<String>);
        } else if (c.hint < 0) {
            Draw.lineFit(dc, h * FOOTER_Y, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Draw.ORANGE, "LANGSAMER");
        } else if (c.hint > 0) {
            Draw.lineFit(dc, h * FOOTER_Y, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Draw.BLUE, "SCHNELLER");
        } else if (!gps) {
            Draw.lineAlt(dc, h * FOOTER_Y, Graphics.FONT_XTINY, Draw.ORANGE, ["KEIN GPS · " + (page + 1) + "/3", "KEIN GPS"] as Array<String>);
        } else {
            Draw.line(dc, h * FOOTER_Y, Graphics.FONT_XTINY, Draw.DIM, (page + 1) + "/3");
        }
    }

    // Zielseite: Zielbereich, aktuelle Pace mit Abweichung, im Workout Rest und nächster Schritt.
    private function targetPage(dc as Graphics.Dc, c as RecordingController, miles as Boolean, ms as Number, info as Activity.Info?, top as Numeric, bottom as Numeric) as Void {
        var range = c.target();
        var unit = miles ? " /mi" : " /km";
        var big = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>;
        var mid = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var tiny = [Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var zone = StartView.zoneName(c.currentZone()).toUpper();
        var fonts = [tiny, big, mid] as Array<Array<Graphics.FontDefinition>>;
        var colors = [Draw.GRAY, Graphics.COLOR_WHITE, paceColor(c.hint)] as Array<Number>;
        var texts = [
            ["ZIEL " + zone, zone],
            [range == null ? "nach Gefühl" : Pace.formatRange(range, miles) + unit, range == null ? "frei" : Pace.formatRange(range, miles)],
            paceTexts(c.pace, range, miles)
        ] as Array<Array<String>>;

        // Workout: Rest des Schritts und was danach kommt
        if (c.workout != null) {
            var wk = c.workout as Workout;
            if (wk.finished) {
                fonts.add(mid);
                colors.add(Draw.GREEN);
                texts.add(["Alle Schritte erledigt", "Erledigt"] as Array<String>);
            } else {
                var left = wk.remaining(ms, c.distance(info));
                if (left != null) {
                    var txt = (left[1] as Boolean) ? Pace.distance(left[0] as Numeric, miles) + (miles ? " mi" : " km") : Pace.time((left[0] as Number) * 1000);
                    fonts.add(mid);
                    colors.add(Graphics.COLOR_WHITE);
                    texts.add(["noch " + txt, txt] as Array<String>);
                }
                var next = wk.next();
                var name = next == null ? "Ende der Einheit" : wk.name(next);
                fonts.add(tiny);
                colors.add(Draw.GRAY);
                texts.add(["danach: " + name, name] as Array<String>);
            }
        }
        Draw.stack(dc, top, bottom, fonts, colors, texts);
    }

    // "4:52  +36 s zu langsam", kürzer "4:52  +36 s"; ohne Ziel bzw. Pace nur die Pace.
    private function paceTexts(pace as Float?, range as Array<Number>?, miles as Boolean) as Array<String> {
        var p = Pace.format(pace, miles);
        if (range == null || pace == null) {
            return ["Pace " + p, p] as Array<String>;
        }
        var v = pace as Float;
        var off = v < range[0] ? v - range[0] : (v > range[1] ? v - range[1] : 0.0);
        var s = (miles ? off * Pace.KM_PER_MI : off).toNumber();
        if (s == 0) {
            return [p + "  im Bereich", p + "  OK", p] as Array<String>;
        }
        var delta = (s > 0 ? "+" : "") + s + " s";
        return [p + "  " + delta + (s > 0 ? " zu langsam" : " zu schnell"), p + "  " + delta, p] as Array<String>;
    }

    private function paceColor(hint as Number) as Number {
        return hint < 0 ? Draw.ORANGE : hint > 0 ? Draw.BLUE : Graphics.COLOR_WHITE;
    }
}
