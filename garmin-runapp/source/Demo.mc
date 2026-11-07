// Beispieldaten für Simulator-Tests und Screenshots: nur in Builds mit demo.jungle
// (der normale Build, monkey.jungle, lässt die (:demo)-Version weg).

import Toybox.Activity;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

module Demo {
    // Autopilot für Simulator-Tests: bedient die App über die echten Delegates
    // (Start, Seiten, Runde, Pause-Menü, Verwerfen-Rückfrage, Speichern) und schreibt
    // jeden Schritt in die Konsole, damit Screenshots dazu passen.
    (:demo)
    // Home -> Bereit-Bildschirm -> Start, alle neun Seiten durchblättern, Runde, Pause + Menü,
    // Seiten-Menü ("Pace-Vergleich" einschalten), zurück, Verwerfen-Rückfrage mit "Nein", Speichern.
    const STEPS = ["select", "select", "next", "next", "next", "next", "next", "next", "next", "next", "back", "select", "pages", "toggle", "back", "discard", "keep", "save"] as Array<String>;
    // Welchen Rundgang der Autopilot macht: "run" (der Lauf, oben) oder "strength" (Trainingsmenü mit den Krafteinheiten von heute,
    // die erste öffnen, beginnen; der Satz läuft dann mit den Beispielbewegungen von selbst). Leer = der Autopilot tut nichts.
    (:demo)
    const PILOT = "";
    (:demo)
    const STRENGTH_STEPS = ["menu", "open0", "select"] as Array<String>;
    (:demo)
    var stepIndex as Number = 0;
    (:demo)
    var timer as Timer.Timer? = null;

    (:live)
    function autopilot() as Void {
    }

    (:demo)
    function steps() as Array<String> {
        return PILOT.equals("strength") ? STRENGTH_STEPS : (PILOT.equals("run") ? STEPS : [] as Array<String>);
    }

