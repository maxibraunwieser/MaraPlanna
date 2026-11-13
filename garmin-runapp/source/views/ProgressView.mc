// Hauptmenü → Fortschritt: alle Aktivitäten der letzten 7 Tage als Säulendiagramm.
//   Daten      Garmins Aktivitätsverlauf auf der Uhr (UserProfile.getUserActivityHistory): alles, was mit der Uhr aufgezeichnet
//              wurde (Laufen, Kraft, Rad, Gehen …), auch ohne Handy.
//   Säulen     eine je Aktivität, über ihrem Tag (heute rechts); je länger die Aktivität, desto höher die Säule (die längste der
//              Woche, mindestens 1 Stunde, ist ganz hoch; Linien bei jeder vollen Stunde).
//   Farbe      nach Sportart: Laufen orange, Kraft violett, Rad blau, Schwimmen türkis, Gehen/Wandern grün, Sonstiges grau.
//   Symbol     über den Läufen die Art der Einheit, aus MaraPlanna (Titel des absolvierten bzw. geplanten Laufs dieses Tages):
//              ● Easy, ▬ Long Run, Zickzack Intervall, ◆ Tempo, ○ Erholung, ■ Marathon-Pace, ▲ Fahrtspiel.
//   Unten      die gewählte Säule: Tag, Sportart, Art der Einheit, Dauer und Strecke. AUF/AB, Wischen oder Tippen wählt.
// Auf den Uhren mit 128 KB fehlt die Seite (Annotation details).

import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.UserProfile;
import Toybox.WatchUi;

(:details)
module ProgressData {
    const DAYS = 7;
    // Art eines Laufs
    const K_NONE = 0;
    const K_EASY = 1;
    const K_LONG = 2;
    const K_INTERVAL = 3;
    const K_TEMPO = 4;
    const K_RECOVERY = 5;
    const K_MARATHON = 6;
    const K_FARTLEK = 7;
    const KIND_NAMES = ["", "Easy", "Long Run", "Intervall", "Tempo", "Erholung", "Marathon-Pace", "Fahrtspiel"] as Array<String>;
    // Manche Uhren liefern die Startzeit in Garmin-Sekunden (ab 31.12.1989) statt Unix-Sekunden
    const GARMIN_EPOCH = 631065600;
    // So weit dürfen die Startzeiten von Uhr und MaraPlanna für denselben Lauf auseinanderliegen
    const MATCH_S = 900;
    const CYAN = 0x22D3EE;

    // Art eines Laufs aus seinem Titel (MaraPlanna, auf Deutsch oder Englisch)
    function kindOf(title as String?) as Number {
        if (title == null) {
            return K_NONE;
        }
        var t = (title as String).toLower();
        if (t.find("interval") != null || t.find("wiederholung") != null || t.find("repetition") != null) {
            return K_INTERVAL;
        }
        if (t.find("fahrtspiel") != null || t.find("fartlek") != null) {
            return K_FARTLEK;
        }
        if (t.find("tempo") != null || t.find("threshold") != null || t.find("schwelle") != null) {
            return K_TEMPO;
        }
        if (t.find("long") != null || t.find("lang") != null) {
            return K_LONG;
        }
        if (t.find("marathon") != null || t.find("race") != null || t.find("rennen") != null) {
            return K_MARATHON;
        }
        if (t.find("recovery") != null || t.find("erholung") != null || t.find("regenera") != null) {
            return K_RECOVERY;
        }
        if (t.find("easy") != null || t.find("locker") != null || t.find("strides") != null || t.find("steiger") != null || t.find("shakeout") != null) {
            return K_EASY;
        }
        return K_NONE;
    }

    // Startzeit in Unix-Sekunden (Garmin-Sekunden erkannt: sie lägen über zehn Jahre zurück)
    function unixOf(raw as Number, now as Number) as Number {
        return raw < now - 10 * 365 * 86400 ? raw + GARMIN_EPOCH : raw;
    }

