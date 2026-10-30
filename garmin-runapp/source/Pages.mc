// Die Datenseiten während des Laufs. Welche Seiten angezeigt werden, wählt man am Start
// (Eintrag "Datenseiten") oder im Pause-Menü; die Auswahl bleibt gespeichert.
// Seiten, die gerade keinen Sinn ergeben (z. B. Intervall ohne Einheit), werden übersprungen.

import Toybox.Application;
import Toybox.Lang;

module Pages {
    const OVERVIEW = 0;
    const PACE = 1;
    const HEART = 2;
    const LAPS = 3;
    const PACE_GRAPH = 4;
    const HR_GRAPH = 5;
    const INTERVAL = 6;
    const REPS = 7;
    const MAP = 8;
    const FORECAST = 9;
    const COUNT = 10;

    const NAMES = ["Übersicht", "Pace", "Puls", "Runden", "Pace-Verlauf", "Puls-Verlauf", "Intervall", "Intervall-Reps", "Karte", "Prognose"] as Array<String>;
    // Kurzformen für schmale Displays
    const SHORT = ["Übersicht", "Pace", "Puls", "Runden", "Pace-Graph", "Puls-Graph", "Intervall", "Reps", "Karte", "Prognose"] as Array<String>;
    // Was die Seite zeigt (Untertitel im Auswahlmenü)
    const INFO = ["Zeit, Distanz, Pace, Puls", "Pace mit Zielbereich", "Puls mit Zone", "Ø-, Runden-Pace, Rundenzeit", "Pace über den ganzen Lauf", "Puls über den ganzen Lauf", "Schritt, Rest, Fortschritt", "Pace je Intervall", "Strecke und Weg zum Start", "Zielzeit-Prognose"] as Array<String>;
    // Alle Seiten außer "Runden"
    const DEFAULT_MASK = 0x3F7;

    function mask() as Number {
        var m = Application.Storage.getValue("pages");
        return m instanceof Lang.Number ? m : DEFAULT_MASK;
    }

    function save(mask as Number) as Void {
        Application.Storage.setValue("pages", mask);
    }

    function enabled(id as Number) as Boolean {
        return (mask() & (1 << id)) != 0;
    }

    function enabledCount() as Number {
        var n = 0;
        for (var i = 0; i < COUNT; i++) {
            n += enabled(i) ? 1 : 0;
        }
        return n;
    }

    // Läuft gerade eine Einheit, und ergibt die Seite dann Sinn?
    function applies(id as Number, workout as Workout?) as Boolean {
        if (id == INTERVAL) {
            return workout != null;
        }
        if (id == REPS) {
            return workout != null && (workout as Workout).activeCount() >= 2;
        }
        return true;
    }

    // Sichtbare Seiten in fester Reihenfolge; mindestens die Übersicht.
    function active(workout as Workout?) as Array<Number> {
        var list = [] as Array<Number>;
        var m = mask();
        for (var i = 0; i < COUNT; i++) {
            if ((m & (1 << i)) != 0 && applies(i, workout)) {
                list.add(i);
            }
        }
        if (list.size() == 0) {
            list.add(OVERVIEW);
        }
        return list;
    }
}
