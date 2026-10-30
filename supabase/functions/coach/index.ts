// AI coach for MaraPlanna: answers questions about the athlete's training and proposes plan changes.
//
//   POST /functions/v1/coach   Authorization: Bearer <user session>
//     { "action": "chat", "message": "…", "today": "YYYY-MM-DD" }   → streamed answer (one JSON object per line)
//     { "action": "check" }                                          → is the coach set up? (no AI call)
//     { "action": "check", "test": true }                            → also one tiny AI call, to test the key
//
// The Anthropic API key lives only in the function's secrets (ANTHROPIC_API_KEY): it is never stored in
// the database or the repository, never sent to the browser and never logged. Every call is tied to the
// signed-in user, limited per day, and the data sent to the model is that user's own.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { addDays, buildContext, type CoachActivity, type CoachData, type CoachMetric, type CoachPlan, type CoachWorkout } from '../_shared/coachContext.ts';
import { ApiError, runCoach, streamMessage, type ChatMessage, type CoachEvent } from '../_shared/coachLoop.ts';
import { systemPrompt } from '../_shared/coachPrompt.ts';
import type { CoachAction, LapRow } from '../_shared/coachTools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_MESSAGE = 2000;
const HISTORY_MESSAGES = 24;
const HISTORY_CHARS = 6000;
const DAY_MS = 86_400_000;

type Rec = Record<string, unknown>;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function serviceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (key) return key;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    const first = keys.default ?? Object.values(keys)[0];
    if (first) return first;
  } catch {
    // fall through
  }
  throw new HttpError(500, 'Service role key is not available to the function.');
}

