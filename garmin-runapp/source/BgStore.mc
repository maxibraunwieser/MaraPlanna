// Speichern der geladenen Daten, gemeinsam für den normalen Abgleich (Sync) und den Hintergrund (BgSync). Alles hier ist
// (:background), denn der Hintergrund-Speicher enthält nur so markierten Code.

import Toybox.Application;
import Toybox.Lang;

(:background)
module Bg {
    const BASE = "https://rynujdcggyafilncmcbr.supabase.co/functions/v1/watch";

    // Höchstens so viele Workouts der Website behält die Uhr (je ein eigener Wert im Speicher)
    const MAX_WORKOUTS = 6;

    // Hat diese Uhr Krafttraining? (die kleinen Uhren mit 128 KB nicht)
    (:strength)
    function strengthOn() as Boolean {
        return true;
    }

    (:nostrength)
    function strengthOn() as Boolean {
        return false;
    }

    // Den Kraft-Feed vom Server speichern: Figuren ("an") unter "figs", die Workouts einzeln unter "wo0".."wo5" mit ihrer Liste
    // unter "wom", der Rest unter "str". Ein Wert im Speicher fasst höchstens 8 KB, darum die Aufteilung.
    function storeStrength(data as Dictionary) as Void {
        var an = data.get("an");
        data.remove("an");
        storeFeed(data);
        if (an instanceof Dictionary) {
            Application.Storage.setValue("figs", an as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        } else {
            Application.Storage.deleteValue("figs");
        }
    }

    // Der Feed ohne Figuren ("an" hat der Aufrufer schon herausgenommen)
    function storeFeed(data as Dictionary) as Void {
        var wo = data.get("wo");
        data.remove("wo");
        var list = [] as Array<Application.Storage.ValueType>;
        if (wo instanceof Array) {
            for (var i = 0; i < wo.size() && list.size() < MAX_WORKOUTS; i++) {
                var w = wo[i];
                if (w instanceof Dictionary) {
                    var wd = w as Dictionary;
                    var ex = wd.get("ex") as Object?;
                    Application.Storage.setValue("wo" + list.size(), wd as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
                    list.add({ "t" => text(wd.get("t") as Object?), "n" => ex instanceof Array ? ex.size() : 0, "id" => text(wd.get("id") as Object?) } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
                }
            }
        }
        for (var i = list.size(); i < MAX_WORKOUTS; i++) {
            Application.Storage.deleteValue("wo" + i);
        }
        var d = data.get("d");
        Application.Storage.setValue("wom", { "d" => d instanceof String ? d : "", "l" => list } as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
        Application.Storage.setValue("str", data as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }

    function text(v as Object?) as String {
        return v instanceof String ? v : "";
    }

    // Adresse des Servers. Im Demo-Build ein Test-Server auf diesem Rechner (tools/mock-watch-server.cjs), damit der
    // Hintergrund im Simulator ohne echtes Konto geprüft werden kann.
    (:live)
    function base() as String {
        return BASE;
    }

    (:demo)
    function base() as String {
        // im Simulator unter Settings "Use Device HTTPS Requirements" ausschalten (sonst lehnt er http ab)
        return "http://localhost:8787/watch";
    }

    // Im Zeitfenster 6:30 bis 22:00? Der Demo-Build lädt zu jeder Uhrzeit, damit man es im Simulator jederzeit prüfen kann.
    (:live)
    function inWindow() as Boolean {
        return AutoSync.inWindow(AutoSync.nowSec());
    }

    (:demo)
    function inWindow() as Boolean {
        return true;
    }
}
