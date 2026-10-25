-- MaraPlanna schema
-- Run with `supabase db push`, or paste into Supabase Dashboard -> SQL Editor.

-- ---------------------------------------------------------------------------
-- Profiles: one row per user, holds the onboarding questionnaire answers.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  units text not null default 'km' check (units in ('km', 'mi')),
  onboarding jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Garmin connection. Status is readable by the user; secrets are not.
-- ---------------------------------------------------------------------------
create table if not exists public.garmin_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'connected' check (status in ('connected', 'error', 'expired')),
  display_name text,
  profile jsonb,
  last_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now()
);

-- Encrypted Personal API key + cached access token. Only the Edge Function
-- (service role) can touch this table: RLS is on and there are no policies.
create table if not exists public.garmin_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key_enc text not null,
  access_token_enc text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activities (from Garmin, FIT uploads or manual logging)
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('garmin', 'fit', 'manual')),
  external_id text,
  name text,
  sport text not null,
  sub_type text,
  start_time timestamptz not null,
  local_date date not null,
  duration_s integer,
  moving_s integer,
  distance_m numeric,
  avg_hr integer,
  max_hr integer,
  elevation_gain_m numeric,
  calories integer,
  training_load numeric,
  aerobic_te numeric,
  vo2max numeric,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists activities_user_date on public.activities (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- Daily wellness metrics from Garmin (resting HR, HRV, sleep, body battery…)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  resting_hr integer,
  hrv_last_night numeric,
  hrv_weekly_avg numeric,
  hrv_status text,
  sleep_s integer,
  sleep_score integer,
  stress_avg integer,
  body_battery_high integer,
  body_battery_low integer,
  steps integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Training plans and their workouts
-- ---------------------------------------------------------------------------
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  race_name text,
  race_date date not null,
  start_date date not null,
  inputs jsonb not null,
  fitness jsonb not null,
  weeks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists training_plans_one_active
  on public.training_plans (user_id) where status = 'active';

create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  week integer not null,
  phase text not null,
  kind text not null,
  title text not null,
  steps jsonb not null default '[]'::jsonb,
  distance_km numeric,
  duration_min integer,
  key_session boolean not null default false,
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'partial', 'missed', 'skipped')),
  status_source text not null default 'auto' check (status_source in ('auto', 'user')),
  activity_id uuid references public.activities (id) on delete set null,
  actual_distance_km numeric,
  original_date date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists planned_workouts_plan_date on public.planned_workouts (plan_id, date);

create table if not exists public.plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_adjustments_plan on public.plan_adjustments (plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.garmin_connections enable row level security;
alter table public.garmin_secrets enable row level security;
alter table public.activities enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.training_plans enable row level security;
alter table public.planned_workouts enable row level security;
alter table public.plan_adjustments enable row level security;

revoke all on public.garmin_secrets from anon, authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "read own garmin connection" on public.garmin_connections;
create policy "read own garmin connection" on public.garmin_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own activities" on public.activities;
create policy "own activities" on public.activities
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "read own metrics" on public.daily_metrics;
create policy "read own metrics" on public.daily_metrics
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own plans" on public.training_plans;
create policy "own plans" on public.training_plans
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own workouts" on public.planned_workouts;
create policy "own workouts" on public.planned_workouts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own adjustments" on public.plan_adjustments;
create policy "own adjustments" on public.plan_adjustments
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
