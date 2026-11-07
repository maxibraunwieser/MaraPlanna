# MaraPlanna

An adaptive training planner for runners who also lift: marathon, half marathon, 10 K, 5 K, getting faster, hybrid fitness, general fitness or a comeback, powered by your Garmin data.

1. **Register / log in.** Supabase Auth stores the accounts.
2. **Set up your profile (a questionnaire, English or German; the switch is at the top right).** One question, or a small group, per screen, with a progress bar on top (one segment per block, each can be opened once it has been reached), *Back* on every screen, required questions marked * and checked as you type, optional ones skippable, and questions that only appear when they apply (no race: no race questions; no strength share: no strength questions; no watch: no Garmin screens). Answers are saved after every screen in the browser and on your profile, so closing the tab or switching device picks up where you stopped. A Garmin value never replaces something you typed: it fills empty fields, and where it differs (your weight) you are asked which one to keep. The order is: everything about the person first, then the running plan, then the strength questions and the week with strength.
   1. **Welcome & consent:** explicit consent to process health and training data (required, with a link to the privacy policy) and an optional consent to anonymous analysis. Both are stored with a time stamp; Settings → Data & privacy shows them and deletes the account with all data.
   2. **About you:** name, date of birth (age 16–90; under 18 gets a hint), sex, height (120–230 cm) and weight (30–250 kg) with the units (km / mi, kg / lb and m + cm / ft + in each on their own, *Metric* and *Imperial* set all three) and optional body fat.
   3. **Your everyday life:** activity and sleep (optional), **how much time you have on each weekday** (no time, 30, 45, 60, 90 or 120+ minutes; a day with no time stays free, at least two days need time) with the time of day you like, and planned breaks (nothing is scheduled then, and the overview says how many sessions that left out).
   4. **Health & limitations:** pain right now (regions with strength 0–10 and since when), earlier injuries, a four-question health check (a "yes" shows the advice to see a doctor, on the screen and in the overview) and, for everyone but men, pregnancy or postpartum. Knee, back, shoulder and wrist steer the strength suggestions; the rest slows the build-up.
   5. **Goal & focus:** the main goal (improve running, strength & muscle, both equally, lose weight, general fitness), a slider for the share of running and strength (default from the goal, 0–100 %), whether there is a race (distance, date with a hint under 8 weeks, name; target time, finishing or "I don't know" = the plan estimates it), strength goals and a concrete goal in your words, and the plan length (4, 8, 12 or 16 weeks as far as the goal allows) when there is no race date.
   6. **Garmin:** whether you have a watch (and which model), which data may be read (activities, heart rate, sleep & HRV, weight, training status), connecting with your Personal API key or going on by hand, then "is this right?": the runs found, every filled value with a Garmin badge, a question where your weight differs, "no, I'll enter the values myself", and the wish to send workouts to the watch (stored; sending needs Garmin's Training API and is marked *coming soon*).
   7. **Preferences:** motivation, how much structure, whether the plan adapts by itself or only on request, reminders (stored; sending them is not available yet, the calendar subscription reminds you) and units and language.
   8. **Your running:** experience and experience with intervals, runs and kilometres per week, the highest weekly distance of the year, the longest run, a reference result with its paces, heart rates (maximum estimated as 208 − 0.7 × age until you enter yours) and VO₂max. Then **when you like to run**: how many runs per week, and who sets the days: **the planner** (from the minutes you have on each weekday: the long run goes on the day with the most time, hard runs are spread out) or **you** (you pick the days and the long-run day). Then **your running plan**: the plan is built in front of you, step by step (your pace zones, where the build-up starts, the run days, hard and easy days, the 80/20 mix, the long run, lighter weeks, phases), each step with the plan's own numbers and the studies it rests on. Then the result: the weekly distance of the whole plan, the week to change (drag a run to another day, or use the arrows, also on a phone) and the steps as the explanation.
   9. **Your strength training:** experience, where you train, the equipment (preselected for the place, with TRX and box), how often you lift now, whether a run and a strength session may share a day (and which first) and the watch wrist. Then **your week with strength**: again the steps are played (how many sessions, the time on each day, protecting the runs, the sessions, rest, the phases), then the result. The **number of strength sessions per week** is yours to set (plus and minus; it is saved): the recommendation follows your running share, keeps what you already lift (up to three: two to three sessions are what runners gain most from) and never jumps more than two above your current number; at most as many as fit into your week. The weekly structure model (`planner/weekModel.ts`) searches all weeks and scores them with rules from the training literature: hard and easy days alternate, the long run is on the day with the most time and never shares a day with strength, heavy leg work is not the day before the long run or a hard run and two leg sessions are a day apart, a run and a strength session only share a day if the minutes of that day allow both (run first), and at least one day a week is free, best right after the long run. A session can be dragged to another day, and a click on a workout shows its exercises, which can be changed and reordered by dragging.
   10. **Your plan:** the overview with the goal and plan (a rule-based explanation), a reality check of a target time, warnings (health check, first week more than 10 % above what you run now, breaks), the first week, heart-rate zones, training paces, the strength workouts and **Your answers** with an *Edit* button per block that returns to the overview.
3. **Connect Garmin.** Use a Garmin Connect *Personal API* key (step 2 of the setup, or later in Settings). MaraPlanna imports 6 months of runs, strength sessions, resting HR, HRV, sleep and Body Battery, plus laps and the GPS/HR stream of recent runs. Activities you delete in Garmin Connect are removed here at the next sync (checked for the last week and longer); the planned session that was checked off with one goes back to "planned".
4. **Get your plan.** It is evidence-based (see *How the coach works*): periodised, with long runs building to **30–35 km** depending on level, ~80 % easy running, a 3-week taper and VDOT paces.
5. **Analyse every workout.** Each run gets:
   - **Goal and evidence:** what the session is for and why it matters for the marathon.
   - **Execution score:** completion, pace in the target zone, interval reps (from the watch's workout laps, the lap button or the pace stream, down to 1-minute reps), heart-rate effort, and aerobic decoupling on long runs.
   - **Charts and zones:** pace and heart-rate charts, plus time in each HR zone.
   - **Fitness signal:** the VDOT this run points to.
   - **Marathon projection:** the effect of this run on your training-based marathon projection (Tanda model).
   - **Coach notes.**
6. **The plan adapts.** Every time you open the app it syncs Garmin and:
   - links your runs to planned workouts and marks missed ones;
   - moves a recently missed key session (long run, threshold, intervals, MP) into the next 3 days, without stacking hard days;
   - rebuilds the upcoming weeks from your real level after a break or when you ran < 70 % of the planned volume;
   - updates your training paces when your Garmin runs show your fitness changed;
   - offers "make today easy" when your resting HR, HRV, sleep or Body Battery signal fatigue on a key-session day.
7. **Move sessions easily.** In the plan or the *This week* view, drag a session to another day on a computer, or tap it and pick a day. If the target day already has a run, you can swap the two days. MaraPlanna warns about two hard days in a row, and every move can be undone.
8. **Strength page (a gym log):**
   - **Workouts:** the next planned strength session, your workouts (lower, upper, full body) with sets, reps and weight, and what is coming up. *Edit* changes a workout for **all upcoming sessions** of that kind (sessions already done stay as they were; recovery and taper weeks get one set less); *Edit this session* changes only one. *Start workout* opens the logger. Every exercise has a picture (start and end position, drawn in the app from joint angles, no image files; click it for the bigger one with the muscles it trains and what it needs). The editor is a clear list (picture, name, muscles, sets and weight at a glance, details behind a button, drag to reorder); *Show all exercises* (279 exercises in 16 muscle groups, with a filter by muscle group and by equipment) lists every exercise the person can do with their place, machines and equipment (nothing that needs care, nothing they left out), the exercises for the muscles of the workout first, filterable by muscle and searchable in both languages.
   - **Logger:** for every exercise the planned sets with weight and repetitions to fill in, what you did last time, and a hint what to try now (all sets reached the top of the rep range last time: a little more weight; otherwise repeat the weight). Ticking a set starts a rest timer; finishing saves the ticked sets to the same table as the watch and marks the planned session completed. A free workout (no plan) works too.
   - **Progress:** the last 30 days at a glance (workouts, sets, volume with the trend against the 30 days before, new records, weeks in a row), the development of every exercise over time (estimated one-rep max, top weight or volume; bodyweight exercises by repetitions), volume per week, personal records.
   - **History:** every recorded workout with all sets, from the website and the watch; a workout can be deleted.
   - There is no setup tab: goal, level, place, machines and equipment are the answers of the questionnaire (*Edit answers* in Settings, or the link on the Workouts tab); workouts that were suggested follow a changed answer, workouts you edited yourself are kept. The watch options and the test workout moved to Settings.
9. **Progress page:**
   - **Weekly report:** distance done vs planned, sessions, key sessions, long run, execution scores and recovery markers (resting HR, HRV, sleep vs the week before). It adds coach notes and a preview of the next week. On Mondays the dashboard shows last week's report.
   - **Marathon projection over time:** the training-based estimate (Tanda) week by week, the plan's race-day projection and your goal.
10. **Calendar subscription.** Every session, with distance, paces and steps, can appear in Apple, Google or Outlook calendar and updates by itself when the plan changes.
11. **Garmin watch face.** Today's session with its target pace, the week's distance and the race countdown on your watch face. Link it with the 6-digit code it shows. See [`garmin-watchface/`](garmin-watchface/README.md).
12. **AI coach (chat).** Ask about your training in plain words and get answers that quote your own runs, recovery and plan. Tell it what you need ("I can only run 3 days now", "this week was a mess") and it proposes a change of the plan as a card; nothing changes until you press Apply. See [AI coach](#4-ai-coach-optional).
11. **Garmin run app (MaraPlanna).** Records runs with your target paces, warns when you are too fast or too slow, and guides you through today's session step by step. The target paces end up in the FIT file. **Strength on the watch:** every exercise of the catalog is on the watch with its animated figure; you pick which of today's sessions to do (upper, lower, core ...), the watch counts repetitions from the wrist movement (assisted for machines, a timer for holds like the plank) and recognises the exercise from the movement, using the exercises of the chosen session and the user's own confirmed sets (`GET /watch/strength`). The recognition is plan-aware and not yet tuned on real data. Linked the same way. See [`garmin-runapp/`](garmin-runapp/README.md).

The site runs on **GitHub Pages**. **Supabase** holds the logins and the database, plus two Edge Functions: one talks to Garmin, the other serves the calendar feed.

```
Browser (GitHub Pages, React)  ──►  Supabase Auth + Postgres (RLS)
          │                                   ▲
          └──►  Supabase Edge Function "garmin" ──► Garmin Connect Personal API
                 (holds your encrypted key)
Calendar app  ──►  Supabase Edge Function "calendar" (secret link → .ics feed)
```

---

## Setup (about 20 minutes, one time)

### 1. Supabase project

1. Create a free project at <https://supabase.com>.
2. **Database:** open *SQL Editor*, then paste and run each file in [`supabase/migrations`](supabase/migrations), oldest first.
3. **Auth URLs:** under *Authentication → URL Configuration*:
   - Site URL: `https://<your-github-user>.github.io/MaraPlanna/`
   - Redirect URLs: add `https://<your-github-user>.github.io/MaraPlanna/**` and `http://localhost:5173/**`.
4. **Edge Function:** install the [Supabase CLI](https://supabase.com/docs/guides/cli) (or use `npx supabase`), then run:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   # 32+ random characters. Encrypts the stored Garmin keys – keep it, don't change it later.
   npx supabase secrets set GARMIN_ENCRYPTION_KEY="$(openssl rand -base64 36)"
   npx supabase functions deploy garmin --no-verify-jwt
   npx supabase functions deploy calendar --no-verify-jwt
   ```

   *Without a CLI:* go to Dashboard → Edge Functions → *Deploy a new function* → *Via editor*. Name it `garmin`, paste [`supabase/functions/garmin/index.ts`](supabase/functions/garmin/index.ts), turn **off** "Verify JWT", then add the `GARMIN_ENCRYPTION_KEY` secret under Edge Functions → Secrets. The `calendar` function imports `supabase/functions/_shared/calendar.ts`, so deploy it with the CLI.
5. *(Optional)* For an hourly background sync, run [`supabase/cron.sql`](supabase/cron.sql) after filling in its placeholders.

### 2. GitHub Pages

In the GitHub repository:

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. *Settings → Secrets and variables → Actions → **Variables***: add
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: the project's *anon* / *publishable* key (Project Settings → API). This key is public by design, and Row Level Security protects the data.
3. Re-run the **Deploy to GitHub Pages** workflow (Actions tab). The app is then live at `https://<your-github-user>.github.io/MaraPlanna/`.

*(Optional)* For automatic database and function deploys, add the repository variable `SUPABASE_PROJECT_REF` and the secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `GARMIN_ENCRYPTION_KEY`. The **Deploy Supabase** workflow then runs on every change in `supabase/`.

### 3. Garmin Personal API key (each user)

1. Open [Garmin Connect → Settings → Personal API](https://connect.garmin.com/app/settings/personalApiToken).
2. Click **Create key**, accept the terms and choose **1 year**.
3. Copy the key (it is shown only once) and paste it into MaraPlanna → *Connect Garmin*.

The key is exchanged for 24-hour access tokens server-side, stored AES-GCM encrypted, and never sent back to the browser. Access is read-only. When the key expires, MaraPlanna asks for a new one.

> Garmin's Personal API is meant for personal, non-commercial use of your own data, which is exactly how MaraPlanna uses it: each user connects only their own key. (Garmin's business developer program is currently closed to new applicants.)

If you have no key, you can still get a plan from your answers, import `.FIT` / `.zip` exports from Garmin Connect on the Activities page, or log sessions by hand.

---

### 4. AI coach (optional)

The chat coach calls the Claude API from an Edge Function. Without the steps below the rest of MaraPlanna works as before, and the Coach page says it is not set up.

1. **Database:** run [`supabase/migrations/20261031000000_coach_chat.sql`](supabase/migrations/20261031000000_coach_chat.sql) in the SQL Editor (the chat history).
2. **API key:** create a key in the [Anthropic Console](https://console.anthropic.com/) and store it as a secret. Type it only into your own terminal, never into a file:

   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref <your-project-ref>
   ```
3. **Function:** `npx supabase functions deploy coach --project-ref <your-project-ref> --no-verify-jwt`.
4. **Check:** click the round coach button at the bottom right of any page. The chat shows a notice if the key is missing. The message *"The coach could not sign in … the API key was rejected"* means the key is wrong or has no access to the model.

**How the key is protected.** It lives only in the function's secrets, which Supabase stores encrypted and hands to the function at run time. It is not in the repository, not in the database and never sent to the browser, and the function does not log it or put it into answers or error messages. (A hash would not work here: the function has to send the real key to Claude. Encrypting it again inside the function would not add protection, because the decryption key would have to sit in the same place.) If a key was ever pasted somewhere it should not be, for example into a chat or a ticket, revoke it in the Console and create a new one.

**Limits and cost.** Everyone using your installation shares the one key, so every user gets at most 40 coach messages per 24 hours (`COACH_DAILY_LIMIT`). Messages are capped at 2,000 characters and an answer at 4,000 tokens including the model's reasoning (`COACH_MAX_TOKENS`). The models think before they answer; `COACH_EFFORT` (`low`, `medium`, `high`, `xhigh`, `max`; default `medium`) sets how much, which is the main lever for cost and speed. The model defaults to `claude-haiku-5-5` (fast and cheap; `claude-sonnet-5-5` or `claude-opus-5-5` give more thorough answers) and can be changed with the `COACH_MODEL` secret. Set these like the key with `supabase secrets set NAME=value`. The long, unchanging part of the prompt is cached, which keeps follow-up questions cheap.

**What the coach sees and can do.** Per question the function sends the signed-in user's own profile, plan, the last six months of activities, eight weeks of wellness data and the recent conversation to Claude. It can look up more (older activities, laps of a run). It can **propose** moving, skipping or shortening sessions, changing what a session consists of (for example taking the strides out of easy runs, with the easy part taking over their distance; setting a distance; turning a hard session into an easy run) and changing the plan's settings (run days, long-run day, weekday time limit, approach, injury note). "No strides on Fridays" can also be remembered, so a later rebuild of the plan keeps it. The function checks every proposal against the real plan first; the website applies it only after you press Apply, using the same functions as the Plan page. The race date and goal time are not changeable from the chat.

## Local development

```bash
npm install
cp .env.example .env        # fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
npm test                    # unit tests (planner, strength, feeds)
npm run build
npm run sim                 # the app on an in-memory database with prepared situations, http://localhost:5174/
```

### Simulation

`npm run sim` starts the real app on a stand-in for Supabase (`src/sim/fakeSupabase.ts`, swapped in by `vite.sim.config.ts`), so the setup wizard and every page can be tried without an account, nothing is saved, and a reload starts over. A bar at the bottom picks the situation (`src/sim/scenarios.ts`): a new account (the setup from the start; with a Garmin that knows everything, little, refuses the key or breaks; in German), a setup that was half done (saved draft), set up but nothing logged, 16 weeks of lifting with progress charts, a stuck squat, a home setup with sore knees and shoulders, machines only, pounds, an existing user without workouts (guided setup), no training plan, and a finished setup with every question answered (*Edit answers* walks through all screens). `?scenario=history&bar=0` in the address picks one directly and hides the bar; `garmin=ok|partial|fail|broken` chooses what the stand-in Garmin answers, `lang=de` the language and `signedout=1` starts logged out (sign-in pages). The scenarios are built with the real planner, so the pages show what a real account would.

## Data and privacy

- The questionnaire asks for explicit consent to process health data (GDPR Art. 9) before anything else; the consent and its time stamp are part of the profile (`onboarding.setup.consent`).
- `/privacy` is the privacy policy. It is a **working draft** that describes what the app does and has to be checked legally before the app goes live (operator contact and imprint are missing on purpose).
- Settings → Data & privacy shows the consent, switches the analytics consent and deletes the account. Deleting calls the `delete-account` Edge Function, which removes the account of the signed-in person (taken from their session) after they typed the confirmation word; every table references the account with `on delete cascade`, so all their rows go with it. The function is written but **not deployed** from this repository.
- Answers about health (injuries, health check, pregnancy) are stored in the profile like the rest; a separate table with its own policies would be the next step if the data should be kept apart.

## Language and units

The whole app is in one language at a time: English (default) or German, switched at the top right of every page (also on the sign-in pages) and remembered in the browser. Switching changes every text at once, keeps what is typed in and needs no reload.

- Texts live in `src/lib/i18n/` (one file per area, an English and a German table side by side; `en.ts` / `de.ts` merge them and the types fail the build if a key is missing in one language). Screens use `useI18n()`, code outside components uses `tr()`.
- Dates, decimal commas (`62,5 kg`, `1,78 m`) and counts follow the language (`en-GB` / `de-AT`).
- Plan content is stored in English (titles, step labels, notes, messages, exercise names, fitness sources) because some code compares it. It is translated when shown, by the rule tables in `supabase/functions/_shared/content.ts`; `src/lib/content.test.ts` generates plans for every goal, level and equipment and fails if a text has no German version, and `src/lib/strengthText.test.ts` does the same for the Strength labels and exercise names.
- The calendar subscription is written in the language that was active when the link was created (`?lang=de`), the AI coach gets the language with every message, and edge-function error messages are translated in the app.
- Not translated: the Garmin watch apps (the watch shows what the Connect IQ app has built in) and the replies of the AI coach, which follow the language hint but are written by the model.
- Units: distance (km / mi), weight (kg / lb) and height (m + cm / ft + in) are separate settings (setup wizard and Settings); the strength weight unit follows the weight unit. Storage is always km, kg and cm.

## Updating an existing installation

After pulling a new version:

1. **Database:** run any new files from `supabase/migrations/` in the Supabase SQL Editor, oldest first, or run `npx supabase db push`. The analysis needs `20261026000000_activity_details.sql`. The calendar subscription needs `20261029000000_calendar_feeds.sql`, the watch face needs `20261030000000_watch_devices.sql` and the AI coach needs `20261031000000_coach_chat.sql`. `20261106000000_onboarding_draft.sql` is optional: it lets the setup wizard save your unfinished answers on your profile (without it they are kept in the browser only).
2. **Edge Functions:** run `npx supabase functions deploy <name> --no-verify-jwt` for `garmin`, `calendar`, `watch`, `coach` and `delete-account` (Settings → Data & privacy → Delete my account needs it).
3. **Website:** pushing to `main` redeploys GitHub Pages automatically.
4. **Plan:** to use a new planning model, open *Settings → Edit answers*, then *Replace my plan*. Your activities stay.

## How the coach works

| Rule in MaraPlanna | Evidence |
|---|---|
| Longest run 30–35 km (beginner 30, intermediate 32, advanced 34), with 2–4 runs close to that distance before the taper | A longest run under 25 km was linked to ~13 min slower marathons, and beyond 35 km gave no extra benefit ([Fokkema 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7496388/)). More ≥ 32 km runs went with faster finishes ([Doherty 2020](https://pubmed.ncbi.nlm.nih.gov/31704026/)) |
| Peak week ≥ 40 km and high enough to carry the long run | < 40 km/week slower, > 65 km/week ~14 min faster ([Fokkema 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7496388/)) |
| ~80 % easy, hard running capped at ~25 % of the week | Pyramidal/polarised distributions beat threshold-heavy training (Campos, Casado et al. 2022) |
| 2–3 week taper: −45–60 % volume, same intensity and run frequency | [Wang et al. 2023 meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10171681/), Bosquet 2007 |
| Heavy and plyometric strength work, never before the long run | Improves running economy ([Llanos-Lagos 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/)) |
| Training-based marathon projection | Tanda 2011: marathon pace from 8-week km/week and mean pace |
| Aerobic decoupling < 5 % on long runs | Low pace:HR drift goes with better marathons ([Smyth 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9388405/)) |

## How the planner works

All of the planning logic is plain TypeScript in [`src/lib/planner`](src/lib/planner):

| File | What it does |
|---|---|
| `vdot.ts` | Jack Daniels' VDOT model: race result → fitness → easy / long / marathon / threshold / interval paces |
| `fitness.ts` | Current fitness from your recent race, heart rate vs. pace on Garmin runs, or Garmin VO2max. Also weekly volume and longest run |
| `generate.ts` | Phases counted back from race day, volume +6–10 %/week with an easier week every 3rd/4th week, long run up to 30–34 km (time-capped), quality-session ladders, best spacing of run days, weekday time limits, race week |
| `weekModel.ts` | The weekly structure model: searches the candidate weeks (run days, long-run day, hard days, strength days and kinds) and scores them with rules from the literature (hard/easy alternation, interference of leg work with key runs, 48 h between leg sessions, minutes per weekday, one free day, best after the long run). The questionnaire's week and the plan engine both take the week from here, so the plan keeps the weekdays of the week the person saw |
| `../exerciseArt.ts`, `../exerciseArtData.ts`, `../exerciseInfo.ts` | The pictures of the exercises (a figure in two poses from joint angles, with the equipment), the muscles each exercise trains and the list of all exercises for a person, the ones for the muscles of the workout first |
| `layout.ts` | Run layout of a week (which days, which are hard, the long run), used for a drawn week and as fallback |
| `rationale.ts` | The steps a plan is built in (pace zones, start of the build-up, run days, hard days, 80/20, long run, lighter weeks, phases; strength: number, time, interference, placement, rest, phases) with the plan's own numbers and the studies behind them, played as "building your plan" and kept as the explanation |
| `extras.ts` | Strength (upper / lower / full), core, plyometrics, mobility, cycling, swimming and custom sessions by phase and equipment. Leg-heavy work never lands on or right before the long run or a key session; it drops to maintenance in the taper and stops in race week |
| `../analysis.ts` | Workout analysis: goal, execution score, interval detection, HR zones, decoupling, VDOT signal, Tanda projection |
| `adapt.ts` | Matches activities to workouts, reschedules missed sessions, rebuilds after breaks or low compliance, updates paces |
| `move.ts` | Moving sessions by hand: allowed days, swaps, warnings |
| `../report.ts`, `../projection.ts` | Weekly report and coach notes, plus the marathon projection over time |
| `supabase/functions/_shared/calendar.ts` | iCalendar feed (shared by the `calendar` Edge Function and the tests) |
| `readiness.ts` | Daily readiness from resting HR, HRV, sleep and Body Battery |

## Project layout

```
src/                 React app (Vite + TypeScript + Tailwind)
  lib/planner/       training-plan engine (+ tests)
  lib/strengthPlan.ts  exercise catalogue and the workout suggestion (goal, level, equipment, limitations)
  lib/strengthStats.ts estimated 1RM, progress per exercise, weekly volume, records, what to lift next
  lib/strengthLog.ts   a workout done on the website -> rows of strength_sets
  components/strength/ the Strength page: workouts (editor, exercise pictures), logger, progress, history, the watch settings
  sim/               in-memory Supabase and prepared situations for `npm run sim`
  pages/onboarding/  the setup wizard (one file per step, the preview and the shared form pieces)
  lib/onboarding/    what the wizard computes: validation, Garmin import, goal check, units, drafts, week and strength mapping
  lib/i18n/          texts in English and German, one file per area (the types make sure German has every key)
  pages/             Login, Garmin connect, dashboard, plan, strength, progress, activities, settings
supabase/
  migrations/        tables + Row Level Security
  functions/garmin/  Edge Function: Garmin Personal API bridge
  functions/calendar/ Edge Function: calendar subscription (.ics)
  functions/watch/   Edge Function: watch pairing + data for the watch face and run app
  functions/coach/   Edge Function: AI coach (Claude API, streaming, tools)
garmin-watchface/    Connect IQ watch face (Monkey C)
garmin-runapp/       Connect IQ run app (Monkey C)
.github/workflows/   GitHub Pages deploy, optional Supabase deploy
```

*MaraPlanna is a training aid, not medical advice. Listen to your body.*
