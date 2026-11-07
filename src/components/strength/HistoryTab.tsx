import { useMemo, useState } from 'react';
import { ChevronDown, History, Trash2 } from 'lucide-react';
import { exerciseLabel, groupSessions } from '../../lib/strengthStats';
import { exName, weightText } from '../../lib/strengthFormat';
import { fmtDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { numberText } from '../../lib/i18n/dates';
import { toUnit } from '../../../supabase/functions/_shared/strength';
import { Badge, Button, Card, CardTitle, useToast } from '../ui';
import type { StrengthCtx } from './context';

/** All recorded workouts, newest first, with every set. */
export function HistoryTab({ ctx }: { ctx: StrengthCtx }) {
  const { rows, unit, loaded } = ctx;
  const { t, lang } = useI18n();
  const toast = useToast();
  const sessions = useMemo(() => groupSessions(rows), [rows]);
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  if (!loaded) return <Card><p className="text-sm text-slate-500">{t('hi.loading')}</p></Card>;
  if (!sessions.length) {
    return (
      <Card className="text-center">
        <History className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-2 text-base font-semibold text-slate-900">{t('hi.none')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('hi.noneText')}</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle icon={<History className="h-5 w-5 text-brand" />}>{t('hi.title')}</CardTitle>
      <ul className="space-y-2">
        {sessions.map((s) => {
          const isOpen = open === s.key;
          const byExercise = new Map<string, typeof s.sets>();
          for (const r of s.sets) byExercise.set(exerciseLabel(r), [...(byExercise.get(exerciseLabel(r)) ?? []), r]);
          const fromWatch = s.sets.some((r) => r.exercise_id && !r.exercise_name);
          return (
            <li key={s.key} className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200">
              <button type="button" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-3 text-left">
                <div className="w-24 shrink-0 text-sm font-semibold text-slate-800">{fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{s.exercises.slice(0, 4).map(exName).join(' · ')}{s.exercises.length > 4 ? ` +${s.exercises.length - 4}` : ''}</div>
                  <div className="text-xs text-slate-500">{t('hi.summary', { sets: s.sets.length, reps: s.reps })}{s.volume ? t('hi.lifted', { vol: numberText(Math.round(toUnit(s.volume, unit)), lang), unit }) : ''}</div>
                </div>
                {fromWatch && <Badge tone="slate">{t('hi.watch')}</Badge>}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="pb-3 pl-2 sm:pl-[6.75rem]">
                  {[...byExercise.entries()].map(([name, list]) => (
                    <div key={name} className="mb-2">
                      <div className="text-sm font-medium text-slate-800">{exName(name)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {list.map((r, i) => (
                          <span key={i} className="rounded-lg bg-slate-100 px-2 py-1 text-xs tabular-nums text-slate-700">
                            {r.weight_kg ? `${weightText(r.weight_kg, unit).replace(` ${unit}`, '')} × ${r.reps}` : t('hi.reps', { n: r.reps })}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="mt-2">
                    {asking === s.key ? (
                      <span className="inline-flex items-center gap-2 text-sm">
                        {t('hi.askDelete')}
                        <Button size="sm" variant="danger" onClick={async () => { try { await ctx.deleteSession(s.key); toast(t('hi.deleted'), 'success'); } catch (e) { toast((e as Error).message, 'error'); } setAsking(null); }}>{t('common.delete')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>{t('hi.keep')}</Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setAsking(s.key)}>{t('hi.delete')}</Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
