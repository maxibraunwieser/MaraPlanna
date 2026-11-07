// The setup is saved while the person fills it in, so closing the tab or signing in on another device picks up where they stopped.
// Two copies: the browser (instant, works offline) and the profile row (follows the person). The newer one wins.

import { normalizePrefs, type StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { normalizeAnswers } from '../answers';
import type { OnboardingAnswers } from '../types';
import { SCREENS, type ScreenId, type SetupStep } from './screens';

export const DRAFT_VERSION = 2;
export type { SetupStep };

export interface SetupDraft {
  v: typeof DRAFT_VERSION;
  step: SetupStep;
  /** Screens the person has seen, so "Edit" in the overview and the progress bar can jump back. */
  done: ScreenId[];
  answers: OnboardingAnswers;
  strength: StrengthPrefs;
  savedAt: string;
}

const key = (userId: string) => `maraplanna.setup.${userId}`;
const IDS = SCREENS.map((s) => s.id) as string[];

export function newDraft(answers: OnboardingAnswers, strength: StrengthPrefs = normalizePrefs(null)): SetupDraft {
  return { v: DRAFT_VERSION, step: 'consent', done: [], answers: normalizeAnswers(answers), strength, savedAt: new Date(0).toISOString() };
}

/** Whatever was stored, made safe to use (older or damaged saves fall back to defaults field by field). */
export function parseDraft(raw: unknown): SetupDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== DRAFT_VERSION || !r.answers || typeof r.answers !== 'object') return null;
  const step = r.step === 'preview' || IDS.includes(r.step as string) ? (r.step as SetupStep) : 'consent';
  const done = Array.isArray(r.done) ? (r.done.filter((s) => IDS.includes(s as string)) as ScreenId[]) : [];
  return {
    v: DRAFT_VERSION,
    step,
    done,
    answers: normalizeAnswers(r.answers as Partial<OnboardingAnswers>),
    strength: normalizePrefs(r.strength),
    savedAt: typeof r.savedAt === 'string' ? r.savedAt : new Date(0).toISOString(),
  };
}

export function loadLocalDraft(userId: string): SetupDraft | null {
  try {
    const text = localStorage.getItem(key(userId));
    return text ? parseDraft(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function saveLocalDraft(userId: string, draft: SetupDraft) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // Private mode or a full disk: the backend copy still works.
  }
}

export function clearLocalDraft(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // nothing to clear
  }
}

/** The newer of the two copies (the browser's and the profile's). */
export function newest(a: SetupDraft | null, b: SetupDraft | null): SetupDraft | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b.savedAt) > Date.parse(a.savedAt) ? b : a;
}

/** Has the person entered anything yet? An untouched draft is not worth asking about ("continue where you left off"). */
export function hasProgress(d: SetupDraft | null): boolean {
  if (!d) return false;
  const s = d.answers.setup;
  return d.done.length > 0 || d.step !== 'consent' || !!s?.name.trim() || !!s?.birthDate || s?.heightCm != null || s?.weightKg != null || !!s?.consent.health;
}
