// MaraPlanna watch face backend (Supabase Edge Function).
//
// The watch (through the Garmin Connect app on the phone):
//   POST /functions/v1/watch/pair                      → { code, secret, expiresIn }
//   GET  /functions/v1/watch/data?date=YYYY-MM-DD      header X-Watch-Secret
//        → the watch face feed, { paired: false, code } while waiting, { revoked: true } if unlinked
//   GET  /functions/v1/watch/run?date=YYYY-MM-DD       same, for the MaraPlanna Run app:
//        VDOT, paces, today's run as steps, this and next week's sessions, race,
//        and the strength part (settings from the website, exercise list, today's session)
//   GET  /functions/v1/watch/weeks?date=YYYY-MM-DD     every remaining week of the plan with a short list of its sessions ("Trainingsplan" list)
//   GET  /functions/v1/watch/plan?date=YYYY-MM-DD      same, for the "Trainingsplan" and "Absolviert" pages of the Run app:
//        the steps of every session of this and next week, and the recent finished runs and strength trainings
//   GET  /functions/v1/watch/strength?date=YYYY-MM-DD  same: the strength sessions of the day (exercises, how they are counted, figures, what each
//        exercise felt like on the wrist so far); the run feed only says whether strength is set up
//   GET  /functions/v1/watch/library?group=chest       same header: the exercises of one muscle group the person can do (free training)
//   POST /functions/v1/watch/strength                  same header: the sets of a finished strength training
// The website (with the user's Supabase session):
//   POST /functions/v1/watch  { action: "link", code } | { action: "list" } | { action: "unlink", id }
//
// The watch only ever holds a random secret (stored hashed). Pairing codes are
// 6 digits and expire after 30 minutes; the watch fetches a new one by itself.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { buildWatchFeed, addDays, mondayOf } from '../_shared/watchFeed.ts';
import { buildRunFeed } from '../_shared/runFeed.ts';
import { buildPlanFeed, buildWeeksFeed, DONE_WEEKS, type DoneActivity, type DoneLink, type DoneSet, type PlanWeek, type WeeksInput } from '../_shared/planFeed.ts';
import type { CalUnits, CalWorkout } from '../_shared/calendar.ts';
import { buildStrengthFeed, capFigures, libraryRows, normalizePrefs, prefsReady, signaturesOf, strengthRows } from '../_shared/strength.ts';

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
/** A marathon plan: its times are for 42.195 km (no distance saved = a plan from before other distances existed; null = no race). */
const marathonPlan = (f: { raceDistanceM?: number | null } | null | undefined): boolean => !!f && (f.raceDistanceM === undefined || f.raceDistanceM === 42195);

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

/** VDOT, paces, today's run as steps and the sessions of this and next week, for the MaraPlanna Run app. */
async function run(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const start = mondayOf(date);
  const [{ data: plan }, { data: profile }, { data: runs }] = await Promise.all([
    admin.from('training_plans').select('id, fitness, race_date, race_name').eq('user_id', dev.userId).eq('status', 'active').maybeSingle(),
    admin.from('profiles').select('units').eq('id', dev.userId).maybeSingle(),
    admin.from('activities').select('distance_m').eq('user_id', dev.userId).eq('sport', 'run').gte('local_date', start).lte('local_date', addDays(start, 6)),
  ]);
  // Separate query: without the strength column (migration not run yet) the units above still work.
  const { data: strengthRow } = await admin.from('profiles').select('strength').eq('id', dev.userId).maybeSingle();
  // Last weight per exercise (kg), newest set first. Without the strength table (migration not run yet) it stays empty.
  const { data: lastSets } = await admin
    .from('strength_sets')
    .select('exercise_id, weight_kg')
    .eq('user_id', dev.userId)
    .not('exercise_id', 'is', null)
    .not('weight_kg', 'is', null)
    .order('started_at', { ascending: false })
    .limit(120);
  const lastKg: Record<string, number> = {};
  for (const s of (lastSets ?? []) as { exercise_id: string; weight_kg: number }[]) if (!(s.exercise_id in lastKg)) lastKg[s.exercise_id] = Number(s.weight_kg);
  // What each exercise felt like on the wrist in the person's confirmed sets: the watch recognises the exercise from it.
  const { data: sigRows } = await admin
    .from('strength_sets')
    .select('exercise_id, source, wrist, diag')
    .eq('user_id', dev.userId)
    .not('exercise_id', 'is', null)
    .not('diag', 'is', null)
    .in('source', ['plan', 'pick'])
    .order('started_at', { ascending: false })
    .limit(400);
  const prefs = normalizePrefs(strengthRow?.strength);
  const sigs = signaturesOf((sigRows ?? []) as { exercise_id: string; source: string; wrist: string | null; diag: unknown }[], prefs.wrist);
  const { data: workouts } = plan
    ? await admin
        .from('planned_workouts')
        .select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note')
        .eq('plan_id', plan.id)
        .gte('date', start)
        .lte('date', addDays(start, 13))
    : { data: [] };
  return buildRunFeed({
    vdot: plan?.fitness?.vdot ?? null,
    paces: plan?.fitness?.paces ?? null,
    units: (profile?.units === 'mi' ? 'mi' : 'km') as CalUnits,
    workouts: (workouts ?? []) as CalWorkout[],
    // The watch's finish forecast is a marathon forecast: other distances and plans without a race send none.
    goalS: marathonPlan(plan?.fitness) ? (plan?.fitness?.targetMarathonS ?? null) : null,
    date,
    weekDoneKm: (runs ?? []).reduce((s: number, r: { distance_m: number | null }) => s + (r.distance_m ?? 0) / 1000, 0),
    raceDate: plan?.race_date ?? null,
    raceName: plan?.race_name ?? null,
    strength: { prefs },
  });
}

