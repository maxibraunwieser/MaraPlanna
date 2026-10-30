// Chat with the AI coach (Edge Function "coach"). The answer arrives as a stream of lines, each a JSON object.

import { supabase } from './supabase';
import type { CoachAction } from './coachActions';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: CoachAction[] | null;
  created_at: string;
}

/** Events of a streamed answer (see supabase/functions/_shared/coachLoop.ts). */
export type CoachEvent =
  | { t: 'text'; d: string }
  | { t: 'status'; d: string }
  | { t: 'actions'; d: CoachAction[] }
  | { t: 'done'; id: string }
  | { t: 'error'; d: string };

const functionUrl = () => `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/coach`;

async function headers(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') };
}

async function errorOf(res: Response): Promise<Error & { code?: string }> {
  const payload = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
  const err = new Error(payload?.error ?? (res.status === 404 ? 'The coach is not deployed yet (Edge Function "coach" is missing).' : `The coach could not answer (${res.status}).`)) as Error & { code?: string };
  err.code = payload?.code;
  return err;
}

export interface CoachStatus {
  configured: boolean;
  model: string;
  dailyLimit: number;
  used: number;
  ok?: boolean;
  error?: string;
}

/** Is the coach set up on the server, and how many messages are left today? (No AI call.) */
export async function checkCoach(test = false): Promise<CoachStatus> {
  const res = await fetch(functionUrl(), { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'check', test }) });
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as CoachStatus;
}

/** Sends a message and reports the answer piece by piece. Resolves when the answer is complete. */
export async function askCoach(message: string, today: string, onEvent: (e: CoachEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(functionUrl(), { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'chat', message, today }), signal });
  if (!res.ok) throw await errorOf(res);
  if (!res.body) throw new Error('The coach did not answer.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      onEvent(JSON.parse(line) as CoachEvent);
    } catch {
      // ignore a broken line
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
    }
    if (done) break;
  }
  handle(buffer);
}

export async function fetchCoachMessages(userId: string): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from('coach_messages')
    .select('id, role, content, actions, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(/coach_messages/.test(error.message) ? 'Database update needed: run supabase/migrations/20261031000000_coach_chat.sql in the Supabase SQL Editor.' : error.message);
  }
  return ((data ?? []) as CoachMessage[]).reverse();
}

export async function clearCoachMessages(userId: string) {
  const { error } = await supabase.from('coach_messages').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Remember whether a proposal was applied or dismissed. */
export async function saveActions(messageId: string, actions: CoachAction[]) {
  const { error } = await supabase.from('coach_messages').update({ actions }).eq('id', messageId);
  if (error) throw new Error(error.message);
}
