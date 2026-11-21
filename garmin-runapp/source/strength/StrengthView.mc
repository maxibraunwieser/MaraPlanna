// Anzeige und Bedienung des Krafttrainings (Zustände siehe StrengthController).
//   Tasten:  START  bereit: beginnen · sonst nur Pause und Pausenmenü (Weiter, Übung wählen, Speichern, Verwerfen)
//            MENÜ (lang AUF) wie START · auf der Karte: Übung des Satzes ändern
//            AUF/AB Karte: Wiederholungen bzw. Gewicht (1er-Schritte) ändern · Pause: Datenseiten (Pause, Übung, Trainingszeit,
//                   Uhrzeit) · Ende: Muskeln / Zusammenfassung
//            BACK   (unten rechts) bereit: zurück · Pause läuft: beenden · danach: Satz/Halten von Hand beginnen ·
//                   Satz/Halten: beenden · Karte: von den Wiederholungen zum Gewicht, dann bestätigen
//   Tippen:  auf der Karte links Wiederholungen, rechts Gewicht zum Anpassen wählen.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

(:strength)
class StrengthView extends WatchUi.View {
    private var _c as StrengthController;

    function initialize(c as StrengthController) {
        View.initialize();
        _c = c;
    }

    private function t(id as ResourceId) as String {
        return WatchUi.loadResource(id) as String;
    }

    private function num(v as Float) as String {
        return v == v.toNumber() ? v.toNumber().toString() : v.format("%.1f");
    }

    private function clock(secs as Number) as String {
        var s = secs < 0 ? -secs : secs;
        return (secs < 0 ? "+" : "") + (s / 60) + ":" + (s % 60).format("%02d");
    }

    private function unitText() as String {
        return _c.plan.unit;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.plain(dc);
        Draw.background(dc, false);
        var s = _c.state;
        if (s == Str.READY) {
            drawReady(dc);
        } else if (s == Str.REST || s == Str.PAUSED) {
            drawRest(dc);
        } else if (s == Str.SET) {
            drawSet(dc);
        } else if (s == Str.HOLD) {
            drawHold(dc);
        } else if (s == Str.CONFIRM) {
            drawConfirm(dc);
        } else {
            drawDone(dc);
        }
    }

    private function drawReady(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var plan = _c.plan;
        Draw.line(dc, h * 0.15, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthName));
        Draw.lineAny(dc, h * 0.30, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [plan.title] as Array<String>);
        if (plan.planned()) {
            var total = 0;
            for (var i = 0; i < plan.items.size(); i++) {
                total += plan.items[i].sets;
            }
            Draw.line(dc, h * 0.44, Graphics.FONT_XTINY, Draw.GRAY, plan.items.size() + " " + t(Rez.Strings.StrengthExercises) + " · " + total + " " + t(Rez.Strings.StrengthSets));
            Draw.lineAny(dc, h * 0.57, [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Draw.LIME, [plan.items[0].name] as Array<String>);
        } else {
            Draw.line(dc, h * 0.44, Graphics.FONT_XTINY, Draw.GRAY, plan.options.size() + " " + t(Rez.Strings.StrengthExercises));
        }
        Draw.play(dc, dc.getWidth() / 2, h * 0.78, h * 0.085, Draw.LIME);
    }

