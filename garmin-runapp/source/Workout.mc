// Die heutige MaraPlanna-Einheit Schritt für Schritt: jeder Schritt hat eine
// Länge (Meter "d" oder Sekunden "s") und optional einen Zielbereich ("lo"/"hi").
// Reine Logik – bekommt Zeit und Strecke vom Controller, damit sie testbar bleibt.

import Toybox.Lang;

class Workout {
    // Pace für Schritte ohne Zielbereich (z. B. Trabpause), wenn keine Zonen bekannt sind.
    private const FALLBACK_PACE = 360.0;
    // Langsamer als 2,5 km/h läuft niemand: Restzeit eines Strecken-Schritts lässt sich dann nicht schätzen.
    private const MIN_SPEED = 0.7;

    var title as String;
    var zone as Number;
    var index as Number = 0;
    var finished as Boolean = false;
    private var _steps as Array<Dictionary>;
    private var _zones as PaceZones? = null;
    private var _startMs as Number = 0;
    private var _startDist as Float = 0.0;
    // Dauer und Strecke der abgeschlossenen Schritte (für die Intervall-Seiten)
    private var _doneMs as Array<Number>;
    private var _doneM as Array<Float>;
    // Summe und Anzahl der Pulswerte je Schritt (Ø-Puls pro Intervall)
    private var _hrSum as Array<Number>;
    private var _hrCount as Array<Number>;

    function initialize(title as String, zone as Number, steps as Array<Dictionary>) {
        self.title = title;
        self.zone = zone;
        _steps = steps;
        _doneMs = new [steps.size()] as Array<Number>;
        _doneM = new [steps.size()] as Array<Float>;
        _hrSum = new [steps.size()] as Array<Number>;
        _hrCount = new [steps.size()] as Array<Number>;
        for (var i = 0; i < steps.size(); i++) {
            _doneMs[i] = 0;
            _doneM[i] = 0.0;
            _hrSum[i] = 0;
            _hrCount[i] = 0;
        }
    }

    // Aus den MaraPlanna-Daten; null, wenn keine (brauchbare) Einheit dabei ist.
    static function fromFeed(feed as Dictionary?) as Workout? {
        if (feed == null) {
            return null;
        }
        var w = feed.get("workout");
        if (!(w instanceof Dictionary)) {
            return null;
        }
        var steps = w.get("steps");
        var title = w.get("title");
        var zone = Pace.toNum(w.get("z") as Object?);
        if (!(steps instanceof Array) || steps.size() == 0 || !(title instanceof String)) {
            return null;
        }
        return new Workout(title, zone == null ? 0 : zone, steps as Array<Dictionary>);
    }

    // Zonen für die geplante Zeit von Schritten ohne eigenen Zielbereich.
    function bindZones(zones as PaceZones) as Void {
        _zones = zones;
    }

    function size() as Number {
        return _steps.size();
    }

    function current() as Dictionary? {
        return finished ? null : _steps[index];
    }

    function next() as Dictionary? {
        return finished || index + 1 >= _steps.size() ? null : _steps[index + 1];
    }

    function step(i as Number) as Dictionary {
        return _steps[i];
    }

    function name(step as Dictionary?) as String {
        if (step == null) {
            return "";
        }
        var n = step.get("n");
        return n instanceof String ? n : "";
    }

    // Zielbereich eines Schritts (null = nach Gefühl, z. B. Trabpause).
    function stepTarget(i as Number) as Array<Number>? {
        var s = _steps[i];
        var lo = Pace.toNum(s.get("lo") as Object?);
        var hi = Pace.toNum(s.get("hi") as Object?);
        return lo == null || hi == null ? null : [lo, hi] as Array<Number>;
    }

    // Zielbereich des aktuellen Schritts.
    function target() as Array<Number>? {
        return finished ? null : stepTarget(index);
    }

    // Zonen-Nummer des aktuellen Schritts für die FIT-Datei.
    function stepZone() as Number {
        var s = current();
        var z = s == null ? null : Pace.toNum(s.get("z") as Object?);
        return z == null ? zone : z;
    }

    // "Aktive" Schritte sind die Belastungen (Intervalle, Dauerlauf), nicht Ein-/Auslaufen und Pausen.
    function isActive(i as Number) as Boolean {
        return "a".equals(_steps[i].get("t") as Object?);
    }

    function activeCount() as Number {
        var n = 0;
        for (var i = 0; i < _steps.size(); i++) {
            n += isActive(i) ? 1 : 0;
        }
        return n;
    }

