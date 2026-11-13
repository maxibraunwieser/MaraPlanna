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

    // Hauptmenü: "Fortschritt" (Säulendiagramm der letzten 7 Tage); die kleinen Uhren haben es nicht
    (:details)
    function addProgress(items as Array<CardItem>) as Void {
        items.add(new CardItem(:progress, "Fortschritt", ProgressData.summary(ProgressData.load(WeekPlan.today())), Draw.LIME));
    }

    (:nodetails)
    function addProgress(items as Array<CardItem>) as Void {
    }

    (:details)
    function showProgress() as Void {
        var view = new ProgressView();
        WatchUi.pushView(view, new ProgressDelegate(view), WatchUi.SLIDE_LEFT);
    }

    (:nodetails)
    function showProgress() as Void {
    }

    // Eigener Lauf gespeichert: für die Liste "Absolviert" merken, bis der Server ihn kennt.
    (:details)
    function logRun(startedAt as Number, meters as Float, seconds as Number, hr as Number?, title as String) as Void {
        RunLog.add(startedAt, meters, seconds, hr, title);
    }

    (:nodetails)
    function logRun(startedAt as Number, meters as Float, seconds as Number, hr as Number?, title as String) as Void {
    }

    // Eigenes Krafttraining gespeichert: gilt sofort als erledigt (Trainingsplan, Heute, Absolviert), bis der Server es kennt.
    (:details)
    function logStrength(startedAt as Number, seconds as Number, title as String, lines as Array) as Void {
        StrengthLog.add(startedAt, seconds, title, lines);
    }

    (:nodetails)
    function logStrength(startedAt as Number, seconds as Number, title as String, lines as Array) as Void {
    }
}
