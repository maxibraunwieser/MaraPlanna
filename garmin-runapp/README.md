# MaraPlanna (Garmin Connect IQ device app)

A run recording app with the target paces from MaraPlanna. The texts on the watch are German.

- **Before the run:** a minimal start screen. In the middle it says **HEUTE GEPLANT** with today's MaraPlanna session (title, distance and duration), or the run type with its pace range (Easy, Long, Recovery, Marathon, Threshold, Interval, Repetition, Freier Lauf). The start button at the bottom shows the GPS state without any text: orange rings pulse outward while GPS is searched, a calm green ring means GPS is ready. You can start without a GPS fix, e.g. on a treadmill. At the top the heart rate (a grey heart until the sensor delivers a value) or, while the watch is not linked, the pairing code. The dots at the bottom show which entry is chosen (UP/DOWN or swipe), START begins.
- **During the run:** up to ten data pages, refreshed every second, with a clean frame: a red dot (recording) or pause bars at the top, a hint line below the page (LANGSAMER, SCHNELLER, KEIN GPS, pause) and page dots at the bottom. Pages that make no sense right now (the interval pages without a session) are skipped.

  | Page | Shows |
  |---|---|
  | Übersicht | time, distance, pace, heart rate |
  | Pace | the current pace big, a scale with the target range (green) and a dot for you, the deviation in seconds |
  | Puls | heart rate big, zone 1-5 from your Garmin profile as a segmented bar, average and maximum |
  | Runden | average pace, lap pace, lap distance, lap time (off by default) |
  | Pace-Verlauf | a line chart of the pace over the whole run, with the target range as a band on runs without a session |
  | Puls-Verlauf | a line chart of the heart rate over the whole run |
  | Intervall | the current step with what is left (m, km or time), a progress bar, pace against the step's target, what comes next |
  | Intervall-Reps | one row per rep with its average pace and the difference to the target, coloured green, orange (too fast) or blue (too slow) |
  | Karte | the route so far, the start, your position and an arrow back to the start with its distance |
  | Prognose | with a session: planned time, expected finish time and whether you are on target; without: 5 km, 10 km, half marathon and marathon at your average pace, the marathon against your goal time |

- **Choosing pages:** on the start screen the last entry is **Datenseiten**, and the pause menu has the same entry. Each page can be switched on or off. The choice is saved on the watch. At least one page stays on.
- **Charts:** the history has a fixed size (160 points). When it is full, neighbouring points are merged, so a 10-minute run and a 4-hour run both fit.
- **Map:** Connect IQ gives apps no map tiles on most watches, so the app draws the route itself. That works on every watch. There is no planned route to follow, because MaraPlanna has none; the arrow points back to where you started.
- **Finish forecast:** with a session, the ratio of your actual to the planned time so far is applied to the rest of the plan (limited to 0.7-1.5). "On target" means within 1 %, at least 15 s. On race day the target is your goal time. Without a session it is simply the time so far plus the remaining distance at your average pace.
- **Pace alerts:** the pace is smoothed over about 10 s. Outside the target range the watch shows "LANGSAMER" or "SCHNELLER" and vibrates. Alerts come at most every 30 s, and not in the first 20 s of a step.
- **Today's session:** the steps run one after the other: warm-up, every rep, recoveries, cool-down. Distance and time steps switch by themselves, each switch adds a lap, and the lap button skips to the next step.
- **FIT file:** besides the normal running data, the activity gets `target_pace_min` and `target_pace_max` (record, s/km, 0 = no target), `pace_zone` (record, 0 = free run … 7 = Repetition) and `vdot` (session).

## Buttons and touch

| | Start screen | Recording | Paused |
|---|---|---|---|
| START | start | pause + menu | resume |
| BACK | close the app | lap (next step in a session) | menu |
| UP / DOWN | choose run type | next / previous page | next / previous page |
| Swipe (touch watches) | choose run type | any direction changes the page | any direction changes the page |
| Tap (touch watches) | start | next page | next page |

While recording, swiping right does **not** count as BACK, so it can't trigger a lap by accident. The pause menu offers **Fortsetzen**, **Datenseiten**, **Speichern** and **Verwerfen**. Verwerfen asks for confirmation first. BACK never ends a recording. If the system closes the app during a recording, the run is **saved**: Connect IQ can't show a question at that point, so saving is the only way to lose nothing.

The watch vibrates and beeps on start, pause, lap/step and save, but only if the watch supports it and vibration and tones are switched on.

## Where the paces come from

1. **MaraPlanna (linked watch):** on first start the app shows a 6-digit code. Enter it on the website under **Settings → Garmin watch**. The app then loads your paces, VDOT and today's session through the phone (`GET /watch/run`, see `supabase/functions/_shared/runFeed.ts`). It does this every time it starts, and keeps the data for runs without the phone.
2. **App settings:** without a link, the paces can be entered in the Garmin Connect app (*Connect IQ apps → MaraPlanna → Settings*), e.g. `5:26-5:59` for a range or `4:57` for a single pace (±5 s). This only works when the app was installed from the Connect IQ Store.
3. **No paces:** only "Freier Lauf", with a hint on the start screen.

Paces in the feed are seconds per km; ranges are `[fast, slow]`, and single values get ±5 s.

## Build

Same setup as the watch face (Connect IQ SDK and Java 11+):

```bash
cd garmin-runapp
node tools/products.cjs        # writes every supported watch into manifest.xml
monkeyc -f monkey.jungle -d fr265 -l 3 -o bin/MaraPlanna.prg -y <path>/developer_key.der
monkeyc -f monkey.jungle -e -r -l 3 -o bin/MaraPlanna.iq -y <path>/developer_key.der
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

1. Build `MaraPlanna.prg` for your watch model, e.g. `-d fr265`. The ids are in `manifest.xml`.
2. Connect the watch over USB. On Windows it shows up in Explorer as a drive or a device.
3. Copy the `.prg` into `GARMIN/APPS/`, then unplug the watch.
4. Open the app list on the watch (START button → activities/apps): **MaraPlanna** is there (the activity is named "MaraPlanna Lauf" in Garmin Connect).
5. On first start the app shows the code: enter it on the website under **Settings → Garmin watch**, with the phone nearby and Garmin Connect running.

Limits of a sideloaded app: the settings in the Garmin Connect app (pace entry) and the labels of the custom FIT fields in Garmin Connect only appear for apps installed from the Store. The recording itself (time, distance, pace, heart rate, laps) syncs to Garmin Connect as usual.

**For everyone:** upload `MaraPlanna.iq` in the [Connect IQ developer dashboard](https://apps.garmin.com/developer/) as a new app (*Device App*). After Garmin's review, it is in the Connect IQ Store.
