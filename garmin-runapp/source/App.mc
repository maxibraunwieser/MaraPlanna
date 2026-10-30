// MaraPlanna Lauf: Lauf-Aktivität mit Zielpaces aus MaraPlanna aufzeichnen.

import Toybox.Application;
import Toybox.Lang;
import Toybox.Position;
import Toybox.Sensor;
import Toybox.WatchUi;

class RunApp extends Application.AppBase {
    var zones as PaceZones?;
    var controller as RecordingController?;
    var sync as Sync?;
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
        var view = new StartView();
        startView = view;
        var s = new Sync(view.method(:onSync));
        sync = s;
        if (!Demo.active()) {
            s.start();
        }
        Demo.autopilot();
        return [view, new StartDelegate(view)];
    }

    function onPosition(info as Position.Info) as Void {
        gps = info.accuracy;
        WatchUi.requestUpdate();
    }

    // Paces in der Garmin Connect App geändert.
    function onSettingsChanged() as Void {
        if (startView != null) {
            (startView as StartView).onSync();
        } else if (zones != null) {
            (zones as PaceZones).load();
        }
        WatchUi.requestUpdate();
    }

    function gpsReady() as Boolean {
        return gps >= Position.QUALITY_USABLE;
    }
}

function getApp() as RunApp {
    return Application.getApp() as RunApp;
}