    // Pause mit Figur: Name oben, die Übung in der Mitte, darunter Satz, Ziel und Pausenzähler.
    private function drawRestFigure(dc as Graphics.Dc, m as FigureMove) as Void {
        var h = dc.getHeight();
        var w = dc.getWidth();
        var n = _c.nextPlanned();
        var e = _c.plan.items[n];
        Draw.lineAny(dc, h * 0.12, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [e.name] as Array<String>);
        Draw.smooth(dc);
        Figure.draw(dc, m, (System.getTimer() % m.ms) / m.ms.toFloat(), (w * 0.14).toNumber(), (h * 0.185).toNumber(), (w * 0.72).toNumber(), (h * 0.485).toNumber());
        Draw.plain(dc);
        Draw.line(dc, h * 0.735, Graphics.FONT_XTINY, Draw.LIME, t(Rez.Strings.StrengthSet) + " " + (_c.doneSets(n) + 1) + " / " + e.sets + (goalText(e).length() > 0 ? " · " + goalText(e) : ""));
        var left = _c.restLeftS();
        if (left != null) {
            Draw.valueUnit(dc, h * 0.835, clock(left), "", [Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] as Array<Graphics.FontDefinition>, (h * 0.14).toNumber(), left > 0 ? Graphics.COLOR_WHITE : Draw.ORANGE);
            if (left > 0) {
                Draw.bar(dc, h * 0.935, left * 1000.0 / (_c.restTotalMs > 0 ? _c.restTotalMs : 1), Draw.LIME);
            }
        } else {
            Draw.line(dc, h * 0.84, Graphics.FONT_XTINY, Draw.GRAY, startHint(e));
        }
    }

    // Das Ziel eines Satzes: Wiederholungen mal Gewicht, oder die Zeit beim Halten
    private function goalText(e as Planned) as String {
        if (e.mode == CountMode.TIME && e.hold > 0) {
            return e.hold + " " + t(Rez.Strings.StrengthSecondsShort);
        }
        var target = e.reps > 0 ? e.reps + " × " : "";
        return e.kg > 0.0 ? target + num(e.kg) + " " + unitText() : (e.reps > 0 ? e.reps + " " + t(Rez.Strings.StrengthReps) : "");
    }

    // Was START tut, wenn die nächste Übung nicht aus der Bewegung gezählt wird
    private function startHint(e as Planned) as String {
        if (e.mode == CountMode.TIME) {
            return t(Rez.Strings.StrengthStartHold);
        }
        return e.mode == CountMode.ASSIST ? t(Rez.Strings.StrengthStartManual) : t(Rez.Strings.StrengthStartHint);
    }

