// Eigene Felder je Satz in der FIT-Datei (Beschriftung: resources/fit/fitfields.xml). Jeder Satz ist eine Runde.
//   10 set_reps      Lap  Wiederholungen
//   11 set_weight    Lap  Gewicht in kg
//   12 set_exercise  Lap  Name der Übung

import Toybox.ActivityRecording;
import Toybox.FitContributor;
import Toybox.Lang;

(:strength)
class StrengthFit {
    private var _reps as FitContributor.Field;
    private var _kg as FitContributor.Field;
    private var _name as FitContributor.Field;

    function initialize(session as ActivityRecording.Session) {
        _reps = session.createField("set_reps", 10, FitContributor.DATA_TYPE_UINT16, { :mesgType => FitContributor.MESG_TYPE_LAP });
        _kg = session.createField("set_weight", 11, FitContributor.DATA_TYPE_FLOAT, { :mesgType => FitContributor.MESG_TYPE_LAP, :units => "kg" });
        _name = session.createField("set_exercise", 12, FitContributor.DATA_TYPE_STRING, { :mesgType => FitContributor.MESG_TYPE_LAP, :count => 24 });
        set(0, 0.0, "");
    }

    // Vor jedem addLap(): Werte des Satzes, der damit abgeschlossen wird.
    function set(reps as Number, kg as Float, name as String) as Void {
        _reps.setData(reps);
        _kg.setData(kg);
        _name.setData(name);
    }
}
