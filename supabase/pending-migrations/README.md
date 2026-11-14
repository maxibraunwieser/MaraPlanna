# Pending migrations

Migrations here are NOT applied by the Supabase deploy workflow (it only reads `supabase/migrations`). Move a file to
`supabase/migrations` when it should go live.

- Nothing is held back right now (`20261106000000_onboarding_draft.sql` and `20261108000000_routine_link.sql` went live on 2026-11-08 and live in `supabase/migrations`).
- `20261115000000_nutrition.sql` and `20261116000000_nutrition_ai.sql` (Essen tab) went live on 2026-11-14 (applied in the SQL editor,
  foods imported with scripts/import-foods.ts) and live in `supabase/migrations`.
