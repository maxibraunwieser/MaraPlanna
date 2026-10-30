// Kopplung mit MaraPlanna und Laden der Paces + heutigen Einheit (über das Handy).
// Gleiche Kopplung wie beim Zifferblatt: die Uhr zeigt einen 6-stelligen Code,
// der auf der Website eingegeben wird. Storage: "secret", "code", "run".

import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

class Sync {
    private const BASE = "https://rynujdcggyafilncmcbr.supabase.co/functions/v1/watch";
    private var _timer as Timer.Timer?;
    private var _busy as Boolean = false;
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
        } else if (data.hasKey("code")) {
            Application.Storage.setValue("code", data.get("code") as String);
        } else if (data.hasKey("paces")) {
            Application.Storage.setValue("run", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            Application.Storage.deleteValue("code");
        }
        _onChange.invoke();
    }

    // Lokales Datum JJJJ-MM-TT (der Plan rechnet in lokalen Tagen).
    static function today() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }
}
