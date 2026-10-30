// Zusammenfassung nach dem Speichern: Zeit, Distanz, Ø-Pace, Ø-Puls.

import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class SummaryView extends WatchUi.View {
    private var _ms as Number;
    private var _dist as Float;
    private var _hr as Number?;
    private var _miles as Boolean;

    function initialize(ms as Number, dist as Float, hr as Number?, miles as Boolean) {
        View.initialize();
        _ms = ms;
        _dist = dist;
        _hr = hr;
        _miles = miles;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        Draw.lineAlt(dc, h * 0.15, Graphics.FONT_XTINY, Draw.GREEN, ["GESPEICHERT", "Gespeichert", "OK"] as Array<String>);
        var white = Graphics.COLOR_WHITE;
        Draw.grid(dc, h * 0.15 + dc.getFontHeight(Graphics.FONT_XTINY) / 2 + 2, h * 0.79,
            ["ZEIT", _miles ? "MEILEN" : "KM", "Ø PACE", "Ø PULS"] as Array<String>,
            [Pace.time(_ms), Pace.distance(_dist, _miles), Pace.format(Pace.fromDelta(_ms, _dist), _miles), _hr == null ? "--" : (_hr as Number).format("%d")] as Array<String>,
            [white, white, white, white] as Array<Number>);
        Draw.lineAlt(dc, h * 0.85, Graphics.FONT_XTINY, Draw.GRAY, ["Nach dem Sync in Garmin Connect", "In Garmin Connect", "Garmin Connect", ""] as Array<String>);
    }
}
