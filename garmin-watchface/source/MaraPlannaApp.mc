// MaraPlanna watch face: time plus today's session, the week and the race
// countdown from MaraPlanna. Data comes from the background service.

import Toybox.Application;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background)
class MaraPlannaApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    (:typecheck(disableBackgroundCheck))
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        if (!Demo.active()) {
            schedule(Application.Storage.getValue("feed") == null);
        }
        return [new MaraPlannaView()];
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new MaraPlannaService()];
    }

    // In the foreground: whatever the background service passed to Background.exit().
    (:typecheck(disableBackgroundCheck))
    function onBackgroundData(data as Application.PersistableType) as Void {
        var restart = Feed.secret() != null;
        if (data instanceof Dictionary) {
            Feed.store(data as Dictionary<Application.PropertyKeyType, Application.PropertyValueType>);
        }
        // Lost the link (unlinked or code expired): get a new code right away.
        schedule(restart && Feed.secret() == null);
        WatchUi.requestUpdate();
    }

    // Every 5 minutes while waiting for the code to be entered, then every 30.
    // `now` runs once immediately (allowed if the last run was ≥ 5 min ago).
    (:typecheck(disableBackgroundCheck))
    function schedule(now as Boolean) as Void {
        if (now) {
            var last = Background.getLastTemporalEventTime();
            if (last == null || Time.now().compare(last) >= 300) {
                Background.registerForTemporalEvent(Time.now());
                return;
            }
        }
        var every = Feed.isPaired() ? 30 * 60 : 5 * 60;
        var registered = Background.getTemporalEventRegisteredTime();
        if (!(registered instanceof Time.Duration) || registered.value() != every) {
            Background.registerForTemporalEvent(new Time.Duration(every));
        }
    }
}
