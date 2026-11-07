// Anzeige und Bedienung des Krafttrainings (Zustände siehe StrengthController).
//   Tasten:  START  bereit: beginnen · Pause: Menü, bei Maschine oder Halten: Satz beginnen · Satz/Halten: beenden · Karte: bestätigen
//            MENÜ (lang AUF) Pause, Speichern, Verwerfen
//            AUF/AB Karte: Wert ändern (zuerst Gewicht)
//            BACK   bereit: zurück · Pause: Übung auslassen · Satz: verwerfen · Karte: Satz verwerfen
//   Tippen:  auf der Karte stellt eine Zeile zum Anpassen ein.

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

    private function drawRest(dc as Graphics.Dc) as Void {
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
        var left = _c.restLeftS();
        if (paused) {
            Draw.line(dc, h * 0.74, Graphics.FONT_SMALL, Draw.ORANGE, t(Rez.Strings.StrengthPaused));
        } else if (left != null) {
            Draw.valueUnit(dc, h * 0.74, clock(left), "", [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.2).toNumber(), left > 0 ? Graphics.COLOR_WHITE : Draw.ORANGE);
            if (left > 0) {
                Draw.bar(dc, h * 0.88, left * 1000.0 / (_c.restTotalMs > 0 ? _c.restTotalMs : 1), Draw.LIME);
            }
        } else {
            Draw.line(dc, h * 0.74, Graphics.FONT_XTINY, Draw.GRAY, plan.planned() && n < 0 ? t(Rez.Strings.StrengthFinishHint) : (n >= 0 ? startHint(plan.items[n]) : t(Rez.Strings.StrengthStartHint)));
        }
    }

    private function drawSet(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        Draw.pulse(dc, h * 0.13, Vitals.heartRate());
        Draw.valueUnit(dc, h * 0.45, _c.counter.reps().toString(), t(Rez.Strings.StrengthReps), [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.34).toNumber(), Draw.LIME);
        var n = _c.nextPlanned();
        var plan = _c.plan;
        var name = n >= 0 ? plan.items[n].name : (plan.options.size() > 0 ? plan.options[0].name : "");
        var sure = true;
        if (_c.liveIdx >= 0) {
            // Die Bewegung sagt, welche Übung es ist (mit Fragezeichen, solange sie sich nicht sicher ist)
            name = plan.options[_c.liveIdx].name;
            sure = _c.liveConf >= Recognizer.SURE;
        }
        Draw.lineAny(dc, h * 0.72, [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, sure ? Graphics.COLOR_WHITE : Draw.ORANGE, [sure ? name : name + " ?"] as Array<String>);
        Draw.line(dc, h * 0.85, Graphics.FONT_XTINY, Draw.GRAY, _c.nextMode() == CountMode.ASSIST ? t(Rez.Strings.StrengthFinishHint) : t(Rez.Strings.StrengthRunning));
    }

    // Halten (Plank): die restliche Zeit groß, darunter das Ziel
    private function drawHold(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        Draw.pulse(dc, h * 0.13, Vitals.heartRate());
        var left = _c.holdTargetS() - _c.holdElapsedS();
        Draw.valueUnit(dc, h * 0.45, (left < 0 ? 0 : left).toString(), t(Rez.Strings.StrengthSecondsShort), [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.34).toNumber(), Draw.LIME);
        var name = _c.plan.options[_c.holdIdx()].name;
        Draw.lineAny(dc, h * 0.72, [Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, Graphics.COLOR_WHITE, [name] as Array<String>);
        Draw.line(dc, h * 0.85, Graphics.FONT_XTINY, Draw.GRAY, t(Rez.Strings.StrengthFinishHint));
    }

    private function drawConfirm(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var c = _c;
        var e = c.plan.options[c.optIdx];
        Draw.line(dc, h * 0.14, Graphics.FONT_XTINY, c.recognized() ? Draw.LIME : Draw.GRAY, c.editing ? t(Rez.Strings.StrengthAdjust) : (c.recognized() ? t(Rez.Strings.StrengthRecognized) : t(Rez.Strings.StrengthSetEnded)));
        Draw.lineAny(dc, h * 0.29, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>, c.editing && c.field == 2 ? Draw.ORANGE : Graphics.COLOR_WHITE, [e.name] as Array<String>);
        Draw.valueUnit(dc, h * 0.47, c.cReps.toString(), e.mode == CountMode.TIME ? t(Rez.Strings.StrengthSecondsShort) : t(Rez.Strings.StrengthReps), [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.17).toNumber(), c.editing && c.field == 1 ? Draw.ORANGE : Draw.LIME);
        Draw.valueUnit(dc, h * 0.65, c.cKg > 0.0 ? num(c.cKg) : "–", unitText(), [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_MEDIUM] as Array<Graphics.FontDefinition>, (h * 0.17).toNumber(), c.editing && c.field == 0 ? Draw.ORANGE : Graphics.COLOR_WHITE);
        var hint = [t(Rez.Strings.StrengthHintConfirm), t(Rez.Strings.StrengthHintConfirmShort)] as Array<String>;
        if (c.editing) {
            hint = [t(Rez.Strings.StrengthHintEdit), t(Rez.Strings.StrengthHintEditShort)] as Array<String>;
        } else if (c.autoOn()) {
            hint = [t(Rez.Strings.StrengthAutoIn) + " " + c.autoLeft + " s"] as Array<String>;
        }
        Draw.lineAlt(dc, h * 0.84, Graphics.FONT_XTINY, Draw.GRAY, hint);
    }

    private function drawDone(dc as Graphics.Dc) as Void {
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

    // AB (nächste Seite) senkt, AUF (vorherige Seite) erhöht.
    function onNextPage() as Boolean {
        _c.onAdjust(-1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _c.onAdjust(1);
        return true;
    }

    // Wischen tut nichts (kein versehentliches Beenden mit schwitzigen Händen).
    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        return true;
    }

    // Menütaste (lang AUF): Pause, Speichern, Verwerfen. START kann bei Maschinen und beim Halten den Satz beginnen.
    function onMenu() as Boolean {
        _c.openMenu();
        return true;
    }

    // Tippen: auf der Karte die berührte Zeile zum Anpassen wählen, sonst wie START.
    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        if (_c.state == Str.CONFIRM) {
            var y = evt.getCoordinates()[1];
            var h = System.getDeviceSettings().screenHeight;
            _c.focus(y < h * 0.38 ? 2 : (y < h * 0.56 ? 1 : 0));
            return true;
        }
        _c.onStart();
        return true;
    }
}

(:strength)
module StrengthMenu {
    function show() as Void {
        var items = [
            new CardItem(:resume, WatchUi.loadResource(Rez.Strings.Resume) as String, null, Draw.GREEN),
            new CardItem(:save, WatchUi.loadResource(Rez.Strings.Save) as String, null, Draw.ORANGE),
            new CardItem(:discard, WatchUi.loadResource(Rez.Strings.Discard) as String, null, Draw.RED)
        ] as Array<CardItem>;
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
