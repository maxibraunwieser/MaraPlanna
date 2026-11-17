// Krafttraining aufzeichnen: Zustandsmaschine, Sensoren, Sätze, Aufzeichnung und Upload.
//
//   READY    Bereit-Bildschirm (nichts läuft), START beginnt
// Tasten: BACK (unten rechts) steuert das Training, AUF/AB ändern Werte bzw. blättern, START ist nur Pause und Pausenmenü.
// Ablauf: Satz → Satz beendet (5 s keine Bewegung oder BACK) → Karte mit Wiederholungen und Gewicht → Pause mit Countdown →
// nächster Satz.
//   REST     zwischen den Sätzen: erst die Pause (der letzte Satz und der Pausenzähler), ist sie um, die nächste Übung des
//            Workouts. Solange die Pause läuft, erkennt die Uhr keinen Satz aus der Bewegung (man soll ja pausieren); erst wenn
//            sie um ist oder BACK sie beendet. BACK nach der Pause beginnt den Satz von Hand (Halten, Maschine, oder wenn die
//            Uhr ihn nicht merkt). AUF/AB blättert die Datenseiten (page: Pause, Übung, Trainingszeit, Uhrzeit), die nächste
//            Übung von Hand wählt man im Pausenmenü (START)
//   SET      ein Satz läuft: Wiederholungen zählen. Er beginnt, wenn die Bewegung drei gleichmäßige Wiederholungen ergeben hat
//            (RepCounter.regular), damit Herumgehen zwischen den Geräten kein Satz wird. Er endet nach 5 s ohne Bewegung oder mit BACK
//   CONFIRM  Satz beendet: links die Wiederholungen, rechts das Gewicht. AUF/AB ändert, BACK springt von den Wiederholungen zum
//            Gewicht (1er-Schritte, vorbelegt vom letzten Mal; ohne bekanntes Gewicht leer) und dann in die Pause. 0 Wiederholungen
//            bestätigt = der Satz wird verworfen. Solange die Karte steht, beginnt kein neuer Satz
//   PAUSED   Aufzeichnung angehalten (Menü)
//   DONE     gespeichert: welche Muskeln wie beansprucht wurden (Muscles.mc), AUF/AB zur Zusammenfassung
//
// Die Übung erkennt die Uhr nicht aus der Bewegung: es ist die nächste des Workouts oder die von Hand gewählte (Pausenmenü,
// MENÜ auf der Karte für den Satz selbst). Gezählt werden nur die Wiederholungen (CountMode.AUTO), bei Maschinen und Übungen am
// Boden beginnt BACK den Satz (ASSIST), ein Halten (Plank) läuft mit der Zeit.
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
    private const MAX_RATE = 25;
    // Gewicht auf der Karte: Schritt je Druck (in der Einheit des Nutzers)
    const WEIGHT_STEP = 1.0;

    var state as Number = Str.READY;
    var plan as StrengthPlan;
    var sets as Array<LoggedSet> = [] as Array<LoggedSet>;
    var counter as RepCounter;

    // Bestätigungskarte
    var optIdx as Number = 0;
    var cReps as Number = 0;
    var cKg as Float = 0.0;
    // Das Feld zum Anpassen: 0 Wiederholungen, 1 Gewicht
    var field as Number = 0;
    // Die von Hand gewählte nächste Übung (Index in plan.options), -1 = nach dem Plan
    var chosen as Number = -1;
    // Die Datenseite in der Pause (0 Pause, 1 Übung, 2 Trainingszeit, 3 Uhrzeit) bzw. am Ende (0 Muskeln, 1 Zusammenfassung)
    var page as Number = 0;
    const REST_PAGES = 4;
    const DONE_PAGES = 2;

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
    // Die Übung, mit der die Karte des beendeten Satzes aufging (Index in plan.options)
    private var _expIdx as Number = 0;
    private var _pendingFeat as Array<Number> = [0, 0, 0, 100, 100, 100] as Array<Number>;
    // Der Satz wurde von Hand begonnen (Maschine, Übung am Boden)
    private var _manual as Boolean = false;
    // Halten: Beginn (ms), Ziel (s), Index der Übung
    private var _holdStartMs as Number = 0;
    private var _holdIdx as Number = 0;
    private var _lastOpt as Number = 0;
    // Die Übung des laufenden Satzes (Index in plan.options), festgelegt bei seinem Beginn
    private var _setIdx as Number = 0;

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
        page = 0;
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
        if (b != null && state != Str.PAUSED) {
            counter.addBatch(b[0], b[1], b[2]);
            samples += b[0].size();
            calls += 1;
        }
        // Gym-Simulation des Demo-Builds: nach jeder Sekunde Bewegung den Takt laufen lassen, dann erzählen und die Karte bedienen
        tick();
        Demo.gymTick(self, _simSecond);
        _simSecond += 1;
    }

    // ---------------------------------------------------------------- Takt

    function tick() as Void {
        if ((state == Str.CONFIRM || (state == Str.REST && (restRunning() || nextMode() == CountMode.TIME))) && (counter.active || counter.finished)) {
            // Keine Erkennung, solange die Karte steht oder die Pause läuft (BACK beendet sie früher), und vor einem Halten nie
            // (dort zählt nur BACK): die Bewegung in dieser Zeit ist kein Satz
            counter.nextSet();
        }
        if (state == Str.REST && !restRunning() && counter.active && counter.regular() && !_manual) {
            // Drei gleichmäßige Wiederholungen nach der Pause: ein Satz beginnt
            // ab hier zählt nur der Satz (Gehen und Zurechtlegen davor fallen weg)
            counter.startSet();
            _setIdx = expectedIdx();
            state = Str.SET;
        } else if (state != Str.SET && counter.finished) {
            // Bewegung ohne gleichmäßige Wiederholungen (Herumgehen, Hantel holen): kein Satz
            counter.nextSet();
        }
        if (state == Str.SET && counter.finished) {
            endSet();
        }
        if (state == Str.HOLD) {
            if (holdElapsedS() >= holdTargetS()) {
                endHold();
            }
        }
        if (state == Str.REST && restUntil > 0 && !_restAlerted && System.getTimer() >= restUntil) {
            _restAlerted = true;
            Alert.vibrate(300);
        }
        WatchUi.requestUpdate();
    }

    // Die Figur der nächsten geplanten Übung, solange man pausiert (sonst null)
    // Vorerst keine Figur auf der Uhr: immer null (der Pausenbildschirm zeigt dann nur Übung, Satz und Zähler).
    function currentMove() as FigureMove? {
        return null;
    }

    // Zählart der Übung, die als Nächstes dran ist (CountMode.AUTO ohne Plan)
    function nextMode() as Number {
        var n = nextPlanned();
        return n < 0 ? CountMode.AUTO : plan.items[n].mode;
    }

    // ---------------------------------------------------------------- Übung

    // Die Übung, die als Nächstes erwartet wird (Index in plan.options): die von Hand gewählte, sonst die nächste des Plans,
    // ohne Plan die des letzten Satzes
    function expectedIdx() as Number {
        if (chosen >= 0 && chosen < plan.options.size()) {
            return chosen;
        }
        var n = nextPlanned();
        return n >= 0 ? n : guessLast();
    }

    // Von Hand die nächste Übung setzen (Liste der Übungen in der Pause)
    function chooseNext(i as Number) as Void {
        if (i >= 0 && i < plan.options.size()) {
            chosen = i;
            WatchUi.requestUpdate();
        }
    }

    // Die Übung des Satzes auf der Karte ändern (MENÜ auf der Karte, wenn vorher vergessen wurde, die Übung zu wählen)
    function setExercise(i as Number) as Void {
        if (state == Str.CONFIRM && i >= 0 && i < plan.options.size()) {
            optIdx = i;
            cKg = defaultKg(plan.options[i]);
            WatchUi.requestUpdate();
        }
    }

    private function guessLast() as Number {
        return _lastOpt < plan.options.size() ? _lastOpt : 0;
    }

    // Die Übung des laufenden Satzes (Index in plan.options)
    function setIdx() as Number {
        return _setIdx < plan.options.size() ? _setIdx : 0;
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
        _expIdx = _holdIdx;
        optIdx = _holdIdx;
        cKg = defaultKg(plan.options[optIdx]);
        field = 0;
        state = Str.CONFIRM;
        Alert.vibrate(300);
    }

    // Satz von Hand beginnen: bei Maschinen und Übungen am Boden bewegt sich das Handgelenk zu wenig, damit die Uhr den Beginn merkt.
    private function startManualSet() as Void {
        counter.nextSet();
        _manual = true;
        _setIdx = expectedIdx();
        state = Str.SET;
        Alert.vibrate(150);
    }

    // Das Pausenmenü (Weiter, Übung wählen, Speichern, Verwerfen): START und die Menütaste
    function openMenu() as Void {
        if (state == Str.REST || state == Str.HOLD || state == Str.SET || state == Str.CONFIRM) {
            pause();
            StrengthMenu.show();
        }
    }

    // ---------------------------------------------------------------- Sätze

    // Ein Satz ist zu Ende (5 s keine Bewegung oder von Hand beendet): Karte zum Bestätigen, mit der Übung, die bei seinem Beginn
    // dran war (die nächste des Workouts oder die von Hand gewählte).
    private function endSet() as Void {
        var reps = counter.lastReps;
        var secs = counter.lastSeconds;
        var diag = counter.lastDiag;
        var feat = counter.lastFeat;
        var manual = _manual;
        _manual = false;
        counter.nextSet();
        var rec = setIdx();
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
        _expIdx = rec;
        optIdx = rec;
        cKg = defaultKg(plan.options[optIdx]);
        field = 0;
        state = Str.CONFIRM;
        Alert.vibrate(150);
    }

    // Index der nächsten geplanten Übung mit offenen Sätzen (die von Hand gewählte, solange sie noch offene hat, sonst die erste
    // des Plans), -1 wenn alles erledigt oder nichts geplant ist
    function nextPlanned() as Number {
        if (chosen >= 0 && chosen < plan.items.size() && doneSets(chosen) < plan.items[chosen].sets) {
            return chosen;
        }
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
        if (cReps <= 0) {
            // 0 Wiederholungen bestätigt: kein Satz (verworfen), zurück in die Pause ohne Zähler
            state = Str.REST;
            page = 0;
            return;
        }
        // plan = die Übung, die bei Beginn des Satzes dran war; pick = auf der Karte von Hand geändert
        var src = optIdx == _expIdx ? "plan" : "pick";
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
        // die von Hand gewählte Übung gilt, bis ihre Sätze gemacht sind (oder eine andere gewählt wird)
        if (chosen >= 0 && chosen < plan.items.size() && doneSets(chosen) >= plan.items[chosen].sets) {
            chosen = -1;
        }
        state = Str.REST;
        page = 0;
    }

    // Der zuletzt bestätigte Satz (für die Pause), null vor dem ersten
    function lastSet() as LoggedSet? {
        return sets.size() > 0 ? sets[sets.size() - 1] : null;
    }

    // Der wievielte Satz seiner Übung war der letzte, und wie viele hat der Plan dafür (0 = nicht geplant)
    function lastSetNumbers() as Array<Number> {
        var last = lastSet();
        if (last == null) {
            return [0, 0] as Array<Number>;
        }
        var s = last as LoggedSet;
        var n = 0;
        for (var k = 0; k < sets.size(); k++) {
            if (s.id.length() > 0 ? s.id.equals(sets[k].id) : s.name.equals(sets[k].name)) {
                n += 1;
            }
        }
        var total = 0;
        for (var i = 0; i < plan.items.size(); i++) {
            if (s.id.length() > 0 ? s.id.equals(plan.items[i].id) : s.name.equals(plan.items[i].name)) {
                total = plan.items[i].sets;
            }
        }
        return [n, total] as Array<Number>;
    }

    // Läuft gerade die Pause nach einem Satz (dann zeigt die Uhr den letzten Satz und den Zähler, danach die nächste Übung)?
    function resting() as Boolean {
        var left = restLeftS();
        return state == Str.REST && sets.size() > 0 && left != null && (left as Number) > 0;
    }

    // ---------------------------------------------------------------- Bedienung

    // START: nur Beginnen (bereit), das Pausenmenü (während der Aufzeichnung), Weiter (pausiert) und Schließen (Ende)
    function onStart() as Void {
        if (state == Str.READY) {
            begin();
        } else if (state == Str.PAUSED) {
            resume();
        } else if (state == Str.DONE) {
            System.exit();
        } else {
            openMenu();
        }
        WatchUi.requestUpdate();
    }

    // BACK, die Taste unten rechts, steuert das Training: in der Pause beendet sie die Pause (ab dann erkennt die Uhr den Satz),
    // danach beginnt sie den Satz von Hand (Halten, Maschine, oder wenn die Uhr ihn nicht merkt); im Satz und beim Halten beendet
    // sie ihn (Karte); auf der Karte springt sie von den Wiederholungen zum Gewicht und bestätigt dann.
    function onBack() as Void {
        if (state == Str.READY) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else if (state == Str.REST) {
            var n = nextPlanned();
            var mode = n < 0 ? CountMode.AUTO : plan.items[n].mode;
            if (n >= 0 && mode == CountMode.TIME) {
                startHold(n);
            } else if (restRunning()) {
                endRest();
            } else {
                startManualSet();
            }
        } else if (state == Str.SET) {
            finishSet();
        } else if (state == Str.HOLD) {
            endHold();
        } else if (state == Str.CONFIRM) {
            if (field == 0) {
                field = 1;
            } else {
                commit();
            }
        } else if (state == Str.DONE) {
            System.exit();
        }
        WatchUi.requestUpdate();
    }

    // Läuft die Pause nach einem Satz noch (solange erkennt die Uhr keinen neuen)?
    function restRunning() as Boolean {
        return restUntil > 0 && System.getTimer() < restUntil;
    }

    // Die Pause von Hand beenden: ab jetzt erkennt die Uhr den nächsten Satz
    private function endRest() as Void {
        restUntil = System.getTimer();
        _restAlerted = true;
        counter.nextSet();
        Alert.vibrate(150);
    }

    // Den laufenden Satz von Hand beenden (BACK), falls die Uhr das Ende noch nicht gemerkt hat.
    private function finishSet() as Void {
        counter.lastReps = counter.reps();
        counter.lastSeconds = counter.activeSeconds().toNumber();
        counter.lastDiag = counter.diag();
        counter.lastFeat = counter.features();
        endSet();
    }

    // AUF/AB in der Pause und am Ende: die nächste bzw. vorige Datenseite (ringsum)
    function flip(dir as Number) as Void {
        var n = state == Str.DONE ? DONE_PAGES : (state == Str.REST ? REST_PAGES : 0);
        if (n > 0) {
            page = ((page + dir) % n + n) % n;
            WatchUi.requestUpdate();
        }
    }

    // Auf der Karte: AUF = +1, AB = -1 am gewählten Feld (Wiederholungen bzw. Gewicht in 1er-Schritten)
    function onAdjust(dir as Number) as Void {
        if (state != Str.CONFIRM) {
            return;
        }
        if (field == 0) {
            var r = cReps + dir;
            cReps = r < 0 ? 0 : (r > 99 ? 99 : r);
        } else {
            var v = cKg + dir * WEIGHT_STEP;
            cKg = v < 0.0 ? 0.0 : (v > 999.0 ? 999.0 : v);
        }
        WatchUi.requestUpdate();
    }

    // Tippen auf eine Hälfte der Karte stellt sie zum Anpassen ein (0 links Wiederholungen, 1 rechts Gewicht).
    function focus(f as Number) as Void {
        if (state == Str.CONFIRM) {
            field = f;
            WatchUi.requestUpdate();
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

    // Der Zustand vor der Pause (im Pausenmenü: auf der Karte die Übung des Satzes ändern, sonst die nächste wählen)
    function pausedFrom() as Number {
        return _beforePause;
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

    // Wie stark jeder Muskel beansprucht wurde (Muscles.load): je gemachtem Satz die Masken seiner Übung
    function muscleLoad() as Array<Float> {
        var masks = [] as Array<Array<Number>>;
        for (var k = 0; k < sets.size(); k++) {
            var s = sets[k];
            for (var i = 0; i < plan.options.size(); i++) {
                var o = plan.options[i];
                if (s.id.length() > 0 ? s.id.equals(o.id) : s.name.equals(o.name)) {
                    masks.add([o.musP, o.musS] as Array<Number>);
                    break;
                }
            }
        }
        return Muscles.load(masks);
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
        logLocally();
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

    // Das Training auf der Uhr merken (Übungen zusammengefasst wie auf der Website: "3 × 8 · 60 kg"), damit es sofort als
    // erledigt gilt, auch ohne Verbindung zum Handy.
    private function logLocally() as Void {
        var names = [] as Array<String>;
        var count = [] as Array<Number>;
        var reps = [] as Array<Number>;
        var kg = [] as Array<Float>;
        for (var i = 0; i < sets.size(); i++) {
            var at = names.indexOf(sets[i].name);
            if (at < 0) {
                names.add(sets[i].name);
                count.add(0);
                reps.add(sets[i].reps);
                kg.add(0.0);
                at = names.size() - 1;
            }
            count[at] += 1;
            kg[at] = sets[i].kg > kg[at] ? sets[i].kg : kg[at];
        }
        var lines = [] as Array;
        for (var i = 0; i < names.size(); i++) {
            var text = count[i] + " × " + reps[i] + (kg[i] > 0.0 ? " · " + kgText(kg[i]) + " " + plan.unit : "");
            lines.add([names[i], text] as Array<String>);
        }
        var title = plan.title.length() > 0 ? plan.title : WatchUi.loadResource(Rez.Strings.StrengthName) as String;
        PlanEntry.logStrength(_startEpoch, Time.now().value() - _startEpoch, title, lines);
    }

    // 60 → "60", 22.5 → "22,5"
    private function kgText(v as Float) as String {
        var whole = v.toNumber();
        if ((v - whole).abs() < 0.05) {
            return whole.format("%d");
        }
        var t = v.format("%.1f");
        var dot = t.find(".");
        return dot == null ? t : t.substring(0, dot) + "," + t.substring(dot + 1, t.length());
    }

    function onUploaded(ok as Boolean) as Void {
        upload = ok ? 2 : 3;
        WatchUi.requestUpdate();
    }
}
