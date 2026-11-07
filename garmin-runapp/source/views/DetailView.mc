// Detailseite einer Einheit (geplant oder absolviert): Datum, Titel und darunter scrollbare Zeilen.
// AUF/AB oder Wischen scrollt, BACK geht zurück. Die Texte bauen die Funktionen in SessionText, damit sie testbar sind.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Eine Zeile der Detailseite: links ein Text, rechts ein Wert (kann leer sein).
(:details)
class DetailLine {
    // Stile: Schritt (weiß), Nebenzeile (grau), Wert mit grauer Beschriftung
    static const NORMAL = 0;
    static const DIM = 1;
    static const LABEL = 2;

    var text as String;
    var value as String;
    var style as Number;

    function initialize(text as String, value as String, style as Number) {
        self.text = text;
        self.value = value;
        self.style = style;
    }
}

(:details)
module SessionText {
    // "5.11." aus der Tagesnummer
    function monthDay(day as Number) as String {
        var info = Gregorian.utcInfo(new Time.Moment(day * WeekPlan.DAY_S + WeekPlan.DAY_S / 2), Time.FORMAT_SHORT);
        return info.day + "." + info.month + ".";
    }

    // "Mi 5.11."
    function dateShort(day as Number) as String {
        return SessionRow.dayName(day) + " " + monthDay(day);
    }

    // "Mi 5. Nov" (Wochentag und Monat in der Sprache der Uhr)
    function dateLong(day as Number) as String {
        var info = Gregorian.utcInfo(new Time.Moment(day * WeekPlan.DAY_S + WeekPlan.DAY_S / 2), Time.FORMAT_MEDIUM);
        return info.day_of_week + " " + info.day + ". " + info.month;
    }

    // "10,2 km" bzw. "6,3 mi"; ganze Zahlen ohne Komma ("2 km"). Unter 1 km (bei reps unter 2 km) in Metern: "400 m".
    function meters(m as Number, miles as Boolean, rep as Boolean) as String {
        if (!miles && m < (rep ? 2000 : 1000)) {
            return m + " m";
        }
        var text = miles && m < 2000 ? Pace.distance(m, true) : Pace.distance1(m, miles);
        // Überflüssige Nullen nach dem Komma weglassen: "2,0" → "2", "0,50" → "0,5"
        if (text.find(",") != null) {
            var n = text.length();
            while (n > 0 && "0".equals(text.substring(n - 1, n))) {
                n -= 1;
            }
            if (n > 0 && ",".equals(text.substring(n - 1, n))) {
                n -= 1;
            }
            text = text.substring(0, n) as String;
        }
        return text + (miles ? " mi" : " km");
    }

    // Sekunden → "20 s", "5 min", "1:30 min"
    function seconds(s as Number) as String {
        if (s < 60) {
            return s + " s";
        }
        return s % 60 == 0 ? (s / 60) + " min" : Pace.time(s * 1000) + " min";
    }

    // Länge eines Schritts: Meter ("d") oder Sekunden ("s"); leer, wenn keins von beiden da ist.
    function length(step as Dictionary, dKey as String, sKey as String, miles as Boolean, rep as Boolean) as String {
        var d = Pace.toNum(step.get(dKey) as Object?);
        if (d != null) {
            return meters(d, miles, rep);
        }
        var s = Pace.toNum(step.get(sKey) as Object?);
        return s != null ? seconds(s) : "";
    }

    // Zeilen eines geplanten Schritts: Name + Länge ("Interval", "5 × 1000 m"), darunter Zielpace und Trabpause (grau, je eine Zeile).
    function stepLines(step as Dictionary, miles as Boolean) as Array<DetailLine> {
        var out = [] as Array<DetailLine>;
        var n = step.get("n");
        var name = n instanceof String ? n : "";
        var x = step.get("x");
        if (x instanceof String) {
            out.add(new DetailLine(name, x, DetailLine.NORMAL));
            return out;
        }
        var reps = Pace.toNum(step.get("r") as Object?);
        var rep = reps != null && reps > 1;
        out.add(new DetailLine(name, (rep ? reps + " × " : "") + length(step, "d", "s", miles, rep), DetailLine.NORMAL));
        var lo = Pace.toNum(step.get("lo") as Object?);
        var hi = Pace.toNum(step.get("hi") as Object?);
        var pace = lo != null && hi != null ? Pace.formatRange([lo, hi] as Array<Number>, miles) + (miles ? " /mi" : " /km") : "";
        var rec = rep ? length(step, "rd", "rs", miles, true) : "";
        if (pace.length() > 0) {
            out.add(new DetailLine(pace, "", DetailLine.DIM));
        }
        if (rec.length() > 0) {
            out.add(new DetailLine("Trab " + rec, "", DetailLine.DIM));
        }
        return out;
    }

