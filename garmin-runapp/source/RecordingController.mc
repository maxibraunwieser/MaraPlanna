// Zustandsmaschine und Aufzeichnung: IDLE → RECORDING ⇄ PAUSED → STOPPED.
// Einmal pro Sekunde (tick) werden Pace geglättet, Zielbereich geprüft,
// Workout-Schritte weitergeschaltet und die FIT-Felder geschrieben.

import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;
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
    // In den ersten Sekunden eines Schritts beschleunigt man noch: kein Alarm.
    private const SETTLE_S = 20;

    var state as Number = Rec.IDLE;
    var zone as Number = 0;
    var zones as PaceZones;
    var workout as Workout?;
    var pace as Float? = null;
    // -1 = langsamer laufen, 1 = schneller laufen, 0 = passt / kein Ziel
    var hint as Number = 0;
    var laps as Number = 1;
    // Zum Anzeigen eines Schrittwechsels für ein paar Sekunden.
    var stepChangedAt as Number = -100000;
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
    private var _offTicks as Number = 0;
    private var _offSign as Number = 0;
    private var _lastAlarm as Number = -ALARM_GAP_MS;
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
        _session = session;
        state = Rec.RECORDING;
        _timer = new Timer.Timer();
        (_timer as Timer.Timer).start(method(:tick), 1000, true);
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
        var info = Activity.getActivityInfo();
        var ms = timerMs(info);
        var dist = distance(info);
        if (workout != null && !(workout as Workout).finished) {
            (workout as Workout).advance(ms, dist);
            stepChangedAt = ms;
        }
        newLap(ms, dist);
        Alert.lap();
        WatchUi.requestUpdate();
    }

    // Kilometer-Zusammenfassung gerade sichtbar? (in den Einstellungen abschaltbar)
    function summaryShowing(ms as Number) as Boolean {
        return Prefs.kmSummary() && splits.showing(ms);
    }

    function save() as Void {
        if (_session != null && recording()) {
            var session = _session as ActivityRecording.Session;
            if (session.isRecording()) {
                session.stop();
            }
            // Der Lauf zählt sofort zu den Wochenkilometern, auch bevor MaraPlanna ihn über Garmin Connect kennt.
            WeekPlan.logRun(distance(Activity.getActivityInfo()), WeekPlan.today());
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
        var info = Activity.getActivityInfo();
        var ms = timerMs(info);
        var dist = distance(info);

        // Aktuelle Pace: Geschwindigkeit des GPS-Chips, gemittelt über das eingestellte Fenster (Ringpuffer).
        _smooth.add(ms, dist, info != null ? info.currentSpeed : null);
        pace = _smooth.pace(Prefs.paceSeconds());

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
        if (workout != null && (workout as Workout).update(ms, dist)) {
            stepChangedAt = ms;
            newLap(ms, dist);
            Alert.lap();
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
        return timerMs(Activity.getActivityInfo()) - _lapMs;
    }

    function lapDistance() as Float {
        return distance(Activity.getActivityInfo()) - _lapDist;
    }

    function lapPace() as Float? {
        return Pace.fromDelta(lapMs(), lapDistance());
    }

    function averagePace() as Float? {
        var info = Activity.getActivityInfo();
        return Pace.fromDelta(timerMs(info), distance(info));
    }
}
