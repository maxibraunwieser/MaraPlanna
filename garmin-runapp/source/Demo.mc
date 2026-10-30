// Beispieldaten für Simulator-Tests und Screenshots: nur in Builds mit demo.jungle
// (der normale Build, monkey.jungle, lässt die (:demo)-Version weg).

import Toybox.Activity;
import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

module Demo {
    // Autopilot für Simulator-Tests: bedient die App über die echten Delegates
    // (Start, Seiten, Runde, Pause-Menü, Verwerfen-Rückfrage, Speichern) und schreibt
    // jeden Schritt in die Konsole, damit Screenshots dazu passen.
    (:demo)
    // Start, alle neun Seiten durchblättern, Runde, Pause + Menü, Seiten-Menü ("Runden" einschalten),
    // zurück, Verwerfen-Rückfrage mit "Nein", Speichern.
    const STEPS = ["select", "next", "next", "next", "next", "next", "next", "next", "next", "back", "select", "pages", "toggle", "back", "discard", "keep", "save"] as Array<String>;
    (:demo)
    var stepIndex as Number = 0;
    (:demo)
    var timer as Timer.Timer? = null;

    (:live)
    function autopilot() as Void {
    }

    (:demo)
    function autopilot() as Void {
        if (stepIndex >= STEPS.size()) {
            return;
        }
        if (timer == null) {
            System.println("demo ready");
            timer = new Timer.Timer();
        }
        (timer as Timer.Timer).start(new Lang.Method(Demo, :step), (stepIndex == 0 ? 12 : 5) * 1000, false);
    }

    (:demo)
    function step() as Void {
        var d = WatchUi.getCurrentView()[1];
        var action = STEPS[stepIndex];
        stepIndex += 1;
        var kind = d instanceof PauseMenuDelegate ? "pause-menu" : (d instanceof PagesMenuDelegate ? "pages-menu" : (d instanceof DiscardDelegate ? "discard" : "view"));
        System.println("autopilot " + stepIndex + ": " + action + " [" + kind + "]");
        var info = Activity.getActivityInfo();
        var rc = getApp().controller;
        if (rc != null && (rc as RecordingController).workout != null) {
            var wk = (rc as RecordingController).workout as Workout;
            var tm = (rc as RecordingController).timerMs(Activity.getActivityInfo());
            var ds = (rc as RecordingController).distance(Activity.getActivityInfo());
            System.println("  plan=" + wk.plannedTotal() + " done=" + wk.plannedDone(tm, ds) + " actual=" + tm / 1000.0 + " step=" + wk.index + " frac=" + wk.fraction(tm, ds));
        }
        if (info != null) {
            System.println("  dist=" + info.elapsedDistance + " timer=" + info.timerTime + " speed=" + info.currentSpeed + " hr=" + info.currentHeartRate + " view=" + WatchUi.getCurrentView()[0]);
        }
        if (d instanceof PauseMenuDelegate) {
            var ids = { "discard" => :discard, "save" => :save, "select" => :resume, "pages" => :pages };
            if (action.equals("back")) {
                d.onBack();
            } else {
                d.onSelect(new WatchUi.MenuItem("", null, ids.get(action) as Symbol, null));
            }
        } else if (d instanceof PagesMenuDelegate) {
            if (action.equals("toggle")) {
                // wie das Menü: Schalter ist schon umgelegt, dann onSelect (hier: "Runden" an)
                d.onSelect(new WatchUi.ToggleMenuItem("Runden", null, Pages.LAPS, true, null));
            } else {
                d.onBack();
            }
        } else if (d instanceof DiscardDelegate) {
            // "Nein" in der Rückfrage: Dialog schließen, zurück ins Menü.
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            d.onResponse(WatchUi.CONFIRM_NO);
        } else if (d instanceof WatchUi.BehaviorDelegate) {
            if (action.equals("next")) {
                d.onNextPage();
            } else if (action.equals("back")) {
                d.onBack();
            } else {
                d.onSelect();
            }
        }
        autopilot();
    }

    // True im Demo-Build: Beispiel-Paces und -Einheit, keine Kopplung.
    (:live)
    function active() as Boolean {
        return false;
    }

    (:demo)
    function active() as Boolean {
        return true;
    }

    (:live)
    function seed() as Void {
    }

    // Wie die Antwort von GET /watch/run für einen gekoppelten Läufer (VDOT 46).
    (:demo)
    function seed() as Void {
        Application.Storage.deleteValue("secret");
        Application.Storage.deleteValue("pages");
        Application.Storage.deleteValue("code");
        Application.Storage.setValue("run", {
            "v" => 1,
            "paired" => true,
            "vdot" => 46.3,
            "units" => "km",
            "paces" => {
                "easy" => [326.46, 359.59],
                "long" => [329.73, 359.59],
                "recovery" => [359.59, 381.17],
                "marathon" => 297.19,
                "threshold" => 271.57,
                "interval" => 249.95,
                "repetition" => 235.39
            },
            "workout" => {
                "title" => "Intervalle 3x1000",
                "z" => 6,
                "steps" => [
                    { "n" => "Einlaufen", "t" => "w", "d" => 2000, "lo" => 326, "hi" => 360, "z" => 1 },
                    { "n" => "Interval 1/3", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 },
                    { "n" => "Trabpause", "t" => "r", "s" => 120, "z" => 3 },
                    { "n" => "Interval 2/3", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 },
                    { "n" => "Trabpause", "t" => "r", "s" => 120, "z" => 3 },
                    { "n" => "Interval 3/3", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 },
                    { "n" => "Auslaufen", "t" => "c", "d" => 1500, "lo" => 326, "hi" => 360, "z" => 1 }
                ]
            }
        } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }
}
