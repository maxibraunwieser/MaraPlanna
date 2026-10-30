// Tasten und Touch.
//   Start:  AUF/AB (Wischen) wählt den Lauftyp, START (Tippen) startet, BACK beendet die App.
//   Lauf:   START pausiert (+ Menü) bzw. setzt fort, BACK = Runde (beendet nie),
//           AUF/AB, Wischen oder Tippen blättern die Seiten.
//   Pause:  Menü Fortsetzen / Speichern / Verwerfen (mit Rückfrage).

import Toybox.Activity;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

class StartDelegate extends WatchUi.BehaviorDelegate {
    private var _view as StartView;

    function initialize(view as StartView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onNextPage() as Boolean {
        _view.move(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.move(-1);
        return true;
    }

    function onSelect() as Boolean {
        var app = getApp();
        var c = app.controller as RecordingController;
        var opt = _view.choice();
        if (opt == -2) {
            PagesMenu.show();
            return true;
        }
        c.start(opt < 0 ? (_view.workout as Workout).zone : opt, opt < 0 ? _view.workout : null);
        if (app.sync != null) {
            (app.sync as Sync).stop();
        }
        var data = new DataView();
        WatchUi.switchToView(data, new DataDelegate(data), WatchUi.SLIDE_UP);
        return true;
    }
}

module Swipe {
    // Wischen nach links oder oben = nächste Seite (1), nach rechts oder unten = vorherige (-1).
    function step(direction as Number) as Number {
        return direction == WatchUi.SWIPE_LEFT || direction == WatchUi.SWIPE_UP ? 1 : -1;
    }
}

class DataDelegate extends WatchUi.BehaviorDelegate {
    private var _view as DataView;

    function initialize(view as DataView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    private function controller() as RecordingController {
        return getApp().controller as RecordingController;
    }

    // START/STOP
    function onSelect() as Boolean {
        var c = controller();
        if (c.state == Rec.RECORDING) {
            c.pause();
            showMenu();
        } else if (c.state == Rec.PAUSED) {
            c.resume();
        }
        return true;
    }

    // BACK = Runde während der Aufzeichnung; in der Pause das Menü. Nie stillschweigend beenden.
    function onBack() as Boolean {
        var c = controller();
        if (c.state == Rec.RECORDING) {
            c.lap();
        } else if (c.state == Rec.PAUSED) {
            showMenu();
        }
        return true;
    }

    function onNextPage() as Boolean {
        _view.flip(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.flip(-1);
        return true;
    }

    // Wischen blättert (links/oben = weiter, rechts/unten = zurück). Wird hier abgefangen, damit
    // "nach rechts wischen" nicht als BACK zählt und versehentlich eine Runde auslöst.
    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        _view.flip(Swipe.step(evt.getDirection()));
        return true;
    }

    // Tippen blättert nur (kein versehentliches Pausieren auf Touch-Uhren).
    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        _view.flip(1);
        return true;
    }

    function showMenu() as Void {
        var menu = new WatchUi.Menu2({ :title => WatchUi.loadResource(Rez.Strings.MenuTitle) as String });
        menu.addItem(new WatchUi.MenuItem(WatchUi.loadResource(Rez.Strings.Resume) as String, null, :resume, null));
        menu.addItem(new WatchUi.MenuItem(WatchUi.loadResource(Rez.Strings.Pages) as String, null, :pages, null));
        menu.addItem(new WatchUi.MenuItem(WatchUi.loadResource(Rez.Strings.Save) as String, null, :save, null));
        menu.addItem(new WatchUi.MenuItem(WatchUi.loadResource(Rez.Strings.Discard) as String, null, :discard, null));
        WatchUi.pushView(menu, new PauseMenuDelegate(), WatchUi.SLIDE_UP);
    }
}

class PauseMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var c = getApp().controller as RecordingController;
        var id = item.getId();
        if (id == :resume) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            c.resume();
        } else if (id == :pages) {
            PagesMenu.show();
        } else if (id == :save) {
            // Werte vor dem Speichern festhalten – danach ist die Sitzung beendet.
            var info = Activity.getActivityInfo();
            var hr = info != null ? info.averageHeartRate : null;
            var summary = new SummaryView(c.timerMs(info), c.distance(info), hr, c.zones.miles);
            c.save();
            WatchUi.pushView(summary, new SummaryDelegate(), WatchUi.SLIDE_UP);
        } else if (id == :discard) {
            var dialog = new WatchUi.Confirmation(WatchUi.loadResource(Rez.Strings.DiscardConfirm) as String);
            WatchUi.pushView(dialog, new DiscardDelegate(), WatchUi.SLIDE_IMMEDIATE);
        }
    }

    // Zurück aus dem Menü: bleibt pausiert.
    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

class DiscardDelegate extends WatchUi.ConfirmationDelegate {
    function initialize() {
        ConfirmationDelegate.initialize();
    }

    function onResponse(value as WatchUi.Confirm) as Boolean {
        if (value == WatchUi.CONFIRM_YES) {
            (getApp().controller as RecordingController).discard();
            System.exit();
        }
        return true;
    }
}

class SummaryDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() as Boolean {
        System.exit();
    }

    function onSelect() as Boolean {
        System.exit();
    }
}

// Menü "Datenseiten": jede Seite lässt sich an- und ausschalten, die Auswahl bleibt gespeichert.
module PagesMenu {
    function show() as Void {
        var menu = new WatchUi.Menu2({ :title => WatchUi.loadResource(Rez.Strings.Pages) as String });
        for (var i = 0; i < Pages.COUNT; i++) {
            menu.addItem(new WatchUi.ToggleMenuItem(Pages.NAMES[i], Pages.INFO[i], i, Pages.enabled(i), null));
        }
        WatchUi.pushView(menu, new PagesMenuDelegate(), WatchUi.SLIDE_LEFT);
    }
}

class PagesMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    // Das Menü hat den Schalter schon umgelegt, hier wird nur gespeichert. Mindestens eine Seite bleibt an.
    function onSelect(item as WatchUi.MenuItem) as Void {
        var toggle = item as WatchUi.ToggleMenuItem;
        var bit = 1 << (toggle.getId() as Number);
        var mask = Pages.mask();
        mask = toggle.isEnabled() ? (mask | bit) : (mask & ~bit);
        if (mask == 0) {
            toggle.setEnabled(true);
            return;
        }
        Pages.save(mask);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}