/**
 * The strength part for today: every strength session of the day with its exercises (how they are counted, their figures), the
 * person's own exercise list and what each exercise felt like on their wrist in the sets they confirmed. A request of its own:
 * the run feed is stored as one value on the watch and stays small.
 */
async function strengthToday(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const { data: plan } = await admin.from('training_plans').select('id').eq('user_id', dev.userId).eq('status', 'active').maybeSingle();
  const { data: strengthRow } = await admin.from('profiles').select('strength').eq('id', dev.userId).maybeSingle();
  const prefs = normalizePrefs(strengthRow?.strength);
  // Last weight per exercise (kg), newest set first. Without the strength table (migration not run yet) it stays empty.
  const { data: lastSets } = await admin
    .from('strength_sets')
    .select('exercise_id, weight_kg')
    .eq('user_id', dev.userId)
    .not('exercise_id', 'is', null)
    .not('weight_kg', 'is', null)
    .order('started_at', { ascending: false })
    .limit(120);
  const lastKg: Record<string, number> = {};
  for (const s of (lastSets ?? []) as { exercise_id: string; weight_kg: number }[]) if (!(s.exercise_id in lastKg)) lastKg[s.exercise_id] = Number(s.weight_kg);
  // What each exercise felt like on the wrist in the person's confirmed sets: the watch recognises the exercise from it.
  const { data: sigRows } = await admin
    .from('strength_sets')
    .select('exercise_id, source, wrist, diag')
    .eq('user_id', dev.userId)
    .not('exercise_id', 'is', null)
    .not('diag', 'is', null)
    .in('source', ['plan', 'pick'])
    .order('started_at', { ascending: false })
    .limit(400);
  const sigs = signaturesOf((sigRows ?? []) as { exercise_id: string; source: string; wrist: string | null; diag: unknown }[], prefs.wrist);
  const { data: workouts } = plan
    ? await admin.from('planned_workouts').select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note, routine_id').eq('plan_id', plan.id).eq('date', date)
    : { data: [] };
  return capFigures(buildStrengthFeed({ prefs, workouts: (workouts ?? []) as CalWorkout[], lastKg, sigs, date }));
}

/** The exercises of one muscle group the person can do (free training on the watch: pick an exercise). */
async function libraryOf(admin: SupabaseClient, secret: string, group: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const { data: strengthRow } = await admin.from('profiles').select('strength').eq('id', dev.userId).maybeSingle();
  const prefs = normalizePrefs(strengthRow?.strength);
  return { ready: prefsReady(prefs), g: group, ex: libraryRows(prefs, group) };
}

