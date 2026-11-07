// "Your answers": every block of the questionnaire with a short summary and an Edit button that opens the block and returns here.

import { ClipboardList, Pencil } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { fmtDistance } from '../../lib/format';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateLong, weekdayNames } from '../../lib/i18n/dates';
import { parqFlagged } from '../../lib/onboarding/catalog';
import { firstOfBlock, type BlockId } from '../../lib/onboarding/screens';
import { heightText, kgToLb } from '../../lib/onboarding/units';
import { GEAR_LABEL } from '../../lib/strengthPlan';
import type { OnboardingAnswers } from '../../lib/types';
import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import type { StepApi } from './api';
import { raceKeyOf } from './GoalScreens';

const BLOCKS: BlockId[] = ['welcome', 'personal', 'everyday', 'health', 'goal', 'garmin', 'prefs', 'running', 'strength'];

export function AnswersOverview({ s, answers, strength }: { s: StepApi; answers: OnboardingAnswers; strength: StrengthPrefs }) {
  const { t, lang } = useI18n();
  const setup = answers.setup!;
  const ctx = { a: s.a, strength: s.strength };
  const units = answers.units;
  const weight = setup.weightKg ? (setup.weightUnit === 'lb' ? `${Math.round(kgToLb(setup.weightKg) * 10) / 10} lb` : `${setup.weightKg} kg`) : '–';
  const height = setup.heightCm ? heightText(setup.heightCm, setup.heightUnit) : '–';
  const sessions = t('ob.overview.sessions', { runs: answers.runDaysPerWeek, strength: strength.perWeek ?? 0 });
  const list = (items: string[]) => (items.length ? items.join(', ') : '–');

  const summary = (b: BlockId): string => {
    switch (b) {
      case 'welcome':
        return setup.consent.at ? t('ob.overview.consent', { date: dateLong(setup.consent.at, lang) }) : '–';
      case 'personal':
        return [setup.name || '–', answers.age ? String(answers.age) : null, height, weight].filter(Boolean).join(' · ');
      case 'goal': {
        const race = answers.goal && ['race5k', 'race10k', 'half', 'marathon', 'faster'].includes(answers.goal) && !answers.planWeeks;
        const what = setup.primary ? t(`ob.goal.${setup.primary}` as MsgKey) : '–';
        const when = race ? `${t(`race.${raceKeyOf(answers.raceDistanceM)}` as MsgKey)} · ${dateLong(answers.raceDate, lang)}` : answers.planWeeks ? t('goal.weeks', { n: answers.planWeeks }) : '';
        return [what, t('ob.weighting.display', { r: setup.runPct, s: 100 - setup.runPct }), when].filter(Boolean).join(' · ');
      }
      case 'garmin':
        return setup.hasGarmin === false ? t('ob.garmin.has.no') : setup.garmin === 'connected' ? t('preview.garmin.on') : t('preview.garmin.off');
      case 'running':
        return [setup.runStarted ? t(`ob.run.started.${setup.runStarted}` as MsgKey) : '–', `${fmtDistance(answers.currentWeeklyKm, units, 0)}${t('common.perWeek')}`, `${setup.runsNow}×`].join(' · ');
      case 'strength':
        return (setup.runPct ?? 50) >= 100
          ? '–'
          : [setup.strengthXp ? t(`ob.sxp.${setup.strengthXp}` as MsgKey) : '–', list(setup.locations.map((l) => t(`ob.loc.${l}` as MsgKey))), strength.gear.length ? list(strength.gear.slice(0, 3).map((g) => GEAR_LABEL[g])) + (strength.gear.length > 3 ? ' …' : '') : null].filter(Boolean).join(' · ');
      case 'everyday':
        return `${setup.daysAvail.filter((d) => !setup.restDays.includes(d)).map((d) => weekdayNames(lang)[d]).join(' ')} · ${sessions}`;
      case 'health':
        return [setup.injuryAreas.length ? setup.injuryAreas.map((i) => t(`injury.${i}` as MsgKey)).join(', ') : t('preview.none'), parqFlagged(setup.parq) ? t('ob.yes') + ' (PAR-Q)' : null].filter(Boolean).join(' · ');
      case 'prefs':
        return [`${units} · ${setup.weightUnit} · ${setup.heightUnit === 'ft' ? 'ft / in' : 'm / cm'}`, setup.motivation.length ? list(setup.motivation.map((m) => t(`ob.motivation.${m}` as MsgKey))) : null].filter(Boolean).join(' · ');
      default:
        return '–';
    }
  };

  return (
    <Card className="!p-5" data-section="answers">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900"><ClipboardList className="h-5 w-5 text-brand" />{t('ob.overview.title')}</h2>
      <ul className="space-y-2">
        {BLOCKS.map((b) => {
          const first = firstOfBlock(b, ctx);
          if (!first) return null;
          const name = t(`ob.block.${b}` as MsgKey);
          return (
            <li key={b} data-block={b} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{name}</div>
                <div className="truncate text-xs text-slate-500">{summary(b)}</div>
              </div>
              <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} aria-label={t('ob.overview.edit', { block: name })} onClick={() => s.goTo(first)}>{t('nav.edit')}</Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
