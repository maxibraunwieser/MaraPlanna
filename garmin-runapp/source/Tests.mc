// Unit-Tests der reinen Logik (nur in Test-Builds: monkeyc -t, monkeydo ... /t).

import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Test;
import Toybox.Weather;
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
    // ohne Einheit fallen Intervall-Seiten weg; alle anderen Seiten sind standardmäßig an
    var ids = Pages.active(null);
    Test.assert(ids.indexOf(Pages.OVERVIEW) >= 0 && ids.indexOf(Pages.MAP) >= 0 && ids.indexOf(Pages.FORECAST) >= 0);
    Test.assertEqual(ids.indexOf(Pages.INTERVAL), -1);
    Test.assertEqual(ids.indexOf(Pages.REPS), -1);
    Test.assert(ids.indexOf(Pages.PACES) >= 0);
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

(:test)
function testStartScreenNumbers(logger as Logger) as Boolean {
    Test.assertEqual(Pace.distance1(9480.0, false), "9,5");
    Test.assertEqual(Pace.distance1(12000.0, false), "12,0");
    Test.assertEqual(Pace.distance1(null, false), "0,0");
    Test.assertEqual(Pace.distance1(-5.0, false), "0,0");
    // geplante Strecke: Meter-Schritte plus Zeitschritte über ihre Pace (120 s bei 360 s/km = 333 m)
    var steps = [
        { "n" => "Einlaufen", "t" => "w", "d" => 2000, "lo" => 340, "hi" => 370, "z" => 1 },
        { "n" => "Trabpause", "t" => "r", "s" => 120, "z" => 3 }
    ] as Array<Dictionary>;
    var w = new Workout("Test", 1, steps);
    Test.assert((w.plannedMeters() - (2000.0 + 120.0 / 360.0 * 1000.0)).abs() < 1.0);
    return true;
}

// 3 m/s, 1 Hz: der erste Kilometer fällt zwischen 999 m (333 s) und 1002 m (334 s) → 333,33 s.
(:test)
function testSplitsInterpolateTheMark(logger as Logger) as Boolean {
    var s = new Splits();
    var done = false;
    for (var k = 1; k <= 334; k++) {
        done = s.update(k * 1000, 3.0 * k, 150, 1000.0);
        Test.assert(done == (k == 334));
    }
    Test.assertEqual(s.count, 1);
    Test.assert((s.duration(0) - 333333).abs() < 5);
    Test.assertEqual(s.hr(0), 150);
    return true;
}

(:test)
function testSplitsAveragePulsePerKilometer(logger as Logger) as Boolean {
    var s = new Splits();
    // erster Kilometer bei 4 m/s (250 s) mit Puls 150, zweiter bei 5 m/s (200 s) mit Puls 170, ohne Puls im dritten
    for (var k = 1; k <= 250; k++) {
        s.update(k * 1000, 4.0 * k, 150, 1000.0);
    }
    for (var k = 1; k <= 200; k++) {
        s.update((250 + k) * 1000, 1000.0 + 5.0 * k, 170, 1000.0);
    }
    for (var k = 1; k <= 200; k++) {
        s.update((450 + k) * 1000, 2000.0 + 5.0 * k, null, 1000.0);
    }
    Test.assertEqual(s.count, 3);
    Test.assertEqual(s.hr(0), 150);
    Test.assertEqual(s.hr(1), 170);
    Test.assertEqual(s.hr(2), 0);
    Test.assert((s.duration(0) - 250000).abs() < 5);
    Test.assert((s.duration(1) - 200000).abs() < 5);
    return true;
}

// Ohne GPS-Fix springt die Strecke auf 0 und danach zurück: das darf keinen Kilometer erzeugen.
(:test)
function testSplitsIgnoreInvalidDistance(logger as Logger) as Boolean {
    var s = new Splits();
    s.update(1000, 400.0, 140, 1000.0);
    s.update(2000, 0.0, 140, 1000.0);
    s.update(3000, 0.0, 140, 1000.0);
    Test.assertEqual(s.count, 0);
    s.update(4000, 800.0, 140, 1000.0);
    Test.assertEqual(s.count, 0);
    Test.assert(s.update(5000, 1200.0, 140, 1000.0));
    Test.assertEqual(s.count, 1);
    return true;
}

(:test)
function testSplitsShowAndHide(logger as Logger) as Boolean {
    var s = new Splits();
    Test.assert(!s.showing(0));
    s.update(100000, 999.0, 150, 1000.0);
    Test.assert(!s.showing(100000));
    s.update(101000, 1003.0, 150, 1000.0);
    Test.assert(s.showing(101000));
    Test.assert(s.showing(105000));
    Test.assert(!s.showing(110000));
    Test.assert(s.showing(102000));
    s.hide();
    Test.assert(!s.showing(102000));
    return true;
}

// Meilen: die Marke liegt bei 1609,344 m.
(:test)
function testSplitsMiles(logger as Logger) as Boolean {
    var s = new Splits();
    for (var k = 1; k <= 400; k++) {
        s.update(k * 1000, 4.0 * k, 150, Pace.M_PER_MI);
    }
    Test.assertEqual(s.count, 0);
    for (var k = 401; k <= 403; k++) {
        s.update(k * 1000, 4.0 * k, 150, Pace.M_PER_MI);
    }
    Test.assertEqual(s.count, 1);
    Test.assert((s.duration(0) - 402336).abs() < 5);
    return true;
}

