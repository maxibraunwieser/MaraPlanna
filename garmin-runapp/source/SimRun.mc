// Lauf-Simulation für den Simulator (nur Demo-Build, Demo.SIM): ein Läufer, der die heutige Einheit Schritt für Schritt läuft.
// Der Simulator selbst liefert ohne GPX-Datei keine Bewegung, und mit einer GPX-Datei passt das Tempo nicht zu den Schritten.
//
// Modell je Sekunde (eine Sekunde Lauf je Takt, der Takt läuft 4× schneller als die Uhrzeit):
//   echtes Tempo   die Mitte des Zielbereichs des Schritts (Trabpause ohne Ziel: 6:30), beim Wechsel 3 s Beschleunigung,
//                  dazu ±1,5 % Schwankung
//   Strecke        Summe des echten Tempos plus GPS-Rauschen (±0,4 m je Sekunde)
//   Uhr-Tempo      wie Activity.Info.currentSpeed auf der echten Uhr: schon von der Uhr geglättet, folgt dem echten Tempo mit
//                  einer Zeitkonstante von 6 s (nach 6 s 63 %, nach 12 s 86 % des Wechsels). Das ist die Verzögerung, die am
//                  12.11. die Trabpause noch 20 s ins Intervall getragen hat.
// Jede Sekunde der ersten 25 eines Schritts (danach alle 10 s) steht in der Konsole: echtes Tempo, Uhr-Tempo, angezeigte Pace.

import Toybox.Activity;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

(:demo)
class SimRun {
    private const LAG_S = 6.0;
    private const RAMP_S = 3;
    private const JOG_PACE = 390.0;

    var ms as Number = 0;
    var dist as Float = 0.0;
    private var _true as Float = 0.0;
    private var _watch as Float = 0.0;
    private var _from as Float = 0.0;
    private var _stepIndex as Number = -1;
    private var _stepSec as Number = 0;
    private var _hr as Number = 120;
    private var _hrSum as Number = 0;
    private var _seed as Number = 7;

    // Gleichmäßiges Pseudo-Rauschen in -1..1 (wiederholbar: jeder Durchlauf gibt dieselben Zahlen)
    private function noise() as Float {
        _seed = (_seed * 1103515245 + 12345) & 0x7FFFFFFF;
        return (_seed % 2001) / 1000.0 - 1.0;
    }

    // Tempo (m/s), das der Läufer im Schritt laufen will
    private function wanted(wk as Workout?) as Float {
        if (wk == null || (wk as Workout).finished) {
            return 1000.0 / JOG_PACE;
        }
        var w = wk as Workout;
        var t = w.stepTarget(w.index);
        var pace = t == null ? JOG_PACE : (t[0] + t[1]) / 2.0;
        return 1000.0 / pace;
    }

    // Eine Sekunde weiterlaufen.
    function step(c as RecordingController) as Void {
        var wk = c.workout;
        var idx = wk == null ? -1 : ((wk as Workout).finished ? 999 : (wk as Workout).index);
        if (idx != _stepIndex) {
            _stepIndex = idx;
            _stepSec = 0;
            _from = _true;
        }
        _stepSec += 1;
        var target = wanted(wk);
        var v = _stepSec <= RAMP_S && _from > 0.0 ? _from + (target - _from) * _stepSec / RAMP_S : target;
        _true = v * (1.0 + noise() * 0.015);
        _watch += (_true - _watch) * (1.0 - Math.pow(Math.E, -1.0 / LAG_S).toFloat());
        _watch = _watch < 0.0 ? 0.0 : _watch;
        var d = _true + noise() * 0.4;
        dist += d < 0.0 ? 0.0 : d;
        ms += 1000;
        // Puls folgt grob dem Tempo
        var hrGoal = 100 + (_true * 18).toNumber();
        _hr += (hrGoal - _hr) / 5;
        _hrSum += _hr;
    }

    // Wie Activity.Info, mit den Werten der Simulation
    function info() as Activity.Info {
        var i = new Activity.Info();
        i.timerTime = ms;
        i.elapsedTime = ms;
        i.elapsedDistance = dist;
        i.currentSpeed = _watch;
        i.currentHeartRate = _hr;
        i.averageHeartRate = ms > 0 ? _hrSum / (ms / 1000) : _hr;
        i.maxHeartRate = 180;
        return i;
    }

    // Konsolenzeile nach der Glättung: echtes Tempo, Uhr-Tempo, was die App anzeigt
    function log(c as RecordingController, wk as Workout?) as Void {
        if (_stepSec > 25 && _stepSec % 10 != 0) {
            return;
        }
        var name = wk == null ? "Lauf" : ((wk as Workout).finished ? "fertig" : (wk as Workout).name((wk as Workout).current()));
        System.println("SIM " + Pace.time(ms) + "  " + name + " +" + _stepSec + "s  echt " + Pace.format(1000.0 / _true, false)
            + "  Uhr-Tempo " + Pace.format(_watch > 0.5 ? 1000.0 / _watch : null, false) + "  ANZEIGE " + Pace.format(c.pace, false)
            + "  Runde " + c.laps);
    }
}
