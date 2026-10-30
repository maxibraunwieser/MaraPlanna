// Pace-Hilfen ohne Zustand: Einlesen, Formatieren, Glätten, Vergleichen.
// Alle Paces intern in Sekunden pro km.

import Toybox.Lang;
import Toybox.Math;

module Pace {
    // Reihenfolge der Lauftypen = Wert von pace_zone in der FIT-Datei (0 = freier Lauf).
    const ZONES = ["free", "easy", "long", "recovery", "marathon", "threshold", "interval", "repetition"] as Array<String>;
    // Einzelne Zielpaces bekommen ± so viele Sekunden pro km.
    const TOLERANCE = 5;
    const KM_PER_MI = 1.609344;

    // "5:26" → 326 s/km, Fehleingaben → null.
    function seconds(text as String) as Number? {
        var colon = text.find(":");
        if (colon == null || colon == 0) {
            return null;
        }
        var min = (text.substring(0, colon) as String).toNumber();
        var sec = (text.substring(colon + 1, text.length()) as String).toNumber();
        if (min == null || sec == null || sec < 0 || sec > 59 || min < 2 || min > 15) {
            return null;
        }
        return min * 60 + sec;
    }

    // Einstellung "5:26-5:59" → [326, 359]; "4:57" → [292, 302] (± Toleranz); sonst null.
    function parseRange(text as String?) as Array<Number>? {
        if (text == null) {
            return null;
        }
        var t = text as String;
        var dash = t.find("-");
        if (dash == null) {
            var p = seconds(t);
            return p == null ? null : [p - TOLERANCE, p + TOLERANCE] as Array<Number>;
        }
        var a = seconds(t.substring(0, dash) as String);
        var b = seconds(t.substring(dash + 1, t.length()) as String);
        if (a == null || b == null) {
            return null;
        }
        return a <= b ? [a, b] as Array<Number> : [b, a] as Array<Number>;
    }

    // Pace-Wert aus MaraPlanna (Bereich [schnell, langsam] oder Einzelwert) → [lo, hi].
    function fromFeed(value as Object?) as Array<Number>? {
        if (value instanceof Array && value.size() == 2) {
            var a = toNum(value[0] as Object?);
            var b = toNum(value[1] as Object?);
            return a == null || b == null ? null : [a, b] as Array<Number>;
        }
        var p = toNum(value);
        return p == null ? null : [p - TOLERANCE, p + TOLERANCE] as Array<Number>;
    }

    function toNum(v as Object?) as Number? {
        if (v instanceof Lang.Number) {
            return v;
        }
        if (v instanceof Lang.Float || v instanceof Lang.Double || v instanceof Lang.Long) {
            return Math.round((v as Lang.Numeric).toFloat()).toNumber();
        }
        return null;
    }

    // Pace aus Strecke und Zeit eines Fensters (geglättet); null bei Stillstand.
    function fromDelta(ms as Number, metres as Float) as Float? {
        if (ms <= 0 || metres < 3.0) {
            return null;
        }
        var pace = (ms / 1000.0) / (metres / 1000.0);
        return pace > 1800 ? null : pace;
    }

    // -1 = zu schnell (langsamer laufen), 1 = zu langsam (schneller laufen), 0 = im Bereich / kein Ziel.
    function compare(pace as Float?, range as Array<Number>?) as Number {
        if (pace == null || range == null) {
            return 0;
        }
        if (pace < range[0]) {
            return -1;
        }
        return pace > range[1] ? 1 : 0;
    }

    // s/km → "4:34" (bzw. pro Meile), "--:--" ohne Wert.
    function format(pace as Numeric?, miles as Boolean) as String {
        if (pace == null || pace <= 0 || pace > 1800) {
            return "--:--";
        }
        var s = Math.round((miles ? pace * KM_PER_MI : pace).toFloat()).toNumber();
        return (s / 60).format("%d") + ":" + (s % 60).format("%02d");
    }

    // [lo, hi] → "4:30-4:38"
    function formatRange(range as Array<Number>?, miles as Boolean) as String {
        return range == null ? "--" : format(range[0], miles) + "-" + format(range[1], miles);
    }

    // Millisekunden → "1:02:03" oder "12:34".
    function time(ms as Number?) as String {
        if (ms == null || ms < 0) {
            return "0:00";
        }
        var s = ms / 1000;
        var h = s / 3600;
        var m = (s % 3600) / 60;
        return h > 0 ? h.format("%d") + ":" + m.format("%02d") + ":" + (s % 60).format("%02d") : m.format("%d") + ":" + (s % 60).format("%02d");
    }

    // Meter → "12,34" (km bzw. mi, deutsches Komma).
    function distance(metres as Numeric?, miles as Boolean) as String {
        var m = metres == null ? 0.0 : metres.toFloat();
        var v = m / (miles ? 1609.344 : 1000.0);
        if (v != v || v < 0.005) {
            v = 0.0; // auch -0.0, sonst steht "-0,00" da
        }
        var text = v.format("%.2f");
        var dot = text.find(".");
        return dot == null ? text : text.substring(0, dot) + "," + text.substring(dot + 1, text.length());
    }
}
