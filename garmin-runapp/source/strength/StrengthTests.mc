// Unit-Tests des Krafttrainings (nur in Test-Builds: monkeyc -t).

import Toybox.Lang;
import Toybox.Math;
import Toybox.Test;

// Ein Satz aus Sinus-Wiederholungen auf der x-Achse: reps Wiederholungen mit freq Hz und amp milli-g,
// 25 Messpunkte pro Sekunde, dazu ein wenig Rauschen und die Schwerkraft auf z.
(:strength)
function feedSet(c as RepCounter, seconds as Number, reps as Number, freq as Float, amp as Float, startAt as Number) as Number {
    var n = seconds * 25;
    for (var i = 0; i < n; i++) {
        var t = i / 25.0;
        var moving = t < reps / freq;
        var noise = Math.sin((startAt + i) * 12.9898) * 5.0;
        var x = (moving ? amp * Math.sin(2.0 * Math.PI * freq * t) : 0.0) + noise;
        var y = (moving ? amp * 0.3 * Math.cos(2.0 * Math.PI * freq * t) : 0.0) + noise * 0.7;
        c.add(x.toNumber(), y.toNumber(), (1000.0 + noise * 0.4).toNumber());
    }
    return startAt + n;
}

(:test)
function testRepCounterCountsAndEndsSet(logger as Logger) as Boolean {
    var c = new RepCounter(25);
    var at = feedSet(c, 5, 0, 0.5, 0.0, 0);
    Test.assert(!c.active);
    // 8 Wiederholungen in 10 s (0,8 Hz), dann Ruhe
    at = feedSet(c, 16, 8, 0.8, 350.0, at);
    Test.assert(c.finished);
    logger.debug("reps=" + c.lastReps + " seconds=" + c.lastSeconds + " diag=" + c.lastDiag);
    Test.assert(c.lastReps >= 7 && c.lastReps <= 9);
    Test.assert(c.lastSeconds >= 8 && c.lastSeconds <= 13);
    return true;
}

(:test)
function testRepCounterSlowReps(logger as Logger) as Boolean {
    // Bankdrücken: etwa 4 s je Wiederholung, weniger Ausschlag
    var c = new RepCounter(25);
    var at = feedSet(c, 4, 0, 0.5, 0.0, 0);
    at = feedSet(c, 30, 6, 0.25, 160.0, at);
    Test.assert(c.finished);
    logger.debug("slow reps=" + c.lastReps + " diag=" + c.lastDiag);
    Test.assert(c.lastReps >= 5 && c.lastReps <= 7);
    return true;
}

(:test)
function testRepCounterIgnoresRestAndShortMoves(logger as Logger) as Boolean {
    var c = new RepCounter(25);
    var at = feedSet(c, 30, 0, 0.5, 0.0, 0);
    Test.assert(!c.active && !c.finished);
    // eine einzelne Bewegung (1 Wiederholung) ist kein Satz mit drei Wiederholungen
    at = feedSet(c, 10, 1, 0.8, 350.0, at);
    Test.assert(!c.finished || c.lastReps < 3);
    return true;
}

(:test)
function testRepCounterSecondSet(logger as Logger) as Boolean {
    var c = new RepCounter(25);
    var at = feedSet(c, 4, 0, 0.5, 0.0, 0);
    at = feedSet(c, 16, 8, 0.8, 350.0, at);
    Test.assert(c.finished);
    c.nextSet();
    Test.assert(!c.finished);
    at = feedSet(c, 8, 0, 0.5, 0.0, at);
    at = feedSet(c, 17, 10, 0.9, 300.0, at);
    Test.assert(c.finished);
    logger.debug("second set reps=" + c.lastReps);
    Test.assert(c.lastReps >= 9 && c.lastReps <= 11);
    return true;
}

(:test)
function testStrengthPlanFromFeed(logger as Logger) as Boolean {
    Test.assertEqual(StrengthPlan.status(null), StrengthStatus.NONE);
    Test.assertEqual(StrengthPlan.status({ "strength" => { "ready" => false } } as Dictionary), StrengthStatus.SETUP);
    var feed = {
        "strength" => {
            "ready" => true, "u" => "lb", "auto" => false, "w" => "r",
            "ex" => [
                { "i" => "squat", "n" => "Kniebeuge", "f" => "squat" },
                { "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h" },
                { "i" => "row", "n" => "Rudern", "f" => "pull_h" }
            ],
            "today" => {
                "id" => "abc", "t" => "Test",
                "ex" => [
                    { "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h", "s" => 3, "r" => 8, "k" => 132.5, "rest" => 120 },
                    { "i" => "", "n" => "Wadenheben", "f" => "", "s" => 2, "r" => 15, "rest" => 90 }
                ]
            }
        }
    } as Dictionary;
    Test.assertEqual(StrengthPlan.status(feed), StrengthStatus.READY);
    var p = StrengthPlan.fromFeed(feed, true) as StrengthPlan;
    Test.assertEqual(p.title, "Test");
    Test.assertEqual(p.workoutId, "abc");
    Test.assertEqual(p.unit, "lb");
    Test.assert(!p.auto);
    Test.assertEqual(p.items.size(), 2);
    Test.assertEqual(p.items[0].sets, 3);
    Test.assert((p.items[0].kg - 132.5).abs() < 0.01);
    Test.assertEqual(p.items[1].id, "");
    Test.assertEqual(p.items[1].rest, 90);
    // geplante zuerst, dann die eigene Liste ohne Doppelte: Bankdrücken, Wadenheben, Kniebeuge, Rudern
    Test.assertEqual(p.options.size(), 4);
    Test.assertEqual(p.options[2].name, "Kniebeuge");
    Test.assert((p.step() - 5.0).abs() < 0.01);
    // freies Training: nur die eigene Liste
    var f = StrengthPlan.fromFeed(feed, false) as StrengthPlan;
    Test.assertEqual(f.items.size(), 0);
    Test.assertEqual(f.options.size(), 3);
    // nicht eingerichtet: kein Plan
    Test.assert(StrengthPlan.fromFeed({ "strength" => { "ready" => false } } as Dictionary, true) == null);
    return true;
}

(:test)
function testStrengthControllerNextPlanned(logger as Logger) as Boolean {
    var feed = {
        "strength" => {
            "ready" => true,
            "ex" => [{ "i" => "squat", "n" => "Kniebeuge", "f" => "squat" }],
            "today" => { "id" => "", "t" => "T", "ex" => [
                { "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h", "s" => 2, "r" => 8, "rest" => 60 },
                { "i" => "squat", "n" => "Kniebeuge", "f" => "squat", "s" => 1, "r" => 8, "rest" => 60 }
            ] }
        }
    } as Dictionary;
    var c = new StrengthController(StrengthPlan.fromFeed(feed, true) as StrengthPlan);
    Test.assertEqual(c.nextPlanned(), 0);
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 0, 20, [0, 0, 0, 0, 0, 0] as Array<Number>));
    Test.assertEqual(c.nextPlanned(), 0);
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 90, 20, [0, 0, 0, 0, 0, 0] as Array<Number>));
    Test.assertEqual(c.nextPlanned(), 1);
    c.sets.add(new LoggedSet("squat", "Kniebeuge", 6, 80.0, "plan", 200, 20, [0, 0, 0, 0, 0, 0] as Array<Number>));
    Test.assertEqual(c.nextPlanned(), -1);
    Test.assertEqual(c.totalReps(), 22);
    Test.assert((c.volume() - (8 * 60.0 + 8 * 60.0 + 6 * 80.0)).abs() < 0.01);
    return true;
}