    // Pause nach einem Satz: der Satz (Übung, welcher Satz, Wiederholungen und Gewicht) und der Pausenzähler, unten die Übung,
    // die danach kommt. Ist die Pause um, zeigt drawRest die nächste Übung.
    private function drawResting(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var last = _c.lastSet() as LoggedSet;
        var nums = _c.lastSetNumbers();
        Draw.line(dc, h * 0.13, Graphics.FONT_XTINY, Draw.GRAY, "PAUSE");
        Draw.lineAny(dc, h * 0.25, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [last.name] as Array<String>);
        var setText = t(Rez.Strings.StrengthSet) + " " + nums[0] + (nums[1] > 0 ? " / " + nums[1] : "");
        var done = last.reps + " " + t(Rez.Strings.StrengthReps) + (last.kg > 0.0 ? " · " + num(last.kg) + " " + unitText() : "");
        Draw.lineAlt(dc, h * 0.36, Graphics.FONT_XTINY, Draw.LIME, [setText + " · " + done, done] as Array<String>);
        var left = _c.restLeftS() as Number;
        Draw.valueUnit(dc, h * 0.56, clock(left), "", [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.2).toNumber(), Graphics.COLOR_WHITE);
        Draw.bar(dc, h * 0.7, left * 1000.0 / (_c.restTotalMs > 0 ? _c.restTotalMs : 1), Draw.LIME);
        var next = _c.expectedIdx();
        var plan = _c.plan;
        if (plan.planned() && _c.nextPlanned() < 0 && _c.chosen < 0) {
            Draw.line(dc, h * 0.785, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthAllDone));
        } else if (next >= 0 && next < plan.options.size()) {
            // alle Sätze dieser Übung gemacht: die nächste Übung ist von selbst dran (hervorgehoben)
            var switched = nums[1] > 0 && nums[0] >= nums[1];
            Draw.lineAlt(dc, h * 0.785, Graphics.FONT_XTINY, switched ? Draw.LIME : Draw.GRAY, [(switched ? "Nächste Übung: " : "Danach: ") + plan.options[next].name, plan.options[next].name] as Array<String>);
        }
        hintKeys(dc);
    }

    // Unten: was die Tasten in der Pause tun
    private function hintKeys(dc as Graphics.Dc) as Void {
        Draw.lineAlt(dc, dc.getHeight() * 0.865, Graphics.FONT_XTINY, Draw.DIM, ["AUF/AB: Seiten", "AUF/AB"] as Array<String>);
    }

    // Die Seitenpunkte am linken Rand (welche Datenseite gerade zu sehen ist)
    private function pageDots(dc as Graphics.Dc, n as Number, at as Number) as Void {
        var h = dc.getHeight();
        var x = dc.getWidth() * 0.055;
        var gap = h * 0.04;
        var y0 = h * 0.5 - gap * (n - 1) / 2.0;
        for (var i = 0; i < n; i++) {
            dc.setColor(i == at ? Draw.LIME : Draw.DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x, y0 + gap * i, i == at ? 4 : 3);
        }
    }

    // Oben auf den Datenseiten: der Pausenzähler, solange die Pause läuft, sonst der Name der Seite
    private function pageHead(dc as Graphics.Dc, label as String) as Void {
        var h = dc.getHeight();
        if (_c.resting()) {
            Draw.line(dc, h * 0.13, Graphics.FONT_XTINY, Draw.LIME, "PAUSE " + clock(_c.restLeftS() as Number));
            Draw.line(dc, h * 0.22, Graphics.FONT_XTINY, Draw.GRAY, label);
        } else {
            Draw.line(dc, h * 0.17, Graphics.FONT_XTINY, Draw.GRAY, label);
        }
    }

    private function drawRest(dc as Graphics.Dc) as Void {
        var pg = _c.state == Str.REST ? _c.page : 0;
        if (pg > 0) {
            if (pg == 1) {
                drawExercisePage(dc);
            } else if (pg == 2) {
                drawTimePage(dc);
            } else {
                drawClockPage(dc);
            }
            pageDots(dc, _c.REST_PAGES, pg);
            hintKeys(dc);
            return;
        }
        if (_c.state == Str.REST) {
            pageDots(dc, _c.REST_PAGES, 0);
        }
        if (_c.resting()) {
            drawResting(dc);
            return;
        }
        var m = _c.currentMove();
        if (m != null) {
            drawRestFigure(dc, m);
            return;
        }
        var h = dc.getHeight();
        var plan = _c.plan;
        Draw.pulse(dc, h * 0.13, Vitals.heartRate());
        var n = _c.nextPlanned();
        var paused = _c.state == Str.PAUSED;
        // von Hand gewählte Übung außerhalb des Plans (Kraft frei): sie steht oben
        if (_c.chosen >= plan.items.size() && _c.chosen < plan.options.size() && !paused) {
            Draw.line(dc, h * 0.27, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthSet) + " " + (_c.sets.size() + 1));
            Draw.lineAny(dc, h * 0.40, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [plan.options[_c.chosen].name] as Array<String>);
            Draw.line(dc, h * 0.74, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthStartHint));
            hintKeys(dc);
            return;
        }
        if (plan.planned() && n < 0) {
            Draw.line(dc, h * 0.38, Graphics.FONT_SMALL, Draw.LIME, t(Rez.Strings.StrengthAllDone));
            Draw.line(dc, h * 0.52, Graphics.FONT_XTINY, Draw.GRAY, _c.sets.size() + " " + t(Rez.Strings.StrengthSets) + " · " + _c.totalReps() + " " + t(Rez.Strings.StrengthReps));
        } else if (plan.planned()) {
            var e = plan.items[n];
            var done = _c.doneSets(n);
            Draw.line(dc, h * 0.27, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthSet) + " " + (done + 1) + " / " + e.sets);
            Draw.lineAny(dc, h * 0.40, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [e.name] as Array<String>);
            var target = e.reps > 0 ? e.reps + " × " : "";
            Draw.line(dc, h * 0.53, Graphics.FONT_SMALL, Draw.LIME, goalText(e));
        } else {
            Draw.line(dc, h * 0.30, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthSet) + " " + (_c.sets.size() + 1));
            Draw.line(dc, h * 0.44, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, t(Rez.Strings.StrengthReady));
        }
        // die Pause ist um (oder es gab noch keinen Satz): die nächste Übung mit dem Hinweis, wie es losgeht
        if (paused) {
            Draw.line(dc, h * 0.74, Graphics.FONT_SMALL, Draw.ORANGE, t(Rez.Strings.StrengthPaused));
        } else {
            Draw.line(dc, h * 0.74, Graphics.FONT_XTINY, Draw.GRAY, plan.planned() && n < 0 ? t(Rez.Strings.StrengthFinishHint) : (n >= 0 ? startHint(plan.items[n]) : t(Rez.Strings.StrengthStartHint)));
        }
        if (!paused) {
            hintKeys(dc);
        }
    }

    // Datenseite "Übung": die Übung, die jetzt dran ist, welcher Satz kommt, das Ziel und was davon schon gemacht ist
    private function drawExercisePage(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var plan = _c.plan;
        pageHead(dc, "ÜBUNG");
        var i = _c.expectedIdx();
        if (plan.planned() && _c.nextPlanned() < 0 && _c.chosen < 0) {
            Draw.line(dc, h * 0.45, Graphics.FONT_SMALL, Draw.LIME, t(Rez.Strings.StrengthAllDone));
            return;
        }
        if (i < 0 || i >= plan.options.size()) {
            return;
        }
        var e = plan.options[i];
        Draw.lineAny(dc, h * 0.36, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [e.name] as Array<String>);
        var done = [] as Array<String>;
        for (var k = 0; k < _c.sets.size(); k++) {
            var s = _c.sets[k];
            if (e.id.length() > 0 ? e.id.equals(s.id) : e.name.equals(s.name)) {
                done.add(s.reps.toString());
            }
        }
        var setText = t(Rez.Strings.StrengthSet) + " " + (done.size() + 1) + (i < plan.items.size() ? " / " + plan.items[i].sets : "");
        Draw.line(dc, h * 0.49, Graphics.FONT_SMALL, Draw.LIME, setText);
        var goal = goalText(e);
        if (goal.length() > 0) {
            Draw.line(dc, h * 0.61, Graphics.FONT_XTINY, Draw.GRAY, "Ziel " + goal);
        }
        if (done.size() > 0) {
            var row = "";
            for (var k = 0; k < done.size(); k++) {
                row += (k > 0 ? " · " : "") + done[k];
            }
            Draw.lineAlt(dc, h * 0.72, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, ["Gemacht: " + row + " Wdh", row] as Array<String>);
        }
    }

    // Datenseite "Training": die Zeit seit dem Beginn groß, darunter Sätze und Wiederholungen
    private function drawTimePage(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        pageHead(dc, "TRAINING");
        var s = _c.elapsedS();
        var text = s >= 3600 ? (s / 3600) + ":" + (s % 3600 / 60).format("%02d") + ":" + (s % 60).format("%02d") : clock(s);
        Draw.valueUnit(dc, h * 0.48, text, "", [Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>, (h * 0.24).toNumber(), Graphics.COLOR_WHITE);
        Draw.line(dc, h * 0.68, Graphics.FONT_XTINY, Draw.GRAY, _c.sets.size() + " " + t(Rez.Strings.StrengthSets) + " · " + _c.totalReps() + " " + t(Rez.Strings.StrengthReps));
    }

    // Datenseite "Uhrzeit"
    private function drawClockPage(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        pageHead(dc, "UHRZEIT");
        var now = System.getClockTime();
        var hour = now.hour;
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12 == 0 ? 12 : hour % 12;
        }
        Draw.valueUnit(dc, h * 0.48, hour + ":" + now.min.format("%02d"), "", [Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD] as Array<Graphics.FontDefinition>, (h * 0.24).toNumber(), Graphics.COLOR_WHITE);
    }

    private function drawSet(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        Draw.pulse(dc, h * 0.13, Vitals.heartRate());
        Draw.valueUnit(dc, h * 0.45, _c.counter.reps().toString(), t(Rez.Strings.StrengthReps), [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.34).toNumber(), Draw.LIME);
        var plan = _c.plan;
        var name = plan.options.size() > 0 ? plan.options[_c.setIdx()].name : "";
        Draw.lineAny(dc, h * 0.72, [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [name] as Array<String>);
    }

    // Halten (Plank): die restliche Zeit groß, darunter das Ziel
    private function drawHold(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        Draw.pulse(dc, h * 0.13, Vitals.heartRate());
        var left = _c.holdTargetS() - _c.holdElapsedS();
        Draw.valueUnit(dc, h * 0.45, (left < 0 ? 0 : left).toString(), t(Rez.Strings.StrengthSecondsShort), [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.34).toNumber(), Draw.LIME);
        var name = _c.plan.options[_c.holdIdx()].name;
        Draw.lineAny(dc, h * 0.72, [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [name] as Array<String>);
    }

    // Satz beendet: oben die (erkannte) Übung, darunter links die Wiederholungen und rechts das Gewicht nebeneinander. Das Feld,
    // das AUF/AB gerade ändert, ist orange und unterstrichen; START springt von den Wiederholungen zum Gewicht, dann in die Pause.
    private function drawConfirm(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var w = dc.getWidth();
        var c = _c;
        var e = c.plan.options[c.optIdx];
        Draw.line(dc, h * 0.14, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthSetEnded));
        Draw.lineAny(dc, h * 0.27, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [e.name] as Array<String>);
        // links die Wiederholungen (bzw. Sekunden beim Halten), rechts das Gewicht ("–", solange keins bekannt ist)
        var timed = e.mode == CountMode.TIME;
        bigValue(dc, w * 0.3, h * 0.52, c.cReps.toString(), c.field == 0);
        bigValue(dc, w * 0.7, h * 0.52, c.cKg > 0.0 ? num(c.cKg) : "–", c.field == 1);
        dc.setColor(Draw.GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w * 0.3, h * 0.68, Graphics.FONT_XTINY, timed ? t(Rez.Strings.StrengthSecondsShort) : t(Rez.Strings.StrengthReps), Draw.CENTER);
        dc.drawText(w * 0.7, h * 0.68, Graphics.FONT_XTINY, unitText(), Draw.CENTER);
        // feine Linie zwischen den beiden Werten
        dc.setColor(Draw.EDGE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w * 0.5, h * 0.42, w * 0.5, h * 0.7);
        var hint = c.field == 0 ? ["AUF/AB Wdh · START Gewicht", "START: Gewicht"] : ["AUF/AB Gewicht · START fertig", "START: fertig"];
        Draw.lineAlt(dc, h * 0.83, Graphics.FONT_XTINY, Draw.GRAY, hint as Array<String>);
    }

    // Eine große Zahl der Karte, im Fokus orange und unterstrichen
    private function bigValue(dc as Graphics.Dc, x as Float, y as Float, value as String, focus as Boolean) as Void {
        var h = dc.getHeight();
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE] as Array<Graphics.FontDefinition>;
        var room = dc.getWidth() * 0.36;
        var font = fonts[fonts.size() - 1];
        // "–" steht in den Zahlenschriften nicht: dafür die normale große Schrift
        var numeric = !value.equals("–");
        for (var i = 0; i < fonts.size(); i++) {
            if ((numeric || !Draw.isNumberFont(fonts[i])) && dc.getTextWidthInPixels(value, fonts[i]) <= room) {
                font = fonts[i];
                break;
            }
        }
        dc.setColor(focus ? Draw.ORANGE : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, value, Draw.CENTER);
        if (focus) {
            dc.fillRoundedRectangle(x - h * 0.08, y + dc.getFontHeight(font) * 0.42, h * 0.16, 4, 2);
        }
    }

    // Ende: erst die beanspruchten Muskeln, AUF/AB zur Zusammenfassung
    private function drawDone(dc as Graphics.Dc) as Void {
        if (_c.page == 0 && _c.sets.size() > 0) {
            drawMuscles(dc);
        } else {
            drawSummary(dc);
        }
        if (_c.sets.size() > 0) {
            pageDots(dc, _c.DONE_PAGES, _c.page);
        }
    }

    // Welche Muskeln wie beansprucht wurden: die stärksten zuerst, je ein Balken (Länge = Last, Farbe = stark/mittel/leicht) und
    // die Sätze, die für den Muskel zählten (Hauptmuskel 1, Nebenmuskel ½)
    private function drawMuscles(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var w = dc.getWidth();
        var load = _c.muscleLoad();
        var order = Muscles.ranked(load, 5);
        Draw.line(dc, h * 0.12, Graphics.FONT_XTINY, Draw.GRAY, "BEANSPRUCHT");
        if (order.size() == 0) {
            Draw.line(dc, h * 0.45, Graphics.FONT_XTINY, Draw.GRAY, "Keine Angaben zu den Muskeln");
            return;
        }
        var top = load[order[0]];
        var colors = [Draw.AMBER, Draw.ORANGE, Draw.RED] as Array<Number>;
        var row = h * 0.105;
        var y0 = h * 0.235;
        var x0 = w * 0.15;
        var bx = w * 0.5;
        var bw = w * 0.34;
        var fh = dc.getFontHeight(Graphics.FONT_XTINY);
        for (var k = 0; k < order.size(); k++) {
            var i = order[k];
            var y = y0 + row * k;
            var lv = Muscles.level(load[i], top);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x0, y, Graphics.FONT_XTINY, Muscles.NAMES[i], Graphics.TEXT_JUSTIFY_LEFT);
            var by = y + fh * 0.5 - h * 0.018;
            dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(bx, by, bw, h * 0.036, 3);
            dc.setColor(colors[lv], Graphics.COLOR_TRANSPARENT);
            var len = bw * load[i] / top;
            dc.fillRoundedRectangle(bx, by, len < 6 ? 6 : len, h * 0.036, 3);
        }
        // Legende in den Farben der Balken
        var ly = y0 + row * order.size() + h * 0.01;
        var words = ["stark", "mittel", "leicht"] as Array<String>;
        var gap = w * 0.04;
        var total = gap * 2;
        for (var k = 0; k < 3; k++) {
            total += dc.getTextWidthInPixels(words[k], Graphics.FONT_XTINY);
        }
        var x = (w - total) / 2.0;
        for (var k = 0; k < 3; k++) {
            dc.setColor(colors[2 - k], Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, ly < h * 0.84 ? ly : h * 0.84, Graphics.FONT_XTINY, words[k], Graphics.TEXT_JUSTIFY_LEFT);
            x += dc.getTextWidthInPixels(words[k], Graphics.FONT_XTINY) + gap;
        }
    }

    private function drawSummary(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var c = _c;
        Draw.line(dc, h * 0.13, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthFinished));
        Draw.line(dc, h * 0.27, Graphics.FONT_MEDIUM, Draw.LIME, c.sets.size() + " " + t(Rez.Strings.StrengthSets));
        Draw.line(dc, h * 0.42, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, c.totalReps() + " " + t(Rez.Strings.StrengthReps) + " · " + num(c.volume()) + " " + unitText());
        Draw.line(dc, h * 0.55, Graphics.FONT_SMALL, Graphics.COLOR_WHITE, clock(c.totalMs / 1000) + (c.avgHr != null ? " · ♥ " + c.avgHr : ""));
        var up = c.upload;
        Draw.line(dc, h * 0.69, Graphics.FONT_XTINY, up == 2 ? Draw.LIME : Draw.GRAY, up == 1 ? t(Rez.Strings.StrengthSending) : (up == 2 ? t(Rez.Strings.StrengthSent) : (up == 3 ? t(Rez.Strings.StrengthSendLater) : "")));
        Draw.line(dc, h * 0.80, Graphics.FONT_XTINY, Draw.DIM, c.hz + " Hz · " + c.calls + " × · " + (c.maxGapMs / 1000.0).format("%.1f") + " s" + (c.gyroOn ? " · G" : ""));
    }
}

