-- The unfinished sign-up setup, saved while the person fills it in, so they can continue on any device
-- (see src/lib/onboarding/draft.ts). Cleared when the plan is started.
-- Run with `supabase db push`, or paste into Supabase Dashboard -> SQL Editor.
--
-- Optional: without this column the setup still works and keeps its progress in the browser only.

alter table public.profiles add column if not exists onboarding_draft jsonb;
