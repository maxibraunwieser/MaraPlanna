// Erkennt Satzbeginn und Satzende und zählt Wiederholungen aus der Beschleunigung (milli-g, x/y/z).
// Reine Logik ohne Zugriff auf die Uhr, damit sie testbar bleibt (Tests.mc).
//
// Verfahren, ein Messpunkt nach dem anderen (keine Objekte pro Messpunkt):
//   1. Ein Tiefpass (etwa 3 Hz) je Achse glättet Zittern.
//   2. Ein langsamer Mittelwert (die Lage des Handgelenks) wird abgezogen; übrig bleibt die Bewegung d.
//      In Ruhe folgt der Mittelwert schnell (1 s), im Satz langsam (4 s), damit er die Wiederholungen nicht mitmacht.
//   3. Energie = Summe |d| der drei Achsen, geglättet (etwa 0,7 s). Über ON_MG beginnt ein Satz. Unter OFF_MG
//      für QUIET_S Sekunden endet er.
//   4. Wiederholungen: Je Achse wechselt d zwischen +thr und -thr. thr folgt der Amplitude (30 %), mindestens
//      MIN_THR. Zwei Wechsel sind eine Wiederholung. Gezählt wird die Achse mit der meisten Bewegung.
//      Gezählt wird auch kurz vor dem Satzbeginn mit, damit die erste Bewegung nicht fehlt; nach einer
//      Sekunde Ruhe außerhalb eines Satzes beginnt die Zählung neu.
//   5. Merkmale des Satzes (features()), mit denen die Übung erkannt wird (Recognizer.mc): Sekunden je Wiederholung,
//      Größe der Bewegung, Anteil der Bewegung in Richtung der Schwerkraft und die Richtung der Schwerkraft am Handgelenk.
//      Sie hängen nicht davon ab, wie die Uhr am Arm sitzt, nur davon, welche Bahn die Hand nimmt.
// Alle Schwellen sind Schätzwerte und werden mit echten Daten abgestimmt (diag() liefert die Messwerte dazu).

import Toybox.Lang;
import Toybox.Math;

(:strength)
class RepCounter {
    private const ON_MG = 70.0;
    private const OFF_MG = 35.0;
    private const MIN_THR = 40.0;
    // So lange (Sekunden) muss es ruhig sein, bis ein Satz zu Ende ist
    private const QUIET_S = 2.0;
    // Zwei Wechsel auf derselben Achse liegen mindestens so weit auseinander (Sekunden)
    private const MIN_FLIP_S = 0.3;

    // Läuft gerade ein Satz?
    var active as Boolean = false;
    // Größte Energie im Satz (milli-g), nur zur Abstimmung der Schwellen
    var peak as Float = 0.0;
    // Ein Satz ist zu Ende. Ergebnis in lastReps, lastSeconds und lastDiag, bis ackSet() es quittiert
    // (die Zählung selbst beginnt nach einer Sekunde Ruhe neu, das Ergebnis bleibt erhalten).
    var finished as Boolean = false;
    var lastReps as Number = 0;
    var lastSeconds as Number = 0;
    var lastDiag as Array<Number> = [0, 0, 0, 0, 0, 0] as Array<Number>;
    var lastFeat as Array<Number> = [0, 0, 0, 100, 100, 100] as Array<Number>;

    private var _fs as Float = 25.0;
    private var _lp as Float = 0.3;
    private var _slow as Float = 0.01;
    private var _idle as Float = 0.04;
    private var _smoothE as Float = 0.05;
    private var _decay as Float = 0.993;
    private var _minFlip as Number = 8;
    private var _quietMax as Number = 62;
    private var _idleMax as Number = 25;

