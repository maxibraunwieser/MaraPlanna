// Background service: runs every few minutes even while the watch face is
// asleep and fetches through the Garmin Connect app on the phone.

import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

(:background)
class MaraPlannaService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        var secret = Feed.secret();
        if (secret == null) {
            // Not linked yet: ask for a pairing code.
            Communications.makeWebRequest(
                Feed.BASE + "/pair",
                {},
                {
                    :method => Communications.HTTP_REQUEST_METHOD_POST,
                    :headers => { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onPair)
            );
        } else {
            Communications.makeWebRequest(
                Feed.BASE + "/data",
                { "date" => Feed.today() },
                {
                    :method => Communications.HTTP_REQUEST_METHOD_GET,
                    :headers => { "X-Watch-Secret" => secret },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onData)
            );
        }
    }

    function onPair(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary && data.hasKey("secret")) {
            Background.exit({ "pair" => data as Dictionary<Application.PropertyKeyType, Application.PropertyValueType> });
        } else {
            Background.exit({ "error" => responseCode });
        }
    }

    function onData(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary) {
            Background.exit({ "feed" => data as Dictionary<Application.PropertyKeyType, Application.PropertyValueType> });
        } else {
            Background.exit({ "error" => responseCode });
        }
    }
}
