// Zustandsmaschine und Aufzeichnung: IDLE → RECORDING ⇄ PAUSED → STOPPED.
// Einmal pro Sekunde (tick) werden Pace geglättet, Zielbereich geprüft,
// Workout-Schritte weitergeschaltet und die FIT-Felder geschrieben.

import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

module Rec {
    const IDLE = 0;
    const RECORDING = 1;
    const PAUSED = 2;
    const STOPPED = 3;
}

class RecordingController {
    // Mindestabstand der Pace-Alarme. Ein Alarm kommt erst, wenn die Pace so viele Sekunden am Stück
    // außerhalb des Zielbereichs liegt (kurze Ausreißer lösen nichts aus).
    private const ALARM_GAP_MS = 30000;
    private const OFF_SECONDS = 8;
    // Kommt so lange kein Puls aus der Aktivität, wird der Pulssensor ausdrücklich eingeschaltet (Sicherheitsnetz
    // für Uhren, die ihn nicht von selbst starten). Normalerweise passiert das nie: ANT+ stört Bluetooth-Musik.
    private const HR_WAIT_S = 20;
    // In den ersten Sekunden eines Schritts beschleunigt man noch: kein Alarm.
    private const SETTLE_S = 20;

    var state as Number = Rec.IDLE;
    var zone as Number = 0;
    var zones as PaceZones;
    var workout as Workout?;
    var pace as Float? = null;
    // -1 = langsamer laufen, 1 = schneller laufen, 0 = passt / kein Ziel
    var hint as Number = 0;
    // Runden der Aufzeichnung (je Schritt, Garmins Ansage) und Runden der App (Intervall + Trabpause = eine)
    var laps as Number = 1;
    var rounds as Number = 1;
    // Zum Anzeigen eines Schrittwechsels für ein paar Sekunden.
    var stepChangedAt as Number = -100000;
    // Zusammenfassung des zuletzt beendeten schnellen Teils: welcher Schritt, seit wann (ms Aufzeichnungszeit)
    var summaryStep as Number = -1;
    var stepSummaryAt as Number = -100000;
    private const STEP_SUMMARY_MS = 10000;
    // Verlauf (Diagramme) und gelaufene Strecke (Karte)
    var history as History = new History();
    var track as Track = new Track();
    // Zwischenzeiten je km (bzw. Meile) mit Ø-Puls
    var splits as Splits = new Splits();
    // Zeit in den fünf Pulszonen (Zonen einmal beim Start aus dem Garmin-Profil gelesen)
    var zoneTime as ZoneTime = new ZoneTime();
    // Eigene Schätzung der anaeroben Belastung (aus Schwellen-, Intervall- und Wiederholungspace)
    var anaerobic as AnaerobicLoad = new AnaerobicLoad(null, null, null);
    // Laufrichtung in Radiant (0 = Norden), von App.onPosition
    var heading as Float? = null;

    private var _hrZones as Array<Number> = HeartZones.read();
    private var _session as ActivityRecording.Session?;
    private var _fit as FitFields?;
    private var _timer as Timer.Timer?;
    // Geglättete aktuelle Pace (Fenster aus den Einstellungen)
    private var _smooth as PaceSmoother = new PaceSmoother();
    // Countdown vor dem nächsten Schrittwechsel
    private var _countdown as StepCountdown = new StepCountdown();
    private var _noHrTicks as Number = 0;
    private var _offTicks as Number = 0;
    private var _offSign as Number = 0;
    private var _lastAlarm as Number = -ALARM_GAP_MS;
    // Startzeit des Laufs (Sekunden seit 1970) für die Liste "Absolviert"
    private var _startedAt as Number = 0;
    private var _lapMs as Number = 0;
    private var _lapDist as Float = 0.0;
    private var _zoneStartMs as Number = 0;

    function initialize(zones as PaceZones) {
        self.zones = zones;
    }

    function recording() as Boolean {
        return state == Rec.RECORDING || state == Rec.PAUSED;
    }

