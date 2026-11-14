// Stand-in for the Supabase client, used only by the simulation (vite.sim.config.ts swaps it in). The real app runs unchanged on
// top of an in-memory database, so the questionnaire and the pages can be tried with prepared data, nothing is stored anywhere.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { refreshTargets, TargetsError } from '../../supabase/functions/_shared/nutrition/service';
import { LimitError, lookupBarcode, runAnalysis } from '../../supabase/functions/_shared/nutrition/analysis';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null };

export const supabaseConfigured = true;
export const appUrl = (path = '') => `${window.location.origin}/${path.replace(/^\//, '')}`;

export const db: Record<string, Row[]> = {};
export const SIM_USER = { id: 'sim-user', email: 'sim@maraplanna.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' };

export function resetDb(tables: Record<string, Row[]>) {
  for (const k of Object.keys(db)) delete db[k];
  for (const [k, rows] of Object.entries(tables)) db[k] = rows.map((r) => ({ ...r }));
}

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}-${Date.now()}`);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// Defaults the real database fills in for columns that are not sent.
const COLUMN_DEFAULTS: Record<string, Row> = {
  training_plans: { status: 'active' },
  planned_workouts: { status: 'planned', status_source: 'auto' },
};

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: any;
  private conflict: string[] = [];
  private filters: ((r: Row) => boolean)[] = [];
  private sorts: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private span: [number, number] | null = null;
  private one: 'single' | 'maybe' | null = null;
  private returning = false;

  constructor(private table: string) {}

  select(_cols?: string) {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = rows; this.conflict = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim()); return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  like(c: string, pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
    this.filters.push((r) => typeof r[c] === 'string' && re.test(r[c]));
    return this;
  }
  not(c: string, op: string, v: any) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    else if (op === 'in') { const list = String(v).replace(/[()]/g, '').split(','); this.filters.push((r) => !list.includes(r[c])); }
    else this.filters.push((r) => r[c] !== v);
    return this;
  }
  contains(c: string, v: any) { this.filters.push((r) => JSON.stringify(r[c] ?? '').includes(JSON.stringify(v).slice(1, -1))); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.sorts.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  range(a: number, b: number) { this.span = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }

  private matching(): Row[] {
    const rows = (db[this.table] ??= []);
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): Result {
    const rows = (db[this.table] ??= []);
    if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(clone);
      const out: Row[] = [];
      for (const r of list) {
        if (this.op === 'upsert') {
          const hit = rows.find((x) => this.conflict.every((c) => x[c] === r[c]));
          if (hit) {
            Object.assign(hit, r);
            out.push(hit);
            continue;
          }
        }
        const row = { id: uuid(), created_at: new Date().toISOString(), ...(COLUMN_DEFAULTS[this.table] ?? {}), ...r };
        rows.push(row);
        out.push(row);
      }
      return this.finish(this.returning ? out : null);
    }
    if (this.op === 'update') {
      const hit = this.matching();
      for (const r of hit) Object.assign(r, clone(this.payload));
      return this.finish(this.returning ? hit : null);
    }
    if (this.op === 'delete') {
      const hit = new Set(this.matching());
      db[this.table] = rows.filter((r) => !hit.has(r));
      return { data: null, error: null };
    }
    let out = this.matching();
    for (const s of [...this.sorts].reverse()) {
      out = [...out].sort((a, b) => (a[s.col] === b[s.col] ? 0 : (a[s.col] > b[s.col] ? 1 : -1) * (s.asc ? 1 : -1)));
    }
    if (this.span) out = out.slice(this.span[0], this.span[1] + 1);
    if (this.max !== null) out = out.slice(0, this.max);
    return this.finish(out);
  }

  private finish(data: Row[] | null): Result {
    if (!this.one) return { data: data ? clone(data) : null, error: null };
    const first = data?.[0];
    if (!first && this.one === 'single') return { data: null, error: { message: 'No rows' } };
    return { data: first ? clone(first) : null, error: null };
  }
}

// ---------------------------------------------------------------------------
// A stand-in for the Garmin edge function. What it answers depends on the mode (address: ?garmin=ok|partial|fail|broken):
//   ok       connects and brings a full set of values and runs
//   partial  connects but Garmin only knows the VO2max and two runs
//   fail     refuses the key
//   broken   accepts the key but the connection is unusable afterwards (the setup offers retry / continue manually)
// ---------------------------------------------------------------------------

export type GarminMode = 'ok' | 'partial' | 'fail' | 'broken';
let garminMode: GarminMode = 'ok';
export const setGarminMode = (m: string | null) => {
  garminMode = m === 'partial' || m === 'fail' || m === 'broken' ? m : 'ok';
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

async function fakeGarmin(body: Row): Promise<Row> {
  const action = body.action as string;
  if (action === 'disconnect') {
    db.garmin_connections = [];
    return { disconnected: true };
  }
  if (action !== 'connect' && action !== 'sync') throw new Error(`Garmin action "${action}" is not part of the simulation.`);
  await pause(900);
  if (action === 'connect') {
    if (garminMode === 'fail') throw new Error('Garmin rejected this Personal API key. Make sure you copied the whole key and that it has not expired or been deleted.');
    if (String(body.apiKey ?? '').length < 16) throw new Error('That key looks too short.');
  }
  const partial = garminMode === 'partial';
  const runs = partial ? [[2, 8.2], [9, 5.1]] : [[1, 6.2], [3, 8.4], [5, 6.0], [7, 14.1], [9, 6.5], [11, 8.0], [14, 6.1], [16, 15.3], [19, 7.4], [21, 8.3], [24, 6.0], [26, 12.8]];
  db.activities = [
    ...(db.activities ?? []).filter((a) => a.source !== 'garmin'),
    ...runs.map(([ago, km], i) => ({
      id: `sim-run-${i}`, user_id: SIM_USER.id, source: 'garmin', external_id: `sim-${i}`, name: 'Run', sport: 'run', sub_type: null,
      start_time: `${isoDay(ago)}T07:00:00Z`, local_date: isoDay(ago), duration_s: Math.round(km * 345), moving_s: Math.round(km * 345), distance_m: Math.round(km * 1000),
      avg_hr: 148 + (i % 4), max_hr: 166 + ((i * 3) % 16), elevation_gain_m: 40, calories: Math.round(km * 62), training_load: null, aerobic_te: null, vo2max: null,
    })),
  ];
  db.daily_metrics = partial ? [] : Array.from({ length: 10 }, (_, i) => ({ user_id: SIM_USER.id, date: isoDay(i), resting_hr: 48 + (i % 4), hrv_last_night: null, hrv_weekly_avg: null, hrv_status: null, sleep_s: null, sleep_score: null, stress_avg: null, body_battery_high: null, body_battery_low: null, steps: null }));
  const profile = partial
    ? { vo2max: 47 }
    : { vo2max: 52, maxHr: 187, restingHr: 49, lthr: 168, zones: [105, 128, 147, 165, 178], weightKg: 71.4, racePredictions: { '5k': 1320, '10k': 2760, half: 6120, marathon: 12_900 } };
  db.garmin_connections = [{
    user_id: SIM_USER.id, status: garminMode === 'broken' ? 'error' : 'connected', display_name: 'Sim Runner', profile, last_sync_at: new Date().toISOString(),
    last_sync_error: garminMode === 'broken' ? 'Token expired (simulated)' : null, connected_at: new Date().toISOString(),
  }];
  return { activities: runs.length, days: partial ? 0 : 10, removed: 0 };
}

/** An error the way a real Edge Function reports it ({ error: message } with a status), so the app translates it as it does for real. */
const httpError = (message: string, extra: Row = {}) => new FunctionsHttpError(new Response(JSON.stringify({ error: message, ...extra }), { status: 400 }));

// ---------------------------------------------------------------------------
// Nutrition: the food search of the database (search_foods) and the "nutrition" Edge Function, run on the in-memory tables
// with the same target calculation the real function uses.
// ---------------------------------------------------------------------------

/** Like search_foods: every word must start a word of the name (prefix), own foods first, then shorter names. */
function searchFoods(q: string, lim = 30): Row[] {
  const words = q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || q.trim().length < 2) return [];
  const hits = (db.foods ?? []).filter((f) => {
    if (f.user_id && f.user_id !== SIM_USER.id) return false;
    const text = `${f.name_de ?? ''} ${f.name_en ?? ''} ${f.brand ?? ''}`.toLowerCase();
    const tokens = text.split(/[^\p{L}\p{N}]+/u);
    return words.every((w) => tokens.some((t) => t.startsWith(w)) || text.includes(w));
  });
  return hits
    .sort((a, b) => Number(!!b.user_id) - Number(!!a.user_id) || String(a.name_de ?? a.name_en).length - String(b.name_de ?? b.name_en).length)
    .slice(0, lim)
    .map(clone);
}

/** Files of the simulated storage (meal photos), by bucket and path. */
const files = new Map<string, Blob>();

const blobToBase64 = (b: Blob) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => bad(r.error);
  r.readAsDataURL(b);
});

/** Claude through the sim server (vite.sim.config.ts), which holds the key; the rest runs here like in the function. */
async function simAnalyze(input: { image?: { data: string; mediaType: string }; text?: string; note?: string }) {
  const res = await fetch('/__sim/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `AI ${res.status}`), { code: body.code ?? 'ai_failed' });
  return body;
}

async function fakeNutrition(body: Row): Promise<Row> {
  if (body.action === 'analyze-photo' || body.action === 'parse-text') {
    const photo = body.action === 'analyze-photo';
    let image: { data: string; mediaType: string } | undefined;
    if (photo) {
      const file = files.get(`meal-photos/${body.path}`);
      if (!file) throw Object.assign(new Error('The photo could not be read.'), { code: 'no_photo' });
      image = { data: await blobToBase64(file), mediaType: file.type || 'image/jpeg' };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return { ...(await runAnalysis(supabase, {
        userId: SIM_USER.id, kind: photo ? 'photo' : 'text', model: photo ? 'sim-vision' : 'sim-text', dailyLimit: 30,
        image, text: body.text, note: body.note, photoPath: photo ? body.path : undefined, analyze: simAnalyze,
      })) };
    } catch (e) {
      if (e instanceof LimitError) throw Object.assign(new Error(`Daily limit of ${e.limit} analyses reached.`), { code: 'limit' });
      throw e;
    }
  }
  if (body.action === 'barcode') {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const food = await lookupBarcode(supabase, String(body.code ?? '').replace(/\D/g, ''), async (c) => (await fetch(`/__sim/off?code=${c}`)).json());
    if (!food) throw Object.assign(new Error('Product not found.'), { code: 'not_found' });
    return { food };
  }
  if (body.action !== 'targets') throw new Error(`Nutrition action "${body.action}" is not part of the simulation.`);
  await pause(250);
  try {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const targets = await refreshTargets(supabase, SIM_USER.id, String(body.from), String(body.to), String(body.today));
    return { targets };
  } catch (e) {
    if (e instanceof TargetsError) throw Object.assign(new Error(e.message), { code: e.code });
    throw e;
  }
}

const listeners = new Set<(event: string, session: any) => void>();
const fullSession = { access_token: 'sim', refresh_token: 'sim', expires_in: 3600, token_type: 'bearer', user: SIM_USER };
let session: typeof fullSession | null = fullSession;
/** ?signedout=1: the visit starts logged out (to look at the sign-in pages). */
export const startSignedOut = () => {
  session = null;
};
const setSession = (event: string, s: typeof fullSession | null) => {
  session = s;
  listeners.forEach((cb) => cb(event, s));
};

export const supabase = {
  from: (table: string) => new Query(table),
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: Blob) => {
        files.set(`${bucket}/${path}`, file);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) files.delete(`${bucket}/${p}`);
        return { data: null, error: null };
      },
      createSignedUrl: async (path: string) => {
        const f = files.get(`${bucket}/${path}`);
        return f ? { data: { signedUrl: URL.createObjectURL(f) }, error: null } : { data: null, error: { message: 'Object not found' } };
      },
    }),
  },
  rpc: async (name: string, args: Row = {}) => {
    if (name === 'search_foods') return { data: searchFoods(String(args.q ?? ''), Number(args.lim ?? 30)), error: null };
    return { data: null, error: { message: `rpc ${name} is not part of the simulation.` } };
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: (cb: (event: string, s: any) => void) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    signOut: async () => {
      setSession('SIGNED_OUT', null);
      return { error: null };
    },
    signInWithPassword: async () => {
      setSession('SIGNED_IN', fullSession);
      return { error: null };
    },
    signUp: async () => {
      setSession('SIGNED_IN', fullSession);
      return { data: { session: fullSession }, error: null };
    },
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
  },
  functions: {
    invoke: async (name: string, opts?: { body?: Row }) => {
      if (name === 'garmin') {
        try {
          return { data: await fakeGarmin(opts?.body ?? {}), error: null };
        } catch (e) {
          return { data: null, error: httpError((e as Error).message) };
        }
      }
      if (name === 'nutrition') {
        try {
          return { data: await fakeNutrition(opts?.body ?? {}), error: null };
        } catch (e) {
          return { data: null, error: httpError((e as Error).message, { code: (e as { code?: string }).code }) };
        }
      }
      if (name === 'delete-account') {
        // The real function removes the account and every table cascades; the simulation empties its tables.
        if (opts?.body?.confirm !== 'DELETE') return { data: null, error: httpError('Confirmation missing.') };
        for (const key of Object.keys(db)) db[key] = [];
        return { data: { deleted: true }, error: null };
      }
      if (name === 'watch') {
        const body = opts?.body ?? {};
        db.watch_devices ??= [];
        if (body.action === 'list') return { data: { devices: clone(db.watch_devices) }, error: null };
        if (body.action === 'link') {
          if (String(body.code ?? '').replace(/\D/g, '').length !== 6) return { data: null, error: httpError('Code not found or expired. The watch shows a new code by itself – check it again.') };
          db.watch_devices.push({ id: uuid(), model: 'Forerunner 165 Music', paired_at: new Date().toISOString(), last_seen_at: null });
          return { data: { linked: true }, error: null };
        }
        if (body.action === 'unlink') {
          db.watch_devices = db.watch_devices.filter((d) => d.id !== body.id);
          return { data: { unlinked: true }, error: null };
        }
      }
      return { data: null, error: new Error(`${name}: not available in the simulation.`) };
    },
  },
};
