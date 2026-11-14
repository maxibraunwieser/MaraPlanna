// MaraPlanna nutrition: daily targets that follow the training.
//
// Signed-in user (Authorization: Bearer <jwt>):
//   { "action": "targets", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "today": "YYYY-MM-DD" }
//     targets of the range (at most 62 days); days whose inputs changed are recomputed and stored
//   { "action": "analyze-photo", "path": "<user_id>/<date>/<uuid>.jpg", "note": "Portion etwa 400 g" }
//   { "action": "parse-text", "text": "2 Eier, 1 Scheibe Vollkornbrot, Kaffee mit Milch" }
//     Claude estimates foods and grams (nothing is saved to the diary: the person confirms first); the nutrients come from
//     the food database, Claude's own estimate only where nothing matches
//   { "action": "barcode", "code": "4001234567890" }   the food (cached from Open Food Facts)
// Scheduled (header x-cron-secret: <CRON_SECRET>):
//   { "action": "targets-all" }   today and the next 7 days for everyone who uses the nutrition tab
//
// Secrets: ANTHROPIC_API_KEY (only here, never in the website), CLAUDE_VISION_MODEL (default claude-sonnet-5-5),
// CLAUDE_TEXT_MODEL (default claude-haiku-5-5), NUTRITION_AI_DAILY_LIMIT (analyses per person and 24 h, default 30).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { addDays, daysBetween, refreshTargets, TargetsError } from '../_shared/nutrition/service.ts';
import { AiError, analyzeMeal } from '../_shared/nutrition/ai.ts';
import { LimitError, lookupBarcode, runAnalysis } from '../_shared/nutrition/analysis.ts';
import { OFF_USER_AGENT, offUrl } from '../_shared/nutrition/off.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 62;
const MAX_TEXT = 500;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The key from the secret, cleaned of whitespace and stray quotes from copy and paste. */
function apiKey(): string | null {
  const key = Deno.env.get('ANTHROPIC_API_KEY')?.trim().replace(/^["']+|["']+$/g, '').trim();
  return key && key.length >= 20 ? key : null;
}
const visionModel = () => Deno.env.get('CLAUDE_VISION_MODEL') ?? 'claude-sonnet-5-5';
const textModel = () => Deno.env.get('CLAUDE_TEXT_MODEL') ?? 'claude-haiku-5-5';
const dailyLimit = () => Math.max(1, Number(Deno.env.get('NUTRITION_AI_DAILY_LIMIT') ?? 30));

type Rec = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

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
  throw new Error('Service role key is not available to the function.');
}

/** The person's calendar day: the website sends it, but only a day close to the server's is believed. */
function localDay(sent: unknown): string {
  const server = new Date().toISOString().slice(0, 10);
  if (isDay(sent) && Math.abs(Date.parse(`${sent}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`)) <= DAY_MS) return sent;
  return server;
}

/** Today in a time zone (falls back to UTC for an unknown zone). */
function todayIn(timeZone: unknown): string {
  try {
    if (typeof timeZone === 'string' && timeZone) return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    // unknown zone
  }
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey(), { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as Rec;

    if (body.action === 'targets-all') {
      const secret = Deno.env.get('CRON_SECRET');
      if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);
      const { data } = await admin.from('nutrition_profiles').select('user_id, timezone');
      const results: Rec[] = [];
      for (const p of (data ?? []) as Rec[]) {
        const today = todayIn(p.timezone);
        try {
          const rows = await refreshTargets(admin, p.user_id as string, today, addDays(today, 7), today);
          results.push({ user_id: p.user_id, days: rows.length });
        } catch (e) {
          results.push({ user_id: p.user_id, error: (e as Error).message });
        }
      }
      return json({ users: results.length, results });
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: null };
    if (authError || !auth.user) return json({ error: 'Please sign in again.' }, 401);
    const userId = auth.user.id;

    switch (body.action) {
      case 'targets': {
        const today = localDay(body.today);
        const from = isDay(body.from) ? body.from : today;
        const to = isDay(body.to) ? body.to : from;
        if (to < from || daysBetween(from, to) > MAX_RANGE_DAYS) return json({ error: `Ask for at most ${MAX_RANGE_DAYS} days.` }, 400);
        try {
          return json({ targets: await refreshTargets(admin, userId, from, to, today) });
        } catch (e) {
          if (e instanceof TargetsError) return json({ error: e.message, code: e.code }, 422);
          throw e;
        }
      }
      case 'analyze-photo':
      case 'parse-text': {
        const key = apiKey();
        if (!key) return json({ error: 'The meal analysis is not set up: the ANTHROPIC_API_KEY secret is missing.', code: 'not_configured' }, 503);
        const photo = body.action === 'analyze-photo';
        const model = photo ? visionModel() : textModel();
        let image: { data: string; mediaType: string } | undefined;
        let text: string | undefined;
        const path = typeof body.path === 'string' ? body.path : '';
        if (photo) {
          // only the person's own folder
          if (!path.startsWith(`${userId}/`) || path.includes('..')) return json({ error: 'Not your photo.' }, 403);
          const { data: file, error } = await admin.storage.from('meal-photos').download(path);
          if (error || !file) return json({ error: 'The photo could not be read.', code: 'no_photo' }, 400);
          if (file.size > MAX_PHOTO_BYTES) return json({ error: 'The photo is too large.', code: 'too_large' }, 413);
          const mediaType = ['image/png', 'image/webp'].includes(file.type) ? file.type : 'image/jpeg';
          image = { data: encodeBase64(new Uint8Array(await file.arrayBuffer())), mediaType };
        } else {
          text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
          if (!text) return json({ error: 'Describe what you ate.', code: 'empty' }, 400);
        }
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : undefined;
        try {
          const result = await runAnalysis(admin, {
            userId, kind: photo ? 'photo' : 'text', model, dailyLimit: dailyLimit(), image, text, note, photoPath: photo ? path : undefined,
            analyze: (input) => analyzeMeal(fetch, { ...input, apiKey: key, model, baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') ?? undefined }),
          });
          return json(result);
        } catch (e) {
          if (e instanceof LimitError) return json({ error: `Daily limit of ${e.limit} analyses reached.`, code: 'limit', limit: e.limit }, 429);
          if (e instanceof AiError) return json({ error: e.status === 404 ? `The model ${model} is not available for this API key.` : 'The analysis failed.', code: 'ai_failed', detail: e.message }, 502);
          throw e;
        }
      }
      case 'barcode': {
        const code = String(body.code ?? '').replace(/\D/g, '');
        const food = await lookupBarcode(admin, code, async (c) => {
          const res = await fetch(offUrl(c), { headers: { 'User-Agent': OFF_USER_AGENT } });
          return res.ok ? res.json() : null;
        });
        return food ? json({ food }) : json({ error: 'Product not found.', code: 'not_found' }, 404);
      }
      default:
        return json({ error: `Unknown action "${String(body.action)}".` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
