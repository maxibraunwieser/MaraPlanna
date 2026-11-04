// Krafttraining aufzeichnen: Zustandsmaschine, Sensoren, Sätze, Aufzeichnung und Upload.
//
//   READY    Bereit-Bildschirm (nichts läuft), START beginnt
//   REST     zwischen den Sätzen: nächste geplante Übung und Pausenzähler
//   SET      Bewegung erkannt: Wiederholungen zählen
//   CONFIRM  Satz beendet: Übung, Wiederholungen und Gewicht bestätigen oder anpassen
//   PAUSED   Aufzeichnung angehalten (Menü)
//   DONE     gespeichert, Zusammenfassung
//
// Die Übung eines Satzes ist in dieser Version die nächste geplante (oder bei freiem Training die vorige);
// geändert wird sie auf der Bestätigungskarte. Eine Erkennung der Übung aus der Bewegung kommt dazu, sobald
// ein Modell vorhanden ist: Sie ersetzt nur die Vorbelegung in endSet().
//
// Sensoren laufen nur während des Krafttrainings (nicht beim Laufen und nicht im Menü): Beschleunigung und,
// wo die Uhr es hat, Gyroskop, ein Mal pro Sekunde geliefert. Es werden keine Töne gespielt (Vibration),
// damit Musik über Bluetooth nicht gestört wird.

import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

module Str {
    const READY = 0;
    const REST = 1;
    const SET = 2;
    const CONFIRM = 3;
    const PAUSED = 4;
    const DONE = 5;
}

(:strength)
class LoggedSet {
    var id as String;
    var name as String;
    var reps as Number;
    var kg as Float;
    // plan = die geplante Übung, pick = auf der Uhr geändert
    var src as String;
    // Sekunden seit Trainingsbeginn und Dauer des Satzes
    var t as Number;
    var dur as Number;
    var diag as Array<Number>;

    function initialize(id as String, name as String, reps as Number, kg as Float, src as String, t as Number, dur as Number, diag as Array<Number>) {
        self.id = id;
        self.name = name;
        self.reps = reps;
        self.kg = kg;
        self.src = src;
        self.t = t;
        self.dur = dur;
        self.diag = diag;
    }
}

(:strength)
class StrengthController {
    // Weniger Wiederholungen sind eine Bewegung, kein Satz
    private const MIN_REPS = 3;
    // So viele Sekunden wartet die Bestätigungskarte, bevor sie sich von selbst schließt
    private const AUTO_S = 5;
    private const MAX_RATE = 25;
    private const FIELDS = 3;

    var state as Number = Str.READY;
    var plan as StrengthPlan;
    var sets as Array<LoggedSet> = [] as Array<LoggedSet>;
    var counter as RepCounter;

    // Bestätigungskarte
    var optIdx as Number = 0;
    var cReps as Number = 0;
    var cKg as Float = 0.0;
    var editing as Boolean = false;
    // 0 Gewicht, 1 Wiederholungen, 2 Übung
    var field as Number = 0;
    var autoLeft as Number = 0;

    // Pause zwischen den Sätzen (ms auf der Systemuhr, 0 = keine)
    var restUntil as Number = 0;
    var restTotalMs as Number = 0;

    // Messwerte der Sensoren
    var hz as Number = 0;
    var calls as Number = 0;
    var samples as Number = 0;
    var gyroSamples as Number = 0;
    var maxGapMs as Number = 0;
    var gyroOn as Boolean = false;

    // 0 nichts gesendet, 1 sendet, 2 gesendet, 3 später
    var upload as Number = 0;
    // Ergebnis für die Zusammenfassung
    var totalMs as Number = 0;
    var avgHr as Number? = null;

    private var _session as ActivityRecording.Session?;
    private var _fit as StrengthFit?;
    private var _timer as Timer.Timer?;
    private var _simTimer as Timer.Timer?;
    private var _simSecond as Number = 0;
    private var _startEpoch as Number = 0;
    private var _startMs as Number = 0;
    private var _lastCallMs as Number = 0;
    private var _restAlerted as Boolean = false;
    private var _beforePause as Number = Str.REST;
    private var _skipped as Array<Number> = [] as Array<Number>;
    private var _pendingDur as Number = 0;
    private var _pendingT as Number = 0;
    private var _pendingDiag as Array<Number> = [0, 0, 0, 0, 0, 0] as Array<Number>;
    private var _guess as Number = 0;
    private var _lastOpt as Number = 0;

    function initialize(plan as StrengthPlan) {
        self.plan = plan;
        counter = new RepCounter(MAX_RATE);
        for (var i = 0; i < plan.items.size(); i++) {
            _skipped.add(0);
        }
    }

