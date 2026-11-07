import { useState } from 'react';
import { Flag, Target } from 'lucide-react';
import { Badge, Button, Notice } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import type { GoalCheck } from '../../lib/onboarding/goalCheck';
import { fmtPaceText, paceToUnit } from '../../lib/onboarding/units';
import type { Units } from '../../lib/types';

const TONE = { easy: 'blue', realistic: 'green', ambitious: 'amber', stretch: 'red', none: 'slate' } as const;

/** The goal against the fitness: where the plan projects the person to finish, and whether the goal time is within reach. */
export function GoalReality({ check, goalTimeS, units, onAdopt, distanceText }: { check: GoalCheck; goalTimeS: number | null; units: Units; onAdopt: (timeS: number) => void; distanceText: string }) {
  const { t } = useI18n();
  const [kept, setKept] = useState(false);
  const rounded = Math.round(check.predictedS / 60) * 60;
  const goalPace = check.goalPaceS ? `${fmtPaceText(paceToUnit(check.goalPaceS, units))} /${units}` : null;
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" data-testid="goal-reality">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Target className="h-4 w-4 text-brand" />{t('reality.title')}</h3>
        {goalTimeS ? <Badge tone={TONE[check.verdict]}>{t(`reality.verdict.${check.verdict}` as 'reality.verdict.easy')}</Badge> : null}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">{t('reality.projection', { distance: distanceText })}</dt>
          <dd className="text-lg font-bold tabular-nums text-slate-900">{fmtDuration(check.predictedS)}</dd>
          <dd className="text-xs text-slate-500">{t('reality.range', { from: fmtDuration(check.range[0]), to: fmtDuration(check.range[1]) })}</dd>
        </div>
        {goalTimeS ? (
          <div>
            <dt className="text-xs text-slate-500">{t('reality.goal')}</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">{fmtDuration(goalTimeS)}</dd>
            <dd className="text-xs text-slate-500">{goalPace}</dd>
          </div>
        ) : null}
      </dl>
      {goalTimeS && (check.verdict === 'ambitious' || check.verdict === 'stretch') && (
        <>
          <p className="text-sm text-slate-700">{t(check.verdict === 'stretch' ? 'reality.stretch.text' : 'reality.ambitious.text')}</p>
          {kept ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Flag className="h-4 w-4" />{t('reality.kept')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setKept(true)}>{t('reality.keep')}</Button>
              <Button size="sm" onClick={() => onAdopt(rounded)}>{t('reality.adopt', { time: fmtDuration(rounded) })}</Button>
            </div>
          )}
        </>
      )}
      {goalTimeS && check.verdict === 'easy' && <p className="text-sm text-slate-700">{t('reality.easy.text')}</p>}
      {goalTimeS && check.verdict === 'realistic' && <p className="text-sm text-slate-700">{t('reality.realistic.text')}</p>}
      {check.tooShort && <Notice tone="warn">{t('reality.short', { weeks: check.weeks })}</Notice>}
    </div>
  );
}
