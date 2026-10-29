-- Calendar subscription: one secret feed token per user. The "calendar" Edge
-- Function serves the plan as an .ics feed to whoever knows the token.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  -- Link back into the app shown in each event.
  app_url text,
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "own calendar feed" on public.calendar_feeds;
create policy "own calendar feed" on public.calendar_feeds
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
