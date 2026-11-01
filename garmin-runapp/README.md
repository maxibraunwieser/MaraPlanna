# MaraPlanna (Garmin Connect IQ device app)

A run recording app with the target paces from MaraPlanna. The texts on the watch are German.

- **Home screen:** the app opens on a watch-face-like screen. **Top:** the weather (symbol and temperature, from the Garmin weather on the watch, in the watch's temperature unit) and the date. **Left:** the MaraPlanna mark with the name under it (while the watch is not linked, the 6-digit pairing code appears below the name). **Right:** the time, hour over minute, in the watch's 12 or 24 hour format. **Bottom:** heart rate, kilometres run this week, and VO2max. Nothing on this screen is typed in: the heart rate is the live sensor value (or the last value of the watch from the past five minutes), the VO2max is the running value from the Garmin profile, the weather is the Garmin weather (older than six hours it is hidden), and the weekly kilometres come from MaraPlanna and from the runs this app recorded (see below). A value the watch does not have shows as `--` (a grey symbol); the weather is left out. START, a tap or the menu button (long press UP) opens the menu, BACK closes the app.
- **Menu:** four entries, each with a live subtitle. 1) **Training** (subtitle: today's session): today's MaraPlanna session first (with "Heute · 7,1 km · 37 min", and "Erledigt" if MaraPlanna already shows it as done), then the preset run types Easy, Long, Recovery, Marathon, Threshold, Interval and Repetition with their pace range (only the ones MaraPlanna or the app settings have a pace for), then Freier Lauf. Choosing one opens the **ready screen**. 2) **Diese Woche** (subtitle: "23,0 / 35,1 km"): the kilometres run and planned this week with a bar, and every weekday with its session: a green tick for done, a ring for planned (orange today, red if the day has passed without it), a cross for skipped, "Ruhetag" for none; several sessions on a day show as "Title +1". 3) **Trainingsplan** (subtitle: "90 Tage bis zum Rennen" or "Nicht gekoppelt"): the connection to the MaraPlanna web app. Not linked: the pairing code and where to enter it. Linked: the days to the goal race and its name, the goal time and VDOT, the next three sessions, and when the data was last loaded; START or a tap loads it again. 4) **Einstellungen**, see below.
- **Ready screen:** the chosen session at the top (**HEUTE GEPLANT** with title, distance and duration, or the run type with its pace range). The start button shows the GPS state without any text: orange rings pulse outward while GPS is searched, a calm green ring means GPS is ready. You can start without a GPS fix, e.g. on a treadmill. At the top the heart rate. The dots show which entry is chosen (UP/DOWN or swipe changes it), START begins, BACK goes back to the menu.
- **Settings** (all saved on the watch, each shows its current value): **Datenseiten** (which pages appear during the run), **Pace-Glättung** (how many seconds the current pace is averaged over: 10 s (the default), 20 s or 30 s), **Einheiten** (Automatisch = the unit chosen in MaraPlanna, or the watch's unit without MaraPlanna; Kilometer; Meilen; applies everywhere at once), **km-Rückblick** (the short summary after each kilometre or mile), **Pace-Alarm** (vibration and tone when the pace leaves the target range), **Töne** (the beeps; a beep briefly interrupts music playing over Bluetooth) and **Vibration** (does not disturb music), each on top of the watch's own settings), **Wetter anzeigen** (on the home screen), **MaraPlanna trennen** (forget the link and the loaded data; the watch gets a new code at once, with a confirmation first).
- **Current pace:** the speed the GPS chip measures itself (`Activity.Info.currentSpeed`, Doppler based) averaged over the chosen window, not the distance covered in a few seconds. Distance over a short window jumps a lot because a GPS error of a few metres is large against 30 m: in the simulator the shown pace jumped by up to 34 s/km from one second to the next with the old 10 s distance window, and by at most 1.1 s/km with the 10 s speed average (the simulator's speed values are smoother than real GPS, so on a watch the gain is smaller than that, but the direction is the same). Without a speed value from the watch the app falls back to the distance over the same window. Standing still (below 0.5 m/s) shows `--:--`. The pace alarm only fires after the pace has been outside the target range for 8 seconds in a row, so a short outlier does not trigger it (still at most every 30 s, and not in the first 20 s of a step).
- **Weekly kilometres:** the larger of two values. MaraPlanna's value covers every run of the week, also from other devices, once Garmin Connect has synced it to MaraPlanna. The app's own tally counts the runs it saved this week at once, before MaraPlanna knows them. Taking the larger value (instead of adding) avoids counting a run twice when MaraPlanna has caught up. Without data from either, the value shows `--`.
- **During the run:** ten data pages, refreshed every second, with a clean frame: a red dot (recording) or pause bars at the top, a hint line below the page (LANGSAMER, SCHNELLER, KEIN GPS, pause) and page dots at the bottom. Pages that make no sense right now (the interval pages without a session) are skipped.

  | Page | Shows |
  |---|---|
  | Übersicht | time, distance, pace, heart rate |
  | Pace | the current pace big, a scale with the target range (green) and a dot for you, the deviation in seconds |
  | Puls | heart rate big, zone 1-5 from your Garmin profile as a segmented bar, average and maximum |
  | Pace-Vergleich | three paces at a glance: the current pace large on top, below it the pace of the last kilometer (last mile) on the left and the average pace of the whole run on the right. In a session the left field shows the last finished interval instead (green in range, orange too fast, blue too slow) until the first one is done |
  | Pace-Verlauf | a line chart of the pace over the whole run, with the target range as a band on runs without a session |
  | Puls-Verlauf | a line chart of the heart rate over the whole run |
  | Intervall | your heart rate in small type at the top, then the current step with what is left (m, km or time), a progress bar, the current pace and the step's target pace centred below it |
  | Intervall-Reps | the results of the session at a glance, one row per hard interval (not warm-up, recoveries or cool-down): average pace, how far it is from the target range ("OK" or seconds too fast/slow) and average heart rate. Finished reps are coloured green (in range), orange (too fast) or blue (too slow), the running rep is highlighted with its progress and a provisional result, reps still to come show how long they are (e.g. "1 km", "400 m") and their target pace, the running one does not (its remaining distance is on the Intervall page). With many reps the list scrolls around the running one |
  | Karte | the route so far, the start, your position and an arrow back to the start with its distance |
  | Prognose | with a session: planned time, expected finish time and whether you are on target; without: 5 km, 10 km, half marathon and marathon at your average pace, the marathon against your goal time |

- **End screen after saving:** up to five pages, flipped with UP/DOWN, a swipe or a tap (START and BACK close the app). 1) the route you ran on the left (start green, finish white with a red rim) and time, distance and average pace on the right; 2) the heart rate over the whole run as a chart with a dashed line at the average, the average and the maximum, and the start and end time under it; 3) the pace over the whole run with a dashed average line and the average pace; 4) the time in each of the five heart-rate zones as bars (zone 5 on top; the zones come from your Garmin profile and are counted every second of the recording). 5) the Training Effect: the aerobic value comes from the watch (Activity.Info.trainingEffect, 1.0 to 5.0, read just before saving) with its rating (Kein Effekt, Geringer Effekt, Erhaltend, Verbessernd, Stark verbessernd, Überlastung) and a five-step bar. Connect IQ does not give apps the anaerobic Training Effect, so the page shows **its own estimate**, labelled "ANAEROB", below it (the label does not say "estimated", but it is). This is not Garmin's number and will not match Garmin Connect. Model (Anaerobic.mc): every second faster than your threshold pace counts, weighted by speed (0 at threshold pace, 1 at interval pace, 2 at repetition pace, 3 at 10 % faster; the three paces come from MaraPlanna), and the sum is mapped to 0 to 5 with a saturating curve (63 % of 5 at 1200 weighted seconds). Easy runs, long runs and threshold runs give 0. The curve is an assumption, not calibrated against Garmin: strides give about 1, 3 x 1000 m at interval pace about 2.3, ten hard 400 m about 4. Without the three paces there is no estimate; the aerobic block is left out on watches that give no value. The two heart-rate pages only appear if a heart rate was recorded. The charts have a fixed size like the data pages: on a long run neighbouring points are merged. The route is the same breadcrumb trail as on the map page.
- **Heart-rate bar on the overview:** below the four values the overview shows the five heart-rate zones as a bar (zones from your Garmin profile). The current zone is lit and taller, the others are dimmed in their zone colour, and a white dot shows where in the zone your heart rate is. The pulse page keeps its own bar.
- **Choosing pages:** under **Einstellungen → Datenseiten**, and the pause menu has the same entry. Each page can be switched on or off. The choice is saved on the watch. At least one page stays on.
- **Charts:** the history has a fixed size (160 points). When it is full, neighbouring points are merged, so a 10-minute run and a 4-hour run both fit.
- **Map:** Connect IQ gives apps no map tiles on most watches, so the app draws the route itself. That works on every watch. There is no planned route to follow, because MaraPlanna has none; the arrow points back to where you started.
- **Finish forecast:** with a session, the ratio of your actual to the planned time so far is applied to the rest of the plan (limited to 0.7-1.5). "On target" means within 1 %, at least 15 s. On race day the target is your goal time. Without a session it is simply the time so far plus the remaining distance at your average pace.
- **Every full kilometer** (every mile if MaraPlanna is set to miles): the watch beeps and vibrates once, and for 8 seconds the page is replaced by a summary of that kilometer: the time (which for exactly 1 km is also the pace), the average heart rate of that kilometer, the average pace of the whole run so far, and the difference to the kilometer before ("VORHER -" in green = faster, "VORHER +" in orange = slower). Any page change hides it at once. The time is interpolated between two one-second readings, so it is exact to the second. A distance reading that jumps back (no GPS fix) is ignored. The splits are only shown, they do not add laps to the recording.
- **Pace alerts:** the pace is smoothed over about 10 s. Outside the target range the watch shows "LANGSAMER" or "SCHNELLER" and vibrates. Alerts come at most every 30 s, and not in the first 20 s of a step.
- **Today's session:** the steps run one after the other: warm-up, every rep, recoveries, cool-down. Distance and time steps switch by themselves, each switch adds a lap, and the lap button skips to the next step.
- **FIT file:** besides the normal running data, the activity gets `target_pace_min` and `target_pace_max` (record, s/km, 0 = no target), `pace_zone` (record, 0 = free run … 7 = Repetition) and `vdot` (session).

