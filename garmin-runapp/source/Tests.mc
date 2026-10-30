// Unit-Tests der reinen Logik (nur in Test-Builds: monkeyc -t, monkeydo ... /t).

import Toybox.Lang;
import Toybox.Math;
import Toybox.Test;

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