    // Alle Zeilen einer geplanten Einheit.
    function planLines(item as Dictionary, miles as Boolean) as Array<DetailLine> {
        var out = [] as Array<DetailLine>;
        var st = item.get("st");
        if (st instanceof Array) {
            for (var i = 0; i < st.size(); i++) {
                if (st[i] instanceof Dictionary) {
                    out.addAll(stepLines(st[i] as Dictionary, miles));
                }
            }
        }
        if (out.size() == 0) {
            out.add(new DetailLine("Keine Schritte hinterlegt", "", DetailLine.DIM));
        }
        return out;
    }

    // Untertitel einer geplanten Einheit: "9,0 km · ~55 min · erledigt"
    function planSummary(item as Dictionary, today as Number, miles as Boolean) as String {
        var parts = [] as Array<String>;
        var k = WeekPlan.toFloat(item.get("k") as Object?);
        if (k != null && k > 0) {
            parts.add(Pace.distance1(k * 1000.0, miles) + (miles ? " mi" : " km"));
        }
        var m = Pace.toNum(item.get("m") as Object?);
        if (m != null && m > 0) {
            parts.add("~" + m + " min");
        }
        var s = item.get("s");
        var day = item.get("day") as Number;
        parts.add("c".equals(s as Object?) ? "erledigt" : ("x".equals(s as Object?) ? "ausgefallen" : (day < today ? "verpasst" : "geplant")));
        var text = parts[0];
        for (var i = 1; i < parts.size(); i++) {
            text += " · " + parts[i];
        }
        return text;
    }

    // Zeilen einer absolvierten Einheit: Zahlen des Laufs oder die Übungen des Krafttrainings.
    function doneLines(item as Dictionary, miles as Boolean) as Array<DetailLine> {
        var out = [] as Array<DetailLine>;
        var unit = miles ? " mi" : " km";
        var x = item.get("x");
        if (x instanceof Array) {
            for (var i = 0; i < x.size(); i++) {
                var row = x[i];
                if (row instanceof Array && row.size() >= 2) {
                    out.add(new DetailLine(row[0] as String, row[1] as String, DetailLine.NORMAL));
                }
            }
        }
        var k = WeekPlan.toFloat(item.get("k") as Object?);
        var secs = Pace.toNum(item.get("s") as Object?);
        if (k != null && k > 0) {
            out.add(new DetailLine("Distanz", Pace.distance1(k * 1000.0, miles) + unit, DetailLine.LABEL));
            var pk = WeekPlan.toFloat(item.get("pk") as Object?);
            if (pk != null && pk > 0) {
                out.add(new DetailLine("Geplant", Pace.distance1(pk * 1000.0, miles) + unit, DetailLine.LABEL));
            }
        }
        if (secs != null && secs > 0) {
            out.add(new DetailLine("Zeit", Pace.time(secs * 1000), DetailLine.LABEL));
            if (k != null && k > 0) {
                out.add(new DetailLine("Ø Pace", Pace.format(secs / k, miles) + (miles ? " /mi" : " /km"), DetailLine.LABEL));
            }
        }
        var h = Pace.toNum(item.get("h") as Object?);
        if (h != null && h > 0) {
            out.add(new DetailLine("Ø Puls", h.toString(), DetailLine.LABEL));
        }
        var e = Pace.toNum(item.get("e") as Object?);
        if (e != null && e > 0) {
            out.add(new DetailLine("Anstieg", e + " m", DetailLine.LABEL));
        }
        var te = WeekPlan.toFloat(item.get("te") as Object?);
        if (te != null && te > 0) {
            out.add(new DetailLine("Effekt", Pace.distance1(te * 1000.0, false), DetailLine.LABEL));
        }
        if (out.size() == 0) {
            out.add(new DetailLine("Keine Details gespeichert", "", DetailLine.DIM));
        }
        return out;
    }
}

