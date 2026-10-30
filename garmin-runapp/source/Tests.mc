// Unit-Tests der reinen Logik (nur in Test-Builds: monkeyc -t, monkeydo ... /t).

import Toybox.Lang;
import Toybox.Math;
import Toybox.Test;
import Toybox.WatchUi;

(:test)
function testPaceParsing(logger as Logger) as Boolean {
    var range = Pace.parseRange("5:26-5:59") as Array<Number>;
    Test.assertEqual(range[0], 326);
    Test.assertEqual(range[1], 359);
    var single = Pace.parseRange("4:57") as Array<Number>;
    Test.assertEqual(single[0], 292);
    Test.assertEqual(single[1], 302);
    var swapped = Pace.parseRange("5:59-5:26") as Array<Number>;
    Test.assertEqual(swapped[0], 326);
    Test.assert(Pace.parseRange("abc") == null);
    Test.assert(Pace.parseRange("5:75") == null);
    Test.assert(Pace.parseRange("") == null);
    Test.assert(Pace.parseRange(null) == null);
    return true;
}

(:test)
function testPaceFromFeed(logger as Logger) as Boolean {
    var range = Pace.fromFeed([326.46, 359.59]) as Array<Number>;
    Test.assertEqual(range[0], 326);
    Test.assertEqual(range[1], 360);
    var single = Pace.fromFeed(271.57) as Array<Number>;
    Test.assertEqual(single[0], 267);
    Test.assertEqual(single[1], 277);
    Test.assert(Pace.fromFeed("x") == null);
    return true;
}

(:test)
function testFormatting(logger as Logger) as Boolean {
    Test.assertEqual(Pace.format(274, false), "4:34");
    Test.assertEqual(Pace.format(274.6, false), "4:35");
    Test.assertEqual(Pace.format(null, false), "--:--");
    Test.assertEqual(Pace.format(0, false), "--:--");
    Test.assertEqual(Pace.format(300, true), "8:03");
    Test.assertEqual(Pace.time(3723000), "1:02:03");
    Test.assertEqual(Pace.time(754000), "12:34");
    Test.assertEqual(Pace.distance(12345.6, false), "12,35");
    Test.assertEqual(Pace.distance(-0.0, false), "0,00");
    Test.assertEqual(Pace.distance(-3.0, false), "0,00");
    Test.assertEqual(Pace.distance(null, false), "0,00");
    Test.assertEqual(Pace.formatRange([326, 359] as Array<Number>, false), "5:26-5:59");
    return true;
}

(:test)
function testSmoothingAndCompare(logger as Logger) as Boolean {
    // 10 s für 36,5 m → 274 s/km
    var p = Pace.fromDelta(10000, 36.5) as Float;
    Test.assert(p > 273.5 && p < 274.5);
    Test.assert(Pace.fromDelta(10000, 1.0) == null);
    Test.assert(Pace.fromDelta(0, 30.0) == null);
    var target = [267, 277] as Array<Number>;
    Test.assertEqual(Pace.compare(260.0, target), -1);
    Test.assertEqual(Pace.compare(285.0, target), 1);
    Test.assertEqual(Pace.compare(270.0, target), 0);
    Test.assertEqual(Pace.compare(null, target), 0);
    Test.assertEqual(Pace.compare(260.0, null), 0);
    return true;
}

