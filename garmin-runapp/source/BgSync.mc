// Automatisch laden im Hintergrund: Die Uhr weckt die App auch dann, wenn sie geschlossen ist, jeden Morgen um 6:30 und
// danach alle 30 Minuten bis 22:00 (nachts nicht, das spart Akku). Jeder Durchgang holt über die Garmin-Connect-App den
// heutigen Lauf mit Paces (GET /watch/run) und, auf Uhren mit Krafttraining, die heutigen Kraft-Workouts (GET /watch/strength)
// und legt sie im Speicher ab wie der normale Abgleich. Öffnet man danach die App, ist der Stand schon da, auch ohne Handy.
//
// Garmin erlaubt nur eine geplante Hintergrund-Aufgabe zugleich und frühestens 5 Minuten nach der letzten; ein Durchgang darf
// höchstens 30 Sekunden laufen und hat wenig Speicher (64 KB auf der Forerunner 165, 32 KB auf den kleinen Uhren). Darum plant
// jeder Durchgang zuerst den nächsten Termin (fällt einer aus, etwa ohne Handy, geht es beim nächsten weiter) und lädt dann
// nur das Nötigste. Alles hier ist mit (:background) markiert, nur dieser Code steckt im Hintergrund-Speicher.

import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:background)
module AutoSync {
    // Erster Termin des Tages und letzter (Minuten nach Mitternacht), Abstand dazwischen
    const FIRST_MIN = 6 * 60 + 30;
    const LAST_MIN = 22 * 60;
    const STEP_MIN = 30;

    // Ein- und ausschalten (Einstellungen): Wert "auto" in "prefs", Standard an
    function enabled() as Boolean {
        var p = Application.Storage.getValue("prefs");
        var v = p instanceof Dictionary ? (p as Dictionary).get("auto") : null;
        return v instanceof Lang.Boolean ? v : true;
    }

    // Sekunden von "jetzt" (Sekunden nach Mitternacht, lokal) bis zum nächsten Termin: 6:30, 7:00, 7:30 … 22:00, danach
    // wieder 6:30 am nächsten Morgen. Ein Termin genau jetzt zählt nicht (der läuft gerade).
    function secondsToNext(nowSec as Number) as Number {
        var first = FIRST_MIN * 60;
        var last = LAST_MIN * 60;
        var step = STEP_MIN * 60;
        if (nowSec < first) {
            return first - nowSec;
        }
        if (nowSec >= last) {
            return 24 * 3600 - nowSec + first;
        }
        var k = (nowSec - first) / step + 1;
        return first + k * step - nowSec;
    }

    // Liegt "jetzt" im Zeitfenster (6:30 bis 22:00, mit 2 Minuten Spielraum, weil die Uhr Termine etwas später auslösen darf)?
    function inWindow(nowSec as Number) as Boolean {
        return nowSec >= FIRST_MIN * 60 - 120 && nowSec <= LAST_MIN * 60 + 120;
    }

    function nowSec() as Number {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return (t.hour as Number) * 3600 + (t.min as Number) * 60 + (t.sec as Number);
    }

    // Den nächsten Termin bei der Uhr anmelden (oder alles abmelden, wenn ausgeschaltet).
    function schedule() as Void {
        if (!(Toybox has :Background)) {
            return;
        }
        if (!enabled()) {
            Background.deleteTemporalEvent();
            return;
        }
        try {
            Background.registerForTemporalEvent(Time.now().add(new Time.Duration(secondsToNext(nowSec()))));
        } catch (e) {
            // zu kurz nach dem letzten Durchgang: der nächste Durchgang (oder der nächste Start der App) plant neu
        }
    }

    // Lokales Datum JJJJ-MM-TT (der Plan rechnet in lokalen Tagen)
    function today() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }
}

(:background)
class BgSync extends System.ServiceDelegate {
    private var _secret as String = "";
    private var _ran as Boolean = false;

    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        AutoSync.schedule();
        var next = Background.getTemporalEventRegisteredTime();
        if (next instanceof Time.Moment) {
            var t = Gregorian.info(next as Time.Moment, Time.FORMAT_SHORT);
            log("nächster Termin " + (t.hour as Number).format("%d") + ":" + (t.min as Number).format("%02d"));
        }
        var secret = Application.Storage.getValue("secret");
        if (!AutoSync.enabled() || !Bg.inWindow() || !(secret instanceof String) || Application.Storage.getValue("code") != null) {
            log("nichts zu tun (aus, nachts oder nicht gekoppelt)");
            Background.exit(null);
            return;
        }
        _secret = secret as String;
        log("Durchgang " + AutoSync.today());
        get("/run", method(:onRun));
    }

    private function get(path as String, callback as Method(code as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(Bg.base() + path, { "date" => AutoSync.today() }, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => { "X-Watch-Secret" => _secret },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }

    // Konsolenzeile (im Simulator sichtbar, auf der Uhr ohne Wirkung) mit dem belegten Hintergrund-Speicher
    private function log(text as String) as Void {
        var s = System.getSystemStats();
        System.println("bg: " + text + "  Speicher " + (s.usedMemory / 1024) + "/" + (s.totalMemory / 1024) + " KB");
    }

    function onRun(code as Number, data as Dictionary or String or Null) as Void {
        log("/run " + code);
        if (code == 200 && data instanceof Dictionary && data.hasKey("paces")) {
            Application.Storage.setValue("run", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            Application.Storage.setValue("synced", Time.now().value());
            _ran = true;
            // Kraft nur, wenn MaraPlanna es eingerichtet hat und die Uhr es kann
            var st = data.get("strength");
            if (st instanceof Dictionary && Bg.strengthOn()) {
                get("/strength", method(:onStrength));
                return;
            }
        }
        finish(code);
    }

    function onStrength(code as Number, data as Dictionary or String or Null) as Void {
        log("/strength " + code);
        if (code == 200 && data instanceof Dictionary && data.hasKey("ready")) {
            Bg.storeStrength(data as Dictionary);
            Application.Storage.deleteValue("strErr");
            log("Kraft gespeichert");
        }
        finish(code);
    }

    // Ergebnis an die App: ob es neue Daten gibt (die App frischt dann ihre Anzeige auf, falls sie offen ist)
    private function finish(code as Number) as Void {
        Application.Storage.setValue("bgLast", [Time.now().value(), code] as Array<Application.Storage.ValueType>);
        Background.exit(_ran);
    }
}
