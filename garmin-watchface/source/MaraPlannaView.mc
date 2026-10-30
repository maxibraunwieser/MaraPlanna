// The watch face: date and time on top; today's session, the week and the
// race countdown below. Text is fitted to the screen width at its height, so
// the same layout works on round and rectangular screens of any size.

import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

class MaraPlannaView extends WatchUi.WatchFace {
    private const ORANGE = 0xF97316;
    private const GREEN = 0x22C55E;
    private const GRAY = 0xAAAAAA;
    private const DIM = 0x555555;
    private const CENTER = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;

    private var _sleeping as Boolean = false;
    private var _burnIn as Boolean = false;
    private var _round as Boolean = true;

    function initialize() {
        WatchFace.initialize();
        var settings = System.getDeviceSettings();
        _burnIn = (settings has :requiresBurnInProtection) && settings.requiresBurnInProtection;
        _round = settings.screenShape == System.SCREEN_SHAPE_ROUND;
    }

    function onShow() as Void {
        // Make sure the background refresh is scheduled (e.g. after an activity).
        (Application.getApp() as MaraPlannaApp).schedule(false);
    }

    function onEnterSleep() as Void {
        _sleeping = true;
        WatchUi.requestUpdate();
    }

    function onExitSleep() as Void {
        _sleeping = false;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        if (_sleeping && _burnIn) {
            // Always-on on AMOLED: only a dim time, moved a little every minute against burn-in.
            var min = System.getClockTime().min;
            dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2 + (min % 5 - 2) * 3, h / 2 + (min % 3 - 1) * 4, Graphics.FONT_NUMBER_MEDIUM, timeText(), CENTER);
            return;
        }

