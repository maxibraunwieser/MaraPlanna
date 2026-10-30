// MaraPlanna watch face backend (Supabase Edge Function).
//
// The watch (through the Garmin Connect app on the phone):
//   POST /functions/v1/watch/pair                      → { code, secret, expiresIn }
//   GET  /functions/v1/watch/data?date=YYYY-MM-DD      header X-Watch-Secret
//        → the watch face feed, { paired: false, code } while waiting, { revoked: true } if unlinked
//   GET  /functions/v1/watch/run?date=YYYY-MM-DD       same, for the MaraPlanna Run app:
//        VDOT, paces and today's run as steps
// The website (with the user's Supabase session):
//   POST /functions/v1/watch  { action: "link", code } | { action: "list" } | { action: "unlink", id }
//
// The watch only ever holds a random secret (stored hashed). Pairing codes are
// 6 digits and expire after 30 minutes; the watch fetches a new one by itself.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildWatchFeed, addDays, mondayOf } from '../_shared/watchFeed.ts';
import { buildRunFeed } from '../_shared/runFeed.ts';
import type { CalUnits, CalWorkout } from '../_shared/calendar.ts';

const CODE_MINUTES = 30;
const MIGRATION_HINT = 'Database update needed: run supabase/migrations/20261030000000_watch_devices.sql in the Supabase SQL Editor.';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-watch-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function serviceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (key) return key;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? '';
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const dbError = (m: string) => (/watch_devices|schema cache|does not exist/.test(m) ? MIGRATION_HINT : m);

// ---------------------------------------------------------------------------
// Watch side
// ---------------------------------------------------------------------------

/** Write a new random code (unique among open codes) with `save`, retrying on a clash. */
async function withNewCode(save: (code: string, expires: string) => Promise<{ error: { message: string } | null }>) {
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const { error } = await save(code, expires);
    if (!error) return code;
    if (!/duplicate|unique/i.test(error.message)) throw new Error(dbError(error.message));
  }
  throw new Error('Could not create a pairing code, please try again.');
}

async function pair(admin: SupabaseClient, model: string | null) {
  // Forget pairing attempts that were never completed.
  await admin.from('watch_devices').delete().is('user_id', null).lt('code_expires_at', new Date(Date.now() - 86_400_000).toISOString());
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256(secret);
  const code = await withNewCode(async (c, expires) =>
    await admin.from('watch_devices').insert({ secret_hash: hash, pair_code: c, code_expires_at: expires, model: model?.slice(0, 60) ?? null }),
  );
  return { code, secret, expiresIn: CODE_MINUTES * 60 };
}

/** The device behind a secret: its user id once linked, otherwise what to tell the watch. */
async function device(admin: SupabaseClient, secret: string): Promise<{ userId: string } | { reply: Record<string, unknown> }> {
  const { data: dev, error } = await admin
    .from('watch_devices')
    .select('id, user_id, pair_code, code_expires_at')
    .eq('secret_hash', await sha256(secret))
    .maybeSingle();
  if (error) throw new Error(dbError(error.message));
  if (!dev) return { reply: { revoked: true } };
  if (!dev.user_id) {
    const expired = !dev.code_expires_at || Date.parse(dev.code_expires_at) < Date.now();
    if (!expired) return { reply: { paired: false, code: dev.pair_code } };
    // The code ran out before it was entered: give this watch a fresh one right away
    // (it keeps its secret, so there is no gap on the watch face).
    const code = await withNewCode(async (c, expires) =>
      await admin.from('watch_devices').update({ pair_code: c, code_expires_at: expires }).eq('id', dev.id),
    );
    return { reply: { paired: false, code } };
  }
  await admin.from('watch_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', dev.id);
  return { userId: dev.user_id };
}

