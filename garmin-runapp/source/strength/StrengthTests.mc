// Unit-Tests des Krafttrainings (nur in Test-Builds: monkeyc -t).

import Toybox.Application;
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
    // 8 Wiederholungen in 10 s (0,8 Hz), dann Ruhe (der Satz endet nach 5 s ohne Bewegung)
    at = feedSet(c, 20, 8, 0.8, 350.0, at);
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
    at = feedSet(c, 34, 6, 0.25, 160.0, at);
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
    at = feedSet(c, 20, 8, 0.8, 350.0, at);
    Test.assert(c.finished);
    c.nextSet();
    Test.assert(!c.finished);
    at = feedSet(c, 8, 0, 0.5, 0.0, at);
    at = feedSet(c, 21, 10, 0.9, 300.0, at);
    Test.assert(c.finished);
    logger.debug("second set reps=" + c.lastReps);
    Test.assert(c.lastReps >= 9 && c.lastReps <= 11);
    return true;
}

// Die Krafteinheiten und Figuren von heute stehen im Speicher ("str", "figs"); der Hauptfeed sagt nur, ob eingerichtet ist.
(:strength)
function seedStr(figs as Dictionary?) as Dictionary {
    var str = {
        "d" => Sync.today(),
        "ready" => true,
        "ex" => [
            { "i" => "squat", "n" => "Kniebeuge", "f" => "squat", "a" => "back_squat", "m" => 0 },
            { "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h", "a" => "bench_press", "m" => 0 },
            { "i" => "row", "n" => "Rudern", "f" => "pull_h", "m" => 0 }
        ],
        "sess" => [
            { "id" => "abc", "t" => "Test", "c" => "full", "ex" => [
                { "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h", "s" => 3, "r" => 8, "k" => 132.5, "rest" => 120, "a" => "bench_press", "m" => 0 },
                { "i" => "calf_machine", "n" => "Wadenheben", "f" => "calf", "s" => 2, "r" => 15, "rest" => 60, "m" => 1 },
                { "i" => "plank", "n" => "Plank", "f" => "core", "s" => 2, "r" => 0, "rest" => 45, "m" => 2, "h" => 40 }
            ] },
            { "id" => "def", "t" => "Core", "c" => "core", "ex" => [
                { "i" => "dead_bug", "n" => "Dead Bug", "f" => "core", "s" => 3, "r" => 10, "rest" => 45, "m" => 0 }
            ] }
        ],
        "sig" => { "bench_press" => [4, 36, 300, 80, 110, 90, 100, 4, 20, 6, 5, 5, 5] }
    } as Dictionary;
    Application.Storage.setValue("str", str as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    if (figs != null) {
        Application.Storage.setValue("figs", figs as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    } else {
        Application.Storage.deleteValue("figs");
    }
    return { "strength" => { "ready" => true, "u" => "lb", "auto" => false, "w" => "r", "share" => true } } as Dictionary;
}

(:test)
function testStrengthPlanFromFeed(logger as Logger) as Boolean {
    Test.assertEqual(StrengthPlan.status(null), StrengthStatus.NONE);
    Test.assertEqual(StrengthPlan.status({ "strength" => { "ready" => false } } as Dictionary), StrengthStatus.SETUP);
    var feed = seedStr(null);
    Test.assertEqual(StrengthPlan.status(feed), StrengthStatus.READY);
    // zwei Einheiten von heute zur Wahl
    var sess = StrengthPlan.sessions(feed);
    Test.assertEqual(sess.size(), 2);
    Test.assertEqual(sess[0].get("t") as Object, "Test" as Object);
    Test.assertEqual(sess[1].get("n") as Object, 1 as Object);
    var p = StrengthPlan.fromFeed(feed, 0) as StrengthPlan;
    Test.assertEqual(p.title, "Test");
    Test.assertEqual(p.workoutId, "abc");
    Test.assertEqual(p.kind, "full");
    Test.assertEqual(p.unit, "lb");
    Test.assert(!p.auto);
    Test.assertEqual(p.items.size(), 3);
    Test.assertEqual(p.items[0].sets, 3);
    Test.assert((p.items[0].kg - 132.5).abs() < 0.01);
    Test.assertEqual(p.items[0].key, "bench_press");
    // die Zählart und das Halten kommen mit
    Test.assertEqual(p.items[0].mode, CountMode.AUTO);
    Test.assertEqual(p.items[1].mode, CountMode.ASSIST);
    Test.assertEqual(p.items[2].mode, CountMode.TIME);
    Test.assertEqual(p.items[2].hold, 40);
    Test.assertEqual(p.items[2].reps, 0);
    Test.assertEqual(p.items[1].rest, 60);
    // geplante zuerst, dann die eigene Liste ohne Doppelte: Bankdrücken, Wadenheben, Plank, Kniebeuge, Rudern
    Test.assertEqual(p.options.size(), 5);
    Test.assertEqual(p.options[3].name, "Kniebeuge");
    Test.assertEqual(p.options[3].key, "back_squat");
    Test.assert((p.step() - 5.0).abs() < 0.01);
    // die zweite Einheit hat ihre eigenen Übungen
    var core = StrengthPlan.fromFeed(feed, 1) as StrengthPlan;
    Test.assertEqual(core.title, "Core");
    Test.assertEqual(core.items.size(), 1);
    Test.assertEqual(core.items[0].id, "dead_bug");
    // gelernte Merkmale der Übung
    var sig = p.sigOf("bench_press") as Array<Number>;
    Test.assertEqual(sig[0], 4);
    Test.assertEqual(sig[1], 36);
    Test.assert(p.sigOf("squat") == null && p.sigOf("") == null);
    // freies Training: nur die eigene Liste
    var f = StrengthPlan.fromFeed(feed, -1) as StrengthPlan;
    Test.assertEqual(f.items.size(), 0);
    Test.assertEqual(f.options.size(), 3);
    // nicht eingerichtet: kein Plan
    Test.assert(StrengthPlan.fromFeed({ "strength" => { "ready" => false } } as Dictionary, 0) == null);
    return true;
}

// Einheiten eines anderen Tages gelten nicht als heute
(:test)
function testStrengthFeedOfAnotherDayIsIgnored(logger as Logger) as Boolean {
    var feed = seedStr(null);
    var st = Application.Storage.getValue("str") as Dictionary;
    st.put("d", "2020-01-01");
    Application.Storage.setValue("str", st as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    Test.assertEqual(StrengthPlan.sessions(feed).size(), 0);
    Test.assert(StrengthPlan.fromFeed(feed, -1) == null);
    return true;
}

(:test)
function testStrengthControllerNextPlanned(logger as Logger) as Boolean {
    var feed = seedStr(null);
    var plan = StrengthPlan.fromFeed(feed, 0) as StrengthPlan;
    var c = new StrengthController(plan);
    var none = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as Array<Number>;
    var f0 = [0, 0, 0, 100, 100, 100] as Array<Number>;
    Test.assertEqual(c.nextPlanned(), 0);
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 0, 20, none, f0));
    Test.assertEqual(c.nextPlanned(), 0);
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 90, 20, none, f0));
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 180, 20, none, f0));
    Test.assertEqual(c.nextPlanned(), 1);
    c.sets.add(new LoggedSet("calf_machine", "Wadenheben", 15, 0.0, "plan", 300, 20, none, f0));
    c.sets.add(new LoggedSet("calf_machine", "Wadenheben", 14, 0.0, "plan", 400, 20, none, f0));
    Test.assertEqual(c.nextPlanned(), 2);
    Test.assertEqual(c.nextMode(), CountMode.TIME);
    c.sets.add(new LoggedSet("plank", "Plank", 40, 0.0, "plan", 500, 40, none, f0));
    c.sets.add(new LoggedSet("plank", "Plank", 38, 0.0, "plan", 600, 38, none, f0));
    Test.assertEqual(c.nextPlanned(), -1);
    Test.assertEqual(c.totalReps(), 8 * 3 + 15 + 14 + 40 + 38);
    return true;
}

