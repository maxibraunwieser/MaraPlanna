// Glättet die aktuelle Pace.
// Die Pace aus der Strecke weniger Sekunden schwankt stark: ein GPS-Fehler von ein paar Metern macht auf
// 30 m aus 5:30 schnell 7:40. Besser ist die Geschwindigkeit, die der GPS-Chip selbst misst (Doppler) und die
// die Uhr als Activity.Info.currentSpeed liefert. Sie wird über die letzten N Sekunden gemittelt (N = Einstellung
// "Pace-Glättung"). Liefert die Uhr keine Geschwindigkeit, gilt die Strecke über dasselbe Fenster.
// Reine Logik ohne Zugriff auf die Uhr, damit sie testbar bleibt; die Puffer sind fest angelegt.

import Toybox.Lang;

class PaceSmoother {
    // Größtes Fenster in Sekunden (Einstellung "Ruhig")
    static const MAX_SECONDS = 30;
    // Platz für MAX_SECONDS Messpunkte
    private const SIZE = 31;
    // Unterhalb dieser Geschwindigkeit steht man praktisch (0,5 m/s = 33 min/km): keine Pace
    private const MIN_SPEED = 0.5;

    private var _ms as Array<Number> = new [SIZE] as Array<Number>;
    private var _dist as Array<Float> = new [SIZE] as Array<Float>;
    // -1,0 = keine Geschwindigkeit gemessen
    private var _speed as Array<Float> = new [SIZE] as Array<Float>;
    private var _count as Number = 0;

    // Nach Pause oder Neustart: alte Messpunkte sind nichts mehr wert.
    function reset() as Void {
        _count = 0;
    }

    // Ein Messpunkt pro Sekunde: Zeit (ms), Strecke (m) und die gemessene Geschwindigkeit (m/s) oder null.
    function add(ms as Number, dist as Float, speed as Float?) as Void {
        var i = _count % SIZE;
        _ms[i] = ms;
        _dist[i] = dist;
        _speed[i] = speed == null || speed != speed || speed < 0.0 ? -1.0 : speed;
        _count += 1;
    }

    // Pace in s/km über die letzten "seconds" Sekunden; null, solange zu wenig Daten da sind oder man steht.
    function pace(seconds as Number) as Float? {
        var have = _count < SIZE ? _count : SIZE;
        if (have < 3) {
            return null;
        }
        var wanted = seconds < 3 ? 3 : (seconds > MAX_SECONDS ? MAX_SECONDS : seconds);
        var use = wanted < have ? wanted : have;

        var sum = 0.0;
        var valid = 0;
        for (var k = 0; k < use; k++) {
            var s = _speed[(_count - 1 - k) % SIZE];
            if (s >= 0.0) {
                sum += s;
                valid += 1;
            }
        }
        if (valid >= 3 && valid * 2 >= use) {
            var mean = sum / valid;
            return mean < MIN_SPEED ? null : 1000.0 / mean;
        }

        // Ersatz ohne Geschwindigkeit: Strecke über Zeit zwischen dem ältesten und dem neuesten Messpunkt
        var newest = (_count - 1) % SIZE;
        var oldest = (_count - use) % SIZE;
        return Pace.fromDelta(_ms[newest] - _ms[oldest], _dist[newest] - _dist[oldest]);
    }
}