// Ø-Puls je Schritt: zählt nur im laufenden Schritt, ignoriert fehlende Werte, nach dem Ende nichts mehr.
(:test)
function testWorkoutHeartRatePerStep(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Einlaufen", "t" => "w", "d" => 1000, "z" => 1 },
        { "n" => "Interval 1/1", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Test", 6, steps);
    w.addHeartRate(120);
    w.addHeartRate(null);
    w.addHeartRate(0);
    w.addHeartRate(140);
    Test.assertEqual(w.stepHeartRate(0), 130);
    Test.assertEqual(w.stepHeartRate(1), 0);
    Test.assert(w.update(300000, 1000.0));
    w.addHeartRate(170);
    w.addHeartRate(180);
    Test.assertEqual(w.stepHeartRate(1), 175);
    Test.assertEqual(w.stepHeartRate(0), 130);
    w.advance(560000, 2000.0);
    Test.assert(w.finished);
    w.addHeartRate(100);
    Test.assertEqual(w.stepHeartRate(1), 175);
    return true;
}

(:test)
function testPaceOffRange(logger as Logger) as Boolean {
    var range = [245, 255] as Array<Number>;
    Test.assert(Pace.offRange(250.0, range) == 0.0);
    Test.assert(Pace.offRange(245.0, range) == 0.0);
    Test.assert(Pace.offRange(255.0, range) == 0.0);
    Test.assert((Pace.offRange(240.0, range) + 5.0).abs() < 0.001);
    Test.assert((Pace.offRange(262.5, range) - 7.5).abs() < 0.001);
    return true;
}

// Pulszonen: Grenzen gehören zur höheren Zone, fehlende Werte zählen nicht.
(:test)
function testHeartZones(logger as Logger) as Boolean {
    var z = [95, 114, 133, 152, 171, 190] as Array<Number>;
    Test.assertEqual(HeartZones.zoneOf(60, z), 1);
    Test.assertEqual(HeartZones.zoneOf(113, z), 1);
    Test.assertEqual(HeartZones.zoneOf(114, z), 2);
    Test.assertEqual(HeartZones.zoneOf(151, z), 3);
    Test.assertEqual(HeartZones.zoneOf(152, z), 4);
    Test.assertEqual(HeartZones.zoneOf(171, z), 5);
    Test.assertEqual(HeartZones.zoneOf(210, z), 5);

    var t = new ZoneTime();
    for (var i = 0; i < 30; i++) {
        t.add(120, z);
    }
    for (var i = 0; i < 10; i++) {
        t.add(175, z);
    }
    t.add(null, z);
    t.add(0, z);
    Test.assertEqual(t.seconds[1], 30);
    Test.assertEqual(t.seconds[4], 10);
    Test.assertEqual(t.seconds[0], 0);
    Test.assertEqual(t.total(), 40);
    return true;
}

// Pace des letzten Kilometers bzw. der letzten Meile aus der Zwischenzeit.
(:test)
function testSplitsLastPace(logger as Logger) as Boolean {
    var s = new Splits();
    Test.assert(s.lastPace(1000.0) == null);
    // 4 m/s → 250 s für den ersten Kilometer
    for (var k = 1; k <= 250; k++) {
        s.update(k * 1000, 4.0 * k, 150, 1000.0);
    }
    Test.assert((s.lastPace(1000.0) as Float - 250.0).abs() < 0.1);
    // dieselbe Zeit für eine Meile wären 250 / 1,609 s je km
    Test.assert((s.lastPace(Pace.M_PER_MI) as Float - 250.0 * 1000.0 / Pace.M_PER_MI).abs() < 0.1);
    return true;
}

// Das letzte fertige Intervall (nicht Einlaufen, nicht Pause).
(:test)
function testWorkoutLastActiveDone(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Einlaufen", "t" => "w", "d" => 1000, "z" => 1 },
        { "n" => "Interval 1/2", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 },
        { "n" => "Trabpause", "t" => "r", "s" => 120, "z" => 3 },
        { "n" => "Interval 2/2", "t" => "a", "d" => 1000, "lo" => 245, "hi" => 255, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Test", 6, steps);
    Test.assertEqual(w.lastActiveDone(), -1);
    Test.assert(w.update(300000, 1000.0));
    Test.assertEqual(w.lastActiveDone(), -1);
    Test.assert(w.update(550000, 2000.0));
    Test.assertEqual(w.lastActiveDone(), 1);
    w.advance(680000, 2400.0);
    Test.assertEqual(w.lastActiveDone(), 1);
    w.advance(900000, 3400.0);
    Test.assert(w.finished);
    Test.assertEqual(w.lastActiveDone(), 3);
    return true;
}

// Trainingseffekt: Stufen nach Garmins Einteilung.
(:test)
function testTrainingEffectLevels(logger as Logger) as Boolean {
    Test.assertEqual(TrainingEffect.level(0.0), 0);
    Test.assertEqual(TrainingEffect.level(0.9), 0);
    Test.assertEqual(TrainingEffect.level(1.0), 1);
    Test.assertEqual(TrainingEffect.level(2.9), 2);
    Test.assertEqual(TrainingEffect.level(3.4), 3);
    Test.assertEqual(TrainingEffect.level(4.9), 4);
    Test.assertEqual(TrainingEffect.level(5.0), 5);
    Test.assertEqual(TrainingEffect.level(7.0), 5);
    Test.assertEqual(TrainingEffect.level(-1.0), 0);
    Test.assertEqual(TrainingEffect.label(3.4), "Verbessernd");
    Test.assertEqual(TrainingEffect.label(0.5), "Kein Effekt");
    return true;
}

// Anaerobe Schätzung: Gewicht je Pace, Summe und Skala 0 bis 5.
(:test)
function testAnaerobicLoad(logger as Logger) as Boolean {
    // Schwelle 4:30 (270), Intervall 4:10 (250), Wiederholung 3:55 (235)
    var a = new AnaerobicLoad(270.0, 250.0, 235.0);
    Test.assert(a.known());
    Test.assert(a.weight(300.0) == 0.0);
    Test.assert(a.weight(270.0) == 0.0);
    Test.assert((a.weight(260.0) - 0.5).abs() < 0.001);
    Test.assert((a.weight(250.0) - 1.0).abs() < 0.001);
    Test.assert((a.weight(242.5) - 1.5).abs() < 0.001);
    Test.assert((a.weight(235.0) - 2.0).abs() < 0.001);
    Test.assert((a.weight(223.25) - 2.5).abs() < 0.001);
    Test.assert((a.weight(200.0) - 3.0).abs() < 0.001);
    // GPS-Ausreißer zählen nicht
    Test.assert(a.weight(100.0) == 0.0);

    // ruhiger Lauf: 0; ohne bekannte Paces: keine Schätzung
    for (var s = 0; s < 3600; s++) {
        a.add(330.0);
    }
    Test.assert((a.score() as Float).abs() < 0.001);
    a.add(null);
    Test.assert(!(new AnaerobicLoad(null, 250.0, 235.0)).known());
    Test.assert((new AnaerobicLoad(null, 250.0, 235.0)).score() == null);
    Test.assert(!(new AnaerobicLoad(250.0, 270.0, 235.0)).known());

    // 3 x 1000 m an der Intervallpace: 3 x 250 s mit Gewicht 1 = 750 → etwa 2,3
    var b = new AnaerobicLoad(270.0, 250.0, 235.0);
    for (var s = 0; s < 750; s++) {
        b.add(250.0);
    }
    Test.assert((b.score() as Float - 2.32).abs() < 0.05);
    // mehr Belastung gibt einen höheren Wert, der nie über 5 steigt
    for (var s = 0; s < 20000; s++) {
        b.add(235.0);
    }
    Test.assert(b.score() as Float > 4.9 && b.score() as Float <= 5.0);
    return true;
}


// Wochenplan: Tage, Einheiten, Summen und Rennen aus dem MaraPlanna-Feed
function weekFeed() as Dictionary {
    return {
        "week" => { "start" => "2026-10-26", "done" => 12.3, "planned" => 40.0 },
        "days" => [
            { "i" => 0, "t" => "Easy", "k" => 8.0, "s" => "c" },
            { "i" => 1, "t" => "Intervalle", "k" => 7.5, "s" => "p" },
            { "i" => 1, "t" => "Core", "s" => "c" },
            { "i" => 3, "t" => "Easy", "k" => 6.0, "s" => "x" },
            { "i" => 9, "t" => "Long", "k" => 18.0, "s" => "p" }
        ],
        "race" => { "date" => "2026-11-05", "name" => "Wien" }
    } as Dictionary;
}

(:test)
function testWeekPlanDays(logger as Logger) as Boolean {
    // 2026-10-26 war ein Montag
    var mon = WeekPlan.parse("2026-10-26") as Number;
    Test.assertEqual(WeekPlan.weekday(mon), 0);
    Test.assertEqual(WeekPlan.weekday(mon + 6), 6);
    Test.assertEqual(WeekPlan.monday(mon + 3), mon);
    Test.assertEqual(WeekPlan.iso(mon), "2026-10-26");
    Test.assertEqual(WeekPlan.iso(mon + 6), "2026-11-01");
    Test.assertEqual(WeekPlan.parse("2026-11-05") as Number, mon + 10);
    Test.assert(WeekPlan.parse("2026-13-01") == null);
    Test.assert(WeekPlan.parse("abc") == null);
    Test.assert(WeekPlan.parse(null) == null);
    return true;
}

(:test)
function testWeekPlanSessions(logger as Logger) as Boolean {
    var mon = WeekPlan.parse("2026-10-26") as Number;
    var feed = weekFeed();
    Test.assertEqual(WeekPlan.sessions(feed, mon).size(), 1);
    Test.assertEqual(WeekPlan.sessions(feed, mon + 1).size(), 2);
    Test.assertEqual(WeekPlan.sessions(feed, mon + 2).size(), 0);
    Test.assertEqual(WeekPlan.sessions(feed, mon + 9).size(), 1);
    Test.assertEqual(WeekPlan.sessions(null, mon).size(), 0);
    // Der Feed gilt für zwei Wochen ab seinem Montag
    Test.assert(WeekPlan.covers(feed, mon + 13));
    Test.assert(!WeekPlan.covers(feed, mon + 14));
    Test.assert(!WeekPlan.covers(feed, mon - 1));
    Test.assert(!WeekPlan.covers(null, mon));
    // erledigt = alle nicht ausgefallenen Einheiten erledigt
    Test.assert(WeekPlan.allDone(WeekPlan.sessions(feed, mon)));
    Test.assert(!WeekPlan.allDone(WeekPlan.sessions(feed, mon + 1)));
    Test.assert(!WeekPlan.allDone(WeekPlan.sessions(feed, mon + 2)));
    Test.assert(!WeekPlan.allDone(WeekPlan.sessions(feed, mon + 3)));
    Test.assert(SessionRow.skippedAll(WeekPlan.sessions(feed, mon + 3)));
    // Tageszeile: Titel mit "+n", Kilometer ohne ausgefallene Einheiten
    Test.assertEqual(SessionRow.title(WeekPlan.sessions(feed, mon + 1)), "Intervalle +1");
    Test.assert((SessionRow.km(WeekPlan.sessions(feed, mon + 1)) - 7.5).abs() < 0.01);
    Test.assert(SessionRow.km(WeekPlan.sessions(feed, mon + 3)) == 0.0);
    return true;
}

(:test)
function testWeekPlanTotalsAndRace(logger as Logger) as Boolean {
    var mon = WeekPlan.parse("2026-10-26") as Number;
    var feed = weekFeed();
    var t = WeekPlan.totals(feed, mon + 3) as Array<Float>;
    Test.assert((t[0] - 12.3).abs() < 0.01 && (t[1] - 40.0).abs() < 0.01);
    // Summen gelten nur für die Woche des Feeds, nicht für die nächste
    Test.assert(WeekPlan.totals(feed, mon + 8) == null);
    Test.assert(WeekPlan.plannedKm(feed, mon + 8) == null);
    Test.assertEqual(WeekPlan.raceDays(feed, mon + 3) as Number, 7);
    Test.assertEqual(WeekPlan.raceDays(feed, mon + 10) as Number, 0);
    Test.assert(WeekPlan.raceDays(feed, mon + 11) == null);
    Test.assert(WeekPlan.raceDays(null, mon) == null);
    Test.assertEqual(WeekPlan.raceName(feed) as String, "Wien");
    return true;
}

(:test)
function testWeeklyKilometres(logger as Logger) as Boolean {
    var mon = WeekPlan.parse("2026-10-26") as Number;
    var feed = weekFeed();
    var saved = Application.Storage.getValue("weekLog");
    Application.Storage.deleteValue("weekLog");
    // ohne Daten: null (die Anzeige zeigt "--"), nur Server: dessen Wert
    Test.assert(WeekPlan.doneKm(null, mon) == null);
    Test.assert((WeekPlan.doneKm(feed, mon + 2) as Float - 12.3).abs() < 0.01);
    // eigener Lauf kleiner als der Wert von MaraPlanna: MaraPlanna gilt (kein Doppelzählen)
    WeekPlan.logRun(5000.0, mon + 2);
    Test.assert((WeekPlan.doneKm(feed, mon + 2) as Float - 12.3).abs() < 0.01);
    // eigene Läufe noch nicht bei MaraPlanna angekommen: zusammen mehr, also zählen sie
    WeekPlan.logRun(9000.0, mon + 3);
    Test.assert((WeekPlan.doneKm(feed, mon + 3) as Float - 14.0).abs() < 0.01);
    Test.assert((WeekPlan.doneKm(null, mon + 3) as Float - 14.0).abs() < 0.01);
    // eine neue Woche beginnt wieder bei null
    Test.assert(WeekPlan.doneKm(null, mon + 8) == null);
    WeekPlan.logRun(3000.0, mon + 8);
    Test.assert((WeekPlan.doneKm(null, mon + 8) as Float - 3.0).abs() < 0.01);
    // negative Werte (kein GPS) zählen nicht
    WeekPlan.logRun(-50.0, mon + 8);
    Test.assert((WeekPlan.doneKm(null, mon + 8) as Float - 3.0).abs() < 0.01);
    if (saved == null) {
        Application.Storage.deleteValue("weekLog");
    } else {
        Application.Storage.setValue("weekLog", saved);
    }
    return true;
}

// Countdown: je ein Impuls bei 5, 4, 3, 2, 1 Sekunden vor dem Wechsel, nicht mehr und nicht doppelt.
(:test)
function testStepCountdownTimeStep(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Intervall 1/2", "t" => "a", "d" => 1000, "lo" => 270, "hi" => 278, "z" => 6 },
        { "n" => "Trabpause", "t" => "r", "s" => 60, "z" => 3 },
        { "n" => "Intervall 2/2", "t" => "a", "d" => 1000, "lo" => 270, "hi" => 278, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Intervalle", 6, steps);
    var c = new StepCountdown();
    // Strecken-Schritt: bei 4,0 m/s sind 1000 m in 250 s geschafft. Restdistanz / Geschwindigkeit = Sekunden.
    var pulses = [] as Array<Number>;
    for (var t = 1; t <= 252; t++) {
        var dist = t * 4.0;
        var left = w.secondsLeft(t * 1000, dist, 4.0);
        if (c.due(left, t)) {
            pulses.add(t);
        }
        if (w.update(t * 1000, dist)) {
            c.reset();
            break;
        }
    }
    // 1000 m sind bei t = 250 erreicht: Impulse bei 245 (5 s vorher) bis 249 (1 s vorher)
    logger.debug("pulses " + pulses);
    Test.assertEqual(pulses.size(), 5);
    Test.assertEqual(pulses[0], 245);
    Test.assertEqual(pulses[4], 249);
    Test.assertEqual(w.name(w.current()), "Trabpause");
    // Zeit-Schritt (60 s) ist exakt: Impulse bei noch 5, 4, 3, 2, 1 Sekunden
    var base = 250000;
    var times = [] as Array<Number>;
    for (var t = 1; t <= 60; t++) {
        var left = w.secondsLeft(base + t * 1000, 1000.0 + t, null);
        if (c.due(left, t)) {
            times.add(60 - t);
        }
        w.update(base + t * 1000, 1000.0 + t);
    }
    Test.assertEqual(times.size(), 5);
    Test.assertEqual(times[0], 5);
    Test.assertEqual(times[4], 1);
    return true;
}

(:test)
function testStepCountdownEdges(logger as Logger) as Boolean {
    var steps = [
        { "n" => "Einlaufen", "t" => "w", "d" => 2000, "z" => 1 },
        { "n" => "Intervall", "t" => "a", "d" => 1000, "z" => 6 }
    ] as Array<Dictionary>;
    var w = new Workout("Test", 6, steps);
    // Der letzte Schritt hat keinen Wechsel mehr: kein Countdown
    w.advance(100000, 2000.0);
    Test.assert(w.secondsLeft(110000, 2990.0, 4.0) == null);
    // Auch ohne Geschwindigkeit (Stehen) lässt sich ein Strecken-Schritt nicht schätzen
    var w2 = new Workout("Test", 6, steps);
    Test.assert(w2.secondsLeft(1000, 1990.0, null) == null);
    Test.assert(w2.secondsLeft(1000, 1990.0, 0.3) == null);
    Test.assert(w2.secondsLeft(1000, 1990.0, 4.0) != null);
    // Schwankende Schätzung bei Strecken-Schritten: sie löst nur den Beginn aus, danach schlägt der Takt gleichmäßig
    // (ein Impuls je Aufruf, höchstens fünf), auch wenn die Schätzung hin und her springt
    var c = new StepCountdown();
    Test.assert(!c.due(null, 100));
    Test.assert(!c.due(6.2, 100));
    Test.assert(c.due(4.6, 100));
    Test.assert(c.due(4.9, 101));
    Test.assert(c.due(4.1, 102));
    Test.assert(c.due(2.9, 103));
    Test.assert(c.due(3.4, 104));
    Test.assert(!c.due(0.4, 105));
    Test.assert(!c.due(0.0, 106));
    // Wird man langsam (der Wechsel rückt weit weg), schweigt er und beginnt bei der nächsten Annäherung neu
    c.reset();
    Test.assert(c.due(4.0, 100));
    Test.assert(!c.due(12.0, 101));
    Test.assert(!c.due(9.0, 102));
    Test.assert(c.due(4.5, 103));
    // Neuer Schritt: von vorn
    c.reset();
    Test.assert(c.due(5.0, 100));
    // Der Countdown beginnt erst, wenn der Schritt schon SECONDS Sekunden läuft (kurze Schritte nicht zerhacken)
    c.reset();
    Test.assert(!c.due(3.0, 2));
    Test.assert(c.due(3.0, 5));
    // NaN
    c.reset();
    Test.assert(!c.due(Math.sqrt(-1.0).toFloat(), 100));
    return true;
}

(:test)
function testPrefs(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue("prefs");
    Application.Storage.deleteValue("prefs");
    // Standard: alles an, Einheiten automatisch
    Test.assert(Prefs.kmSummary() && Prefs.paceAlert() && Prefs.tones() && Prefs.vibration() && Prefs.weather() && Prefs.countdown());
    Test.assertEqual(Prefs.units(), Prefs.UNITS_AUTO);
    Test.assert(Prefs.miles(true));
    Test.assert(!Prefs.miles(false));
    // feste Wahl hat Vorrang
    Prefs.set("units", Prefs.UNITS_KM);
    Test.assert(!Prefs.miles(true));
    Prefs.set("units", Prefs.UNITS_MI);
    Test.assert(Prefs.miles(false));
    Prefs.set("units", 99);
    Test.assertEqual(Prefs.units(), Prefs.UNITS_AUTO);
    // Schalter bleiben einzeln gespeichert
    Prefs.set("km", false);
    Test.assert(!Prefs.kmSummary() && Prefs.paceAlert());
    if (saved == null) {
        Application.Storage.deleteValue("prefs");
    } else {
        Application.Storage.setValue("prefs", saved);
    }
    return true;
}

(:test)
function testChoices(logger as Logger) as Boolean {
    Test.assertEqual(Choices.list(null, null).size(), 1);
    Test.assertEqual(Choices.list(null, null)[0], Choices.FREE);
    var zones = new PaceZones();
    zones.loadFeed({ "units" => "km", "paces" => { "easy" => [326.0, 359.0], "marathon" => 297.0 } } as Dictionary);
    var list = Choices.list(zones, null);
    Test.assertEqual(list.size(), 3);
    Test.assertEqual(list[0], 1);
    Test.assertEqual(list[1], 4);
    Test.assertEqual(list[2], Choices.FREE);
    // mit Einheit für heute steht sie vorne
    var wk = new Workout("A", 1, [{ "n" => "Locker", "t" => "a", "d" => 8000, "z" => 1 }] as Array<Dictionary>);
    Test.assertEqual(Choices.list(zones, wk)[0], Choices.TODAY);
    Test.assertEqual(Choices.list(zones, wk).size(), 4);
    return true;
}

(:test)
function testWeatherKinds(logger as Logger) as Boolean {
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_CLEAR), Vitals.CLEAR);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_PARTLY_CLOUDY), Vitals.PARTLY);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_CLOUDY), Vitals.CLOUDY);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_LIGHT_RAIN), Vitals.RAIN);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_SNOW), Vitals.SNOW);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_THUNDERSTORMS), Vitals.STORM);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_FOG), Vitals.FOG);
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_WINDY), Vitals.WIND);
    // unbekannt: bewölkt (neutral)
    Test.assertEqual(Vitals.kindOf(Weather.CONDITION_UNKNOWN), Vitals.CLOUDY);
    return true;
}