// Ein Satz beginnt erst nach drei gleichmäßigen Wiederholungen: der schnelle Armschwung beim Gehen (etwa 1 s) und eine
// unregelmäßige Bewegung sind keiner, gleichmäßige Wiederholungen von 2 s schon.
(:test)
function testRepCounterNeedsSteadyReps(logger as Logger) as Boolean {
    // Gehen: Armschwung mit 0,95 Hz, 20 s lang
    var walk = new RepCounter(25);
    var at = feedSet(walk, 2, 0, 0.5, 0.0, 0);
    var steady = false;
    for (var s = 0; s < 20; s++) {
        at = feedSet(walk, 1, 1, 0.95, 300.0, at);
        steady = steady || walk.regular();
    }
    Test.assert(!steady);
    // Bizepscurl: 2 s je Wiederholung; nach drei Wiederholungen gleichmäßig
    var curl = new RepCounter(25);
    at = feedSet(curl, 2, 0, 0.5, 0.0, 0);
    at = feedSet(curl, 4, 2, 0.5, 300.0, at);
    Test.assert(!curl.regular());
    var c2 = new RepCounter(25);
    at = feedSet(c2, 2, 0, 0.5, 0.0, 0);
    // die ersten 7 s: 3 Wiederholungen und eine halbe
    at = feedSet(c2, 7, 6, 0.5, 300.0, at);
    logger.debug("curl reps=" + c2.reps() + " regular=" + c2.regular());
    Test.assert(c2.regular());
    return true;
}

