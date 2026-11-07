// Glättet die aktuelle Pace.
// Die Pace aus der Strecke weniger Sekunden schwankt stark: ein GPS-Fehler von ein paar Metern macht auf
// 30 m aus 5:30 schnell 7:40. Besser ist die Geschwindigkeit, die der GPS-Chip selbst misst (Doppler) und die
// die Uhr als Activity.Info.currentSpeed liefert. Sie wird über die letzten N Sekunden gemittelt (N = Einstellung
// "Pace-Glättung", Standard 20 s). Liefert die Uhr keine Geschwindigkeit, gilt die Strecke über dasselbe Fenster.
//
// Damit ein Tempowechsel nichts verzerrt, gibt es drei Regeln:
//   1. Neubeginn: Bei jedem neuen Schritt, jeder Runde und nach einer Pause beginnt die Glättung bei null
//      (reset). Die alte Pace fließt nie in die neue ein.
//   2. Wachsendes Fenster: Nach einem Neubeginn gilt der Durchschnitt der Zeit seitdem, bis das Fenster N Sekunden
//      lang ist; danach gleitet es normal weiter. Schon ab dem zweiten Messpunkt gibt es einen Wert.
//   3. Anlauf: Die ersten Sekunden nach dem Neubeginn (RUNUP_S, höchstens die Hälfte der bisherigen Zeit) zählen
//      nicht mit. Man beschleunigt dort noch; sie würden den Durchschnitt zu langsam machen, bis das Fenster voll ist.
//   Dazu der automatische Neubeginn für Läufe ohne Schritte: Weichen die letzten CHANGE_S Sekunden um mehr als
//   CHANGE_RATIO vom Rest des Fensters ab (ein Spurt, Stehenbleiben), beginnt das Fenster dort neu.
// Reine Logik ohne Zugriff auf die Uhr, damit sie testbar bleibt; die Puffer sind fest angelegt.

import Toybox.Lang;

class PaceSmoother {
    // Größtes Fenster in Sekunden (Einstellung "30 s")
    static const MAX_SECONDS = 30;
    // Platz für MAX_SECONDS Messpunkte
    private const SIZE = 31;
    // Unterhalb dieser Geschwindigkeit steht man praktisch (0,5 m/s = 33 min/km): keine Pace
    private const MIN_SPEED = 0.5;
    // Sekunden Anlauf nach einem Neubeginn, die nicht mitzählen
    private const RUNUP_S = 4;
    // Automatischer Neubeginn: die letzten CHANGE_S Sekunden gegen die bis zu CHANGE_REF_S davor
    private const CHANGE_S = 6;
    private const CHANGE_REF_S = 20;
    private const CHANGE_RATIO = 0.12;

    private var _ms as Array<Number> = new [SIZE] as Array<Number>;
    private var _dist as Array<Float> = new [SIZE] as Array<Float>;
    // -1,0 = keine Geschwindigkeit gemessen
    private var _speed as Array<Float> = new [SIZE] as Array<Float>;
    // Messpunkte insgesamt (bestimmt die Schreibposition im Ringpuffer)
    private var _total as Number = 0;
    // Messpunkte seit dem letzten Neubeginn
    private var _n as Number = 0;

    // Neubeginn (neuer Schritt, Runde, nach der Pause): alte Messpunkte sind nichts mehr wert.
    function reset() as Void {
        _n = 0;
    }

    // Ein Messpunkt pro Sekunde: Zeit (ms), Strecke (m) und die gemessene Geschwindigkeit (m/s) oder null.
    function add(ms as Number, dist as Float, speed as Float?) as Void {
        var i = _total % SIZE;
        _ms[i] = ms;
        _dist[i] = dist;
        _speed[i] = speed == null || speed != speed || speed < 0.0 ? -1.0 : speed;
        _total += 1;
        _n += 1;
        checkChange();
    }

    // Dauerhafter Tempowechsel ohne Schrittwechsel: Das Fenster beginnt bei den letzten CHANGE_S Sekunden neu.
    private function checkChange() as Void {
        if (_n < CHANGE_S + 4) {
            return;
        }
        var older = _n - CHANGE_S;
        older = older > CHANGE_REF_S ? CHANGE_REF_S : older;
        var recentSum = 0.0;
        var recentValid = 0;
        for (var k = 0; k < CHANGE_S; k++) {
            var s = _speed[(_total - 1 - k) % SIZE];
            if (s >= 0.0) {
                recentSum += s;
                recentValid += 1;
            }
        }
        var oldSum = 0.0;
        var oldValid = 0;
        for (var k = CHANGE_S; k < CHANGE_S + older; k++) {
            var s = _speed[(_total - 1 - k) % SIZE];
            if (s >= 0.0) {
                oldSum += s;
                oldValid += 1;
            }
        }
        if (recentValid < 4 || oldValid < 4) {
            return;
        }
        var recent = recentSum / recentValid;
        var before = oldSum / oldValid;
        if (before >= MIN_SPEED && (recent - before).abs() > CHANGE_RATIO * before) {
            _n = CHANGE_S;
        }
    }

    // Geschwindigkeit in m/s aus der Strecke der letzten "seconds" Sekunden seit dem Neubeginn; null bei zu wenig Daten.
    // Folgt dem Tempo schneller als die geglättete Pace (der Countdown vor dem Schrittende braucht die Restzeit jetzt,
    // nicht den Durchschnitt über das Fenster).
    function speedOver(seconds as Number) as Float? {
        var use = seconds + 1;
        use = use > _n ? _n : use;
        use = use > SIZE ? SIZE : use;
        if (use < 2) {
            return null;
        }
        var newest = (_total - 1) % SIZE;
        var oldest = (_total - use) % SIZE;
        var ms = _ms[newest] - _ms[oldest];
        var m = _dist[newest] - _dist[oldest];
        return ms <= 0 || m != m || m < 0.0 ? null : m * 1000.0 / ms;
    }

    // Pace in s/km über die letzten "seconds" Sekunden seit dem Neubeginn (ohne Anlauf); null, solange es zu wenig
    // Daten gibt oder man steht.
    function pace(seconds as Number) as Float? {
        if (_n < 2) {
            return null;
        }
        var wanted = seconds < 3 ? 3 : (seconds > MAX_SECONDS ? MAX_SECONDS : seconds);
        var skip = _n / 2 < RUNUP_S ? _n / 2 : RUNUP_S;
        var avail = _n - skip;
        avail = avail > SIZE ? SIZE : avail;
        var use = wanted < avail ? wanted : avail;

        var sum = 0.0;
        var valid = 0;
        for (var k = 0; k < use; k++) {
            var s = _speed[(_total - 1 - k) % SIZE];
            if (s >= 0.0) {
                sum += s;
                valid += 1;
            }
        }
        if (valid >= 1 && valid * 2 >= use) {
            var mean = sum / valid;
            return mean < MIN_SPEED ? null : 1000.0 / mean;
        }

        // Ersatz ohne Geschwindigkeit: Strecke über Zeit zwischen dem ältesten und dem neuesten Messpunkt
        if (use < 2) {
            return null;
        }
        var newest = (_total - 1) % SIZE;
        var oldest = (_total - use) % SIZE;
        return Pace.fromDelta(_ms[newest] - _ms[oldest], _dist[newest] - _dist[oldest]);
    }
}
