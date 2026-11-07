// Menüs, die der Startbildschirm öffnet (alle als Karten wie in der MaraPlanna-App, siehe CardMenu):
//   Hauptmenü      Training · Absolviert · Trainingsplan · Einstellungen
//   Training       drei Reiter: Heute (die Einheiten von heute, direkt wählbar: der Lauf und/oder die Krafteinheiten),
//                  Laufen (alle Lauftypen, Freier Lauf), Kraft (alle Krafteinheiten, freies Training) → Startbildschirm bzw. Kraft
//   Absolviert     Wochenkilometer, darunter die vergangenen Einheiten; Tippen zeigt die Details (SessionMenus)
//   Trainingsplan  Einheiten dieser und der nächsten Woche; Tippen zeigt die Schritte (SessionMenus)
//   Einstellungen  Datenseiten, Einheiten, km-Zusammenfassung, Pace-Alarm, Töne, Vibration, Wechsel-Countdown, Wetter,
//                  MaraPlanna trennen
// Alle Untertitel kommen aus den aktuellen Daten, nichts ist fest eingetragen.

import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

module MainMenu {
    function text(id as ResourceId) as String {
        return WatchUi.loadResource(id) as String;
    }

    function show() as Void {
        var feed = WeekPlan.feed();
        var today = WeekPlan.today();
        var items = [
            new CardItem(:train, text(Rez.Strings.MenuTrain), trainInfo(feed), Draw.ORANGE),
            new CardItem(:week, text(Rez.Strings.MenuWeek), weekInfo(feed, today), Draw.GREEN),
            new CardItem(:plan, text(Rez.Strings.MenuPlan), planInfo(feed, today), Draw.BLUE),
            new CardItem(:settings, text(Rez.Strings.MenuSettings), null, Draw.GRAY)
        ] as Array<CardItem>;
        Cards.show(text(Rez.Strings.AppName), items, new MainMenuDelegate(), WatchUi.SLIDE_UP);
    }

    // Titel der heutigen Einheit, sonst ein Hinweis auf die freie Wahl.
    function trainInfo(feed as Dictionary?) as String {
        var workout = Workout.fromFeed(feed);
        return workout != null ? (workout as Workout).title : text(Rez.Strings.TrainFree);
    }

    function weekInfo(feed as Dictionary?, today as Number) as String {
        var done = WeekPlan.doneKm(feed, today);
        if (done == null) {
            return text(Rez.Strings.NoData);
        }
        var zones = getApp().zones;
        var miles = zones != null && (zones as PaceZones).miles;
        var planned = WeekPlan.plannedKm(feed, today);
        return Pace.distance1(done * 1000.0, miles) + (planned != null ? " / " + Pace.distance1(planned * 1000.0, miles) : "") + (miles ? " mi" : " km");
    }

    function planInfo(feed as Dictionary?, today as Number) as String {
        var sync = getApp().sync;
        if (Demo.active() || (sync != null && (sync as Sync).paired())) {
            var days = WeekPlan.raceDays(feed, today);
            if (days != null) {
                return days == 0 ? text(Rez.Strings.RaceToday) : days + (days == 1 ? " Tag" : " Tage") + text(Rez.Strings.RaceLeft);
            }
            return text(Rez.Strings.Linked);
        }
        return text(Rez.Strings.NotLinked);
    }
}

class MainMenuDelegate extends CardMenuListener {
    function initialize() {
        CardMenuListener.initialize();
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id == :train) {
            TrainMenu.show();
        } else if (id == :week) {
            PlanEntry.showDone();
        } else if (id == :plan) {
            PlanEntry.openPlan();
        } else if (id == :settings) {
            SettingsMenu.show();
        }
    }

    function onClose(menu as CardMenu) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

module TrainMenu {
    // Farbe des Streifens je Lauftyp (Index wie Pace.ZONES: frei, easy, long, recovery, marathon, threshold, interval, repetition)
    const ZONE_TONES = [Draw.GRAY, Draw.GREEN, Draw.BLUE, Draw.GREEN, Draw.ORANGE, Draw.ORANGE, Draw.RED, Draw.RED] as Array<Number>;

