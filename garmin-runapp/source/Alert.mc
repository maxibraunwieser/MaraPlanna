// Vibration und Töne – nur, wenn das Gerät sie unterstützt und der Nutzer sie erlaubt
// (Einstellungen der Uhr und die Schalter "Töne" und "Vibration" in den App-Einstellungen).

import Toybox.Attention;
import Toybox.Lang;
import Toybox.System;

module Alert {
    function canVibrate() as Boolean {
        return Prefs.vibration() && (Attention has :vibrate) && System.getDeviceSettings().vibrateOn;
    }

    function vibrate(ms as Number) as Void {
        if (canVibrate()) {
            Attention.vibrate([new Attention.VibeProfile(80, ms)]);
        }
    }

    function tone(t as Attention.Tone) as Void {
        if (Prefs.tones() && (Attention has :playTone) && System.getDeviceSettings().tonesOn) {
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

    // Ein Takt des Countdowns vor einem Schrittwechsel: kurz, aber im Laufen gut zu spüren (volle Stärke).
    // Ist die Vibration aus oder nicht vorhanden, gibt es stattdessen einen kurzen Ton, damit der Countdown nicht verloren geht.
    function countdown() as Void {
        if (canVibrate()) {
            Attention.vibrate([new Attention.VibeProfile(100, 130)]);
        } else {
            tone(Attention.TONE_KEY);
        }
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