    // Aktueller Zielbereich: Workout-Schritt oder gewählter Lauftyp.
    function target() as Array<Number>? {
        if (workout != null) {
            return (workout as Workout).target();
        }
        return zones.range(zone);
    }

    // Mittlere Pace des Lauftyps (z. B. 5 = Schwelle) in s/km; null, wenn unbekannt.
    private function zonePace(zone as Number) as Float? {
        var r = zones.range(zone);
        return r == null ? null : (r[0] + r[1]) / 2.0;
    }

    function currentZone() as Number {
        return workout != null ? (workout as Workout).stepZone() : zone;
    }

    // Start mit gewähltem Lauftyp (zone) oder der heutigen Einheit (workout).
    function start(zone as Number, workout as Workout?) as Void {
        if (state != Rec.IDLE) {
            return;
        }
        self.zone = zone;
        self.workout = workout;
        getApp().startGps();
        if (workout != null) {
            (workout as Workout).bindZones(zones);
        }
        var name = workout != null ? (workout as Workout).title : WatchUi.loadResource(Rez.Strings.ActivityName) as String;
        var session = ActivityRecording.createSession({
            :name => name.length() > 15 ? name.substring(0, 15) as String : name,
            :sport => Activity.SPORT_RUNNING,
            :subSport => Activity.SUB_SPORT_GENERIC
        });
        anaerobic = new AnaerobicLoad(zonePace(5), zonePace(6), zonePace(7));
        _fit = new FitFields(session, zones.vdot);
        session.start();
        _startedAt = Time.now().value();
        _session = session;
        state = Rec.RECORDING;
        _timer = new Timer.Timer();
        // eine Messung pro Sekunde (die Lauf-Simulation des Demo-Builds spielt schneller ab)
        (_timer as Timer.Timer).start(method(:tick), Demo.tickMs(), true);
        Alert.start();
    }

    function pause() as Void {
        if (state == Rec.RECORDING && _session != null) {
            (_session as ActivityRecording.Session).stop();
            state = Rec.PAUSED;
            hint = 0;
            Alert.pause();
            WatchUi.requestUpdate();
        }
    }

    function resume() as Void {
        if (state == Rec.PAUSED && _session != null) {
            (_session as ActivityRecording.Session).start();
            state = Rec.RECORDING;
            _smooth.reset();
            _offTicks = 0;
            Alert.start();
            WatchUi.requestUpdate();
        }
    }

    // Runde: im Workout zum nächsten Schritt, sonst neue Runde.
    function lap() as Void {
        if (state != Rec.RECORDING || _session == null) {
            return;
        }
        var info = Demo.info(Activity.getActivityInfo());
        var ms = timerMs(info);
        var dist = distance(info);
        if (workout != null && !(workout as Workout).finished) {
            stepDone(ms, dist, info);
        } else {
            newLap(ms, dist);
            rounds += 1;
            restartSection(ms, dist, info);
            Alert.lap();
        }
        WatchUi.requestUpdate();
    }

    // Ein Schritt der Einheit ist zu Ende (von selbst oder per Runden-Taste): weiter zum nächsten. Endet ein schneller Teil
    // (Intervall, Abschnitt eines Long Runs), kommt seine Zusammenfassung mit eigenem Signal; nach einer Trabpause nichts.
    // Für die Aufzeichnung ist jeder Schritt eine Runde: Garmin sagt bei jeder Runde deren Zeit (und Pace) an, und nur so sind die
    // Werte nach dem Intervall die des Intervalls (nach der Trabpause kommt dadurch auch eine kurze Ansage; abschalten lässt sie
    // sich von der App aus nicht). Die App selbst zählt Intervall + Trabpause als eine Runde (rounds).
    private function stepDone(ms as Number, dist as Float, info as Activity.Info?) as Void {
        var wk = workout as Workout;
        var done = wk.index;
        wk.advance(ms, dist);
        stepChangedAt = ms;
        newLap(ms, dist);
        if (wk.startsRound()) {
            rounds += 1;
        }
        restartSection(ms, dist, info);
        if (wk.isActive(done)) {
            summaryStep = done;
            stepSummaryAt = ms;
            splits.hide();
            Alert.stepDone();
            Demo.logStep(wk, done, laps, rounds);
        } else {
            Alert.lap();
        }
    }