async function feed(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const start = mondayOf(date);
  const end = addDays(start, 6);
  const until = addDays(date, 1) > end ? addDays(date, 1) : end;
  const [{ data: plan }, { data: profile }, { data: runs }] = await Promise.all([
    admin.from('training_plans').select('id, race_date, fitness').eq('user_id', dev.userId).eq('status', 'active').maybeSingle(),
    admin.from('profiles').select('units').eq('id', dev.userId).maybeSingle(),
    admin.from('activities').select('distance_m').eq('user_id', dev.userId).eq('sport', 'run').gte('local_date', start).lte('local_date', end),
  ]);
  const { data: workouts } = plan
    ? await admin
        .from('planned_workouts')
        .select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note')
        .eq('plan_id', plan.id)
        .gte('date', start)
        .lte('date', until)
    : { data: [] };
  return buildWatchFeed({
    date,
    raceDate: plan?.race_date ?? null,
    predictedS: plan?.fitness?.predictedMarathonS ?? null,
    paces: plan?.fitness?.paces ?? null,
    units: (profile?.units === 'mi' ? 'mi' : 'km') as CalUnits,
    workouts: (workouts ?? []) as CalWorkout[],
    weekDoneKm: (runs ?? []).reduce((s: number, r: { distance_m: number | null }) => s + (r.distance_m ?? 0) / 1000, 0),
    hasPlan: !!plan,
  });
}

/** VDOT, paces and today's run as steps, for the MaraPlanna Run app. */
async function run(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const [{ data: plan }, { data: profile }] = await Promise.all([
    admin.from('training_plans').select('id, fitness').eq('user_id', dev.userId).eq('status', 'active').maybeSingle(),
    admin.from('profiles').select('units').eq('id', dev.userId).maybeSingle(),
  ]);
  const { data: workouts } = plan
    ? await admin
        .from('planned_workouts')
        .select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note')
        .eq('plan_id', plan.id)
        .eq('date', date)
    : { data: [] };
  return buildRunFeed({
    vdot: plan?.fitness?.vdot ?? null,
    paces: plan?.fitness?.paces ?? null,
    units: (profile?.units === 'mi' ? 'mi' : 'km') as CalUnits,
    workouts: (workouts ?? []) as CalWorkout[],
    goalS: plan?.fitness?.targetMarathonS ?? null,
  });
}

// ---------------------------------------------------------------------------
// Website side
// ---------------------------------------------------------------------------

async function website(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  switch (body.action) {
    case 'link': {
      const code = String(body.code ?? '').replace(/\D/g, '');
      if (code.length !== 6) return json({ error: 'The code has 6 digits – it is shown on the watch face.' }, 400);
      const { data, error } = await admin
        .from('watch_devices')
        .update({ user_id: userId, paired_at: new Date().toISOString(), pair_code: null, code_expires_at: null })
        .eq('pair_code', code)
        .is('user_id', null)
        .gt('code_expires_at', new Date().toISOString())
        .select('id');
      if (error) return json({ error: dbError(error.message) }, 500);
      if (!data?.length) return json({ error: 'Code not found or expired. The watch shows a new code by itself – check it again.' }, 404);
      return json({ linked: true });
    }
    case 'list': {
      const { data, error } = await admin.from('watch_devices').select('id, model, paired_at, last_seen_at').eq('user_id', userId).order('paired_at');
      if (error) return json({ error: dbError(error.message) }, 500);
      return json({ devices: data ?? [] });
    }
    case 'unlink': {
      const { error } = await admin.from('watch_devices').delete().eq('id', String(body.id ?? '')).eq('user_id', userId);
      if (error) return json({ error: dbError(error.message) }, 500);
      return json({ unlinked: true });
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey(), { auth: { persistSession: false } });

    if (route === 'pair' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return json(await pair(admin, typeof body.model === 'string' ? body.model : null));
    }
    if (route === 'data' || route === 'run') {
      const secret = req.headers.get('x-watch-secret') ?? '';
      if (!/^[a-f0-9]{64}$/.test(secret)) return json({ revoked: true });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : new Date().toISOString().slice(0, 10);
      return json(route === 'run' ? await run(admin, secret, date) : await feed(admin, secret, date));
    }

    if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!auth.user) return json({ error: 'Please sign in again.' }, 401);
    return await website(admin, auth.user.id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'Unexpected error' }, 500);
  }
});
