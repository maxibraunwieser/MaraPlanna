// Einstieg ins Krafttraining aus dem Trainingsmenü. Auf den Uhren mit 128 KB Speicher fehlt das ganze
// Kraft-Paket (monkey.jungle: excludeAnnotations); dort bleiben diese Funktionen leer und das Menü zeigt keinen
// Kraft-Eintrag. Alle anderen Teile der App rufen Kraft nur über dieses Modul auf.

import Toybox.Lang;
import Toybox.WatchUi;

module StrengthEntry {
    (:strength)
    var _controller as StrengthController? = null;

    // Einträge im Trainingsmenü: heutige Einheit und freies Training, oder der Hinweis zur Einrichtung.
    (:strength)
    function addItems(menu as WatchUi.Menu2, feed as Dictionary?) as Void {
        var status = StrengthPlan.status(feed);
        if (status == StrengthStatus.NONE) {
            return;
        }
        var name = WatchUi.loadResource(Rez.Strings.StrengthName) as String;
        if (status == StrengthStatus.SETUP) {
            menu.addItem(new WatchUi.MenuItem(name, WatchUi.loadResource(Rez.Strings.StrengthSetup) as String, :kraftSetup, null));
            return;
        }
        var today = StrengthPlan.fromFeed(feed, true);
        if (today != null && (today as StrengthPlan).planned()) {
            var p = today as StrengthPlan;
            menu.addItem(new WatchUi.MenuItem(name, (WatchUi.loadResource(Rez.Strings.StrengthToday) as String) + " · " + p.title, :kraft, null));
        }
        var free = StrengthPlan.fromFeed(feed, false);
        if (free != null) {
            menu.addItem(new WatchUi.MenuItem(WatchUi.loadResource(Rez.Strings.StrengthFree) as String, (free as StrengthPlan).options.size() + " " + (WatchUi.loadResource(Rez.Strings.StrengthExercises) as String), :kraftFree, null));
        }
    }

    (:nostrength)
    function addItems(menu as WatchUi.Menu2, feed as Dictionary?) as Void {
    }

    (:strength)
    function handles(id as Object?) as Boolean {
        return id == :kraft || id == :kraftFree || id == :kraftSetup;
    }

    (:nostrength)
    function handles(id as Object?) as Boolean {
        return false;
    }

    (:strength)
    function open(id as Object?, feed as Dictionary?) as Void {
        if (id == :kraftSetup) {
            var lines = [WatchUi.loadResource(Rez.Strings.NoticeSetup1) as String, WatchUi.loadResource(Rez.Strings.NoticeSetup2) as String, WatchUi.loadResource(Rez.Strings.NoticeSetup3) as String] as Array<String>;
            WatchUi.pushView(new NoticeView(lines), new NoticeDelegate(), WatchUi.SLIDE_LEFT);
            return;
        }
        var plan = StrengthPlan.fromFeed(feed, id == :kraft);
        if (plan == null) {
            return;
        }
        var c = new StrengthController(plan as StrengthPlan);
        _controller = c;
        WatchUi.pushView(new StrengthView(c), new StrengthDelegate(c), WatchUi.SLIDE_LEFT);
    }

    (:nostrength)
    function open(id as Object?, feed as Dictionary?) as Void {
    }

    (:strength)
    function controller() as StrengthController? {
        return _controller;
    }
}
