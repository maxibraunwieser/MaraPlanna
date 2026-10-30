// Zeichen-Hilfen für alle Ansichten: Text passend zur Bildschirmbreite auf der
// jeweiligen Höhe (runde Displays sind oben und unten schmaler).

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

module Draw {
    const ORANGE = 0xF97316;
    const GREEN = 0x22C55E;
    const RED = 0xEF4444;
    const BLUE = 0x60A5FA;
    const GRAY = 0xAAAAAA;
    // Hell genug, dass es auch auf 8-Farben-Displays (z. B. FR 55) nicht schwarz wird.
    const DIM = 0x888888;
    // Dunkle Flächen: Balken-Hintergrund und feine Hilfslinien
    const TRACK = 0x2A2A2A;
    const GRID = 0x262626;
    const CENTER = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;

    // Randabstand relativ zur Displaybreite (statt fester Pixel).
    function margin(dc as Graphics.Dc) as Number {
        return (dc.getWidth() * 0.035).toNumber();
    }

    // Zahlenschriften haben auf vielen Uhren kein Komma: dort Punkt verwenden.
    function digits(s as String) as String {
        var i = s.find(",");
        return i == null ? s : s.substring(0, i) + "." + s.substring(i + 1, s.length());
    }

    function round() as Boolean {
        return System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;
    }

    // Nutzbare Breite auf Höhe y.
    function widthAt(dc as Graphics.Dc, y as Numeric, lineHeight as Numeric) as Number {
        var w = dc.getWidth();
        if (!round()) {
            return w;
        }
        var r = w / 2.0;
        var dy = (y - dc.getHeight() / 2.0).abs() + lineHeight / 2.0;
        return dy >= r ? 0 : (2 * Math.sqrt(r * r - dy * dy)).toNumber();
    }

    function fit(dc as Graphics.Dc, s as String, font as Graphics.FontDefinition, max as Number) as String {
        if (dc.getTextWidthInPixels(s, font) <= max) {
            return s;
        }
        var n = s.length();
        while (n > 1 && dc.getTextWidthInPixels(s.substring(0, n) + "...", font) > max) {
            n -= 1;
        }
        return s.substring(0, n) + "...";
    }

    // Zentrierte Zeile, gekürzt auf die verfügbare Breite.
    function line(dc as Graphics.Dc, y as Numeric, font as Graphics.FontDefinition, color as Number, s as String) as Void {
        lineAny(dc, y, [font] as Array<Graphics.FontDefinition>, color, [s] as Array<String>);
    }

    // Erste Textvariante (lang vor kurz), die auf Höhe y passt.
    function lineAlt(dc as Graphics.Dc, y as Numeric, font as Graphics.FontDefinition, color as Number, texts as Array<String>) as Void {
        lineAny(dc, y, [font] as Array<Graphics.FontDefinition>, color, texts);
    }

    // Größte Schrift aus fonts, in die der Text passt.
    function lineFit(dc as Graphics.Dc, y as Numeric, fonts as Array<Graphics.FontDefinition>, color as Number, s as String) as Void {
        lineAny(dc, y, fonts, color, [s] as Array<String>);
    }

    // Erste Kombination aus Schrift (groß → klein) und Text (lang → kurz), die auf Höhe y
    // in die Displaybreite passt; sonst kleinste Schrift, kürzester Text, gekürzt.
    function lineAny(dc as Graphics.Dc, y as Numeric, fonts as Array<Graphics.FontDefinition>, color as Number, texts as Array<String>) as Void {
        var font = fonts[fonts.size() - 1];
        var text = texts[texts.size() - 1];
        var found = false;
        for (var f = 0; f < fonts.size() && !found; f++) {
            var max = widthAt(dc, y, dc.getFontHeight(fonts[f])) - margin(dc);
            for (var t = 0; t < texts.size(); t++) {
                if (dc.getTextWidthInPixels(texts[t], fonts[f]) <= max) {
                    font = fonts[f];
                    text = texts[t];
                    found = true;
                    break;
                }
            }
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, fit(dc, text, font, widthAt(dc, y, dc.getFontHeight(font)) - margin(dc)), CENTER);
    }

