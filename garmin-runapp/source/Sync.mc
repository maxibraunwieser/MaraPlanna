// Kopplung mit MaraPlanna und Laden der Paces + heutigen Einheit (über das Handy).
// Gleiche Kopplung wie beim Zifferblatt: die Uhr zeigt einen 6-stelligen Code,
// der auf der Website eingegeben wird. Storage: "secret", "code", "run" (Paces, heutige Einheit, Woche),
// "plan" (Schritte der Einheiten und absolvierte Einheiten für Trainingsplan und Absolviert),
// "str" und "figs" (Krafteinheiten von heute und ihre Figuren, siehe strength/StrengthPlan.mc).

import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

class Sync {
    private const BASE = Bg.BASE;
    // Nach dieser Zeit gelten die geladenen Daten als veraltet (Startbildschirm lädt dann neu).
    private const STALE_S = 900;
    private var _timer as Timer.Timer?;
    private var _busy as Boolean = false;
    private var _sendingStrength as Boolean = false;
    private var _loadingPlan as Boolean = false;
    private var _loadingStrength as Boolean = false;
    // Die Muskelgruppen, deren Übungslisten noch geladen werden (eine Anfrage nach der anderen)
    private var _libQueue as Array<String> = [] as Array<String>;
    private var _strengthDone as Method? = null;
    private var _onChange as Method() as Void;
    var lastError as Number? = null;

    function initialize(onChange as Method() as Void) {
        _onChange = onChange;
    }

    function code() as String? {
        return Application.Storage.getValue("code") as String?;
    }

    function paired() as Boolean {
        return Application.Storage.getValue("secret") != null && code() == null;
    }

    function busy() as Boolean {
        return _busy;
    }

    // Daten nachladen, wenn der letzte Abgleich länger als STALE_S her ist (oder noch nie war), oder wenn Daten fehlen, die
    // diese Version der App braucht (nach einem Update der App gilt der alte Stand sonst noch bis zu STALE_S als frisch).
    function refreshIfStale() as Void {
        var age = WeekPlan.syncedMinutes();
        if (age == null || age * 60 >= STALE_S || missingData()) {
            refresh();
        }
    }

    // Die Liste der Workouts der Website (seit dieser Version Teil des Kraft-Feeds) fehlt noch
    (:strength)
    private function missingData() as Boolean {
        return Application.Storage.getValue("str") != null && Application.Storage.getValue("wom") == null;
    }

    (:nostrength)
    private function missingData() as Boolean {
        return false;
    }

    // Einmal laden; solange nicht gekoppelt, alle 20 s nachsehen, ob der Code eingegeben wurde.
    function start() as Void {
        refresh();
        if (_timer == null) {
            _timer = new Timer.Timer();
            (_timer as Timer.Timer).start(method(:poll), 20000, true);
        }
    }

    function stop() as Void {
        if (_timer != null) {
            (_timer as Timer.Timer).stop();
            _timer = null;
        }
    }

    function poll() as Void {
        if (!paired()) {
            refresh();
        }
    }

    function refresh() as Void {
        if (_busy) {
            return;
        }
        _busy = true;
        var secret = Application.Storage.getValue("secret");
        if (!(secret instanceof String)) {
            Communications.makeWebRequest(
                BASE + "/pair",
                { "model" => "MaraPlanna Lauf" },
                {
                    :method => Communications.HTTP_REQUEST_METHOD_POST,
                    :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onPair)
            );
        } else {
            Communications.makeWebRequest(
                BASE + "/run",
                { "date" => today() },
                {
                    :method => Communications.HTTP_REQUEST_METHOD_GET,
                    :headers => { "X-Watch-Secret" => secret },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onRun)
            );
        }
    }

    function onPair(code as Number, data as Dictionary or String or Null) as Void {
        _busy = false;
        lastError = code == 200 ? null : code;
        if (code == 200 && data instanceof Dictionary && data.get("secret") instanceof String) {
            Application.Storage.setValue("secret", data.get("secret") as String);
            Application.Storage.setValue("code", data.get("code") as String);
        }
        _onChange.invoke();
    }