    // Zusammenfassung des gerade beendeten schnellen Teils gerade sichtbar?
    function stepSummaryShowing(ms as Number) as Boolean {
        return summaryStep >= 0 && ms - stepSummaryAt < STEP_SUMMARY_MS;
    }

    function hideStepSummary() as Void {
        stepSummaryAt = -100000;
    }

    // Neuer Schritt oder neue Runde: die Glättung der Pace beginnt bei null, mit dem aktuellen Messpunkt als erstem.
    // Die Pace des vorigen Abschnitts fließt nie in die neue ein (kein Verwischen beim Wechsel von Intervall und Trabpause).
    // Auch der Countdown vor dem nächsten Wechsel beginnt neu.
    private function restartSection(ms as Number, dist as Float, info as Activity.Info?) as Void {
        _countdown.reset();
        _smooth.reset();
        _smooth.add(ms, dist, info != null ? info.currentSpeed : null);
        pace = null;
        _offTicks = 0;
    }

    // Kilometer-Zusammenfassung gerade sichtbar? (in den Einstellungen abschaltbar)
    function summaryShowing(ms as Number) as Boolean {
        return !stepSummaryShowing(ms) && Prefs.kmSummary() && splits.showing(ms);
    }

    function save() as Void {
        if (_session != null && recording()) {
            var session = _session as ActivityRecording.Session;
            if (session.isRecording()) {
                session.stop();
            }
            // Der Lauf zählt sofort zu den Wochenkilometern, auch bevor MaraPlanna ihn über Garmin Connect kennt.
            var info = Demo.info(Activity.getActivityInfo());
            WeekPlan.logRun(distance(info), WeekPlan.today());
            if (distance(info) >= 100.0) {
                var hr = info != null ? info.averageHeartRate : null;
                PlanEntry.logRun(_startedAt, distance(info), timerMs(info) / 1000, hr, workout != null ? (workout as Workout).title : StartView.zoneName(zone));
            }
            session.save();
            finish();
            Alert.saved();
        }
    }

    function discard() as Void {
        if (_session != null && recording()) {
            var session = _session as ActivityRecording.Session;
            if (session.isRecording()) {
                session.stop();
            }
            session.discard();
            finish();
        }
    }

    private function finish() as Void {
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
        _session = null;
        state = Rec.STOPPED;
        hint = 0;
    }

