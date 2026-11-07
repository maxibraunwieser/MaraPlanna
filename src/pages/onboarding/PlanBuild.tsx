// "Building your plan": the steps the planner takes, played one after the other with the plan's own numbers, then kept next to the
// result as the explanation. The steps are computed by the plan engine (planner/rationale.ts); this file only shows them.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button, Card, cx } from '../../components/ui';
import { useI18n } from '../../lib/i18n';

export interface BuildItem {
  id: string;
  title: string;
  text: string;
  sources: string[];
}

const STEP_MS = 1150;
const FIRST_MS = 650;

/** What was played last, per kind: the steps are shown again only when the answers behind them changed. */
const played = new Map<string, string>();

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The playing steps. Calls `onDone` once every step has been shown (or skipped). */
function Playing({ title, items, onDone }: { title: string; items: BuildItem[]; onDone: () => void }) {
  const { t } = useI18n();
  const [done, setDone] = useState(() => (reducedMotion() ? items.length : 0));
  const finished = useRef(false);

  useEffect(() => {
    if (done >= items.length) {
      if (!finished.current) {
        finished.current = true;
        onDone();
      }
      return;
    }
    const id = window.setTimeout(() => setDone((d) => d + 1), done === 0 ? FIRST_MS : STEP_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, items.length]);

  const pct = Math.round((Math.min(done, items.length) / Math.max(1, items.length)) * 100);
  return (
    <Card className="!p-5" data-testid="plan-build">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Loader2 className="h-4 w-4 animate-spin text-brand motion-reduce:animate-none" aria-hidden />
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t('ob.build.sub')}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setDone(items.length)}>{t('ob.build.skip')}</Button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={title}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <ol className="mt-4 space-y-3" aria-live="polite">
        {items.slice(0, done + 1).map((it, i) => {
          const complete = i < done;
          return (
            <li key={it.id} className={cx('flex gap-3 transition-opacity duration-500 motion-reduce:transition-none', complete ? 'opacity-100' : 'opacity-70')}>
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', complete ? 'bg-brand text-white' : 'bg-slate-100 text-slate-400')} aria-hidden>
                {complete ? <Check className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{it.title}</span>
                <span className="block text-sm text-slate-600" data-testid={complete ? 'build-step' : undefined}>{complete ? it.text : t('ob.build.working')}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** The steps as the explanation next to the result, with the studies they rest on. */
export function BuildSteps({ title, items }: { title: string; items: BuildItem[] }) {
  const { t } = useI18n();
  const sources = [...new Set(items.flatMap((i) => i.sources))];
  return (
    <Card className="!p-4" data-testid="explain-card">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><BookOpen className="h-4 w-4 text-brand" />{title}</h2>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={it.id} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-slate-700">{i + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-900">{it.title}</span>
              <span className="block text-slate-600">{it.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {sources.length > 0 && (
        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">{t('ob.build.sources')}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {sources.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}

/**
 * Plays the steps the first time the person gets here and whenever the answers behind them have changed; otherwise it shows
 * the result straight away. The result can always be played again.
 */
export function BuildGate({ kind, title, items, result }: { kind: string; title: string; items: BuildItem[]; result: ReactNode }) {
  const { t } = useI18n();
  const key = items.map((i) => i.text).join('|');
  const [playing, setPlaying] = useState(() => played.get(kind) !== key);

  // What the person has seen is what counts, including their own changes of the week.
  useEffect(() => {
    if (!playing) played.set(kind, key);
  }, [playing, kind, key]);

  if (playing) return <Playing title={title} items={items} onDone={() => { played.set(kind, key); setPlaying(false); }} />;
  return (
    <div className="space-y-5">
      {result}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setPlaying(true)}>{t('ob.build.replay')}</Button>
      </div>
    </div>
  );
}

/** For tests and for leaving the questionnaire: the next visit plays the steps again. */
export const forgetBuilds = () => played.clear();
