-- Strength training: the user's settings and the sets the watch records.
-- Run with `supabase db push`, or paste into Supabase Dashboard -> SQL Editor.

-- Settings from the website's Strength page (wrist, equipment, exercises, unit, consent). See _shared/strength.ts.
alter table public.profiles add column if not exists strength jsonb;

-- One row per set, uploaded by the watch after the training (Edge Function watch/strength).
create table if not exists public.strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The watch's own id of the training (start time) and the position of the set in it: uploading twice is harmless.
  session_key text not null,
  idx integer not null,
  workout_id uuid references public.planned_workouts (id) on delete set null,
  local_date date not null,
  started_at timestamptz not null,
  duration_s integer,
  -- Library id (_shared/strength.ts); null for an exercise outside the library, then exercise_name is set.
  exercise_id text,
  exercise_name text,
  reps integer not null default 0,
  weight_kg numeric,
  -- How the exercise was chosen: plan (the planned one was kept), pick (changed on the watch), auto (recognised)
  source text not null default 'plan' check (source in ('plan', 'pick', 'auto')),
  confidence integer,
  wrist text check (wrist in ('left', 'right')),
  -- Measurements of the watch for tuning the counting: per set (g) and, on the first set, of the training (s).
  diag jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, session_key, idx)
);
create index if not exists strength_sets_user_date on public.strength_sets (user_id, local_date desc);

alter table public.strength_sets enable row level security;

drop policy if exists "own strength sets" on public.strength_sets;
create policy "own strength sets" on public.strength_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
