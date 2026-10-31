// Aerober Trainingseffekt der Uhr (Firstbeat): Skala 1,0 bis 5,0. Connect IQ liefert Apps nur diesen
// Wert (Activity.Info.trainingEffect), keinen anaeroben. Hier die Einstufung wie in Garmins Beschreibung.

import Toybox.Lang;

module TrainingEffect {
    const NAMES = ["Kein Effekt", "Geringer Effekt", "Erhaltend", "Verbessernd", "Stark verbessernd", "Überlastung"] as Array<String>;

    // Stufe 0..5: 0 = unter 1,0 (kein Effekt), 1 = gering (1,x), 2 = erhaltend, 3 = verbessernd,
    // 4 = stark verbessernd, 5 = Überlastung (ab 5,0).
    function level(te as Float) as Number {
        var n = te.toNumber();
        return n < 0 ? 0 : (n > 5 ? 5 : n);
    }

    function label(te as Float) as String {
        return NAMES[level(te)];
    }
}
