// Einstieg ins Krafttraining aus dem Trainingsmenü (Reiter Heute und Kraft). Auf den Uhren mit 128 KB Speicher fehlt das ganze
// Kraft-Paket (monkey.jungle: excludeAnnotations); dort bleiben diese Funktionen leer und das Menü zeigt keinen
// Kraft-Eintrag. Alle anderen Teile der App rufen Kraft nur über dieses Modul auf.

import Toybox.Lang;
import Toybox.WatchUi;

module StrengthEntry {
    (:strength)
    var _controller as StrengthController? = null;

    // Die Einträge der Einheiten von heute im Menü (höchstens vier)
    (:strength)
    const IDS = [:kraft0, :kraft1, :kraft2, :kraft3] as Array<Symbol>;

    // Die Karte einer Krafteinheit von heute: Name der Einheit, darunter "Kraft · 3 Übungen"
    (:strength)
    function sessionCard(feed as Dictionary?, i as Number) as CardItem? {
        var sess = StrengthPlan.sessions(feed);
        if (i >= sess.size()) {
            return null;
        }
        var n = sess[i].get("n");
        var name = WatchUi.loadResource(Rez.Strings.StrengthName) as String;
        return new CardItem(IDS[i], sess[i].get("t") as String, name + " · " + (n instanceof Number ? n : 0) + " " + (WatchUi.loadResource(Rez.Strings.StrengthExercises) as String), Draw.VIOLET);
    }

    // Reiter "Heute": die Krafteinheiten von heute, jede ein eigener Eintrag (gewählt wird, welche gemacht wird)
    (:strength)
    function todayItems(feed as Dictionary?, out as Array<CardItem>) as Void {
        if (StrengthPlan.status(feed) != StrengthStatus.READY) {
            return;
        }
        var sess = StrengthPlan.sessions(feed);
        for (var i = 0; i < sess.size() && i < IDS.size(); i++) {
            out.add(sessionCard(feed, i) as CardItem);
        }
    }

    (:nostrength)
    function todayItems(feed as Dictionary?, out as Array<CardItem>) as Void {
    }

    // Reiter "Kraft": die Einheiten von heute und das freie Training, oder der Hinweis zur Einrichtung. Leer, wenn es Kraft nicht gibt.
    (:strength)
    function items(feed as Dictionary?) as Array<CardItem> {
        var out = [] as Array<CardItem>;
        var status = StrengthPlan.status(feed);
        if (status == StrengthStatus.NONE) {
            return out;
        }
        var name = WatchUi.loadResource(Rez.Strings.StrengthName) as String;
        if (status == StrengthStatus.SETUP) {
            out.add(new CardItem(:kraftSetup, name, WatchUi.loadResource(Rez.Strings.StrengthSetup) as String, Draw.VIOLET));
            return out;
        }
        todayItems(feed, out);
        var free = StrengthPlan.fromFeed(feed, -1);
        if (free != null) {
            // mit geladener Bibliothek: Menü nach Muskelgruppe, sonst gleich die eigene Liste
            out.add(new CardItem(:kraftFree, WatchUi.loadResource(Rez.Strings.StrengthFree) as String, StrengthLibrary.any() ? WatchUi.loadResource(Rez.Strings.LibOwn) as String : (free as StrengthPlan).options.size() + " " + (WatchUi.loadResource(Rez.Strings.StrengthExercises) as String), Draw.VIOLET));
        }
        return out;
    }

    (:nostrength)
    function items(feed as Dictionary?) as Array<CardItem> {
        return [] as Array<CardItem>;
    }

    // Nummer der Einheit von heute zu einem Eintrag des Menüs; -1 für alles andere
    (:strength)
    function sessionIndex(id as Object?) as Number {
        for (var i = 0; i < IDS.size(); i++) {
            if (id == IDS[i]) {
                return i;
            }
        }
        return -1;
    }

    (:strength)
    function handles(id as Object?) as Boolean {
        return sessionIndex(id) >= 0 || id == :kraftFree || id == :kraftSetup;
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
        if (id == :kraftFree && StrengthLibrary.any()) {
            StrengthLibrary.show(feed);
            return;
        }
        start(StrengthPlan.fromFeed(feed, sessionIndex(id)));
    }

    // Das Training mit diesem Plan beginnen (null: nichts tun)
    (:strength)
    function start(plan as StrengthPlan?) as Void {
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
