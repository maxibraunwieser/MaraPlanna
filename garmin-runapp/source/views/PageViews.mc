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

    // Länge eines Schritts als Text, lang vor kurz: "1,00 km" / "1 km", "400 m", "2:00 min" / "2:00"
    function lengthTexts(step as Dictionary, miles as Boolean) as Array<String> {
        var d = Pace.toNum(step.get("d") as Object?);
        if (d != null) {
            var full = shortDist(d.toFloat(), miles);
            if (!miles && d < 1000) {
                return [full] as Array<String>;
            }
            var one = Pace.distance1(d.toFloat(), miles);
            if (one.length() > 2 && (one.substring(one.length() - 2, one.length()) as String).equals(",0")) {
                one = one.substring(0, one.length() - 2) as String;
            }
            return [full, one + (miles ? " mi" : " km")] as Array<String>;
        }
        var sec = Pace.toNum(step.get("s") as Object?);
        if (sec == null) {
            return [] as Array<String>;
        }
        return [Pace.time(sec * 1000) + " min", Pace.time(sec * 1000)] as Array<String>;
    }

    // Abweichung vom Zielbereich als Text, lang vor kurz
    function deviation(pace as Float?, range as Array<Number>, miles as Boolean) as Array<String> {
        if (pace == null) {
            return ["--"] as Array<String>;
        }
        var p = pace as Float;
        var off = Pace.offRange(p, range);
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
        // Unten die Pulsleiste mit den fünf Zonen, darüber die vier Werte.
        var bh = Draw.barHeight(dc);
        var strip = bh * 2;
        Draw.grid(dc, top, bottom - strip - gapOf(top, bottom) * 2,
            ["ZEIT", miles ? "MEILEN" : "KM", "PACE", "PULS"] as Array<String>,
            [Pace.time(ms), Pace.distance(c.distance(info), miles), Pace.format(c.pace, miles), hr == null ? "--" : hr.format("%d")] as Array<String>,
            [white, white, paceColor(c.hint), white] as Array<Number>);
        zoneBar(dc, bottom - strip / 2.0, bh, hr, true);
    }

    // --- Pace-Vergleich: jetzt, letzter Kilometer bzw. letztes Intervall, Ø über den ganzen Lauf --------
    // Oben die aktuelle Pace groß, darunter zwei Felder. Links der letzte Kilometer (Meile); in einer Einheit
    // das zuletzt gelaufene Intervall, gefärbt nach dem Ergebnis (grün im Zielbereich, orange zu schnell,
    // blau zu langsam), bis das erste fertig ist wieder der letzte Kilometer. Rechts die Ø-Pace seit dem Start.

    function paces(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var miles = c.zones.miles;
        var wk = c.workout;
        var white = Graphics.COLOR_WHITE;
        var lastLabels = (miles ? ["LETZTE MEILE", "LETZTE MI"] : ["LETZTER KM"]) as Array<String>;
        var lastPace = c.splits.lastPace(miles ? Pace.M_PER_MI : 1000.0);
        var lastColor = white;
        var li = wk != null ? (wk as Workout).lastActiveDone() : -1;
        if (wk != null && li >= 0) {
            var w2 = wk as Workout;
            lastLabels = ["LETZTES INTERVALL", "LETZTES INT.", "LETZTE REP"] as Array<String>;
            lastPace = w2.stepPace(li, ms, c.distance(info));
            var tgt = w2.stepTarget(li);
            if (lastPace != null && tgt != null) {
                var off = Math.round(Pace.offRange(lastPace as Float, tgt)).toNumber();
                lastColor = off < 0 ? Draw.ORANGE : (off > 0 ? Draw.BLUE : Draw.GREEN);
            }
        }

        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var heroBottom = top + (bottom - top) * 0.52;
        var r = Draw.rows(top, heroBottom - 2, [fhX, 0] as Array<Number>, gapOf(top, bottom));
        Draw.line(dc, r[0], Graphics.FONT_XTINY, Draw.GRAY, miles ? "JETZT /mi" : "JETZT /km");
        Draw.fitLine(dc, r[1], r[2].toNumber(), BIG, paceColor(c.hint), Pace.format(c.pace, miles));

        // Trennlinien wie auf der Übersicht
        var midX = dc.getWidth() / 2.0;
        var lineW = Draw.widthAt(dc, heroBottom, 0) * 0.9;
        dc.setColor(Draw.GRID, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(midX - lineW / 2, heroBottom, midX + lineW / 2, heroBottom);
        dc.drawLine(midX, heroBottom + 4, midX, bottom - 4);

        var cellH = bottom - heroBottom;
        var wb = Draw.widthAt(dc, bottom - cellH * 0.25, 0);
        var cw = wb / 2.0 - Draw.margin(dc);
        paceCell(dc, midX - wb / 4.0, heroBottom, cellH, cw, lastLabels, Pace.format(lastPace, miles), lastColor);
        paceCell(dc, midX + wb / 4.0, heroBottom, cellH, cw, ["Ø GESAMT", "Ø PACE"] as Array<String>, Pace.format(c.averagePace(), miles), white);
    }

    // Ein Feld: kleine Beschriftung (die erste Variante, die in die Breite passt), darunter der Wert in der
    // größten Schrift, die in Breite und Höhe passt.
    function paceCell(dc as Graphics.Dc, cx as Float, yTop as Float, cellH as Float, cw as Float, labels as Array<String>, value as String, color as Number) as Void {
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var label = labels[labels.size() - 1];
        for (var i = 0; i < labels.size(); i++) {
            if (dc.getTextWidthInPixels(labels[i], Graphics.FONT_XTINY) <= cw) {
                label = labels[i];
                break;
            }
        }
        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yTop + fhX * 0.9, Graphics.FONT_XTINY, label, Draw.CENTER);
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>;
        var room = cellH - fhX * 1.7;
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            var t = Draw.isNumberFont(fonts[i]) ? Draw.digits(value) : value;
            if (dc.getFontHeight(fonts[i]) <= room * 1.15 && dc.getTextWidthInPixels(t, fonts[i]) <= cw) {
                font = fonts[i];
                break;
            }
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, yTop + fhX * 1.7 + room / 2.0, font, Draw.isNumberFont(font) ? Draw.digits(value) : value, Draw.CENTER);
    }

    // --- Zusammenfassung des gerade beendeten Kilometers -----------------------------------
    // Zeit (bei genau einem Kilometer zugleich die Pace), Ø-Puls dieses Kilometers, Ø-Pace des ganzen
    // Laufs und der Unterschied zum Kilometer davor (grün = schneller, orange = langsamer).

    function kmSummary(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var s = c.splits;
        var n = s.count - 1;
        var white = Graphics.COLOR_WHITE;
        var hr = s.hr(n);
        var labels = ["ZEIT", "Ø PULS", "Ø PACE", "VORHER"] as Array<String>;
        var values = [Pace.time(s.duration(n)), hr > 0 ? hr.format("%d") : "--", Pace.format(c.averagePace(), c.zones.miles), "--"] as Array<String>;
        var colors = [white, white, white, white] as Array<Number>;
        if (n > 0) {
            var d = Math.round((s.duration(n) - s.duration(n - 1)) / 1000.0).toNumber();
            // Das Vorzeichen steht in der Beschriftung: Zahlenschriften haben oft kein "+".
            labels[3] = d < 0 ? "VORHER -" : (d > 0 ? "VORHER +" : "VORHER");
            values[3] = Pace.time(d.abs() * 1000);
            colors[3] = d < 0 ? Draw.GREEN : (d > 0 ? Draw.ORANGE : white);
        }
        Draw.grid(dc, top, bottom, labels, values, colors);
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
        return HeartZones.read();
    }

    // Pulszone 1..5
    function hrZone(hr as Number) as Number {
        return HeartZones.zoneOf(hr, hrZones());
    }

    // Pulszonen als fünf Segmente: die aktuelle Zone leuchtet in ihrer Farbe und ist höher. Mit detail
    // sind die übrigen Zonen in abgedunkelter Zonenfarbe zu sehen (sonst grau), und ein weißer Punkt zeigt,
    // wo im Segment der Puls genau liegt. y = Mitte der Leiste, bh = Höhe eines nicht aktiven Segments.
    function zoneBar(dc as Graphics.Dc, y as Numeric, bh as Number, hr as Number?, detail as Boolean) as Void {
        var zone = hr == null ? 0 : hrZone(hr as Number);
        var w = (Draw.widthAt(dc, y, 0) * 0.78).toNumber();
        var gap = (dc.getWidth() * 0.012).toNumber();
        var segW = (w - gap * 4) / 5;
        var x0 = (dc.getWidth() - w) / 2;
        for (var i = 0; i < 5; i++) {
            var lit = i + 1 == zone;
            dc.setColor(lit ? ZONE_COLORS[i] : (detail ? Draw.blend(ZONE_COLORS[i], Graphics.COLOR_BLACK, 0.65) : Draw.TRACK), Graphics.COLOR_TRANSPARENT);
            var grow = lit ? bh : 0;
            dc.fillRoundedRectangle(x0 + i * (segW + gap), y - bh / 2 - grow / 2, segW, bh + grow, bh / 2);
        }
        if (detail && hr != null && zone > 0) {
            var z = hrZones();
            var lo = z[zone - 1];
            var hi = z[zone];
            var f = hi > lo ? ((hr as Number) - lo) / (hi - lo).toFloat() : 0.0;
            f = f < 0.0 ? 0.0 : (f > 1.0 ? 1.0 : f);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x0 + (zone - 1) * (segW + gap) + f * segW, y, bh * 0.55);
        }
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
        zoneBar(dc, r[2], bh, hr, false);
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
        series(dc, c.history, isHr, top + fhS + 8, bottom - 2, isHr || c.workout != null ? null : c.target(), null, miles);
    }

    // Verlaufslinie (Puls bzw. Pace) der ganzen Aufzeichnung im Bereich cTop..cBottom, mit Achsenwerten.
    // range = Zielbereich als Band, avg = gestrichelte Linie beim Durchschnitt. false, wenn es keine Daten gibt.
    function series(dc as Graphics.Dc, hist as History, isHr as Boolean, cTop as Float, cBottom as Float, range as Array<Number>?, avg as Float?, miles as Boolean) as Boolean {
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

        if (hi <= 0 || n < 2) {
            Draw.lineAlt(dc, (cTop + cBottom) / 2, Graphics.FONT_XTINY, Draw.GRAY, ["Noch keine Daten", "Keine Daten"] as Array<String>);
            return false;
        }
        // Skala mit etwas Luft, mindestens 40 s/km bzw. 30 bpm hoch
        var span = isHr ? 30.0 : 40.0;
        if (avg != null) {
            lo = avg < lo ? avg as Float : lo;
            hi = avg > hi ? avg as Float : hi;
        }
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
        if (avg != null) {
            // Ø als gestrichelte Linie (Pace: schnell = oben)
            var t = ((avg as Float) - lo) / (hi - lo);
            var yAvg = isHr ? cTop + ch * (1.0 - t) : cTop + ch * t;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            for (var dx = 0; dx < w - 5; dx += 10) {
                dc.drawLine(x + dx, yAvg, x + dx + 5, yAvg);
            }
        }

        // Achsenwerte links neben dem Diagramm (oben = Maximum bzw. schnellste Pace)
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x0, cTop - fh * 0.1, Graphics.FONT_XTINY, topLabel, Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(x0, cBottom - fh * 0.9, Graphics.FONT_XTINY, botLabel, Graphics.TEXT_JUSTIFY_LEFT);
        return true;
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
        // Schrittname, Rest (groß), Fortschritt, aktuelle Pace, darunter zentriert das Ziel
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

        // aktuelle Pace, darunter zentriert das Ziel des Schritts
        var range = wk.target();
        Draw.lineAlt(dc, r[3], Graphics.FONT_SMALL, range == null ? Graphics.COLOR_WHITE : paceColor(c.hint), [Pace.format(c.pace, miles)] as Array<String>);
        if (range == null) {
            Draw.lineAlt(dc, r[4], Graphics.FONT_XTINY, Draw.GRAY, ["nach Gefühl"] as Array<String>);
        } else {
            var rg = Pace.formatRange(range, miles);
            Draw.lineAlt(dc, r[4], Graphics.FONT_XTINY, Draw.GRAY, ["ZIEL " + rg, rg] as Array<String>);
        }
    }

    // --- Intervall-Reps: eine Zeile je Belastung -----------------------------------------------
    // Für jedes Intervall (ohne Ein-/Auslaufen und Pausen): Ø-Pace, Abweichung vom Zielbereich ("OK" oder
    // Sekunden zu schnell/langsam) und Ø-Puls. Fertige Intervalle sind nach dem Ergebnis gefärbt (grün im
    // Bereich, orange zu schnell, blau zu langsam), das laufende ist hervorgehoben und zeigt seinen
    // Fortschritt, die kommenden zeigen ihre Länge und ihr Ziel.

    function reps(dc as Graphics.Dc, c as RecordingController, top as Float, bottom as Float, info as Activity.Info?, ms as Number) as Void {
        var wk = c.workout as Workout;
        var miles = c.zones.miles;
        var dist = c.distance(info);
        var idx = [] as Array<Number>;
        var doneN = 0;
        for (var i = 0; i < wk.size(); i++) {
            if (!wk.isActive(i)) {
                continue;
            }
            idx.add(i);
            doneN += wk.isDone(i) ? 1 : 0;
        }
        var n = idx.size();
        var fhX = dc.getFontHeight(Graphics.FONT_XTINY);
        var labelY = top + fhX * 0.5;
        var rowTop = top + fhX * 1.25;
        var avail = (bottom - fhX * 0.4) - rowTop;

        // Größte Schrift, bei der alle Intervalle untereinander UND Nummer, Pace, Abweichung und Puls
        // nebeneinander passen (gemessen, nicht geschätzt); sonst die kleinste mit einem Fenster um das
        // aktuelle Intervall.
        var m = Draw.margin(dc);
        var gap = m;
        var showHr = dc.getWidth() >= 240;
        var sizes = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>;
        var rowFont = Graphics.FONT_TINY as Graphics.FontDefinition;
        var subFont = Graphics.FONT_XTINY as Graphics.FontDefinition;
        var rows = 1;
        var rh = 0.0;
        var blockTop = rowTop;
        var w = 0;
        for (var k = 0; k < sizes.size(); k++) {
            var f = sizes[k];
            var sub = f == Graphics.FONT_MEDIUM ? Graphics.FONT_SMALL : Graphics.FONT_XTINY;
            var fh = dc.getFontHeight(f);
            var last = k == sizes.size() - 1;
            var fit = (avail / (fh * 1.1)).toNumber();
            fit = fit > n ? n : (fit < 1 ? 1 : fit);
            if (!last && fit < n) {
                continue;
            }
            var rhK = avail / fit;
            rhK = rhK > fh * 1.7 ? fh * 1.7 : rhK;
            var topK = rowTop + (avail - rhK * fit) / 2.0;
            // Breite: die engste der beteiligten Zeilen (runde Displays sind oben und unten schmal)
            var wK = Draw.widthAt(dc, labelY, fhX);
            var w1 = Draw.widthAt(dc, topK + rhK * 0.5, rhK);
            var wN = Draw.widthAt(dc, topK + rhK * (fit - 0.5), rhK);
            wK = w1 < wK ? w1 : wK;
            wK = wN < wK ? wN : wK;
            wK -= m * 2;
            var need = dc.getTextWidthInPixels(n.format("%d"), f) + dc.getTextWidthInPixels("00:00", f)
                + dc.getTextWidthInPixels("+99 s", sub) + (showHr ? dc.getTextWidthInPixels("000", sub) + gap : 0) + gap * 2;
            rowFont = f;
            subFont = sub;
            rows = fit;
            rh = rhK;
            blockTop = topK;
            w = wK;
            if (need <= wK) {
                break;
            }
        }
        var first = doneN - rows / 2;
        first = first > n - rows ? n - rows : first;
        first = first < 0 ? 0 : first;

        // Spalten von rechts nach links aus den echten Textbreiten: Puls, Abweichung, dazwischen die Pace
        var x0 = (dc.getWidth() - w) / 2.0;
        var nW = dc.getTextWidthInPixels(n.format("%d"), rowFont);
        var hW = showHr ? dc.getTextWidthInPixels("000", subFont) : 0;
        var oW = dc.getTextWidthInPixels("+99 s", subFont);
        var xHr = x0 + w;
        var offRight = xHr - (showHr ? hW + gap : 0);
        var xOff = offRight - oW / 2.0;
        var xPace = (x0 + nW + gap + offRight - oW - gap) / 2.0;
        var right = Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER;

        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xPace, labelY, Graphics.FONT_XTINY, "PACE", Draw.CENTER);
        dc.drawText(xOff, labelY, Graphics.FONT_XTINY, "ZIEL", Draw.CENTER);
        if (showHr) {
            var hs = fhX * 0.32;
            Draw.heart(dc, xHr - hs, labelY - hs * 0.2, hs, Draw.DIM);
        }

        for (var r = 0; r < rows; r++) {
            var k = first + r;
            var i = idx[k];
            var y = blockTop + rh * (r + 0.5);
            var p = wk.stepPace(i, ms, dist);
            var tgt = wk.stepTarget(i);
            var done = wk.isDone(i);
            var current = i == wk.index && !done;
            if (current) {
                dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(x0 - m / 2, y - rh / 2 + 1, w + m, rh - 2, rh / 4);
                var fw = (w * wk.fraction(ms, dist)).toNumber();
                if (fw > 0) {
                    dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
                    dc.fillRectangle(x0, y + rh / 2 - 5, fw, 2);
                }
            }
            var started = done || current;
            var color = started ? Graphics.COLOR_WHITE : Draw.DIM;
            var off = "";
            var offColor = Draw.GRAY;
            if (started && p != null && tgt != null) {
                var d = Pace.offRange(p as Float, tgt);
                var s = Math.round(miles ? d * Pace.KM_PER_MI : d).toNumber();
                off = s == 0 ? "OK" : (s > 0 ? "+" : "") + s + " s";
                offColor = s < 0 ? Draw.ORANGE : (s > 0 ? Draw.BLUE : Draw.GREEN);
                color = done ? offColor : color;
            }
            dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0, y, rowFont, (k + 1).format("%d"), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            if (started) {
                dc.setColor(color, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xPace, y, rowFont, Pace.format(p, miles), Draw.CENTER);
            }
            if (off.length() > 0) {
                dc.setColor(offColor, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xOff, y, subFont, off, Draw.CENTER);
            } else if (!started) {
                // Noch nicht gelaufene Intervalle: das Ziel in der Zielspalte, und links davon die Länge des
                // Intervalls (nur wenn sie noch Platz hat); das laufende zeigt seinen Rest auf der Intervall-Seite.
                var range = tgt != null ? Pace.formatRange(tgt, miles) : "";
                var tw = range.length() > 0 ? dc.getTextWidthInPixels(range, Graphics.FONT_XTINY) : 0;
                var rx = xOff + tw / 2.0 > x0 + w ? x0 + w - tw / 2.0 : xOff;
                dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
                if (tw > 0) {
                    dc.drawText(rx, y, Graphics.FONT_XTINY, range, Draw.CENTER);
                }
                var lens = lengthTexts(wk.step(i), miles);
                var spaceL = x0 + nW + gap;
                var spaceR = (tw > 0 ? rx - tw / 2.0 : x0 + w) - gap;
                for (var q = 0; q < lens.size(); q++) {
                    if (dc.getTextWidthInPixels(lens[q], Graphics.FONT_XTINY) <= spaceR - spaceL) {
                        dc.drawText((spaceL + spaceR) / 2.0, y, Graphics.FONT_XTINY, lens[q], Draw.CENTER);
                        break;
                    }
                }
            }
            var hr = started ? wk.stepHeartRate(i) : 0;
            if (showHr && hr > 0) {
                dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
                dc.drawText(xHr, y, subFont, hr.format("%d"), right);
            }
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
