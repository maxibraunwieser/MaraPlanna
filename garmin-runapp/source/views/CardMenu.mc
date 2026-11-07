// Das Menü der App: eine Liste von Karten im Stil der MaraPlanna-App (Nachtgrund, Glaskarten mit Akzentstreifen, oranger Rand
// im Fokus), optional mit Reitern oben (z. B. Heute · Laufen · Kraft). Ersetzt die System-Menüs, damit alle Listen gleich aussehen.
//   UP/DOWN oder Wischen nach oben/unten   Karte wählen (von der ersten Karte aus UP: Fokus auf die Reiter)
//   START oder Tippen                      Karte öffnen (auf den Reitern: nächster Reiter)
//   Wischen nach links/rechts, Tippen      Reiter wechseln
//   BACK                                   zurück (Listener.onClose)
// Was eine Karte bedeutet, entscheidet der Listener (CardMenuListener.onPick); die Karten selbst kennen nur Titel, Untertitel,
// Akzentfarbe und optional einen Schalter.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// Statussymbol einer Einheit links auf der Karte (wie in der Wochenansicht und auf der Website)
module Mark {
    const NONE = -1;
    const PLANNED = 0;
    const TODAY = 1;
    const DONE = 2;
    const MISSED = 3;
    const SKIPPED = 4;
}

class CardItem {
    var id as Object;
    var title as String;
    var sub as String?;
    // Farbe des Streifens links (z. B. Draw.GREEN für lockere Läufe, Draw.VIOLET für Kraft)
    var tone as Number;
    // -1: kein Schalter, 0: aus, 1: an
    var toggle as Number = -1;
    // Statussymbol statt des Streifens (Mark.*)
    var mark as Number = -1;
    // false: nur zur Anzeige (z. B. "Heute kein Training"), START tut nichts
    var enabled as Boolean = true;

    function initialize(id as Object, title as String, sub as String?, tone as Number) {
        self.id = id;
        self.title = title;
        self.sub = sub;
        self.tone = tone;
    }
}

class CardMenuListener {
    function initialize() {
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
    }

    function onClose(menu as CardMenu) as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

class CardMenu extends WatchUi.View {
    var title as String;
    var tabs as Array<String>;
    var pages as Array<Array<CardItem>>;
    var tab as Number = 0;
    // Nummer der Karte im Fokus; -1: die Reiterleiste hat den Fokus
    var index as Number = 0;
    // Geometrie des letzten Zeichnens, für Tippen
    private var _top as Float = 0.0;
    private var _pitch as Float = 1.0;
    private var _scroll as Float = 0.0;
    private var _tabsBottom as Float = 0.0;
    private var _showTabs as Boolean = false;

    function initialize(title as String, tabs as Array<String>, pages as Array<Array<CardItem>>) {
        View.initialize();
        self.title = title;
        self.tabs = tabs;
        self.pages = pages;
        index = firstIndex();
    }

    function hasTabs() as Boolean {
        return tabs.size() > 1;
    }

    private function firstIndex() as Number {
        return pages[tab].size() > 0 ? 0 : (hasTabs() ? -1 : 0);
    }

    function current() as CardItem? {
        var list = pages[tab];
        return index >= 0 && index < list.size() ? list[index] : null;
    }

    // Eine Karte weiter (+1) oder zurück (-1); oberhalb der ersten Karte liegt die Reiterleiste.
    function move(step as Number) as Void {
        var last = pages[tab].size() - 1;
        var lo = hasTabs() ? -1 : 0;
        var i = index + step;
        i = i > last ? last : i;
        i = i < lo ? lo : i;
        index = i;
        WatchUi.requestUpdate();
    }

    function setTab(t as Number) as Void {
        var n = tabs.size();
        if (n < 2) {
            return;
        }
        tab = ((t % n) + n) % n;
        index = firstIndex();
        WatchUi.requestUpdate();
    }

    // Fokus auf der Reiterleiste: nächster Reiter; sonst die Karte öffnen.
    function pick(listener as CardMenuListener) as Void {
        if (index < 0) {
            // der Fokus bleibt auf der Leiste: nochmal START zeigt den nächsten Reiter, UP/DOWN geht in die Liste
            setTab(tab + 1);
            index = -1;
            return;
        }
        var item = current();
        if (item != null && (item as CardItem).enabled) {
            listener.onPick(self, item as CardItem);
        }
    }