(:test)
function testClockAndDate(logger as Logger) as Boolean {
    var parts = Vitals.clock();
    Test.assertEqual(parts.size(), 2);
    Test.assertEqual(parts[0].length(), 2);
    Test.assertEqual(parts[1].length(), 2);
    Test.assert(Vitals.dateText().length() > 4);
    return true;
}


(:test)
function testPaceSmoother(logger as Logger) as Boolean {
    var s = new PaceSmoother();
    // ein einziger Messpunkt: noch keine Pace; ab dem zweiten gibt es einen Wert
    Test.assert(s.pace(20) == null);
    s.add(1000, 3.0, 3.0);
    Test.assert(s.pace(20) == null);
    s.add(2000, 6.0, 3.0);
    Test.assert((s.pace(20) as Float - 333.3).abs() < 1.0);
    // Geschwindigkeit schwankt um 3,0 m/s (+-0,4): die Pace bleibt über 20 s ruhig bei 333 s/km
    s.reset();
    for (var t = 1; t <= 40; t++) {
        s.add(t * 1000, t * 3.0, 3.0 + (t % 2 == 0 ? 0.4 : -0.4));
    }
    Test.assert((s.pace(20) as Float - 333.3).abs() < 4.0);
    Test.assert((s.pace(30) as Float - 333.3).abs() < 4.0);
    // Stehen bleiben: keine Pace
    s.reset();
    for (var t = 1; t <= 20; t++) {
        s.add(t * 1000, 10.0, 0.0);
    }
    Test.assert(s.pace(10) == null);
    // Ohne Geschwindigkeit gilt die Strecke über das Fenster
    s.reset();
    for (var t = 1; t <= 30; t++) {
        s.add(t * 1000, t * 3.0, null);
    }
    Test.assert((s.pace(20) as Float - 333.3).abs() < 1.0);
    return true;
}

