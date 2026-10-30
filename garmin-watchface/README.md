# MaraPlanna watch face (Garmin Connect IQ)

A watch face that shows the time plus MaraPlanna data:

- **Today's session** with distance and target pace. It turns green once the session is done.
- **The week's running distance:** a bar plus "done / planned".
- **Days to race** and the projected marathon time.

On AMOLED watches, the always-on mode only shows a dim time, moved a little every minute against burn-in.

## How it gets the data

The watch face has a background service that runs every 30 minutes, also while the watch is asleep. It fetches through the Garmin Connect app on the phone from the `watch` Edge Function (`supabase/functions/watch`).

1. **First start:** the watch asks for a pairing code (`POST /watch/pair`). It gets a 6-digit code plus a random device secret.
2. **Linking:** the user enters the code on the website under **Settings → Garmin watch face**. The watch checks every 5 minutes until it is linked.
3. **After that:** the watch loads `GET /watch/data?date=<local date>` with its secret every 30 minutes. The server returns ready-to-show strings (see `supabase/functions/_shared/watchFeed.ts`).

**If the link is lost:** removing the watch on the website, or a code that expired before it was entered, makes the watch fetch a new code by itself.

## Build

You need the [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/) (SDK Manager → sign in → SDK and devices) and Java 11 or newer.

```bash
cd garmin-watchface
node tools/products.cjs        # writes every supported watch into manifest.xml
# one watch, for the simulator or sideloading:
monkeyc -f monkey.jungle -d fr265 -o bin/MaraPlanna.prg -y <path>/developer_key.der -w
# store package with all watches:
monkeyc -f monkey.jungle -e -r -o bin/MaraPlanna.iq -y <path>/developer_key.der -w
```

The developer key signs the app. Store updates must use the same key, so keep it safe and never commit it.

Add `-l 3` for Garmin's strictest type checking; the watch face passes it on every supported watch.

## Demo build (screenshots)

`demo.jungle` builds a variant that shows sample data instead of pairing. It has its own app id, so it never touches the real app's storage:

```bash
node tools/demo-manifest.cjs
monkeyc -f demo.jungle -d fr265 -o bin/demo.prg -y <path>/developer_key.der
```

## Run in the simulator

Start `simulator.exe` from the SDK's `bin` folder, then:

```bash
monkeydo bin/MaraPlanna.prg fr265
```

The simulator makes real web requests. **File → Edit Persistent Storage** shows the stored secret, code and feed. **Simulation → Background Events** triggers the background service right away.

## Put it on a watch

- **Sideload (own watch, for testing):** connect the watch over USB and copy `MaraPlanna.prg` to `GARMIN/APPS/`. Then choose the watch face on the watch.
- **For everyone:** upload `MaraPlanna.iq` in the [Connect IQ developer dashboard](https://apps.garmin.com/developer/). After Garmin's review, anyone can install it from the Connect IQ Store.
