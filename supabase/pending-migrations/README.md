# Pending migrations

Migrations here are NOT applied by the Supabase deploy workflow (it only reads `supabase/migrations`). Move a file to
`supabase/migrations` when it should go live.

- `20261108000000_routine_link.sql` – `planned_workouts.routine_id`: links the sessions of a workout the person added themselves.
  The website writes and filters this column (own workouts, deleting a workout, a rebuilt plan keeping own sessions), so it
  has to be applied BEFORE the website version that uses it goes live.
