// Startbildschirm der App, aufgebaut wie ein Zifferblatt:
//   oben     Wetter (Garmin-Wetter) und Datum
//   links    MaraPlanna-Zeichen mit dem Namen darunter (solange nicht gekoppelt: der Kopplungscode)
//   rechts   Uhrzeit, Stunde über Minute
//   unten    Puls, Kilometer dieser Woche, VO2max
// Alle Werte kommen live von der Uhr (Vitals) bzw. aus den MaraPlanna-Daten (WeekPlan); fehlt ein
// Wert, steht "--". START, Tippen oder die Menütaste öffnen das Menü (Training, Woche, Plan, Einstellungen).

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

class HomeView extends WatchUi.View {
    private var _timer as Timer.Timer?;

    function initialize() {
        View.initialize();
    }

    // Solange der Bildschirm sichtbar ist, jede Sekunde neu zeichnen (Uhrzeit, Puls) und
    // veraltete MaraPlanna-Daten im Hintergrund auffrischen.
    function onShow() as Void {
        if (_timer == null) {
            _timer = new Timer.Timer();
            (_timer as Timer.Timer).start(method(:tick), 1000, true);
        }
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            (sync as Sync).refreshIfStale();
        }
    }

    function onHide() as Void {
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
    }

    function tick() as Void {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.background(dc, true);
        header(dc);
        brand(dc);
        clock(dc);
        stats(dc);
    }

    // Wetter und Datum oben in der Mitte; ohne Wetter nur das Datum.
    private function header(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var font = Graphics.FONT_XTINY;
        var cond = Prefs.weather() ? Vitals.weather() : null;
        if (cond != null) {
            var y = h * 0.095;
            var r = h * 0.04;
            var text = (cond as Conditions).temp.format("%d") + "°";
            var gap = r * 0.7;
            var x0 = (w - (r * 2 + gap + dc.getTextWidthInPixels(text, font))) / 2.0;
            Draw.weather(dc, x0 + r, y, r, (cond as Conditions).kind);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + r * 2 + gap, y, font, text, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        Draw.line(dc, h * (cond != null ? 0.19 : 0.14), font, Graphics.COLOR_WHITE, Vitals.dateText());
    }

    // Zeichen mit Namen links; darunter der Kopplungscode, solange die Uhr nicht gekoppelt ist.
    private function brand(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w * 0.285;
        Draw.logo(dc, cx, h * 0.41, w * 0.46);
        var font = Graphics.FONT_XTINY;
        var mara = "Mara";
        var planna = "Planna";
        var wm = dc.getTextWidthInPixels(mara, font);
        var x0 = cx - (wm + dc.getTextWidthInPixels(planna, font)) / 2.0;
        var y = h * 0.585;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0, y, font, mara, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0 + wm, y, font, planna, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        var sync = getApp().sync;
        var code = sync != null ? (sync as Sync).code() : null;
        if (code != null && code.length() == 6) {
            var text = code.substring(0, 3) + " " + code.substring(3, 6);
            dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.66, font, text, Draw.CENTER);
        }
    }

    // Uhrzeit rechts: Stunde weiß über der Minute in Grau, in der größten Zahlenschrift, die passt.
    private function clock(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var parts = Vitals.clock();
        var fonts = [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>;
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getFontHeight(fonts[i]) * 1.7 <= h * 0.5 && dc.getTextWidthInPixels("00", fonts[i]) <= w * 0.3) {
                font = fonts[i];
                break;
            }
        }
        var step = dc.getFontHeight(font) * 0.82;
        var cx = w * 0.72;
        var cy = h * 0.45;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - step / 2.0, font, parts[0], Draw.CENTER);
        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + step / 2.0, font, parts[1], Draw.CENTER);
    }

    // Drei Werte unten, Symbol über dem Wert: Puls, Kilometer dieser Woche, VO2max.
    private function stats(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var app = getApp();
        var miles = app.zones != null && (app.zones as PaceZones).miles;
        var hr = Vitals.heartRate();
        var km = WeekPlan.doneKm(WeekPlan.feed(), WeekPlan.today());
        var vo2 = Vitals.vo2max();
        var values = [
            hr == null ? "--" : hr.format("%d"),
            km == null ? "--" : Pace.distance1(km * 1000.0, miles),
            vo2 == null ? "--" : vo2.format("%d")
        ] as Array<String>;
        var iconY = h * 0.745;
        var valueY = h * 0.855;
        var r = h * 0.04;
        var xs = [w * 0.28, w * 0.5, w * 0.72] as Array<Float>;
        // Größte Schrift, in die jeder Wert in seine Spalte passt (auf schmalen Displays kleiner)
        var fonts = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            var widest = 0;
            for (var j = 0; j < values.size(); j++) {
                var tw = dc.getTextWidthInPixels(values[j], fonts[i]);
                widest = tw > widest ? tw : widest;
            }
            if (widest <= w * 0.2) {
                font = fonts[i];
                break;
            }
        }
        Draw.heart(dc, xs[0], iconY - r * 0.1, r * 0.8, hr == null ? Draw.DIM : Draw.RED);
        Draw.runner(dc, xs[1], iconY, r * 1.05, km == null ? Draw.DIM : Draw.ORANGE);
        Draw.gauge2(dc, xs[2], iconY, r * 1.05, vo2 == null ? Draw.DIM : Draw.LIME);
        for (var i = 0; i < 3; i++) {
            dc.setColor(values[i].equals("--") ? Draw.DIM : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(xs[i], valueY, font, values[i], Draw.CENTER);
        }
    }
}