    // Die heutige Lauf-Einheit als Karte (Titel, Strecke und Dauer)
    function todayRun(workout as Workout, feed as Dictionary?, miles as Boolean) as CardItem {
        var minutes = (workout.plannedTotal() / 60.0 + 0.5).toNumber();
        var info = Pace.distance1(workout.plannedMeters(), miles) + (miles ? " mi" : " km") + " · " + minutes + " min";
        if (WeekPlan.allDone(WeekPlan.sessions(feed, WeekPlan.today()))) {
            info = MainMenu.text(Rez.Strings.TrainDone) + " · " + info;
        }
        return new CardItem(Choices.TODAY, workout.title, info, Draw.ORANGE);
    }

    // Alle Lauftypen mit bekannter Pace und der freie Lauf
    function runItems(zones as PaceZones?, miles as Boolean) as Array<CardItem> {
        var out = [] as Array<CardItem>;
        var list = Choices.list(zones, null);
        for (var i = 0; i < list.size(); i++) {
            var id = list[i];
            var range = id > 0 && zones != null ? Pace.formatRange((zones as PaceZones).range(id), miles) + (miles ? " /mi" : " /km") : null;
            out.add(new CardItem(id, StartView.zoneName(id), range, ZONE_TONES[id]));
        }
        return out;
    }

    function show() as Void {
        var app = getApp();
        var feed = WeekPlan.feed();
        var workout = Workout.fromFeed(feed);
        var zones = app.zones;
        if (workout != null && zones != null) {
            (workout as Workout).bindZones(zones as PaceZones);
        }
        var miles = zones != null && (zones as PaceZones).miles;

        // Heute: die geplanten Einheiten von heute, gewählt wird direkt die, die gemacht wird
        var today = [] as Array<CardItem>;
        if (workout != null) {
            today.add(todayRun(workout as Workout, feed, miles));
        }
        StrengthEntry.todayItems(feed, today);
        if (today.size() == 0) {
            var none = new CardItem(:none, MainMenu.text(Rez.Strings.TodayNone), MainMenu.text(Rez.Strings.TodayNoneHint), Draw.GRAY);
            none.enabled = false;
            today.add(none);
        }

        var tabs = [MainMenu.text(Rez.Strings.TabToday), MainMenu.text(Rez.Strings.TabRun)] as Array<String>;
        var pages = [today, runItems(zones, miles)] as Array<Array<CardItem>>;
        var strength = StrengthEntry.items(feed);
        if (strength.size() > 0) {
            tabs.add(MainMenu.text(Rez.Strings.StrengthName));
            pages.add(strength);
        }
        Cards.showTabs(MainMenu.text(Rez.Strings.MenuTrain), tabs, pages, new TrainMenuDelegate(), WatchUi.SLIDE_LEFT);
    }
}

class TrainMenuDelegate extends CardMenuListener {
    function initialize() {
        CardMenuListener.initialize();
    }

    // Gewählte Einheit → Startbildschirm (GPS-Suche, START beginnt den Lauf) bzw. das Krafttraining.
    function onPick(menu as CardMenu, item as CardItem) as Void {
        if (StrengthEntry.handles(item.id)) {
            StrengthEntry.open(item.id, WeekPlan.feed());
            return;
        }
        var view = new StartView(item.id as Number);
        WatchUi.pushView(view, new StartDelegate(view), WatchUi.SLIDE_LEFT);
    }
}

module SettingsMenu {
    function unitsText() as String {
        var u = Prefs.units();
        if (u == Prefs.UNITS_KM) {
            return MainMenu.text(Rez.Strings.UnitsKm);
        }
        if (u == Prefs.UNITS_MI) {
            return MainMenu.text(Rez.Strings.UnitsMi);
        }
        var zones = getApp().zones;
        return MainMenu.text(Rez.Strings.UnitsAuto) + " (" + (zones != null && (zones as PaceZones).miles ? "mi" : "km") + ")";
    }

    function smoothText() as String {
        var s = Prefs.smooth();
        return MainMenu.text(s == 0 ? Rez.Strings.SmoothFast : (s == 1 ? Rez.Strings.SmoothNormal : Rez.Strings.SmoothCalm));
    }

    function linkText() as String {
        var sync = getApp().sync;
        return Demo.active() || (sync != null && (sync as Sync).paired()) ? MainMenu.text(Rez.Strings.Linked) : MainMenu.text(Rez.Strings.NotLinked);
    }