    // Zeilen gleichmäßig zwischen top und bottom verteilen (Abstand nach der größten
    // Schrift jeder Zeile); jede Zeile wählt dann wie lineAny Schrift und Text.
    function stack(dc as Graphics.Dc, top as Numeric, bottom as Numeric, fonts as Array<Array<Graphics.FontDefinition>>, colors as Array<Number>, texts as Array<Array<String>>) as Void {
        var n = texts.size();
        var sum = 0;
        for (var i = 0; i < n; i++) {
            sum += dc.getFontHeight(fonts[i][0]);
        }
        var space = (bottom - top - sum) / (n + 1.0);
        // Reicht der Platz nicht, rücken die Zeilen zusammen (Schriften haben viel Innenabstand).
        var scale = space < 0 ? (bottom - top) / sum.toFloat() : 1.0;
        if (space < 0) {
            space = 0;
        }
        var y = top + space;
        for (var i = 0; i < n; i++) {
            var lh = dc.getFontHeight(fonts[i][0]) * scale;
            lineAny(dc, y + lh / 2.0, fonts[i], colors[i], texts[i]);
            y += lh + space;
        }
    }

    // Verteilt Zeilen von oben nach unten zwischen top und bottom. heights: Höhe je Zeile in Pixeln;
    // 0 = Hauptzeile, die den restlichen Platz bekommt (mindestens 30 % des Bereichs).
    // Ergebnis: Mittelpunkte der Zeilen, als letztes Element die Höhe der Hauptzeile. So passen sich
    // die Seiten an die echten Schrifthöhen an. Reicht der Platz nicht, werden die festen Zeilen
    // zusammengerückt, damit nichts über den Bereich hinausragt.
    function rows(top as Float, bottom as Float, heights as Array<Number>, gap as Number) as Array<Float> {
        var n = heights.size();
        var fixed = 0.0;
        var hero = -1;
        for (var i = 0; i < n; i++) {
            if (heights[i] == 0) {
                hero = i;
            } else {
                fixed += heights[i];
            }
        }
        var area = bottom - top;
        var gaps = gap * (n - 1);
        var avail = area - gaps - area * 0.3;
        var k = fixed > avail && fixed > 0 ? avail / fixed : 1.0;
        var space = area - gaps - fixed * k;
        var out = new [n + 1] as Array<Float>;
        var y = top;
        for (var i = 0; i < n; i++) {
            var h = i == hero ? space : heights[i] * k;
            out[i] = y + h / 2.0;
            y += h + gap;
        }
        out[n] = space;
        return out;
    }

    // Hat die Uhr AUF/AB-Tasten? Sonst (Venu, vivoactive) wird gewischt.
    function hasUpDown() as Boolean {
        var b = System.getDeviceSettings().inputButtons as Number;
        return (b & System.BUTTON_INPUT_UP) != 0 && (b & System.BUTTON_INPUT_DOWN) != 0;
    }

    // 2x2-Raster zwischen top und bottom: kleine Beschriftung über großem Wert.
    // Gewählt wird die größte Zahlenschrift, mit der alle vier Werte in Zeilenhöhe und
    // Spaltenbreite passen; auf runden Displays rücken die Spalten nach innen.
    function grid(dc as Graphics.Dc, top as Numeric, bottom as Numeric, labels as Array<String>, values as Array<String>, colors as Array<Number>) as Void {
        var cx = dc.getWidth() / 2.0;
        var lh = dc.getFontHeight(Graphics.FONT_XTINY);
        var gap = 2;
        var pad = margin(dc) / 2;
        var rowH = (bottom - top) / 2.0;
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] as Array<Graphics.FontDefinition>;
        var font = fonts[fonts.size() - 1];
        var avail = 0;
        for (var i = 0; i < fonts.size(); i++) {
            // Ziffern sind etwa 78 % der Oberlänge hoch (kein Platz für Unterlängen nötig).
            var digits = Graphics.getFontAscent(fonts[i]) * 0.78;
            var block = lh + gap + digits;
            if (block > rowH && i < fonts.size() - 1) {
                continue;
            }
            // Engste Stelle: Oberkante der oberen bzw. Unterkante der unteren Werte.
            var off = (rowH - block) / 2.0;
            var yTop = top + off + lh + gap;
            var yBottom = bottom - off;
            var narrow = widthAt(dc, yTop, 0) < widthAt(dc, yBottom, 0) ? widthAt(dc, yTop, 0) : widthAt(dc, yBottom, 0);
            avail = narrow / 2 - pad;
            var widest = 0;
            for (var v = 0; v < values.size(); v++) {
                var vw = dc.getTextWidthInPixels(i < 2 ? digits(values[v]) : values[v], fonts[i]);
                widest = vw > widest ? vw : widest;
            }
            font = fonts[i];
            if (widest <= avail) {
                break;
            }
        }
        var numberFont = font == Graphics.FONT_NUMBER_MEDIUM || font == Graphics.FONT_NUMBER_MILD;
        var digitsH = Graphics.getFontAscent(font) * 0.78;
        var offset = (rowH - (lh + gap + digitsH)) / 2.0;
        var xs = [cx - pad - avail / 2.0, cx + pad + avail / 2.0];
        for (var k = 0; k < 4 && k < values.size(); k++) {
            var x = xs[k % 2];
            var y = top + (k / 2) * rowH + offset;
            dc.setColor(GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, y, Graphics.FONT_XTINY, labels[k], Graphics.TEXT_JUSTIFY_CENTER);
            // Grundlinie unter die Beschriftung setzen; drawText erwartet die Oberkante.
            var baseline = y + lh + gap + digitsH;
            dc.setColor(colors[k], Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, baseline - Graphics.getFontAscent(font), font, numberFont ? digits(values[k]) : values[k], Graphics.TEXT_JUSTIFY_CENTER);
        }
        // feine Trennlinien zwischen den Feldern
        var midY = top + rowH;
        var lineW = widthAt(dc, midY, 0) * 0.9;
        dc.setColor(GRID, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(cx - lineW / 2, midY, cx + lineW / 2, midY);
        dc.drawLine(cx, top + 4, cx, bottom - 4);
    }