// Die Karte nach dem Satz: erst die Wiederholungen (AUF/AB), BACK wechselt zum Gewicht (1er-Schritte), BACK noch einmal
// bestätigt; danach läuft die Pause mit dem eben gemachten Satz. Herumgehen dazwischen startet keinen Satz.
(:test)
function testStrengthSetCardAndRest(logger as Logger) as Boolean {
    var plan = StrengthPlan.fromFeed(seedStr(null), 0) as StrengthPlan;
    var c = new StrengthController(plan);
    c.state = Str.REST;
    // Gehen: kein Satz
    var at = feedSet(c.counter, 1, 0, 0.5, 0.0, 0);
    for (var s = 0; s < 12; s++) {
        at = feedSet(c.counter, 1, 1, 0.95, 300.0, at);
        c.tick();
        Test.assertEqual(c.state, Str.REST);
    }
    // Ruhe, dann ein Satz mit 6 Wiederholungen zu 2 s
    at = feedSet(c.counter, 3, 0, 0.5, 0.0, at);
    c.tick();
    at = feedSet(c.counter, 8, 6, 0.5, 300.0, at);
    c.tick();
    Test.assertEqual(c.state, Str.SET);
    at = feedSet(c.counter, 10, 0, 0.5, 0.0, at);
    c.tick();
    Test.assertEqual(c.state, Str.CONFIRM);
    var reps = c.cReps;
    Test.assertEqual(c.field, 0);
    c.onAdjust(1);
    Test.assertEqual(c.cReps, reps + 1);
    c.onBack();
    Test.assertEqual(c.field, 1);
    var kg = c.cKg;
    c.onAdjust(1);
    c.onAdjust(1);
    Test.assert((c.cKg - kg - 2.0).abs() < 0.001);
    c.onBack();
    Test.assertEqual(c.state, Str.REST);
    Test.assert(c.resting());
    var last = c.lastSet() as LoggedSet;
    Test.assertEqual(last.reps, reps + 1);
    Test.assertEqual(c.lastSetNumbers()[0], 1);
    // solange die Pause läuft, beginnt die Bewegung keinen Satz
    at = feedSet(c.counter, 3, 0, 0.5, 0.0, at);
    at = feedSet(c.counter, 8, 6, 0.5, 300.0, at);
    c.tick();
    Test.assertEqual(c.state, Str.REST);
    // BACK beendet die Pause, dann erkennt die Uhr den Satz
    c.onBack();
    Test.assert(!c.resting());
    Test.assertEqual(c.state, Str.REST);
    at = feedSet(c.counter, 3, 0, 0.5, 0.0, at);
    at = feedSet(c.counter, 8, 6, 0.5, 300.0, at);
    c.tick();
    Test.assertEqual(c.state, Str.SET);
    // eine andere Übung von Hand als nächste wählen
    c.chooseNext(2);
    Test.assertEqual(c.expectedIdx(), 2);
    return true;
}