## Buttons and touch

| | Home screen | Ready screen | Recording | Paused |
|---|---|---|---|---|
| START | open the menu | start | pause + menu | resume |
| Menu button (long UP) | open the menu | | | |
| BACK | close the app | back to the menu | lap (next step in a session) | menu |
| UP / DOWN | | choose run type | next / previous page | next / previous page |
| Swipe (touch watches) | | choose run type | any direction changes the page | any direction changes the page |
| Tap (touch watches) | open the menu | start | next page | next page |

In the menus UP/DOWN (or swiping) scrolls, START (or a tap) chooses, BACK goes back one level.

While recording, swiping right does **not** count as BACK, so it can't trigger a lap by accident. The pause menu offers **Fortsetzen**, **Datenseiten**, **Speichern** and **Verwerfen**. Verwerfen asks for confirmation first. BACK never ends a recording. If the system closes the app during a recording, the run is **saved**: Connect IQ can't show a question at that point, so saving is the only way to lose nothing.

The watch vibrates and beeps on start, pause, lap/step and save, but only if the watch supports it and vibration and tones are switched on.

## Where the paces come from

1. **MaraPlanna (linked watch):** on first start the app shows a 6-digit code. Enter it on the website under **Settings → Garmin watch**. The app then loads your paces, VDOT and today's session through the phone (`GET /watch/run`, see `supabase/functions/_shared/runFeed.ts`). It does this when it starts and again when the home screen opens and the data is more than 15 minutes old, and keeps the data for runs without the phone. Besides the paces and today's session the feed carries the week (Monday, kilometres run and planned), the sessions of this and next week (day, title, kilometres, done / planned / skipped) and the goal race (date, name). The week data needs the `watch` Edge Function to be deployed (`npx supabase functions deploy watch --no-verify-jwt`); an older function still works, the week and plan pages then say "Keine Plandaten".
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

