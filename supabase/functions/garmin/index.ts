// MaraPlanna ⇄ Garmin Connect Personal API bridge (Supabase Edge Function).
//
// POST JSON with the caller's Supabase session as Bearer token:
//   { "action": "connect", "apiKey": "…" }   store key (encrypted) + first sync
//   { "action": "sync", "full": false }        pull new activities & wellness data
//   { "action": "details", "activityId": "…" } laps + stream of one run (from the FIT file)
//   { "action": "disconnect" }                 forget the key
// Scheduled sync of every user: header `x-cron-secret: <CRON_SECRET>` and
//   { "action": "sync-all" }
//
// Secrets: GARMIN_ENCRYPTION_KEY (required), CRON_SECRET (optional).
// Garmin Personal API: https://developer.garmin.com/gc-developer-program/personal/

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Decoder, Stream } from 'npm:@garmin/fitsdk@21.218.0';
import { unzipSync } from 'npm:fflate@0.8.3';

const GARMIN_BASE = Deno.env.get('GARMIN_PERSONAL_API_BASE_URL') ?? 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const PAGE_SIZE = 50; // Garmin errors above ~60
const FIRST_SYNC_DAYS = 179; // daily summaries / HRV accept ≤180 days per call
const SLEEP_WINDOW_DAYS = 27; // sleep summaries accept ≤28 days per call
const DAY_MS = 86_400_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Rec = Record<string, unknown>;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

// ---------------------------------------------------------------------------
// Encryption at rest (AES-GCM, key derived from GARMIN_ENCRYPTION_KEY)
// ---------------------------------------------------------------------------

let aesKey: Promise<CryptoKey> | null = null;
function cryptoKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('GARMIN_ENCRYPTION_KEY');
  if (!secret || secret.length < 16) {
    throw new HttpError(500, 'Server is not configured: set the GARMIN_ENCRYPTION_KEY secret (32+ random characters).');
  }
  aesKey ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(secret))
    .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return aesKey;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

async function decrypt(data: string): Promise<string> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await cryptoKey(), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------------------
// Garmin Personal API
// ---------------------------------------------------------------------------

function jwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

const KEY_REJECTED =
  'Garmin rejected this Personal API key. Make sure you copied the whole key and that it has not expired or been deleted.';

async function exchangeKey(apiKey: string): Promise<{ token: string; expiresAt: Date }> {
  const res = await fetch(GARMIN_BASE + TOKEN_PATH, {
    method: 'POST',
    headers: { Accept: '*/*', Authorization: `ApiKey ${apiKey}` },
  });
  const text = (await res.text()).trim();
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new HttpError(400, KEY_REJECTED);
  if (!res.ok) throw new HttpError(502, `Garmin's token service answered ${res.status}. Please try again in a moment.`);
  let token = text;
  if (text.startsWith('{')) {
    try {
      const body = JSON.parse(text) as Rec;
      token = String(body.access_token ?? body.accessToken ?? body.token ?? '');
    } catch {
      // keep raw text
    }
  }
  if (!token) throw new HttpError(502, 'Garmin returned an empty access token.');
  const exp = jwtExp(token);
  return { token, expiresAt: new Date(exp ? exp * 1000 : Date.now() + 23 * 3600_000) };
}

class GarminClient {
  constructor(
    private token: string,
    private renew: () => Promise<string>,
  ) {}

  private async request(path: string, params: Record<string, string | number>, accept: string): Promise<Response> {
    const url = new URL(GARMIN_BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { headers: { Accept: accept, Authorization: `Bearer ${this.token}` } });
      if (res.status === 401 && attempt === 0) {
        this.token = await this.renew();
        continue;
      }
      if (res.status === 429) throw new HttpError(429, 'Garmin rate limit reached – try syncing again in a few minutes.');
      if (!res.ok) throw new HttpError(502, `Garmin ${path} answered ${res.status}`);
      return res;
    }
    throw new HttpError(502, `Garmin ${path}: unauthorized`);
  }

  async get(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
    const text = await (await this.request(path, params, 'application/json')).text();
    return text ? JSON.parse(text) : null;
  }

  async download(path: string): Promise<Uint8Array> {
    const res = await this.request(path, {}, 'application/zip, application/x-zip-compressed, application/octet-stream');
    return new Uint8Array(await res.arrayBuffer());
  }
}