    private var _primed as Boolean = false;
    private var _s as Array<Float> = [0.0, 0.0, 0.0] as Array<Float>;
    private var _m as Array<Float> = [0.0, 0.0, 0.0] as Array<Float>;
    private var _amp as Array<Float> = [0.0, 0.0, 0.0] as Array<Float>;
    private var _load as Array<Float> = [0.0, 0.0, 0.0] as Array<Float>;
    private var _pol as Array<Number> = [0, 0, 0] as Array<Number>;
    private var _flips as Array<Number> = [0, 0, 0] as Array<Number>;
    private var _since as Array<Number> = [0, 0, 0] as Array<Number>;
    // Merkmale: Messpunkte, Summe der geglätteten Beschleunigung (Lage), Bewegung entlang der Schwerkraft und quer dazu
    private var _n as Number = 0;
    private var _gs as Array<Float> = [0.0, 0.0, 0.0] as Array<Float>;
    private var _vSum as Float = 0.0;
    private var _pSum as Float = 0.0;
    private var _energy as Float = 0.0;
    private var _quiet as Number = 0;
    private var _activeN as Number = 0;

    // fs: Messpunkte pro Sekunde
    function initialize(fs as Number) {
        _fs = fs < 5 ? 5.0 : fs.toFloat();
        _lp = 1.0 / (1.0 + 0.053 * _fs);
        _slow = 1.0 / (1.0 + 4.0 * _fs);
        _idle = 1.0 / (1.0 + 1.0 * _fs);
        _smoothE = 1.0 / (1.0 + 0.7 * _fs);
        _decay = 1.0 - 1.0 / (6.0 * _fs);
        _minFlip = (MIN_FLIP_S * _fs).toNumber();
        _quietMax = (QUIET_S * _fs).toNumber();
        _idleMax = _fs.toNumber();
    }

    // Eine Lieferung der Uhr (mehrere Messpunkte je Achse).
    function addBatch(x as Array<Number>, y as Array<Number>, z as Array<Number>) as Void {
        var n = x.size();
        if (y.size() < n) {
            n = y.size();
        }
        if (z.size() < n) {
            n = z.size();
        }
        for (var i = 0; i < n; i++) {
            add(x[i], y[i], z[i]);
        }
    }

    function add(x as Numeric, y as Numeric, z as Numeric) as Void {
        var fx = x.toFloat();
        var fy = y.toFloat();
        var fz = z.toFloat();
        if (!_primed) {
            _primed = true;
            _s = [fx, fy, fz] as Array<Float>;
            _m = [fx, fy, fz] as Array<Float>;
        }
        var d0 = axis(0, fx);
        var d1 = axis(1, fy);
        var d2 = axis(2, fz);
        var e = d0.abs() + d1.abs() + d2.abs();
        _energy += _smoothE * (e - _energy);
        feature(d0, d1, d2);
        flip(0, d0);
        flip(1, d1);
        flip(2, d2);

        if (active) {
            _activeN += 1;
            if (_energy > peak) {
                peak = _energy;
            }
            _quiet = _energy < OFF_MG ? _quiet + 1 : 0;
            if (_quiet >= _quietMax) {
                active = false;
                _quiet = 0;
                finished = true;
                lastReps = reps();
                lastSeconds = (activeSeconds() - QUIET_S).toNumber();
                lastDiag = diag();
                lastFeat = featuresAt(QUIET_S);
            }
        } else if (_energy > ON_MG) {
            active = true;
            _quiet = 0;
            _activeN = 0;
            peak = _energy;
        } else {
            // Ruhe außerhalb eines Satzes: nach einer Sekunde beginnt die Zählung neu.
            _quiet = _energy < OFF_MG ? _quiet + 1 : 0;
            if (_quiet >= _idleMax) {
                clearCounts();
            }
        }
    }

    // Tiefpass und Abzug des langsamen Mittelwerts; gibt die Bewegung d zurück.
    private function axis(k as Number, v as Float) as Float {
        _s[k] += _lp * (v - _s[k]);
        _m[k] += (active ? _slow : _idle) * (_s[k] - _m[k]);
        var d = _s[k] - _m[k];
        var a = d.abs();
        _amp[k] = a > _amp[k] ? a : _amp[k] * _decay;
        _load[k] += a;
        return d;
    }

    private function flip(k as Number, d as Float) as Void {
        var thr = 0.3 * _amp[k];
        if (thr < MIN_THR) {
            thr = MIN_THR;
        }
        _since[k] += 1;
        var p = d > thr ? 1 : (d < -thr ? -1 : 0);
        if (p != 0 && p != _pol[k]) {
            if (_pol[k] == 0) {
                _pol[k] = p;
                _since[k] = 0;
            } else if (_since[k] >= _minFlip) {
                _pol[k] = p;
                _flips[k] += 1;
                _since[k] = 0;
            }
        }
    }

