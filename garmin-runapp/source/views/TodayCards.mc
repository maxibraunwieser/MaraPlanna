// Reiter "Heute" im Menü Training: jede Einheit von heute mit Namen und gleich darunter ihren Einzelheiten.
//   Lauf   jeder Abschnitt eine Zeile: Name und Länge, darunter die Zielpace; Wiederholungen zusammengefasst
//          ("5 × 1000 m", darunter "4:05-4:15 /km"; danach "Trabpause", "2 min · locker")
//   Kraft  jede Übung eine Zeile: Name, darunter Sätze × Wiederholungen und Gewicht ("3 × 8 · 60 kg", "2 × 45 s")
// Ist die Einheit erledigt (vom Server oder von der Uhr selbst gespeichert), trägt ihre Kopfzeile den grünen Haken und
// "Erledigt". Die Einzelheiten sind reine Infozeilen (CardItem.info): nicht wählbar, der Fokus springt von Einheit zu Einheit. Auf den Uhren mit 128 KB gibt es nur die Kopfzeilen.

import Toybox.Lang;

(:details)
module TodayCards {
    // Zeilen eines Laufs: [Titel, Untertitel] je Abschnitt
    function runRows(wk as Workout, miles as Boolean) as Array<Array<String>> {
        var out = [] as Array<Array<String>>;
        var n = wk.size();
        var i = 0;
        while (i < n) {
            var step = wk.step(i);
            // Intervall, Trabpause, Intervall … mit gleicher Länge und gleichem Ziel: eine Zeile
            var reps = 1;
            var j = i;
            var pause = null as Dictionary?;
            while (wk.isActive(i) && j + 2 < n && wk.isRecovery(j + 1) && same(wk.step(j), wk.step(j + 2))) {
                pause = wk.step(j + 1);
                reps += 1;
                j += 2;
            }
            // Wiederholungen bis 2 km in Metern ("5 × 1000 m"), wie in der Detailansicht des Plans
            var len = SessionText.length(step, "d", "s", miles, reps > 1);
            var target = wk.stepTarget(i);
            var sub = target != null ? Pace.formatRange(target, miles) + (miles ? " /mi" : " /km") : "nach Gefühl";
            if (reps > 1) {
                // kurz genug für das runde Display: "3 × 1000 m" mit der Pace darunter, die Trabpause als eigene Zeile
                out.add([reps + " × " + len, sub] as Array<String>);
                if (pause != null) {
                    out.add([wk.name(pause as Dictionary), SessionText.length(pause as Dictionary, "d", "s", miles, false) + " · locker"] as Array<String>);
                }
                i = j + 1;
            } else {
                out.add([wk.name(step) + (len.length() > 0 ? " · " + len : ""), sub] as Array<String>);
                i += 1;
            }
        }
        return out;
    }

    // Gleiche Länge und gleiches Ziel (für das Zusammenfassen von Wiederholungen)
    function same(a as Dictionary, b as Dictionary) as Boolean {
        var keys = ["d", "s", "lo", "hi"] as Array<String>;
        for (var k = 0; k < keys.size(); k++) {
            if (Pace.toNum(a.get(keys[k]) as Object?) != Pace.toNum(b.get(keys[k]) as Object?)) {
                return false;
            }
        }
        return true;
    }

    // Ist ein Lauf heute erledigt? (Server oder eigener Lauf der Uhr)
    function runDone(today as Number) as Boolean {
        return PlanData.doneOn(PlanData.finished(today), today)[0] > 0;
    }

    // Ist die Krafteinheit mit diesem Titel heute erledigt? Gleicher Titel zuerst, sonst zählt die Reihenfolge.
    function strengthDone(today as Number, title as String, index as Number) as Boolean {
        var done = PlanData.finished(today);
        var n = 0;
        for (var i = 0; i < done.size(); i++) {
            if (done[i].get("day") == today && done[i].get("x") instanceof Array) {
                if (title.equals(done[i].get("t") as Object?)) {
                    return true;
                }
                n += 1;
            }
        }
        return n > index;
    }
}