    function onRun(code as Number, data as Dictionary or String or Null) as Void {
        _busy = false;
        lastError = code == 200 ? null : code;
        if (code != 200 || !(data instanceof Dictionary)) {
            _onChange.invoke(); // offline: zuletzt geladene Daten bleiben
            return;
        }
        if (data.hasKey("revoked")) {
            // Auf der Website entfernt: neu koppeln.
            Application.Storage.deleteValue("secret");
            Application.Storage.deleteValue("code");
            Application.Storage.deleteValue("run");
            Application.Storage.deleteValue("plan");
            Application.Storage.deleteValue("weeks");
            Application.Storage.deleteValue("str");
            Application.Storage.deleteValue("figs");
            Application.Storage.deleteValue("wom");
            for (var i = 0; i < 6; i++) {
                Application.Storage.deleteValue("wo" + i);
            }
            deleteLibrary();
            Application.Storage.deleteValue("synced");
        } else if (data.hasKey("code")) {
            Application.Storage.setValue("code", data.get("code") as String);
        } else if (data.hasKey("paces")) {
            Application.Storage.setValue("run", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            Application.Storage.setValue("synced", Time.now().value());
            Application.Storage.deleteValue("code");
            loadPlan();
        }
        _onChange.invoke();
        sendQueued();
    }

    // Schritte und absolvierte Einheiten laden (eigene Anfrage, damit der Hauptfeed klein bleibt). Klappt das nicht
    // (z. B. Server noch ohne diese Funktion), bleibt alles andere unberührt und die Uhr zeigt Titel und Kilometer.
    (:details)
    private function loadPlan() as Void {
        var secret = Application.Storage.getValue("secret");
        if (_loadingPlan || !(secret instanceof String)) {
            return;
        }
        _loadingPlan = true;
        Communications.makeWebRequest(
            BASE + "/plan",
            { "date" => today() },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Watch-Secret" => secret },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onPlan)
        );
    }

    (:nodetails)
    private function loadPlan() as Void {
        loadStrength();
    }

    (:details)
    function onPlan(code as Number, data as Dictionary or String or Null) as Void {
        _loadingPlan = false;
        if (code == 200 && data instanceof Dictionary && data.hasKey("days") && data.hasKey("done")) {
            Application.Storage.setValue("plan", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        }
        loadWeeks();
    }

    // Alle Wochen des Plans (Übersicht je Woche): eine eigene Anfrage, denn ein Wert im Speicher der Uhr fasst 8 KB.
    (:details)
    private function loadWeeks() as Void {
        var secret = Application.Storage.getValue("secret");
        if (!(secret instanceof String)) {
            loadStrength();
            return;
        }
        Communications.makeWebRequest(
            BASE + "/weeks",
            { "date" => today() },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Watch-Secret" => secret },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onWeeks)
        );
    }

    (:details)
    function onWeeks(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary && data.hasKey("weeks")) {
            Application.Storage.setValue("weeks", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        }
        loadStrength();
    }

    // Die Krafteinheiten von heute (Übungen, Zählart, gelernte Merkmale) und ihre Figuren: eine eigene Anfrage nach dem Plan,
    // denn ein Wert im Speicher der Uhr fasst 8 KB. "str" ohne Figuren, "figs" nur die Figuren.
    (:strength)
    private function loadStrength() as Void {
        var secret = Application.Storage.getValue("secret");
        if (_loadingStrength || !(secret instanceof String)) {
            return;
        }
        _loadingStrength = true;
        Communications.makeWebRequest(
            BASE + "/strength",
            { "date" => today() },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Watch-Secret" => secret },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onStrengthFeed)
        );
    }

    (:nostrength)
    private function loadStrength() as Void {
    }

    (:strength)
    function onStrengthFeed(code as Number, data as Dictionary or String or Null) as Void {
        _loadingStrength = false;
        // Was beim Laden schiefging (der Reiter Kraft zeigt es), damit ein alter Stand nicht still bleibt
        if (code != 200) {
            Application.Storage.setValue("strErr", code);
        } else {
            Application.Storage.deleteValue("strErr");
        }
        if (code == 200 && data instanceof Dictionary && data.hasKey("ready")) {
            Bg.storeStrength(data as Dictionary);
            // danach die Übungslisten der Muskelgruppen für "Kraft frei" (die von heute sind schon da)
            _libQueue = [] as Array<String>;
            for (var i = 0; i < StrengthLibrary.GROUPS.size(); i++) {
                var have = Application.Storage.getValue("lib." + StrengthLibrary.GROUPS[i]) as Object?;
                var fresh = have instanceof Dictionary && (have as Dictionary).get("d") instanceof String && ((have as Dictionary).get("d") as String).equals(today());
                if (!fresh) {
                    _libQueue.add(StrengthLibrary.GROUPS[i]);
                }
            }
            loadNextGroup();
        }
    }

    // Beim Entkoppeln die Übungslisten der Muskelgruppen löschen
    (:strength)
    private function deleteLibrary() as Void {
        for (var i = 0; i < StrengthLibrary.GROUPS.size(); i++) {
            Application.Storage.deleteValue("lib." + StrengthLibrary.GROUPS[i]);
        }
    }

    (:nostrength)
    private function deleteLibrary() as Void {
    }

    // Die Übungsliste der nächsten Muskelgruppe holen (eine Anfrage je Gruppe: alle zusammen wären zu viel für den Speicher)
    (:strength)
    private function loadNextGroup() as Void {
        var secret = Application.Storage.getValue("secret");
        if (_libQueue.size() == 0 || !(secret instanceof String)) {
            return;
        }
        var group = _libQueue[0];
        Communications.makeWebRequest(
            BASE + "/library",
            { "group" => group },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "X-Watch-Secret" => secret },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onGroup)
        );
    }