// Geschwindigkeit der letzten Sekunden aus der Strecke: folgt einem Tempowechsel sofort.
(:test)
function testPaceSmootherSpeedOver(logger as Logger) as Boolean {
    var s = new PaceSmoother();
    Test.assert(s.speedOver(4) == null);
    s.add(1000, 0.0, 3.0);
    Test.assert(s.speedOver(4) == null);
    // 10 s mit 3 m/s, dann 4 s mit 5 m/s: die Geschwindigkeit über 4 s ist schon die neue
    var dist = 0.0;
    for (var t = 2; t <= 11; t++) {
        dist += 3.0;
        s.add(t * 1000, dist, 3.0);
    }
    Test.assert((s.speedOver(4) as Float - 3.0).abs() < 0.01);
    for (var t = 12; t <= 15; t++) {
        dist += 5.0;
        s.add(t * 1000, dist, 5.0);
    }
    Test.assert((s.speedOver(4) as Float - 5.0).abs() < 0.01);
    // nach einem Neubeginn zählt nur, was seitdem gemessen wurde
    s.reset();
    Test.assert(s.speedOver(4) == null);
    s.add(16000, dist, 5.0);
    s.add(17000, dist + 2.0, 2.0);
    Test.assert((s.speedOver(4) as Float - 2.0).abs() < 0.01);
    return true;
}

