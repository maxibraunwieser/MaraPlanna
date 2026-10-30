-- Chat with the AI coach: one conversation per user.
--
-- Rows are written by the "coach" Edge Function (service role) only, so nobody can add
-- messages past the daily limit or put words in the coach's mouth. Users can read their
-- own chat, delete it, and change the state of a proposal (applied / dismissed).
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Plan changes the coach proposed with this message, including whether they were applied.
  actions jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created on public.coach_messages (user_id, created_at);

alter table public.coach_messages enable row level security;
revoke all on public.coach_messages from anon;
revoke insert on public.coach_messages from authenticated;

drop policy if exists "read own coach messages" on public.coach_messages;
create policy "read own coach messages" on public.coach_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "update own coach messages" on public.coach_messages;
create policy "update own coach messages" on public.coach_messages
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "delete own coach messages" on public.coach_messages;
create policy "delete own coach messages" on public.coach_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Users may only change the proposals' state, not the text.
create or replace function public.coach_messages_keep_text() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' and (new.content is distinct from old.content or new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
    raise exception 'Only the state of proposals can be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_messages_keep_text on public.coach_messages;
create trigger coach_messages_keep_text before update on public.coach_messages
  for each row execute function public.coach_messages_keep_text();