    (:demo)
    function autopilot() as Void {
        if (stepIndex >= steps().size()) {
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
        // Menüs sind Karten: der Listener hinter dem Delegate weiß, um welches Menü es geht
        var l = d instanceof CardMenuDelegate ? (d as CardMenuDelegate).listener() : null;
        var action = steps()[stepIndex];
        stepIndex += 1;
        if (stepIndex >= steps().size() && timer != null) {
            // Der letzte Schritt gibt seinen Timer frei: eine App darf nur wenige Timer zugleich haben (Kraft braucht mehrere)
            (timer as Timer.Timer).stop();
            timer = null;
        }
        if (action.equals("menu")) {
            TrainMenu.show();
            autopilot();
            return;
        }
        if (action.find("open") == 0) {
            // "open0" ... "open2": die erste, zweite, dritte Einheit von heute
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            StrengthEntry.open(StrengthEntry.IDS[(action.substring(4, 5) as String).toNumber() as Number], WeekPlan.feed());
            autopilot();
            return;
        }
        var kind = l instanceof PauseMenuDelegate ? "pause-menu" : (l instanceof PagesMenuDelegate ? "pages-menu" : (d instanceof DiscardDelegate ? "discard" : "view"));
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
        if (d instanceof HomeDelegate) {
            openStart();
        } else if (l instanceof PauseMenuDelegate) {
            var ids = { "discard" => :discard, "save" => :save, "select" => :resume, "pages" => :pages };
            if (action.equals("back")) {
                WatchUi.popView(WatchUi.SLIDE_DOWN);
            } else {
                (l as PauseMenuDelegate).pick(ids.get(action) as Symbol);
            }
        } else if (l instanceof PagesMenuDelegate) {
            if (action.equals("toggle")) {
                // hier: "Pace-Vergleich" an
                (l as PagesMenuDelegate).toggle(new CardItem(Pages.PACES, "Pace-Vergleich", null, Draw.BLUE), true);
            } else {
                WatchUi.popView(WatchUi.SLIDE_RIGHT);
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

    // Wie "Training" im Menü: den Bereit-Bildschirm der heutigen Einheit öffnen.
    (:demo)
    function openStart() as Void {
        var view = new StartView(Choices.TODAY);
        WatchUi.pushView(view, new StartDelegate(view), WatchUi.SLIDE_LEFT);
    }

    // Der Simulator liefert nicht immer Wetter und VO2max; der Demo-Build zeigt dann Beispielwerte,
    // damit der Startbildschirm vollständig zu sehen ist. Der normale Build kennt diese Werte nicht.
    (:live)
    function weather() as Conditions? {
        return null;
    }

    (:demo)
    function weather() as Conditions? {
        return new Conditions(17, Vitals.PARTLY);
    }

    (:live)
    function vo2() as Number? {
        return null;
    }

    (:demo)
    function vo2() as Number? {
        return 52;
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

    // Der Simulator liefert keinen Trainingseffekt; im Demo-Build zeigt die End-Seite einen Beispielwert.
    (:live)
    function fakeEffect() as Float? {
        return null;
    }

    (:demo)
    function fakeEffect() as Float? {
        return 3.4;
    }

    (:live)
    function seed() as Void {
    }

    // Wie die Antwort von GET /watch/run für einen gekoppelten Läufer (VDOT 46).
    (:demo)
    function seed() as Void {
        Application.Storage.deleteValue("secret");
        Application.Storage.deleteValue("pages");
        Application.Storage.deleteValue("prefs");
        Application.Storage.deleteValue("code");
        Application.Storage.deleteValue("weekLog");
        Application.Storage.deleteValue("runLog");
        Application.Storage.deleteValue("plan");
        Application.Storage.deleteValue("weeks");
        var feed = {
            "v" => 1,
            "paired" => true,
            "vdot" => 46.3,
            "units" => "km",
            "goal" => { "m" => 42195, "s" => 13500 },
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
        } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;
        seedWeek(feed);
        seedStrength(feed);
        seedPlan(feed);
        Application.Storage.setValue("run", feed);
        Application.Storage.setValue("synced", Time.now().value() - 300);
    }

    // "Plan" wie die Antwort von GET /watch/plan: die Einheiten der Woche (aus seedWeek) mit Schritten, dazu ein paar
    // absolvierte Läufe und ein Krafttraining, als wären sie schon in MaraPlanna.
    (:demo)
    function seedPlan(feed as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>) as Void {
        // Uhren mit 128 KB Speicher haben die Listen nicht (PlanEntry) und kein Platz für die Beispieldaten
        if (System.getSystemStats().totalMemory < 200000) {
            return;
        }
        var today = WeekPlan.today();
        var monday = WeekPlan.monday(today);
        var easy = [{ "n" => "Easy", "d" => 8000, "lo" => 326, "hi" => 360 }] as Array<Application.Storage.ValueType>;
        var tempo = [
            { "n" => "Einlaufen", "d" => 2000, "lo" => 326, "hi" => 360 },
            { "n" => "Threshold", "d" => 4000, "lo" => 267, "hi" => 277 },
            { "n" => "Auslaufen", "d" => 1500, "lo" => 326, "hi" => 360 }
        ] as Array<Application.Storage.ValueType>;
        var intervals = [
            { "n" => "Einlaufen", "d" => 2000, "lo" => 326, "hi" => 360 },
            { "n" => "Interval", "d" => 1000, "r" => 3, "rs" => 120, "lo" => 245, "hi" => 255 },
            { "n" => "Auslaufen", "d" => 1500, "lo" => 326, "hi" => 360 }
        ] as Array<Application.Storage.ValueType>;
        var long = [{ "n" => "Long run", "d" => 18000, "lo" => 330, "hi" => 360 }] as Array<Application.Storage.ValueType>;
        var strides = [
            { "n" => "Easy", "d" => 6000, "lo" => 326, "hi" => 360 },
            { "n" => "Steigerung", "s" => 20, "r" => 6, "rs" => 60 }
        ] as Array<Application.Storage.ValueType>;
        var core = [
            { "n" => "Plank", "x" => "3 × 45 s" },
            { "n" => "Bankdrücken", "x" => "3 × 8" },
            { "n" => "Kniebeuge", "x" => "3 × 8" }
        ] as Array<Application.Storage.ValueType>;
        var days = [] as Array<Application.Storage.ValueType>;
        var src = feed.get("days") as Array;
        for (var i = 0; i < src.size(); i++) {
            var d = (src[i] as Dictionary).get("i") as Number;
            var t = (src[i] as Dictionary).get("t") as String;
            var steps = t.equals("Tempolauf") ? tempo : (t.equals("Long Run") ? long : (t.equals("Kraft & Core") ? core : (t.equals("Intervalle 3x1000") ? intervals : (d % 7 == 3 ? strides : easy))));
            var item = { "i" => d, "t" => t, "s" => (src[i] as Dictionary).get("s"), "st" => steps } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;
            var k = (src[i] as Dictionary).get("k");
            if (k != null) {
                item.put("k", k as Float);
            }
            days.add(item);
        }
        var base = today - monday;
        var morning = 6 * 3600 + 30 * 60;
        var done = [
            { "i" => base - 1, "t" => "Easy Run", "k" => 8.2, "s" => 2760, "h" => 143, "e" => 61, "te" => 2.6, "pk" => 8.0, "ts" => (today - 1) * WeekPlan.DAY_S + morning },
            { "i" => base - 2, "t" => "Kraft", "ts" => (today - 2) * WeekPlan.DAY_S + 17 * 3600, "x" => [["Bankdrücken", "3 × 8 · 60 kg"], ["Kniebeuge", "3 × 8 · 80 kg"], ["Rudern", "3 × 10 · 50 kg"]] },
            { "i" => base - 4, "t" => "Tempolauf", "k" => 9.3, "s" => 2830, "h" => 158, "e" => 74, "te" => 3.5, "pk" => 9.0, "ts" => (today - 4) * WeekPlan.DAY_S + morning },
            { "i" => base - 7, "t" => "Long Run", "k" => 18.4, "s" => 6420, "h" => 147, "e" => 142, "te" => 3.9, "pk" => 18.0, "ts" => (today - 7) * WeekPlan.DAY_S + morning }
        ] as Array<Application.Storage.ValueType>;
        Application.Storage.setValue("plan", { "v" => 1, "start" => WeekPlan.iso(monday), "days" => days, "done" => done } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        seedWeeks(monday, days);
    }

    // Übersicht aller Wochen wie nach GET /watch/weeks: diese und die nächste Woche aus den Einheiten oben, die übrigen frei erfunden
    (:demo)
    function seedWeeks(monday as Number, days as Array<Application.Storage.ValueType>) as Void {
        var weeks = [] as Array<Application.Storage.ValueType>;
        for (var w = 0; w < 12; w++) {
            var sessions = [] as Array<Application.Storage.ValueType>;
            var runs = 0;
            var strength = 0;
            var km = 0.0;
            if (w < 2) {
                for (var i = 0; i < days.size(); i++) {
                    var d = (days[i] as Dictionary).get("i") as Number;
                    if (d >= w * 7 && d < w * 7 + 7) {
                        var t = (days[i] as Dictionary).get("t") as String;
                        var k = (days[i] as Dictionary).get("k");
                        var isStrength = t.find("Kraft") != null;
                        runs += isStrength ? 0 : 1;
                        strength += isStrength ? 1 : 0;
                        km += k != null ? (k as Float) : 0.0;
                        sessions.add([d - w * 7, t, k != null ? k : 0, isStrength ? 40 : 45, (days[i] as Dictionary).get("s")] as Array<Application.Storage.ValueType>);
                    }
                }
            } else {
                var long = 16 + w;
                sessions = [[1, "Fahrtspiel 6x2", 8.0, 46, "p"], [3, "Kraft & Core", 0, 40, "p"], [4, "Easy Run", 7.0, 42, "p"], [6, "Long Run", long, long * 6, "p"]] as Array<Application.Storage.ValueType>;
                runs = 3;
                strength = 1;
                km = 8.0 + 7.0 + long;
            }
            weeks.add({ "n" => 6 + w, "i" => w * 7, "p" => w < 5 ? "b" : (w < 9 ? "u" : (w < 11 ? "p" : "t")), "k" => km.toNumber(), "r" => runs, "s" => strength, "d" => sessions } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        }
        Application.Storage.setValue("weeks", { "v" => 1, "start" => WeekPlan.iso(monday), "weeks" => weeks } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }

    // Kraft-Teil wie vom Server für jemanden, der alles auf der Website eingerichtet hat: der Hauptfeed sagt nur "eingerichtet",
    // die Einheiten von heute (drei zur Wahl) und ihre Figuren stehen im Speicher wie nach GET /watch/strength
    // (erzeugt von tools/gen-demo-strength.cjs mit dem Code des Servers; kurze Pausen für die Vorführung).
    (:demo)
    function seedStrength(feed as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>) as Void {
        // Uhren mit 128 KB Speicher haben kein Krafttraining (StrengthEntry); die Figurendaten passen dort nicht in den Speicher
        if (System.getSystemStats().totalMemory < 200000) {
            return;
        }
        feed.put("strength", { "ready" => true, "w" => "l", "u" => "kg", "auto" => true, "share" => false } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        var str = DemoStrength.str();
        str.put("d", Sync.today());
        Application.Storage.setValue("str", str);
        Application.Storage.setValue("figs", DemoStrength.figs());
        for (var i = 0; i < StrengthLibrary.GROUPS.size(); i++) {
            var chunk = DemoStrength.lib(StrengthLibrary.GROUPS[i]);
            if (chunk != null) {
                (chunk as Dictionary).put("d", Sync.today());
                Application.Storage.setValue("lib." + StrengthLibrary.GROUPS[i], chunk as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            }
        }
    }

    // Beispielbewegung des Handgelenks für den Simulator (er liefert keine Bewegung): alle 36 Sekunden ein Satz von 10 Sekunden,
    // dazwischen Ruhe mit etwas Rauschen. Drei Sätze nacheinander fühlen sich verschieden an wie drei Übungen (Drücken, Rudern,
    // Curl: andere Geschwindigkeit, andere Achse, andere Lage des Handgelenks), damit man die Erkennung der Übung sieht.
    // Je Satz: [Hz, Ausschlag x, y, z, Schwerkraft x, y, z]. Eine Lieferung = 25 Messpunkte.
    (:live)
    function accelBatch(second as Number) as Array<Array<Number>>? {
        return null;
    }

    (:demo)
    function pattern(index as Number) as Array<Float> {
        if (index == 0) {
            return [0.4, 0.0, 0.0, 380.0, 0.0, 0.0, 1000.0] as Array<Float>;
        }
        if (index == 1) {
            return [0.8, 300.0, 60.0, 0.0, 0.0, 1000.0, 0.0] as Array<Float>;
        }
        return [0.6, 330.0, 150.0, 0.0, 0.0, 500.0, 850.0] as Array<Float>;
    }

    (:demo)
    function accelBatch(second as Number) as Array<Array<Number>>? {
        var xs = [] as Array<Number>;
        var ys = [] as Array<Number>;
        var zs = [] as Array<Number>;
        var cycle = second % 36;
        var p = pattern((second / 36) % 3);
        for (var j = 0; j < 25; j++) {
            var tt = cycle + j / 25.0;
            var inSet = tt >= 6.0 && tt < 16.0;
            var w = inSet ? Math.sin(2.0 * Math.PI * p[0] * (tt - 6.0)) : 0.0;
            var noise = Math.sin((second * 25 + j) * 12.9898) * 5.0;
            xs.add((p[4] + p[1] * w + noise).toNumber());
            ys.add((p[5] + p[2] * w + noise * 0.7).toNumber());
            zs.add((p[6] + p[3] * w + noise * 0.4).toNumber());
        }
        return [xs, ys, zs] as Array<Array<Number>>;
    }

    // Beispielwoche wie vom Server: Montag der aktuellen Woche, zwei Wochen Einheiten (was vor heute
    // liegt, ist erledigt, ein Tag ausgefallen), Rennen in 90 Tagen. Heute ist die Einheit aus "workout".
    (:demo)
    function seedWeek(feed as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>) as Void {
        var today = WeekPlan.today();
        var monday = WeekPlan.monday(today);
        var now = today - monday;
        var titles = ["Easy Run", "Tempolauf", "Kraft & Core", "Easy Run", "", "Long Run", "Recovery"] as Array<String>;
        var km = [8.0, 9.0, 0.0, 6.0, 0.0, 18.0, 5.0] as Array<Float>;
        var days = [] as Array<Application.Storage.ValueType>;
        var done = 0.0;
        var planned = 0.0;
        for (var i = 0; i < 14; i++) {
            var d = i % 7;
            var title = titles[d];
            var k = km[d];
            if (i == now) {
                title = "Intervalle 3x1000";
                k = 7.1;
            }
            if (title.length() == 0) {
                continue;
            }
            var status = i < now ? (i == 2 ? "x" : "c") : "p";
            var entry = { "i" => i, "t" => title, "s" => status } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;
            if (k > 0) {
                entry.put("k", k);
            }
            days.add(entry);
            if (i < 7 && k > 0 && !status.equals("x")) {
                planned += k;
                done += status.equals("c") ? k : 0.0;
            }
        }
        feed.put("week", { "start" => WeekPlan.iso(monday), "done" => done, "planned" => planned } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        feed.put("days", days);
        feed.put("race", { "date" => WeekPlan.iso(today + 90), "name" => "Wien Marathon" } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }
}