(:test)
function testWorkoutSteps(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Warm-up", "t" => "w", "d" => 2000, "lo" => 340, "hi" => 370, "z" => 1 },
        { "n" => "Interval 1/2", "t" => "a", "d" => 1000, "lo" => 270, "hi" => 278, "z" => 6 },
        { "n" => "Recovery", "t" => "r", "s" => 120, "z" => 3 },
        { "n" => "Interval 2/2", "t" => "a", "d" => 1000, "lo" => 270, "hi" => 278, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Intervals", 6, steps);
    Test.assertEqual(w.name(w.current()), "Warm-up");
    Test.assertEqual((w.target() as Array<Number>)[0], 340);
    // 1999 m: noch nicht fertig, 2000 m: nächster Schritt
    Test.assert(!w.update(700000, 1999.0));
    Test.assert(w.update(710000, 2000.0));
    Test.assertEqual(w.name(w.current()), "Interval 1/2");
    Test.assertEqual(w.stepZone(), 6);
    var left = w.remaining(770000, 2400.0) as Array;
    Test.assertEqual(left[0] as Numeric, 600);
    Test.assert(left[1] as Boolean);
    Test.assert(w.update(950000, 3000.0));
    // Trabpause: zeitbasiert und ohne Ziel
    Test.assert(w.target() == null);
    Test.assert(!w.update(1060000, 3300.0));
    Test.assert(w.update(1070000, 3330.0));
    // Runden-Taste überspringt den Rest des Schritts; nach dem letzten ist die Einheit fertig
    w.advance(1100000, 3400.0);
    Test.assert(w.finished);
    Test.assert(w.current() == null);
    Test.assert(w.target() == null);
    return true;
}

// Ein einzelner NaN-Wert der Distanz darf keinen Schritt beenden.
(:test)
function testWorkoutIgnoresInvalidDistance(logger as Logger) as Boolean {
    var steps = [{ "n" => "Einlaufen", "t" => "w", "d" => 2000, "z" => 1 }] as Array<Dictionary>;
    var w = new Workout("Test", 1, steps);
    var nan = Math.sqrt(-1.0).toFloat();
    Test.assert(!w.update(5000, nan));
    Test.assert(w.remaining(5000, nan) == null);
    Test.assert(!w.update(6000, 10.0));
    Test.assertEqual(w.name(w.current()), "Einlaufen");
    return true;
}

(:test)
function testWorkoutFromFeed(logger as Logger) as Boolean {
    var feed = { "workout" => { "title" => "Easy run", "z" => 1, "steps" => [{ "n" => "Easy", "t" => "a", "d" => 8000, "lo" => 340, "hi" => 370, "z" => 1 }] } };
    var w = Workout.fromFeed(feed) as Workout;
    Test.assertEqual(w.title, "Easy run");
    Test.assertEqual(w.size(), 1);
    Test.assert(Workout.fromFeed({ "workout" => null }) == null);
    Test.assert(Workout.fromFeed(null) == null);
    return true;
}

(:test)
function testZonesFromFeed(logger as Logger) as Boolean {
    var z = new PaceZones();
    z.loadFeed({
        "vdot" => 46.3,
        "units" => "km",
        "paces" => { "easy" => [326.46, 359.59], "long" => [329.73, 359.59], "recovery" => [359.59, 381.17], "marathon" => 297.19, "threshold" => 271.57, "interval" => 249.95, "repetition" => 235.39 }
    });
    Test.assertEqual(z.source, "MaraPlanna");
    Test.assert((z.vdot as Float) > 46.2);
    Test.assertEqual((z.range(5) as Array<Number>)[0], 267);
    Test.assertEqual((z.range(1) as Array<Number>)[1], 360);
    Test.assert(z.range(0) == null);
    Test.assert(z.hasAny());
    return true;
}

(:test)
function testHistoryCompresses(logger as Logger) as Boolean {
    var h = new History();
    for (var i = 0; i < 159; i++) {
        h.add(100, 3.0);
    }
    Test.assertEqual(h.count, 159);
    Test.assertEqual(h.seconds, 1);
    h.add(100, 3.0);
    // voll: je zwei Punkte zu einem, Abtastung halbiert
    Test.assertEqual(h.count, 80);
    Test.assertEqual(h.seconds, 2);
    Test.assertEqual(h.hr(0), 100);
    Test.assert((h.speed(79) - 3.0).abs() < 0.01);
    // neuer Punkt entsteht erst nach 2 s
    h.add(110, 4.0);
    Test.assertEqual(h.count, 80);
    h.add(110, 4.0);
    Test.assertEqual(h.count, 81);
    Test.assertEqual(h.hr(80), 110);
    // ohne Puls bleibt 0, und ein Punkt ohne Wert verfälscht den Mittelwert nicht
    var g = new History();
    g.add(null, 0.0);
    Test.assertEqual(g.hr(0), 0);
    return true;
}

(:test)
function testTrackAndGeo(logger as Logger) as Boolean {
    // 0,001° Breite ≈ 111 m, nach Norden = 0°, nach Osten = 90°
    var d = Geo.meters(48.2, 16.3, 48.201, 16.3);
    Test.assert(d > 110.0 && d < 112.5);
    Test.assert(Geo.bearing(48.2, 16.3, 48.201, 16.3).abs() < 0.001);
    Test.assert((Geo.bearing(48.2, 16.3, 48.2, 16.301) - Math.PI / 2).abs() < 0.001);

    var t = new Track();
    t.add(48.2, 16.3);
    t.add(48.2000001, 16.3); // zu nah am letzten Punkt: wird nicht gespeichert
    Test.assertEqual(t.count, 1);
    t.add(48.201, 16.3);
    t.add(48.202, 16.3);
    Test.assertEqual(t.count, 3);
    Test.assert(t.distanceToStart() > 220.0 && t.distanceToStart() < 225.0);
    // ungültige Positionen werden ignoriert
    t.add(0.0, 0.0);
    Test.assertEqual(t.count, 3);

    // läuft der Speicher voll, wird ausgedünnt (Start bleibt, Spur reicht weiter bis zum Ende)
    var long = new Track();
    for (var i = 0; i < 400; i++) {
        long.add(48.2 + i * 0.0002, 16.3);
    }
    Test.assert(long.count < 150 && long.count > 40);
    Test.assert((long.startLat() - 48.2).abs() < 0.0000001);
    Test.assert(long.curLat > 48.27);
    return true;
}

(:test)
function testPrediction(logger as Logger) as Boolean {
    // 1330 s geplant, davon 710 s gelaufen, dafür 770 s gebraucht: Rest 620 s mal 1,0845
    var p = Prediction.finish(1330.0, 710.0, 770.0) as Float;
    Test.assert((p - 1442.4).abs() < 0.5);
    // genau im Plan: Prognose = Plan
    Test.assert((Prediction.finish(1330.0, 710.0, 710.0) as Float - 1330.0).abs() < 0.01);
    // zu früh für eine Aussage
    Test.assert(Prediction.finish(1330.0, 60.0, 62.0) == null);
    // das Verhältnis ist begrenzt (Stehenbleiben sprengt die Prognose nicht)
    var capped = Prediction.finish(1330.0, 710.0, 3000.0) as Float;
    Test.assert((capped - (3000.0 + 620.0 * 1.5)).abs() < 0.5);
    // und nach unten ebenfalls: wer viel schneller läuft als geplant, bekommt höchstens 0,7 × Rest
    var floor = Prediction.finish(1330.0, 710.0, 300.0) as Float;
    Test.assert((floor - (300.0 + 620.0 * 0.7)).abs() < 0.5);
    // Toleranz: 1 %, mindestens 15 s
    Test.assertEqual(Prediction.status(1442.0, 1330.0), 1);
    Test.assertEqual(Prediction.status(1340.0, 1330.0), 0);
    Test.assertEqual(Prediction.status(1300.0, 1330.0), -1);
    Test.assertEqual(Prediction.status(12700.0, 12600.0), 0);
    // ohne Einheit: bisherige Zeit + Rest bei gleicher Pace
    var m = Prediction.atPace(1500.0, 5000.0, 10000.0, 300.0) as Float;
    Test.assert((m - 3000.0).abs() < 0.01);
    Test.assert(Prediction.atPace(1500.0, 5000.0, 5000.0, 300.0) == null);
    Test.assert(Prediction.atPace(1500.0, 5000.0, 10000.0, null) == null);
    Test.assertEqual(Prediction.clock(3723.0), "1:02:03");
    Test.assertEqual(Prediction.clock(null), "--:--");
    Test.assertEqual(Prediction.signed(42.0), "+0:42");
    Test.assertEqual(Prediction.signed(-75.0), "-1:15");
    return true;
}

(:test)
function testWorkoutStats(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Einlaufen", "t" => "w", "d" => 2000, "lo" => 340, "hi" => 370, "z" => 1 },
        { "n" => "Interval 1/2", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 },
        { "n" => "Trabpause", "t" => "r", "s" => 120, "z" => 3 },
        { "n" => "Interval 2/2", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Test", 6, steps);
    Test.assertEqual(w.activeCount(), 2);
    Test.assert(w.isActive(1) && !w.isActive(0) && !w.isActive(2));
    // geplant: 2 km à 355 + 250 + 120 + 250 s
    Test.assert((w.plannedTotal() - 1330.0).abs() < 0.5);
    Test.assert(w.plannedDone(0, 0.0) < 0.5);
    // Halbzeit des Einlaufens
    Test.assert((w.plannedDone(300000, 1000.0) - 355.0).abs() < 0.5);
    Test.assert((w.fraction(300000, 1000.0) - 0.5).abs() < 0.001);
    // Schritt 0 in 700 s für 2000 m abgeschlossen → 350 s/km
    Test.assert(w.update(700000, 2000.0));
    Test.assert((w.stepPace(0, 700000, 2000.0) as Float - 350.0).abs() < 0.5);
    Test.assert(w.isDone(0) && !w.isDone(1));
    Test.assert((w.plannedDone(700000, 2000.0) - 710.0).abs() < 0.5);
    // laufender Schritt: bisherige Pace, noch nicht gestarteter: keine
    Test.assert((w.stepPace(1, 950000, 3000.0) as Float - 250.0).abs() < 0.5);
    Test.assert(w.stepPace(3, 950000, 3000.0) == null);
    // Zielbereich je Schritt
    Test.assertEqual((w.stepTarget(1) as Array<Number>)[0], 245);
    Test.assert(w.stepTarget(2) == null);
    return true;
}

(:test)
function testPages(logger as Logger) as Boolean {
    var saved = Pages.mask();
    Pages.save(Pages.DEFAULT_MASK);
    // ohne Einheit fallen Intervall-Seiten weg; "Runden" ist standardmäßig aus
    var ids = Pages.active(null);
    Test.assert(ids.indexOf(Pages.OVERVIEW) >= 0 && ids.indexOf(Pages.MAP) >= 0 && ids.indexOf(Pages.FORECAST) >= 0);
    Test.assertEqual(ids.indexOf(Pages.INTERVAL), -1);
    Test.assertEqual(ids.indexOf(Pages.REPS), -1);
    Test.assertEqual(ids.indexOf(Pages.LAPS), -1);
    // mit Einheit kommt Intervall dazu, Reps erst ab zwei aktiven Schritten
    var one = new Workout("A", 1, [{ "n" => "Locker", "t" => "a", "d" => 8000, "z" => 1 }] as Array<Dictionary>);
    Test.assert(Pages.active(one).indexOf(Pages.INTERVAL) >= 0);
    Test.assertEqual(Pages.active(one).indexOf(Pages.REPS), -1);
    // Auswahl wird gespeichert; ohne jede Seite bleibt die Übersicht
    Pages.save(1 << Pages.HEART);
    Test.assertEqual(Pages.active(null).size(), 1);
    Test.assertEqual(Pages.active(null)[0], Pages.HEART);
    Pages.save(0);
    Test.assertEqual(Pages.active(null)[0], Pages.OVERVIEW);
    Pages.save(saved);
    return true;
}

(:test)
function testSwipeDirections(logger as Logger) as Boolean {
    Test.assertEqual(Swipe.step(WatchUi.SWIPE_LEFT), 1);
    Test.assertEqual(Swipe.step(WatchUi.SWIPE_UP), 1);
    Test.assertEqual(Swipe.step(WatchUi.SWIPE_RIGHT), -1);
    Test.assertEqual(Swipe.step(WatchUi.SWIPE_DOWN), -1);
    return true;
}
