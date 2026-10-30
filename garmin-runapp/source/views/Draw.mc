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
    }
}