(:strength)
class StrengthDelegate extends WatchUi.BehaviorDelegate {
    private var _c as StrengthController;

    function initialize(c as StrengthController) {
        BehaviorDelegate.initialize();
        _c = c;
    }

    function onSelect() as Boolean {
        _c.onStart();
        return true;
    }

    function onBack() as Boolean {
        _c.onBack();
        return true;
    }

    // Karte: AB senkt, AUF erhöht. Pause und Ende: AUF/AB blättert die Datenseiten.
    function onNextPage() as Boolean {
        if (_c.state == Str.CONFIRM) {
            _c.onAdjust(-1);
        } else {
            _c.flip(1);
        }
        return true;
    }

    function onPreviousPage() as Boolean {
        if (_c.state == Str.CONFIRM) {
            _c.onAdjust(1);
        } else {
            _c.flip(-1);
        }
        return true;
    }

    // Wischen tut nichts (kein versehentliches Beenden mit schwitzigen Händen).
    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        return true;
    }

    // Menütaste (lang AUF): das Pausenmenü. Auf der Karte: die Übung des Satzes ändern (falls falsch erkannt).
    function onMenu() as Boolean {
        if (_c.state == Str.CONFIRM && _c.plan.options.size() > 1) {
            StrengthPick.show(true);
            return true;
        }
        _c.openMenu();
        return true;
    }

    // Tippen: auf der Karte die linke (Wiederholungen) oder rechte Hälfte (Gewicht) zum Anpassen wählen; bereit: beginnen.
    // Sonst nichts (kein Pausenmenü durch eine Berührung mit schwitzigen Händen).
    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        if (_c.state == Str.CONFIRM) {
            var x = evt.getCoordinates()[0];
            _c.focus(x < System.getDeviceSettings().screenWidth / 2 ? 0 : 1);
        } else if (_c.state == Str.READY) {
            _c.onStart();
        }
        return true;
    }
}