    function dayOf(ts as Number) as Number {
        var t = Gregorian.info(new Time.Moment(ts), Time.FORMAT_SHORT);
        return WeekPlan.dayNumber(t.year, t.month as Number, t.day);
    }

    function isRun(sport as Number) as Boolean {
        return sport == Activity.SPORT_RUNNING;
    }

    function sportColor(sport as Number) as Number {
        if (sport == Activity.SPORT_RUNNING) {
            return Draw.ORANGE;
        }
        if (sport == Activity.SPORT_TRAINING || sport == Activity.SPORT_FITNESS_EQUIPMENT) {
            return Draw.VIOLET;
        }
        if (sport == Activity.SPORT_CYCLING) {
            return Draw.BLUE;
        }
        if (sport == Activity.SPORT_SWIMMING) {
            return CYAN;
        }
        if (sport == Activity.SPORT_WALKING || sport == Activity.SPORT_HIKING) {
            return Draw.GREEN;
        }
        return Draw.GRAY;
    }

    function sportName(sport as Number) as String {
        if (sport == Activity.SPORT_RUNNING) {
            return "Laufen";
        }
        if (sport == Activity.SPORT_TRAINING || sport == Activity.SPORT_FITNESS_EQUIPMENT) {
            return "Kraft";
        }
        if (sport == Activity.SPORT_CYCLING) {
            return "Rad";
        }
        if (sport == Activity.SPORT_SWIMMING) {
            return "Schwimmen";
        }
        if (sport == Activity.SPORT_WALKING) {
            return "Gehen";
        }
        if (sport == Activity.SPORT_HIKING) {
            return "Wandern";
        }
        return "Aktivität";
    }

    // Die Aktivitäten der letzten 7 Tage, älteste zuerst: { "d" => 0..6 (6 = heute), "sp" => Sportart, "s" => Sekunden,
    // "m" => Meter, "ts" => Start, "k" => Art des Laufs }
    function load(today as Number) as Array<Dictionary> {
        var raw = history();
        var out = [] as Array<Dictionary>;
        var finished = PlanData.finished(today);
        var planned = PlanData.planned(today);
        for (var i = 0; i < raw.size(); i++) {
            var a = raw[i];
            var d = dayOf(a[0]) - (today - DAYS + 1);
            if (d < 0 || d >= DAYS || a[2] <= 0) {
                continue;
            }
            var kind = isRun(a[1]) ? runKind(a[0], today - DAYS + 1 + d, finished, planned) : K_NONE;
            out.add({ "d" => d, "sp" => a[1], "s" => a[2], "m" => a[3], "ts" => a[0], "k" => kind } as Dictionary);
        }
        // älteste zuerst
        for (var i = 1; i < out.size(); i++) {
            var item = out[i];
            var j = i - 1;
            while (j >= 0 && (out[j].get("ts") as Number) > (item.get("ts") as Number)) {
                out[j + 1] = out[j];
                j -= 1;
            }
            out[j + 1] = item;
        }
        return out;
    }

    // Art eines Laufs: der absolvierte Lauf aus MaraPlanna (oder dieser App) zur selben Startzeit, sonst der geplante Lauf des Tages
    function runKind(ts as Number, day as Number, finished as Array<Dictionary>, planned as Array<Dictionary>) as Number {
        for (var i = 0; i < finished.size(); i++) {
            var f = finished[i];
            if (WeekPlan.toFloat(f.get("k") as Object?) != null && (PlanData.tsOf(f) - ts).abs() <= MATCH_S) {
                var k = kindOf(f.get("t") as String?);
                if (k != K_NONE) {
                    return k;
                }
            }
        }
        // ein erledigter Lauf desselben Tages (Startzeiten weichen manchmal stärker ab)
        for (var i = 0; i < finished.size(); i++) {
            if (finished[i].get("day") == day && WeekPlan.toFloat(finished[i].get("k") as Object?) != null) {
                var k = kindOf(finished[i].get("t") as String?);
                if (k != K_NONE) {
                    return k;
                }
            }
        }
        for (var i = 0; i < planned.size(); i++) {
            if (planned[i].get("day") == day && PlanData.isRun(planned[i])) {
                return kindOf(planned[i].get("t") as String?);
            }
        }
        return K_NONE;
    }