    function tick() as Void {
        if (state != Rec.RECORDING) {
            WatchUi.requestUpdate();
            return;
        }
        Demo.simTick(self);
        var info = Demo.info(Activity.getActivityInfo());
        var ms = timerMs(info);
        var dist = distance(info);

        // Kein Puls aus der Aktivität: nach HR_WAIT_S Sekunden den Sensor einmal ausdrücklich anfordern.
        if (info != null && info.currentHeartRate == null) {
            _noHrTicks += 1;
            if (_noHrTicks == HR_WAIT_S) {
                Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE] as Array<Sensor.SensorType>);
            }
        } else {
            _noHrTicks = 0;
        }

        // Aktuelle Pace: Geschwindigkeit des GPS-Chips, gemittelt über das eingestellte Fenster (Ringpuffer).
        _smooth.add(ms, dist, info != null ? info.currentSpeed : null);
        pace = _smooth.pace(Prefs.paceSeconds());
        Demo.simLog(self);

        // Verlauf und Strecke für Diagramme und Karte
        history.add(info != null ? info.currentHeartRate : null, pace == null ? 0.0 : 1000.0 / (pace as Float));
        var loc = info != null ? info.currentLocation : null;
        if (loc != null) {
            var deg = loc.toDegrees();
            track.add(deg[0].toFloat(), deg[1].toFloat());
        }

        zoneTime.add(info != null ? info.currentHeartRate : null, _hrZones);
        anaerobic.add(pace);

        // Jeder volle Kilometer (bzw. jede Meile): Zusammenfassung zeigen, kurzer Hinweiston.
        if (splits.update(ms, dist, info != null ? info.currentHeartRate : null, zones.miles ? Pace.M_PER_MI : 1000.0)) {
            Alert.lap();
        }

        // Workout: Puls dem laufenden Schritt zuordnen; Schritt erledigt → nächster Schritt mit Runde und Hinweis.
        if (workout != null) {
            (workout as Workout).addHeartRate(info != null ? info.currentHeartRate : null);
        }
        if (workout != null && !(workout as Workout).finished) {
            var left = (workout as Workout).remaining(ms, dist);
            if (left != null && (left[0] as Numeric) <= 0) {
                stepDone(ms, dist, info);
            }
        }

        // Countdown: in den letzten 5 Sekunden vor dem Wechsel zum nächsten Schritt je ein Impuls.
        if (workout != null && Prefs.countdown()) {
            var wk = workout as Workout;
            // Restzeit eines Strecken-Schritts aus dem Tempo der letzten Sekunden (die geglättete Pace hinkt hinterher)
            var speed = _smooth.speedOver(4);
            if (speed == null) {
                speed = pace != null ? 1000.0 / (pace as Float) : (info != null ? info.currentSpeed : null);
            }
            if (_countdown.due(wk.secondsLeft(ms, dist, speed), wk.stepSeconds(ms))) {
                Alert.countdown();
            }
        }

        // Zielbereich prüfen; Alarm höchstens alle 30 s und nicht direkt nach einem Schrittwechsel.
        var range = target();
        hint = Pace.compare(pace, range);
        // Wie lange liegt die Pace schon auf derselben Seite außerhalb des Bereichs?
        if (hint != 0 && hint == _offSign) {
            _offTicks += 1;
        } else {
            _offTicks = hint != 0 ? 1 : 0;
            _offSign = hint;
        }
        var settled = workout != null ? (workout as Workout).stepSeconds(ms) >= SETTLE_S : (ms - _zoneStartMs) / 1000 >= SETTLE_S;
        if (hint != 0 && _offTicks >= OFF_SECONDS && settled && ms - _lastAlarm >= ALARM_GAP_MS && Prefs.paceAlert()) {
            _lastAlarm = ms;
            Alert.pace(hint < 0);
        }

        if (_fit != null) {
            (_fit as FitFields).update(range, currentZone());
        }
        WatchUi.requestUpdate();
    }

    private function newLap(ms as Number, dist as Float) as Void {
        if (_session != null) {
            (_session as ActivityRecording.Session).addLap();
        }
        laps += 1;
        _lapMs = ms;
        _lapDist = dist;
    }

    // --- Werte für die Anzeige -------------------------------------------------

    function timerMs(info as Activity.Info?) as Number {
        return info != null && info.timerTime != null ? info.timerTime as Number : 0;
    }

    // Ungültige Werte (null, NaN, negativ – kommt ohne GPS-Fix vor) zählen als 0.
    function distance(info as Activity.Info?) as Float {
        var d = info != null ? info.elapsedDistance : null;
        return d == null || d != d || d < 0 ? 0.0 : d as Float;
    }

    function lapMs() as Number {
        return timerMs(Demo.info(Activity.getActivityInfo())) - _lapMs;
    }

    function lapDistance() as Float {
        return distance(Demo.info(Activity.getActivityInfo())) - _lapDist;
    }

    function lapPace() as Float? {
        return Pace.fromDelta(lapMs(), lapDistance());
    }

    function averagePace() as Float? {
        var info = Demo.info(Activity.getActivityInfo());
        return Pace.fromDelta(timerMs(info), distance(info));
    }
}