// BACK (unten rechts) beendet den Satz sofort, die Karte nennt die Übung, die bei Beginn dran war (keine Erkennung aus der
// Bewegung); 0 Wiederholungen bestätigt verwirft den Satz. In der Pause blättern AUF/AB die vier Datenseiten, am Ende zeigt die Uhr,
// welche Muskeln wie beansprucht wurden.
(:test)
function testStrengthBackKeyPagesAndMuscles(logger as Logger) as Boolean {
    var plan = StrengthPlan.fromFeed(seedStr(null), 0) as StrengthPlan;
    var c = new StrengthController(plan);
    c.state = Str.REST;
    var at = feedSet(c.counter, 3, 0, 0.5, 0.0, 0);
    at = feedSet(c.counter, 8, 4, 0.5, 300.0, at);
    c.tick();
    Test.assertEqual(c.state, Str.SET);
    // gleich nach der letzten Wiederholung BACK: Karte, Bankdrücken (die geplante)
    c.onBack();
    Test.assertEqual(c.state, Str.CONFIRM);
    Test.assertEqual(plan.options[c.optIdx].name, "Bankdrücken");
    Test.assert(c.cReps >= 3);
    // BACK: zum Gewicht, dann bestätigen
    c.onBack();
    Test.assertEqual(c.field, 1);
    c.onBack();
    Test.assertEqual(c.state, Str.REST);
    Test.assertEqual(c.sets.size(), 1);
    // Datenseiten ringsum
    Test.assertEqual(c.page, 0);
    c.flip(1);
    c.flip(1);
    c.flip(1);
    Test.assertEqual(c.page, 3);
    c.flip(1);
    Test.assertEqual(c.page, 0);
    c.flip(-1);
    Test.assertEqual(c.page, 3);
    // ein Satz mit 0 Wiederholungen bestätigt: verworfen (erst BACK beendet die Pause)
    c.onBack();
    at = feedSet(c.counter, 3, 0, 0.5, 0.0, at);
    at = feedSet(c.counter, 8, 4, 0.5, 300.0, at);
    c.tick();
    c.onBack();
    Test.assertEqual(c.state, Str.CONFIRM);
    for (var i = 0; i < 20; i++) {
        c.onAdjust(-1);
    }
    c.onBack();
    c.onBack();
    Test.assertEqual(c.state, Str.REST);
    Test.assertEqual(c.sets.size(), 1);
    // Muskeln: Bankdrücken (Brust, Neben: Schultern, Trizeps), Wadenheben (Waden)
    var none = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as Array<Number>;
    var f0 = [0, 0, 0, 100, 100, 100] as Array<Number>;
    c.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", 0, 20, none, f0));
    c.sets.add(new LoggedSet("calf_machine", "Wadenheben", 15, 0.0, "plan", 0, 20, none, f0));
    var load = c.muscleLoad();
    Test.assert((load[0] - 2.0).abs() < 0.01);
    Test.assert((load[5] - 1.0).abs() < 0.01);
    Test.assert((load[10] - 1.0).abs() < 0.01);
    var order = Muscles.ranked(load, 5);
    Test.assertEqual(order[0], 0);
    Test.assertEqual(Muscles.level(load[0], load[0]), 2);
    Test.assertEqual(Muscles.level(load[5], load[0]), 1);
    // Masken vom Server ("u") gehen der Schätzung vor
    var p = StrengthPlan.fromRow({ "i" => "x", "n" => "X", "f" => "curl", "u" => [2, 4] } as Dictionary, true);
    Test.assertEqual(p.musP, 2);
    Test.assertEqual(p.musS, 4);
    return true;
}

