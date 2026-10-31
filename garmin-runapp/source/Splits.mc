// Zwischenzeiten je Kilometer (bzw. Meile): Zeit und Ø-Puls. Reine Rechnung ohne Anzeige, damit sie
// testbar ist. Die Zeit wird zwischen zwei Sekundenwerten interpoliert, so stimmt sie auf die Sekunde,
// auch wenn die Marke zwischen zwei Messungen überschritten wird.

import Toybox.Lang;

class Splits {
    private const CAP = 100;
    // So lange (ms Aufzeichnungszeit) steht die Zusammenfassung nach einer Marke im Display.
    private const SHOW_MS = 8000;

    // Anzahl abgeschlossener Kilometer
    var count as Number = 0;

    private var _ms as Array<Number> = new [CAP] as Array<Number>;
    private var _hr as Array<Number> = new [CAP] as Array<Number>;
    private var _startMs as Number = 0;
    private var _prevMs as Number = 0;
    private var _prevDist as Float = 0.0;
    private var _hrSum as Number = 0;
    private var _hrCount as Number = 0;
    private var _shownAt as Number = -100000;

    // Einmal pro Sekunde während der Aufzeichnung: Zeit (ms), gelaufene Strecke (m), Puls (null/0 = kein
    // Wert) und die Länge einer Marke in Metern. true, wenn damit ein Kilometer abgeschlossen wurde.
    // Ein ungültiger Streckenwert (springt zurück, z. B. ohne GPS-Fix) wird übergangen.
    function update(ms as Number, dist as Float, hr as Number?, unit as Float) as Boolean {
        if (hr != null && hr > 0) {
            _hrSum += hr;
            _hrCount += 1;
        }
        if (dist < _prevDist) {
            return false;
        }
        var done = false;
        var next = (count + 1) * unit;
        while (dist >= next && count < CAP) {
            var span = dist - _prevDist;
            var at = span > 0 ? _prevMs + ((next - _prevDist) / span * (ms - _prevMs)).toNumber() : ms;
            at = at < _startMs ? _startMs : at;
            _ms[count] = at - _startMs;
            _hr[count] = _hrCount > 0 ? _hrSum / _hrCount : 0;
            count += 1;
            _startMs = at;
            _hrSum = 0;
            _hrCount = 0;
            _shownAt = ms;
            done = true;
            next = (count + 1) * unit;
        }
        _prevMs = ms;
        _prevDist = dist;
        return done;
    }

    // Zeit des Kilometers i (0 = erster) in Millisekunden
    function duration(i as Number) as Number {
        return _ms[i];
    }

    // Ø-Puls des Kilometers i (0 = kein Wert)
    function hr(i as Number) as Number {
        return _hr[i];
    }

    // Pace des letzten abgeschlossenen Kilometers in s/km (unit = Länge einer Marke in Metern); null ohne Kilometer.
    function lastPace(unit as Float) as Float? {
        return count > 0 ? _ms[count - 1] / unit : null;
    }

    // Soll die Zusammenfassung des letzten Kilometers gerade angezeigt werden?
    function showing(ms as Number) as Boolean {
        return count > 0 && ms - _shownAt < SHOW_MS;
    }

    // Per Tastendruck oder Wischen wieder ausblenden.
    function hide() as Void {
        _shownAt = -100000;
    }
}
