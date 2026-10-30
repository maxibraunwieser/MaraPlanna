// Eigene Felder in der FIT-Datei (Beschriftung: resources/fit/fitfields.xml).
//   0 target_pace_min  Record   s/km (schnelles Ende des Zielbereichs, 0 = kein Ziel)
//   1 target_pace_max  Record   s/km (langsames Ende)
//   2 pace_zone        Record   Lauftyp wie Pace.ZONES (0 = frei)
//   3 vdot             Session

import Toybox.ActivityRecording;
import Toybox.FitContributor;
import Toybox.Lang;

class FitFields {
    private var _min as FitContributor.Field;
    private var _max as FitContributor.Field;
    private var _zone as FitContributor.Field;
    private var _vdot as FitContributor.Field;

    function initialize(session as ActivityRecording.Session, vdot as Float?) {
        _min = session.createField("target_pace_min", 0, FitContributor.DATA_TYPE_UINT16, { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "s/km" });
        _max = session.createField("target_pace_max", 1, FitContributor.DATA_TYPE_UINT16, { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "s/km" });
        _zone = session.createField("pace_zone", 2, FitContributor.DATA_TYPE_UINT8, { :mesgType => FitContributor.MESG_TYPE_RECORD });
        _vdot = session.createField("vdot", 3, FitContributor.DATA_TYPE_FLOAT, { :mesgType => FitContributor.MESG_TYPE_SESSION });
        _vdot.setData(vdot == null ? 0.0 : vdot);
        update(null, 0);
    }

    // Jede Sekunde: aktueller Zielbereich und Lauftyp.
    function update(range as Array<Number>?, zone as Number) as Void {
        _min.setData(range == null ? 0 : range[0]);
        _max.setData(range == null ? 0 : range[1]);
        _zone.setData(zone);
    }
}
