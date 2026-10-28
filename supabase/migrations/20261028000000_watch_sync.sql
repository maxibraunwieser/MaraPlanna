-- Send planned workouts to the watch through intervals.icu, which pushes them to
-- Garmin Connect (the Garmin Personal API is read-only).

-- Encrypted intervals.icu API key. Only the Edge Function (service role) can touch it.
create table if not exists public.watch_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'intervals',
  api_key_enc text not null,
  athlete_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.watch_secrets enable row level security;
revoke all on public.watch_secrets from anon, authenticated;

-- Connection status shown in the app ({ provider, athlete, garmin, upload, checked_at }).
alter table public.profiles add column if not exists watch_sync jsonb;

-- The intervals.icu event a workout was sent as, so sending again replaces it.
alter table public.planned_workouts
  add column if not exists watch_event_id text,
  add column if not exists sent_to_watch_at timestamptz;