(:details)
class DetailView extends WatchUi.View {
    private var _date as String;
    private var _title as String;
    private var _sub as String;
    private var _lines as Array<DetailLine>;
    private var _top as Number = 0;
    // Wie viele Zeilen auf den Bildschirm passen (wird beim Zeichnen bestimmt)
    private var _visible as Number = 1;

    function initialize(date as String, title as String, sub as String, lines as Array<DetailLine>) {
        View.initialize();
        _date = date;
        _title = title;
        _sub = sub;
        _lines = lines;
    }

    // Eine Zeile nach unten (1) bzw. oben (-1).
    function scroll(dir as Number) as Void {
        var max = _lines.size() - _visible;
        _top = _top + dir;
        _top = _top > max ? max : _top;
        _top = _top < 0 ? 0 : _top;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.background(dc, true);
        var w = dc.getWidth();
        var h = dc.getHeight();
        Draw.line(dc, h * 0.105, Graphics.FONT_XTINY, Draw.ORANGE, _date);
        Draw.lineFit(dc, h * 0.2, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, _title);
        var top = h * 0.3;
        if (_sub.length() > 0) {
            Draw.line(dc, h * 0.285, Graphics.FONT_XTINY, Draw.GRAY, _sub);
            top = h * 0.345;
        }
        var bottom = h * 0.87;
        var rowH = h * 0.09;
        _visible = ((bottom - top) / rowH).toNumber();
        _visible = _visible < 1 ? 1 : _visible;
        _top = _top > _lines.size() - _visible ? (_lines.size() - _visible < 0 ? 0 : _lines.size() - _visible) : _top;
        // Eine gemeinsame Spalte für alle Zeilen (sonst wandert der Rand mit der Rundung des Displays): die schmalste
        // Stelle ist die oberste bzw. unterste sichtbare Zeile.
        var shown = _top + _visible < _lines.size() ? _visible : _lines.size() - _top;
        var wTop = Draw.widthAt(dc, top + rowH * 0.5, rowH * 0.6);
        var wBottom = Draw.widthAt(dc, top + rowH * (shown - 0.5), rowH * 0.6);
        var avail = (wTop < wBottom ? wTop : wBottom) - Draw.margin(dc) * 2;
        for (var k = 0; k < shown; k++) {
            drawRow(dc, top + rowH * (k + 0.5), rowH, (w - avail) / 2.0, avail, _lines[_top + k]);
        }
        // Pfeile unten: es gibt mehr davor bzw. dahinter
        var s = h * 0.022;
        var y = h * 0.93;
        dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
        if (_top > 0) {
            dc.fillPolygon([[w / 2.0 - s * 2.2, y + s * 0.6], [w / 2.0 - s * 0.6, y + s * 0.6], [w / 2.0 - s * 1.4, y - s * 0.8]] as Array<[Numeric, Numeric]>);
        }
        if (_top + _visible < _lines.size()) {
            dc.fillPolygon([[w / 2.0 + s * 0.6, y - s * 0.6], [w / 2.0 + s * 2.2, y - s * 0.6], [w / 2.0 + s * 1.4, y + s * 0.8]] as Array<[Numeric, Numeric]>);
        }
    }

    private function drawRow(dc as Graphics.Dc, y as Float, rowH as Float, xL as Float, avail as Number, line as DetailLine) as Void {
        var font = Graphics.FONT_XTINY;
        var vw = line.value.length() > 0 ? dc.getTextWidthInPixels(line.value, font) : 0;
        var gap = vw > 0 ? rowH * 0.4 : 0;
        var dim = line.style == DetailLine.DIM;
        dc.setColor(dim || line.style == DetailLine.LABEL ? Draw.GRAY : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(xL, y, font, Draw.fit(dc, line.text, font, (avail - vw - gap).toNumber()), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        if (vw > 0) {
            dc.setColor(dim ? Draw.GRAY : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(xL + avail, y, font, line.value, Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}

(:details)
class DetailDelegate extends WatchUi.BehaviorDelegate {
    private var _view as DetailView;

    function initialize(view as DetailView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onNextPage() as Boolean {
        _view.scroll(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.scroll(-1);
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