    // Noch offene Meter bzw. Sekunden des aktuellen Schritts: [Wert, true = Meter].
    function remaining(timerMs as Number, dist as Float) as Array? {
        var s = current();
        if (s == null) {
            return null;
        }
        var d = Pace.toNum(s.get("d") as Object?);
        if (d != null) {
            var rest = d - (dist - _startDist);
            if (rest != rest) {
                return null; // NaN: Schritt nicht weiterschalten
            }
            var left = rest.toNumber();
            return [left < 0 ? 0 : left, true];
        }
        var sec = Pace.toNum(s.get("s") as Object?);
        if (sec != null) {
            var left = sec - (timerMs - _startMs) / 1000;
            return [left < 0 ? 0 : left, false];
        }
        return null;
    }

    // Geschätzte Sekunden bis zum Ende des aktuellen Schritts für den Countdown; null beim letzten Schritt (danach
    // kommt kein Wechsel mehr) und wenn sie sich nicht schätzen lassen. Zeit-Schritte sind exakt, bei Strecken-Schritten
    // rechnet die Restdistanz mit der Geschwindigkeit (m/s); unter MIN_SPEED (Stehen, Gehen) gibt es keine Schätzung.
    function secondsLeft(timerMs as Number, dist as Float, speed as Float?) as Float? {
        if (next() == null) {
            return null;
        }
        var left = remaining(timerMs, dist);
        if (left == null) {
            return null;
        }
        var value = (left[0] as Numeric).toFloat();
        if (!(left[1] as Boolean)) {
            return value;
        }
        return speed == null || speed != speed || speed < MIN_SPEED ? null : value / speed;
    }

    // Anteil des aktuellen Schritts, der geschafft ist (0..1).
    function fraction(timerMs as Number, dist as Float) as Float {
        if (finished) {
            return 1.0;
        }
        var total = stepLength(index);
        var left = remaining(timerMs, dist);
        if (total <= 0 || left == null) {
            return 0.0;
        }
        var f = 1.0 - (left[0] as Numeric).toFloat() / total;
        return f < 0.0 ? 0.0 : (f > 1.0 ? 1.0 : f);
    }

    // Länge des Schritts i in Metern bzw. Sekunden (je nach Schritt).
    function stepLength(i as Number) as Float {
        var s = _steps[i];
        var d = Pace.toNum(s.get("d") as Object?);
        if (d != null) {
            return d.toFloat();
        }
        var sec = Pace.toNum(s.get("s") as Object?);
        return sec == null ? 0.0 : sec.toFloat();
    }

    // Sekunden seit Beginn des aktuellen Schritts.
    function stepSeconds(timerMs as Number) as Number {
        return (timerMs - _startMs) / 1000;
    }

    // Pace des Schritts i in s/km: abgeschlossen = gelaufen, aktuell = bisher, sonst null.
    function stepPace(i as Number, timerMs as Number, dist as Float) as Float? {
        if (i < index || (finished && i == index)) {
            return Pace.fromDelta(_doneMs[i], _doneM[i]);
        }
        if (i == index) {
            return Pace.fromDelta(timerMs - _startMs, dist - _startDist);
        }
        return null;
    }

    // Einmal pro Sekunde: Puls (null/0 = kein Wert) zum laufenden Schritt zählen.
    function addHeartRate(hr as Number?) as Void {
        if (finished || hr == null || hr <= 0) {
            return;
        }
        _hrSum[index] += hr;
        _hrCount[index] += 1;
    }

    // Ø-Puls des Schritts i (0 = kein Wert)
    function stepHeartRate(i as Number) as Number {
        return _hrCount[i] > 0 ? _hrSum[i] / _hrCount[i] : 0;
    }

    // Das zuletzt abgeschlossene Intervall (aktiver Schritt); -1, wenn noch keins fertig ist.
    function lastActiveDone() as Number {
        for (var i = _steps.size() - 1; i >= 0; i--) {
            if (isActive(i) && isDone(i)) {
                return i;
            }
        }
        return -1;
    }

    function isDone(i as Number) as Boolean {
        return i < index || (finished && i == index);
    }

    // Name des Schritts i für die Anzeige. Eine Trabpause gehört zur Runde des Intervalls davor und trägt dessen Nummer
    // ("Trabpause 2/3"), damit man sieht, dass Intervall 2 und diese Pause eine Runde sind.
    function label(i as Number) as String {
        var n = name(_steps[i]);
        var all = activeCount();
        if (isRecovery(i) && all > 1 && n.find("/") == null) {
            return n + " " + activeNumber(i) + "/" + all;
        }
        return n;
    }

