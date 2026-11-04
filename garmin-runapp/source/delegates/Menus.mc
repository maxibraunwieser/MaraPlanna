// Menüs, die der Startbildschirm öffnet:
//   Hauptmenü      Training · Diese Woche · Trainingsplan · Einstellungen
//   Training       heutige Einheit, Lauftypen (Easy, Long, …), Freier Lauf → Startbildschirm mit GPS;
//                  dazu Kraft (heutige Einheit, freies Training) → StrengthEntry
//   Einstellungen  Datenseiten, Einheiten, km-Zusammenfassung, Pace-Alarm, Töne, Wetter, MaraPlanna trennen
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
        var menu = new WatchUi.Menu2({ :title => text(Rez.Strings.AppName) });
        menu.addItem(new WatchUi.MenuItem(text(Rez.Strings.MenuTrain), trainInfo(feed), :train, null));
        menu.addItem(new WatchUi.MenuItem(text(Rez.Strings.MenuWeek), weekInfo(feed, today), :week, null));
        menu.addItem(new WatchUi.MenuItem(text(Rez.Strings.MenuPlan), planInfo(feed, today), :plan, null));
        menu.addItem(new WatchUi.MenuItem(text(Rez.Strings.MenuSettings), null, :settings, null));
        WatchUi.pushView(menu, new MainMenuDelegate(), WatchUi.SLIDE_UP);
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

class MainMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :train) {
            TrainMenu.show();
        } else if (id == :week) {
            WatchUi.pushView(new WeekView(), new WeekDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :plan) {
            var sync = getApp().sync;
            if (sync != null && !Demo.active()) {
                (sync as Sync).refreshIfStale();
            }
            WatchUi.pushView(new PlanView(), new PlanDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :settings) {
            SettingsMenu.show();
        }
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

module TrainMenu {
    function show() as Void {
        var app = getApp();
        var feed = WeekPlan.feed();
        var workout = Workout.fromFeed(feed);
        var zones = app.zones;
        if (workout != null && zones != null) {
            (workout as Workout).bindZones(zones as PaceZones);
        }
        var miles = zones != null && (zones as PaceZones).miles;
        var menu = new WatchUi.Menu2({ :title => MainMenu.text(Rez.Strings.MenuTrain) });
        var list = Choices.list(zones, workout);
        for (var i = 0; i < list.size(); i++) {
            var id = list[i];
            if (id == Choices.TODAY) {
                var wk = workout as Workout;
                var minutes = (wk.plannedTotal() / 60.0 + 0.5).toNumber();
                var info = MainMenu.text(Rez.Strings.TrainToday) + " · " + Pace.distance1(wk.plannedMeters(), miles) + (miles ? " mi" : " km") + " · " + minutes + " min";
                if (WeekPlan.allDone(WeekPlan.sessions(feed, WeekPlan.today()))) {
                    info = MainMenu.text(Rez.Strings.TrainDone) + " · " + info;
                }
                menu.addItem(new WatchUi.MenuItem(wk.title, info, id, null));
            } else {
                var range = id > 0 && zones != null ? Pace.formatRange((zones as PaceZones).range(id), miles) + (miles ? " /mi" : " /km") : null;
                menu.addItem(new WatchUi.MenuItem(StartView.zoneName(id), range, id, null));
            }
        }
        StrengthEntry.addItems(menu, feed);
        WatchUi.pushView(menu, new TrainMenuDelegate(), WatchUi.SLIDE_LEFT);
    }
}

class TrainMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    // Gewählte Einheit → Startbildschirm (GPS-Suche, START beginnt den Lauf).
    function onSelect(item as WatchUi.MenuItem) as Void {
        if (StrengthEntry.handles(item.getId())) {
            StrengthEntry.open(item.getId(), WeekPlan.feed());
            return;
        }
        var view = new StartView(item.getId() as Number);
        WatchUi.pushView(view, new StartDelegate(view), WatchUi.SLIDE_LEFT);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
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

    function show() as Void {
        var menu = new WatchUi.Menu2({ :title => MainMenu.text(Rez.Strings.MenuSettings) });
        var onOff = { :enabled => MainMenu.text(Rez.Strings.On), :disabled => MainMenu.text(Rez.Strings.Off) };
        menu.addItem(new WatchUi.MenuItem(MainMenu.text(Rez.Strings.Pages), MainMenu.text(Rez.Strings.PagesInfo), :pages, null));
        menu.addItem(new WatchUi.MenuItem(MainMenu.text(Rez.Strings.SetUnits), unitsText(), :units, null));
        menu.addItem(new WatchUi.MenuItem(MainMenu.text(Rez.Strings.SetSmooth), smoothText(), :smooth, null));
        menu.addItem(new WatchUi.ToggleMenuItem(MainMenu.text(Rez.Strings.SetKm), onOff, :km, Prefs.kmSummary(), null));
        menu.addItem(new WatchUi.ToggleMenuItem(MainMenu.text(Rez.Strings.SetPaceAlert), onOff, :pace, Prefs.paceAlert(), null));
        menu.addItem(new WatchUi.ToggleMenuItem(MainMenu.text(Rez.Strings.SetTones), onOff, :tones, Prefs.tones(), null));
        menu.addItem(new WatchUi.ToggleMenuItem(MainMenu.text(Rez.Strings.SetVibration), onOff, :vibe, Prefs.vibration(), null));
        menu.addItem(new WatchUi.ToggleMenuItem(MainMenu.text(Rez.Strings.SetWeather), onOff, :weather, Prefs.weather(), null));
        menu.addItem(new WatchUi.MenuItem(MainMenu.text(Rez.Strings.SetUnlink), linkText(), :unlink, null));
        WatchUi.pushView(menu, new SettingsMenuDelegate(), WatchUi.SLIDE_LEFT);
    }
}

class SettingsMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :pages) {
            PagesMenu.show();
        } else if (id == :units) {
            Prefs.set("units", (Prefs.units() + 1) % Prefs.UNITS_COUNT);
            // Alle Anzeigen rechnen mit PaceZones.miles: neu laden, damit die Wahl sofort gilt.
            var zones = getApp().zones;
            if (zones != null) {
                (zones as PaceZones).load();
            }
            item.setSubLabel(SettingsMenu.unitsText());
            WatchUi.requestUpdate();
        } else if (id == :smooth) {
            Prefs.set("smooth", (Prefs.smooth() + 1) % Prefs.SMOOTH_COUNT);
            item.setSubLabel(SettingsMenu.smoothText());
            WatchUi.requestUpdate();
        } else if (id == :unlink) {
            var sync = getApp().sync;
            if (Demo.active() || (sync != null && (sync as Sync).paired())) {
                WatchUi.pushView(new WatchUi.Confirmation(MainMenu.text(Rez.Strings.UnlinkConfirm)), new UnlinkDelegate(item), WatchUi.SLIDE_IMMEDIATE);
            }
        } else {
            var toggle = item as WatchUi.ToggleMenuItem;
            var key = id == :km ? "km" : (id == :pace ? "pace" : (id == :tones ? "tones" : (id == :vibe ? "vibe" : "weather")));
            Prefs.set(key, toggle.isEnabled());
        }
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

// Von MaraPlanna trennen: Kopplung und geladene Daten löschen; die Uhr holt sich sofort einen neuen Code.
class UnlinkDelegate extends WatchUi.ConfirmationDelegate {
    private var _item as WatchUi.MenuItem;

    function initialize(item as WatchUi.MenuItem) {
        ConfirmationDelegate.initialize();
        _item = item;
    }

    function onResponse(value as WatchUi.Confirm) as Boolean {
        if (value == WatchUi.CONFIRM_YES) {
            Application.Storage.deleteValue("secret");
            Application.Storage.deleteValue("code");
            Application.Storage.deleteValue("run");
            Application.Storage.deleteValue("synced");
            var app = getApp();
            if (app.zones != null) {
                (app.zones as PaceZones).load();
            }
            if (app.sync != null && !Demo.active()) {
                (app.sync as Sync).refresh();
            }
            _item.setSubLabel(SettingsMenu.linkText());
            app.onFeedChanged();
        }
        return true;
    }
}