    function recording() as Boolean {
        return state == Str.REST || state == Str.SET || state == Str.CONFIRM || state == Str.PAUSED;
    }

    // ---------------------------------------------------------------- Beginn und Ende

    function begin() as Void {
        if (state != Str.READY) {
            return;
        }
        var name = WatchUi.loadResource(Rez.Strings.StrengthName) as String;
        var session = ActivityRecording.createSession({
            :name => name,
            :sport => Activity.SPORT_TRAINING,
            :subSport => Activity.SUB_SPORT_STRENGTH_TRAINING
        });
        _fit = new StrengthFit(session);
        session.start();
        _session = session;
        _startEpoch = Time.now().value();
        _startMs = System.getTimer();
        _lastCallMs = 0;
        startSensors();
        _timer = new Timer.Timer();
        (_timer as Timer.Timer).start(method(:tick), 1000, true);
        state = Str.REST;
        getApp().stopHook = method(:saveOnExit);
        Alert.vibrate(400);
        WatchUi.requestUpdate();
    }

    // Wird die App mitten im Training beendet, wird gespeichert statt verworfen.
    function saveOnExit() as Void {
        if (recording()) {
            save();
        }
    }

    function save() as Void {
        if (!recording()) {
            return;
        }
        stopSensors();
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
        // Eine offene Bestätigungskarte zählt als bestätigt.
        if (state == Str.CONFIRM) {
            commit();
        }
        totalMs = System.getTimer() - _startMs;
        var info = Activity.getActivityInfo();
        avgHr = info != null ? info.averageHeartRate : null;
        if (_session != null) {
            (_session as ActivityRecording.Session).stop();
            (_session as ActivityRecording.Session).save();
            _session = null;
        }
        state = Str.DONE;
        getApp().stopHook = null;
        Alert.vibrate(500);
        sendSets();
        WatchUi.requestUpdate();
    }

    function discard() as Void {
        stopSensors();
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
        if (_session != null) {
            (_session as ActivityRecording.Session).stop();
            (_session as ActivityRecording.Session).discard();
            _session = null;
        }
        state = Str.DONE;
        sets = [] as Array<LoggedSet>;
        getApp().stopHook = null;
    }

    // ---------------------------------------------------------------- Sensoren

    private function startSensors() as Void {
        if (Demo.active()) {
            // Simulator: Beispielbewegung statt Sensor (nur im Demo-Build vorhanden)
            hz = MAX_RATE;
            _simSecond = 0;
            _simTimer = new Timer.Timer();
            (_simTimer as Timer.Timer).start(method(:simTick), 1000, true);
            return;
        }
        var rate = Sensor.getMaxSampleRate();
        hz = rate > MAX_RATE ? MAX_RATE : (rate < 10 ? MAX_RATE : rate);
        counter = new RepCounter(hz);
        try {
            // Das Gyroskop haben nicht alle Uhren; es wird hier nur gemessen (für die spätere Erkennung der Übung).
            Sensor.registerSensorDataListener(method(:onSensor), {
                :period => 1,
                :accelerometer => { :enabled => true, :sampleRate => hz },
                :gyroscope => { :enabled => true, :sampleRate => hz }
            });
            gyroOn = true;
        } catch (ex) {
            gyroOn = false;
            Sensor.registerSensorDataListener(method(:onSensor), {
                :period => 1,
                :accelerometer => { :enabled => true, :sampleRate => hz }
            });
        }
    }

    private function stopSensors() as Void {
        if (_simTimer != null) {
            (_simTimer as Timer.Timer).stop();
            _simTimer = null;
        } else {
            Sensor.unregisterSensorDataListener();
        }
    }

    function onSensor(data as Sensor.SensorData) as Void {
        var now = System.getTimer();
        if (_lastCallMs > 0 && now - _lastCallMs > maxGapMs) {
            maxGapMs = now - _lastCallMs;
        }
        _lastCallMs = now;
        calls += 1;
        var a = data.accelerometerData;
        if (a != null && state != Str.PAUSED) {
            counter.addBatch(a.x as Array<Number>, a.y as Array<Number>, a.z as Array<Number>);
        }
        if (a != null) {
            samples += a.x.size();
        }
        var g = data.gyroscopeData;
        if (g != null) {
            gyroSamples += g.x.size();
        }
    }

    function simTick() as Void {
        var b = Demo.accelBatch(_simSecond);
        _simSecond += 1;
        if (b != null && state != Str.PAUSED) {
            counter.addBatch(b[0], b[1], b[2]);
            samples += b[0].size();
            calls += 1;
        }
    }

