// Wann der Pace-Alarm (Vibration und Ton) kommt, je nach Art des Abschnitts. Reine Logik ohne Uhr, damit sie testbar ist.
//
//   ruhig  (Freier Lauf, Easy, Long Run, Erholung, Ein- und Auslaufen; Zonen 0-3)
//          erst nach 3 Minuten im Abschnitt, nur wenn die Pace 30 Sekunden am Stück mehr als 5 s/km neben dem Zielbereich
//          liegt, danach höchstens alle 3 Minuten
//   hart   (Marathon-Pace, Schwelle, Intervall, Wiederholung; Zonen 4-7)
//          erst nach 30 Sekunden im Abschnitt (die Beschleunigung ist vorbei), wenn die Pace 10 Sekunden am Stück neben dem
//          Zielbereich liegt, danach höchstens jede Minute (ein Intervall ist kurz, ein späterer Alarm käme zu spät)
// Der Hinweis LANGSAMER/SCHNELLER auf dem Display bleibt davon unberührt: er zeigt jederzeit, wo die Pace gerade liegt.

import Toybox.Lang;

module PaceAlarm {
    // Index in rules()
    const SETTLE = 0;
    const HOLD = 1;
    const GAP = 2;
    const GRACE = 3;

    // Zonen ab hier sind "hart" (Pace.ZONES: 4 = Marathon-Pace, 5 = Schwelle, 6 = Intervall, 7 = Wiederholung)
    const HARD_FROM = 4;

    // [Sekunden Anlauf im Abschnitt, Sekunden am Stück daneben, Sekunden zwischen zwei Alarmen, Kulanz in s/km]
    function rules(zone as Number) as Array<Number> {
        return zone >= HARD_FROM ? [30, 10, 60, 0] as Array<Number> : [180, 30, 180, 5] as Array<Number>;
    }

    // Auf welcher Seite des Zielbereichs, mit Kulanz: -1 zu schnell, 1 zu langsam, 0 im Bereich (oder ohne Ziel/Pace)
    function side(pace as Float?, range as Array<Number>?, grace as Number) as Number {
        if (pace == null || range == null) {
            return 0;
        }
        var off = Pace.offRange(pace as Float, range as Array<Number>);
        return off < -grace ? -1 : (off > grace ? 1 : 0);
    }

    // Ist jetzt ein Alarm fällig? stepS: Sekunden im Abschnitt, offS: Sekunden am Stück daneben, sinceS: Sekunden seit dem
    // letzten Alarm
    function due(zone as Number, stepS as Number, offS as Number, sinceS as Number) as Boolean {
        var r = rules(zone);
        return offS >= r[HOLD] && stepS >= r[SETTLE] && sinceS >= r[GAP];
    }
}
