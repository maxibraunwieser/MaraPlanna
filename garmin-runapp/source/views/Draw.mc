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
    const LIME = 0xA3E635;
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

    // Farbe zwischen zwei Farben (t = 0 → a, t = 1 → b), z. B. für abklingende Ringe.
    function blend(a as Number, b as Number, t as Float) as Number {
        var r = (((a >> 16) & 0xFF) * (1.0 - t) + ((b >> 16) & 0xFF) * t).toNumber();
        var g = (((a >> 8) & 0xFF) * (1.0 - t) + ((b >> 8) & 0xFF) * t).toNumber();
        var bl = ((a & 0xFF) * (1.0 - t) + (b & 0xFF) * t).toNumber();
        return (r << 16) | (g << 8) | bl;
    }

    // Herz mit Halbbreite s bei cx,cy.
    function heart(dc as Graphics.Dc, cx as Numeric, cy as Numeric, s as Numeric, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx - s * 0.5, cy - s * 0.3, s * 0.56);
        dc.fillCircle(cx + s * 0.5, cy - s * 0.3, s * 0.56);
        dc.fillPolygon([[cx - s * 1.04, cy - s * 0.05], [cx + s * 1.04, cy - s * 0.05], [cx, cy + s * 1.0]] as Array<[Numeric, Numeric]>);
    }

    // Play-Dreieck, optisch mittig.
    // Kleines Herz mit Puls, als Ganzes um y zentriert; ohne Messwert nur ein graues Herz.
    function pulse(dc as Graphics.Dc, y as Numeric, hr as Number?) as Void {
        var s = dc.getHeight() * 0.022;
        var text = hr == null ? "" : hr.format("%d");
        var tw = text.length() > 0 ? dc.getTextWidthInPixels(text, Graphics.FONT_XTINY) : 0;
        var gap = s * 0.9;
        var x0 = (dc.getWidth() - (s * 2 + (tw > 0 ? gap + tw : 0))) / 2.0;
        heart(dc, x0 + s, y, s, hr == null ? DIM : RED);
        if (tw > 0) {
            dc.setColor(GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + s * 2 + gap, y, Graphics.FONT_XTINY, text, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    function play(dc as Graphics.Dc, cx as Numeric, cy as Numeric, s as Numeric, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[cx - s * 0.5, cy - s * 0.75], [cx - s * 0.5, cy + s * 0.75], [cx + s * 0.8, cy]] as Array<[Numeric, Numeric]>);
    }

    // Drei Linien (Menü-Symbol).
    function menuIcon(dc as Graphics.Dc, cx as Numeric, cy as Numeric, s as Numeric, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var h = s * 0.18 < 2 ? 2 : s * 0.18;
        for (var i = -1; i <= 1; i++) {
            dc.fillRoundedRectangle(cx - s * 0.8, cy + i * s * 0.55 - h / 2, s * 1.6, h, h / 2);
        }
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

    // Kantenglättung, wo das Gerät sie kann (Kreise und schräge Linien sehen sonst treppig aus).
    function smooth(dc as Graphics.Dc) as Void {
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }
    }

    // Kantenglättung aus: nur die Startseite und einzelne Symbole brauchen sie, sie kostet Rechenzeit.
    function plain(dc as Graphics.Dc) as Void {
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(false);
        }
    }

    function penWidth(s as Numeric, factor as Float) as Number {
        var p = (s * factor).toNumber();
        return p < 2 ? 2 : p;
    }

    // Linienzug mit runden Ecken und Enden; punkte als [x0, y0, x1, y1, ...] in einer Box der Kantenlänge 64.
    function stroke(dc as Graphics.Dc, cx as Numeric, cy as Numeric, u as Numeric, pts as Array<Numeric>, pen as Number) as Void {
        dc.setPenWidth(pen);
        for (var i = 0; i + 3 < pts.size(); i += 2) {
            dc.drawLine(cx + (pts[i] - 32) * u, cy + (pts[i + 1] - 32) * u, cx + (pts[i + 2] - 32) * u, cy + (pts[i + 3] - 32) * u);
        }
        for (var i = 0; i + 1 < pts.size(); i += 2) {
            dc.fillCircle(cx + (pts[i] - 32) * u, cy + (pts[i + 1] - 32) * u, pen / 2.0);
        }
        dc.setPenWidth(1);
    }

    // MaraPlanna-Zeichen wie auf der Website: orangefarbener Berglauf mit grünem Punkt auf dem Gipfel.
    // s = Kantenlänge der (gedachten) Fläche, in der das Zeichen sitzt.
    function logo(dc as Graphics.Dc, cx as Numeric, cy as Numeric, s as Numeric) as Void {
        smooth(dc);
        var u = s / 64.0;
        dc.setColor(ORANGE, Graphics.COLOR_TRANSPARENT);
        stroke(dc, cx, cy, u, [12, 44, 24, 22, 32, 36, 40, 18, 52, 44] as Array<Numeric>, penWidth(u, 7.0));
        dc.setColor(LIME, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx + 8 * u, cy - 14 * u, u * 5.5);
    }

    // Wettersymbol (Wetterarten wie Vitals.CLEAR … Vitals.WIND) mit Radius r um cx, cy.
    function weather(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, kind as Number) as Void {
        smooth(dc);
        if (kind == Vitals.CLEAR) {
            sun(dc, cx, cy, r);
        } else if (kind == Vitals.PARTLY) {
            sun(dc, cx + r * 0.3, cy - r * 0.3, r * 0.72);
            cloud(dc, cx - r * 0.05, cy + r * 0.22, r * 0.85, 0xD4D4D8);
        } else if (kind == Vitals.FOG) {
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            for (var i = -1; i <= 1; i++) {
                dc.fillRoundedRectangle(cx - r * (i == 0 ? 0.6 : 0.9), cy + i * r * 0.5 - r * 0.1, r * (i == 0 ? 1.2 : 1.8), r * 0.2, r * 0.1);
            }
        } else if (kind == Vitals.WIND) {
            dc.setColor(0xD4D4D8, Graphics.COLOR_TRANSPARENT);
            for (var i = -1; i <= 1; i++) {
                var len = i == 0 ? 1.0 : 0.7;
                dc.fillRoundedRectangle(cx - r * 0.9, cy + i * r * 0.5 - r * 0.09, r * 1.8 * len, r * 0.18, r * 0.09);
            }
        } else {
            cloud(dc, cx, cy - (kind == Vitals.CLOUDY ? 0.0 : r * 0.22), r * (kind == Vitals.CLOUDY ? 1.0 : 0.9), kind == Vitals.STORM ? 0x9CA3AF : 0xD4D4D8);
            if (kind == Vitals.RAIN) {
                dc.setColor(BLUE, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(penWidth(r, 0.14));
                for (var i = -1; i <= 1; i++) {
                    dc.drawLine(cx + i * r * 0.5 + r * 0.12, cy + r * 0.35, cx + i * r * 0.5 - r * 0.1, cy + r * 0.8);
                }
                dc.setPenWidth(1);
            } else if (kind == Vitals.SNOW) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                for (var i = -1; i <= 1; i++) {
                    dc.fillCircle(cx + i * r * 0.5, cy + r * 0.6 + (i == 0 ? r * 0.12 : 0), r * 0.13);
                }
            } else if (kind == Vitals.STORM) {
                dc.setColor(0xFACC15, Graphics.COLOR_TRANSPARENT);
                dc.fillPolygon([[cx + r * 0.15, cy + r * 0.2], [cx - r * 0.25, cy + r * 0.62], [cx, cy + r * 0.62], [cx - r * 0.12, cy + r * 1.0], [cx + r * 0.32, cy + r * 0.5], [cx + r * 0.08, cy + r * 0.5]] as Array<[Numeric, Numeric]>);
            }
        }
    }

    function sun(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric) as Void {
        dc.setColor(0xFACC15, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r * 0.48);
        dc.setPenWidth(penWidth(r, 0.13));
        for (var k = 0; k < 8; k++) {
            var a = k * Math.PI / 4.0;
            dc.drawLine(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        dc.setPenWidth(1);
    }

    function cloud(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx - r * 0.5, cy + r * 0.12, r * 0.36);
        dc.fillCircle(cx - r * 0.02, cy - r * 0.18, r * 0.5);
        dc.fillCircle(cx + r * 0.52, cy + r * 0.14, r * 0.34);
        dc.fillRoundedRectangle(cx - r * 0.86, cy + r * 0.1, r * 1.72, r * 0.4, r * 0.2);
    }

    // Läufer (Strichfigur) in einer Box der Höhe 2*s um cx, cy.
    function runner(dc as Graphics.Dc, cx as Numeric, cy as Numeric, s as Numeric, color as Number) as Void {
        smooth(dc);
        var u = s / 32.0;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx + 1.5 * u, cy - 21.5 * u, u * 5.0);
        var pen = penWidth(u, 4.5);
        // Rumpf, vorderer und hinterer Arm, vorderes und hinteres Bein
        stroke(dc, cx, cy, u, [28, 18, 20, 36, 14, 46] as Array<Numeric>, pen);
        stroke(dc, cx, cy, u, [22, 26, 34, 32, 42, 28] as Array<Numeric>, pen);
        stroke(dc, cx, cy, u, [22, 26, 12, 30, 6, 40] as Array<Numeric>, pen);
        stroke(dc, cx, cy, u, [14, 46, 24, 52, 22, 62] as Array<Numeric>, pen);
        stroke(dc, cx, cy, u, [14, 46, 6, 54, 0, 52] as Array<Numeric>, pen);
    }

    // Rundes Messgerät (VO2max): Ring mit Zeiger.
    function gauge2(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, color as Number) as Void {
        smooth(dc);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(penWidth(r, 0.22));
        dc.drawCircle(cx, cy, r * 0.9);
        dc.drawLine(cx, cy, cx + r * 0.5, cy - r * 0.45);
        dc.setPenWidth(1);
        dc.fillCircle(cx, cy, r * 0.2);
    }

    // Häkchen mit Mitte cx, cy.
    function check(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, color as Number) as Void {
        smooth(dc);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(penWidth(r, 0.3));
        dc.drawLine(cx - r * 0.5, cy, cx - r * 0.1, cy + r * 0.4);
        dc.drawLine(cx - r * 0.1, cy + r * 0.4, cx + r * 0.55, cy - r * 0.4);
        dc.setPenWidth(1);
    }
}
