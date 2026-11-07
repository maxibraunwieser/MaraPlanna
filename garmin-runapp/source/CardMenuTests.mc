// Unit-Tests des Karten-Menüs (nur in Test-Builds: monkeyc -t).

import Toybox.Lang;
import Toybox.Test;

class RecordingListener extends CardMenuListener {
    var picked as Object? = null;

    function initialize() {
        CardMenuListener.initialize();
    }

    function onPick(menu as CardMenu, item as CardItem) as Void {
        picked = item.id;
    }
}

function sampleMenu(tabbed as Boolean) as CardMenu {
    var a = new CardItem(:a, "A", null, Draw.GREEN);
    var b = new CardItem(:b, "B", "sub", Draw.BLUE);
    var off = new CardItem(:off, "Off", null, Draw.GRAY);
    off.enabled = false;
    var tabs = tabbed ? ["Heute", "Laufen"] as Array<String> : [] as Array<String>;
    var pages = tabbed ? [[a, b, off], [new CardItem(:c, "C", null, Draw.RED)]] as Array<Array<CardItem>> : [[a, b, off]] as Array<Array<CardItem>>;
    return new CardMenu("Test", tabs, pages);
}

(:test)
function testCardMenuMovesWithinTheList(logger as Logger) as Boolean {
    var m = sampleMenu(false);
    Test.assertEqual(m.index, 0);
    m.move(-1);
    Test.assertEqual(m.index, 0);
    m.move(1);
    Test.assertEqual(m.index, 1);
    m.move(9);
    Test.assertEqual(m.index, 2);
    return true;
}

(:test)
function testCardMenuTabBarIsAboveTheFirstCard(logger as Logger) as Boolean {
    var m = sampleMenu(true);
    Test.assertEqual(m.index, 0);
    m.move(-1);
    Test.assertEqual(m.index, -1);
    m.move(-1);
    Test.assertEqual(m.index, -1);
    m.move(1);
    Test.assertEqual(m.index, 0);
    return true;
}

(:test)
function testCardMenuStartOnTheTabBarShowsTheNextTab(logger as Logger) as Boolean {
    var m = sampleMenu(true);
    var l = new RecordingListener();
    m.move(-1);
    m.pick(l);
    Test.assertEqual(m.tab, 1);
    // der Fokus bleibt auf der Leiste: noch einmal START geht zurück zum ersten Reiter
    Test.assertEqual(m.index, -1);
    m.pick(l);
    Test.assertEqual(m.tab, 0);
    Test.assert(l.picked == null);
    return true;
}

(:test)
function testCardMenuPicksTheFocusedCard(logger as Logger) as Boolean {
    var m = sampleMenu(true);
    var l = new RecordingListener();
    m.move(1);
    m.pick(l);
    Test.assert(l.picked == :b);
    m.setTab(1);
    Test.assertEqual(m.index, 0);
    m.pick(l);
    Test.assert(l.picked == :c);
    return true;
}

(:test)
function testCardMenuDisabledCardIsNotPicked(logger as Logger) as Boolean {
    var m = sampleMenu(false);
    var l = new RecordingListener();
    m.move(2);
    m.pick(l);
    Test.assert(l.picked == null);
    return true;
}

(:test)
function testCardMenuTabsWrapAround(logger as Logger) as Boolean {
    var m = sampleMenu(true);
    m.setTab(2);
    Test.assertEqual(m.tab, 0);
    m.setTab(-1);
    Test.assertEqual(m.tab, 1);
    return true;
}

(:test)
function testColorBlend(logger as Logger) as Boolean {
    Test.assertEqual(Draw.blend(0x000000, 0xFFFFFF, 0.0), 0x000000);
    Test.assertEqual(Draw.blend(0x000000, 0xFFFFFF, 1.0), 0xFFFFFF);
    Test.assertEqual(Draw.blend(0x102030, 0x102030, 0.5), 0x102030);
    return true;
}
