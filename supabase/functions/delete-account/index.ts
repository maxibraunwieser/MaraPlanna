// Deletes the signed-in person's account. Every table that holds their data references the account with "on delete cascade",
// so removing the account removes the profile, plans, workouts, activities, strength log, Garmin connection, calendar link,
// watch pairing and coach chat in one go.
//
//   POST /functions/v1/delete-account   Authorization: Bearer <user session>   { "confirm": "DELETE" }
//
// Only the person themselves can do this (the account is taken from their session, never from the request body), and only
// with the confirmation word. The service role key lives in the function's environment, never in the browser.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function serviceRoleKey(): string | null {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (key) return key;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Unexpected error.' }, 405);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = serviceRoleKey();
    if (!url || !anon || !service) return json({ error: 'Unexpected error.' }, 500);

    const authorization = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data, error } = await asUser.auth.getUser();
    if (error || !data.user) return json({ error: 'Please sign in again.' }, 401);

    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') return json({ error: 'Confirmation missing.' }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error: removeError } = await admin.auth.admin.deleteUser(data.user.id);
    if (removeError) return json({ error: 'Unexpected error.' }, 500);
    return json({ deleted: true });
  } catch {
    return json({ error: 'Unexpected error.' }, 500);
  }
});