    // ---------------------------------------------------------------- Takt

    function tick() as Void {
        if (state == Str.REST || state == Str.SET) {
            if (counter.finished) {
                endSet();
            } else if (state == Str.REST && counter.active && counter.activeSeconds() >= 1.0) {
                state = Str.SET;
            }
        }
        if (state == Str.REST && restUntil > 0 && !_restAlerted && System.getTimer() >= restUntil) {
            _restAlerted = true;
            Alert.vibrate(300);
        }
        if (state == Str.CONFIRM && autoOn()) {
            autoLeft -= 1;
            if (autoLeft <= 0) {
                commit();
            }
        }
        WatchUi.requestUpdate();
    }

    function autoOn() as Boolean {
        return plan.auto && !editing;
    }

    // ---------------------------------------------------------------- Sätze

    // Ein Satz ist zu Ende (erkannt oder von Hand beendet): Karte zum Bestätigen.
    private function endSet() as Void {
        var reps = counter.lastReps;
        var secs = counter.lastSeconds;
        var diag = counter.lastDiag;
        counter.nextSet();
        if (reps < MIN_REPS) {
            // zu kurz für einen Satz: eine Bewegung, zurück in die Pause
            state = Str.REST;
            return;
        }
        var now = (System.getTimer() - _startMs) / 1000;
        _pendingDur = secs < 1 ? 1 : secs;
        _pendingT = now - _pendingDur - 2 < 0 ? 0 : now - _pendingDur - 2;
        _pendingDiag = diag;
        cReps = reps;
        _guess = guessIndex();
        optIdx = _guess;
        cKg = defaultKg(plan.options[optIdx]);
        editing = false;
        field = 0;
        autoLeft = AUTO_S;
        state = Str.CONFIRM;
        Alert.vibrate(150);
    }

    // Die Vorbelegung: die nächste geplante Übung; ohne Plan (oder wenn alles erledigt ist) die vorige.
    private function guessIndex() as Number {
        var n = nextPlanned();
        if (n >= 0) {
            return n;
        }
        return _lastOpt < plan.options.size() ? _lastOpt : 0;
    }

    // Index der ersten geplanten Übung mit offenen Sätzen, -1 wenn alles erledigt oder nichts geplant ist
    function nextPlanned() as Number {
        for (var i = 0; i < plan.items.size(); i++) {
            if (doneSets(i) < plan.items[i].sets) {
                return i;
            }
        }
        return -1;
    }

    function doneSets(i as Number) as Number {
        var n = _skipped[i];
        for (var k = 0; k < sets.size(); k++) {
            var s = sets[k];
            if (plan.items[i].id.length() > 0 ? plan.items[i].id.equals(s.id) : plan.items[i].name.equals(s.name)) {
                n += 1;
            }
        }
        return n;
    }

    // Gewicht der Vorbelegung: zuletzt in dieser Einheit, sonst vom letzten Mal (Plan), sonst 0.
    private function defaultKg(e as Planned) as Float {
        for (var k = sets.size() - 1; k >= 0; k--) {
            var s = sets[k];
            if (e.id.length() > 0 ? e.id.equals(s.id) : e.name.equals(s.name)) {
                return s.kg;
            }
        }
        return e.kg;
    }

    private function restSeconds(e as Planned) as Number {
        return e.rest < 15 ? 90 : e.rest;
    }

    private function commit() as Void {
        var e = plan.options[optIdx];
        var src = plan.planned() && optIdx == _guess ? "plan" : "pick";
        var s = new LoggedSet(e.id, e.name, cReps, cKg, src, _pendingT, _pendingDur, _pendingDiag);
        sets.add(s);
        _lastOpt = optIdx;
        if (_fit != null && _session != null) {
            var kg = plan.unit.equals("lb") ? cKg * 0.45359237 : cKg;
            (_fit as StrengthFit).set(cReps, kg.toFloat(), e.name);
            (_session as ActivityRecording.Session).addLap();
        }
        Alert.vibrate(250);
        restTotalMs = restSeconds(e) * 1000;
        restUntil = System.getTimer() + restTotalMs;
        _restAlerted = false;
        editing = false;
        state = Str.REST;
    }

    // ---------------------------------------------------------------- Bedienung

