// Einstieg in "Absolviert" und "Trainingsplan" aus dem Hauptmenü. Auf den Uhren mit 128 KB Speicher fehlen die Listen mit
// Details (monkey.jungle: excludeAnnotations "details"); dort bleiben die schlichten Seiten (Wochenübersicht, Plan-Seite
// mit den nächsten Einheiten). Alle anderen Teile der App erreichen die Listen nur über dieses Modul.

import Toybox.Lang;
import Toybox.WatchUi;

module PlanEntry {
    (:details)
    function showDone() as Void {
        SessionMenus.showDone();
    }

    (:nodetails)
    function showDone() as Void {
        WatchUi.pushView(new WeekView(), new WeekDelegate(), WatchUi.SLIDE_LEFT);
    }

    (:details)
    function openPlan() as Void {
        SessionMenus.openPlan();
    }

    (:nodetails)
    function openPlan() as Void {
        var sync = getApp().sync;
        if (sync != null && !Demo.active()) {
            (sync as Sync).refreshIfStale();
        }
        WatchUi.pushView(new PlanView(), new PlanDelegate(), WatchUi.SLIDE_LEFT);
    }

    // Eigener Lauf gespeichert: für die Liste "Absolviert" merken, bis der Server ihn kennt.
    (:details)
    function logRun(startedAt as Number, meters as Float, seconds as Number, hr as Number?, title as String) as Void {
        RunLog.add(startedAt, meters, seconds, hr, title);
    }

    (:nodetails)
    function logRun(startedAt as Number, meters as Float, seconds as Number, hr as Number?, title as String) as Void {
    }
}