    private function clearCounts() as Void {
        for (var k = 0; k < 3; k++) {
            _flips[k] = 0;
            _pol[k] = 0;
            _load[k] = 0.0;
            _amp[k] = 0.0;
            _gs[k] = 0.0;
        }
        _n = 0;
        _vSum = 0.0;
        _pSum = 0.0;
    }

    // Die Bewegung d (dieser Messpunkt) zerlegen: Anteil entlang der Schwerkraft (die Richtung der langsamen Mittelung) und quer dazu.
    private function feature(d0 as Float, d1 as Float, d2 as Float) as Void {
        _n += 1;
        for (var k = 0; k < 3; k++) {
            _gs[k] += _s[k];
        }
        var gm = Math.sqrt(_m[0] * _m[0] + _m[1] * _m[1] + _m[2] * _m[2]).toFloat();
        if (gm < 100.0) {
            return;
        }
        var dv = (d0 * _m[0] + d1 * _m[1] + d2 * _m[2]) / gm;
        var rest = d0 * d0 + d1 * d1 + d2 * d2 - dv * dv;
        _vSum += dv.abs();
        _pSum += rest > 0.0 ? Math.sqrt(rest).toFloat() : 0.0;
    }

    // Die Achse mit der meisten Bewegung
    private function busiest() as Number {
        var best = 0;
        for (var k = 1; k < 3; k++) {
            if (_load[k] > _load[best]) {
                best = k;
            }
        }
        return best;
    }

    // Wiederholungen des laufenden (oder gerade beendeten) Satzes
    function reps() as Number {
        var f = _flips[busiest()];
        return f <= 0 ? 0 : (f + 1) / 2;
    }

    // Sekunden seit Satzbeginn
    function activeSeconds() as Float {
        return _activeN / _fs;
    }

    // Ergebnis des Satzes abgeholt.
    function ackSet() as Void {
        finished = false;
    }

    // Satz verwerfen oder von Hand beenden: alles auf Anfang (die Filter bleiben).
    function nextSet() as Void {
        clearCounts();
        peak = 0.0;
        _activeN = 0;
        _quiet = 0;
        active = false;
        finished = false;
    }

    // Merkmale des (laufenden oder gerade beendeten) Satzes, alle ganzzahlig:
    //   0 Zehntelsekunden je Wiederholung   1 mittlere Bewegung der Hauptachse (milli-g)   2 Anteil entlang der Schwerkraft (%)
    //   3 bis 5 Richtung der Schwerkraft am Handgelenk (je Achse 0 bis 200, 100 = waagerecht)
    function features() as Array<Number> {
        return featuresAt(_quiet / _fs);
    }

    // Wie features(); quietS = die Sekunden Ruhe am Ende, die nicht zum Satz gehören
    private function featuresAt(quietS as Float) as Array<Number> {
        var r = reps();
        if (r < 1 || _n < 1) {
            return [0, 0, 0, 100, 100, 100] as Array<Number>;
        }
        var b = busiest();
        var gm = Math.sqrt(_gs[0] * _gs[0] + _gs[1] * _gs[1] + _gs[2] * _gs[2]).toFloat();
        if (gm < 1.0) {
            gm = 1.0;
        }
        var tot = _vSum + _pSum;
        return [
            (10.0 * (activeSeconds() - quietS) / r + 0.5).toNumber(),
            (_load[b] / _n + 0.5).toNumber(),
            tot > 0.0 ? (100.0 * _vSum / tot + 0.5).toNumber() : 0,
            (100.0 + 100.0 * _gs[0] / gm + 0.5).toNumber(),
            (100.0 + 100.0 * _gs[1] / gm + 0.5).toNumber(),
            (100.0 + 100.0 * _gs[2] / gm + 0.5).toNumber()
        ] as Array<Number>;
    }

    // Messwerte zur Abstimmung: Wechsel je Achse, gewählte Achse, größte Energie, Satzdauer in Sekunden
    function diag() as Array<Number> {
        return [_flips[0], _flips[1], _flips[2], busiest(), peak.toNumber(), activeSeconds().toNumber()] as Array<Number>;
    }
}
