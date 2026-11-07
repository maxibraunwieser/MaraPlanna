// Tests für Trainingsplan und Absolviert: Texte der Detailseiten, Zusammenführen der Listen, eigene Läufe.
// Laufen mit `monkeyc -t` und `monkeydo bin/test.prg <gerät> /t` (nicht Teil der App).

import Toybox.Application;
import Toybox.Lang;
import Toybox.Test;
import Toybox.Time;

(:test)
function testSessionTextLengths(logger as Logger) as Boolean {
    // Meter: unter 1 km immer in m, bei Wiederholungen bis 2 km; sonst km ohne überflüssiges ",0"
    Test.assertEqual(SessionText.meters(400, false, true), "400 m");
    Test.assertEqual(SessionText.meters(1000, false, true), "1000 m");
    Test.assertEqual(SessionText.meters(1000, false, false), "1 km");
    Test.assertEqual(SessionText.meters(1500, false, false), "1,5 km");
    Test.assertEqual(SessionText.meters(2000, false, true), "2 km");
    Test.assertEqual(SessionText.meters(10200, false, false), "10,2 km");
    Test.assertEqual(SessionText.meters(1609, true, false), "1 mi");
    Test.assertEqual(SessionText.meters(400, true, true), "0,25 mi");
    // Sekunden
    Test.assertEqual(SessionText.seconds(20), "20 s");
    Test.assertEqual(SessionText.seconds(120), "2 min");
    Test.assertEqual(SessionText.seconds(90), "1:30 min");
    return true;
}

(:test)
function testSessionTextStepLines(logger as Logger) as Boolean {
    // Wiederholungen: Name und "3 × 1000 m", darunter Zielpace und Trabpause je in einer Zeile
    var interval = { "n" => "Interval", "d" => 1000, "r" => 3, "rs" => 120, "lo" => 245, "hi" => 255 };
    var lines = SessionText.stepLines(interval, false);
    Test.assertEqual(lines.size(), 3);
    Test.assertEqual(lines[0].text, "Interval");
    Test.assertEqual(lines[0].value, "3 × 1000 m");
    Test.assertEqual(lines[1].text, "4:05-4:15 /km");
    Test.assertEqual(lines[1].style, DetailLine.DIM);
    Test.assertEqual(lines[2].text, "Trab 2 min");
    // Einzelner Schritt ohne Wiederholung und ohne Ziel (nach Gefühl): nur eine Zeile
    var easy = SessionText.stepLines({ "n" => "Easy", "d" => 8000 }, false);
    Test.assertEqual(easy.size(), 1);
    Test.assertEqual(easy[0].value, "8 km");
    // Zeit-Schritte (Steigerungen)
    var strides = SessionText.stepLines({ "n" => "Steigerung", "s" => 20, "r" => 6, "rs" => 60 }, false);
    Test.assertEqual(strides[0].value, "6 × 20 s");
    Test.assertEqual(strides[1].text, "Trab 1 min");
    // Kraftübung
    var lift = SessionText.stepLines({ "n" => "Bankdrücken", "x" => "3 × 8" }, false);
    Test.assertEqual(lift.size(), 1);
    Test.assertEqual(lift[0].value, "3 × 8");
    // Meilen: Pace pro Meile
    var mi = SessionText.stepLines({ "n" => "Easy", "d" => 8000, "lo" => 326, "hi" => 360 }, true);
    Test.assertEqual(mi[0].value, "5 mi");
    Test.assertEqual(mi[1].text, "8:45-9:39 /mi");
    return true;
}

