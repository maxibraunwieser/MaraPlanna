// Startbildschirm: Lauftyp bzw. heutige Einheit wählen (AUF/AB), GPS- und Pulsstatus,
// Kopplungscode für MaraPlanna. START beginnt die Aufzeichnung.

import Toybox.Activity;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class StartView extends WatchUi.View {
    // -1 = heutige Einheit, 0 = freier Lauf, 1..7 = Lauftyp wie Pace.ZONES
    var options as Array<Number> = [] as Array<Number>;
    var selected as Number = 0;
    var workout as Workout?;

    function initialize() {
        View.initialize();
        rebuild();
    }

    // Auswahl neu aufbauen (nach dem Laden der Daten oder neuen Einstellungen).
    function rebuild() as Void {
        // Beim ersten Aufbau steht die heutige Einheit (bzw. der erste Lauftyp) vorne.
        var keep = options.size() > 0 ? options[selected] : null;
        var feed = Application.Storage.getValue("run");
        workout = Workout.fromFeed(feed instanceof Dictionary ? feed : null);
        var zones = getApp().zones;
        options = [] as Array<Number>;
        if (workout != null) {
            options.add(-1);
        }
        for (var i = 1; i < Pace.ZONES.size(); i++) {
            if (zones != null && (zones as PaceZones).range(i) != null) {
                options.add(i);
            }
        }
        options.add(0);
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

    function onUpdate(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        var app = getApp();
        var zones = app.zones;
        var miles = zones != null && (zones as PaceZones).miles;
        var unit = miles ? " /mi" : " /km";

        Draw.lineAlt(dc, h * 0.15, Graphics.FONT_XTINY, Draw.ORANGE, ["MARAPLANNA LAUF", "MARAPLANNA"] as Array<String>);

        // Gewählte Option
        var opt = choice();
        var title = opt == -1 ? "Heute: " + (workout as Workout).title : zoneName(opt);
        var detail = "Ohne Zielpace";
        if (opt == -1) {
            detail = (workout as Workout).size() + " Schritte, geführt";
        } else if (opt > 0 && zones != null) {
            detail = Pace.formatRange((zones as PaceZones).range(opt), miles) + unit;
        }
        var big = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY] as Array<Graphics.FontDefinition>;
        var small = [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY] as Array<Graphics.FontDefinition>;
        Draw.lineFit(dc, h * 0.28, big, Graphics.COLOR_WHITE, title);
        Draw.lineFit(dc, h * 0.385, small, Draw.GRAY, detail);
        var pos = (selected + 1) + "/" + options.size();
        var hint = options.size() < 2
            ? ["START drücken", "START"]
            : Draw.hasUpDown()
                ? [pos + "  AUF/AB wählen, START", pos + "  AUF/AB, START", pos]
                : [pos + "  Wischen, dann START", pos + "  Wischen, START", pos];
        Draw.lineAlt(dc, h * 0.475, Graphics.FONT_XTINY, Draw.DIM, hint as Array<String>);

        // GPS und Puls (Start ist auch ohne GPS möglich)
        var ready = app.gpsReady();
        Draw.lineAlt(dc, h * 0.58, Graphics.FONT_SMALL, ready ? Draw.GREEN : Draw.ORANGE, (ready ? ["GPS bereit"] : ["GPS wird gesucht...", "GPS sucht..."]) as Array<String>);
        var info = Activity.getActivityInfo();
        var hr = info != null ? info.currentHeartRate : null;
        Draw.line(dc, h * 0.67, Graphics.FONT_XTINY, Draw.GRAY, "Puls " + (hr == null ? "--" : hr.format("%d")));

        // Kopplung bzw. Herkunft der Paces
        var sync = app.sync;
        var code = sync != null ? (sync as Sync).code() : null;
        if (code != null && code.length() == 6) {
            Draw.lineAlt(dc, h * 0.775, Graphics.FONT_SMALL, Draw.ORANGE, ["Code " + code.substring(0, 3) + " " + code.substring(3, 6), code] as Array<String>);
            Draw.lineAlt(dc, h * 0.865, Graphics.FONT_XTINY, Draw.GRAY, ["auf der Website eingeben", "auf Website eingeben", "in MaraPlanna"] as Array<String>);
        } else if (zones == null || !(zones as PaceZones).hasAny()) {
            Draw.lineAlt(dc, h * 0.79, Graphics.FONT_XTINY, Draw.GRAY, ["Keine Paces: nur Freier Lauf", "Nur Freier Lauf"] as Array<String>);
        } else {
            Draw.lineAlt(dc, h * 0.79, Graphics.FONT_XTINY, Draw.DIM, ["Paces: " + (zones as PaceZones).source, (zones as PaceZones).source] as Array<String>);
        }
    }
}
