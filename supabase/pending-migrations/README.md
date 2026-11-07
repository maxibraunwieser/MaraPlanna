# Pending migrations

Migrations here are NOT applied by the Supabase deploy workflow (it only reads `supabase/migrations`). Move a file to
`supabase/migrations` when it should go live.

- `20261106000000_onboarding_draft.sql` – saves an unfinished questionnaire to the profile (`profiles.onboarding_draft`).
  Without it the website keeps the draft in the browser only. Also needs the `delete-account` function for "delete my account".
