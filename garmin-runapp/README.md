# MaraPlanna Lauf (Garmin Connect IQ device app)

A run recording app with the target paces from MaraPlanna. The texts on the watch are German.

- **Before the run:** pick today's MaraPlanna session or a run type (Easy, Long, Recovery, Marathon, Threshold, Interval, Repetition, Freier Lauf). The start screen also shows the GPS and heart rate status. You can start without a GPS fix, e.g. on a treadmill.
- **During the run:** three pages, refreshed every second.
  1. Time, distance, current pace, heart rate.
  2. Average pace, lap pace, lap distance, lap time.
  3. The target range of the current step, how far you are off it and, in a session, what is left of the step and what comes next.
- **Pace alerts:** the pace is smoothed over about 10 s. Outside the target range the watch shows "LANGSAMER" or "SCHNELLER" and vibrates. Alerts come at most every 30 s, and not in the first 20 s of a step.
- **Today's session:** the steps run one after the other: warm-up, every rep, recoveries, cool-down. Distance and time steps switch by themselves, each switch adds a lap, and the lap button skips to the next step.
- **FIT file:** besides the normal running data, the activity gets `target_pace_min` and `target_pace_max` (record, s/km, 0 = no target), `pace_zone` (record, 0 = free run … 7 = Repetition) and `vdot` (session).

## Buttons and touch

| | Start screen | Recording | Paused |
|---|---|---|---|
| START | start | pause + menu | resume |
| BACK | close the app | lap (next step in a session) | menu |
| UP / DOWN, swipe | choose run type | change page | change page |
| Tap | start | change page | change page |

The pause menu offers **Fortsetzen**, **Speichern** and **Verwerfen**. Verwerfen asks for confirmation first. BACK never ends a recording. If the system closes the app during a recording, the run is **saved**: Connect IQ can't show a question at that point, so saving is the only way to lose nothing.

The watch vibrates and beeps on start, pause, lap/step and save, but only if the watch supports it and vibration and tones are switched on.

## Where the paces come from

1. **MaraPlanna (linked watch):** on first start the app shows a 6-digit code. Enter it on the website under **Settings → Garmin watch**. The app then loads your paces, VDOT and today's session through the phone (`GET /watch/run`, see `supabase/functions/_shared/runFeed.ts`). It does this every time it starts, and keeps the data for runs without the phone.
2. **App settings:** without a link, the paces can be entered in the Garmin Connect app (*Connect IQ apps → MaraPlanna Lauf → Settings*), e.g. `5:26-5:59` for a range or `4:57` for a single pace (±5 s). This only works when the app was installed from the Connect IQ Store.
3. **No paces:** only "Freier Lauf", with a hint on the start screen.

Paces in the feed are seconds per km; ranges are `[fast, slow]`, and single values get ±5 s.

## Build

Same setup as the watch face (Connect IQ SDK and Java 11+):

```bash
cd garmin-runapp
node tools/products.cjs        # writes every supported watch into manifest.xml
monkeyc -f monkey.jungle -d fr265 -l 3 -o bin/MaraPlannaLauf.prg -y <path>/developer_key.der
monkeyc -f monkey.jungle -e -r -l 3 -o bin/MaraPlannaLauf.iq -y <path>/developer_key.der
```

`-l 3` is Garmin's strictest type checking; the app builds with it, without warnings, for every supported watch.

## Tests

The pure logic (pace parsing and formatting, smoothing, target comparison, session steps, MaraPlanna feed) has unit tests in `source/Tests.mc`:

```bash
monkeyc -f monkey.jungle -d fr265 -l 3 -t -o bin/test.prg -y <path>/developer_key.der
monkeydo bin/test.prg fr265 /t
```

## Demo build (simulator)

`demo.jungle` builds a variant with sample paces and a sample session (3×1000 m) instead of pairing, with its own app id. An autopilot goes through start, pages, lap, pause menu, the discard question and save, and prints each step to the console:

```bash
node tools/demo-manifest.cjs
monkeyc -f demo.jungle -d fr265 -o bin/demo.prg -y <path>/developer_key.der
monkeydo bin/demo.prg fr265
```

For moving data in the simulator, use **Simulation → Activity Data**: choose *FIT/GPX Playable File* with a GPX track and press play.

## Put it on your watch (sideload)

1. Build `MaraPlannaLauf.prg` for your watch model, e.g. `-d fr265`. The ids are in `manifest.xml`.
2. Connect the watch over USB. On Windows it shows up in Explorer as a drive or a device.
3. Copy the `.prg` into `GARMIN/APPS/`, then unplug the watch.
4. Open the app list on the watch (START button → activities/apps): **MaraPlanna Lauf** is there.
5. On first start the app shows the code: enter it on the website under **Settings → Garmin watch**, with the phone nearby and Garmin Connect running.

Limits of a sideloaded app: the settings in the Garmin Connect app (pace entry) and the labels of the custom FIT fields in Garmin Connect only appear for apps installed from the Store. The recording itself (time, distance, pace, heart rate, laps) syncs to Garmin Connect as usual.

**For everyone:** upload `MaraPlannaLauf.iq` in the [Connect IQ developer dashboard](https://apps.garmin.com/developer/) as a new app (*Device App*). After Garmin's review, it is in the Connect IQ Store.
