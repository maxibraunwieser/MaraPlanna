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

    (:typecheck(disableBackgroundCheck))
    function isPaired() as Boolean {
        return Application.Storage.getValue("feed") != null;
    }

    // Handle what the background service passed to Background.exit().
    (:typecheck(disableBackgroundCheck))
    function store(data as Dictionary<Application.PropertyKeyType, Application.PropertyValueType>) as Void {
        var pair = data["pair"];
        if (pair instanceof Dictionary) {
            Application.Storage.setValue("secret", pair["secret"] as String);
            Application.Storage.setValue("code", pair["code"] as String);
            Application.Storage.deleteValue("feed");
            return;
        }
        var feed = data["feed"];
        if (!(feed instanceof Dictionary)) {
            return; // network error: keep what we have
        }
        if (feed.hasKey("revoked") || feed.hasKey("expired")) {
            // Unlinked on the website, or the code ran out: start over with a new code.
            Application.Storage.deleteValue("secret");
            Application.Storage.deleteValue("code");
            Application.Storage.deleteValue("feed");
        } else if (feed.hasKey("code")) {
            Application.Storage.setValue("code", feed["code"] as String);
        } else if (feed.hasKey("today")) {
            Application.Storage.setValue("feed", feed as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
            Application.Storage.setValue("at", Time.now().value());
            Application.Storage.deleteValue("code");
        }
    }
}