// Neuer Intervall: Die Glättung beginnt bei null, die alte Pace fließt nicht ein, der Anlauf zählt nicht mit.
(:test)
function testPaceSmootherRestartAtStep(logger as Logger) as Boolean {
    var s = new PaceSmoother();
    // 40 s Trab mit 3,0 m/s (5:33), dann beginnt der Intervall mit 4,4 m/s (3:47) nach 4 s Beschleunigung
    for (var t = 1; t <= 40; t++) {
        s.add(t * 1000, t * 3.0, 3.0);
    }
    s.reset();
    var ramp = [3.4, 3.8, 4.1, 4.3] as Array<Float>;
    var dist = 120.0;
    for (var k = 0; k < 14; k++) {
        var v = k < 4 ? ramp[k] : 4.4;
        dist += v;
        s.add((41 + k) * 1000, dist, v);
        var p = s.pace(20);
        if (k == 1) {
            // zwei Sekunden nach dem Start gibt es schon einen Wert, und er ist schon näher an der neuen Pace
            Test.assert(p != null && (p as Float) < 300.0);
        }
        if (k == 7) {
            // acht Sekunden nach dem Start: ohne Anlauf schon innerhalb von 3 % der neuen Pace (227 s/km)
            logger.debug("pace after 8 s: " + p);
            Test.assert(p != null && ((p as Float) - 227.3).abs() < 227.3 * 0.03);
        }
    }
    return true;
}

