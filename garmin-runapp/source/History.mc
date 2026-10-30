// Verlauf von Puls und Geschwindigkeit über den ganzen Lauf für die Diagramm-Seiten.
// Feste Größe: ist der Speicher voll, werden je zwei Punkte zu einem zusammengefasst
// und die Abtastung halbiert. So passen 10 Minuten wie 4 Stunden hinein, ohne Wachstum.

import Toybox.Lang;

class History {
    private const CAP = 160;

    // Anzahl gespeicherter Punkte und Sekunden pro Punkt
    var count as Number = 0;
    var seconds as Number = 1;

    private var _hr as Array<Number> = new [CAP] as Array<Number>;
    private var _speed as Array<Float> = new [CAP] as Array<Float>;
    private var _accHr as Number = 0;
    private var _accHrN as Number = 0;
    private var _accSpeed as Float = 0.0;
    private var _ticks as Number = 0;

    // Einmal pro Sekunde: Puls (null/0 = kein Wert) und Geschwindigkeit in m/s.
    function add(hr as Number?, speed as Float) as Void {
        if (hr != null && hr > 0) {
            _accHr += hr;
            _accHrN += 1;
        }
        _accSpeed += speed < 0 || speed != speed ? 0.0 : speed;
        _ticks += 1;
        if (_ticks < seconds) {
            return;
        }
        _hr[count] = _accHrN > 0 ? _accHr / _accHrN : 0;
        _speed[count] = _accSpeed / _ticks;
        count += 1;
        _accHr = 0;
        _accHrN = 0;
        _accSpeed = 0.0;
        _ticks = 0;
        if (count >= CAP) {
            compress();
        }
    }

    // Puls des Punktes i (0 = kein Wert)
    function hr(i as Number) as Number {
        return _hr[i];
    }

    // Geschwindigkeit des Punktes i in m/s (0 = Stillstand)
    function speed(i as Number) as Float {
        return _speed[i];
    }

    // Je zwei Punkte → einer. Punkte ohne Wert zählen nicht in den Mittelwert.
    private function compress() as Void {
        var n = count / 2;
        for (var i = 0; i < n; i++) {
            var a = _hr[2 * i];
            var b = _hr[2 * i + 1];
            _hr[i] = a == 0 ? b : (b == 0 ? a : (a + b) / 2);
            _speed[i] = (_speed[2 * i] + _speed[2 * i + 1]) / 2.0;
        }
        count = n;
        seconds *= 2;
    }
}