    // Trabpause (zwischen zwei Intervallen)
    function isRecovery(i as Number) as Boolean {
        return "r".equals(_steps[i].get("t") as Object?);
    }

    // Beginnt mit dem aktuellen Schritt eine neue Runde (Zählung der App)? Eine Runde ist ein Intervall samt der Trabpause danach:
    // Der Wechsel in die Trabpause beginnt keine, erst das nächste Intervall. Einlaufen, Auslaufen und Abschnitte ohne Pause sind
    // je eine Runde. Die Runden der Aufzeichnung (FIT, Garmins Ansage) bleiben je Schritt, siehe RecordingController.stepDone.
    function startsRound() as Boolean {
        return finished || !isRecovery(index);
    }

    // Gelaufene Strecke (m) und Zeit (ms) des abgeschlossenen Schritts i
    function doneMeters(i as Number) as Float {
        return _doneM[i];
    }

    function doneMs(i as Number) as Number {
        return _doneMs[i];
    }

    // Ø-Pace aller abgeschlossenen schnellen Teile bis einschließlich Schritt i (null ohne Strecke)
    function activeAveragePace(upTo as Number) as Float? {
        var ms = 0;
        var m = 0.0;
        for (var i = 0; i <= upTo && i < _steps.size(); i++) {
            if (isActive(i) && isDone(i)) {
                ms += _doneMs[i];
                m += _doneM[i];
            }
        }
        return Pace.fromDelta(ms, m);
    }

    // Wievieltes schnelles Teil ist Schritt i (1 = erstes)?
    function activeNumber(i as Number) as Number {
        var n = 0;
        for (var k = 0; k <= i && k < _steps.size(); k++) {
            n += isActive(k) ? 1 : 0;
        }
        return n;
    }

    // --- Plan: geplante Zeit für die Prognose ----------------------------------

    // Mittlere Pace des Schritts i: Zielbereich, sonst Zone des Schritts, sonst Standardwert.
    function midPace(i as Number) as Float {
        var t = stepTarget(i);
        if (t != null) {
            return ((t[0] + t[1]) / 2.0).toFloat();
        }
        var z = Pace.toNum(_steps[i].get("z") as Object?);
        if (_zones != null && z != null) {
            var r = (_zones as PaceZones).range(z);
            if (r != null) {
                return ((r[0] + r[1]) / 2.0).toFloat();
            }
        }
        return FALLBACK_PACE;
    }

    // Geplante Sekunden des Schritts i.
    function plannedSeconds(i as Number) as Float {
        var s = _steps[i];
        var sec = Pace.toNum(s.get("s") as Object?);
        if (sec != null) {
            return sec.toFloat();
        }
        return stepLength(i) / 1000.0 * midPace(i);
    }

    // Geplante Strecke in Metern (Zeitschritte über ihre Pace umgerechnet).
    function plannedMeters() as Float {
        var sum = 0.0;
        for (var i = 0; i < _steps.size(); i++) {
            var d = Pace.toNum(_steps[i].get("d") as Object?);
            sum += d != null ? d.toFloat() : plannedSeconds(i) / midPace(i) * 1000.0;
        }
        return sum;
    }

    function plannedTotal() as Float {
        var sum = 0.0;
        for (var i = 0; i < _steps.size(); i++) {
            sum += plannedSeconds(i);
        }
        return sum;
    }

    // Geplante Sekunden des bisher Gelaufenen (abgeschlossene Schritte + Anteil des aktuellen).
    function plannedDone(timerMs as Number, dist as Float) as Float {
        var sum = 0.0;
        for (var i = 0; i < index; i++) {
            sum += plannedSeconds(i);
        }
        if (finished) {
            return sum + plannedSeconds(index);
        }
        return sum + plannedSeconds(index) * fraction(timerMs, dist);
    }

    // Prüft, ob der Schritt erledigt ist; true, wenn zum nächsten gewechselt wurde.
    function update(timerMs as Number, dist as Float) as Boolean {
        var left = remaining(timerMs, dist);
        if (left == null || (left[0] as Numeric) > 0) {
            return false;
        }
        advance(timerMs, dist);
        return true;
    }

    // Nächster Schritt (auch per Runden-Taste); nach dem letzten ist die Einheit fertig.
    function advance(timerMs as Number, dist as Float) as Void {
        if (finished) {
            return;
        }
        var m = dist - _startDist;
        _doneMs[index] = timerMs - _startMs;
        _doneM[index] = m != m || m < 0 ? 0.0 : m;
        index += 1;
        _startMs = timerMs;
        _startDist = dist;
        if (index >= _steps.size()) {
            finished = true;
            index = _steps.size() - 1;
        }
    }
}
