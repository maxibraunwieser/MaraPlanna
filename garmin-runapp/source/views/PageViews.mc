// Inhalt der einzelnen Datenseiten. Jede Seite zeichnet in den Bereich zwischen top und
// bottom (Kopf- und Fußzeile übernimmt DataView). Alle Maße relativ zur Bereichshöhe,
// damit dieselbe Seite auf runden und eckigen Displays jeder Größe passt.

import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.UserProfile;

module PageViews {
    const BIG = [Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>;
    const TITLE = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
    const TEXT = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
    const SMALL = [Graphics.FONT_SMALL] as Array<Graphics.FontDefinition>;
    const TINY = [Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
    const ZONE_COLORS = [0x60A5FA, 0x22C55E, 0xFACC15, 0xF97316, 0xEF4444] as Array<Number>;
    // Unter dieser Geschwindigkeit (m/s) steht man: kein Pace-Punkt im Diagramm
    const MIN_SPEED = 0.8;

    // y-Position bei Anteil frac der Bereichshöhe
    function at(top as Float, bottom as Float, frac as Float) as Float {
        return top + (bottom - top) * frac;
    }

    function paceColor(hint as Number) as Number {
        return hint < 0 ? Draw.ORANGE : (hint > 0 ? Draw.BLUE : Graphics.COLOR_WHITE);
    }

    // "340 m" bzw. "1,25 km" (Meilen: "0,21 mi")
    function shortDist(m as Float, miles as Boolean) as String {
        if (miles) {
            return Pace.distance(m, true) + " mi";
        }
        return m < 1000.0 ? m.toNumber().format("%d") + " m" : Pace.distance(m, false) + " km";
    }

    // Länge eines Schritts als Text: "400 m", "1,00 km", "2:00 min"
    function lengthText(step as Dictionary, miles as Boolean) as String {
        var d = Pace.toNum(step.get("d") as Object?);
        if (d != null) {
            return shortDist(d.toFloat(), miles);
        }
        var s = Pace.toNum(step.get("s") as Object?);
        return s == null ? "" : Pace.time(s * 1000) + " min";
    }

    // Abweichung vom Zielbereich als Text, lang vor kurz
    function deviation(pace as Float?, range as Array<Number>, miles as Boolean) as Array<String> {
        if (pace == null) {
            return ["--"] as Array<String>;
        }
        var p = pace as Float;
        var off = p < range[0] ? p - range[0] : (p > range[1] ? p - range[1] : 0.0);
        var s = (miles ? off * Pace.KM_PER_MI : off).toNumber();
        if (s == 0) {
            return ["im Bereich", "OK"] as Array<String>;
        }
        var d = (s > 0 ? "+" : "") + s + " s";
        return [d + (s > 0 ? " zu langsam" : " zu schnell"), d] as Array<String>;
    }

    // --- Übersicht ---------------------------------------------------------------

    function overview(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var miles = c.zones.miles;
        var hr = info != null ? info.currentHeartRate : null;
        var white = Graphics.COLOR_WHITE;
        Draw.grid(dc, top, bottom,
            ["ZEIT", miles ? "MEILEN" : "KM", "PACE", "PULS"] as Array<String>,
            [Pace.time(ms), Pace.distance(c.distance(info), miles), Pace.format(c.pace, miles), hr == null ? "--" : hr.format("%d")] as Array<String>,
            [white, white, paceColor(c.hint), white] as Array<Number>);
    }

    function laps(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var miles = c.zones.miles;
        var white = Graphics.COLOR_WHITE;
        Draw.grid(dc, top, bottom,
            ["Ø PACE", "RUNDE " + c.laps, "RD-DIST", "RD-ZEIT"] as Array<String>,
            [Pace.format(c.averagePace(), miles), Pace.format(c.lapPace(), miles), Pace.distance(c.lapDistance(), miles), Pace.time(c.lapMs())] as Array<String>,
            [white, white, white, white] as Array<Number>);
    }

    // --- Pace: aktuelle Pace groß, Skala mit Zielbereich ----------------------------

    function pace(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var miles = c.zones.miles;
        var range = c.target();
        var color = paceColor(c.hint);
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
        var bh = Draw.barHeight(dc);
        var gap = gapOf(top, bottom);
        // Beschriftung, Hauptzeile, Skala, Ziel, Abweichung (bzw. Ø) von oben nach unten
        var r = range != null
            ? Draw.rows(top, bottom, [fhX, 0, bh * 3, fhX, fhS] as Array<Number>, gap)
            : Draw.rows(top, bottom, [fhX, 0, fhX, fhX] as Array<Number>, gap);
        Draw.line(dc, r[0], Graphics.FONT_XTINY, Draw.GRAY, miles ? "PACE /mi" : "PACE /km");
        Draw.fitLine(dc, r[1], (r[range != null ? 5 : 4]).toNumber(), BIG, color, Pace.format(c.pace, miles));
        if (range != null) {
            Draw.gauge(dc, r[2], c.pace, range, color);
            Draw.lineAlt(dc, r[3], Graphics.FONT_XTINY, Draw.GRAY, ["ZIEL " + Pace.formatRange(range, miles), Pace.formatRange(range, miles)] as Array<String>);
            Draw.lineAlt(dc, r[4], Graphics.FONT_SMALL, color, deviation(c.pace, range, miles));
        } else {
            Draw.lineAlt(dc, r[2], Graphics.FONT_XTINY, Draw.GRAY, ["kein Zielbereich", "kein Ziel"] as Array<String>);
            var avg = Pace.format(c.averagePace(), miles);
            Draw.lineAlt(dc, r[3], Graphics.FONT_XTINY, Draw.GRAY, ["Ø " + avg + "   Runde " + Pace.format(c.lapPace(), miles), "Ø " + avg] as Array<String>);
        }
    }

    // Abstand zwischen Zeilen: 1,2 % der Bereichshöhe, mindestens 2 px
    function gapOf(top as Float, bottom as Float) as Number {
        var g = ((bottom - top) * 0.012).toNumber();
        return g < 2 ? 2 : g;
    }

    // --- Puls: Wert, Zone, Ø und Maximum ----------------------------------------------

    function hrZones() as Array<Number> {
        var z = UserProfile.getHeartRateZones(UserProfile.HR_ZONE_SPORT_RUNNING);
        return z.size() >= 6 ? z : [95, 114, 133, 152, 171, 190] as Array<Number>;
    }

    // Pulszone 1..5
    function hrZone(hr as Number) as Number {
        var z = hrZones();
        var n = 1;
        for (var k = 1; k <= 4; k++) {
            if (hr >= z[k]) {
                n = k + 1;
            }
        }
        return n;
    }

    function heart(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var hr = info != null ? info.currentHeartRate : null;
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var bh = Draw.barHeight(dc);
        var r = Draw.rows(top, bottom, [fhX, 0, bh * 3, fhX, fhX] as Array<Number>, gapOf(top, bottom));
        var zone = hr == null ? 0 : hrZone(hr);
        var color = zone == 0 ? Draw.GRAY : ZONE_COLORS[zone - 1];
        Draw.line(dc, r[0], Graphics.FONT_XTINY, Draw.GRAY, "PULS");
        Draw.valueUnit(dc, r[1], hr == null ? "--" : hr.format("%d"), "bpm", BIG, r[5].toNumber(), color);

        // Zonenbalken: fünf Segmente, die aktuelle Zone leuchtet
        var y = r[2];
        var w = (Draw.widthAt(dc, y, 0) * 0.78).toNumber();
        var gap = (dc.getWidth() * 0.012).toNumber();
        var segW = (w - gap * 4) / 5;
        var x0 = (dc.getWidth() - w) / 2;
        for (var i = 0; i < 5; i++) {
            dc.setColor(i + 1 == zone ? ZONE_COLORS[i] : Draw.TRACK, Graphics.COLOR_TRANSPARENT);
            var grow = i + 1 == zone ? bh : 0;
            dc.fillRoundedRectangle(x0 + i * (segW + gap), y - bh / 2 - grow / 2, segW, bh + grow, bh / 2);
        }
        Draw.line(dc, r[3], Graphics.FONT_XTINY, color, zone == 0 ? "" : "ZONE " + zone);
        var avg = info != null && info.averageHeartRate != null ? (info.averageHeartRate as Number).format("%d") : "--";
        var max = info != null && info.maxHeartRate != null ? (info.maxHeartRate as Number).format("%d") : "--";
        Draw.lineAlt(dc, r[4], Graphics.FONT_XTINY, Draw.GRAY, ["Ø " + avg + "   MAX " + max, "Ø " + avg] as Array<String>);
    }

    // --- Verlauf: Pace bzw. Puls über den ganzen Lauf ---------------------------------

    function paceGraph(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        graph(dc, c, top, bottom, info, false);
    }

    function hrGraph(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        graph(dc, c, top, bottom, info, true);
    }

    function graph(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, isHr as Boolean) as Void {
        var miles = c.zones.miles;
        var hist = c.history;
        var n = hist.count;
        var vals = new [n < 2 ? 2 : n] as Array<Float>;
        vals[0] = 0.0;
        vals[1] = 0.0;
        var lo = 99999.0;
        var hi = 0.0;
        for (var i = 0; i < n; i++) {
            var v = 0.0;
            if (isHr) {
                v = hist.hr(i).toFloat();
            } else if (hist.speed(i) >= MIN_SPEED) {
                v = 1000.0 / hist.speed(i);
            }
            vals[i] = v;
            if (v > 0) {
                lo = v < lo ? v : lo;
                hi = v > hi ? v : hi;
            }
        }

        // Kopfzeile: aktueller Wert, Ø (und Maximum)
        var head = [] as Array<String>;
        if (isHr) {
            var cur = info != null && info.currentHeartRate != null ? (info.currentHeartRate as Number).format("%d") : "--";
            var avg = info != null && info.averageHeartRate != null ? (info.averageHeartRate as Number).format("%d") : "--";
            var max = info != null && info.maxHeartRate != null ? (info.maxHeartRate as Number).format("%d") : "--";
            head = [cur + "  Ø " + avg + "  MAX " + max, cur + "  Ø " + avg, cur] as Array<String>;
        } else {
            var cur = Pace.format(c.pace, miles);
            var avg = Pace.format(c.averagePace(), miles);
            head = [cur + "  Ø " + avg, cur] as Array<String>;
        }
        var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
        Draw.lineAlt(dc, top + fhS * 0.5, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, head);

        var cTop = top + fhS + 8;
        var cBottom = bottom - 2;
        if (hi <= 0 || n < 2) {
            Draw.lineAlt(dc, (cTop + cBottom) / 2, Graphics.FONT_XTINY, Draw.GRAY, ["Noch keine Daten", "Keine Daten"] as Array<String>);
            return;
        }
        // Skala mit etwas Luft, mindestens 40 s/km bzw. 30 bpm hoch
        var span = isHr ? 30.0 : 40.0;
        var range = isHr || c.workout != null ? null : c.target();
        if (range != null) {
            lo = range[0] < lo ? range[0].toFloat() : lo;
            hi = range[1] > hi ? range[1].toFloat() : hi;
        }
        lo -= 3.0;
        hi += 3.0;
        if (hi - lo < span) {
            var mid = (hi + lo) / 2;
            lo = mid - span / 2;
            hi = mid + span / 2;
        }
        var w = Draw.widthAt(dc, cTop, 0) < Draw.widthAt(dc, cBottom, 0) ? Draw.widthAt(dc, cTop, 0) : Draw.widthAt(dc, cBottom, 0);
        w = (w * 0.9).toNumber();
        var x0 = (dc.getWidth() - w) / 2;
        var topLabel = isHr ? hi.toNumber().format("%d") : Pace.format(lo, miles);
        var botLabel = isHr ? lo.toNumber().format("%d") : Pace.format(hi, miles);
        var lw = dc.getTextWidthInPixels(topLabel, Graphics.FONT_XTINY);
        lw = (dc.getTextWidthInPixels(botLabel, Graphics.FONT_XTINY) > lw ? dc.getTextWidthInPixels(botLabel, Graphics.FONT_XTINY) : lw) + 6;
        var x = x0 + lw;
        w = w - lw;
        var ch = cBottom - cTop;
        if (range != null) {
            // Zielbereich als dunkelgrünes Band (Pace: schnell = oben)
            var yHi = cTop + ch * (range[0] - lo) / (hi - lo);
            var yLo = cTop + ch * (range[1] - lo) / (hi - lo);
            dc.setColor(0x14452A, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x, yHi, w, yLo - yHi);
        }
        Draw.chart(dc, [x, cTop, w, ch] as Array<Numeric>, vals, n, lo, hi, isHr ? Draw.RED : Draw.ORANGE, !isHr);

        // Achsenwerte links neben dem Diagramm (oben = Maximum bzw. schnellste Pace)
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0, cTop - fh * 0.1, Graphics.FONT_XTINY, topLabel, Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(x0, cBottom - fh * 0.9, Graphics.FONT_XTINY, botLabel, Graphics.TEXT_JUSTIFY_LEFT);
    }

    // --- Intervall: aktueller Schritt, Rest, Fortschritt -------------------------------

    function interval(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var wk = c.workout as Workout;
        var miles = c.zones.miles;
        var dist = c.distance(info);
        if (wk.finished) {
            var mid = (top + bottom) / 2.0;
            Draw.fitLine(dc, mid, dc.getFontHeight(Graphics.FONT_MEDIUM), TITLE, Draw.GREEN, "Einheit geschafft");
            Draw.lineAlt(dc, mid + dc.getFontHeight(Graphics.FONT_MEDIUM), Graphics.FONT_XTINY, Draw.GRAY, ["Speichern über START", "START"] as Array<String>);
            return;
        }
        var step = wk.current() as Dictionary;
        var active = "a".equals(step.get("t") as Object?);
        var color = active ? Draw.ORANGE : Draw.BLUE;
        var fhM = dc.getFontHeight(Graphics.FONT_MEDIUM);
        var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var bh = Draw.barHeight(dc);
        // Schrittname, Rest (groß), Fortschritt, Pace gegen Ziel, nächster Schritt
        var r = Draw.rows(top, bottom, [fhM, 0, bh * 2, fhS, fhX] as Array<Number>, gapOf(top, bottom));
        Draw.fitLine(dc, r[0], fhM, TITLE, Graphics.COLOR_WHITE, wk.name(step));

        // Rest des Schritts groß: Meter, Kilometer oder Zeit
        var left = wk.remaining(ms, dist);
        var value = "--";
        var unit = "";
        if (left != null) {
            if (left[1] as Boolean) {
                var m = (left[0] as Number).toFloat();
                if (miles) {
                    value = Pace.distance(m, true);
                    unit = "mi";
                } else if (m < 1000.0) {
                    value = m.toNumber().format("%d");
                    unit = "m";
                } else {
                    value = Pace.distance(m, false);
                    unit = "km";
                }
            } else {
                value = Pace.time((left[0] as Number) * 1000);
            }
        }
        Draw.valueUnit(dc, r[1], value, unit, BIG, r[5].toNumber(), Graphics.COLOR_WHITE);
        Draw.bar(dc, r[2], wk.fraction(ms, dist), color);

        // aktuelle Pace und Ziel des Schritts
        var range = wk.target();
        var cur = Pace.format(c.pace, miles);
        if (range == null) {
            Draw.lineAlt(dc, r[3], Graphics.FONT_SMALL, Draw.GRAY, ["nach Gefühl"] as Array<String>);
        } else {
            var rg = Pace.formatRange(range, miles);
            Draw.lineAlt(dc, r[3], Graphics.FONT_SMALL, paceColor(c.hint), [cur + "  Ziel " + rg, cur + "  " + rg, cur] as Array<String>);
        }
        var next = wk.next();
        var nextText = next == null ? "Ende" : wk.name(next) + " " + lengthText(next, miles);
        Draw.lineAlt(dc, r[4], Graphics.FONT_XTINY, Draw.GRAY, ["danach: " + nextText, nextText, next == null ? "Ende" : wk.name(next)] as Array<String>);
    }

    // --- Intervall-Reps: Pace jedes Intervalls gegen das Ziel -----------------------------

    function reps(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var wk = c.workout as Workout;
        var miles = c.zones.miles;
        var dist = c.distance(info);
        var idx = [] as Array<Number>;
        var doneN = 0;
        for (var i = 0; i < wk.size(); i++) {
            if (wk.isActive(i)) {
                idx.add(i);
                doneN += wk.isDone(i) ? 1 : 0;
            }
        }
        var n = idx.size();
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        Draw.lineAlt(dc, top + fhX * 0.5, Graphics.FONT_XTINY, Draw.GRAY, [doneN + " von " + n + " geschafft", doneN + "/" + n] as Array<String>);

        var rowFont = Graphics.FONT_SMALL;
        var rh = dc.getFontHeight(rowFont) * 1.1;
        var rowTop = top + fhX * 1.2;
        var rows = ((bottom - rowTop) / rh).toNumber();
        rows = rows > n ? n : (rows < 1 ? 1 : rows);
        // Fenster um das aktuelle Intervall
        var first = doneN - rows / 2;
        first = first > n - rows ? n - rows : first;
        first = first < 0 ? 0 : first;
        var cx = dc.getWidth() / 2;
        // Spalten für alle Zeilen gleich: Breite der engsten (obersten bzw. untersten) Zeile
        var wTop = Draw.widthAt(dc, rowTop + rh * 0.5, rh);
        var wBottom = Draw.widthAt(dc, rowTop + rh * (rows - 0.5), rh);
        var w = (wTop < wBottom ? wTop : wBottom) - Draw.margin(dc) * 2;
        for (var r = 0; r < rows; r++) {
            var k = first + r;
            var i = idx[k];
            var y = rowTop + rh * (r + 0.5);
            var p = wk.stepPace(i, ms, dist);
            var tgt = wk.stepTarget(i);
            var done = wk.isDone(i);
            var started = done || i == wk.index;
            var color = !started ? Draw.DIM : Graphics.COLOR_WHITE;
            var delta = "";
            if (started && p != null && tgt != null) {
                var pv = p as Float;
                var mid = (tgt[0] + tgt[1]) / 2.0;
                var d = ((miles ? (pv - mid) * Pace.KM_PER_MI : pv - mid)).toNumber();
                delta = (d > 0 ? "+" : "") + d + " s";
                if (done) {
                    color = pv < tgt[0] ? Draw.ORANGE : (pv > tgt[1] ? Draw.BLUE : Draw.GREEN);
                }
            }
            dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx - w / 2, y, rowFont, (k + 1).format("%d"), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            // noch nicht gelaufene Intervalle zeigen ihre Zielpace
            var shown = started ? Pace.format(p, miles) : (tgt != null ? Pace.formatRange(tgt, miles) : "--:--");
            dc.drawText(cx, y, started ? rowFont : Graphics.FONT_XTINY, shown, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.drawText(cx + w / 2, y, Graphics.FONT_XTINY, delta, Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // --- Karte: gelaufene Strecke und Weg zurück zum Start --------------------------------

    function map(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var tr = c.track;
        var miles = c.zones.miles;
        var w = dc.getWidth();
        if (tr.count < 2 || !tr.hasPosition) {
            Draw.lineAlt(dc, at(top, bottom, 0.42), Graphics.FONT_SMALL, Draw.GRAY, ["Noch keine Strecke", "Keine Strecke"] as Array<String>);
            Draw.lineAlt(dc, at(top, bottom, 0.58), Graphics.FONT_XTINY, Draw.DIM, ["GPS wird gebraucht", "GPS nötig"] as Array<String>);
            return;
        }

        // Kopfzeile: Pfeil zum Start (Spitze oben = geradeaus) und Entfernung
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        var yh = top + fh * 0.6;
        var text = "Start " + shortDist(tr.distanceToStart(), miles);
        var r = fh * 0.55;
        var gap = fh * 0.4;
        var tw = dc.getTextWidthInPixels(text, Graphics.FONT_XTINY);
        var x0 = (w - (r * 2 + gap + tw)) / 2;
        var head = c.heading;
        var angle = Geo.bearing(tr.curLat, tr.curLon, tr.startLat(), tr.startLon()) - (head == null ? 0.0 : head as Float);
        Draw.arrow(dc, x0 + r, yh, r, angle, Draw.ORANGE);
        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0 + r * 2 + gap, yh, Graphics.FONT_XTINY, text, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        // Kartenfläche: größtes Quadrat, das in den Bereich (und bei runden Displays in den Kreis) passt
        var mTop = top + fh * 1.5;
        var mBottom = bottom;
        var side = mBottom - mTop;
        var narrow = Draw.widthAt(dc, mTop, 0) < Draw.widthAt(dc, mBottom, 0) ? Draw.widthAt(dc, mTop, 0) : Draw.widthAt(dc, mBottom, 0);
        side = side < narrow ? side : narrow;
        var half = side / 2.0 * 0.9;
        var cx = w / 2.0;
        var cy = (mTop + mBottom) / 2.0;

        // Meter relativ zum Start (Norden oben)
        var lat0 = tr.startLat();
        var lon0 = tr.startLon();
        var kx = Math.cos(Geo.rad(lat0)) * Geo.EARTH * Math.PI / 180.0;
        var ky = Geo.EARTH * Math.PI / 180.0;
        var minX = 0.0;
        var maxX = 0.0;
        var minY = 0.0;
        var maxY = 0.0;
        var n = tr.count;
        for (var i = -1; i < n; i++) {
            var px = (i < 0 ? tr.curLon : tr.lon(i)) - lon0;
            var py = (i < 0 ? tr.curLat : tr.lat(i)) - lat0;
            px = px * kx;
            py = py * ky;
            minX = px < minX ? px : minX;
            maxX = px > maxX ? px : maxX;
            minY = py < minY ? py : minY;
            maxY = py > maxY ? py : maxY;
        }
        var extent = maxX - minX > maxY - minY ? maxX - minX : maxY - minY;
        extent = extent < 150.0 ? 150.0 : extent;
        var scale = half * 2.0 / extent;
        var mx = (minX + maxX) / 2.0;
        var my = (minY + maxY) / 2.0;

        dc.setPenWidth(w < 220 ? 2 : 3);
        dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
        var lastX = 0.0;
        var lastY = 0.0;
        for (var i = 0; i <= n; i++) {
            var lon = i < n ? tr.lon(i) : tr.curLon;
            var lat = i < n ? tr.lat(i) : tr.curLat;
            var sx = cx + ((lon - lon0) * kx - mx) * scale;
            var sy = cy - ((lat - lat0) * ky - my) * scale;
            if (i > 0) {
                dc.drawLine(lastX, lastY, sx, sy);
            }
            if (i == 0) {
                dc.setColor(Draw.GREEN, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(sx, sy, w * 0.014);
                dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
            }
            lastX = sx;
            lastY = sy;
        }
        dc.setPenWidth(1);
        // aktuelle Position: weißer Punkt mit orangem Rand
        dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(lastX, lastY, w * 0.022);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(lastX, lastY, w * 0.014);

        // Maßstab: schöne Länge, höchstens 40 % der Kartenbreite
        var lens = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] as Array<Number>;
        var len = lens[0];
        for (var i = 0; i < lens.size(); i++) {
            if (lens[i] * scale <= half * 2.0 * 0.4) {
                len = lens[i];
            }
        }
        var barW = len * scale;
        var by = cy + half - 2;
        dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        // in der unteren linken Ecke der Karte, wo die Strecke selten verläuft
        var bx = cx - half;
        dc.drawLine(bx, by, bx + barW, by);
        dc.setPenWidth(1);
        dc.drawText(bx + barW / 2, by - fh * 0.55, Graphics.FONT_XTINY, shortDist(len.toFloat(), false), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // --- Prognose: Zielzeit ---------------------------------------------------------------

    function forecast(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var miles = c.zones.miles;
        var dist = c.distance(info);
        var elapsed = ms / 1000.0;
        var wk = c.workout;
        if (wk != null) {
            var plan = wk as Workout;
            var planned = plan.plannedTotal();
            var done = plan.plannedDone(ms, dist);
            var pred = plan.finished ? elapsed : Prediction.finish(planned, done, elapsed);
            var st = pred == null ? 0 : Prediction.status(pred as Float, planned);
            var color = pred == null ? Draw.GRAY : (st == 0 ? Draw.GREEN : Draw.ORANGE);
            var fhS = dc.getFontHeight(Graphics.FONT_SMALL);
            var bh = Draw.barHeight(dc);
            // Zielzeit (eine Zeile), erwartete Zeit (groß), Fortschritt, Hinweis
            var r = Draw.rows(top, bottom, [fhS, 0, bh * 1.6, fhS] as Array<Number>, gapOf(top, bottom));
            var goalText = Prediction.clock(planned);
            Draw.lineAlt(dc, r[0], Graphics.FONT_SMALL, Draw.GRAY, ["Ziel " + goalText, goalText] as Array<String>);
            Draw.fitLine(dc, r[1], r[4].toNumber(), BIG, color, Prediction.clock(pred));
            Draw.bar(dc, r[2], planned > 0 ? done / planned : 0.0, color);
            var msg = ["noch zu früh"] as Array<String>;
            if (pred != null) {
                var diff = (pred as Float) - planned;
                msg = st == 0 ? ["im Ziel"] as Array<String> : [Prediction.signed(diff) + (st > 0 ? " langsamer" : " schneller"), Prediction.signed(diff)] as Array<String>;
            }
            Draw.lineAlt(dc, r[3], Graphics.FONT_SMALL, color, msg);
            return;
        }

        // Ohne Einheit: Standarddistanzen bei der bisherigen Ø-Pace
        var pace = dist >= 1000.0 ? c.averagePace() : c.pace;
        Draw.lineAlt(dc, at(top, bottom, 0.06), Graphics.FONT_XTINY, Draw.GRAY, ["PROGNOSE bei Ø-Pace " + Pace.format(pace, miles), "PROGNOSE"] as Array<String>);
        var goal = c.zones.goalS;
        var rowFont = Graphics.FONT_SMALL;
        var rh = dc.getFontHeight(rowFont) * 1.25;
        var shown = 0;
        var y0 = at(top, bottom, 0.18);
        var cx = dc.getWidth() / 2;
        for (var i = 0; i < Prediction.DISTANCES.size(); i++) {
            var t = Prediction.atPace(elapsed, dist, Prediction.DISTANCES[i], pace);
            if (t == null && pace != null) {
                continue; // diese Distanz ist schon gelaufen
            }
            var y = y0 + rh * (shown + 0.5);
            shown += 1;
            var color = Graphics.COLOR_WHITE;
            if (i == 3 && goal != null && t != null) {
                color = Prediction.status(t as Float, goal as Float) == 0 ? Draw.GREEN : Draw.ORANGE;
            }
            var w = Draw.widthAt(dc, y, rh) - Draw.margin(dc);
            dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx - w / 2, y, Graphics.FONT_XTINY, Prediction.DISTANCE_NAMES[i], Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx + w / 2, y, rowFont, Prediction.clock(t), Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        if (goal != null) {
            Draw.lineAlt(dc, at(top, bottom, 0.94), Graphics.FONT_XTINY, Draw.GRAY, ["Wunschzeit Marathon " + Prediction.clock(goal), "Wunsch " + Prediction.clock(goal)] as Array<String>);
        }
    }
}
