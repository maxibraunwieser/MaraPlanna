// MaraPlanna: Lauf-Aktivität mit Zielpaces aus MaraPlanna aufzeichnen.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Position;
import Toybox.Sensor;
import Toybox.WatchUi;

class RunApp extends Application.AppBase {
    var zones as PaceZones?;
    var controller as RecordingController?;
    var sync as Sync?;
    var homeView as HomeView?;
    // Der Bereit-Bildschirm, solange er offen ist (bekommt neue Daten mit)
    var startView as StartView?;
    var gps as Number = Position.QUALITY_NOT_AVAILABLE;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // GPS und Puls schon vor dem Start aktivieren, damit beim Loslaufen alles bereit ist.
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
    }

    function onStop(state as Dictionary?) as Void {
        // Wird die App während einer Aufzeichnung beendet, wird gespeichert statt verworfen
        // (in onStop ist keine Rückfrage mehr möglich – so gehen keine Daten verloren).
        if (controller != null && (controller as RecordingController).recording()) {
            (controller as RecordingController).save();
        }
        if (sync != null) {
            (sync as Sync).stop();
        }
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        Demo.seed();
        var z = new PaceZones();
        zones = z;
        controller = new RecordingController(z);
        var view = new HomeView();
        homeView = view;
        var s = new Sync(method(:onFeedChanged));
        sync = s;
        if (!Demo.active()) {
            s.start();
        }
        Demo.autopilot();
        return [view, new HomeDelegate()];
    }

    function onPosition(info as Position.Info) as Void {
        gps = info.accuracy;
        if (controller != null && info.heading != null) {
            (controller as RecordingController).heading = info.heading as Float;
        }
        WatchUi.requestUpdate();
    }

    // Neue Daten von MaraPlanna (oder neuer Kopplungscode): Paces neu laden, Anzeigen auffrischen.
    function onFeedChanged() as Void {
        if (startView != null) {
            (startView as StartView).onSync();
        } else if (zones != null) {
            (zones as PaceZones).load();
        }
        WatchUi.requestUpdate();
    }

    // Paces in der Garmin Connect App geändert.
    function onSettingsChanged() as Void {
        onFeedChanged();
    }

    function gpsReady() as Boolean {
        return gps >= Position.QUALITY_USABLE;
    }
}

function getApp() as RunApp {
    return Application.getApp() as RunApp;
}