// Vor einer Halteübung zählt nur BACK: Bewegung davor ist kein Satz; vor einer gezählten Übung beginnt die Bewegung den Satz.
(:test)
function testMotionBeforeAHoldIsNotASet(logger as Logger) as Boolean {
    var none = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as Array<Number>;
    var f0 = [0, 0, 0, 100, 100, 100] as Array<Number>;
    var plan = StrengthPlan.fromFeed(seedStr(null), 0) as StrengthPlan;
    var c = new StrengthController(plan);
    c.state = Str.REST;
    // die Bewegung vor Bankdrücken (Zählen aus der Bewegung): ein Satz beginnt
    feedSet(c.counter, 4, 10, 0.8, 350.0, 0);
    c.tick();
    Test.assertEqual(c.state, Str.SET);
    // Bankdrücken und Wadenheben sind fertig, als Nächstes kommt der Plank (Halten)
    var d = new StrengthController(plan);
    d.state = Str.REST;
    for (var i = 0; i < 3; i++) {
        d.sets.add(new LoggedSet("bench_press", "Bankdrücken", 8, 60.0, "plan", i * 90, 20, none, f0));
    }
    for (var i = 0; i < 2; i++) {
        d.sets.add(new LoggedSet("calf_machine", "Wadenheben", 15, 0.0, "plan", 300 + i * 90, 20, none, f0));
    }
    Test.assertEqual(d.nextMode(), CountMode.TIME);
    feedSet(d.counter, 4, 10, 0.8, 350.0, 0);
    Test.assert(d.counter.active);
    d.tick();
    Test.assertEqual(d.state, Str.REST);
    Test.assert(!d.counter.active);
    // BACK beginnt das Halten, und die Anzeige nennt den Plank (nicht die zuletzt gemachte Übung)
    d.onBack();
    Test.assertEqual(d.state, Str.HOLD);
    Test.assertEqual(plan.options[d.holdIdx()].name, "Plank");
    Test.assertEqual(d.holdTargetS(), 40);
    return true;
}

// Die trainierten Muskeln stehen im Feed als zwei Bitmasken und kommen an der Figur an.
// Kraft frei mit einer gewählten Übung der Bibliothek: sie ist die einzige geplante, die eigene Liste folgt (ohne Doppelte).
(:test)
function testFreeTrainingWithAPickedExercise(logger as Logger) as Boolean {
    var feed = seedStr(null);
    var row = { "i" => "wall_sit", "n" => "Wall Sit", "f" => "squat", "s" => 3, "r" => 0, "h" => 30, "rest" => 45, "m" => 2 } as Dictionary;
    var p = StrengthPlan.fromPick(feed, row) as StrengthPlan;
    Test.assertEqual(p.items.size(), 1);
    Test.assertEqual(p.items[0].name, "Wall Sit");
    Test.assertEqual(p.items[0].mode, CountMode.TIME);
    Test.assertEqual(p.items[0].hold, 30);
    Test.assertEqual(p.options[0].name, "Wall Sit");
    Test.assert(p.options.size() > 1);
    // eine Übung, die schon in der eigenen Liste steht, kommt nicht doppelt vor
    var again = StrengthPlan.fromPick(feed, { "i" => "squat", "n" => "Kniebeuge", "f" => "squat", "s" => 3, "r" => 8, "rest" => 90, "m" => 0 } as Dictionary) as StrengthPlan;
    var n = 0;
    for (var i = 0; i < again.options.size(); i++) {
        n += again.options[i].id.equals("squat") ? 1 : 0;
    }
    Test.assertEqual(n, 1);
    Test.assertEqual(again.options[0].id, "squat");
    // nicht eingerichtet: nichts
    Test.assert(StrengthPlan.fromPick({ "strength" => { "ready" => false } } as Dictionary, row) == null);
    return true;
}

