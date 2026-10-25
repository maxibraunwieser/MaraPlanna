# MaraPlanna

An adaptive marathon training planner powered by your Garmin data.

1. **Register / log in.** Supabase Auth stores the accounts.
2. **Answer the marathon questionnaire.** It covers your race, goal, experience, current volume, training days, strength training (upper / lower / split / full body, 1–4× per week) and health.
3. **Connect Garmin.** Use a Garmin Connect *Personal API* key. MaraPlanna imports 6 months of runs, strength sessions, resting HR, HRV, sleep and Body Battery.
4. **Get your plan.** It is periodised (base → build → peak → taper) with VDOT-based paces, and strength sessions are placed around your key runs.
5. **The plan adapts.** Every time you open the app it syncs Garmin and:
   - links your runs to planned workouts and marks missed ones;
   - moves a recently missed key session (long run, threshold, intervals, MP) into the next 3 days, without stacking hard days;
   - rebuilds the upcoming weeks from your real level after a break or when you ran < 70 % of the planned volume;
   - updates your training paces when your Garmin runs show your fitness changed;
   - offers "make today easy" when your resting HR, HRV, sleep or Body Battery signal fatigue on a key-session day.

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

---

## Local development

```bash
npm install
cp .env.example .env        # fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
npm test                    # planner unit tests
npm run build
```

## How the planner works

All of the planning logic is plain TypeScript in [`src/lib/planner`](src/lib/planner):

| File | What it does |
|---|---|
| `vdot.ts` | Jack Daniels' VDOT model: race result → fitness → easy / long / marathon / threshold / interval paces |
| `fitness.ts` | Current fitness from your recent race, heart rate vs. pace on Garmin runs, or Garmin VO2max. Also weekly volume and longest run |
| `generate.ts` | Phases counted back from race day, volume +6–10 %/week with an easier week every 3rd/4th week, long run up to 30–34 km (time-capped), quality-session ladders, best spacing of run days, weekday time limits, race week |
| `strength.ts` | Upper / lower / full-body sessions by phase and equipment. Lower body never lands on or right before the long run or a key session; strength drops to maintenance in the taper and stops in race week |
| `adapt.ts` | Matches activities to workouts, reschedules missed sessions, rebuilds after breaks or low compliance, updates paces |
| `readiness.ts` | Daily readiness from resting HR, HRV, sleep and Body Battery |

## Project layout

```
src/                 React app (Vite + TypeScript + Tailwind)
  lib/planner/       training-plan engine (+ tests)
  pages/             Login, onboarding, Garmin connect, dashboard, plan, activities, settings
supabase/
  migrations/        tables + Row Level Security
  functions/garmin/  Edge Function: Garmin Personal API bridge
.github/workflows/   GitHub Pages deploy, optional Supabase deploy
```

*MaraPlanna is a training aid, not medical advice. Listen to your body.*