// Die Uhr glättet ihre Geschwindigkeit selbst (currentSpeed hinkt hinterher). Nach der Trabpause darf davon im Intervall nichts
// mehr zu sehen sein: Modell wie SimRun (Zeitkonstante 6 s, 3 s Beschleunigung), Trab 6:30, Intervall 4:00.
(:test)
function testPaceSmootherLaggingWatchSpeed(logger as Logger) as Boolean {
    var s = new PaceSmoother();
    var dist = 0.0;
    var watch = 1000.0 / 390.0;
    var jog = 1000.0 / 390.0;
    var rep = 1000.0 / 240.0;
    var k = 1.0 - Math.pow(Math.E, -1.0 / 6.0).toFloat();
    for (var t = 1; t <= 60; t++) {
        dist += jog;
        s.add(t * 1000, dist, watch);
    }
    // neuer Schritt: Intervall
    s.reset();
    s.add(60000, dist, watch);
    var worstAfter8 = 0.0;
    for (var sec = 1; sec <= 40; sec++) {
        var v = sec <= 3 ? jog + (rep - jog) * sec / 3.0 : rep;
        dist += v;
        watch += (v - watch) * k;
        s.add((60 + sec) * 1000, dist, watch);
        var p = s.pace(20) as Float;
        var off = (p - 240.0).abs() / 240.0;
        if (sec == 10 || sec == 20) {
            logger.debug("rep +" + sec + " s: shown " + p + " s/km, watch speed alone " + (1000.0 / watch) + " s/km");
        }
        if (sec >= 8) {
            worstAfter8 = off > worstAfter8 ? off : worstAfter8;
        }
    }
    logger.debug("worst from 8 s on: " + (worstAfter8 * 100) + " %");
    // ab 8 s im Intervall höchstens 3 % neben 4:00 (7 s/km)
    Test.assert(worstAfter8 < 0.03);
    return true;
}