## Music and the radio

If music (e.g. Spotify) plays on the watch over Bluetooth headphones, anything that keeps the radio, the CPU or the speaker busy can make it stutter. The app therefore keeps its footprint small:
- **Nothing is switched on when the app opens.** In particular there is no `Sensor.setEnabledSensors` call: Garmin documents it as the control for the ANT+ sensors, and ANT+ shares the 2.4 GHz band with Bluetooth audio. The heart rate comes from the watch itself (the activity session, or the watch's own heart-rate history on the home and ready screens). Only if the activity delivers no heart rate for 20 seconds does the app request the sensor once.
- **GPS starts on the ready screen** (so it is searching before you press start) and stops again if you leave that screen without running. On the home screen and in the menus the GPS is off.
- **One redraw per second** instead of two (the GPS callback no longer asks for a redraw), and anti-aliasing is switched off on the run pages (only the home screen needs it for the logo and icons).
- **Beeps and vibration can be switched off separately** in the settings. Vibration alerts do not touch the music.

## Memory on the 128 KB watches

Forerunner 55, Forerunner 245, Venu Sq, fēnix 6, fēnix 6S and Enduro give an app only 128 KB. The release build (`-r`) is about 88 KB of that, because the memory is mostly the loaded code; the arrays for the charts, the track and the kilometre splits are allocated once with a fixed size. Measured in the simulator on the Forerunner 55 with a release demo build, which carries about 4 KB of demo code that the store build does not have: 97 KB on the home screen, 99 to 108 KB in the menus (the page list with ten switches is the highest), 103 KB while running and 106 KB on the end screens, against a limit of 124 KB. The store build is about 4 KB lower. Keep an eye on this when adding features: the Forerunner 55 is the tightest case. Compiling with `-O 3z` (optimise for size) saves almost nothing.

## Tests

The pure logic (pace parsing and formatting, smoothing, target comparison, session steps, MaraPlanna feed) has unit tests in `source/Tests.mc`:

```bash
monkeyc -f monkey.jungle -d fr265 -l 3 -t -o bin/test.prg -y <path>/developer_key.der
monkeydo bin/test.prg fr265 /t
```

## Demo build (simulator)

`demo.jungle` builds a variant with sample paces, a sample session (3×1000 m) and a sample week (relative to today) instead of pairing, with its own app id. It also fills in a sample weather (17°, partly cloudy) and a sample VO2max (52) if the simulator gives none; the normal build never does that. An autopilot goes through the menu to the ready screen, start, pages, lap, pause menu, the discard question and save, and prints each step to the console:

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