    (:strength)
    function onGroup(code as Number, data as Dictionary or String or Null) as Void {
        if (_libQueue.size() == 0) {
            return;
        }
        var group = _libQueue[0];
        _libQueue.remove(group);
        if (code == 200 && data instanceof Dictionary && data.hasKey("ex")) {
            var ex = data.get("ex");
            if (ex instanceof Array && ex.size() > 0) {
                Application.Storage.setValue("lib." + group, { "d" => today(), "ex" => ex } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            } else {
                Application.Storage.deleteValue("lib." + group);
            }
            loadNextGroup();
        } else {
            // keine Verbindung oder abgelehnt: die Kette endet, der nächste Abgleich versucht es wieder
            _libQueue = [] as Array<String>;
        }
    }

    // ---- Krafttraining: Sätze nach dem Training senden. Klappt das nicht (kein Handy, keine Verbindung), bleiben
    // sie gespeichert (höchstens drei Trainings) und gehen beim nächsten erfolgreichen Abgleich raus.

    private function queue() as Array<Application.Storage.ValueType> {
        var q = Application.Storage.getValue("strengthQueue");
        return q instanceof Array ? q as Array<Application.Storage.ValueType> : [] as Array<Application.Storage.ValueType>;
    }

    function postStrength(payload as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>, done as Method) as Void {
        var q = queue();
        q.add(payload);
        while (q.size() > 3) {
            q = q.slice(1, null) as Array<Application.Storage.ValueType>;
        }
        Application.Storage.setValue("strengthQueue", q);
        _strengthDone = done;
        sendQueued();
    }

    function sendQueued() as Void {
        if (_sendingStrength) {
            return;
        }
        var q = queue();
        var secret = Application.Storage.getValue("secret");
        if (q.size() == 0 || !(secret instanceof String)) {
            return;
        }
        _sendingStrength = true;
        Communications.makeWebRequest(
            BASE + "/strength",
            q[0] as Dictionary<Object, Object>,
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON, "X-Watch-Secret" => secret },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onStrength)
        );
    }

    function onStrength(code as Number, data as Dictionary or String or Null) as Void {
        _sendingStrength = false;
        var ok = code == 200;
        if (ok) {
            var q = queue();
            if (q.size() > 0) {
                Application.Storage.setValue("strengthQueue", q.slice(1, null) as Array<Application.Storage.ValueType>);
            }
        }
        if (_strengthDone != null) {
            (_strengthDone as Method).invoke(ok);
        }
        if (ok) {
            sendQueued();
            // Das Training steht jetzt beim Server: Daten neu laden, damit es unter "Absolviert" erscheint
            if (!_sendingStrength) {
                refresh();
            }
        }
    }

    // Lokales Datum JJJJ-MM-TT (der Plan rechnet in lokalen Tagen).
    static function today() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }
}