(:test)
function testFigureMoveCarriesMuscles(logger as Logger) as Boolean {
    var d = { "k" => [[0, 0, 10, 20, 0, 0, 0, 0, 0], [0, 0, 60, 80, 0, 0, 0, 0, 0]], "v" => [-60, -180, 60, 4], "ms" => 3000, "u" => [1, 24] } as Dictionary;
    var m = FigureMove.fromFeed(d) as FigureMove;
    Test.assertEqual(m.musP, 1);
    Test.assertEqual(m.musS, 24);
    // ohne Angabe: keine Muskeln
    var e = { "k" => [[0, 0, 10, 20, 0, 0, 0, 0, 0], [0, 0, 60, 80, 0, 0, 0, 0, 0]], "v" => [-60, -180, 60, 4] } as Dictionary;
    var n = FigureMove.fromFeed(e) as FigureMove;
    Test.assertEqual(n.musP, 0);
    Test.assertEqual(n.musS, 0);
    return true;
}

(:test)
function testFigureMoveFromFeed(logger as Logger) as Boolean {
    var good = {
        "p" => 0, "x" => 0, "y" => 0, "q" => 33, "ms" => 3600, "v" => [-50, -172, 35, 4],
        "k" => [[4, 0, -30, 165, 2, -2, 0, 2, -2], [42, -20, -30, 165, 98, -30, 0, 98, -30]]
    } as Dictionary;
    var m = FigureMove.fromFeed(good) as FigureMove;
    Test.assertEqual(m.pin, 0);
    Test.assertEqual(m.equip, 33);
    Test.assertEqual(m.ms, 3600);
    Test.assertEqual(m.frames.size(), 2);
    // elf Zahlen je Pose: der ferne Arm folgt dem nahen, wenn die Pose ihn nicht angibt
    Test.assertEqual(m.frames[1].size(), 11);
    Test.assert((m.frames[1][9] - m.frames[1][2]).abs() < 0.01 && (m.frames[1][10] - m.frames[1][3]).abs() < 0.01);
    Test.assertEqual(m.gear.size(), 0);
    Test.assert((m.view[1] + 172.0).abs() < 0.01);
    // mit eigenem fernen Arm und Geräten als Formen
    var own = FigureMove.fromFeed({
        "p" => 4, "x" => 10, "y" => 40, "q" => 0, "ms" => 3000, "v" => [-50, -172, 35, 4],
        "k" => [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 170, 170]],
        "g" => [[7, 1, 0, 0], [4, 0, -30, 20, -43, 4, 2], [3, 1, 2, 3]]
    } as Dictionary) as FigureMove;
    Test.assertEqual(own.pin, 4);
    Test.assertEqual(own.gear.size(), 3);
    Test.assertEqual(own.gear[1][0].toNumber(), 4);
    Test.assert((own.frames[1][9] - 170.0).abs() < 0.01);
    // unbrauchbar: keine Posen, zu kurze Pose, kein Ausschnitt
    Test.assert(FigureMove.fromFeed(null) == null);
    Test.assert(FigureMove.fromFeed({ "p" => 0, "v" => [0, 0, 1, 1], "k" => [[1, 2, 3]] } as Dictionary) == null);
    Test.assert(FigureMove.fromFeed({ "p" => 0, "k" => [[1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]] } as Dictionary) == null);
    return true;
}

