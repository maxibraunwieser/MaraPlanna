-- Nutrition phase 4: meal photos and text analysed with Claude, barcodes from Open Food Facts.
-- Needs 20261115000000_nutrition.sql first. Run with `supabase db push`, or paste into Dashboard -> SQL Editor.

-- Every analysis (photo or text): what Claude returned, how it was matched, tokens. Written by the nutrition function only.
create table if not exists public.photo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'text')),
  photo_path text,
  input_text text,
  model text not null,
  status text not null check (status in ('ok', 'empty', 'error')),
  raw jsonb,
  items jsonb,
  confidence numeric,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error text,
  meal_entry_id uuid references public.meal_entries (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists photo_analyses_user on public.photo_analyses (user_id, created_at desc);

-- Calls of paid AI per person (daily limit, cost overview). Written by the Edge Functions only.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.photo_analyses enable row level security;
alter table public.ai_usage enable row level security;
drop policy if exists "read own analyses" on public.photo_analyses;
create policy "read own analyses" on public.photo_analyses for select using (auth.uid() = user_id);
drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage" on public.ai_usage for select using (auth.uid() = user_id);

-- Meal photos: private bucket, one folder per person (user_id/date/uuid.jpg), at most 5 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read own meal photos" on storage.objects;
create policy "read own meal photos" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "upload own meal photos" on storage.objects;
create policy "upload own meal photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own meal photos" on storage.objects;
create policy "delete own meal photos" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
