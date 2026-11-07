// The sign-up questionnaire: one question (or a small group) per screen, in ten blocks, with a progress bar on top, the way back always
// open, answers saved after every step (browser and profile), and conditions that hide questions that do not apply. The last screen
// is the generated plan with an overview of every block. A changed answer flows through to the later screens.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CloudCheck } from 'lucide-react';
import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { CenteredPage } from '../../components/Layout';
import { Button, Card, Notice, cx, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { createPlan, saveOnboarding, saveOnboardingDraft } from '../../lib/api';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { settle, type Model } from '../../lib/onboarding/apply';
import {
  clearLocalDraft, hasProgress, loadLocalDraft, newest, parseDraft, saveLocalDraft, DRAFT_VERSION, type SetupDraft,
} from '../../lib/onboarding/draft';
import { blankStart, editStart } from '../../lib/onboarding/seed';
import {
  SCREENS, firstOfBlock, nextScreen, positionInBlock, prevScreen, screenDef, visibleBlocks, visibleScreens, type BlockId, type ScreenId, type SetupStep,
} from '../../lib/onboarding/screens';
import { validateStep } from '../../lib/onboarding/validate';
import { supabase } from '../../lib/supabase';
import type { OnboardingAnswers, SetupExtras } from '../../lib/types';
import type { GeneratedPlan } from '../../lib/planner/generate';
import type { StepApi } from './api';
import { errText } from './kit';
import { PreviewStep } from './PreviewStep';
import { SCREEN_COMPONENTS } from './registry';

const SAVE_LOCAL_MS = 400;
const SAVE_REMOTE_MS = 2500;

/** Title and subtitle of a screen. */
function titles(id: ScreenId | null): [MsgKey, MsgKey] {
  if (id === null) return ['preview.title', 'preview.subtitle'];
  return [`ob.t.${id}` as MsgKey, `ob.s.${id}` as MsgKey];
}

export function Onboarding() {
  const { user } = useAuth();
  const { profile, plan, connection, today, reload } = useData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = !!profile?.onboarding_completed_at;

  // Where the person starts: their saved answers (editing), the newer of the two drafts, or a blank start.
  const initial = useMemo(() => {
    if (editing && profile) {
      const { answers, strength } = editStart(profile, connection, today);
      return { draft: { v: DRAFT_VERSION, step: 'consent', done: SCREENS.map((s) => s.id), answers, strength, savedAt: new Date(0).toISOString() } as SetupDraft, restored: false };
    }
    const saved = newest(loadLocalDraft(user!.id), parseDraft(profile?.onboarding_draft));
    if (saved && hasProgress(saved)) return { draft: saved, restored: true };
    const { answers, strength } = blankStart(profile, today);
    return { draft: { v: DRAFT_VERSION, step: 'consent', done: [], answers, strength, savedAt: new Date(0).toISOString() } as SetupDraft, restored: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both parts of the setup in one state, so every change settles what follows from it (age, heart rate, strength settings).
  const [model, setModel] = useState<Model>({ a: initial.draft.answers, strength: initial.draft.strength });
  const { a, strength } = model;
  const [step, setStep] = useState<SetupStep>(initial.draft.step);
  const [done, setDone] = useState<ScreenId[]>(initial.draft.done);
  /** When a block is edited from the overview, the person returns to the overview after it. */
  const [returnBlock, setReturnBlock] = useState<BlockId | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(initial.restored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const remoteOk = useRef(true);

  const setup = a.setup!;
  const ctx = { a, strength };
  const stepId: ScreenId | null = step === 'preview' ? null : step;
  const errors = useMemo(() => (stepId ? validateStep(stepId, a, strength, today) : {}), [stepId, a, strength, today]);
  const blocked = Object.keys(errors).length > 0;

  // Save the draft: the browser right away, the profile a little later. New accounts only; editing saves nothing until the end.
  useEffect(() => {
    if (editing || !user) return;
    const draft: SetupDraft = { v: DRAFT_VERSION, step, done, answers: a, strength, savedAt: new Date().toISOString() };
    const local = setTimeout(() => {
      saveLocalDraft(user.id, draft);
      setSavedAt(draft.savedAt);
    }, SAVE_LOCAL_MS);
    const remote = setTimeout(() => {
      if (remoteOk.current) void saveOnboardingDraft(user.id, draft).then((ok) => { remoteOk.current = ok; });
    }, SAVE_REMOTE_MS);
    return () => {
      clearTimeout(local);
      clearTimeout(remote);
    };
  }, [a, strength, step, done, editing, user]);

  // A new screen starts at the top, and a screen reader hears its title.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const commit = useCallback((fn: (m: Model) => Model) => setModel((m) => settle(fn(m), today)), [today]);
  const update = useCallback((fn: (x: OnboardingAnswers) => OnboardingAnswers) => commit((m) => ({ ...m, a: fn(m.a) })), [commit]);
  const updateSetup = useCallback((patch: Partial<SetupExtras>) => update((x) => ({ ...x, setup: { ...x.setup!, ...patch } })), [update]);
  const updateStrength = useCallback((patch: Partial<StrengthPrefs>) => commit((m) => ({ ...m, strength: { ...m.strength, ...patch } })), [commit]);
  const touch = useCallback((field: string) => setTouched((s) => (s.has(field) ? s : new Set(s).add(field))), []);

  const go = useCallback((to: SetupStep) => {
    setError(null);
    setSubmitted(false);
    setTouched(new Set());
    setStep(to);
  }, []);

  /** Moves on from `from`, to the overview when the edited block is finished. */
  const advance = useCallback((from: ScreenId, c: { a: OnboardingAnswers; strength: StrengthPrefs }) => {
    setDone((d) => (d.includes(from) ? d : [...d, from]));
    const to = nextScreen(from, c);
    if (returnBlock && (to === 'preview' || screenDef(to).block !== returnBlock)) {
      setReturnBlock(null);
      go('preview');
    } else go(to);
  }, [returnBlock, go]);

  const next = useCallback(() => {
    if (!stepId) return;
    if (Object.keys(validateStep(stepId, a, strength, today)).length) {
      setSubmitted(true);
      return;
    }
    advance(stepId, { a, strength });
  }, [stepId, a, strength, today, advance]);

  const back = () => {
    const prev = prevScreen(step, ctx);
    if (returnBlock) {
      if (prev && screenDef(prev).block === returnBlock) return go(prev);
      setReturnBlock(null);
      return go('preview');
    }
    if (prev) return go(prev);
    if (editing) return navigate('/settings');
    void supabase.auth.signOut().then(() => navigate('/login'));
  };

  /** Opens a screen (or a block, from the overview); from the overview the person returns to it afterwards. */
  const goTo = (to: SetupStep) => {
    if (step === 'preview' && to !== 'preview') setReturnBlock(screenDef(to).block);
    go(to);
  };

  const skip = () => {
    if (!stepId) return;
    // The Garmin screen records the choice "manual"; the later screens are worked out with that choice in place.
    const patched = stepId === 'garminConnect' ? { a: { ...a, setup: { ...setup, garmin: 'manual' as const } }, strength } : { a, strength };
    if (stepId === 'garminConnect') updateSetup({ garmin: 'manual' });
    advance(stepId, patched);
  };

  const start = async (answers: OnboardingAnswers, prefs: StrengthPrefs | undefined, generated: GeneratedPlan) => {
    setBusy(true);
    setError(null);
    try {
      await saveOnboarding(user!.id, answers, prefs);
      await createPlan(user!.id, answers, generated, today);
      clearLocalDraft(user!.id);
      // Best effort: the draft column may not exist yet.
      if (remoteOk.current) void saveOnboardingDraft(user!.id, null);
      await reload();
      toast(t('preview.started'), 'success');
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    const fresh = blankStart(profile, today);
    setModel({ a: fresh.answers, strength: fresh.strength });
    setDone([]);
    setRestored(false);
    setReturnBlock(null);
    clearLocalDraft(user!.id);
    go('consent');
  };

  const api: StepApi = {
    a, setup, strength, units: a.units, today, update, updateSetup, updateStrength, updateAll: commit, errors,
    error: (field) => (touched.has(field) || submitted ? errText(t, errors[field]) : null),
    touch,
    goTo,
    next,
    skip,
    step: stepId ?? 'strengthPlan',
  };

  const list = visibleScreens(ctx);
  const index = stepId ? list.findIndex((s) => s.id === stepId) : list.length;
  const blocks = visibleBlocks(ctx);
  const reached = Math.max(index, ...done.map((id) => list.findIndex((s) => s.id === id)));
  const currentBlock = stepId ? screenDef(stepId).block : null;
  const [titleKey, subKey] = titles(stepId);
  const def = stepId ? screenDef(stepId) : null;
  const optional = !!def?.optional;
  const Screen = stepId ? SCREEN_COMPONENTS[stepId] : null;
  const upcoming = stepId ? nextScreen(stepId, ctx) : null;
  const finishes = upcoming === 'preview';
  const leavesBlock = !!returnBlock && !!upcoming && (upcoming === 'preview' || screenDef(upcoming).block !== returnBlock);
  const position = stepId ? positionInBlock(stepId, ctx) : null;
  const firstScreen = prevScreen(step, ctx) === null;

  return (
    <CenteredPage wide>
      <div className="mb-4" role="navigation" aria-label={t('ob.progressBar')}>
        <ol className="flex gap-1">
          {blocks.map((b) => {
            const members = list.map((s, i) => ({ s, i })).filter((x) => x.s.block === b);
            const start0 = members[0].i;
            const fill = Math.max(0, Math.min(1, (index - start0) / members.length));
            const open = editing || start0 <= reached || step === 'preview';
            return (
              <li key={b} style={{ flexGrow: members.length }} className="min-w-0 flex-1 basis-0">
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => {
                    setReturnBlock(null);
                    go(firstOfBlock(b, ctx)!);
                  }}
                  aria-current={currentBlock === b ? 'step' : undefined}
                  aria-label={t(`ob.block.${b}` as MsgKey)}
                  title={t(`ob.block.${b}` as MsgKey)}
                  className={cx('relative block h-2 w-full overflow-hidden rounded-full transition', open ? 'bg-white/30 hover:bg-white/50' : 'bg-white/15')}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all" style={{ width: `${(step === 'preview' || index > members[members.length - 1].i ? 1 : fill) * 100}%` }} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <Card className="p-5 sm:p-8">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide">
            <span className="text-brand" data-testid="stepper">
              {stepId && position && currentBlock ? t('ob.progress', { block: t(`ob.block.${currentBlock}` as MsgKey), n: position[0], total: position[1] }) : t('nav.final')}
            </span>
            {!editing && savedAt && <span className="inline-flex items-center gap-1 font-medium normal-case text-slate-400"><CloudCheck className="h-3.5 w-3.5" />{t('nav.saved')}</span>}
          </div>
          <h1 ref={heading} tabIndex={-1} className="font-display mt-1 text-3xl font-bold text-slate-900 outline-none">{t(titleKey)}</h1>
          <p className="mt-1 text-sm text-slate-500">{t(subKey)}</p>
          {optional && <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{t('nav.optional')}</span>}
        </div>

        {restored && step !== 'preview' && (
          <Notice tone="info" className="mb-5">
            <span>{t('nav.restored')}</span>{' '}
            <button type="button" className="font-semibold underline" onClick={startOver}>{t('nav.startOver')}</button>
          </Notice>
        )}

        {Screen && <Screen s={api} />}
        {step === 'preview' && <PreviewStep s={api} busy={busy} editing={editing} hasPlan={!!plan} onStart={start} />}

        {error && <Notice tone="error" className="mt-5">{error}</Notice>}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>
            {returnBlock && !(prevScreen(step, ctx) && screenDef(prevScreen(step, ctx)!).block === returnBlock) ? t('nav.backToPreview') : firstScreen && !editing ? t('nav.backToSignIn') : firstScreen ? t('nav.cancel') : t('nav.back')}
          </Button>
          {stepId && (
            <div className="ml-auto flex items-center gap-2">
              {optional && <Button variant="secondary" onClick={skip}>{t('nav.skip')}</Button>}
              <Button onClick={next} disabled={blocked} aria-describedby={blocked ? 'blocked-hint' : undefined} icon={finishes || leavesBlock ? <Check className="h-4 w-4" /> : undefined}>
                {leavesBlock ? t('nav.backToPreview') : finishes ? t('nav.toPlan') : t('nav.next')}
                {!finishes && !leavesBlock && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
        {stepId && blocked && (
          <p id="blocked-hint" className="mt-3 text-right text-xs text-slate-500" data-testid="blocked-hint">
            {t('nav.blocked')}
          </p>
        )}
      </Card>
    </CenteredPage>
  );
}
