-- OPTIONAL: hourly Garmin sync for every connected user, so data stays fresh
-- even when nobody opens the app. Not a migration – it contains your secrets.
--
-- 1. Dashboard -> Database -> Extensions: enable "pg_cron" and "pg_net".
-- 2. Set a CRON_SECRET for the function:  supabase secrets set CRON_SECRET=<random string>
-- 3. Replace the two placeholders below and run this in the SQL Editor.

select cron.schedule(
  'maraplanna-garmin-sync',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/garmin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"action":"sync-all"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- To remove it again:  select cron.unschedule('maraplanna-garmin-sync');

-- OPTIONAL: nutrition targets of today and the next 7 days for everyone who uses the Essen tab, every morning at 04:30 UTC
-- (needs the nutrition migration and the "nutrition" function; same CRON_SECRET as above).
select cron.schedule(
  'maraplanna-nutrition-targets',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/nutrition',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"action":"targets-all"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- To remove it again:  select cron.unschedule('maraplanna-nutrition-targets');