// Liste der Übungen des Workouts: in der Pause die nächste von Hand wählen, auf der Karte die Übung des Satzes ändern.
// Jede Zeile zeigt, wie viele Sätze schon gemacht sind; die erwartete steht im Fokus, fertige haben den grünen Haken.
(:strength)
module StrengthPick {
    function show(forSet as Boolean) as Void {
        var c = StrengthEntry.controller();
        if (c == null) {
            return;
        }
        var plan = (c as StrengthController).plan;
        var items = [] as Array<CardItem>;
        for (var i = 0; i < plan.options.size(); i++) {
            var o = plan.options[i];
            var sub = "nicht im Workout";
            var mark = Mark.NONE;
            if (i < plan.items.size()) {
                var done = (c as StrengthController).doneSets(i);
                sub = WatchUi.loadResource(Rez.Strings.StrengthSets) as String;
                sub = done + " / " + plan.items[i].sets + " " + sub;
                mark = done >= plan.items[i].sets ? Mark.DONE : Mark.NONE;
            }
            var card = new CardItem(i, o.name, sub, Draw.VIOLET);
            card.mark = mark;
            items.add(card);
        }
        var menu = Cards.show(forSet ? "Übung dieses Satzes" : "Nächste Übung", items, new StrengthPickDelegate(forSet), WatchUi.SLIDE_UP);
        var at = forSet ? (c as StrengthController).optIdx : (c as StrengthController).expectedIdx();
        menu.index = at >= 0 && at < items.size() ? at : 0;
    }
}