// Automatisch laden: 6:30, dann alle 30 Minuten bis 22:00, nachts nicht.
(:test)
function testAutoSyncSlots(logger as Logger) as Boolean {
    var h = 3600;
    var m = 60;
    Test.assertEqual(AutoSync.secondsToNext(0), 6 * h + 30 * m);              // Mitternacht → 6:30
    Test.assertEqual(AutoSync.secondsToNext(6 * h + 29 * m), 1 * m);          // 6:29 → 6:30
    Test.assertEqual(AutoSync.secondsToNext(6 * h + 30 * m), 30 * m);         // 6:30 (läuft gerade) → 7:00
    Test.assertEqual(AutoSync.secondsToNext(6 * h + 45 * m), 15 * m);         // 6:45 → 7:00
    Test.assertEqual(AutoSync.secondsToNext(12 * h + 1 * m), 29 * m);         // 12:01 → 12:30
    Test.assertEqual(AutoSync.secondsToNext(21 * h + 45 * m), 15 * m);        // 21:45 → 22:00
    Test.assertEqual(AutoSync.secondsToNext(22 * h), 8 * h + 30 * m);         // 22:00 → 6:30 am nächsten Morgen
    Test.assertEqual(AutoSync.secondsToNext(23 * h + 10 * m), 7 * h + 20 * m); // 23:10 → 6:30
    Test.assert(AutoSync.inWindow(6 * h + 30 * m));
    Test.assert(AutoSync.inWindow(22 * h + 1 * m));
    Test.assert(!AutoSync.inWindow(3 * h));
    Test.assert(!AutoSync.inWindow(6 * h));
    return true;
}