// ---------------------------------------------------------------------------
// Defensive field extraction (Garmin JSON shapes vary between services)
// ---------------------------------------------------------------------------

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function findNum(obj: unknown, keys: string[], depth = 3): number | null {
  if (!isRec(obj) || depth < 0) return null;
  for (const k of keys) {
    const v = num(obj[k]);
    if (v !== null) return v;
  }
  for (const v of Object.values(obj)) {
    const found = isRec(v) ? findNum(v, keys, depth - 1) : null;
    if (found !== null) return found;
  }
  return null;
}

function findStr(obj: unknown, keys: string[], depth = 2): string | null {
  if (!isRec(obj) || depth < 0) return null;
  for (const k of keys) if (typeof obj[k] === 'string' && obj[k]) return obj[k] as string;
  for (const v of Object.values(obj)) {
    const found = isRec(v) ? findStr(v, keys, depth - 1) : null;
    if (found) return found;
  }
  return null;
}

/** The list of records inside a Garmin response (array, or first array property). */
function items(resp: unknown): Rec[] {
  if (Array.isArray(resp)) return resp.filter(isRec);
  if (isRec(resp)) {
    for (const v of Object.values(resp)) if (Array.isArray(v) && v.some(isRec)) return v.filter(isRec);
    return [resp];
  }
  return [];
}

function dateOf(item: Rec): string | null {
  const d = findStr(item, ['calendarDate', 'summaryDate', 'date', 'startDate'], 1);
  return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const int = (v: number | null) => (v === null ? null : Math.round(v));

function sportOf(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('strength')) return 'strength';
  if (t.includes('cycl') || t.includes('bik') || t.includes('spin')) return 'bike';
  if (t.includes('swim')) return 'swim';
  if (t.includes('walk') || t.includes('hik')) return 'walk';
  if (t.includes('yoga') || t.includes('pilates') || t.includes('stretch') || t.includes('mobility')) return 'mobility';
  return 'other';
}

function mapActivity(a: Rec, userId: string) {
  const id = a.activityId ?? a.activityUUID ?? a.summaryId;
  if (id === undefined || id === null) return null;
  const type = isRec(a.activityType) ? a.activityType : isRec(a.activityTypeDTO) ? a.activityTypeDTO : null;
  const typeKey = String(type?.typeKey ?? (typeof a.activityType === 'string' ? a.activityType : 'other'));
  const local = typeof a.startTimeLocal === 'string' ? a.startTimeLocal : null;
  const gmt = typeof a.startTimeGMT === 'string' ? a.startTimeGMT : null;
  let start: Date | null = null;
  let localDate: string | null = null;
  if (gmt) start = new Date(gmt.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(gmt) ? '' : 'Z'));
  if (local) localDate = local.slice(0, 10);
  const startSec = num(a.startTimeInSeconds);
  if (!start && startSec !== null) start = new Date(startSec * 1000);
  if (!localDate && startSec !== null) localDate = isoDay((startSec + (num(a.startTimeOffsetInSeconds) ?? 0)) * 1000);
  if (!start && local) start = new Date(local.replace(' ', 'T') + 'Z');
  if (!start || Number.isNaN(start.getTime()) || !localDate) return null;

  return {
    user_id: userId,
    source: 'garmin',
    external_id: String(id),
    name: typeof a.activityName === 'string' ? a.activityName : null,
    sport: sportOf(typeKey),
    sub_type: typeKey,
    start_time: start.toISOString(),
    local_date: localDate,
    duration_s: int(num(a.duration) ?? num(a.durationInSeconds) ?? num(a.elapsedDuration)),
    moving_s: int(num(a.movingDuration) ?? num(a.duration) ?? num(a.durationInSeconds)),
    distance_m: num(a.distance) ?? num(a.distanceInMeters),
    avg_hr: int(num(a.averageHR) ?? num(a.averageHeartRateInBeatsPerMinute)),
    max_hr: int(num(a.maxHR) ?? num(a.maxHeartRateInBeatsPerMinute)),
    elevation_gain_m: num(a.elevationGain) ?? num(a.totalElevationGainInMeters),
    calories: int(num(a.calories) ?? num(a.activeKilocalories)),
    training_load: num(a.activityTrainingLoad),
    aerobic_te: num(a.aerobicTrainingEffect),
    vo2max: num(a.vO2MaxValue) ?? num(a.vo2MaxValue),
    raw: a,
  };
}

