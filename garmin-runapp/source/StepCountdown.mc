// Countdown vor jedem Schrittwechsel einer Einheit: in den letzten SECONDS Sekunden ein kurzer Impuls pro Sekunde
// (5, 4, 3, 2, 1), dann kommt der Wechsel selbst. Gilt für jeden Übergang: Einlaufen → Intervall, Intervall → Trabpause,
// Trabpause → Intervall und auch Intervall → Intervall (z. B. 5 km in Pace A, dann 5 km in Pace B).
// Reine Logik ohne Zugriff auf die Uhr, damit sie testbar bleibt: der Controller fragt einmal pro Sekunde.
//
// Bei Zeit-Schritten sind die Restsekunden exakt. Bei Strecken-Schritten sind sie geschätzt (Restmeter / Geschwindigkeit)
// und schwanken um einige Zehntelsekunden: deshalb löst die Schätzung nur den Beginn aus (sie kommt in die letzten
// SECONDS Sekunden); danach schlägt der Takt gleichmäßig weiter, ein Impuls je Sekunde, statt bei jedem Schwanken einen
// Wert auszulassen oder doppelt zu zählen.

import Toybox.Lang;

class StepCountdown {
    // Sekunden vor dem Wechsel, in denen gezählt wird
    static const SECONDS = 5;

    // Impulse seit dem Beginn des Countdowns (0 = noch nicht begonnen)
    private var _count as Number = 0;

    // Neuer Schritt (oder neue Runde): der Countdown beginnt von vorn.
    function reset() as Void {
        _count = 0;
    }

    // Kommt jetzt ein Impuls? left = geschätzte Sekunden bis zum Wechsel (null = unbekannt), inStep = Sekunden seit
    // Schrittbeginn. Der Countdown beginnt, sobald der Wechsel höchstens SECONDS Sekunden entfernt ist, und gibt dann je
    // Aufruf einen Impuls, insgesamt höchstens SECONDS. Rückt der Wechsel laut Schätzung wieder weit weg (man wird
    // langsamer oder bleibt stehen), beginnt er erst bei der nächsten Annäherung neu. Ein Schritt, der kürzer als der
    // Countdown ist, bekommt nur den Teil, der nach SECONDS Sekunden im Schritt noch übrig ist.
    function due(left as Float?, inStep as Number) as Boolean {
        if (left == null || left != left || inStep < SECONDS) {
            return false;
        }
        var n = left.toNumber();
        if (n.toFloat() < left) {
            n += 1;
        }
        if (_count > 0 && n > SECONDS + 1) {
            _count = 0;
            return false;
        }
        if (n < 1 || (_count == 0 && n > SECONDS) || _count >= SECONDS) {
            return false;
        }
        _count += 1;
        return true;
    }
}
