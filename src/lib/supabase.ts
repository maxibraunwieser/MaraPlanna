import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Absolute URL of the app root (works on GitHub Pages sub-paths). */
export const appUrl = (path = '') => `${window.location.origin}${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
