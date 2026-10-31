// Pulszonen: Grenzen aus dem Garmin-Profil und die Zeit, die man in jeder Zone verbracht hat.

import Toybox.Lang;
import Toybox.UserProfile;

module HeartZones {
    // Die sechs Grenzen der Laufzonen [z0 .. z5] aus dem Profil; Standardwerte, wenn es keine hat.
    function read() as Array<Number> {
        var z = UserProfile.getHeartRateZones(UserProfile.HR_ZONE_SPORT_RUNNING);
        return z.size() >= 6 ? z : [95, 114, 133, 152, 171, 190] as Array<Number>;
    }

    // Zone 1..5 zu einem Puls; unter der zweiten Grenze zählt als Zone 1, über der letzten als 5.
    function zoneOf(hr as Number, zones as Array<Number>) as Number {
        var n = 1;
        for (var k = 1; k <= 4; k++) {
            if (hr >= zones[k]) {
                n = k + 1;
            }
        }
        return n;
    }
}

class ZoneTime {
    // Sekunden je Zone (Index 0 = Zone 1)
    var seconds as Array<Number> = [0, 0, 0, 0, 0] as Array<Number>;

    // Einmal pro Sekunde während der Aufzeichnung; Puls null/0 = kein Wert, zählt nicht.
    function add(hr as Number?, zones as Array<Number>) as Void {
        if (hr == null || hr <= 0) {
            return;
        }
        var i = HeartZones.zoneOf(hr, zones) - 1;
        seconds[i] += 1;
    }

    function total() as Number {
        var sum = 0;
        for (var i = 0; i < 5; i++) {
            sum += seconds[i];
        }
        return sum;
    }
}
