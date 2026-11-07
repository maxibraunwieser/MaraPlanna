// Block 2: what the person wants (main goal, share of running and strength, race, target time, strength goals, plan length).

import { Dumbbell, Footprints, HeartPulse, Scale, Timer, Zap } from 'lucide-react';
import { Badge, Input, Notice } from '../../components/ui';
import { fmtPace } from '../../lib/format';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { RACE_KEY_M } from '../../lib/onboarding/derive';
import { defaultRunPct, PRIMARY_GOALS, STRENGTH_GOALS, planWeekChoices } from '../../lib/onboarding/catalog';
import { setHasRace, setPlanWeeks, setPrimary, setRaceKind, setRunPct } from '../../lib/onboarding/apply';
import { addDays, daysBetween } from '../../lib/planner/dates';
import { goalProfile, isRaceGoal, type GoalKind } from '../../lib/planner/goals';
import type { PrimaryGoal, RaceKey } from '../../lib/types';
import type { StepApi } from './api';
import { Choice, Chip, MultiChips, Question, Slider, TimeField } from './kit';
import { GoalReality } from './GoalReality';
import { useFitness } from './useFitness';

const DISTANCES: RaceKey[] = ['5k', '10k', 'half', 'marathon'];
const ICON: Record<PrimaryGoal, typeof Footprints> = { running: Footprints, strength: Dumbbell, hybrid: Zap, lose: Scale, fitness: HeartPulse };

/** Name key of a distance in metres. */
export function raceKeyOf(distanceM: number | null | undefined): RaceKey {
  const d = distanceM ?? 42_195;
  return DISTANCES.reduce((best, k) => (Math.abs(RACE_KEY_M[k] - d) < Math.abs(RACE_KEY_M[best] - d) ? k : best), '5k' as RaceKey);
}

export function GoalScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <Question label={t('ob.goal.pick')} required error={s.error('goal')}>
      <Choice
        label={t('ob.goal.pick')}
        columns={2}
        value={s.setup.primary}
        onChange={(p) => {
          s.touch('goal');
          s.updateAll((m) => setPrimary(m, p, s.today));
        }}
        options={PRIMARY_GOALS.map((p) => {
          const Icon = ICON[p];
          return { value: p, icon: <Icon className="h-5 w-5" />, title: t(`ob.goal.${p}` as MsgKey), text: t(`ob.goal.${p}.text` as MsgKey) };
        })}
      />
    </Question>
  );
}

export function WeightingScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const rec = defaultRunPct(setup.primary ?? 'hybrid');
  return (
    <div className="space-y-4">
      <Question label={t('ob.weighting.label')} required>
        <Slider
          label={t('ob.weighting.label')}
          min={0}
          max={100}
          step={5}
          value={setup.runPct}
          display={`${setup.runPct} %`}
          onChange={(v) => s.updateAll((m) => setRunPct(m, v, s.today))}
        />
        <p className="mt-2 text-sm font-semibold text-slate-800" data-testid="weighting-display">{t('ob.weighting.display', { r: setup.runPct, s: 100 - setup.runPct })}</p>
        <p className="mt-1 text-xs text-slate-500">{t('ob.weighting.hint', { pct: rec })}</p>
      </Question>
      {setup.runPct === 0 && <Notice tone="info">{t('ob.weighting.zero')}</Notice>}
      {setup.runPct === 100 && <Notice tone="info">{t('ob.weighting.full')}</Notice>}
    </div>
  );
}

export function RaceScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  return (
    <Question label={t('ob.t.race')} why={t('goal.when.why')}>
      <Choice
        label={t('ob.t.race')}
        columns={2}
        value={s.setup.hasRace}
        onChange={(yes) => s.updateAll((m) => setHasRace(m, yes, s.today))}
        options={[
          { value: true, title: t('ob.race.yes'), text: t('ob.race.yes.text') },
          { value: false, title: t('ob.race.no'), text: t('ob.race.no.text') },
        ]}
      />
    </Question>
  );
}

const RACE_GOALS: { kind: GoalKind | 'ultra'; label: MsgKey }[] = [
  { kind: 'race5k', label: 'race.5k' },
  { kind: 'race10k', label: 'race.10k' },
  { kind: 'half', label: 'race.half' },
  { kind: 'marathon', label: 'race.marathon' },
  { kind: 'ultra', label: 'goal.ultra' },
  { kind: 'faster', label: 'ob.race.other' },
];