(:test)
function testFigurePoseAndPin(logger as Logger) as Boolean {
    var m = FigureMove.fromFeed({
        "p" => 0, "x" => 0, "y" => 0, "q" => 0, "ms" => 3000, "v" => [-50, -172, 35, 4],
        "k" => [[0, 0, 0, 0, 0, 0, 0, 0, 0], [40, 0, 0, 0, 90, -30, 0, 90, -30]]
    } as Dictionary) as FigureMove;
    // eine Wiederholung: Anfang, Mitte = zweite Pose, Ende = Anfang
    Test.assert((Figure.pose(m, 0.0)[0]).abs() < 0.01);
    Test.assert((Figure.pose(m, 0.5)[0] - 40.0).abs() < 0.01);
    Test.assert((Figure.pose(m, 0.999)[0]).abs() < 1.0);
    Test.assert((Figure.pose(m, 0.25)[0] - 20.0).abs() < 0.01);
    // stehend, Fuß festgehalten: die Sohle liegt auf dem Boden (Knöchel 8 cm darüber), die Hüfte ist 85 cm höher
    var sk = Figure.skeleton(Figure.pose(m, 0.0), 0, 0.0, 0.0);
    Test.assert((sk[Figure.ANKLE + 1] + Figure.ANKLE_H).abs() < 0.01);
    Test.assert((sk[Figure.HIP + 1] + 85.0 + Figure.ANKLE_H).abs() < 0.01);
    // in der tiefen Pose bleibt der Fuß am Boden (die Hüfte wandert, der Fuß nicht)
    var deep = Figure.skeleton(Figure.pose(m, 0.5), 0, 0.0, 0.0);
    Test.assert((deep[Figure.ANKLE] - sk[Figure.ANKLE]).abs() < 0.01);
    Test.assert((deep[Figure.ANKLE + 1] + Figure.ANKLE_H).abs() < 0.01);
    // Zehen auf einer Höhe (Kiste): die Zehen liegen genau dort
    var toe = Figure.skeleton(Figure.pose(m, 0.0), 4, 12.0, 40.0);
    Test.assert((toe[Figure.TOE] - 12.0).abs() < 0.01 && (toe[Figure.TOE + 1] + 40.0).abs() < 0.01);
    // Hüfte festgehalten (Bank): die Hüfte liegt genau dort
    var hip = Figure.skeleton(Figure.pose(m, 0.0), 3, 5.0, 56.0);
    Test.assert((hip[Figure.HIP] - 5.0).abs() < 0.01 && (hip[Figure.HIP + 1] + 56.0).abs() < 0.01);
    return true;
}

// ---------------------------------------------------------------- Merkmale und Erkennung

// Ein Satz mit eigener Achsenverteilung: amp = Ausschlag je Achse (x, y, z), g = die Schwerkraft je Achse.
(:strength)
function feedPattern(c as RepCounter, seconds as Number, reps as Number, freq as Float, amp as Array<Float>, g as Array<Float>, startAt as Number) as Number {
    var n = seconds * 25;
    for (var i = 0; i < n; i++) {
        var t = i / 25.0;
        var moving = t < reps / freq;
        var noise = Math.sin((startAt + i) * 12.9898) * 5.0;
        var ph = 2.0 * Math.PI * freq * t;
        var w = moving ? Math.sin(ph) : 0.0;
        c.add((g[0] + amp[0] * w + noise).toNumber(), (g[1] + amp[1] * w + noise * 0.7).toNumber(), (g[2] + amp[2] * w + noise * 0.4).toNumber());
    }
    return startAt + n;
}

(:strength)
function setFeatures(freq as Float, reps as Number, amp as Array<Float>, g as Array<Float>) as Array<Number> {
    var c = new RepCounter(25);
    var at = feedPattern(c, 4, 0, 0.5, [0.0, 0.0, 0.0] as Array<Float>, g, 0);
    at = feedPattern(c, (reps / freq).toNumber() + 12, reps, freq, amp, g, at);
    return c.lastFeat;
}