        line(dc, h * 0.15, Graphics.FONT_XTINY, GRAY, dateText());
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.29, Graphics.FONT_NUMBER_MEDIUM, timeText(), CENTER);

        var feed = Application.Storage.getValue("feed");
        if (feed instanceof Dictionary) {
            drawFeed(dc, feed);
        } else {
            drawPairing(dc);
        }
    }

    // -----------------------------------------------------------------------
    // Content
    // -----------------------------------------------------------------------

    private function drawFeed(dc as Graphics.Dc, feed as Dictionary) as Void {
        var h = dc.getHeight();
        var day = feed["today"] as Dictionary?;
        // Shortly after midnight the stored "tomorrow" is today until the next update.
        if (Feed.today().equals(addDaysText(feed["date"] as String?, 1)) && feed["next"] instanceof Dictionary) {
            day = feed["next"] as Dictionary;
        }
        if (day != null) {
            var done = day["done"] == true;
            var label = asText(day["label"]);
            if (label.find("TOMORROW") == 0) {
                label = "TODAY" + label.substring(8, label.length());
            }
            line(dc, h * 0.455, Graphics.FONT_XTINY, done ? GREEN : ORANGE, done ? label + " · DONE" : label);
            line(dc, h * 0.54, Graphics.FONT_SMALL, done ? GREEN : Graphics.COLOR_WHITE, asText(day["title"]));
            line(dc, h * 0.62, Graphics.FONT_XTINY, GRAY, asText(day["line"]));
        }

        var week = feed["week"] as Dictionary?;
        if (week != null) {
            var planned = asFloat(week["planned"]);
            if (planned > 0) {
                bar(dc, h * 0.705, asFloat(week["done"]) / planned);
                line(dc, h * 0.765, Graphics.FONT_XTINY, GRAY, "WEEK " + asText(week["text"]));
            }
        }

        var race = feed["race"] as Dictionary?;
        var proj = feed["proj"];
        if (race != null) {
            var s = asText(race["text"]);
            if (proj instanceof String) {
                s = s + " · " + proj;
            }
            line(dc, h * 0.845, Graphics.FONT_XTINY, Graphics.COLOR_WHITE, s);
        }
    }

    private function drawPairing(dc as Graphics.Dc) as Void {
        var h = dc.getHeight();
        var code = Application.Storage.getValue("code");
        if (code instanceof String && code.length() == 6) {
            line(dc, h * 0.47, Graphics.FONT_XTINY, ORANGE, "LINK MARAPLANNA");
            line(dc, h * 0.575, Graphics.FONT_MEDIUM, Graphics.COLOR_WHITE, code.substring(0, 3) + " " + code.substring(3, 6));
            line(dc, h * 0.68, Graphics.FONT_XTINY, GRAY, "Website: Settings >");
            line(dc, h * 0.75, Graphics.FONT_XTINY, GRAY, "Garmin watch face");
        } else {
            line(dc, h * 0.5, Graphics.FONT_XTINY, ORANGE, "MARAPLANNA");
            line(dc, h * 0.59, Graphics.FONT_XTINY, GRAY, "Connecting...");
            line(dc, h * 0.66, Graphics.FONT_XTINY, GRAY, "Keep your phone nearby");
        }
    }

    // -----------------------------------------------------------------------
    // Drawing helpers
    // -----------------------------------------------------------------------

    // Centred text, shortened to fit the screen width at that height.
    private function line(dc as Graphics.Dc, y as Numeric, font as Graphics.FontDefinition, color as Number, s as String) as Void {
        var max = widthAt(dc, y, dc.getFontHeight(font)) - 16;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, fit(dc, s, font, max), CENTER);
    }

    // Progress bar for the week's distance.
    private function bar(dc as Graphics.Dc, y as Numeric, ratio as Float) as Void {
        var h = dc.getHeight();
        var height = h * 0.018 < 4 ? 4 : (h * 0.018).toNumber();
        var width = (widthAt(dc, y, height) * 0.62).toNumber();
        var x = (dc.getWidth() - width) / 2;
        var top = (y - height / 2).toNumber();
        dc.setColor(DIM, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, top, width, height, height / 2);
        var fill = (width * (ratio > 1.0 ? 1.0 : ratio < 0.0 ? 0.0 : ratio)).toNumber();
        if (fill >= height) {
            dc.setColor(ORANGE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, top, fill, height, height / 2);
        }
    }

    // Usable width at height y: round screens get narrower towards the edge.
    private function widthAt(dc as Graphics.Dc, y as Numeric, lineHeight as Numeric) as Number {
        var w = dc.getWidth();
        if (!_round) {
            return w;
        }
        var r = w / 2.0;
        var dy = (y - dc.getHeight() / 2.0).abs() + lineHeight / 2.0;
        if (dy >= r) {
            return 0;
        }
        return (2 * Math.sqrt(r * r - dy * dy)).toNumber();
    }

    private function fit(dc as Graphics.Dc, s as String, font as Graphics.FontDefinition, max as Number) as String {
        if (dc.getTextWidthInPixels(s, font) <= max) {
            return s;
        }
        var n = s.length();
        while (n > 1 && dc.getTextWidthInPixels(s.substring(0, n) + "...", font) > max) {
            n -= 1;
        }
        return s.substring(0, n) + "...";
    }

    // -----------------------------------------------------------------------
    // Values
    // -----------------------------------------------------------------------

    private function timeText() as String {
        var clock = System.getClockTime();
        var hour = clock.hour;
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        return Lang.format("$1$:$2$", [hour, clock.min.format("%02d")]);
    }

    private function dateText() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        return Lang.format("$1$ $2$ $3$", [t.day_of_week, t.day, t.month]).toUpper();
    }

    // "2026-10-30" + n days, or null.
    private function addDaysText(date as String?, n as Number) as String? {
        if (date == null || date.length() != 10) {
            return null;
        }
        var d = date as String;
        var y = d.substring(0, 4).toNumber();
        var m = d.substring(5, 7).toNumber();
        var dd = d.substring(8, 10).toNumber();
        if (y == null || m == null || dd == null) {
            return null;
        }
        var moment = Gregorian.moment({ :year => y, :month => m, :day => dd, :hour => 12 });
        var t = Gregorian.info(moment.add(new Time.Duration(n * 86400)), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }

    private function asText(v) as String {
        return v instanceof String ? v : v == null ? "" : v.toString();
    }

    private function asFloat(v) as Float {
        return v instanceof Number || v instanceof Float || v instanceof Long || v instanceof Double ? v.toFloat() : 0.0;
    }
}