    function isNumberFont(font as Graphics.FontDefinition) as Boolean {
        return font == Graphics.FONT_NUMBER_HOT || font == Graphics.FONT_NUMBER_MEDIUM || font == Graphics.FONT_NUMBER_MILD || font == Graphics.FONT_NUMBER_THAI_HOT;
    }

    // Eine Zeile in der größten Schrift, die in Höhe maxH und Breite passt (Zahlenschriften
    // ohne Komma: dort wird es zum Punkt).
    function fitLine(dc as Graphics.Dc, y as Numeric, maxH as Number, fonts as Array<Graphics.FontDefinition>, color as Number, text as String) as Void {
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            var t = isNumberFont(fonts[i]) ? digits(text) : text;
            if (dc.getFontHeight(fonts[i]) <= maxH && dc.getTextWidthInPixels(t, fonts[i]) <= widthAt(dc, y, dc.getFontHeight(fonts[i])) - margin(dc)) {
                font = fonts[i];
                break;
            }
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, isNumberFont(font) ? digits(text) : text, CENTER);
    }

    // Große Zahl mit kleiner Einheit dahinter, als Ganzes zentriert.
    function valueUnit(dc as Graphics.Dc, y as Numeric, value as String, unit as String, fonts as Array<Graphics.FontDefinition>, maxH as Number, color as Number) as Void {
        var font = fonts[fonts.size() - 1];
        var gap = dc.getWidth() * 0.02;
        var wu = unit.length() > 0 ? dc.getTextWidthInPixels(unit, Graphics.FONT_XTINY) + gap : 0;
        for (var i = 0; i < fonts.size(); i++) {
            var t = isNumberFont(fonts[i]) ? digits(value) : value;
            if (dc.getFontHeight(fonts[i]) <= maxH && dc.getTextWidthInPixels(t, fonts[i]) + wu <= widthAt(dc, y, dc.getFontHeight(fonts[i])) - margin(dc)) {
                font = fonts[i];
                break;
            }
        }
        var text = isNumberFont(font) ? digits(value) : value;
        var wv = dc.getTextWidthInPixels(text, font);
        var x = (dc.getWidth() - wv - wu) / 2.0;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, text, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        if (unit.length() > 0) {
            dc.setColor(GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + wv + gap, y + (dc.getFontHeight(font) - dc.getFontHeight(Graphics.FONT_XTINY)) * 0.3, Graphics.FONT_XTINY, unit, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // Seitenanzeige: Punkte, die aktuelle Seite in Orange.
    function dots(dc as Graphics.Dc, y as Numeric, count as Number, current as Number) as Void {
        var r = (dc.getWidth() * 0.011).toNumber();
        r = r < 2 ? 2 : r;
        var gap = r * 3.2;
        var x0 = dc.getWidth() / 2.0 - (count - 1) * gap / 2.0;
        for (var i = 0; i < count; i++) {
            dc.setColor(i == current ? ORANGE : DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x0 + i * gap, y, i == current ? r + 1 : r);
        }
    }

    // Aufnahmestatus oben in der Mitte: roter Punkt bei REC, zwei orange Balken bei Pause.
    function recDot(dc as Graphics.Dc, paused as Boolean) as Void {
        var r = (dc.getWidth() * 0.013).toNumber();
        r = r < 3 ? 3 : r;
        var y = dc.getHeight() * 0.05;
        var cx = dc.getWidth() / 2;
        if (paused) {
            dc.setColor(ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(cx - r, y - r, r * 0.8, r * 2);
            dc.fillRectangle(cx + r * 0.2, y - r, r * 0.8, r * 2);
        } else {
            dc.setColor(RED, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx, y, r);
        }
    }

    function barHeight(dc as Graphics.Dc) as Number {
        var h = (dc.getHeight() * 0.024).toNumber();
        return h < 5 ? 5 : h;
    }

    // Fortschrittsbalken (frac 0..1) auf Höhe y.
    function bar(dc as Graphics.Dc, y as Numeric, frac as Float, color as Number) as Void {
        var w = (widthAt(dc, y, 0) * 0.78).toNumber();
        var h = barHeight(dc);
        var x = (dc.getWidth() - w) / 2;
        dc.setColor(TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y - h / 2, w, h, h / 2);
        var fw = (w * (frac < 0.0 ? 0.0 : (frac > 1.0 ? 1.0 : frac))).toNumber();
        if (fw > 0) {
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y - h / 2, fw < h ? h : fw, h, h / 2);
        }
    }

    // Pace-Skala: der Zielbereich ist grün, der Punkt zeigt die aktuelle Pace.
    // Schnell = rechts, langsam = links; die Skala reicht eine Bereichsbreite über den Bereich hinaus.
    function gauge(dc as Graphics.Dc, y as Numeric, pace as Float?, range as Array<Number>?, color as Number) as Void {
        var w = (widthAt(dc, y, 0) * 0.78).toNumber();
        var h = barHeight(dc);
        var x0 = (dc.getWidth() - w) / 2;
        dc.setColor(TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x0, y - h / 2, w, h, h / 2);
        if (range == null) {
            return;
        }
        var lo = range[0].toFloat();
        var hi = range[1].toFloat();
        var span = hi - lo < 20.0 ? 20.0 : hi - lo;
        var minP = lo - span;
        var maxP = hi + span;
        var zoneL = x0 + (maxP - hi) / (maxP - minP) * w;
        var zoneR = x0 + (maxP - lo) / (maxP - minP) * w;
        dc.setColor(GREEN, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(zoneL, y - h / 2, zoneR - zoneL, h);
        if (pace != null) {
            var p = pace as Float;
            p = p < minP ? minP : (p > maxP ? maxP : p);
            var mx = x0 + (maxP - p) / (maxP - minP) * w;
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(mx, y, h * 1.15);
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(mx, y, h * 0.85);
        }
    }

    // Liniendiagramm im Rechteck box = [x, y, Breite, Höhe]. values[i] <= 0 = kein Wert (Lücke).
    // invert: kleine Werte oben (für Pace: schneller = höher). Mit Hilfslinien oben, Mitte und unten.
    // (Ältere Uhren erlauben höchstens 9 Parameter je Funktion.)
    function chart(dc as Graphics.Dc, box as Array<Numeric>, values as Array<Float>, n as Number, lo as Float, hi as Float, color as Number, invert as Boolean) as Void {
        var x = box[0];
        var y = box[1];
        var w = box[2];
        var h = box[3];
        dc.setPenWidth(1);
        dc.setColor(GRID, Graphics.COLOR_TRANSPARENT);
        for (var k = 0; k < 3; k++) {
            dc.drawLine(x, y + h * k / 2.0, x + w, y + h * k / 2.0);
        }
        if (n < 2 || hi <= lo) {
            return;
        }
        dc.setPenWidth(w < 220 ? 2 : 3);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var px = 0.0;
        var py = 0.0;
        var have = false;
        for (var i = 0; i < n; i++) {
            var v = values[i];
            if (v <= 0) {
                have = false;
                continue;
            }
            var t = (v - lo) / (hi - lo);
            t = t < 0.0 ? 0.0 : (t > 1.0 ? 1.0 : t);
            var fx = x + w * i / (n - 1.0);
            var fy = invert ? y + h * t : y + h * (1.0 - t);
            if (have) {
                dc.drawLine(px, py, fx, fy);
            }
            px = fx;
            py = fy;
            have = true;
        }
        dc.setPenWidth(1);
    }

    // Pfeil mit der Spitze nach oben bei cx,cy, Größe r, um angle (Radiant, im Uhrzeigersinn) gedreht.
    function arrow(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, angle as Float, color as Number) as Void {
        var base = [[0.0, -1.0], [0.7, 0.8], [0.0, 0.35], [-0.7, 0.8]] as Array<Array<Float> >;
        var pts = [] as Array<[Numeric, Numeric]>;
        var c = Math.cos(angle);
        var s = Math.sin(angle);
        for (var i = 0; i < base.size(); i++) {
            var px = base[i][0] * r;
            var py = base[i][1] * r;
            pts.add([cx + px * c - py * s, cy + px * s + py * c] as [Numeric, Numeric]);
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(pts);
    }
}
