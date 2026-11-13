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
    // Infozeile unter einer Karte (z. B. ein Abschnitt der Einheit): niedriger, eingerückt, nie im Fokus, nicht wählbar
    var info as Boolean = false;
    // Inhalt einer Einheit als Kasten unter ihrer Kopfzeile: je Eintrag [Titel, Untertitel] (nur mit info)
    var lines as Array<Array<String>>? = null;

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

    // Das Menü ist wieder sichtbar (nach dem ersten Zeigen), z. B. zurück aus einem Training: Karten bei Bedarf neu bauen
    function onShow(menu as CardMenu) as Void {
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
    private var _rh as Float = 1.0;
    private var _gap as Float = 0.0;
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

    // Höhe eines Eintrags im Kasten einer Einheit (Anteil einer Kartenzeile)
    private const BOX_LINE = 0.84;
    // Kasten unter der Karte im Fokus, der nicht ganz auf das Display passt: so weit ist er nach oben geschoben (AB blättert
    // erst durch den Kasten, dann zur nächsten Karte) und so viel ragt noch unten heraus (beim letzten Zeichnen)
    private var _extra as Float = 0.0;
    private var _overflow as Float = 0.0;

    // Wer auf die Karten reagiert (für onShow)
    var listener as CardMenuListener? = null;
    private var _shown as Boolean = false;

    function onShow() as Void {
        if (_shown && listener != null) {
            (listener as CardMenuListener).onShow(self);
        }
        _shown = true;
    }

    // Neue Karten (gleicher Reiter, Fokus bleibt, soweit es ihn noch gibt)
    function refresh(newTabs as Array<String>, newPages as Array<Array<CardItem>>) as Void {
        tabs = newTabs;
        pages = newPages;
        tab = tab < pages.size() ? tab : 0;
        var last = pages[tab].size() - 1;
        index = index > last ? last : index;
        if (index >= 0 && pages[tab][index].info) {
            index = firstIndex();
        }
        WatchUi.requestUpdate();
    }

    function hasTabs() as Boolean {
        return tabs.size() > 1;
    }

    private function firstIndex() as Number {
        var list = pages[tab];
        for (var i = 0; i < list.size(); i++) {
            if (!list[i].info) {
                return i;
            }
        }
        return hasTabs() ? -1 : 0;
    }

    // Höhe einer Zeile: Infozeilen sind niedriger
    private function heightOf(item as CardItem, rh as Float) as Float {
        if (item.info && item.lines != null) {
            return rh * (0.2 + (item.lines as Array).size() * BOX_LINE);
        }
        return item.info ? rh * 0.74 : rh;
    }

    function current() as CardItem? {
        var list = pages[tab];
        return index >= 0 && index < list.size() ? list[index] : null;
    }

    // Eine Karte weiter (+1) oder zurück (-1); oberhalb der ersten Karte liegt die Reiterleiste.
    // Infozeilen werden übersprungen (sie sind nur zum Lesen da).
    function move(step as Number) as Void {
        // erst durch den Kasten der Einheit blättern (er ist nicht wählbar, nur zu lesen)
        if (step > 0 && _overflow > 1.0) {
            _extra += _overflow < _rh ? _overflow : _rh;
            WatchUi.requestUpdate();
            return;
        }
        if (step < 0 && _extra > 0.0) {
            _extra = _extra > _rh ? _extra - _rh : 0.0;
            WatchUi.requestUpdate();
            return;
        }
        _extra = 0.0;
        var list = pages[tab];
        var last = list.size() - 1;
        var lo = hasTabs() ? -1 : 0;
        var dir = step < 0 ? -1 : 1;
        var i = index + step;
        i = i > last ? last : i;
        i = i < lo ? lo : i;
        // auf einer Infozeile gelandet: in Laufrichtung weiter, am Ende zurück zur letzten wählbaren Karte
        while (i >= 0 && i <= last && list[i].info) {
            i += dir;
        }
        if (i > last) {
            i = last;
            while (i > index && list[i].info) {
                i -= 1;
            }
        }
        if (i < lo || (i >= 0 && list[i].info)) {
            i = hasTabs() ? -1 : index;
        }
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
        _extra = 0.0;
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
        if (y < _top) {
            return;
        }
        var row = rowAt((y - _top + _scroll).toFloat());
        if (row >= 0 && !pages[tab][row].info) {
            index = row;
            WatchUi.requestUpdate();
            pick(listener);
        }
    }

    // Zeile an der Stelle (Abstand von der Oberkante der Liste), -1 außerhalb
    private function rowAt(pos as Float) as Number {
        var list = pages[tab];
        var y = 0.0;
        for (var i = 0; i < list.size(); i++) {
            var hh = heightOf(list[i], _rh);
            if (pos >= y && pos < y + hh + _gap) {
                return i;
            }
            y += hh + _gap;
        }
        return -1;
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
        // Lage jeder Zeile (Infozeilen sind niedriger); die Karte im Fokus steht möglichst in der Mitte, ihre Infozeilen darunter
        var ys = [] as Array<Float>;
        var pos = 0.0;
        for (var i = 0; i < n; i++) {
            ys.add(pos);
            pos += heightOf(items[i], rh) + gap;
        }
        var selY = n > 0 ? ys[sel < n ? sel : n - 1] : 0.0;
        var withInfo = sel + 1 < n && items[sel + 1].info;
        // mit Kasten darunter: die Kopfzeile oben, damit der Inhalt der Einheit ganz zu sehen ist
        var scroll = withInfo ? selY - gap + _extra : selY + rh / 2.0 - view / 2.0;
        var most = pos - gap - view;
        // was vom Kasten unter der Karte im Fokus noch unten herausragt
        _overflow = 0.0;
        if (withInfo && index >= 0) {
            var boxBottom = ys[sel + 1] + heightOf(items[sel + 1], rh);
            var shown = scroll > most ? most : scroll;
            _overflow = boxBottom - (shown < 0 ? 0.0 : shown) - view;
            _overflow = _overflow < 0.0 ? 0.0 : _overflow;
        }
        scroll = scroll > most ? most : scroll;
        scroll = scroll < 0 ? 0.0 : scroll;
        _top = top;
        _rh = rh;
        _gap = gap;
        _scroll = scroll;
        dc.setClip(0, top.toNumber(), w, view.toNumber());
        for (var i = 0; i < n; i++) {
            var y = top + ys[i] - scroll;
            var hh = heightOf(items[i], rh);
            if (y + hh >= top && y <= bottom) {
                if (items[i].info && items[i].lines != null) {
                    infoBox(dc, items[i], y, hh, rh);
                } else if (items[i].info) {
                    infoRow(dc, items[i], y, hh);
                } else {
                    row(dc, items[i], y, rh, i == index);
                }
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

    // Infozeile: eingerückt unter ihrer Karte, kleine Schrift, Titel und Untertitel nebeneinander bzw. untereinander,
    // ein dünner Strich in der Farbe der Karte links zeigt, wozu sie gehört. Kein Fokus, keine Trennlinie.
    private function infoRow(dc as Graphics.Dc, item as CardItem, y as Float, hh as Float) as Void {
        var w = dc.getWidth();
        var cy = y + hh / 2.0;
        var cw = Draw.widthAt(dc, cy, hh) * 0.95;
        cw = cw > w * 0.9 ? w * 0.9 : (cw < w * 0.74 ? w * 0.74 : cw);
        var x = (w - cw) / 2.0;
        var tx = x + cw * 0.16;
        var room = (cw - (tx - x) - cw * 0.05).toNumber();
        dc.setColor(item.tone, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x + cw * 0.09, y + hh * 0.12, 2, hh * 0.76);
        var f = Graphics.FONT_XTINY;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(tx, y + hh * 0.27, f, Draw.fit(dc, item.title, f, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        if (item.sub != null) {
            dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(tx, y + hh * 0.75, f, Draw.fit(dc, item.sub as String, f, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // Inhalt einer Einheit als Kasten unter ihrer Kopfzeile: dunkle Fläche mit feinem Rand und einem Streifen in der Farbe der
    // Einheit links, darin jeder Abschnitt bzw. jede Übung (Titel weiß, darunter grau), getrennt durch feine Linien.
    private function infoBox(dc as Graphics.Dc, item as CardItem, y as Float, hh as Float, rh as Float) as Void {
        var w = dc.getWidth();
        var bw = w * 0.76;
        var x = (w - bw) / 2.0;
        var top = y + rh * 0.04;
        var height = hh - rh * 0.08;
        dc.setColor(0x1A1D27, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, top, bw, height, 10);
        dc.setColor(Draw.EDGE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawRoundedRectangle(x, top, bw, height, 10);
        dc.setColor(item.tone, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x + 4, top + 8, 3, height - 16, 1);
        var list = item.lines as Array<Array<String>>;
        var lh = rh * BOX_LINE;
        var tx = x + bw * 0.1;
        var f = Graphics.FONT_XTINY;
        for (var k = 0; k < list.size(); k++) {
            var ly = top + rh * 0.06 + k * lh;
            // auf dem runden Display ist es oben und unten schmaler: der Text passt sich der Zeile an
            var right = (w + Draw.widthAt(dc, ly + lh / 2.0, lh)) / 2.0 - 6;
            right = right > x + bw - 6 ? x + bw - 6 : right;
            var room = (right - tx).toNumber();
            room = room < 20 ? 20 : room;
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(tx, ly + lh * 0.3, f, Draw.fit(dc, list[k][0], f, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            dc.setColor(Draw.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(tx, ly + lh * 0.7, f, Draw.fit(dc, list[k][1], f, room), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            if (k < list.size() - 1) {
                dc.setColor(Draw.TRACK, Graphics.COLOR_TRANSPARENT);
                dc.drawLine(tx, ly + lh, x + bw - bw * 0.06, ly + lh);
            }
        }
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
        menu.listener = listener;
        WatchUi.pushView(menu, new CardMenuDelegate(menu, listener), transition);
        return menu;
    }
}