// ---------------------------------------------------------------------------
// Activity details (laps + downsampled stream) from the original FIT file
// ---------------------------------------------------------------------------

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN);
const round = (v: unknown, digits = 0) => {
  const n = num(v);
  return n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;
};

function fitDetails(bytes: Uint8Array) {
  let fit = bytes;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entry = Object.entries(unzipSync(bytes)).find(([name]) => name.toLowerCase().endsWith('.fit'));
    if (!entry) throw new HttpError(502, 'The Garmin download contained no FIT file.');
    fit = entry[1];
  }
  const { messages } = new Decoder(Stream.fromByteArray(fit)).read();
  const records = ((messages as Rec).recordMesgs ?? []) as Rec[];
  const laps = ((messages as Rec).lapMesgs ?? []) as Rec[];
  const t0 = ms(records[0]?.timestamp ?? laps[0]?.startTime);
  const samples: Rec[] = [];
  let lastT = -Infinity;
  for (const r of records) {
    const t = (ms(r.timestamp) - t0) / 1000;
    if (!Number.isFinite(t) || t - lastT < 10) continue;
    lastT = t;
    samples.push({
      t: Math.round(t),
      d: round(r.distance) ?? (samples.length ? samples[samples.length - 1].d : 0),
      hr: round(r.heartRate),
      v: round(r.enhancedSpeed ?? r.speed, 2),
      alt: round(r.enhancedAltitude ?? r.altitude, 1),
    });
  }
  return {
    laps: laps.map((l) => ({
      startS: Math.round((ms(l.startTime) - t0) / 1000) || 0,
      durationS: round(l.totalTimerTime ?? l.totalElapsedTime) ?? 0,
      distanceM: round(l.totalDistance) ?? 0,
      avgSpeed: round(l.enhancedAvgSpeed ?? l.avgSpeed, 3),
      avgHr: round(l.avgHeartRate),
      maxHr: round(l.maxHeartRate),
      cadence: round(l.avgRunningCadence ?? l.avgCadence),
      intensity: typeof l.intensity === 'string' ? l.intensity : null,
    })),
    samples,
  };
}

