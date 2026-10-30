-- Garmin watch faces linked to a MaraPlanna account. A watch holds a random
-- secret (stored here hashed) and is linked by entering the 6-digit code it
-- shows on the website. Only the "watch" Edge Function (service role) reads it.
create table if not exists public.watch_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  secret_hash text not null unique,
  pair_code text,
  code_expires_at timestamptz,
  model text,
  created_at timestamptz not null default now(),
  paired_at timestamptz,
  last_seen_at timestamptz
);

create unique index if not exists watch_devices_pair_code on public.watch_devices (pair_code) where pair_code is not null;

alter table public.watch_devices enable row level security;
revoke all on public.watch_devices from anon, authenticated;
