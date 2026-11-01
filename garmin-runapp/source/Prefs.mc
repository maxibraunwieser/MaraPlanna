// Einstellungen auf der Uhr (Menü "Einstellungen"), gespeichert in Application.Storage "prefs".
// Jede Einstellung hat einen Standardwert, solange der Nutzer nichts geändert hat.

import Toybox.Application;
import Toybox.Lang;
import Toybox.System;

module Prefs {
    // Einheiten: automatisch (MaraPlanna, sonst die der Uhr), Kilometer, Meilen
    const UNITS_AUTO = 0;
    const UNITS_KM = 1;
    const UNITS_MI = 2;
    const UNITS_COUNT = 3;

    function all() as Dictionary {
        var d = Application.Storage.getValue("prefs");
        return d instanceof Dictionary ? (d as Dictionary) : ({} as Dictionary);
    }

    function flag(key as String, fallback as Boolean) as Boolean {
        var v = all().get(key);
        return v instanceof Lang.Boolean ? v : fallback;
    }

    function number(key as String, fallback as Number) as Number {
        var v = all().get(key);
        return v instanceof Lang.Number ? v : fallback;
    }

    function set(key as String, value as Boolean or Number) as Void {
        var d = all();
        d.put(key, value);
        Application.Storage.setValue("prefs", d as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }

    function units() as Number {
        var u = number("units", UNITS_AUTO);
        return u >= 0 && u < UNITS_COUNT ? u : UNITS_AUTO;
    }

    // Meilen statt Kilometer? auto = Wert aus MaraPlanna bzw. der Uhr, wenn "Automatisch" gewählt ist.
    function miles(auto as Boolean) as Boolean {
        var u = units();
        return u == UNITS_MI ? true : (u == UNITS_KM ? false : auto);
    }

    // Glättung der aktuellen Pace: 0 = 10 s (Standard), 1 = 20 s, 2 = 30 s
    const SMOOTH_COUNT = 3;

    function smooth() as Number {
        var s = number("smooth", 0);
        return s >= 0 && s < SMOOTH_COUNT ? s : 0;
    }

    // Fenster der aktuellen Pace in Sekunden
    function paceSeconds() as Number {
        var s = smooth();
        return s == 0 ? 10 : (s == 1 ? 20 : 30);
    }

    // Zusammenfassung nach jedem Kilometer (bzw. jeder Meile) einblenden
    function kmSummary() as Boolean {
        return flag("km", true);
    }

    // Vibration/Ton, wenn die Pace außerhalb des Zielbereichs liegt
    function paceAlert() as Boolean {
        return flag("pace", true);
    }

    // Töne und Vibration der App (zusätzlich zu den Einstellungen der Uhr)
    function sound() as Boolean {
        return flag("sound", true);
    }

    // Wetter auf dem Startbildschirm
    function weather() as Boolean {
        return flag("weather", true);
    }
}
