// Krafttraining aufzeichnen: Zustandsmaschine, Sensoren, Sätze, Aufzeichnung und Upload.
//
//   READY    Bereit-Bildschirm (nichts läuft), START beginnt
//   REST     zwischen den Sätzen: nächste geplante Übung und Pausenzähler
//   SET      Bewegung erkannt: Wiederholungen zählen
//   CONFIRM  Satz beendet: Übung, Wiederholungen und Gewicht bestätigen oder anpassen
//   PAUSED   Aufzeichnung angehalten (Menü)
//   DONE     gespeichert, Zusammenfassung
//
// Die Übung eines Satzes erkennt die Uhr aus den Übungen der gewählten Einheit (Recognizer.mc): Reihenfolge des Plans, was die
// Übungen dieser Person am Handgelenk bisher ergeben haben (vom Server) und was in dieser Einheit schon bestätigt wurde.
// Stimmt die Erkennung mit dem Plan überein und ist sie sicher, schließt sich der Satz von selbst; sonst bleibt die Karte stehen
// und zeigt die erkannte Übung (AUF/AB wählt eine andere). Gezählt wird aus der Bewegung (CountMode.AUTO), bei Maschinen und Übungen
// am Boden fragt die Uhr immer nach (ASSIST: START beginnt und beendet den Satz von Hand), ein Halten (Plank) läuft mit der Zeit.
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
    // Halten mit Zeit (Plank): der Zähler läuft, START beendet
    const HOLD = 6;
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
    // Die zwölf Messwerte des Satzes (sechs vom Zähler, sechs Merkmale), mit denen er hochgeladen wird
    var diag as Array<Number>;
    // Die sechs Merkmale allein (für das, was in dieser Einheit schon bestätigt wurde)
    var feat as Array<Number>;

    function initialize(id as String, name as String, reps as Number, kg as Float, src as String, t as Number, dur as Number, diag as Array<Number>, feat as Array<Number>) {
        self.id = id;
        self.name = name;
        self.reps = reps;
        self.kg = kg;
        self.src = src;
        self.t = t;
        self.dur = dur;
        self.diag = diag;
        self.feat = feat;
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
    // Erkennung des beendeten Satzes: erkannte Übung (Index in plan.options), erwartete laut Plan, Sicherheit, darf sich selbst schließen
    private var _recIdx as Number = 0;
    private var _expIdx as Number = 0;
    private var _conf as Float = 0.0;
    private var _autoOk as Boolean = false;
    private var _pendingFeat as Array<Number> = [0, 0, 0, 100, 100, 100] as Array<Number>;
    // Der Satz wurde von Hand begonnen (Maschine, Übung am Boden)
    private var _manual as Boolean = false;
    // Halten: Beginn (ms), Ziel (s), Index der Übung
    private var _holdStartMs as Number = 0;
    private var _holdIdx as Number = 0;
    private var _lastOpt as Number = 0;
    // Laufende Erkennung während eines Satzes (Index in plan.options, -1 = noch nichts, Sicherheit)
    var liveIdx as Number = -1;
    var liveConf as Float = 0.0;

    function initialize(plan as StrengthPlan) {
        self.plan = plan;
        counter = new RepCounter(MAX_RATE);
        for (var i = 0; i < plan.items.size(); i++) {
            _skipped.add(0);
        }
    }

    function recording() as Boolean {
        return state == Str.REST || state == Str.SET || state == Str.CONFIRM || state == Str.PAUSED || state == Str.HOLD;
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
        if (state == Str.REST && (counter.active || counter.finished) && nextMode() == CountMode.TIME) {
            // Vor einem Halten zählt nur START: Bewegung davor (Hinlegen, Zurechtrücken) ist kein Satz
            counter.nextSet();
        }
        if (state == Str.REST || state == Str.SET) {
            if (counter.finished) {
                endSet();
            } else if (state == Str.REST && counter.active && counter.activeSeconds() >= 1.0) {
                state = Str.SET;
            }
        }
        if (state == Str.SET) {
            liveGuess();
        } else if (state == Str.HOLD) {
            if (holdElapsedS() >= holdTargetS()) {
                endHold();
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

    // Die Figur der nächsten geplanten Übung, solange man pausiert (sonst null)
    // Vorerst keine Figur auf der Uhr: immer null (der Pausenbildschirm zeigt dann nur Übung, Satz und Zähler).
    function currentMove() as FigureMove? {
        return null;
    }

    // Darf die Karte sich selbst schließen: eingeschaltet, nicht beim Anpassen, und die Erkennung ist sicher und passt zum Plan.
    function autoOn() as Boolean {
        return plan.auto && !editing && _autoOk;
    }

    // Die Karte zeigt eine Übung, die die Uhr erkannt hat und die nicht die vom Plan erwartete ist
    function recognized() as Boolean {
        return state == Str.CONFIRM && !editing && optIdx == _recIdx && _recIdx != _expIdx;
    }

    // Zählart der Übung, die als Nächstes dran ist (CountMode.AUTO ohne Plan)
    function nextMode() as Number {
        var n = nextPlanned();
        return n < 0 ? CountMode.AUTO : plan.items[n].mode;
    }

    // ---------------------------------------------------------------- Erkennung

    // Die Kandidaten für einen Satz: alle Übungen der Auswahl (die geplanten zuerst), mit Vorwissen und dem, was sie bisher ergeben haben.
    function candidates() as Array<Cand> {
        var out = [] as Array<Cand>;
        var next = nextPlanned();
        var lastId = sets.size() > 0 ? sets[sets.size() - 1].id : "";
        var lastName = sets.size() > 0 ? sets[sets.size() - 1].name : "";
        for (var i = 0; i < plan.options.size(); i++) {
            var o = plan.options[i];
            var open = -1;
            if (i < plan.items.size()) {
                open = plan.items[i].sets - doneSets(i);
                if (open < 0) {
                    open = 0;
                }
            }
            var last = o.id.length() > 0 ? o.id.equals(lastId) : (lastName.length() > 0 && o.name.equals(lastName));
            var rows = [] as Array<Array<Number>>;
            for (var k = 0; k < sets.size(); k++) {
                var s = sets[k];
                if (o.id.length() > 0 ? o.id.equals(s.id) : o.name.equals(s.name)) {
                    rows.add(s.feat);
                }
            }
            out.add(new Cand(open, i == next, last, o.mode, plan.sigOf(o.id), Recognizer.summarize(rows)));
        }
        return out;
    }

    // Die Übung, die der Plan als Nächstes erwartet (Index in plan.options); ohne Plan die des letzten Satzes
    private function expectedIdx() as Number {
        var n = nextPlanned();
        return n >= 0 ? n : guessLast();
    }

    private function guessLast() as Number {
        return _lastOpt < plan.options.size() ? _lastOpt : 0;
    }

    // Während des Satzes: was die Bewegung bisher sagt (ab zwei Wiederholungen)
    private function liveGuess() as Void {
        if (_manual || counter.reps() < 2 || plan.options.size() == 0) {
            liveIdx = -1;
            return;
        }
        var sc = Recognizer.scores(candidates(), counter.features(), true);
        var pr = Recognizer.probabilities(sc);
        liveIdx = Recognizer.best(sc);
        liveConf = pr[liveIdx];
    }

    // ---------------------------------------------------------------- Halten (Plank)

    function holdElapsedS() as Number {
        return (System.getTimer() - _holdStartMs) / 1000;
    }

    // Die Übung, die gerade gehalten wird (Index in plan.options)
    function holdIdx() as Number {
        return _holdIdx;
    }

    function holdTargetS() as Number {
        var h = plan.options[_holdIdx].hold;
        return h < 5 ? 30 : h;
    }

    private function startHold(idx as Number) as Void {
        _holdIdx = idx;
        _holdStartMs = System.getTimer();
        restUntil = 0;
        state = Str.HOLD;
        Alert.vibrate(200);
    }

    // Die Zeit ist um (oder von Hand beendet): die Karte mit den gehaltenen Sekunden
    private function endHold() as Void {
        var secs = holdElapsedS();
        var target = holdTargetS();
        if (secs > target) {
            secs = target;
        }
        var now = (System.getTimer() - _startMs) / 1000;
        _pendingDur = secs < 1 ? 1 : secs;
        _pendingT = now - _pendingDur < 0 ? 0 : now - _pendingDur;
        _pendingDiag = [0, 0, 0, 0, 0, secs, 0, 0, 0, 0, 0, 0] as Array<Number>;
        _pendingFeat = [0, 0, 0, 100, 100, 100] as Array<Number>;
        cReps = secs;
        _recIdx = _holdIdx;
        _expIdx = _holdIdx;
        _conf = 1.0;
        _autoOk = secs >= target;
        optIdx = _holdIdx;
        cKg = defaultKg(plan.options[optIdx]);
        editing = false;
        field = 0;
        autoLeft = AUTO_S;
        state = Str.CONFIRM;
        Alert.vibrate(300);
    }

    // Satz von Hand beginnen: bei Maschinen und Übungen am Boden bewegt sich das Handgelenk zu wenig, damit die Uhr den Beginn merkt.
    private function startManualSet() as Void {
        counter.nextSet();
        _manual = true;
        liveIdx = -1;
        state = Str.SET;
        Alert.vibrate(150);
    }

    // Das Menü (Pause, Speichern, Verwerfen): Menütaste, und START, wenn START etwas anderes tut
    function openMenu() as Void {
        if (state == Str.REST || state == Str.HOLD || state == Str.SET) {
            pause();
            StrengthMenu.show();
        }
    }

    // ---------------------------------------------------------------- Sätze

    // Ein Satz ist zu Ende (erkannt oder von Hand beendet): Karte zum Bestätigen. Die Übung erkennt die Uhr aus den Übungen der
    // Einheit; nur wenn sie sicher ist und zum Plan passt (und die Übung zählbar ist), schließt sich die Karte selbst.
    private function endSet() as Void {
        var reps = counter.lastReps;
        var secs = counter.lastSeconds;
        var diag = counter.lastDiag;
        var feat = counter.lastFeat;
        var manual = _manual;
        _manual = false;
        liveIdx = -1;
        counter.nextSet();
        var exp = expectedIdx();
        var rec = exp;
        var conf = 1.0;
        if (!manual) {
            var sc = Recognizer.scores(candidates(), feat, true);
            var pr = Recognizer.probabilities(sc);
            rec = Recognizer.best(sc);
            conf = pr[rec];
        }
        var mode = plan.options[rec].mode;
        if (reps < MIN_REPS && !(manual && plan.options[rec].reps > 0)) {
            // zu kurz für einen Satz: eine Bewegung, zurück in die Pause
            state = Str.REST;
            return;
        }
        var now = (System.getTimer() - _startMs) / 1000;
        _pendingDur = secs < 1 ? 1 : secs;
        _pendingT = now - _pendingDur - 2 < 0 ? 0 : now - _pendingDur - 2;
        _pendingFeat = feat;
        _pendingDiag = [diag[0], diag[1], diag[2], diag[3], diag[4], diag[5], feat[0], feat[1], feat[2], feat[3], feat[4], feat[5]] as Array<Number>;
        // Bei Maschinen und am Boden zählt die Uhr nur mit; kam nichts zusammen, gilt das Ziel des Plans.
        cReps = reps < MIN_REPS ? plan.options[rec].reps : reps;
        _recIdx = rec;
        _expIdx = exp;
        _conf = conf;
        _autoOk = !manual && mode == CountMode.AUTO && rec == exp && conf >= Recognizer.SURE;
        optIdx = rec;
        cKg = defaultKg(plan.options[optIdx]);
        editing = false;
        field = 0;
        autoLeft = AUTO_S;
        state = Str.CONFIRM;
        Alert.vibrate(150);
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
        // plan = die Übung, die der Plan erwartet; auto = die Uhr hat eine andere erkannt und es blieb dabei; pick = von Hand geändert
        var src = optIdx == _recIdx ? (optIdx == _expIdx ? "plan" : "auto") : "pick";
        var s = new LoggedSet(e.id, e.name, cReps, cKg, src, _pendingT, _pendingDur, _pendingDiag, _pendingFeat);
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
            // Ein Halten oder eine Maschine: START beginnt den Satz (das Menü bleibt auf der Menütaste); sonst öffnet START das Menü.
            var n = nextPlanned();
            var mode = n < 0 ? CountMode.AUTO : plan.items[n].mode;
            if (n >= 0 && mode == CountMode.TIME) {
                startHold(n);
            } else if (n >= 0 && mode == CountMode.ASSIST) {
                startManualSet();
            } else {
                openMenu();
            }
        } else if (state == Str.HOLD) {
            endHold();
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
            _manual = false;
            liveIdx = -1;
            state = Str.REST;
        } else if (state == Str.HOLD) {
            // Halten abbrechen
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
        // Ein Halten läuft nach der Pause neu an (die Zeit zählt nicht mit)
        _beforePause = state == Str.HOLD ? Str.REST : state;
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
        _manual = false;
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
