// Zusammenfassung nach dem Speichern, mehrere Seiten (AUF/AB, Wischen oder Tippen blättern, START/BACK beenden):
//   Strecke   links die gelaufene Route, rechts Zeit, Distanz und Ø-Pace
//   Puls      Pulsverlauf über den ganzen Lauf mit Ø-Linie, Ø- und Maximalpuls
//   Pace      Pace-Verlauf über den ganzen Lauf mit Ø-Linie und Ø-Pace
//   Zonen     Zeit in den fünf Pulszonen
//   Effekt    Trainingseffekt: aerob von der Uhr (1,0 bis 5,0), anaerob als eigene Schätzung (Anaerobic.mc),
//             denn einen anaeroben Wert der Uhr liefert Connect IQ nicht
// Die Pulsseiten gibt es nur, wenn ein Puls aufgezeichnet wurde. Verlauf, Route und Zonenzeit kommen aus
// dem RecordingController, der nach dem Speichern noch im Speicher ist.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

class SummaryView extends WatchUi.View {
    private const ROUTE = 0;
    private const HEART = 1;
    private const PACE = 2;
    private const ZONES = 3;
    private const EFFECT = 4;
    private const HEADER_Y = 0.115;
    private const FOOTER_Y = 0.865;
    private const DOTS_Y = 0.945;
    private const TITLES = ["", "Puls-Verlauf", "Pace-Verlauf", "Pulszonen", "Trainingseffekt"] as Array<String>;
    private const SHORT = ["", "Puls", "Pace", "Zonen", "Effekt"] as Array<String>;

    private var _c as RecordingController;
    private var _ms as Number;
    private var _dist as Float;
    private var _avgHr as Number?;
    private var _maxHr as Number?;
    private var _effect as Float?;
    private var _anaerobic as Float?;
    private var _ids as Array<Number> = [ROUTE] as Array<Number>;
    private var _at as Number = 0;

    // Werte werden vor dem Speichern festgehalten – danach ist die Sitzung beendet.
    function initialize(c as RecordingController, ms as Number, dist as Float, avgHr as Number?, maxHr as Number?, effect as Float?) {
        View.initialize();
        _c = c;
        _ms = ms;
        _dist = dist;
        _avgHr = avgHr;
        _maxHr = maxHr;
        _effect = effect;
        _anaerobic = c.anaerobic.score();
        if (c.zoneTime.total() > 0) {
            _ids.add(HEART);
        }
        _ids.add(PACE);
        if (c.zoneTime.total() > 0) {
            _ids.add(ZONES);
        }
        if (effect != null || _anaerobic != null) {
            _ids.add(EFFECT);
        }
    }

    function flip(step as Number) as Void {
        _at = (_at + step + _ids.size()) % _ids.size();
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var page = _ids[_at];
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
        if (page == ROUTE) {
            Draw.lineAlt(dc, h * HEADER_Y, Graphics.FONT_XTINY, Draw.GREEN, ["GESPEICHERT", "Gespeichert", "OK"] as Array<String>);
        } else {
            Draw.lineAlt(dc, h * HEADER_Y, Graphics.FONT_XTINY, Draw.GRAY, [TITLES[page], SHORT[page]] as Array<String>);
        }
        var top = h * HEADER_Y + fhX / 2.0 + 3;
        var bottom = h * FOOTER_Y - fhS / 2.0 - 2;
        if (page == ROUTE) {
            routePage(dc, top, bottom);
            Draw.lineAlt(dc, h * FOOTER_Y, Graphics.FONT_XTINY, Draw.GRAY, ["Nach dem Sync in Garmin Connect", "In Garmin Connect", "Garmin Connect", ""] as Array<String>);
        } else if (page == HEART) {
            heartPage(dc, top, bottom);
        } else if (page == PACE) {
            pacePage(dc, top, bottom);
        } else if (page == ZONES) {
            zonesPage(dc, top, bottom);
        } else {
            // diese Seite hat keine Fußzeile: der Platz darunter gehört den beiden Blöcken
            effectPage(dc, top, h * 0.895);
        }
        if (_ids.size() > 1) {
            Draw.dots(dc, h * DOTS_Y, _ids.size(), _at);
        }
    }

