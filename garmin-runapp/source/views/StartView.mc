// "Bereit"-Bildschirm vor dem Lauf, geöffnet aus dem Trainingsmenü, bewusst minimal:
//   oben    der Puls
//   Mitte   die gewählte Einheit: "HEUTE GEPLANT", Titel von MaraPlanna, Strecke und Dauer
//           (oder Lauftyp mit Pace-Bereich)
//   unten   Start-Knopf mit GPS-Anzeige: orange Radar-Ringe, solange GPS gesucht wird,
//           grüner Ring, sobald es bereit ist (gestartet werden kann auch ohne GPS)
//   ganz unten  Punkte für die Auswahl (AUF/AB oder Wischen); START beginnt, BACK geht zurück.

import Toybox.Activity;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

class StartView extends WatchUi.View {
    // Auswahl wie Choices.list: -1 = heutige Einheit, 0 = freier Lauf, 1..7 = Lauftyp wie Pace.ZONES
    var options as Array<Number> = [] as Array<Number>;
    var selected as Number = 0;
    var workout as Workout?;

    // initial: die Einheit, die im Trainingsmenü gewählt wurde.
    private var _initial as Number;

    function initialize(initial as Number) {
        View.initialize();
        _initial = initial;
        getApp().startView = self;
        rebuild();
    }

    // Auswahl neu aufbauen (nach dem Laden der Daten oder neuen Einstellungen).
    function rebuild() as Void {
        // Beim ersten Aufbau steht die gewählte Einheit vorne, danach bleibt die Auswahl erhalten.
        var keep = options.size() > 0 ? options[selected] : _initial;
        var feed = Application.Storage.getValue("run");
        workout = Workout.fromFeed(feed instanceof Dictionary ? feed : null);
        var zones = getApp().zones;
        if (workout != null && zones != null) {
            (workout as Workout).bindZones(zones as PaceZones);
        }
        options = Choices.list(zones, workout);
        selected = 0;
        for (var i = 0; i < options.size(); i++) {
            if (options[i] == keep) {
                selected = i;
            }
        }
    }

    // Callback von Sync: neue Daten oder neuer Code.
    function onSync() as Void {
        var zones = getApp().zones;
        if (zones != null) {
            (zones as PaceZones).load();
        }
        rebuild();
        WatchUi.requestUpdate();
    }

    function move(step as Number) as Void {
        selected = (selected + step + options.size()) % options.size();
        WatchUi.requestUpdate();
    }

    function choice() as Number {
        return options[selected];
    }

    static function zoneName(zone as Number) as String {
        var ids = [Rez.Strings.ZoneFree, Rez.Strings.ZoneEasy, Rez.Strings.ZoneLong, Rez.Strings.ZoneRecovery, Rez.Strings.ZoneMarathon, Rez.Strings.ZoneThreshold, Rez.Strings.ZoneInterval, Rez.Strings.ZoneRepetition];
        return WatchUi.loadResource(ids[zone] as ResourceId) as String;
    }

    private var _timer as Timer.Timer?;

    // Solange der Startbildschirm sichtbar ist, läuft die Radar-Animation (alle 0,5 s neu zeichnen).
    function onShow() as Void {
        getApp().startGps();
        if (_timer == null) {
            _timer = new Timer.Timer();
            (_timer as Timer.Timer).start(method(:tick), 500, true);
        }
    }

    function onHide() as Void {
        // Beim Wechsel in den Lauf ist die Aufzeichnung schon gestartet (das GPS bleibt an); sonst wieder aus.
        var c = getApp().controller;
        if (c == null || !(c as RecordingController).recording()) {
            getApp().stopGps();
        }
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
    }

    function tick() as Void {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        Draw.plain(dc);
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var app = getApp();
        var zones = app.zones;
        var miles = zones != null && (zones as PaceZones).miles;
        var opt = choice();

        // oben: Kopplungscode, sonst Puls
        var sync = app.sync;
        var code = sync != null ? (sync as Sync).code() : null;
        if (code != null && code.length() == 6) {
            var text = "Code " + code.substring(0, 3) + " " + code.substring(3, 6);
            Draw.lineAlt(dc, h * 0.12, Graphics.FONT_XTINY, Draw.ORANGE, [text, code] as Array<String>);
        } else {
            heartRow(dc, h * 0.12);
        }

        // Mitte: Beschriftung, Titel, Details
        var label = "";
        var title = "";
        var detail = [] as Array<String>;
        if (opt == -1) {
            var wk = workout as Workout;
            label = "HEUTE GEPLANT";
            title = wk.title;
            var dist = Pace.distance1(wk.plannedMeters(), miles) + (miles ? " mi" : " km");
            var minutes = (wk.plannedTotal() / 60.0 + 0.5).toNumber();
            detail = [dist + " · " + minutes + " min", dist] as Array<String>;
        } else {
            title = zoneName(opt);
            if (opt > 0 && zones != null) {
                var range = Pace.formatRange((zones as PaceZones).range(opt), miles);
                detail = [range + (miles ? " /mi" : " /km"), range] as Array<String>;
            }
        }
        var big = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>;
        if (label.length() > 0) {
            Draw.line(dc, h * 0.265, Graphics.FONT_XTINY, Draw.ORANGE, label);
        }
        Draw.lineFit(dc, h * 0.38, big, Graphics.COLOR_WHITE, title);
        if (detail.size() > 0) {
            Draw.lineAlt(dc, h * 0.50, Graphics.FONT_SMALL, Draw.GRAY, detail);
        }

        // unten: Start-Knopf mit GPS-Anzeige, ganz unten die Auswahlpunkte
        startButton(dc, w / 2, h * 0.735, h * 0.085, app.gpsReady());
        Draw.dots(dc, h * 0.94, options.size(), selected);
    }

    // Herz mit Puls; ohne Messwert nur ein graues Herz.
    private function heartRow(dc as Graphics.Dc, y as Numeric) as Void {
        Draw.pulse(dc, y, Vitals.heartRate());
    }

    // Start-Knopf: Ring mit Play-Dreieck. GPS wird gesucht = orange Ringe laufen nach außen und
    // verblassen; GPS bereit = ruhiger grüner Ring.
    private function startButton(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, ready as Boolean) as Void {
        var pen = (r * 0.13).toNumber();
        dc.setPenWidth(pen < 2 ? 2 : pen);
        if (ready) {
            dc.setColor(Draw.GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, r);
        } else {
            var t = (System.getTimer() % 1800) / 1800.0;
            for (var k = 0; k < 2; k++) {
                var p = t + k * 0.5;
                p = p >= 1.0 ? p - 1.0 : p;
                dc.setColor(Draw.blend(Draw.ORANGE, Graphics.COLOR_BLACK, p), Graphics.COLOR_TRANSPARENT);
                dc.drawCircle(cx, cy, r * (1.0 + 0.6 * p));
            }
            dc.setColor(Draw.ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, r);
        }
        dc.setPenWidth(1);
        Draw.play(dc, cx, cy, r * 0.55, Graphics.COLOR_WHITE);
    }
}
