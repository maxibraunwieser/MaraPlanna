// The next seven days: how the targets follow the plan (a long-run day needs about twice the carbohydrate of a rest day).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Notice, PageHeader, Spinner, cx } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { addDays } from '../../lib/planner/dates';
import { fmtDay, localTitle } from '../../lib/format';
import * as napi from '../../lib/nutrition/api';
import { DAY_TONE, dayTypeLabel, fmt } from './parts';

export function WeekTargets() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { today } = useData();
  const [state, setState] = useState<{ loading: boolean; profile: napi.NutritionProfile | null; targets: napi.TargetRow[]; error: string | null }>({ loading: true, profile: null, targets: [], error: null });

  useEffect(() => {
    (async () => {
      try {
        const profile = await napi.fetchNutritionProfile(user!.id);
        const targets = profile ? await napi.fetchTargets(today, addDays(today, 6), today) : [];
        setState({ loading: false, profile, targets, error: null });
      } catch (e) {
        setState({ loading: false, profile: null, targets: [], error: (e as Error).message });
      }
    })();
  }, [user, today]);

  const maxCarbs = Math.max(1, ...state.targets.map((x) => x.carbs_g));
  return (
    <div className="space-y-5">
      <PageHeader title={t('food.title')} subtitle={t('food.week.subtitle')} />
      {state.loading ? <Spinner /> : state.error ? <Notice tone="error">{state.error}</Notice> : !state.profile ? (
        <Card className="text-center">
          <p className="text-sm text-slate-600">{t('food.week.noProfile')}</p>
          <Link to="/food"><Button className="mt-3">{t('food.setup.title')}</Button></Link>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600">{t('food.week.intro')}</p>
          <div className="space-y-3">
            {state.targets.map((x) => (
              <Card key={x.date} className={cx('!p-4', x.date === today && 'ring-2 ring-brand/60')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{fmtDay(x.date, today)}</span>
                    <Badge tone={DAY_TONE[x.day_type] ?? 'slate'}>{dayTypeLabel(x.day_type)}</Badge>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{fmt(x.kcal)} kcal</span>
                </div>
                {!!x.basis.sessions.length && (
                  <div className="mt-1 text-xs text-slate-500">
                    {x.basis.sessions.map((s) => `${(s.title ? localTitle(s.title) : null) ?? t(`food.session.${s.kind}` as 'food.session.run_easy')}${s.km ? ` ${fmt(s.km, 1)} km` : s.minutes ? ` ${fmt(s.minutes)} min` : ''}`).join(' · ')}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-600">{t('food.macro.carbs')} <b className="tabular-nums text-slate-900">{fmt(x.carbs_g)} g</b></span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand" style={{ width: `${(x.carbs_g / maxCarbs) * 100}%` }} /></div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                  <span>{t('food.macro.protein')} <b className="tabular-nums text-slate-900">{fmt(x.protein_g)} g</b></span>
                  <span>{t('food.macro.fat')} <b className="tabular-nums text-slate-900">{fmt(x.fat_g)} g</b></span>
                  <span>{t('food.water.short')} <b className="tabular-nums text-slate-900">{fmt(x.water_ml / 1000, 1)} l</b></span>
                </div>
              </Card>
            ))}
          </div>
          <p className="text-xs text-slate-500">{t('food.disclaimer')}</p>
        </>
      )}
    </div>
  );
}