    // --- Strecke: links die Route, rechts Zeit, Distanz, Ø-Pace ------------------------------------

    private function routePage(dc as Graphics.Dc, top as Float, bottom as Float) as Void {
        var w = dc.getWidth();
        var miles = _c.zones.miles;
        var white = Graphics.COLOR_WHITE;
        var side = w * 0.40;
        side = side > bottom - top ? bottom - top : side;
        route(dc, w * 0.285, (top + bottom) / 2.0, side);

        var blockH = (bottom - top) / 3.0;
        var cx = w * 0.735;
        statBlock(dc, cx, top, blockH, "ZEIT", Pace.time(_ms), white);
        statBlock(dc, cx, top + blockH, blockH, miles ? "MEILEN" : "KM", Pace.distance(_dist, miles), white);
        statBlock(dc, cx, top + blockH * 2, blockH, miles ? "Ø PACE /mi" : "Ø PACE /km", Pace.format(Pace.fromDelta(_ms, _dist), miles), white);
    }

    // Beschriftung klein, darunter der Wert in der größten Schrift, die in die Spalte passt.
    private function statBlock(dc as Graphics.Dc, cx as Float, yTop as Float, blockH as Float, label as String, value as String, color as Number) as Void {
        var w = dc.getWidth();
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yTop + fhX * 0.7, Graphics.FONT_XTINY, label, Draw.CENTER);
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] as Array<Graphics.FontDefinition>;
        var yv = yTop + fhX * 1.2 + (blockH - fhX * 1.2) / 2.0;
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            var fh = dc.getFontHeight(fonts[i]);
            var t = Draw.isNumberFont(fonts[i]) ? Draw.digits(value) : value;
            // rechter Rand: Kreis bzw. Display minus Rand
            var avail = 2 * ((w + Draw.widthAt(dc, yv, fh)) / 2.0 - cx) - Draw.margin(dc);
            if (fh <= (blockH - fhX * 1.2) * 1.2 && dc.getTextWidthInPixels(t, fonts[i]) <= avail) {
                font = fonts[i];
                break;
            }
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yv, font, Draw.isNumberFont(font) ? Draw.digits(value) : value, Draw.CENTER);
    }

    // Die ganze Strecke in ein Quadrat der Kantenlänge side um (cx, cy): Start grün, Ziel weiß mit rotem Rand.
    private function route(dc as Graphics.Dc, cx as Float, cy as Float, side as Float) as Void {
        var tr = _c.track;
        if (tr.count < 2 || !tr.hasPosition) {
            Draw.lineAlt(dc, cy - 8, Graphics.FONT_XTINY, Draw.GRAY, ["Keine Strecke", "Keine"] as Array<String>);
            Draw.lineAlt(dc, cy + 12, Graphics.FONT_XTINY, Draw.DIM, ["ohne GPS", ""] as Array<String>);
            return;
        }
        var lat0 = tr.startLat();
        var lon0 = tr.startLon();
        var kx = Math.cos(Geo.rad(lat0)) * Geo.EARTH * Math.PI / 180.0;
        var ky = Geo.EARTH * Math.PI / 180.0;
        var n = tr.count;
        var minX = 0.0;
        var maxX = 0.0;
        var minY = 0.0;
        var maxY = 0.0;
        for (var i = 0; i <= n; i++) {
            var px = ((i < n ? tr.lon(i) : tr.curLon) - lon0) * kx;
            var py = ((i < n ? tr.lat(i) : tr.curLat) - lat0) * ky;
            minX = px < minX ? px : minX;
            maxX = px > maxX ? px : maxX;
            minY = py < minY ? py : minY;
            maxY = py > maxY ? py : maxY;
        }
        var extent = maxX - minX > maxY - minY ? maxX - minX : maxY - minY;
        extent = extent < 150.0 ? 150.0 : extent;
        var scale = side * 0.92 / extent;
        var mx = (minX + maxX) / 2.0;
        var my = (minY + maxY) / 2.0;
        var w = dc.getWidth();

        dc.setPenWidth(w < 220 ? 2 : 3);
        dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
        var lastX = 0.0;
        var lastY = 0.0;
        var startX = 0.0;
        var startY = 0.0;
        for (var i = 0; i <= n; i++) {
            var sx = cx + (((i < n ? tr.lon(i) : tr.curLon) - lon0) * kx - mx) * scale;
            var sy = cy - (((i < n ? tr.lat(i) : tr.curLat) - lat0) * ky - my) * scale;
            if (i > 0) {
                dc.drawLine(lastX, lastY, sx, sy);
            } else {
                startX = sx;
                startY = sy;
            }
            lastX = sx;
            lastY = sy;
        }
        dc.setPenWidth(1);
        dc.setColor(Draw.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(startX, startY, w * 0.016);
        dc.setColor(Draw.RED, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(lastX, lastY, w * 0.022);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(lastX, lastY, w * 0.012);
    }

    // --- Pulsverlauf und Pace-Verlauf ------------------------------------------------------------------

    private function heartPage(dc as Graphics.Dc, top as Float, bottom as Float) as Void {
        var avg = _avgHr == null ? "--" : (_avgHr as Number).format("%d");
        var max = _maxHr == null ? "--" : (_maxHr as Number).format("%d");
        var head = ["Ø " + avg + "   MAX " + max, "Ø " + avg] as Array<String>;
        var avgF = _avgHr == null ? null : (_avgHr as Number).toFloat();
        graphPage(dc, top, bottom, head, Graphics.FONT_TINY, true, avgF);
    }

    private function pacePage(dc as Graphics.Dc, top as Float, bottom as Float) as Void {
        var miles = _c.zones.miles;
        var avg = Pace.fromDelta(_ms, _dist);
        var text = Pace.format(avg, miles);
        var head = ["Ø " + text + (miles ? " /mi" : " /km"), "Ø " + text] as Array<String>;
        graphPage(dc, top, bottom, head, Graphics.FONT_SMALL, false, avg);
    }

    // Kopfzeile, Verlauf mit gestrichelter Ø-Linie, darunter Anfangs- und Endzeit
    private function graphPage(dc as Graphics.Dc, top as Float, bottom as Float, head as Array<String>, headFont as Graphics.FontDefinition, isHr as Boolean, avg as Float?) as Void {
        var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        Draw.lineAlt(dc, top + fhS * 0.5, headFont, Graphics.COLOR_WHITE, head);
        var cTop = top + fhS + 8;
        var cBottom = bottom - fhX - 2;
        if (!PageViews.series(dc, _c.history, isHr, cTop, cBottom, null, avg, _c.zones.miles)) {
            return;
        }
        var y = cBottom + fhX * 0.7 + 2;
        var wRow = Draw.widthAt(dc, y, fhX);
        var pad = Draw.margin(dc) * 1.5;
        var xl = (dc.getWidth() - wRow) / 2.0 + pad;
        var xr = (dc.getWidth() + wRow) / 2.0 - pad;
        dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xl, y, Graphics.FONT_XTINY, "0:00", Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.drawText(xr, y, Graphics.FONT_XTINY, Pace.time(_ms), Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // --- Trainingseffekt: aerob (von der Uhr) und anaerob (eigene Schätzung) ---------------------------

    // Mit beiden Werten zwei Blöcke übereinander, sonst der eine groß. Der anaerobe Wert ist eine eigene
    // Schätzung (Anaerobic.mc): Connect IQ gibt den von Garmin nicht frei.
    private function effectPage(dc as Graphics.Dc, top as Float, bottom as Float) as Void {
        var aerobLabel = ["AEROB"] as Array<String>;
        var anaerobLabel = ["ANAEROB"] as Array<String>;
        if (_effect != null && _anaerobic != null) {
            var mid = (top + bottom) / 2.0;
            effectBlock(dc, top, mid - 3, aerobLabel, _effect as Float, true);
            dc.setColor(Draw.GRID, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            var lw = Draw.widthAt(dc, mid, 0) * 0.8;
            dc.drawLine((dc.getWidth() - lw) / 2.0, mid, (dc.getWidth() + lw) / 2.0, mid);
            effectBlock(dc, mid + 3, bottom, anaerobLabel, _anaerobic as Float, true);
        } else if (_effect != null) {
            effectBlock(dc, top, bottom, aerobLabel, _effect as Float, false);
        } else {
            effectBlock(dc, top, bottom, anaerobLabel, _anaerobic as Float, false);
        }
    }

    // Beschriftung, die Zahl groß, die Einstufung und eine Leiste mit fünf Stufen (gefüllt bis zum Wert).
    private function effectBlock(dc as Graphics.Dc, top as Float, bottom as Float, label as Array<String>, te as Float, compact as Boolean) as Void {
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var ratingFont = compact ? Graphics.FONT_XTINY : Graphics.FONT_SMALL;
        var bh = Draw.barHeight(dc);
        var barRows = compact ? bh * 2 : bh * 3;
        var r = Draw.rows(top, bottom, [fhX, 0, dc.getFontHeight(ratingFont), barRows] as Array<Number>, PageViews.gapOf(top, bottom));
        var lvl = TrainingEffect.level(te);
        var color = lvl == 0 ? Draw.GRAY : PageViews.ZONE_COLORS[lvl - 1];
        Draw.lineAlt(dc, r[0], Graphics.FONT_XTINY, Draw.GRAY, label);
        Draw.fitLine(dc, r[1], r[4].toNumber(), PageViews.BIG, color, te.format("%.1f"));
        Draw.line(dc, r[2], ratingFont, color, TrainingEffect.label(te));

        var y = r[3];
        var w = (Draw.widthAt(dc, y, 0) * 0.78).toNumber();
        var gap = (dc.getWidth() * 0.012).toNumber();
        var segW = (w - gap * 4) / 5;
        var x0 = (dc.getWidth() - w) / 2;
        for (var i = 0; i < 5; i++) {
            var sx = x0 + i * (segW + gap);
            dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(sx, y - bh / 2, segW, bh, bh / 2);
            var fill = te - i;
            fill = fill > 1.0 ? 1.0 : fill;
            if (fill > 0.0) {
                var fw = segW * fill;
                dc.setColor(PageViews.ZONE_COLORS[i], Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(sx, y - bh / 2, fw < bh ? bh : fw, bh, bh / 2);
            }
        }
    }

    // --- Zeit in den Pulszonen ---------------------------------------------------------------------

    // Fünf Zeilen, Zone 5 oben: Zonenname, Balken (relativ zur längsten Zone), Zeit.
    private function zonesPage(dc as Graphics.Dc, top as Float, bottom as Float) as Void {
        var zt = _c.zoneTime;
        var rowH = (bottom - top) / 5.0;
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var most = 1;
        for (var i = 0; i < 5; i++) {
            most = zt.seconds[i] > most ? zt.seconds[i] : most;
        }
        var wTop = Draw.widthAt(dc, top + rowH * 0.5, fhX);
        var wBottom = Draw.widthAt(dc, bottom - rowH * 0.5, fhX);
        var w = (wTop < wBottom ? wTop : wBottom) - Draw.margin(dc) * 2;
        var x0 = (dc.getWidth() - w) / 2.0;
        var gap = Draw.margin(dc);
        var lw = dc.getTextWidthInPixels("Z5", Graphics.FONT_XTINY);
        var tw = dc.getTextWidthInPixels(Pace.time(most * 1000), Graphics.FONT_XTINY);
        var barMax = w - lw - tw - gap * 2;
        var barH = rowH * 0.46;
        barH = barH < 4 ? 4 : barH;
        for (var r = 0; r < 5; r++) {
            var z = 4 - r;
            var secs = zt.seconds[z];
            var y = top + rowH * (r + 0.5);
            var color = PageViews.ZONE_COLORS[z];
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0, y, Graphics.FONT_XTINY, "Z" + (z + 1), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            var bw = (barMax * secs / most.toFloat()).toNumber();
            // Zonen ohne Zeit: nur ein schwacher Strich
            dc.setColor(secs > 0 ? color : Draw.TRACK, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x0 + lw + gap, y - barH / 2.0, bw < barH ? barH : bw, barH, barH / 2.0);
            dc.setColor(secs > 0 ? Graphics.COLOR_WHITE : Draw.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + w, y, Graphics.FONT_XTINY, Pace.time(secs * 1000), Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}
