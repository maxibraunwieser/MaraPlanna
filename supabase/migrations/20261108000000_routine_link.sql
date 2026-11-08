-- A planned session of a workout the person added themselves carries that workout's id (strength settings, routines[].id =
-- 'own-…'), so the workout can be moved, changed or deleted as a whole, and a rebuilt plan keeps its sessions.
-- Run with `supabase db push`, or paste into Supabase Dashboard -> SQL Editor.

alter table public.planned_workouts add column if not exists routine_id text;
create index if not exists planned_workouts_routine_idx on public.planned_workouts (plan_id, routine_id) where routine_id is not null;
