// Gelaufene Strecke für die Kartenseite. Connect IQ liefert Apps keine Karten-Kacheln
// (außer auf einzelnen Modellen), deshalb wird die Spur selbst gezeichnet: das funktioniert
// auf jeder Uhr. Feste Größe: ist der Speicher voll, wird jeder zweite Punkt verworfen
// und der Mindestabstand verdoppelt.

import Toybox.Lang;
import Toybox.Math;

module Geo {
    const EARTH = 6371000.0;

    function rad(deg as Float) as Float {
        return deg * Math.PI / 180.0;
    }

    // Abstand in Metern (Gleichrechteck-Näherung reicht für einige Kilometer)
    function meters(lat1 as Float, lon1 as Float, lat2 as Float, lon2 as Float) as Float {
        var dx = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2.0)) * EARTH;
        var dy = rad(lat2 - lat1) * EARTH;
        return Math.sqrt(dx * dx + dy * dy).toFloat();
    }

    // Richtung von Punkt 1 nach Punkt 2 in Radiant, 0 = Norden, im Uhrzeigersinn.
    function bearing(lat1 as Float, lon1 as Float, lat2 as Float, lon2 as Float) as Float {
        var dx = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2.0));
        var dy = rad(lat2 - lat1);
        return Math.atan2(dx, dy).toFloat();
    }
}

class Track {
    private const CAP = 150;

    var count as Number = 0;
    // Letzte bekannte Position (wird immer aktualisiert, auch wenn kein Punkt gespeichert wird)
    var curLat as Float = 0.0;
    var curLon as Float = 0.0;
    var hasPosition as Boolean = false;

    private var _lat as Array<Float> = new [CAP] as Array<Float>;
    private var _lon as Array<Float> = new [CAP] as Array<Float>;
    private var _gap as Float = 8.0;

    function add(lat as Float, lon as Float) as Void {
        if (lat != lat || lon != lon || (lat == 0.0 && lon == 0.0)) {
            return; // ungültig
        }
        curLat = lat;
        curLon = lon;
        hasPosition = true;
        if (count > 0 && Geo.meters(_lat[count - 1], _lon[count - 1], lat, lon) < _gap) {
            return;
        }
        _lat[count] = lat;
        _lon[count] = lon;
        count += 1;
        if (count >= CAP) {
            var n = (count + 1) / 2;
            for (var i = 0; i < n; i++) {
                _lat[i] = _lat[2 * i];
                _lon[i] = _lon[2 * i];
            }
            count = n;
            _gap *= 2;
        }
    }

    function lat(i as Number) as Float {
        return _lat[i];
    }

    function lon(i as Number) as Float {
        return _lon[i];
    }

    // Startpunkt (erster gespeicherter Punkt)
    function startLat() as Float {
        return count > 0 ? _lat[0] : curLat;
    }

    function startLon() as Float {
        return count > 0 ? _lon[0] : curLon;
    }

    // Luftlinie zurück zum Start in Metern
    function distanceToStart() as Float {
        return hasPosition && count > 0 ? Geo.meters(curLat, curLon, _lat[0], _lon[0]) : 0.0;
    }
}