(:test)
function testSessionTextPlanAndDone(logger as Logger) as Boolean {
    var today = WeekPlan.today();
    // Geplante Einheit ohne Schritte: freundlicher Hinweis statt leerer Seite
    var none = SessionText.planLines({ "t" => "Easy" }, false);
    Test.assertEqual(none.size(), 1);
    Test.assertEqual(none[0].text, "Keine Schritte hinterlegt");
    // Untertitel: Umfang, Minuten und Status; vergangene offene Einheit ist "verpasst"
    Test.assertEqual(SessionText.planSummary({ "k" => 9.0, "m" => 55, "s" => "p", "day" => today + 2 }, today, false), "9,0 km · ~55 min · geplant");
    Test.assertEqual(SessionText.planSummary({ "s" => "p", "day" => today - 1 }, today, false), "verpasst");
    Test.assertEqual(SessionText.planSummary({ "k" => 8.0, "s" => "c", "day" => today - 1 }, today, false), "8,0 km · erledigt");
    Test.assertEqual(SessionText.planSummary({ "s" => "x", "day" => today }, today, false), "ausgefallen");
    // Absolvierter Lauf: Zahlen, Ø-Pace aus Zeit und Strecke
    var run = SessionText.doneLines({ "k" => 10.0, "s" => 3000, "h" => 150, "e" => 85, "te" => 3.2, "pk" => 9.5 }, false);
    Test.assertEqual(run[0].text, "Distanz");
    Test.assertEqual(run[0].value, "10,0 km");
    Test.assertEqual(run[1].value, "9,5 km");
    Test.assertEqual(run[2].value, "50:00");
    Test.assertEqual(run[3].value, "5:00 /km");
    Test.assertEqual(run[4].value, "150");
    Test.assertEqual(run[5].value, "85 m");
    Test.assertEqual(run[6].value, "3,2");
    // Krafttraining: eine Zeile je Übung
    var lift = SessionText.doneLines({ "x" => [["Kniebeuge", "3 × 8 · 80 kg"], ["Rudern", "3 × 10"]] }, false);
    Test.assertEqual(lift.size(), 2);
    Test.assertEqual(lift[0].text, "Kniebeuge");
    Test.assertEqual(lift[1].value, "3 × 10");
    // Ohne jede Angabe
    Test.assertEqual(SessionText.doneLines({}, false)[0].text, "Keine Details gespeichert");
    return true;
}