(:test)
function testRepCounterFeatures(logger as Logger) as Boolean {
    // Bewegung entlang der Schwerkraft (z) gegen Bewegung quer dazu (x)
    var up = setFeatures(0.5, 8, [0.0, 0.0, 300.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    var across = setFeatures(0.5, 8, [300.0, 0.0, 0.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    logger.debug("along gravity=" + up + " across=" + across);
    // Sekunden je Wiederholung in Zehnteln (0,5 Hz = 2 s = 20)
    Test.assert(up[0] >= 17 && up[0] <= 23);
    // der Anteil entlang der Schwerkraft trennt die beiden deutlich
    Test.assert(up[2] >= 70);
    Test.assert(across[2] <= 30);
    // die Richtung der Schwerkraft am Handgelenk: auf z (100 + 100), x und y waagerecht (100)
    Test.assert(up[5] >= 190 && up[3] >= 90 && up[3] <= 110);
    // eine langsamere, größere Bewegung hat eine längere Dauer und mehr Ausschlag
    var slow = setFeatures(0.25, 6, [0.0, 0.0, 450.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    logger.debug("slow=" + slow + " up=" + up);
    Test.assert(slow[0] > up[0] + 8);
    return true;
}

// Die Workouts der Website: einzeln gespeichert, im Menü (eins, das heute geplant ist, verbunden), startbar wie eine Einheit.
(:test)
function testWorkoutsOfTheWebsite(logger as Logger) as Boolean {
    var feed = seedStr(null);
    var data = {
        "d" => Sync.today(),
        "ready" => true,
        "ex" => [{ "i" => "squat", "n" => "Kniebeuge", "f" => "squat", "m" => 0 }],
        "sess" => [] as Array,
        "wo" => [
            { "id" => "plan-1", "r" => "lower", "t" => "Unterkörper", "c" => "lower", "ex" => [
                { "i" => "squat", "n" => "Kniebeuge", "f" => "squat", "s" => 4, "r" => 5, "k" => 80, "rest" => 120, "m" => 0 },
                { "i" => "deadlift", "n" => "Kreuzheben", "f" => "hinge", "s" => 3, "r" => 6, "rest" => 120, "m" => 0 }
            ] },
            { "id" => "", "r" => "own-park", "t" => "Park-Einheit", "c" => "custom", "ex" => [
                { "i" => "pull_up", "n" => "Klimmzug", "f" => "pull_v", "s" => 3, "r" => 6, "rest" => 90, "m" => 0 }
            ] }
        ]
    } as Dictionary;
    StrengthPlan.storeFeed(data);
    // im Speicher: "wo" ist aus dem Feed herausgenommen, jedes Workout steht für sich
    Test.assert(!(Application.Storage.getValue("str") as Dictionary).hasKey("wo"));
    Test.assert(Application.Storage.getValue("wo1") instanceof Dictionary);
    Test.assert(Application.Storage.getValue("wo2") == null);
    var list = StrengthPlan.workouts(feed);
    Test.assertEqual(list.size(), 2);
    Test.assertEqual(list[0].get("t") as Object, "Unterkörper" as Object);
    Test.assertEqual(list[0].get("today") as Object, true as Object);
    Test.assertEqual(list[1].get("today") as Object, false as Object);
    Test.assertEqual(list[1].get("n") as Object, 1 as Object);
    // gestartet: die Übungen des Workouts in seiner Reihenfolge, die geplante Einheit von heute verbunden
    var p = StrengthPlan.fromWorkout(feed, 0) as StrengthPlan;
    Test.assertEqual(p.title, "Unterkörper");
    Test.assertEqual(p.workoutId, "plan-1");
    Test.assertEqual(p.items.size(), 2);
    Test.assertEqual(p.items[0].sets, 4);
    Test.assert((p.items[0].kg - 80.0).abs() < 0.01);
    var own = StrengthPlan.fromWorkout(feed, 1) as StrengthPlan;
    Test.assertEqual(own.workoutId, "");
    Test.assertEqual(own.items[0].id, "pull_up");
    // ein Workout weniger auf der Website: der alte Eintrag ist weg
    StrengthPlan.storeFeed({ "d" => Sync.today(), "ready" => true, "ex" => [] as Array, "sess" => [] as Array, "wo" => [{ "id" => "", "r" => "upper", "t" => "Oberkörper", "c" => "upper", "ex" => [{ "i" => "bench_press", "n" => "Bankdrücken", "f" => "push_h", "s" => 3, "r" => 8, "rest" => 90, "m" => 0 }] }] } as Dictionary);
    Test.assertEqual(StrengthPlan.workouts(feed).size(), 1);
    Test.assert(Application.Storage.getValue("wo1") == null);
    Test.assert(StrengthPlan.fromWorkout(feed, 1) == null);
    return true;
}