    // Tippen: auf die Reiter (Reiter wählen) oder auf eine Karte (öffnen).
    function tap(x as Numeric, y as Numeric, listener as CardMenuListener) as Void {
        if (_showTabs && y < _tabsBottom) {
            var w = System.getDeviceSettings().screenWidth;
            setTab(((x - w * 0.1) / (w * 0.8) * tabs.size()).toNumber());
            return;
        }
        var row = ((y - _top + _scroll) / _pitch).toNumber();
        if (y >= _top && row >= 0 && row < pages[tab].size()) {
            index = row;
            WatchUi.requestUpdate();
            pick(listener);
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        Draw.background(dc, true);
        Draw.smooth(dc);
        Draw.line(dc, h * 0.095, Graphics.FONT_XTINY, Draw.ORANGE, title);
        _showTabs = hasTabs();
        var top = h * 0.2;
        if (_showTabs) {
            tabBar(dc, h * 0.2, h * 0.095);
            top = h * 0.325;
            _tabsBottom = h * 0.3;
        }
        var bottom = h * 0.94;
        var rh = h * 0.19;
        var gap = h * 0.025;
        var items = pages[tab];
        var n = items.size();
        var view = bottom - top;
        var sel = index < 0 ? 0 : index;
        var scroll = sel * (rh + gap) + rh / 2.0 - view / 2.0;
        var most = n * (rh + gap) - gap - view;
        scroll = scroll > most ? most : scroll;
        scroll = scroll < 0 ? 0.0 : scroll;
        _top = top;
        _pitch = rh + gap;
        _scroll = scroll;
        dc.setClip(0, top.toNumber(), w, view.toNumber());
        for (var i = 0; i < n; i++) {
            var y = top + i * (rh + gap) - scroll;
            if (y + rh >= top && y <= bottom) {
                row(dc, items[i], y, rh, i == index);
            }
        }
        dc.clearClip();
        Draw.plain(dc);
    }

    // Die Reiter nebeneinander als Text; der gewählte ist orange und hat einen Strich darunter (dicker, wenn die Leiste den Fokus hat).
    private function tabBar(dc as Graphics.Dc, y as Float, hh as Float) as Void {
        var w = dc.getWidth();
        var n = tabs.size();
        var total = w * 0.8;
        var each = total / n;
        var font = Graphics.FONT_XTINY;
        for (var i = 0; i < n; i++) {
            var x = w * 0.1 + i * each;
            var active = i == tab;
            dc.setColor(active ? Draw.ORANGE : Draw.GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + each / 2.0, y + hh * 0.42, font, Draw.fit(dc, tabs[i], font, (each - 8).toNumber()), Draw.CENTER);
            if (active) {
                var bar = index < 0 ? 4 : 2;
                dc.fillRoundedRectangle(x + each * 0.2, y + hh * 0.95, each * 0.6, bar, bar / 2);
            }
        }
    }

    // Eine Zeile: Akzentstreifen (oder Statussymbol), Titel, darunter der Untertitel; rechts ein Schalter, wenn sie einen hat.
    // Kein Kasten: die Zeile im Fokus hat einen orangen Streifen und weißen Text, die anderen sind grau; eine dünne Linie trennt.
    private function row(dc as Graphics.Dc, item as CardItem, y as Float, rh as Float, focus as Boolean) as Void {
        var w = dc.getWidth();
        var cy = y + rh / 2.0;
        // auf dem runden Display werden die Zeilen oben und unten etwas schmaler, bleiben aber gut lesbar
        var cw = Draw.widthAt(dc, cy, rh) * 0.95;
        cw = cw > w * 0.9 ? w * 0.9 : (cw < w * 0.74 ? w * 0.74 : cw);
        var x = (w - cw) / 2.0;
        var tx = x + cw * 0.11;
        if (item.mark >= 0) {
            Draw.mark(dc, item.mark, x + cw * 0.1, cy, rh * 0.17);
            tx = x + cw * 0.19;
        } else {
            dc.setColor(focus ? Draw.ORANGE : item.tone, Graphics.COLOR_TRANSPARENT);
            var sw = focus ? 6 : 3;
            dc.fillRoundedRectangle(x + cw * 0.04, y + rh * 0.16, sw, rh * 0.68, sw / 2);
        }
        var right = item.toggle >= 0 ? cw * 0.27 : cw * 0.06;
        var room = (cw - (tx - x) - right).toNumber();
        var sub = item.sub;
        var ink = !item.enabled ? Draw.DIM : (focus ? Graphics.COLOR_WHITE : Draw.GRAY);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        if (sub != null) {
            var tf = Graphics.FONT_TINY;
            dc.drawText(tx, y + rh * 0.34, tf, Draw.fit(dc, item.title, tf, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(focus ? Draw.GRAY : Draw.DIM, Graphics.COLOR_TRANSPARENT);
            var sf = Graphics.FONT_XTINY;
            dc.drawText(tx, y + rh * 0.72, sf, Draw.fit(dc, sub as String, sf, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        } else {
            // groß, solange der Titel in die Zeile passt, sonst eine Stufe kleiner
            var tf = item.toggle < 0 && dc.getTextWidthInPixels(item.title, Graphics.FONT_SMALL) <= room ? Graphics.FONT_SMALL : Graphics.FONT_TINY;
            dc.drawText(tx, cy, tf, Draw.fit(dc, item.title, tf, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        if (item.toggle >= 0) {
            toggle(dc, x + cw - cw * 0.06 - cw * 0.17, cy, cw * 0.17, rh * 0.4, item.toggle == 1);
        }
        // dünne Trennlinie unter der Zeile
        dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(x + cw * 0.04, y + rh + 1, x + cw * 0.96, y + rh + 1);
    }

    // Schalter wie in der App: grün mit Knopf rechts (an), grau mit Knopf links (aus).
    private function toggle(dc as Graphics.Dc, x as Float, cy as Float, tw as Float, th as Float, on as Boolean) as Void {
        dc.setColor(on ? Draw.GREEN : Draw.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, cy - th / 2.0, tw, th, th / 2.0);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(on ? x + tw - th / 2.0 : x + th / 2.0, cy, th * 0.38);
    }
}

class CardMenuDelegate extends WatchUi.BehaviorDelegate {
    private var _menu as CardMenu;
    private var _listener as CardMenuListener;

    function initialize(menu as CardMenu, listener as CardMenuListener) {
        BehaviorDelegate.initialize();
        _menu = menu;
        _listener = listener;
    }

    function listener() as CardMenuListener {
        return _listener;
    }

    function onNextPage() as Boolean {
        _menu.move(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        _menu.move(-1);
        return true;
    }

    function onSelect() as Boolean {
        _menu.pick(_listener);
        return true;
    }

    function onBack() as Boolean {
        _listener.onClose(_menu);
        return true;
    }

    // Wischen: hoch/runter wählt die Karte, links/rechts wechselt den Reiter (auf dem ersten Reiter ist rechts "zurück").
    function onSwipe(evt as WatchUi.SwipeEvent) as Boolean {
        var d = evt.getDirection();
        if (d == WatchUi.SWIPE_UP) {
            _menu.move(1);
        } else if (d == WatchUi.SWIPE_DOWN) {
            _menu.move(-1);
        } else if (d == WatchUi.SWIPE_LEFT && _menu.hasTabs()) {
            _menu.setTab(_menu.tab + 1);
        } else if (d == WatchUi.SWIPE_RIGHT) {
            if (_menu.hasTabs() && _menu.tab > 0) {
                _menu.setTab(_menu.tab - 1);
            } else {
                _listener.onClose(_menu);
            }
        }
        return true;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var xy = evt.getCoordinates();
        _menu.tap(xy[0], xy[1], _listener);
        return true;
    }
}

// Ein Menü zeigen (Karten ohne Reiter).
module Cards {
    function show(title as String, items as Array<CardItem>, listener as CardMenuListener, transition as WatchUi.SlideType) as CardMenu {
        return showTabs(title, [] as Array<String>, [items] as Array<Array<CardItem>>, listener, transition);
    }

    function showTabs(title as String, tabs as Array<String>, pages as Array<Array<CardItem>>, listener as CardMenuListener, transition as WatchUi.SlideType) as CardMenu {
        var menu = new CardMenu(title, tabs, pages);
        WatchUi.pushView(menu, new CardMenuDelegate(menu, listener), transition);
        return menu;
    }
}