// Eine Runde ist Intervall + Trabpause; Einlaufen und Auslaufen sind eigene Runden.
(:test)
function testRoundsIntervalWithRecovery(logger as Logger) as Boolean {
    var w = new Workout("3x400", 6, [
        { "n" => "Einlaufen", "t" => "w", "d" => 400 },
        { "n" => "Interval 1/3", "t" => "a", "d" => 400, "lo" => 235, "hi" => 245 },
        { "n" => "Trabpause", "t" => "r", "s" => 60 },
        { "n" => "Interval 2/3", "t" => "a", "d" => 400, "lo" => 235, "hi" => 245 },
        { "n" => "Trabpause", "t" => "r", "s" => 60 },
        { "n" => "Interval 3/3", "t" => "a", "d" => 400, "lo" => 235, "hi" => 245 },
        { "n" => "Auslaufen", "t" => "c", "d" => 300 }
    ] as Array<Dictionary>);
    var laps = 1;
    var rounds = [] as Array<Number>;
    var ms = 0;
    var dist = 0.0;
    for (var i = 0; i < 7; i++) {
        rounds.add(laps);
        ms += 100000;
        dist += 400.0;
        w.advance(ms, dist);
        if (w.startsRound()) {
            laps += 1;
        }
    }
    // Einlaufen 1, Intervall 1 + Pause 2, Intervall 2 + Pause 3, Intervall 3 4, Auslaufen 5
    Test.assertEqual(rounds.toString(), [1, 2, 2, 3, 3, 4, 5].toString());
    Test.assert(w.finished);
    // Die Trabpause trägt die Nummer ihres Intervalls
    Test.assertEqual(w.label(2), "Trabpause 1/3");
    Test.assertEqual(w.label(4), "Trabpause 2/3");
    Test.assertEqual(w.label(3), "Interval 2/3");
    Test.assertEqual(w.label(0), "Einlaufen");
    return true;
}

// Zusammenfassung eines schnellen Teils: Strecke, Zeit, Ø-Pace des Teils und Ø-Pace aller schnellen Teile bis dahin.
(:test)
function testStepSummaryValues(logger as Logger) as Boolean {
    var w = new Workout("Long", 4, [
        { "n" => "Long run", "t" => "a", "d" => 20000 },
        { "n" => "Marathon pace", "t" => "a", "d" => 5000 }
    ] as Array<Dictionary>);
    // 20 km in 1:50:00 (5:30), dann 5 km in 25:00 (5:00)
    w.advance(6600000, 20000.0);
    Test.assertEqual(w.doneMeters(0), 20000.0);
    Test.assertEqual(w.doneMs(0), 6600000);
    Test.assert(((w.activeAveragePace(0) as Float) - 330.0).abs() < 0.1);
    Test.assert(w.startsRound());
    w.advance(6600000 + 1500000, 25000.0);
    Test.assert(((Pace.fromDelta(w.doneMs(1), w.doneMeters(1)) as Float) - 300.0).abs() < 0.1);
    // Ø beider Abschnitte: 2:15:00 auf 25 km = 5:24
    Test.assert(((w.activeAveragePace(1) as Float) - 324.0).abs() < 0.1);
    Test.assertEqual(w.activeNumber(1), 2);
    return true;
}

// Läufe ohne Schritte: ein Spurt oder Stehenbleiben beginnt das Fenster von selbst neu; Rauschen nicht.
(:test)
function testPaceSmootherFollowsChanges(logger as Logger) as Boolean {
    var s = new PaceSmoother();
    var dist = 0.0;
    // 60 s gleichmäßig mit 3,33 m/s (5:00) und Rauschen: die Anzeige bleibt ruhig
    var lo = 1000.0;
    var hi = 0.0;
    for (var t = 1; t <= 60; t++) {
        var v = 3.33 + Math.sin(t * 2.7).toFloat() * 0.2;
        dist += v;
        s.add(t * 1000, dist, v);
        var p = s.pace(20);
        if (t > 30 && p != null) {
            lo = (p as Float) < lo ? (p as Float) : lo;
            hi = (p as Float) > hi ? (p as Float) : hi;
        }
    }
    logger.debug("steady range " + lo + " .. " + hi);
    Test.assert(hi - lo < 8.0);
    // Spurt auf 4,17 m/s (4:00): nach zehn Sekunden innerhalb von 5 % der neuen Pace
    for (var t = 61; t <= 75; t++) {
        var v = 4.17 + Math.sin(t * 2.7).toFloat() * 0.2;
        dist += v;
        s.add(t * 1000, dist, v);
        if (t == 71) {
            var p = s.pace(20) as Float;
            logger.debug("pace 10 s into the surge: " + p);
            Test.assert((p - 240.0).abs() < 240.0 * 0.05);
        }
    }
    // Stehenbleiben: sofort keine Pace statt eines Mischwerts
    for (var t = 76; t <= 86; t++) {
        s.add(t * 1000, dist, 0.0);
    }
    Test.assert(s.pace(20) == null);
    return true;
}

(:test)
function testPaceSmoothingSetting(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue("prefs");
    Application.Storage.deleteValue("prefs");
    Test.assertEqual(Prefs.paceSeconds(), 20);
    Prefs.set("smooth", 1);
    Test.assertEqual(Prefs.paceSeconds(), 20);
    Prefs.set("smooth", 2);
    Test.assertEqual(Prefs.paceSeconds(), 30);
    Prefs.set("smooth", 0);
    Test.assertEqual(Prefs.paceSeconds(), 10);
    Prefs.set("smooth", 9);
    Test.assertEqual(Prefs.paceSeconds(), 20);
    if (saved == null) {
        Application.Storage.deleteValue("prefs");
    } else {
        Application.Storage.setValue("prefs", saved);
    }
    return true;
}
