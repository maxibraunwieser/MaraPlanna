// Strength added to a running plan that exists: the running block starts with that plan (the usual week and this week's runs)
// and one question, whether to change it. "No" skips the running questions and the plan's runs stay as they are; "yes" goes
// through the running questions from the first one and the whole plan is built again.

import { Notice } from '../../components/ui';
import { useData } from '../../lib/data';
import { fmtDistance, fmtMinutes, localTitle } from '../../lib/format';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateLong, dateText } from '../../lib/i18n/dates';
import { addDays, mondayOf } from '../../lib/planner/dates';
import { currentWeek, runSlotOf, storedRunWeek } from '../../lib/planner/keepRuns';
import type { StepApi } from './api';
import { Choice, Question } from './kit';
import { WeekBoard } from './WeekBoard';

export function RunKeepScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { plan, workouts, today } = useData();
  const runWeek = storedRunWeek(workouts, today);
  const monday = mondayOf(today);
  const thisWeek = workouts.filter((w) => runSlotOf(w.kind) && w.date >= monday && w.date <= addDays(monday, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const week = plan?.weeks.length ? currentWeek(plan.weeks, today) : null;
  const goal = plan ? plan.race_name || t(`goal.${plan.inputs.goal ?? 'marathon'}` as MsgKey) : '';

  return (
    <div className="space-y-6">
      {plan && (
        <div className="space-y-4" data-testid="kept-plan">
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{goal}</span>
            {plan.race_date ? ` · ${dateLong(plan.race_date, lang)}` : ''}
            {week ? ` · ${t('ob.keep.weekOf', { n: week.week, total: plan.weeks.length })}` : ''}
          </div>
          {runWeek ? (
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('ob.keep.usual')}</h2>
              <WeekBoard week={runWeek} extras={[]} unavailable={[]} onMove={() => undefined} runsOnly readOnly />
            </div>
          ) : (
            <Notice tone="info">{t('ob.keep.noRuns')}</Notice>
          )}
          {thisWeek.length > 0 && (
            <div>
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{t('ob.keep.thisWeek')}</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {thisWeek.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="w-24 shrink-0 text-slate-500">{dateText(w.date, lang)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{localTitle(w.title)}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">{w.distance_km ? fmtDistance(w.distance_km, s.units) : w.duration_min ? fmtMinutes(w.duration_min) : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Question label={t('ob.keep.question')} required error={s.error('keepRunPlan')}>
        <Choice
          label={t('ob.keep.question')}
          columns={2}
          value={s.setup.keepRunPlan ?? null}
          onChange={(v) => {
            s.touch('keepRunPlan');
            s.updateSetup({ keepRunPlan: v, keptWeek: null });
          }}
          options={[
            { value: true, title: t('ob.keep.no'), text: t('ob.keep.no.text') },
            { value: false, title: t('ob.keep.yes'), text: t('ob.keep.yes.text') },
          ]}
        />
      </Question>
    </div>
  );
}
