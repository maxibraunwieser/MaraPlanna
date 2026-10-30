# MaraPlanna

An adaptive marathon training planner powered by your Garmin data.

1. **Register / log in.** Supabase Auth stores the accounts.
2. **Answer the marathon questionnaire.** It covers your race, goal, experience, current volume and health. It also covers:
   - **Extra training (multi-select, each with its own frequency):** upper body, lower body, full body, core, plyometrics & drills, mobility/yoga, cycling, swimming, and your own workouts (for example climbing, marked easy or hard on the legs).
   - **Your week:** either *the planner decides* (you give run days and a long-run day), or *I set my days* (for example Mon legs, Tue easy, Thu intervals/tempo, Sat upper body, Sun long). In that case MaraPlanna fills in distances, paces and exercises.
3. **Connect Garmin.** Use a Garmin Connect *Personal API* key. MaraPlanna imports 6 months of runs, strength sessions, resting HR, HRV, sleep and Body Battery, plus laps and the GPS/HR stream of recent runs. Activities you delete in Garmin Connect are removed here at the next sync (checked for the last week and longer); the planned session that was checked off with one goes back to "planned".
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
8. **Progress page:**
   - **Weekly report:** distance done vs planned, sessions, key sessions, long run, execution scores and recovery markers (resting HR, HRV, sleep vs the week before). It adds coach notes and a preview of the next week. On Mondays the dashboard shows last week's report.
   - **Marathon projection over time:** the training-based estimate (Tanda) week by week, the plan's race-day projection and your goal.
9. **Calendar subscription.** Every session, with distance, paces and steps, can appear in Apple, Google or Outlook calendar and updates by itself when the plan changes.
10. **Garmin watch face.** Today's session with its target pace, the week's distance and the race countdown on your watch face. Link it with the 6-digit code it shows. See [`garmin-watchface/`](garmin-watchface/README.md).
12. **AI coach (chat).** Ask about your training in plain words and get answers that quote your own runs, recovery and plan. Tell it what you need ("I can only run 3 days now", "this week was a mess") and it proposes a change of the plan as a card; nothing changes until you press Apply. See [AI coach](#4-ai-coach-optional).
11. **Garmin run app (MaraPlanna).** Records runs with your target paces, warns when you are too fast or too slow, and guides you through today's session step by step. The target paces end up in the FIT file. Linked the same way. See [`garmin-runapp/`](garmin-runapp/README.md).

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
4. **Check:** open the **Coach** page. It shows a notice if the key is missing. The message *"The coach could not sign in … the API key was rejected"* means the key is wrong or has no access to the model.

**How the key is protected.** It lives only in the function's secrets, which Supabase stores encrypted and hands to the function at run time. It is not in the repository, not in the database and never sent to the browser, and the function does not log it or put it into answers or error messages. (A hash would not work here: the function has to send the real key to Claude. Encrypting it again inside the function would not add protection, because the decryption key would have to sit in the same place.) If a key was ever pasted somewhere it should not be, for example into a chat or a ticket, revoke it in the Console and create a new one.

**Limits and cost.** Everyone using your installation shares the one key, so every user gets at most 40 coach messages per 24 hours (`COACH_DAILY_LIMIT`). Messages are capped at 2,000 characters and an answer at 4,000 tokens including the model's reasoning (`COACH_MAX_TOKENS`). The models think before they answer; `COACH_EFFORT` (`low`, `medium`, `high`, `xhigh`, `max`; default `medium`) sets how much, which is the main lever for cost and speed. The model defaults to `claude-sonnet-5-5` and can be changed with the `COACH_MODEL` secret. Set these like the key with `supabase secrets set NAME=value`. The long, unchanging part of the prompt is cached, which keeps follow-up questions cheap.

**What the coach sees and can do.** Per question the function sends the signed-in user's own profile, plan, the last six months of activities, eight weeks of wellness data and the recent conversation to Claude. It can look up more (older activities, laps of a run). It can **propose** moving, skipping or shortening sessions, changing what a session consists of (for example taking the strides out of easy runs, with the easy part taking over their distance; setting a distance; turning a hard session into an easy run) and changing the plan's settings (run days, long-run day, weekday time limit, approach, injury note). "No strides on Fridays" can also be remembered, so a later rebuild of the plan keeps it. The function checks every proposal against the real plan first; the website applies it only after you press Apply, using the same functions as the Plan page. The race date and goal time are not changeable from the chat.

## Local development

```bash
npm install
cp .env.example .env        # fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
npm test                    # planner unit tests
npm run build
```

## Updating an existing installation

After pulling a new version:

1. **Database:** run any new files from `supabase/migrations/` in the Supabase SQL Editor, oldest first, or run `npx supabase db push`. The analysis needs `20261026000000_activity_details.sql`. The calendar subscription needs `20261029000000_calendar_feeds.sql`, the watch face needs `20261030000000_watch_devices.sql` and the AI coach needs `20261031000000_coach_chat.sql`.
2. **Edge Functions:** run `npx supabase functions deploy <name> --no-verify-jwt` for `garmin`, `calendar`, `watch` and `coach`.
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
  pages/             Login, onboarding, Garmin connect, dashboard, plan, progress, activities, settings
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