    function onStart() as Void {
        if (state == Str.READY) {
            begin();
        } else if (state == Str.REST) {
            pause();
            StrengthMenu.show();
        } else if (state == Str.SET) {
            // Von Hand beenden, falls die Uhr das Ende nicht gemerkt hat.
            counter.lastReps = counter.reps();
            counter.lastSeconds = counter.activeSeconds().toNumber();
            counter.lastDiag = counter.diag();
            endSet();
        } else if (state == Str.CONFIRM) {
            if (editing && field < FIELDS - 1) {
                field += 1;
            } else {
                commit();
            }
        } else if (state == Str.PAUSED) {
            resume();
        } else if (state == Str.DONE) {
            System.exit();
        }
        WatchUi.requestUpdate();
    }

    function onBack() as Void {
        if (state == Str.READY) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else if (state == Str.REST) {
            skipExercise();
        } else if (state == Str.SET) {
            counter.nextSet();
            state = Str.REST;
        } else if (state == Str.CONFIRM) {
            // Satz verwerfen
            editing = false;
            state = Str.REST;
        } else if (state == Str.DONE) {
            System.exit();
        }
        WatchUi.requestUpdate();
    }

    // AUF = +1, AB = -1 (auf der Karte: erster Druck beginnt das Anpassen, bei den Gewichten)
    function onAdjust(dir as Number) as Void {
        if (state != Str.CONFIRM) {
            return;
        }
        editing = true;
        if (field == 0) {
            var v = cKg + dir * plan.step();
            cKg = v < 0.0 ? 0.0 : v;
        } else if (field == 1) {
            var r = cReps + dir;
            cReps = r < 0 ? 0 : (r > 99 ? 99 : r);
        } else {
            var n = plan.options.size();
            optIdx = (optIdx + dir + n) % n;
            cKg = defaultKg(plan.options[optIdx]);
        }
        WatchUi.requestUpdate();
    }

    // Tippen auf eine Zeile der Karte stellt sie zum Anpassen ein.
    function focus(f as Number) as Void {
        if (state == Str.CONFIRM) {
            editing = true;
            field = f;
            WatchUi.requestUpdate();
        }
    }

    // Die aktuelle geplante Übung auslassen (BACK in der Pause).
    private function skipExercise() as Void {
        var n = nextPlanned();
        if (n >= 0) {
            _skipped[n] = plan.items[n].sets;
            restUntil = 0;
        }
    }

    function pause() as Void {
        if (state == Str.PAUSED || !recording()) {
            return;
        }
        _beforePause = state;
        state = Str.PAUSED;
        if (_session != null) {
            (_session as ActivityRecording.Session).stop();
        }
    }

    function resume() as Void {
        if (state != Str.PAUSED) {
            return;
        }
        if (_session != null) {
            (_session as ActivityRecording.Session).start();
        }
        counter.nextSet();
        state = _beforePause == Str.SET ? Str.REST : _beforePause;
        WatchUi.requestUpdate();
    }

    // ---------------------------------------------------------------- Anzeige

    function restLeftS() as Number? {
        if (restUntil <= 0) {
            return null;
        }
        return (restUntil - System.getTimer()) / 1000;
    }

    function elapsedS() as Number {
        return (System.getTimer() - _startMs) / 1000;
    }

    function totalReps() as Number {
        var n = 0;
        for (var i = 0; i < sets.size(); i++) {
            n += sets[i].reps;
        }
        return n;
    }

    // Volumen in der Einheit des Nutzers (Wiederholungen mal Gewicht)
    function volume() as Float {
        var v = 0.0;
        for (var i = 0; i < sets.size(); i++) {
            v += sets[i].reps * sets[i].kg;
        }
        return v;
    }

    // ---------------------------------------------------------------- Upload

    private function sendSets() as Void {
        if (sets.size() == 0) {
            return;
        }
        var rows = [] as Array<Dictionary>;
        for (var i = 0; i < sets.size(); i++) {
            var s = sets[i];
            var row = { "i" => i, "e" => s.id, "n" => s.name, "r" => s.reps, "m" => s.src, "t" => s.t, "d" => s.dur, "g" => s.diag } as Dictionary;
            if (s.kg > 0.0) {
                row.put("k", s.kg);
            }
            rows.add(row);
        }
        var payload = {
            "date" => Sync.today(),
            "started" => _startEpoch,
            "unit" => plan.unit,
            "sets" => rows,
            "diag" => { "hz" => hz, "calls" => calls, "smp" => samples, "gyro" => gyroSamples, "gap" => maxGapMs, "gy" => gyroOn ? 1 : 0 }
        } as Dictionary;
        if (plan.workoutId.length() > 0) {
            payload.put("workout", plan.workoutId);
        }
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            upload = 1;
            (sync as Sync).postStrength(payload as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>, method(:onUploaded));
        }
    }

    function onUploaded(ok as Boolean) as Void {
        upload = ok ? 2 : 3;
        WatchUi.requestUpdate();
    }
}
