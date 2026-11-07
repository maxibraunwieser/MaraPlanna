// Kraft frei: eine Übung der Bibliothek wählen (erst die Muskelgruppe, dann die Übung). Die Listen kommen je Muskelgruppe vom
// Server (GET /watch/library, Sync.loadLibrary) und enthalten nur, was die Person mit ihren Geräten machen kann; gespeichert
// unter "lib.<Gruppe>" = { d: Datum, ex: [{i, n, f, s, r, rest, a?, m, h?}] }. Die Uhr kennt keine Übung fest.
// Die Figur einer gewählten Übung gibt es nur, wenn sie auch zu den Einheiten von heute gehört (die Figuren stehen unter "figs").

import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

(:strength)
module StrengthLibrary {
    // Die Muskelgruppen in der Reihenfolge der Liste (wie WATCH_GROUPS im Server)
    const GROUPS = ["chest", "back", "traps", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "hipflexors", "calisthenics", "fullbody", "bandfull"] as Array<String>;

    function label(i as Number) as String {
        var ids = [Rez.Strings.GroupChest, Rez.Strings.GroupBack, Rez.Strings.GroupTraps, Rez.Strings.GroupShoulders, Rez.Strings.GroupBiceps, Rez.Strings.GroupTriceps, Rez.Strings.GroupForearms, Rez.Strings.GroupQuads, Rez.Strings.GroupHamstrings, Rez.Strings.GroupGlutes, Rez.Strings.GroupCalves, Rez.Strings.GroupCore, Rez.Strings.GroupHipflexors, Rez.Strings.GroupCalisthenics, Rez.Strings.GroupFullbody, Rez.Strings.GroupBandfull] as Array<ResourceId>;
        return WatchUi.loadResource(ids[i]) as String;
    }

    // Die Übungen einer Gruppe aus dem Speicher; leer, wenn (noch) nichts geladen ist
    function rows(i as Number) as Array<Dictionary> {
        var out = [] as Array<Dictionary>;
        var raw = Application.Storage.getValue("lib." + GROUPS[i]) as Object?;
        if (!(raw instanceof Dictionary)) {
            return out;
        }
        var ex = StrengthPlan.g(raw as Dictionary, "ex");
        if (ex instanceof Array) {
            for (var j = 0; j < ex.size(); j++) {
                if (ex[j] instanceof Dictionary) {
                    out.add(ex[j] as Dictionary);
                }
            }
        }
        return out;
    }

    // Gibt es mindestens eine Gruppe mit Übungen?
    function any() as Boolean {
        for (var i = 0; i < GROUPS.size(); i++) {
            if (rows(i).size() > 0) {
                return true;
            }
        }
        return false;
    }

    // Menü der Muskelgruppen: oben "Meine Übungen" (die Liste von der Website), darunter die Gruppen mit der Zahl ihrer Übungen
    function show(feed as Dictionary?) as Void {
        var items = [new CardItem(:own, WatchUi.loadResource(Rez.Strings.LibOwn) as String, null, Draw.VIOLET)] as Array<CardItem>;
        for (var i = 0; i < GROUPS.size(); i++) {
            var n = rows(i).size();
            if (n > 0) {
                items.add(new CardItem(i, label(i), n + " " + (WatchUi.loadResource(Rez.Strings.StrengthExercises) as String), Draw.VIOLET));
            }
        }
        Cards.show(WatchUi.loadResource(Rez.Strings.StrengthFree) as String, items, new LibraryGroupDelegate(feed), WatchUi.SLIDE_LEFT);
    }

    // Menü der Übungen einer Gruppe: der Name, darunter wie gezählt wird (aus der Bewegung braucht keinen Hinweis)
    function showGroup(feed as Dictionary?, group as Number) as Void {
        var list = rows(group);
        var items = [] as Array<CardItem>;
        for (var j = 0; j < list.size(); j++) {
            var m = StrengthPlan.toFloat(StrengthPlan.g(list[j], "m")).toNumber();
            var hint = m == CountMode.TIME ? WatchUi.loadResource(Rez.Strings.LibModeHold) as String : (m == CountMode.ASSIST ? WatchUi.loadResource(Rez.Strings.LibModeAssist) as String : null);
            items.add(new CardItem(j, StrengthPlan.str(StrengthPlan.g(list[j], "n")), hint, Draw.VIOLET));
        }
        Cards.show(label(group), items, new LibraryItemDelegate(feed, list), WatchUi.SLIDE_LEFT);
    }
}

(:strength)
class LibraryGroupDelegate extends CardMenuListener {
    private var _feed as Dictionary?;

    function initialize(feed as Dictionary?) {
        CardMenuListener.initialize();
        _feed = feed;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id == :own) {
            StrengthEntry.start(StrengthPlan.fromFeed(_feed, -1));
            return;
        }
        StrengthLibrary.showGroup(_feed, id as Number);
    }
}

(:strength)
class LibraryItemDelegate extends CardMenuListener {
    private var _feed as Dictionary?;
    private var _rows as Array<Dictionary>;

    function initialize(feed as Dictionary?, rows as Array<Dictionary>) {
        CardMenuListener.initialize();
        _feed = feed;
        _rows = rows;
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var j = item.id as Number;
        if (j >= 0 && j < _rows.size()) {
            StrengthEntry.start(StrengthPlan.fromPick(_feed, _rows[j]));
        }
    }
}
