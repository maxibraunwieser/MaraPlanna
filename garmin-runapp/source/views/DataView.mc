// Live-Ansicht während des Laufs: Rahmen um die Datenseiten (Pages.mc, Inhalt in PageViews.mc).
//   oben    Aufnahmestatus (roter Punkt / Pause) und Seitenname bzw. Name des aktuellen Schritts
//           (Intervall-Seite: der Puls)
//   Mitte   die gewählte Seite
//   unten   Hinweis (Pause, LANGSAMER/SCHNELLER, kein GPS) und Seitenpunkte
// Seiten wechseln per AUF/AB, Wischen oder Tippen. Aktualisierung jede Sekunde durch den
// RecordingController. Nach jedem vollen Kilometer ersetzt für ein paar Sekunden die Zusammenfassung
// dieses Kilometers die Seite (PageViews.kmSummary); ein Seitenwechsel blendet sie sofort aus.

import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class DataView extends WatchUi.View {
    // ID der angezeigten Seite (Pages.*)
    var page as Number = Pages.OVERVIEW;
    private const HEADER_Y = 0.115;
    private const FOOTER_Y = 0.865;
    private const DOTS_Y = 0.945;

    function initialize() {
        View.initialize();
    }

    // Nächste (1) bzw. vorherige (-1) Seite unter den sichtbaren.
    function flip(step as Number) as Void {
        var c = getApp().controller as RecordingController;
        var ids = Pages.active(c.workout);
        var at = ids.indexOf(page);
        at = at < 0 ? 0 : at;
        page = ids[(at + step + ids.size()) % ids.size()];
        c.splits.hide();
        c.hideStepSummary();
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.plain(dc);
        var h = dc.getHeight();
        Draw.background(dc, true);
        var app = getApp();
        var c = app.controller as RecordingController;
        var info = Demo.info(Activity.getActivityInfo());
        var ms = c.timerMs(info);

        var ids = Pages.active(c.workout);
        var at = ids.indexOf(page);
        if (at < 0) {
            at = 0;
            page = ids[0];
        }

        header(dc, c, info, ms);
        var top = h * HEADER_Y + dc.getFontHeight(Graphics.FONT_XTINY) / 2.0 + 3;
        var bottom = h * FOOTER_Y - dc.getFontHeight(Graphics.FONT_SMALL) / 2.0 - 2;
        body(dc, c, top, bottom, info, ms);
        footer(dc, c, app.gpsReady());
        Draw.dots(dc, h * DOTS_Y, ids.size(), at);
    }

    private function body(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        if (c.stepSummaryShowing(ms)) {
            PageViews.stepSummary(dc, c, top, bottom);
        } else if (c.summaryShowing(ms)) {
            PageViews.kmSummary(dc, c, top, bottom, info, ms);
        } else if (page == Pages.PACE) {
            PageViews.pace(dc, c, top, bottom, info, ms);
        } else if (page == Pages.HEART) {
            PageViews.heart(dc, c, top, bottom, info, ms);
        } else if (page == Pages.PACES) {
            PageViews.paces(dc, c, top, bottom, info, ms);
        } else if (page == Pages.PACE_GRAPH) {
            PageViews.paceGraph(dc, c, top, bottom, info, ms);
        } else if (page == Pages.HR_GRAPH) {
            PageViews.hrGraph(dc, c, top, bottom, info, ms);
        } else if (page == Pages.INTERVAL) {
            PageViews.interval(dc, c, top, bottom, info, ms);
        } else if (page == Pages.REPS) {
            PageViews.reps(dc, c, top, bottom, info, ms);
        } else if (page == Pages.MAP) {
            PageViews.map(dc, c, top, bottom, info, ms);
        } else if (page == Pages.FORECAST) {
            PageViews.forecast(dc, c, top, bottom, info, ms);
        } else {
            PageViews.overview(dc, c, top, bottom, info, ms);
        }
    }

    // Oben: Aufnahmestatus; als Titel der Seitenname, auf den Hauptseiten bei einer Einheit
    // stattdessen der aktuelle Schritt.
    private function header(dc as Graphics.Dc, c as RecordingController, info as Activity.Info?, ms as Number) as Void {
        var h = dc.getHeight();
        var paused = c.state == Rec.PAUSED;
        Draw.recDot(dc, paused);
        // Gerade beendeter schneller Teil: sein Name mit "geschafft", grün
        if (c.stepSummaryShowing(ms)) {
            var name = (c.workout as Workout).name((c.workout as Workout).step(c.summaryStep));
            Draw.lineAlt(dc, h * HEADER_Y, Graphics.FONT_XTINY, Draw.GREEN, [name + " geschafft", name] as Array<String>);
            return;
        }
        // Intervall-Seite: ganz klein der Puls statt des Seitennamens
        if (page == Pages.INTERVAL && !c.summaryShowing(ms)) {
            Draw.pulse(dc, h * HEADER_Y, info != null ? info.currentHeartRate : null);
            return;
        }
        var texts = [Pages.NAMES[page], Pages.SHORT[page]] as Array<String>;
        var color = Draw.ORANGE;
        var main = page == Pages.OVERVIEW || page == Pages.PACE || page == Pages.HEART || page == Pages.PACES;
        if (c.summaryShowing(ms)) {
            var n = c.splits.count;
            texts = c.zones.miles ? ["MEILE " + n + " geschafft", "MEILE " + n, "MI " + n] as Array<String> : ["KM " + n + " geschafft", "KM " + n] as Array<String>;
            color = Draw.GREEN;
        } else if (c.workout != null && main) {
            var wk = c.workout as Workout;
            texts = [wk.finished ? "Einheit geschafft" : wk.name(wk.current())] as Array<String>;
            color = ms - c.stepChangedAt < 5000 ? Draw.GREEN : Draw.GRAY;
        }
        Draw.lineAlt(dc, h * HEADER_Y, Graphics.FONT_XTINY, color, texts);
    }

    // Unten: ein Hinweis, der wichtigste zuerst. Ohne GPS-Fix läuft die Aufzeichnung weiter.
    private function footer(dc as Graphics.Dc, c as RecordingController, gps as Boolean) as Void {
        var h = dc.getHeight();
        var y = h * FOOTER_Y;
        var small = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        if (c.state == Rec.PAUSED) {
            Draw.lineAlt(dc, y, Graphics.FONT_XTINY, Draw.ORANGE, ["START weiter · BACK Menü", "START: weiter", "PAUSE"] as Array<String>);
        } else if (c.hint < 0) {
            Draw.lineFit(dc, y, small, Draw.ORANGE, "LANGSAMER");
        } else if (c.hint > 0) {
            Draw.lineFit(dc, y, small, Draw.BLUE, "SCHNELLER");
        } else if (!gps) {
            Draw.lineAlt(dc, y, Graphics.FONT_XTINY, Draw.ORANGE, ["KEIN GPS", "KEIN GPS"] as Array<String>);
        }
    }
}
