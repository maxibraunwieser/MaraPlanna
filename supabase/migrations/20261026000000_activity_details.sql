-- Laps + downsampled GPS/HR stream per activity, used by the workout analysis.
alter table public.activities add column if not exists details jsonb;
