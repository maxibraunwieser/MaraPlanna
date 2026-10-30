import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CornerDownLeft, Loader2, MessageCircle, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { askCoach, checkCoach, clearCoachMessages, fetchCoachMessages, saveActions, type CoachMessage, type CoachStatus } from '../lib/coach';
import { applyAction, previewAction, staleReason, type ActionContext, type CoachAction } from '../lib/coachActions';
import { Badge, Button, cx, Notice, Spinner, useToast } from './ui';
import { Markdown } from './Markdown';

const SUGGESTIONS = [
  'How did my last long run go?',
  'Am I on track for my goal time?',
  "Explain this week's plan",
  "I'm tired this week – can you make it easier?",
  'I can only run 3 days a week from now on',
];

// ---------------------------------------------------------------------------
// A proposed change of the plan
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  ctx,
  busy,
  onApply,
  onDismiss,
}: {
  action: CoachAction;
  ctx: ActionContext | null;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const lines = ctx ? previewAction(action, ctx) : action.summary.split('\n');
  const stale = ctx && action.status === 'pending' ? staleReason(action, ctx) : null;
  const done = action.status === 'applied';
  return (
    <div className={cx('rounded-xl p-3 text-sm ring-1', done ? 'bg-emerald-50 ring-emerald-200' : action.status === 'dismissed' ? 'bg-slate-50 ring-slate-200' : 'bg-orange-50/60 ring-orange-200')}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed change</span>
        {done && <Badge tone="green"><Check className="h-3 w-3" /> Applied</Badge>}
        {action.status === 'dismissed' && <Badge>Dismissed</Badge>}
        {action.status === 'failed' && <Badge tone="red">Failed</Badge>}
      </div>
      <ul className={cx('space-y-1 text-slate-800', action.status === 'dismissed' && 'text-slate-500 line-through decoration-slate-300')}>
        {lines.map((l, i) => (
          <li key={i} className={cx(l.startsWith('The weeks from') && 'text-xs text-slate-500')}>{l}</li>
        ))}
      </ul>
      {action.reason && action.status !== 'dismissed' && <p className="mt-1.5 text-xs italic text-slate-500">{action.reason}</p>}
      {stale && <p className="mt-2 text-xs font-medium text-amber-700">{stale}</p>}
      {(action.status === 'pending' || action.status === 'failed') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={busy} disabled={!!stale || !ctx} icon={<Check className="h-4 w-4" />} onClick={onApply}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} icon={<X className="h-4 w-4" />} onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The conversation (lives in the pop-up of the floating coach button)
// ---------------------------------------------------------------------------

export function CoachChat({ open, onClose, onBusy, onUnread }: { open: boolean; onClose: () => void; onBusy: (busy: boolean) => void; onUnread: () => void }) {
  const { user } = useAuth();
  const { plan, workouts, activities, profile, today, reload, adapt } = useData();
  const toast = useToast();

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const [stream, setStream] = useState<{ text: string; status: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const ctx: ActionContext | null = useMemo(() => (plan ? { plan, workouts, activities, profile, today } : null), [plan, workouts, activities, profile, today]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setMessages(await fetchCoachMessages(user.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    void load();
    checkCoach().then(setStatus, () => setStatus(null));
  }, [load]);

  useEffect(() => onBusy(busy), [busy, onBusy]);

  // Keep the latest message in view; jump straight down when the window opens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: open ? 'smooth' : 'auto' });
  }, [messages.length, stream?.text, stream?.status, asked, open, loaded]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus({ preventScroll: true }), 150);
  }, [open]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setAsked(text);
    setStream({ text: '', status: null });
    setDraft('');
    const ac = new AbortController();
    abort.current = ac;
    let streamError: string | null = null;
    let answered = false;
    try {
      await askCoach(
        text,
        today,
        (e) => {
          if (e.t === 'text') setStream((s) => ({ text: (s?.text ?? '') + e.d, status: null }));
          else if (e.t === 'status') setStream((s) => ({ text: s?.text ?? '', status: e.d }));
          else if (e.t === 'done') answered = true;
          else if (e.t === 'error') streamError = e.d;
        },
        ac.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        // Nothing was saved: give the message back so it can be sent again.
        setDraft(text);
        setError((e as Error).message);
      }
    } finally {
      abort.current = null;
      setBusy(false);
      setAsked(null);
      setStream(null);
      if (streamError) setError(streamError);
      await load();
      checkCoach().then(setStatus, () => undefined);
      // The window may have been closed meanwhile: tell the button there is something new.
      if ((answered || streamError) && !openRef.current) onUnread();
    }
  };

  const updateAction = async (message: CoachMessage, actionId: string, patch: Partial<CoachAction>) => {
    const actions = (message.actions ?? []).map((a) => (a.id === actionId ? ({ ...a, ...patch } as CoachAction) : a));
    setMessages((all) => all.map((m) => (m.id === message.id ? { ...m, actions } : m)));
    try {
      await saveActions(message.id, actions);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const apply = async (message: CoachMessage, action: CoachAction) => {
    if (!ctx) return;
    setApplying(action.id);
    try {
      await applyAction(action, ctx);
      await updateAction(message, action.id, { status: 'applied' });
      await reload();
      await adapt();
      toast('Plan updated.', 'success');
    } catch (e) {
      await updateAction(message, action.id, { status: 'failed' });
      toast((e as Error).message, 'error');
    } finally {
      setApplying(null);
    }
  };

  const clear = async () => {
    if (!user || !confirm('Delete this whole conversation? The coach will start fresh.')) return;
    try {
      await clearCoachMessages(user.id);
      setMessages([]);
      setError(null);
      checkCoach().then(setStatus, () => undefined);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const left = status ? Math.max(0, status.dailyLimit - status.used) : null;
  const empty = loaded && !messages.length && !asked;
  const off = status?.configured === false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 bg-ink px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">Your coach</div>
          <div className="truncate text-xs text-slate-300">Knows your plan, runs and recovery</div>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} disabled={busy} title="Clear chat" aria-label="Clear chat" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button onClick={onClose} title="Close" aria-label="Close coach" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
        {off && (
          <Notice tone="warn" className="mb-3">
            <b>The coach is not set up yet.</b> The owner of this installation has to add the <code>ANTHROPIC_API_KEY</code> secret to the Supabase project (see the README, "AI coach").
          </Notice>
        )}
        {!plan && (
          <Notice tone="info" className="mb-3">
            You have no active plan yet. You can still ask general training questions; once you have a plan, I can adjust it for you.
          </Notice>
        )}

        {!loaded ? (
          <Spinner label="Loading your conversation…" />
        ) : (
          <div className="space-y-3">
            {empty && (
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200/80">
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-brand">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-slate-900">Ask me anything</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                  I look at your recent runs, recovery and plan. Tell me what you need – a busy week, a niggle, fewer days – and I'll suggest a change you can apply with one tap.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={busy || off} className="rounded-full bg-slate-100 px-3 py-1.5 text-left text-sm text-slate-700 transition hover:bg-orange-100 hover:text-orange-800 disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx('space-y-2', m.role === 'user' ? 'max-w-[88%]' : 'w-full max-w-[96%]')}>
                  <div
                    className={cx(
                      'rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed',
                      m.role === 'user' ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80',
                    )}
                  >
                    {m.role === 'user' ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : <Markdown text={m.content} />}
                  </div>
                  {m.role === 'assistant' &&
                    m.actions?.map((a) => (
                      <ActionCard key={a.id} action={a} ctx={ctx} busy={applying === a.id} onApply={() => apply(m, a)} onDismiss={() => updateAction(m, a.id, { status: 'dismissed' })} />
                    ))}
                </div>
              </div>
            ))}

            {asked && (
              <div className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-[14.5px] leading-relaxed text-white">
                  <p className="whitespace-pre-wrap break-words">{asked}</p>
                </div>
              </div>
            )}
            {stream && (
              <div className="flex justify-start">
                <div className="w-full max-w-[96%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14.5px] leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200/80">
                  {stream.text ? <Markdown text={stream.text} /> : null}
                  <div className={cx('flex items-center gap-2 text-sm text-slate-400', stream.text && 'mt-2')}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {stream.status ?? (stream.text ? '' : 'Thinking…')}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        {error && (
          <Notice tone="error" className="mb-2">
            {error}
          </Notice>
        )}
        <div className="flex items-end gap-2 rounded-2xl bg-slate-100 p-1.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand/50">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={Math.min(4, Math.max(1, draft.split('\n').length))}
            maxLength={2000}
            placeholder="Ask your coach…"
            disabled={off}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
          />
          {busy ? (
            <Button variant="secondary" size="sm" className="!rounded-xl !px-3 !py-2.5" icon={<Square className="h-4 w-4" />} onClick={() => abort.current?.abort()} aria-label="Stop">
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button size="sm" className="!rounded-xl !px-3 !py-2.5" disabled={!draft.trim() || off} icon={<Send className="h-4 w-4" />} onClick={() => send(draft)} aria-label="Send">
              <span className="sr-only">Send</span>
            </Button>
          )}
        </div>
        <p className="mt-2 flex items-start gap-1 px-1 text-[11px] leading-snug text-slate-400">
          <MessageCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Your plan, runs and recovery data are sent to Claude (Anthropic) to answer. Not medical advice.
            <span className="hidden sm:inline">
              {' '}
              <CornerDownLeft className="inline h-3 w-3" /> Enter sends, Shift+Enter adds a line.
            </span>
            {left !== null && left <= 10 ? ` ${left} messages left today.` : ''}
          </span>
        </p>
      </div>
    </div>
  );
}