    // Garmins Aktivitätsverlauf: [Start (Unix), Sportart, Sekunden, Meter] je Aktivität, höchstens 40
    (:live)
    function history() as Array<Array<Number>> {
        var out = [] as Array<Array<Number>>;
        if (!(UserProfile has :getUserActivityHistory)) {
            return out;
        }
        var now = Time.now().value();
        var it = UserProfile.getUserActivityHistory();
        var a = it.next();
        while (a != null && out.size() < 40) {
            var start = a.startTime;
            var dur = a.duration;
            if (start != null && dur != null) {
                var ts = unixOf((start as Time.Moment).value(), now);
                if (now - ts < (DAYS + 1) * 86400) {
                    var sport = a.type;
                    var dist = a.distance;
                    out.add([ts, sport != null ? sport as Number : -1, (dur as Time.Duration).value(), dist != null ? dist as Number : 0] as Array<Number>);
                }
            }
            a = it.next();
        }
        return out;
    }

    // Demo-Build: der Simulator hat keinen Verlauf, darum eine Beispielwoche (Läufe passend zu den Beispieltiteln, Kraft, Rad)
    (:demo)
    function history() as Array<Array<Number>> {
        var day = 86400;
        var noon = (Time.now().value() / day) * day + 6 * 3600;
        return [
            [noon - 6 * day, Activity.SPORT_RUNNING, 2760, 8200],
            [noon - 5 * day, Activity.SPORT_TRAINING, 2400, 0],
            [noon - 4 * day, Activity.SPORT_RUNNING, 2830, 9300],
            [noon - 4 * day + 10 * 3600, Activity.SPORT_CYCLING, 1800, 11500],
            [noon - 2 * day, Activity.SPORT_RUNNING, 6420, 18400],
            [noon - 1 * day, Activity.SPORT_WALKING, 1500, 2100],
            [noon, Activity.SPORT_RUNNING, 3100, 7100]
        ] as Array<Array<Number>>;
    }

    // "52 min" bzw. "1:25 h"
    function duration(s as Number) as String {
        var m = (s + 30) / 60;
        return m < 60 ? m + " min" : (m / 60) + ":" + (m % 60).format("%02d") + " h";
    }

    // Untertitel im Hauptmenü: "6 Einheiten · 5:12 h"
    function summary(list as Array<Dictionary>) as String {
        return list.size() == 0 ? "Keine Aktivitäten" : list.size() + (list.size() == 1 ? " Einheit · " : " Einheiten · ") + totalTime(list);
    }

    // Gesamtdauer: "5:12 h"
    function totalTime(list as Array<Dictionary>) as String {
        var s = 0;
        for (var i = 0; i < list.size(); i++) {
            s += list[i].get("s") as Number;
        }
        return duration(s);
    }
}

(:details)
class ProgressView extends WatchUi.View {
    var list as Array<Dictionary>;
    var sel as Number;
    private var _today as Number;
    // x-Mitte jeder Säule beim letzten Zeichnen (für Tippen)
    private var _xs as Array<Float> = [] as Array<Float>;

    function initialize() {
        View.initialize();
        _today = WeekPlan.today();
        list = ProgressData.load(_today);
        sel = list.size() - 1;
    }

    function move(step as Number) as Void {
        if (list.size() == 0) {
            return;
        }
        sel = (sel + step + list.size()) % list.size();
        WatchUi.requestUpdate();
    }