/** Steps of this and next week's sessions plus the recent finished sessions, for the plan and finished pages. */
async function plan(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const start = mondayOf(date);
  const since = addDays(date, -7 * DONE_WEEKS);
  const [{ data: activePlan }, { data: activities }, { data: sets }] = await Promise.all([
    admin.from('training_plans').select('id, fitness').eq('user_id', dev.userId).eq('status', 'active').maybeSingle(),
    admin
      .from('activities')
      .select('id, name, start_time, local_date, duration_s, moving_s, distance_m, avg_hr, elevation_gain_m, aerobic_te')
      .eq('user_id', dev.userId)
      .eq('sport', 'run')
      .gte('local_date', since)
      .lte('local_date', date)
      .order('start_time', { ascending: false })
      .limit(12),
    // Without the strength table (migration not run yet) this stays empty.
    admin
      .from('strength_sets')
      .select('session_key, local_date, idx, exercise_id, exercise_name, reps, weight_kg')
      .eq('user_id', dev.userId)
      .gte('local_date', since)
      .order('started_at', { ascending: false })
      .limit(300),
  ]);
  const ids = ((activities ?? []) as DoneActivity[]).map((a) => a.id);
  const { data: workouts } = activePlan
    ? await admin
        .from('planned_workouts')
        .select('id, date, kind, title, steps, distance_km, duration_min, key_session, status, note')
        .eq('plan_id', activePlan.id)
        .gte('date', start)
        .lte('date', addDays(start, 13))
    : { data: [] };
  // The planned sessions the finished runs were matched to (their titles and planned distances).
  const { data: links } = ids.length ? await admin.from('planned_workouts').select('activity_id, title, distance_km').eq('user_id', dev.userId).in('activity_id', ids) : { data: [] };
  return buildPlanFeed({
    date,
    paces: activePlan?.fitness?.paces ?? null,
    workouts: (workouts ?? []) as CalWorkout[],
    activities: (activities ?? []) as DoneActivity[],
    links: (links ?? []) as DoneLink[],
    sets: (sets ?? []) as DoneSet[],
  });
}

/** Every remaining week of the plan with a short list of its sessions, for the "Trainingsplan" list. */
async function weeksFeed(admin: SupabaseClient, secret: string, date: string) {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply;
  const { data: activePlan } = await admin.from('training_plans').select('id, weeks').eq('user_id', dev.userId).eq('status', 'active').maybeSingle();
  const start = mondayOf(date);
  const { data: workouts } = activePlan
    ? await admin.from('planned_workouts').select('date, kind, title, distance_km, duration_min, status').eq('plan_id', activePlan.id).gte('date', start).order('date', { ascending: true }).limit(500)
    : { data: [] };
  return buildWeeksFeed({ date, weeks: (activePlan?.weeks ?? []) as PlanWeek[], workouts: (workouts ?? []) as WeeksInput['workouts'] });
}

/** The sets of one finished strength training. Uploading the same training twice changes nothing. */
async function saveStrength(admin: SupabaseClient, secret: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const dev = await device(admin, secret);
  if ('reply' in dev) return dev.reply as Record<string, unknown>;
  const { data: profile } = await admin.from('profiles').select('strength').eq('id', dev.userId).maybeSingle();
  const made = strengthRows(dev.userId, body, normalizePrefs(profile?.strength).wrist);
  if ('error' in made) return made;
  const { error } = await admin.from('strength_sets').upsert(made.rows, { onConflict: 'user_id,session_key,idx' });
  if (error) {
    const missing = /strength_sets|schema cache|does not exist/.test(error.message);
    return { error: missing ? 'Database update needed: run supabase/migrations/20261104000000_strength.sql in the Supabase SQL Editor.' : error.message };
  }
  // The planned session the training was for is done, the same as when it is logged on the website.
  const workout = typeof body.workout === 'string' && /^[0-9a-f-]{36}$/.test(body.workout) ? body.workout : null;
  if (workout && made.rows.length) {
    await admin.from('planned_workouts').update({ status: 'completed', status_source: 'user' }).eq('id', workout).eq('user_id', dev.userId).in('status', ['planned', 'missed']);
  }
  return { saved: made.rows.length };
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
    if (route === 'data' || route === 'run' || route === 'plan' || route === 'weeks') {
      const secret = req.headers.get('x-watch-secret') ?? '';
      if (!/^[a-f0-9]{64}$/.test(secret)) return json({ revoked: true });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : new Date().toISOString().slice(0, 10);
      return json(route === 'run' ? await run(admin, secret, date) : route === 'plan' ? await plan(admin, secret, date) : route === 'weeks' ? await weeksFeed(admin, secret, date) : await feed(admin, secret, date));
    }

    if (route === 'strength' && req.method === 'GET') {
      const secret = req.headers.get('x-watch-secret') ?? '';
      if (!/^[a-f0-9]{64}$/.test(secret)) return json({ revoked: true });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : new Date().toISOString().slice(0, 10);
      return json(await strengthToday(admin, secret, date));
    }

    if (route === 'library' && req.method === 'GET') {
      const secret = req.headers.get('x-watch-secret') ?? '';
      if (!/^[a-f0-9]{64}$/.test(secret)) return json({ revoked: true });
      return json(await libraryOf(admin, secret, url.searchParams.get('group') ?? ''));
    }

    if (route === 'strength' && req.method === 'POST') {
      const secret = req.headers.get('x-watch-secret') ?? '';
      if (!/^[a-f0-9]{64}$/.test(secret)) return json({ revoked: true });
      const reply = await saveStrength(admin, secret, (await req.json().catch(() => ({}))) as Record<string, unknown>);
      return json(reply, 'error' in reply ? 400 : 200);
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