export function RaceDetailsScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { a } = s;
  const err = (f: string) => s.error(f);
  const weeksTo = a.raceDate ? Math.floor(daysBetween(s.today, a.raceDate) / 7) : null;
  const chosen = a.goal && isRaceGoal(a.goal) ? a.goal : null;
  return (
    <div className="space-y-6">
      <Question label={t('ob.race.distance')} required error={err('distance')}>
        <Choice
          label={t('ob.race.distance')}
          columns={3}
          value={chosen}
          onChange={(k) => {
            s.touch('distance');
            s.updateAll((m) => setRaceKind(m, k as GoalKind, s.today));
          }}
          options={RACE_GOALS.map(({ kind, label }) =>
            kind === 'ultra'
              ? { value: 'ultra' as GoalKind, title: t(label), badge: <Badge tone="violet">{t('goal.soon')}</Badge>, disabled: true }
              : { value: kind, title: t(label), text: kind === 'faster' ? t('ob.race.other.text') : undefined },
          )}
        />
        {chosen === 'faster' && (
          <div className="mt-3">
            <div className="mb-1.5 text-sm font-medium text-slate-800">{t('ob.race.otherDistance')}</div>
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((k) => (
                <Chip key={k} on={raceKeyOf(a.raceDistanceM) === k} onClick={() => s.update((x) => ({ ...x, raceDistanceM: RACE_KEY_M[k] }))}>{t(`race.${k}` as MsgKey)}</Chip>
              ))}
            </div>
          </div>
        )}
      </Question>

      <Question label={t('ob.race.date')} required why={t('goal.when.why')} error={err('date')}>
        <Input
          type="date"
          min={addDays(s.today, 14)}
          value={a.raceDate}
          aria-label={t('ob.race.date')}
          aria-invalid={!!err('date')}
          onChange={(e) => {
            s.touch('date');
            s.update((x) => ({ ...x, raceDate: e.target.value, planWeeks: null }));
          }}
          onBlur={() => s.touch('date')}
        />
        {weeksTo !== null && weeksTo > 0 && !err('date') && <p className="mt-1.5 text-xs text-slate-500">{weeksTo === 1 ? t('goal.when.week') : t('goal.when.weeks', { weeks: weeksTo })}</p>}
        {weeksTo !== null && weeksTo >= 2 && weeksTo < 8 && !err('date') && <Notice tone="warn" className="mt-2">{t('ob.race.short', { weeks: weeksTo })}</Notice>}
      </Question>

      <Question label={t('goal.raceName')} hint={t('goal.raceName.hint')}>
        <Input aria-label={t('goal.raceName')} placeholder={t('goal.raceName.ph')} value={a.raceName} onChange={(e) => s.update((x) => ({ ...x, raceName: e.target.value.slice(0, 80) }))} />
      </Question>
    </div>
  );
}

export function RaceTimeScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { a, setup } = s;
  const err = (f: string) => s.error(f);
  const { check, informed } = useFitness(a);
  const profile = a.goal ? goalProfile(a.goal, a.raceDistanceM) : null;
  const distanceM = profile?.distanceM ?? null;
  const mode: 'finish' | 'time' | 'unknown' = a.goalType === 'time' ? 'time' : setup.timeUnknown ? 'unknown' : 'finish';
  const setMode = (m: typeof mode) =>
    s.update((x) => ({ ...x, goalType: m === 'time' ? 'time' : 'finish', goalTimeS: m === 'time' ? x.goalTimeS : null, setup: { ...x.setup!, timeUnknown: m === 'unknown' } }));
  return (
    <div className="space-y-5">
      <Question label={t('goal.target')} why={t('goal.target.why')} error={err('time')}>
        <Choice
          label={t('goal.target')}
          columns={3}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'finish', title: t('goal.finish'), text: t('goal.finish.hint') },
            { value: 'time', title: t('goal.time'), text: t('goal.time.hint') },
            { value: 'unknown', title: t('ob.time.unknown'), text: t('ob.time.unknown.hint') },
          ]}
        />
        {mode === 'time' && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <TimeField className="max-w-40" label={t('goal.time')} value={a.goalTimeS} invalid={!!err('time')} onBlur={() => s.touch('time')} onChange={(v) => s.update((x) => ({ ...x, goalTimeS: v }))} />
            {a.goalTimeS && distanceM && !err('time') && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Timer className="h-4 w-4 text-slate-400" />{t('goal.pace', { pace: fmtPace(a.goalTimeS / (distanceM / 1000), s.units) })}</span>
            )}
          </div>
        )}
      </Question>
      {mode === 'time' && check && informed && !err('time') && a.goalTimeS ? (
        <GoalReality check={check} goalTimeS={a.goalTimeS} units={s.units} distanceText={t(`race.${raceKeyOf(distanceM)}` as MsgKey)} onAdopt={(timeS) => s.update((x) => ({ ...x, goalType: 'time', goalTimeS: timeS }))} />
      ) : (
        mode === 'time' && a.goalTimeS && !err('time') && <Notice tone="info">{t('goal.reality.later')}</Notice>
      )}
    </div>
  );
}

export function StrengthGoalsScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.t.strengthGoals')}>
        <MultiChips label={t('ob.t.strengthGoals')} values={setup.strengthGoals} onChange={(v) => s.updateSetup({ strengthGoals: v })} options={STRENGTH_GOALS.map((g) => ({ value: g, label: t(`ob.sgoal.${g}` as MsgKey) }))} />
      </Question>
      <Question label={t('ob.sgoal.note')} hint={t('ob.optionalQ')}>
        <Input aria-label={t('ob.sgoal.note')} placeholder={t('ob.sgoal.note.ph')} maxLength={120} value={setup.strengthNote} onChange={(e) => s.updateSetup({ strengthNote: e.target.value })} />
      </Question>
    </div>
  );
}

export function PlanLengthScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { a } = s;
  const goal = a.goal;
  if (!goal) return null;
  const choices = planWeekChoices(goal, a.raceDistanceM);
  return (
    <div className="space-y-6">
      {goal === 'faster' && (
        <Question label={t('goal.distance')} required why={t('goal.distance.why')}>
          <div className="flex flex-wrap gap-2">
            {DISTANCES.map((k) => (
              <Chip key={k} on={raceKeyOf(a.raceDistanceM) === k} onClick={() => s.update((x) => ({ ...x, raceDistanceM: RACE_KEY_M[k], goalType: 'finish', goalTimeS: null }))}>{t(`race.${k}` as MsgKey)}</Chip>
            ))}
          </div>
        </Question>
      )}
      <Question label={t('ob.plan.weeks')} required why={t('goal.length.why')} error={s.error('weeks')} hint={t('goal.length.hint')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ob.plan.weeks')}>
          {choices.map((w) => (
            <Chip key={w} on={a.planWeeks === w} onClick={() => s.updateAll((m) => setPlanWeeks(m, w, s.today))}>{t('goal.weeks', { n: w })}</Chip>
          ))}
        </div>
      </Question>
    </div>
  );
}