    function toggle(id as Symbol, title as String, on as Boolean) as CardItem {
        var item = new CardItem(id, title, null, Draw.GRAY);
        item.toggle = on ? 1 : 0;
        return item;
    }

    function show() as Void {
        var items = [
            new CardItem(:pages, MainMenu.text(Rez.Strings.Pages), MainMenu.text(Rez.Strings.PagesInfo), Draw.BLUE),
            new CardItem(:units, MainMenu.text(Rez.Strings.SetUnits), unitsText(), Draw.BLUE),
            new CardItem(:smooth, MainMenu.text(Rez.Strings.SetSmooth), smoothText(), Draw.BLUE),
            toggle(:km, MainMenu.text(Rez.Strings.SetKm), Prefs.kmSummary()),
            toggle(:pace, MainMenu.text(Rez.Strings.SetPaceAlert), Prefs.paceAlert()),
            toggle(:tones, MainMenu.text(Rez.Strings.SetTones), Prefs.tones()),
            toggle(:vibe, MainMenu.text(Rez.Strings.SetVibration), Prefs.vibration()),
            toggle(:countdown, MainMenu.text(Rez.Strings.SetCountdown), Prefs.countdown()),
            toggle(:weather, MainMenu.text(Rez.Strings.SetWeather), Prefs.weather()),
            new CardItem(:unlink, MainMenu.text(Rez.Strings.SetUnlink), linkText(), Draw.RED)
        ] as Array<CardItem>;
        Cards.show(MainMenu.text(Rez.Strings.MenuSettings), items, new SettingsMenuDelegate(), WatchUi.SLIDE_LEFT);
    }
}

class SettingsMenuDelegate extends CardMenuListener {
    function initialize() {
        CardMenuListener.initialize();
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        var id = item.id;
        if (id == :pages) {
            PagesMenu.show();
        } else if (id == :units) {
            Prefs.set("units", (Prefs.units() + 1) % Prefs.UNITS_COUNT);
            // Alle Anzeigen rechnen mit PaceZones.miles: neu laden, damit die Wahl sofort gilt.
            var zones = getApp().zones;
            if (zones != null) {
                (zones as PaceZones).load();
            }
            item.sub = SettingsMenu.unitsText();
            WatchUi.requestUpdate();
        } else if (id == :smooth) {
            Prefs.set("smooth", (Prefs.smooth() + 1) % Prefs.SMOOTH_COUNT);
            item.sub = SettingsMenu.smoothText();
            WatchUi.requestUpdate();
        } else if (id == :unlink) {
            var sync = getApp().sync;
            if (Demo.active() || (sync != null && (sync as Sync).paired())) {
                WatchUi.pushView(new WatchUi.Confirmation(MainMenu.text(Rez.Strings.UnlinkConfirm)), new UnlinkDelegate(item), WatchUi.SLIDE_IMMEDIATE);
            }
        } else {
            item.toggle = item.toggle == 1 ? 0 : 1;
            var key = id == :km ? "km" : (id == :pace ? "pace" : (id == :tones ? "tones" : (id == :vibe ? "vibe" : (id == :countdown ? "countdown" : "weather"))));
            Prefs.set(key, item.toggle == 1);
            WatchUi.requestUpdate();
        }
    }
}

// Von MaraPlanna trennen: Kopplung und geladene Daten löschen; die Uhr holt sich sofort einen neuen Code.
class UnlinkDelegate extends WatchUi.ConfirmationDelegate {
    private var _item as CardItem;

    function initialize(item as CardItem) {
        ConfirmationDelegate.initialize();
        _item = item;
    }

    function onResponse(value as WatchUi.Confirm) as Boolean {
        if (value == WatchUi.CONFIRM_YES) {
            Application.Storage.deleteValue("secret");
            Application.Storage.deleteValue("code");
            Application.Storage.deleteValue("run");
            Application.Storage.deleteValue("plan");
            Application.Storage.deleteValue("weeks");
            Application.Storage.deleteValue("synced");
            var app = getApp();
            if (app.zones != null) {
                (app.zones as PaceZones).load();
            }
            if (app.sync != null && !Demo.active()) {
                (app.sync as Sync).refresh();
            }
            _item.sub = SettingsMenu.linkText();
            app.onFeedChanged();
        }
        return true;
    }
}
