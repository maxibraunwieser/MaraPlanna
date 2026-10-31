// Live-Werte der Uhr für den Startbildschirm: Puls, VO2max, Wetter, Datum und Uhrzeit.
// Alles kommt von der Uhr selbst (Sensor, Garmin-Profil, Garmin-Wetter) – nichts ist fest eingetragen.
// Fehlt ein Wert (kein Sensor, noch kein Wetter, VO2max noch nicht gemessen), gibt die Funktion null zurück
// und die Anzeige zeigt "--" bzw. lässt das Feld weg.

import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.UserProfile;
import Toybox.Weather;

// Wetter jetzt: Temperatur in der Einheit der Uhr (°C oder °F) und eine Wetterart zum Zeichnen.
class Conditions {
    var temp as Number;
    var kind as Number;

    function initialize(temp as Number, kind as Number) {
        self.temp = temp;
        self.kind = kind;
    }
}

module Vitals {
    // Wetterarten für die Symbole
    const CLEAR = 0;
    const PARTLY = 1;
    const CLOUDY = 2;
    const RAIN = 3;
    const SNOW = 4;
    const STORM = 5;
    const FOG = 6;
    const WIND = 7;

    // Ältere Wetterdaten als 6 Stunden sind keine Anzeige mehr wert.
    const WEATHER_MAX_AGE_S = 21600;
    // Ein Pulswert aus dem Tagesverlauf der Uhr gilt 5 Minuten.
    const HEART_MAX_AGE_S = 300;

    // Aktueller Puls: Sensor, sonst der letzte Wert der Uhr aus den letzten Minuten.
    function heartRate() as Number? {
        var info = Activity.getActivityInfo();
        var hr = info != null ? info.currentHeartRate : null;
        if (hr != null) {
            return hr;
        }
        if (ActivityMonitor has :getHeartRateHistory) {
            var sample = ActivityMonitor.getHeartRateHistory(1, true).next();
            if (sample != null && sample.heartRate != ActivityMonitor.INVALID_HR_SAMPLE && sample.when != null) {
                var age = Time.now().value() - (sample.when as Time.Moment).value();
                if (age >= 0 && age <= HEART_MAX_AGE_S) {
                    return sample.heartRate;
                }
            }
        }
        return null;
    }

    // VO2max (Laufen) aus dem Garmin-Profil; null, solange die Uhr noch keinen Wert hat.
    function vo2max() as Number? {
        var profile = UserProfile.getProfile();
        if (profile has :vo2maxRunning) {
            var v = (profile as UserProfile.Profile).vo2maxRunning;
            if (v != null && v > 0) {
                return v;
            }
        }
        return Demo.vo2();
    }

    function weather() as Conditions? {
        if ((Toybox has :Weather) && (Weather has :getCurrentConditions)) {
            var c = Weather.getCurrentConditions();
            if (c != null && c.temperature != null) {
                var fresh = true;
                if (c.observationTime != null) {
                    fresh = Time.now().value() - (c.observationTime as Time.Moment).value() <= WEATHER_MAX_AGE_S;
                }
                if (fresh) {
                    var t = c.temperature as Number;
                    if (System.getDeviceSettings().temperatureUnits == System.UNIT_STATUTE) {
                        t = (t * 9.0 / 5.0 + 32.0).toNumber();
                    }
                    var cond = c.condition;
                    return new Conditions(t, kindOf(cond == null ? Weather.CONDITION_UNKNOWN : cond));
                }
            }
        }
        return Demo.weather();
    }

    // Wettercode von Garmin → Wetterart für das Symbol.
    function kindOf(cond as Number) as Number {
        if (cond == Weather.CONDITION_CLEAR || cond == Weather.CONDITION_FAIR || cond == Weather.CONDITION_MOSTLY_CLEAR) {
            return CLEAR;
        }
        if (cond == Weather.CONDITION_PARTLY_CLOUDY || cond == Weather.CONDITION_PARTLY_CLEAR || cond == Weather.CONDITION_THIN_CLOUDS) {
            return PARTLY;
        }
        if (cond == Weather.CONDITION_THUNDERSTORMS || cond == Weather.CONDITION_SCATTERED_THUNDERSTORMS || cond == Weather.CONDITION_CHANCE_OF_THUNDERSTORMS
            || cond == Weather.CONDITION_TORNADO || cond == Weather.CONDITION_HURRICANE || cond == Weather.CONDITION_TROPICAL_STORM) {
            return STORM;
        }
        if (cond == Weather.CONDITION_SNOW || cond == Weather.CONDITION_LIGHT_SNOW || cond == Weather.CONDITION_HEAVY_SNOW || cond == Weather.CONDITION_FLURRIES
            || cond == Weather.CONDITION_CHANCE_OF_SNOW || cond == Weather.CONDITION_CLOUDY_CHANCE_OF_SNOW || cond == Weather.CONDITION_ICE_SNOW
            || cond == Weather.CONDITION_RAIN_SNOW || cond == Weather.CONDITION_LIGHT_RAIN_SNOW || cond == Weather.CONDITION_HEAVY_RAIN_SNOW
            || cond == Weather.CONDITION_CHANCE_OF_RAIN_SNOW || cond == Weather.CONDITION_CLOUDY_CHANCE_OF_RAIN_SNOW || cond == Weather.CONDITION_WINTRY_MIX
            || cond == Weather.CONDITION_SLEET || cond == Weather.CONDITION_HAIL || cond == Weather.CONDITION_ICE) {
            return SNOW;
        }
        if (cond == Weather.CONDITION_RAIN || cond == Weather.CONDITION_LIGHT_RAIN || cond == Weather.CONDITION_HEAVY_RAIN || cond == Weather.CONDITION_SHOWERS
            || cond == Weather.CONDITION_LIGHT_SHOWERS || cond == Weather.CONDITION_HEAVY_SHOWERS || cond == Weather.CONDITION_SCATTERED_SHOWERS
            || cond == Weather.CONDITION_CHANCE_OF_SHOWERS || cond == Weather.CONDITION_CLOUDY_CHANCE_OF_RAIN || cond == Weather.CONDITION_DRIZZLE
            || cond == Weather.CONDITION_FREEZING_RAIN || cond == Weather.CONDITION_UNKNOWN_PRECIPITATION) {
            return RAIN;
        }
        if (cond == Weather.CONDITION_FOG || cond == Weather.CONDITION_MIST || cond == Weather.CONDITION_HAZY || cond == Weather.CONDITION_HAZE
            || cond == Weather.CONDITION_SMOKE || cond == Weather.CONDITION_DUST || cond == Weather.CONDITION_SAND || cond == Weather.CONDITION_VOLCANIC_ASH) {
            return FOG;
        }
        if (cond == Weather.CONDITION_WINDY || cond == Weather.CONDITION_SQUALL || cond == Weather.CONDITION_SANDSTORM) {
            return WIND;
        }
        return CLOUDY;
    }

    // "MI, 31. OKT" in der Sprache der Uhr.
    function dateText() as String {
        var t = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        return (t.day_of_week + ", " + t.day + ". " + t.month).toUpper();
    }

    // Stunde und Minute als zwei Texte, im 12- oder 24-Stunden-Format der Uhr.
    function clock() as Array<String> {
        var t = System.getClockTime();
        var h = t.hour;
        if (!System.getDeviceSettings().is24Hour) {
            h = h % 12;
            h = h == 0 ? 12 : h;
        }
        return [h.format("%02d"), t.min.format("%02d")] as Array<String>;
    }
}