/** The key from the secret, cleaned of whitespace and stray quotes from copy and paste. */
function apiKey(): string | null {
  const raw = Deno.env.get('ANTHROPIC_API_KEY');
  const key = raw?.trim().replace(/^["']+|["']+$/g, '').trim();
  return key && key.length >= 20 ? key : null;
}

const settings = () => ({
  baseUrl: (Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com').replace(/\/$/, ''),
  model: Deno.env.get('COACH_MODEL') ?? 'claude-sonnet-5-5',
  maxTokens: Math.min(4000, Math.max(300, Number(Deno.env.get('COACH_MAX_TOKENS') ?? 1800))),
  dailyLimit: Math.max(1, Number(Deno.env.get('COACH_DAILY_LIMIT') ?? 40)),
});

/** What the athlete sees when the AI service fails. Never contains the key. */
function friendly(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return 'The coach could not sign in to the AI service: the API key was rejected. Please tell the owner of this MaraPlanna installation.';
    if (e.status === 404) return 'The AI model the coach is set to use is not available for this API key. The owner can change it with the COACH_MODEL secret.';
    if (e.status === 429) return 'The AI service is busy or its usage limit is reached. Please try again in a minute.';
    if (e.status >= 500) return 'The AI service is overloaded right now. Please try again in a moment.';
    return `The AI service refused the request: ${e.message}`;
  }
  if (e instanceof HttpError) return e.message;
  if ((e as Error)?.name === 'AbortError') return 'The answer took too long and was stopped. Please try again.';
  return 'Something went wrong while the coach was answering. Please try again.';
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadData(admin: SupabaseClient, userId: string, today: string): Promise<CoachData> {
  const [{ data: profile }, { data: plan }, { data: activities }, { data: metrics }, { data: conn }] = await Promise.all([
    admin.from('profiles').select('units, display_name').eq('id', userId).maybeSingle(),
    admin.from('training_plans').select('id, race_name, race_date, start_date, inputs, fitness, weeks').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    admin
      .from('activities')
      .select('id, local_date, sport, name, distance_m, duration_s, avg_hr, max_hr, training_load, elevation_gain_m')
      .eq('user_id', userId)
      .gte('local_date', addDays(today, -180))
      .order('local_date', { ascending: false })
      .limit(400),
    admin
      .from('daily_metrics')
      .select('date, resting_hr, hrv_last_night, hrv_status, sleep_s, sleep_score, body_battery_high, body_battery_low, stress_avg')
      .eq('user_id', userId)
      .gte('date', addDays(today, -60))
      .order('date', { ascending: false })
      .limit(90),
    admin.from('garmin_connections').select('status').eq('user_id', userId).maybeSingle(),
  ]);
  const { data: workouts } = plan
    ? await admin
        .from('planned_workouts')
        .select('id, date, kind, title, distance_km, duration_min, key_session, status, note')
        .eq('plan_id', (plan as Rec).id as string)
        .limit(1000)
    : { data: [] };
  return {
    today,
    units: (profile as Rec | null)?.units === 'mi' ? 'mi' : 'km',
    displayName: typeof (profile as Rec | null)?.display_name === 'string' ? ((profile as Rec).display_name as string).slice(0, 40) : null,
    plan: plan ? (plan as unknown as CoachPlan) : null,
    workouts: (workouts ?? []) as CoachWorkout[],
    activities: (activities ?? []) as CoachActivity[],
    metrics: (metrics ?? []) as CoachMetric[],
    garminConnected: (conn as Rec | null)?.status === 'connected',
  };
}

async function lapsOf(admin: SupabaseClient, userId: string, activityId: string): Promise<LapRow[] | null> {
  const { data } = await admin.from('activities').select('details').eq('id', activityId).eq('user_id', userId).maybeSingle();
  const laps = ((data as Rec | null)?.details as { laps?: Rec[] } | null)?.laps;
  if (!Array.isArray(laps)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return laps.map((l) => ({ distanceM: n(l.distanceM) ?? 0, durationS: n(l.durationS) ?? 0, avgSpeed: n(l.avgSpeed), avgHr: n(l.avgHr) }));
}

/** The conversation so far as the model should see it (proposals and what became of them included). */
async function loadHistory(admin: SupabaseClient, userId: string): Promise<ChatMessage[]> {
  const { data } = await admin.from('coach_messages').select('role, content, actions').eq('user_id', userId).order('created_at', { ascending: false }).limit(HISTORY_MESSAGES);
  const rows = ((data ?? []) as { role: 'user' | 'assistant'; content: string; actions: CoachAction[] | null }[]).reverse();
  const out: ChatMessage[] = [];
  for (const r of rows) {
    let content = r.content.slice(0, HISTORY_CHARS);
    if (r.role === 'assistant' && r.actions?.length) {
      content += `\n\n[Proposals shown to the athlete: ${r.actions.map((a) => `${a.summary.split('\n').join('; ')} — ${a.status}`).join(' | ')}]`;
    }
    const last = out.at(-1);
    if (!out.length && r.role !== 'user') continue; // a conversation starts with the athlete
    if (last && last.role === r.role) last.content = `${last.content as string}\n\n${content}`;
    else out.push({ role: r.role, content });
  }
  return out;
}

/** The athlete's own calendar day: the website sends it, but only a day close to the server's is believed. */
function localDay(sent: unknown): string {
  const server = new Date().toISOString().slice(0, 10);
  if (typeof sent === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sent) && Math.abs(Date.parse(`${sent}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`)) <= DAY_MS) return sent;
  return server;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey(), { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: null };
    if (authError || !auth.user) return json({ error: 'Please sign in again.' }, 401);
    const userId = auth.user.id;
    const body = (await req.json().catch(() => ({}))) as Rec;
    const cfg = settings();
    const key = apiKey();

    if (body.action === 'check') {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const { count } = await admin.from('coach_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user').gte('created_at', since);
      const result: Rec = { configured: !!key, model: cfg.model, dailyLimit: cfg.dailyLimit, used: count ?? 0 };
      if (body.test === true) {
        if (!key) return json({ ...result, ok: false, error: 'The ANTHROPIC_API_KEY secret is not set.' });
        try {
          await streamMessage(fetch, { apiKey: key, baseUrl: cfg.baseUrl, model: cfg.model, maxTokens: 5, system: 'Reply with one word.', messages: [{ role: 'user', content: 'Hi' }] }, () => {});
          result.ok = true;
        } catch (e) {
          result.ok = false;
          result.error = friendly(e);
          result.status = e instanceof ApiError ? e.status : null;
        }
      }
      return json(result);
    }

    if (body.action !== 'chat') return json({ error: 'Unknown action.' }, 400);

    if (!key) return json({ error: 'The coach is not set up yet: the owner of this installation has to add the ANTHROPIC_API_KEY secret.', code: 'not_configured' }, 503);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return json({ error: 'Write a message first.' }, 400);
    if (message.length > MAX_MESSAGE) return json({ error: `Please keep a message under ${MAX_MESSAGE} characters.` }, 400);

    // Per-user daily limit: the key is shared by everyone who uses this installation.
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count } = await admin.from('coach_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user').gte('created_at', since);
    if ((count ?? 0) >= cfg.dailyLimit) {
      return json({ error: `You reached today's limit of ${cfg.dailyLimit} coach messages. It resets within 24 hours.`, code: 'limit' }, 429);
    }

    const today = localDay(body.today);
    const [data, history] = await Promise.all([loadData(admin, userId, today), loadHistory(admin, userId)]);
    const messages: ChatMessage[] = [...history];
    const lastIn = messages.at(-1);
    if (lastIn?.role === 'user') lastIn.content = `${lastIn.content as string}\n\n${message}`;
    else messages.push({ role: 'user', content: message });

    // The question is stored first, so failed attempts count towards the limit as well.
    const { error: insertError } = await admin.from('coach_messages').insert({ user_id: userId, role: 'user', content: message });
    if (insertError) {
      const hint = /coach_messages/.test(insertError.message) ? 'Database update needed: run supabase/migrations/20261031000000_coach_chat.sql in the Supabase SQL Editor.' : 'Could not save your message.';
      return json({ error: hint }, 500);
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 130_000);
    req.signal.addEventListener('abort', () => abort.abort());
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (e: CoachEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          } catch {
            // the browser went away
          }
        };
        try {
          const outcome = await runCoach({
            fetchFn: fetch,
            apiKey: key,
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            maxTokens: cfg.maxTokens,
            system: systemPrompt(buildContext(data)),
            history: messages,
            state: { data, actions: [], laps: (id) => lapsOf(admin, userId, id), newId: () => crypto.randomUUID() },
            emit,
            signal: abort.signal,
          });
          const { data: saved, error } = await admin
            .from('coach_messages')
            .insert({ user_id: userId, role: 'assistant', content: outcome.text || '(no answer)', actions: outcome.actions.length ? outcome.actions : null })
            .select('id')
            .single();
          if (error) throw new HttpError(500, 'The answer could not be saved.');
          console.log(`coach: ${outcome.usage.input} in (${outcome.usage.cacheRead} cached), ${outcome.usage.output} out, ${outcome.actions.length} proposals`);
          emit({ t: 'done', id: (saved as { id: string }).id });
        } catch (e) {
          console.error('coach error:', e instanceof ApiError ? `${e.status} ${e.message}` : (e as Error)?.name);
          emit({ t: 'error', d: friendly(e) });
        } finally {
          clearTimeout(timer);
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('coach fatal:', (e as Error)?.name);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
