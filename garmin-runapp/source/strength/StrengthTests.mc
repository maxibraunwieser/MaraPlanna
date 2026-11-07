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

// Vor einer Halteübung zählt nur START: Bewegung davor ist kein Satz; vor einer gezählten Übung beginnt die Bewegung den Satz.
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
    // START beginnt das Halten, und die Anzeige nennt den Plank (nicht die zuletzt gemachte Übung)
    d.onStart();
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
    at = feedPattern(c, (reps / freq).toNumber() + 8, reps, freq, amp, g, at);
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

(:test)
function testRecognizerFollowsThePlanAndTheSession(logger as Logger) as Boolean {
    var f = [20, 100, 80, 100, 100, 190] as Array<Number>;
    // ohne gelernte Merkmale entscheidet die Reihenfolge: die nächste geplante Übung gewinnt
    var cands = [new Cand(3, true, false, 0, null, null), new Cand(2, false, false, 0, null, null), new Cand(-1, false, false, 0, null, null)] as Array<Cand>;
    var sc = Recognizer.scores(cands, f, true);
    Test.assertEqual(Recognizer.best(sc), 0);
    var pr = Recognizer.probabilities(sc);
    Test.assert(pr[0] > pr[1] && pr[1] > pr[2]);
    Test.assert(pr[0] + pr[1] + pr[2] > 0.97 && pr[0] + pr[1] + pr[2] <= 1.0001);
    // ein weiterer Satz der Übung davor (letzte, noch offen) schlägt die Reihenfolge nicht allein, hebt sie aber an
    var again = [new Cand(0, false, false, 0, null, null), new Cand(2, true, false, 0, null, null)] as Array<Cand>;
    Test.assertEqual(Recognizer.best(Recognizer.scores(again, f, true)), 1);
    // ein Halten kommt nie aus Bewegung
    var hold = [new Cand(2, true, false, 2, null, null), new Cand(1, false, false, 0, null, null)] as Array<Cand>;
    Test.assertEqual(Recognizer.best(Recognizer.scores(hold, f, true)), 1);
    return true;
}

(:test)
function testRecognizerLearnsFromConfirmedSets(logger as Logger) as Boolean {
    // Zwei Übungen mit verschiedenem Gefühl am Handgelenk: eine quer (Zeit 1,6 s, 80 % entlang), eine langsam und flach.
    var curl = [16, 280, 30, 120, 60, 100] as Array<Number>;
    var press = [30, 420, 85, 100, 130, 100] as Array<Number>;
    var sigCurl = [6, 16, 280, 30, 120, 60, 100, 2, 20, 4, 4, 4, 4] as Array<Number>;
    var sigPress = [6, 30, 420, 85, 100, 130, 100, 3, 25, 4, 4, 4, 4] as Array<Number>;
    // die Reihenfolge verlangt den Curl, die Bewegung ist aber ein Drücken: bei gelernten Merkmalen gewinnt die Bewegung
    var cands = [new Cand(3, true, false, 0, sigCurl, null), new Cand(3, false, false, 0, sigPress, null)] as Array<Cand>;
    Test.assertEqual(Recognizer.best(Recognizer.scores(cands, press, true)), 1);
    Test.assertEqual(Recognizer.best(Recognizer.scores(cands, curl, true)), 0);
    // ein Satz, der zu keiner passt, bleibt bei der Reihenfolge, aber unsicher
    var odd = [60, 50, 10, 150, 150, 150] as Array<Number>;
    var pr = Recognizer.probabilities(Recognizer.scores(cands, odd, true));
    logger.debug("odd set: " + pr);
    Test.assert(pr[0] < 0.3 && pr[1] < 0.3);
    // aus der Einheit gelernt: zwei bestätigte Sätze (nur sie) genügen, um den nächsten gleichen zu erkennen
    var rows = [[30, 420, 85, 100, 130, 100], [31, 410, 84, 101, 128, 100]] as Array<Array<Number>>;
    var sess = Recognizer.summarize(rows) as Array<Number>;
    Test.assertEqual(sess[0], 2);
    Test.assertEqual(sess[1], 31);
    var today = [new Cand(1, true, false, 0, null, null), new Cand(3, false, true, 0, null, sess)] as Array<Cand>;
    Test.assertEqual(Recognizer.best(Recognizer.scores(today, press, true)), 1);
    // zwei Angaben zusammenlegen: gewichtet nach der Zahl, die größere Streuung gilt
    var merged = Recognizer.merge(sigPress, sess) as Array<Number>;
    Test.assertEqual(merged[0], 8);
    Test.assert(merged[1] >= 30 && merged[1] <= 31);
    Test.assert(Recognizer.merge(null, null) == null);
    return true;
}

// Ein Satz einer Übung mit eigener Bewegung ergibt genau die Merkmale, an denen sie wiedererkannt wird.
(:test)
function testRecognizerSeparatesExercisesFromTheirMovement(logger as Logger) as Boolean {
    // Drücken: senkrecht (entlang der Schwerkraft auf z), langsam. Curl: quer (x), schneller.
    var press = setFeatures(0.3, 6, [0.0, 0.0, 380.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    var curl = setFeatures(0.6, 10, [330.0, 90.0, 0.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    var sigPress = [4, press[0], press[1], press[2], press[3], press[4], press[5], 3, 25, 5, 5, 5, 5] as Array<Number>;
    var sigCurl = [4, curl[0], curl[1], curl[2], curl[3], curl[4], curl[5], 3, 25, 5, 5, 5, 5] as Array<Number>;
    var cands = [new Cand(3, false, false, 0, sigCurl, null), new Cand(3, true, false, 0, sigPress, null)] as Array<Cand>;
    // dieselben Bewegungen noch einmal (andere Rauschphase): sie werden den richtigen Übungen zugeordnet
    var press2 = setFeatures(0.3, 6, [0.0, 0.0, 385.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    var curl2 = setFeatures(0.6, 10, [335.0, 85.0, 0.0] as Array<Float>, [0.0, 0.0, 1000.0] as Array<Float>);
    Test.assertEqual(Recognizer.best(Recognizer.scores(cands, press2, true)), 1);
    Test.assertEqual(Recognizer.best(Recognizer.scores(cands, curl2, true)), 0);
    return true;
}