// Zwei Tage vor "heute" liegt ein Lauf auf dem Server; ein eigener Lauf mit fast gleicher Startzeit zählt nicht doppelt,
// ein anderer schon. Neueste zuerst.
(:test)
function testFinishedMergesOwnRuns(logger as Logger) as Boolean {
    var savedPlan = Application.Storage.getValue("plan");
    var savedLog = Application.Storage.getValue("runLog");
    var savedRun = Application.Storage.getValue("run");
    var today = WeekPlan.today();
    var monday = WeekPlan.monday(today);
    var base = today - monday;
    var server1 = (today - 2) * WeekPlan.DAY_S + 6 * 3600;
    var server2 = (today - 5) * WeekPlan.DAY_S + 6 * 3600;
    Application.Storage.setValue("plan", {
        "v" => 1, "start" => WeekPlan.iso(monday), "days" => [],
        "done" => [
            { "i" => base - 5, "t" => "Long Run", "k" => 18.0, "s" => 6000, "ts" => server2 },
            { "i" => base - 2, "t" => "Easy Run", "k" => 8.0, "s" => 2700, "ts" => server1 }
        ]
    } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    var now = Time.now().value();
    Application.Storage.setValue("runLog", [
        { "ts" => server1 + 40, "m" => 8010, "s" => 2698, "t" => "Easy Run" },
        { "ts" => now - 600, "m" => 5000, "s" => 1500, "h" => 140, "t" => "Easy" }
    ] as Array<Application.Storage.ValueType>);
    var list = PlanData.finished(today);
    // Server-Lauf (gleiche Startzeit +-5 min) ersetzt den eigenen; der neuere eigene Lauf kommt dazu, ganz oben
    Test.assertEqual(list.size(), 3);
    Test.assertEqual(list[0].get("t") as Object, "Easy");
    Test.assertEqual(list[0].get("k") as Float, 5.0);
    Test.assertEqual(list[1].get("t") as Object, "Easy Run");
    Test.assertEqual(list[2].get("t") as Object, "Long Run");
    Test.assertEqual(list[2].get("day") as Number, today - 5);
    if (savedPlan == null) { Application.Storage.deleteValue("plan"); } else { Application.Storage.setValue("plan", savedPlan); }
    if (savedLog == null) { Application.Storage.deleteValue("runLog"); } else { Application.Storage.setValue("runLog", savedLog); }
    if (savedRun == null) { Application.Storage.deleteValue("run"); } else { Application.Storage.setValue("run", savedRun); }
    return true;
}

// Ohne Plandaten vom Server zeigt "Absolviert" die erledigten Einheiten aus dem Hauptfeed, und ein eigener Lauf am selben
// Tag wird nicht doppelt gezeigt; "Trainingsplan" fällt auf die Tage des Hauptfeeds zurück.
(:test)
function testPlanDataFallsBackToMainFeed(logger as Logger) as Boolean {
    var savedPlan = Application.Storage.getValue("plan");
    var savedLog = Application.Storage.getValue("runLog");
    var savedRun = Application.Storage.getValue("run");
    var today = WeekPlan.today();
    var monday = WeekPlan.monday(today);
    Application.Storage.deleteValue("plan");
    Application.Storage.setValue("run", {
        "week" => { "start" => WeekPlan.iso(monday), "done" => 8.0, "planned" => 30.0 },
        "days" => [
            { "i" => today - monday, "t" => "Heute", "k" => 7.0, "s" => "c" },
            { "i" => today - monday + 1, "t" => "Morgen", "k" => 6.0, "s" => "p" },
            { "i" => today - monday + 9, "t" => "Naechste Woche", "k" => 20.0, "s" => "p" }
        ]
    } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    Application.Storage.setValue("runLog", [{ "ts" => Time.now().value() - 300, "m" => 7000, "s" => 2400, "t" => "Heute" }] as Array<Application.Storage.ValueType>);
    var planned = PlanData.planned(today);
    Test.assertEqual(planned.size(), 3);
    Test.assertEqual(planned[1].get("t") as Object, "Morgen");
    Test.assertEqual(planned[1].get("day") as Number, today + 1);
    var done = PlanData.finished(today);
    Test.assertEqual(done.size(), 1);
    Test.assertEqual(done[0].get("t") as Object, "Heute");
    if (savedPlan == null) { Application.Storage.deleteValue("plan"); } else { Application.Storage.setValue("plan", savedPlan); }
    if (savedLog == null) { Application.Storage.deleteValue("runLog"); } else { Application.Storage.setValue("runLog", savedLog); }
    if (savedRun == null) { Application.Storage.deleteValue("run"); } else { Application.Storage.setValue("run", savedRun); }
    return true;
}

(:test)
function testRunLogKeepsTheLatest(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue("runLog");
    Application.Storage.deleteValue("runLog");
    var now = Time.now().value();
    for (var i = 0; i < 9; i++) {
        RunLog.add(now - 3600 * (9 - i), 5000.0 + i, 1500, i == 0 ? null : 140, "Lauf " + i);
    }
    var list = RunLog.list();
    Test.assertEqual(list.size(), RunLog.KEEP);
    Test.assertEqual(list[RunLog.KEEP - 1].get("t") as Object, "Lauf 8");
    Test.assertEqual(list[0].get("t") as Object, "Lauf 3");
    // Alte Einträge (über 28 Tage) fallen heraus
    RunLog.add(now - 40 * 86400, 5000.0, 1500, null, "Alt");
    Test.assert(RunLog.list().size() <= RunLog.KEEP);
    for (var i = 0; i < RunLog.list().size(); i++) {
        Test.assert(!"Alt".equals(RunLog.list()[i].get("t") as Object?));
    }
    if (saved == null) { Application.Storage.deleteValue("runLog"); } else { Application.Storage.setValue("runLog", saved); }
    return true;
}