    function tapAt(x as Numeric) as Void {
        var best = -1;
        var dist = 100000.0;
        for (var i = 0; i < _xs.size(); i++) {
            var d = (_xs[i] - x).abs();
            if (d < dist) {
                dist = d;
                best = i;
            }
        }
        if (best >= 0) {
            sel = best;
            WatchUi.requestUpdate();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Draw.background(dc, true);
        Draw.smooth(dc);
        // oben ist das runde Display schmal: kurzer Titel, darunter Zahl und Dauer der Einheiten der 7 Tage
        Draw.line(dc, h * 0.095, Graphics.FONT_XTINY, Draw.ORANGE, "Fortschritt");
        Draw.lineAlt(dc, h * 0.18, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, [ProgressData.summary(list), ProgressData.totalTime(list)] as Array<String>);

        var top = h * 0.29;
        var base = h * 0.64;
        var x0 = w * 0.13;
        var x1 = w * 0.87;
        var slot = (x1 - x0) / ProgressData.DAYS;

        // Maßstab: die längste Aktivität, mindestens eine Stunde; eine Linie je volle Stunde
        var maxS = 3600;
        for (var i = 0; i < list.size(); i++) {
            var s = list[i].get("s") as Number;
            maxS = s > maxS ? s : maxS;
        }
        var hours = maxS / 3600;
        dc.setPenWidth(1);
        for (var hr = 1; hr <= hours && hr <= 6; hr++) {
            var y = base - (base - top) * hr * 3600.0 / maxS;
            dc.setColor(Draw.GRID, Graphics.COLOR_TRANSPARENT);
            dc.drawLine(x0, y, x1, y);
            dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 - 3, y, Graphics.FONT_XTINY, hr + "h", Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        dc.setColor(Draw.EDGE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(x0, base, x1, base);

        // Tage unten (heute orange)
        for (var d = 0; d < ProgressData.DAYS; d++) {
            var day = _today - ProgressData.DAYS + 1 + d;
            dc.setColor(d == ProgressData.DAYS - 1 ? Draw.ORANGE : Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0 + slot * (d + 0.5), base + h * 0.045, Graphics.FONT_XTINY, SessionRow.dayName(day).substring(0, 2) as String, Draw.CENTER);
        }

        // Säulen: je Tag nebeneinander
        _xs = [] as Array<Float>;
        for (var i = 0; i < list.size(); i++) {
            _xs.add(0.0);
        }
        for (var d = 0; d < ProgressData.DAYS; d++) {
            var idx = [] as Array<Number>;
            for (var i = 0; i < list.size(); i++) {
                if (list[i].get("d") == d) {
                    idx.add(i);
                }
            }
            var n = idx.size();
            if (n == 0) {
                continue;
            }
            var gap = 2.0;
            var bw = (slot * 0.78 - gap * (n - 1)) / n;
            bw = bw > slot * 0.5 ? slot * 0.5 : bw;
            bw = bw < 3.0 ? 3.0 : bw;
            var total = bw * n + gap * (n - 1);
            var left = x0 + slot * d + (slot - total) / 2.0;
            for (var k = 0; k < n; k++) {
                var a = list[idx[k]];
                var bh = (base - top) * (a.get("s") as Number) / maxS;
                bh = bh < 3.0 ? 3.0 : bh;
                var bx = left + k * (bw + gap);
                _xs[idx[k]] = bx + bw / 2.0;
                var color = ProgressData.sportColor(a.get("sp") as Number);
                dc.setColor(color, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(bx, base - bh, bw, bh, bw > 6 ? 2 : 1);
                if (idx[k] == sel) {
                    dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                    dc.setPenWidth(2);
                    dc.drawRoundedRectangle(bx - 2, base - bh - 2, bw + 4, bh + 4, 3);
                    dc.setPenWidth(1);
                }
                var kind = a.get("k") as Number;
                if (kind != ProgressData.K_NONE) {
                    var r = bw * 0.32;
                    r = r < 3.0 ? 3.0 : (r > 6.0 ? 6.0 : r);
                    symbol(dc, kind, bx + bw / 2.0, base - bh - r - 5, r, idx[k] == sel ? Graphics.COLOR_WHITE : Draw.GRAY);
                }
            }
        }

        // Die gewählte Aktivität
        if (list.size() == 0) {
            Draw.lineAlt(dc, h * 0.8, Graphics.FONT_XTINY, Draw.GRAY, ["Keine Aktivitäten in 7 Tagen", "Keine Aktivitäten"] as Array<String>);
        } else {
            var a = list[sel];
            var day = _today - ProgressData.DAYS + 1 + (a.get("d") as Number);
            var name = ProgressData.sportName(a.get("sp") as Number);
            var kind = a.get("k") as Number;
            var head = (day == _today ? "Heute" : SessionRow.dayName(day)) + " · " + name + (kind != ProgressData.K_NONE ? " · " + ProgressData.KIND_NAMES[kind] : "");
            Draw.lineAlt(dc, h * 0.775, Graphics.FONT_XTINY, ProgressData.sportColor(a.get("sp") as Number), [head, name + (kind != ProgressData.K_NONE ? " · " + ProgressData.KIND_NAMES[kind] : "")] as Array<String>);
            var m = a.get("m") as Number;
            var sub = ProgressData.duration(a.get("s") as Number) + (m >= 100 ? " · " + Pace.distance1(m, miles()) + (miles() ? " mi" : " km") : "");
            Draw.line(dc, h * 0.855, Graphics.FONT_XTINY, Draw.GRAY, sub);
        }
        Draw.plain(dc);
    }

    private function miles() as Boolean {
        var zones = getApp().zones;
        return zones != null && (zones as PaceZones).miles;
    }

    // Kleines Symbol für die Art eines Laufs
    function symbol(dc as Graphics.Dc, kind as Number, cx as Float, cy as Float, r as Float, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        if (kind == ProgressData.K_EASY) {
            dc.fillCircle(cx, cy, r * 0.8);
        } else if (kind == ProgressData.K_LONG) {
            dc.fillRoundedRectangle(cx - r * 1.4, cy - r * 0.4, r * 2.8, r * 0.8, r * 0.4);
        } else if (kind == ProgressData.K_INTERVAL) {
            dc.setPenWidth(2);
            dc.drawLine(cx - r * 1.3, cy + r * 0.7, cx - r * 0.45, cy - r * 0.7);
            dc.drawLine(cx - r * 0.45, cy - r * 0.7, cx + r * 0.45, cy + r * 0.7);
            dc.drawLine(cx + r * 0.45, cy + r * 0.7, cx + r * 1.3, cy - r * 0.7);
            dc.setPenWidth(1);
        } else if (kind == ProgressData.K_TEMPO) {
            dc.fillPolygon([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]] as Array<[Numeric, Numeric]>);
        } else if (kind == ProgressData.K_RECOVERY) {
            dc.setPenWidth(2);
            dc.drawCircle(cx, cy, r * 0.8);
            dc.setPenWidth(1);
        } else if (kind == ProgressData.K_MARATHON) {
            dc.fillRectangle(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
        } else if (kind == ProgressData.K_FARTLEK) {
            dc.fillPolygon([[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]] as Array<[Numeric, Numeric]>);
        }
    }
}

(:details)
class ProgressDelegate extends WatchUi.BehaviorDelegate {
    private var _view as ProgressView;

    function initialize(view as ProgressView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    // AUF: ältere Aktivität, AB: neuere
    function onPreviousPage() as Boolean {
        _view.move(-1);
        return true;
    }

    function onNextPage() as Boolean {
        _view.move(1);
        return true;
    }

    function onSelect() as Boolean {
        _view.move(1);
        return true;
    }

    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        var d = evt.getDirection();
        if (d == WatchUi.SWIPE_LEFT || d == WatchUi.SWIPE_UP) {
            _view.move(1);
        } else if (d == WatchUi.SWIPE_DOWN) {
            _view.move(-1);
        } else {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        }
        return true;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        _view.tapAt(evt.getCoordinates()[0]);
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
