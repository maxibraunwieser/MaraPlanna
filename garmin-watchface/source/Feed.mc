// Talking to MaraPlanna and keeping its answers on the watch.
//
// The background service (MaraPlannaService) fetches; the foreground
// (MaraPlannaApp.onBackgroundData) stores. Storage keys:
//   "secret"  random device secret from /pair (identifies this watch)
//   "code"    6-digit pairing code to enter on the website
//   "feed"    last data package (Dictionary, see supabase/functions/_shared/watchFeed.ts)
//   "at"      when the feed was received (epoch seconds)

import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:background)
module Feed {
    const BASE = "https://rynujdcggyafilncmcbr.supabase.co/functions/v1/watch";

    // Local calendar date as YYYY-MM-DD (the plan is in local days).
    function today() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return Lang.format("$1$-$2$-$3$", [t.year, (t.month as Number).format("%02d"), t.day.format("%02d")]);
    }

    function secret() as String? {
        return Application.Storage.getValue("secret") as String?;
    }

    (:foreground)
    function isPaired() as Boolean {
        return Application.Storage.getValue("feed") != null;
    }

    // Handle what the background service passed to Background.exit().
    (:foreground)
    function store(data as Dictionary) as Void {
        var storage = Application.Storage;
        if (data.hasKey("pair")) {
            var pair = data["pair"] as Dictionary;
            storage.setValue("secret", pair["secret"] as String);
            storage.setValue("code", pair["code"] as String);
            storage.deleteValue("feed");
            return;
        }
        if (!data.hasKey("feed")) {
            return; // network error: keep what we have
        }
        var feed = data["feed"] as Dictionary;
        if (feed.hasKey("revoked") || feed.hasKey("expired")) {
            // Unlinked on the website, or the code ran out: start over with a new code.
            storage.deleteValue("secret");
            storage.deleteValue("code");
            storage.deleteValue("feed");
        } else if (feed.hasKey("code")) {
            storage.setValue("code", feed["code"] as String);
        } else if (feed.hasKey("today")) {
            storage.setValue("feed", feed);
            storage.setValue("at", Time.now().value());
            storage.deleteValue("code");
        }
    }
}
