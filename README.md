# MaraPlanna

An adaptive marathon training planner powered by your Garmin data.

1. **Register / log in.** Supabase Auth stores the accounts.
2. **Answer the marathon questionnaire.** It covers your race, goal, experience, current volume and health. It also covers:
   - **Extra training (multi-select, each with its own frequency):** upper body, lower body, full body, core, plyometrics & drills, mobility/yoga, cycling, swimming, and your own workouts (for example climbing, marked easy or hard on the legs).
   - **Your week:** either *the planner decides* (you give run days and a long-run day), or *I set my days* (for example Mon legs, Tue easy, Thu intervals/tempo, Sat upper body, Sun long). In that case MaraPlanna fills in distances, paces and exercises.
3. **Connect Garmin.** Use a Garmin Connect *Personal API* key. MaraPlanna imports 6 months of runs, strength sessions, resting HR, HRV, sleep and Body Battery, plus laps and the GPS/HR stream of recent runs.
4. **Get your plan.** It is evidence-based (see *How the coach works*): periodised, with long runs building to **30–35 km** depending on level, ~80 % easy running, a 3-week taper and VDOT paces.
5. **Analyse every workout.** Each run gets:
   - **Goal and evidence:** what the session is for and why it matters for the marathon.
   - **Execution score:** completion, pace in the target zone, interval reps detected from laps or the pace stream, heart-rate effort, and aerobic decoupling on long runs.
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
7. **Put a session on your watch.** Every planned run has an *On your watch* box:
   - **Send to Garmin:** one tap puts the session, with warm-up, repeats and pace targets, in your Garmin Connect calendar, and the watch gets it on its next sync. It goes through [intervals.icu](https://intervals.icu), because Garmin's Personal API can only read data.
   - **Download .FIT:** a Garmin workout file you copy to `GARMIN/NewFiles` on the watch over USB. No extra account needed.

The site runs on **GitHub Pages**. **Supabase** holds the logins, the database and one Edge Function that talks to Garmin.

```
Browser (GitHub Pages, React)  ──►  Supabase Auth + Postgres (RLS)
          │                                   ▲
          └──►  Supabase Edge Function "garmin" ──► Garmin Connect Personal API
                 (holds your encrypted key)
```

---

## Setup (about 20 minutes, one time)

### 1. Supabase project

1. Create a free project at <https://supabase.com>.
2. **Database:** open *SQL Editor*, paste the contents of [`supabase/migrations/20261025000000_init.sql`](supabase/migrations/20261025000000_init.sql) and run it.
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
   ```

   *Without a CLI:* go to Dashboard → Edge Functions → *Deploy a new function* → *Via editor*. Name it `garmin`, paste [`supabase/functions/garmin/index.ts`](supabase/functions/garmin/index.ts), turn **off** "Verify JWT", then add the `GARMIN_ENCRYPTION_KEY` secret under Edge Functions → Secrets.
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

### 4. Workouts to the watch (optional, each user)

1. Create a free account at [intervals.icu](https://intervals.icu).
2. In intervals.icu, open *Settings → Garmin Connect → Connect*, and allow everything on Garmin's page, including workouts / training.
3. In the same Settings page, scroll to *Developer Settings* and copy the **API key**.
4. In MaraPlanna, go to *Settings → Workouts to your watch* and paste the key.

The key is stored AES-GCM encrypted (same secret as the Garmin key). On connect, MaraPlanna switches on "Upload planned workouts" if it is off. On the first send, it sets your Run threshold pace if none is set, because intervals.icu drops pace targets for Garmin without one. Sending a workout again replaces the earlier copy.

---

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

1. **Database:** run any new files from `supabase/migrations/` in the Supabase SQL Editor, oldest first, or run `npx supabase db push`. The analysis needs `20261026000000_activity_details.sql`, and sending workouts to the watch needs `20261028000000_watch_sync.sql`.
2. **Garmin function:** run `npx supabase functions deploy garmin --no-verify-jwt`.
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
| `../watch.ts`, `../watchFit.ts` | Planned run → watch workout: intervals.icu workout text, or a Garmin .FIT workout file |
| `adapt.ts` | Matches activities to workouts, reschedules missed sessions, rebuilds after breaks or low compliance, updates paces |
| `readiness.ts` | Daily readiness from resting HR, HRV, sleep and Body Battery |

## Project layout

```
src/                 React app (Vite + TypeScript + Tailwind)
  lib/planner/       training-plan engine (+ tests)
  pages/             Login, onboarding, Garmin connect, dashboard, plan, activities, settings
supabase/
  migrations/        tables + Row Level Security
  functions/garmin/  Edge Function: Garmin Personal API bridge + intervals.icu workout push
.github/workflows/   GitHub Pages deploy, optional Supabase deploy
```

*MaraPlanna is a training aid, not medical advice. Listen to your body.*
