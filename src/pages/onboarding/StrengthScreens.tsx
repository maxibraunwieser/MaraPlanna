// Block 5: strength experience, where and with what the person trains, how often they lift now, and the watch wrist.

import { GEAR, type Gear } from '../../../supabase/functions/_shared/strength';
import { Segmented } from '../../components/ui';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { LOCATIONS, STRENGTH_XP } from '../../lib/onboarding/catalog';
import { setLocations, setStrengthTime } from '../../lib/onboarding/apply';
import { GEAR_LABEL } from '../../lib/strengthPlan';
import type { TrainLocation } from '../../lib/types';
import type { StepApi } from './api';
import { Choice, Chip, MultiChips, OptionCard, Question } from './kit';

export function StrExperienceScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <Question label={t('ob.sxp.label')} required why={t('sf.level.why')} error={s.error('strengthXp')}>
      <Choice
        label={t('ob.sxp.label')}
        columns={2}
        value={s.setup.strengthXp}
        onChange={(v) => {
          s.touch('strengthXp');
          s.updateSetup({ strengthXp: v });
        }}
        options={STRENGTH_XP.map((v) => ({ value: v, title: t(`ob.sxp.${v}` as MsgKey) }))}
      />
    </Question>
  );
}

export function StrWhereScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const toggle = (l: TrainLocation) => {
    s.touch('locations');
    s.updateAll((m) => setLocations(m, setup.locations.includes(l) ? setup.locations.filter((x) => x !== l) : [...setup.locations, l]));
  };
  return (
    <Question label={t('ob.loc.label')} required why={t('sf.kinds.why')} error={s.error('locations')}>
      <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label={t('ob.loc.label')}>
        {LOCATIONS.map((l) => (
          <OptionCard key={l} role="checkbox" on={setup.locations.includes(l)} onClick={() => toggle(l)} title={t(`ob.loc.${l}` as MsgKey)} text={t(`ob.loc.${l}.text` as MsgKey)} />
        ))}
      </div>
    </Question>
  );
}

export function StrEquipmentScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const gear = s.strength.gear;
  return (
    <Question label={t('ob.equip.label')} required why={t('sf.gear.why')} hint={t('ob.equip.hint')} error={s.error('gear')}>
      <MultiChips label={t('ob.equip.label')} values={gear} onChange={(v) => s.updateStrength({ gear: v as Gear[] })} options={GEAR.map((g) => ({ value: g, label: GEAR_LABEL[g] }))} />
      {gear.length === 0 && <p className="mt-2 text-xs text-slate-500">{t('ob.equip.none')}</p>}
    </Question>
  );
}

export function StrFrequencyScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <Question label={t('ob.freq.label')} required hint={t('ob.freq.hint')} error={s.error('strengthNow')}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('ob.freq.label')}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Chip key={n} on={setup.strengthNow === n} onClick={() => { s.touch('strengthNow'); s.updateAll((m) => setStrengthTime(m, { strengthNow: n })); }}>{n}×</Chip>
        ))}
      </div>
    </Question>
  );
}

export function StrWristScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <Question label={t('sf.wrist')} required why={t('sf.wrist.why')} error={s.error('wrist')} className="max-w-xs">
      <Segmented
        value={s.strength.wrist ?? ('' as 'left')}
        onChange={(v) => {
          s.touch('wrist');
          s.updateStrength({ wrist: v });
        }}
        options={[{ value: 'left', label: t('sf.wrist.left') }, { value: 'right', label: t('sf.wrist.right') }]}
      />
    </Question>
  );
}
