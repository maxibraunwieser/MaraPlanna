// Calendar subscription (Supabase Edge Function).
//
//   GET /functions/v1/calendar/<token>.ics
//
// Returns the user's active training plan as an iCalendar feed. Calendar apps
// (Apple, Google, Outlook) poll this URL, so it can't send a login: the secret
// token in the URL is the key. Tokens live in public.calendar_feeds; creating a
// new link in the app invalidates the old one.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildIcs, type CalUnits, type CalWorkout } from '../_shared/calendar.ts';

function serviceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (key) return key;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? '';
}

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') ?? url.pathname.split('/').pop() ?? '').replace(/\.ics$/i, '');
  if (!/^[a-f0-9]{40,128}$/.test(token)) return text('Calendar not found', 404);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey(), { auth: { persistSession: false } });
    const { data: feed, error } = await admin.from('calendar_feeds').select('user_id, app_url').eq('token', token).maybeSingle();
    if (error) throw new Error(error.message);
    if (!feed) return text('Calendar not found – create a new link in MaraPlanna → Settings.', 404);

    const [{ data: plan }, { data: profile }] = await Promise.all([
      admin.from('training_plans').select('id, race_name, fitness').eq('user_id', feed.user_id).eq('status', 'active').maybeSingle(),
      admin.from('profiles').select('units').eq('id', feed.user_id).maybeSingle(),
    ]);
    const { data: workouts } = plan
      ? await admin
          .from('planned_workouts')
          .select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note')
          .eq('plan_id', plan.id)
          .order('date')
          .limit(5000)
      : { data: [] };

    const ics = buildIcs({
      name: plan?.race_name ? `MaraPlanna · ${plan.race_name}` : 'MaraPlanna',
      workouts: (workouts ?? []) as CalWorkout[],
      paces: plan?.fitness?.paces ?? null,
      units: (profile?.units === 'mi' ? 'mi' : 'km') as CalUnits,
      appUrl: feed.app_url ?? '',
      now: new Date(),
    });
    await admin.from('calendar_feeds').update({ last_fetched_at: new Date().toISOString() }).eq('token', token);

    return new Response(req.method === 'HEAD' ? null : ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="maraplanna.ics"',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error(e);
    return text('Calendar temporarily unavailable', 503);
  }
});
