// Vibration und Töne – nur, wenn das Gerät sie unterstützt und der Nutzer sie erlaubt.

import Toybox.Attention;
import Toybox.Lang;
import Toybox.System;

module Alert {
    function vibrate(ms as Number) as Void {
        if ((Attention has :vibrate) && System.getDeviceSettings().vibrateOn) {
            Attention.vibrate([new Attention.VibeProfile(80, ms)]);
        }
    }

    function tone(t as Attention.Tone) as Void {
        if ((Attention has :playTone) && System.getDeviceSettings().tonesOn) {
            Attention.playTone(t);
        }
    }

    function start() as Void {
        tone(Attention.TONE_START);
        vibrate(400);
    }

    function pause() as Void {
        tone(Attention.TONE_STOP);
        vibrate(300);
    }

    function lap() as Void {
        tone(Attention.TONE_LAP);
        vibrate(250);
    }

    function saved() as Void {
        tone(Attention.TONE_SUCCESS);
        vibrate(500);
    }

    // Pace-Alarm: kurz und deutlich.
    function pace(tooFast as Boolean) as Void {
        tone(tooFast ? Attention.TONE_ALERT_LO : Attention.TONE_ALERT_HI);
        vibrate(200);
    }
}