(:strength)
class StrengthPickDelegate extends CardMenuListener {
    private var _forSet as Boolean;

    function initialize(forSet as Boolean) {
        CardMenuListener.initialize();
        _forSet = forSet;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var c = StrengthEntry.controller();
        if (c != null && item.id instanceof Number) {
            if (_forSet) {
                (c as StrengthController).setExercise(item.id as Number);
            } else {
                (c as StrengthController).chooseNext(item.id as Number);
            }
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onClose(menu as CardMenu) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

// Das Pausenmenü (START): Weiter, darunter direkt alle Übungen des Workouts zum Wechseln (je Zeile die gemachten Sätze, fertige mit
// Haken, die aktuelle mit "jetzt"), dann Speichern und Verwerfen. Eine Übung wählen setzt fort: im Satz und auf der Karte gilt
// sie für diesen Satz, sonst als nächste.
(:strength)
module StrengthMenu {
    function show() as Void {
        var items = [new CardItem(:resume, WatchUi.loadResource(Rez.Strings.Resume) as String, null, Draw.GREEN)] as Array<CardItem>;
        var c = StrengthEntry.controller();
        if (c != null && (c as StrengthController).plan.options.size() > 1) {
            var ctl = c as StrengthController;
            var plan = ctl.plan;
            var now = ctl.currentIdx();
            var setsWord = WatchUi.loadResource(Rez.Strings.StrengthSets) as String;
            for (var i = 0; i < plan.options.size(); i++) {
                var sub = i < plan.items.size() ? ctl.doneSets(i) + " / " + plan.items[i].sets + " " + setsWord : "nicht im Workout";
                var card = new CardItem(i, plan.options[i].name, i == now ? "jetzt · " + sub : sub, i == now ? Draw.LIME : Draw.VIOLET);
                if (i < plan.items.size() && ctl.doneSets(i) >= plan.items[i].sets) {
                    card.mark = Mark.DONE;
                }
                items.add(card);
            }
        }
        items.add(new CardItem(:save, WatchUi.loadResource(Rez.Strings.Save) as String, null, Draw.ORANGE));
        items.add(new CardItem(:discard, WatchUi.loadResource(Rez.Strings.Discard) as String, null, Draw.RED));
        Cards.show(WatchUi.loadResource(Rez.Strings.MenuTitle) as String, items, new StrengthMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

(:strength)
class StrengthMenuDelegate extends CardMenuListener {
    function initialize() {
        CardMenuListener.initialize();
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var c = StrengthEntry.controller();
        var id = item.id;
        if (c == null) {
            return;
        }
        if (id == :resume) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            c.resume();
        } else if (id instanceof Number) {
            // eine Übung: weiter, dort wo man war, mit dieser Übung
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            c.resume();
            c.pickFromMenu(id as Number);
        } else if (id == :save) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            c.save();
        } else if (id == :discard) {
            var dialog = new WatchUi.Confirmation(WatchUi.loadResource(Rez.Strings.DiscardConfirm) as String);
            WatchUi.pushView(dialog, new StrengthDiscardDelegate(), WatchUi.SLIDE_IMMEDIATE);
        }
    }

    // Zurück aus dem Menü: bleibt pausiert.
    function onClose(menu as CardMenu) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

(:strength)
class StrengthDiscardDelegate extends WatchUi.ConfirmationDelegate {
    function initialize() {
        ConfirmationDelegate.initialize();
    }

    function onResponse(value as WatchUi.Confirm) as Boolean {
        if (value == WatchUi.CONFIRM_YES) {
            var c = StrengthEntry.controller();
            if (c != null) {
                c.discard();
            }
            System.exit();
        }
        return true;
    }
}

// Hinweis, wenn Kraft auf der Website noch nicht eingerichtet ist (drei kurze Zeilen).
(:strength)
class NoticeView extends WatchUi.View {
    private var _lines as Array<String>;

    function initialize(lines as Array<String>) {
        View.initialize();
        _lines = lines;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.plain(dc);
        Draw.background(dc, false);
        var h = dc.getHeight();
        Draw.line(dc, h * 0.18, Graphics.FONT_XTINY, Draw.GRAY, WatchUi.loadResource(Rez.Strings.StrengthName) as String);
        for (var i = 0; i < _lines.size(); i++) {
            Draw.lineAny(dc, h * (0.36 + 0.14 * i), [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [_lines[i]] as Array<String>);
        }
    }
}

(:strength)
class NoticeDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    function onSelect() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
