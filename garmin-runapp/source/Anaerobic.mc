// Eigene Schätzung der anaeroben Belastung eines Laufs auf der Skala 0 bis 5 (wie der Trainingseffekt).
// KEIN Garmin-Wert: Connect IQ gibt Apps den anaeroben Trainingseffekt der Uhr nicht frei, und Garmins
// Berechnung ist nicht öffentlich. Das hier ist ein einfaches Modell aus dem, was die App weiß:
// Jede Sekunde schneller als deine Schwellenpace zählt, gewichtet nach dem Tempo:
//   langsamer als Schwellenpace    0   (Dauerlauf, Tempodauerlauf, Wettkampf an der Schwelle)
//   Schwellenpace → Intervallpace  0 → 1
//   Intervallpace → Wiederholungs- 1 → 2
//   schneller als Wiederholungs-   2 → 3 (bei 10 % schneller), darüber gedeckelt
// Die Summe (gewichtete Sekunden) wird mit einer Sättigungskurve auf 0 bis 5 abgebildet. Die Kurve ist
// nicht an Garmins Werten geeicht, sie ist eine begründete Annahme: Strides ergeben etwa 1, 3 x 1000 m
// an der Intervallpace etwa 2,3, ein harter 400-m-Lauf (10 x) etwa 4.

import Toybox.Lang;
import Toybox.Math;

class AnaerobicLoad {
    // Bei dieser Last (gewichtete Sekunden) erreicht die Schätzung 63 % von 5.
    private const SCALE = 1200.0;
    // Paces deutlich schneller als die Wiederholungspace sind GPS-Ausreißer und zählen nicht.
    private const SPIKE = 0.6;

    // Summe der gewichteten Sekunden
    var load as Float = 0.0;

    private var _t as Float = 0.0;
    private var _i as Float = 0.0;
    private var _r as Float = 0.0;
    private var _known as Boolean = false;

    // Schwellen-, Intervall- und Wiederholungspace in s/km; fehlt eine oder passt die Reihenfolge nicht,
    // gibt es keine Schätzung.
    function initialize(threshold as Float?, interval as Float?, repetition as Float?) {
        if (threshold != null && interval != null && repetition != null) {
            var t = threshold as Float;
            var i = interval as Float;
            var r = repetition as Float;
            if (t > i && i > r && r > 0) {
                _t = t;
                _i = i;
                _r = r;
                _known = true;
            }
        }
    }

    function known() as Boolean {
        return _known;
    }

    // Gewicht einer Pace (s/km): 0 bis 3, siehe oben.
    function weight(pace as Float) as Float {
        if (!_known || pace >= _t || pace < _r * SPIKE) {
            return 0.0;
        }
        if (pace >= _i) {
            return (_t - pace) / (_t - _i);
        }
        if (pace >= _r) {
            return 1.0 + (_i - pace) / (_i - _r);
        }
        var over = (_r - pace) / (_r * 0.1);
        return 2.0 + (over > 1.0 ? 1.0 : over);
    }

    // Einmal pro Sekunde während der Aufzeichnung (die geglättete Pace; null = Stillstand).
    function add(pace as Float?) as Void {
        if (pace != null) {
            load += weight(pace as Float);
        }
    }

    // 0.0 bis 5.0; null ohne Schätzung (Paces unbekannt).
    function score() as Float? {
        if (!_known) {
            return null;
        }
        return (5.0 * (1.0 - Math.pow(Math.E, -load / SCALE))).toFloat();
    }
}