const fetchDetails = async (g: GarminClient, externalId: string) => fitDetails(await g.download(`/download-service/files/activity/${externalId}`));

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function clientFor(admin: SupabaseClient, userId: string): Promise<GarminClient> {
  const { data: secret, error } = await admin.from('garmin_secrets').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!secret) throw new HttpError(404, 'Garmin is not connected.');

  const renew = async () => {
    const apiKey = await decrypt(secret.api_key_enc);
    try {
      const t = await exchangeKey(apiKey);
      await admin
        .from('garmin_secrets')
        .update({ access_token_enc: await encrypt(t.token), access_token_expires_at: t.expiresAt.toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      return t.token;
    } catch (e) {
      if (e instanceof HttpError && e.status === 400) {
        const msg = 'Your Garmin Personal API key expired or was deleted. Create a new key in Garmin Connect and reconnect.';
        await admin.from('garmin_connections').update({ status: 'expired', last_sync_error: msg }).eq('user_id', userId);
        throw new HttpError(400, msg);
      }
      throw e;
    }
  };

  const fresh =
    secret.access_token_enc && secret.access_token_expires_at && Date.parse(secret.access_token_expires_at) - Date.now() > 3600_000;
  const token = fresh ? await decrypt(secret.access_token_enc) : await renew();
  return new GarminClient(token, renew);
}

async function readProfile(g: GarminClient, warnings: string[]) {
  const profile: Rec = {};
  let displayName: string | null = null;
  try {
    const settings = await g.get('/userprofile-service/userprofile/settings');
    profile.vo2max = findNum(settings, ['vo2MaxRunning', 'vo2Max']);
    profile.lthr = findNum(settings, ['lactateThresholdHeartRate']);
    displayName = findStr(settings, ['displayName', 'fullName', 'userName']);
  } catch (e) {
    warnings.push(`profile: ${(e as Error).message}`);
  }
  try {
    const zones = items(await g.get('/biometric-service/heartRateZones/v2'));
    const zone =
      zones.find((z) => String(z.sport ?? '').toUpperCase() === 'RUNNING') ??
      zones.find((z) => String(z.sport ?? '').toUpperCase() === 'DEFAULT') ??
      zones[0];
    if (zone) {
      profile.maxHr = int(findNum(zone, ['maxHeartRateUsed', 'maxHeartRate']));
      profile.restingHr = int(findNum(zone, ['restingHeartRateUsed', 'restingHeartRate']));
      profile.lthr ??= int(findNum(zone, ['lactateThresholdHeartRateUsed']));
    }
  } catch (e) {
    warnings.push(`heart-rate zones: ${(e as Error).message}`);
  }
  return { profile, displayName };
}

const METRIC_COLUMNS = [
  'resting_hr', 'hrv_last_night', 'hrv_weekly_avg', 'hrv_status', 'sleep_s', 'sleep_score',
  'stress_avg', 'body_battery_high', 'body_battery_low', 'steps',
] as const;

async function syncUser(admin: SupabaseClient, userId: string, opts: { full?: boolean } = {}) {
  const { data: conn } = await admin.from('garmin_connections').select('*').eq('user_id', userId).maybeSingle();
  if (!conn) throw new HttpError(404, 'Garmin is not connected.');
  const g = await clientFor(admin, userId);
  const warnings: string[] = [];
  const now = Date.now();
  const endDate = isoDay(now + DAY_MS);
  const sinceMs =
    opts.full || !conn.last_sync_at ? now - FIRST_SYNC_DAYS * DAY_MS : Math.min(Date.parse(conn.last_sync_at) - 3 * DAY_MS, now - 7 * DAY_MS);
  const startDate = isoDay(sinceMs);

  // Activities
  const activities: Rec[] = [];
  for (let start = 0; start < 2000; start += PAGE_SIZE) {
    const page = items(
      await g.get('/activitylist-service/activities/search/activities', { start, limit: PAGE_SIZE, startDate, endDate }),
    );
    activities.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const rows = activities.map((a) => mapActivity(a, userId)).filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('activities').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,source,external_id' });
    if (error) throw new HttpError(500, `Saving activities failed: ${error.message}`);
  }

  // Laps + stream for the most recent runs (used by the workout analysis).
  try {
    const { data: missing, error } = await admin
      .from('activities')
      .select('id, external_id')
      .eq('user_id', userId)
      .eq('source', 'garmin')
      .eq('sport', 'run')
      .is('details', null)
      .gte('local_date', isoDay(now - 14 * DAY_MS))
      .order('start_time', { ascending: false })
      .limit(6);
    if (error) throw new Error(error.message);
    for (const m of missing ?? []) {
      const details = await fetchDetails(g, m.external_id);
      await admin.from('activities').update({ details }).eq('id', m.id);
    }
  } catch (e) {
    warnings.push(`run details: ${(e as Error).message}`);
  }

  // Wellness, merged per day
  const days = new Map<string, Rec>();
  const put = (date: string, col: (typeof METRIC_COLUMNS)[number], value: number | string | null) => {
    if (value === null) return;
    const row = days.get(date) ?? {};
    row[col] = value;
    days.set(date, row);
  };

  try {
    const summaries = items(await g.get('/usersummary-service/v2/dailysummaries', { startDate, endDate: isoDay(now) }));
    for (const it of summaries) {
      const d = dateOf(it);
      if (!d) continue;
      put(d, 'resting_hr', int(findNum(it, ['restingHeartRate', 'restingHeartRateValue', 'restingHeartRateInBeatsPerMinute'])));
      put(d, 'steps', int(findNum(it, ['totalSteps', 'steps'])));
      put(d, 'stress_avg', int(findNum(it, ['averageStressLevel', 'avgStressLevel', 'stressAverage'])));
      put(d, 'body_battery_high', int(findNum(it, ['bodyBatteryHighestValue', 'bodyBatteryHigh', 'highestBodyBattery', 'maxBodyBattery'])));
      put(d, 'body_battery_low', int(findNum(it, ['bodyBatteryLowestValue', 'bodyBatteryLow', 'lowestBodyBattery', 'minBodyBattery'])));
      put(d, 'sleep_s', int(findNum(it, ['sleepingSeconds', 'sleepTimeSeconds'])));
    }
  } catch (e) {
    warnings.push(`daily summaries: ${(e as Error).message}`);
  }

  try {
    const hrvStart = isoDay(Math.max(sinceMs, now - 60 * DAY_MS));
    for (const it of items(await g.get(`/hrv-service/hrv/daily/${hrvStart}/${isoDay(now)}`))) {
      const d = dateOf(it);
      if (!d) continue;
      put(d, 'hrv_last_night', findNum(it, ['lastNightAvg', 'lastNight', 'hrvValue']));
      put(d, 'hrv_weekly_avg', findNum(it, ['weeklyAvg', 'weeklyAverage']));
      put(d, 'hrv_status', findStr(it, ['status', 'hrvStatus'], 1));
    }
  } catch (e) {
    warnings.push(`HRV: ${(e as Error).message}`);
  }

  // Sleep: recent weeks only (readiness), ≤28 days per call
  const sleepFrom = Math.max(sinceMs, now - 2 * (SLEEP_WINDOW_DAYS + 1) * DAY_MS);
  for (let from = sleepFrom; from <= now; from += (SLEEP_WINDOW_DAYS + 1) * DAY_MS) {
    try {
      const to = Math.min(now, from + SLEEP_WINDOW_DAYS * DAY_MS);
      for (const it of items(await g.get('/sleep-service/sleep/dailySleepSummariesByDate', { startDate: isoDay(from), endDate: isoDay(to) }))) {
        const d = dateOf(it);
        if (!d) continue;
        put(d, 'sleep_s', int(findNum(it, ['sleepTimeSeconds', 'sleepTimeInSeconds', 'totalSleepSeconds', 'durationInSeconds'])));
        const scores = isRec(it.sleepScores) && isRec(it.sleepScores.overall) ? num(it.sleepScores.overall.value) : null;
        put(d, 'sleep_score', int(scores ?? findNum(it, ['overallSleepScore', 'sleepScore', 'overallScore'])));
      }
    } catch (e) {
      warnings.push(`sleep: ${(e as Error).message}`);
      break;
    }
  }

  if (days.size) {
    const dates = [...days.keys()].sort();
    const { data: existing } = await admin
      .from('daily_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dates[0])
      .lte('date', dates[dates.length - 1]);
    const prev = new Map((existing ?? []).map((r: Rec) => [r.date as string, r]));
    const metricRows = dates.map((date) => {
      const row: Rec = { user_id: userId, date, updated_at: new Date().toISOString() };
      for (const col of METRIC_COLUMNS) row[col] = days.get(date)![col] ?? prev.get(date)?.[col] ?? null;
      return row;
    });
    for (let i = 0; i < metricRows.length; i += 200) {
      const { error } = await admin.from('daily_metrics').upsert(metricRows.slice(i, i + 200), { onConflict: 'user_id,date' });
      if (error) warnings.push(`saving wellness data: ${error.message}`);
    }
  }

  const { profile, displayName } = await readProfile(g, warnings);
  await admin
    .from('garmin_connections')
    .update({
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_sync_error: warnings.length ? warnings.join('; ').slice(0, 500) : null,
      profile: { ...(isRec(conn.profile) ? conn.profile : {}), ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null)) },
      ...(displayName ? { display_name: displayName } : {}),
    })
    .eq('user_id', userId);

  return { activities: rows.length, days: days.size, warnings };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey(), { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as Rec;

    if (body.action === 'sync-all') {
      const secret = Deno.env.get('CRON_SECRET');
      if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);
      const { data } = await admin.from('garmin_connections').select('user_id').eq('status', 'connected');
      const results: Rec[] = [];
      for (const { user_id } of data ?? []) {
        try {
          results.push({ user_id, ...(await syncUser(admin, user_id)) });
        } catch (e) {
          results.push({ user_id, error: (e as Error).message });
        }
      }
      return json({ synced: results.length, results });
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: null };
    if (authError || !auth.user) return json({ error: 'Please sign in again.' }, 401);
    const userId = auth.user.id;

    switch (body.action) {
      case 'connect': {
        const apiKey = String(body.apiKey ?? '').trim();
        if (apiKey.length < 16) throw new HttpError(400, 'That does not look like a Garmin Personal API key.');
        const t = await exchangeKey(apiKey);
        const nowIso = new Date().toISOString();
        const { error: secretError } = await admin.from('garmin_secrets').upsert({
          user_id: userId,
          api_key_enc: await encrypt(apiKey),
          access_token_enc: await encrypt(t.token),
          access_token_expires_at: t.expiresAt.toISOString(),
          updated_at: nowIso,
        });
        if (secretError) throw new HttpError(500, secretError.message);
        const { error: connError } = await admin.from('garmin_connections').upsert({
          user_id: userId,
          status: 'connected',
          last_sync_at: null,
          last_sync_error: null,
          connected_at: nowIso,
        });
        if (connError) throw new HttpError(500, connError.message);
        try {
          return json({ connected: true, ...(await syncUser(admin, userId, { full: true })) });
        } catch (e) {
          return json({ connected: true, activities: 0, days: 0, warnings: [(e as Error).message] });
        }
      }
      case 'sync':
        return json(await syncUser(admin, userId, { full: body.full === true }));
      case 'details': {
        const { data: act, error } = await admin
          .from('activities')
          .select('id, source, external_id, details')
          .eq('id', String(body.activityId ?? ''))
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new HttpError(500, error.message.includes('details') ? 'Database update needed: run the latest migration.' : error.message);
        if (!act) throw new HttpError(404, 'Activity not found.');
        if (act.details || act.source !== 'garmin' || !act.external_id) return json({ details: act.details ?? null });
        const details = await fetchDetails(await clientFor(admin, userId), act.external_id);
        await admin.from('activities').update({ details }).eq('id', act.id);
        return json({ details });
      }
      case 'disconnect': {
        await admin.from('garmin_secrets').delete().eq('user_id', userId);
        await admin.from('garmin_connections').delete().eq('user_id', userId);
        if (body.deleteData === true) {
          await admin.from('activities').delete().eq('user_id', userId).eq('source', 'garmin');
          await admin.from('daily_metrics').delete().eq('user_id', userId);
        }
        return json({ disconnected: true });
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(e);
    return json({ error: (e as Error).message ?? 'Unexpected error' }, status);
  }
});
