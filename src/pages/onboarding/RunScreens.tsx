// Block 8: running experience, volume, reference result and paces, heart rate, then when and how often the person runs.

import { Input, Notice, cx } from '../../components/ui';
import { useData } from '../../lib/data';
import { fromUnit, toUnit } from '../../lib/format';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateText, weekdayNames } from '../../lib/i18n/dates';
import { hrZones } from '../../lib/hrZones';
import { ALL_DAYS, RUN_STARTED } from '../../lib/onboarding/catalog';
import { runsRecommendation } from '../../lib/onboarding/derive';
import { runOnlyWeek, setIntervals, setRefRace, setRunSettings, setRunStarted } from '../../lib/onboarding/apply';
import { paceFromUnit, paceToUnit } from '../../lib/onboarding/units';
import type { IntervalXp, RaceKey, Weekday } from '../../lib/types';
import type { StepApi } from './api';
import { Choice, Chip, NumField, Question, SourceBadge, TimeField } from './kit';

const RACES: RaceKey[] = ['5k', '10k', 'half', 'marathon'];
const INTERVALS: IntervalXp[] = ['never', 'rare', 'regular'];

export function RunExperienceScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  return (
    <div className="space-y-6">
      <Question label={t('ob.run.started.label')} required why={t('running.experience.why')} error={s.error('runStarted')}>
        <Choice
          label={t('ob.run.started.label')}
          columns={3}
          value={setup.runStarted}
          onChange={(v) => {
            s.touch('runStarted');
            s.updateAll((m) => setRunStarted(m, v));
          }}
          options={RUN_STARTED.map((v) => ({ value: v, title: t(`ob.run.started.${v}` as MsgKey) }))}
        />
      </Question>
      <Question label={t('ob.run.intervals.label')} why={t('running.intensity.why')}>
        <Choice label={t('ob.run.intervals.label')} columns={3} value={setup.intervals} onChange={(v) => s.updateAll((m) => setIntervals(m, v))} options={INTERVALS.map((v) => ({ value: v, title: t(`ob.run.intervals.${v}` as MsgKey) }))} />
      </Question>
    </div>
  );
}

export function RunVolumeScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { a, setup } = s;
  const err = (f: string) => s.error(f);
  const unit = s.units === 'mi' ? 'mi' : 'km';
  const own = (f: string) => setup.fromGarmin.filter((x) => x !== f);
  const badge = (f: string) => (setup.fromGarmin.includes(f) ? <SourceBadge source="garmin" /> : null);
  // The field reads in the unit of the answers (the wizard's `units`), not the account's, so it is handled with the unit of `s`.
  const toShown = (km: number) => Math.round(toUnit(km, s.units) * 10) / 10;
  const fromShown = (v: number) => Math.round(fromUnit(v, s.units) * 10) / 10;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Question label={<span className="inline-flex flex-wrap items-center gap-2">{t('ob.run.runs')}{badge('runsNow')}</span>} required why={t('running.runsNow.why')} error={err('runsNow')}>
        <NumField label={t('ob.run.runs')} suffix="×" value={setup.runsNow} invalid={!!err('runsNow')} onBlur={() => s.touch('runsNow')} onChange={(v) => s.updateSetup({ runsNow: v ?? 0, fromGarmin: own('runsNow') })} />
      </Question>
      <Question label={<span className="inline-flex flex-wrap items-center gap-2">{t('ob.run.km', { unit })}{badge('weeklyKm')}</span>} required why={t('running.weekly.why')} error={err('weeklyKm')}>
        <NumField
          label={t('ob.run.km', { unit })}
          suffix={unit}
          value={toShown(a.currentWeeklyKm)}
          invalid={!!err('weeklyKm')}
          onBlur={() => s.touch('weeklyKm')}
          onChange={(v) => s.update((x) => ({ ...x, currentWeeklyKm: v === null ? 0 : fromShown(v), setup: { ...x.setup!, fromGarmin: own('weeklyKm') } }))}
        />
      </Question>
      <Question label={t('ob.run.peak', { unit })} hint={t('ob.run.peak.hint')} error={err('peakKm')}>
        <NumField
          label={t('ob.run.peak', { unit })}
          suffix={unit}
          value={setup.peakKm === null ? null : toShown(setup.peakKm)}
          invalid={!!err('peakKm')}
          onBlur={() => s.touch('peakKm')}
          onChange={(v) => s.updateSetup({ peakKm: v === null ? null : fromShown(v) })}
        />
      </Question>
      <Question label={<span className="inline-flex flex-wrap items-center gap-2">{t('ob.run.longest', { unit })}{badge('longest')}</span>} required why={t('running.longest.why')} error={err('longest')}>
        <NumField
          label={t('ob.run.longest', { unit })}
          suffix={unit}
          value={toShown(a.longestRecentRunKm)}
          invalid={!!err('longest')}
          onBlur={() => s.touch('longest')}
          onChange={(v) => s.update((x) => ({ ...x, longestRecentRunKm: v === null ? 0 : fromShown(v), setup: { ...x.setup!, fromGarmin: own('longest') } }))}
        />
      </Question>
    </div>
  );
}

export function RunReferenceScreen({ s }: { s: StepApi }) {
  const { t } = useI18n();
  const { setup } = s;
  const err = (f: string) => s.error(f);
  const ref = setup.refRace;
  const unit = s.units === 'mi' ? 'mi' : 'km';
  const set = (patch: Partial<NonNullable<typeof ref>>) => s.updateAll((m) => setRefRace(m, { distance: ref?.distance ?? '10k', timeS: ref?.timeS ?? null, date: ref?.date ?? null, ...patch }));
  return (
    <div className="space-y-6">
      <Question label={t('ob.run.ref.label')} why={t('running.races.why')} error={err('time')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ob.run.ref.label')}>
          {RACES.map((k) => (
            <Chip key={k} on={!setup.refNone && ref?.distance === k} onClick={() => set({ distance: k })}>{t(`race.${k}` as MsgKey)}</Chip>
          ))}
          <Chip on={setup.refNone} onClick={() => s.updateAll((m) => setRefRace(m, null, !setup.refNone))}>{t('ob.run.ref.none')}</Chip>
        </div>
        {ref && !setup.refNone && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('ob.run.ref.time')}</span>
              <TimeField label={t('ob.run.ref.time')} value={ref.timeS} invalid={!!err('time')} onBlur={() => s.touch('time')} onChange={(v) => set({ timeS: v })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t('ob.run.ref.date')}</span>
              <Input type="date" max={s.today} aria-label={t('ob.run.ref.date')} value={ref.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />
            </label>
          </div>
        )}
      </Question>
      <Question label={t('running.easyPace', { unit })} why={t('running.easyPace.why')} hint={t('running.easyPace.hint')} error={err('easyPace')}>
        <div className="flex flex-wrap items-center gap-3">
          <TimeField
            className="max-w-36"
            placeholder="m:ss"
            label={t('running.easyPace', { unit })}
            value={setup.easyPaceS === null ? null : Math.round(paceToUnit(setup.easyPaceS, s.units))}
            invalid={!!err('easyPace')}
            onBlur={() => s.touch('easyPace')}
            onChange={(v) => s.updateSetup({ easyPaceS: v === null ? null : Math.round(paceFromUnit(v, s.units)) })}
          />
          <Chip on={setup.easyPaceS === null} onClick={() => s.updateSetup({ easyPaceS: null })}>{t('running.dontKnow')}</Chip>
        </div>
      </Question>
    </div>
  );
}

export function RunHeartScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { connection } = useData();
  const { a, setup } = s;
  const err = (f: string) => s.error(f);
  const sync = setup.hrSyncedAt ? dateText(setup.hrSyncedAt, lang) : null;
  const garminFloors = setup.garmin === 'connected' ? (connection?.profile?.zones ?? null) : null;
  const zones = a.maxHr ? hrZones({ maxHr: a.maxHr, restingHr: setup.restingHr, garminFloors: setup.hrSource.max === 'garmin' ? garminFloors : null }) : null;
  const own = (f: string) => setup.fromGarmin.filter((x) => x !== f);

  const setRest = (v: number | null) =>
    s.update((x) => ({ ...x, setup: { ...x.setup!, restingHr: v, hrSource: { ...x.setup!.hrSource, rest: v === null ? null : 'manual' }, fromGarmin: x.setup!.fromGarmin.filter((f) => f !== 'restingHr') } }));
  const setMax = (v: number | null) =>
    s.update((x) => ({ ...x, maxHr: v, setup: { ...x.setup!, hrSource: { ...x.setup!.hrSource, max: v === null ? null : 'manual' }, fromGarmin: x.setup!.fromGarmin.filter((f) => f !== 'maxHr') } }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Question
          label={<span className="inline-flex flex-wrap items-center gap-2">{t('running.max')}<SourceBadge source={setup.hrSource.max} when={setup.hrSource.max === 'garmin' ? sync : null} /></span>}
          why={t('running.max.why')}
          hint={setup.hrSource.max === 'estimated' ? t('ob.run.max.estimate') : t('running.max.hint')}
          error={err('maxHr')}
        >
          {/* An estimate is shown as the placeholder, so the field can be cleared and typed into without the estimate coming back. */}
          <NumField
            label={t('running.max')}
            suffix="bpm"
            value={setup.hrSource.max === 'estimated' ? null : a.maxHr}
            placeholder={setup.hrSource.max === 'estimated' && a.maxHr ? String(a.maxHr) : undefined}
            invalid={!!err('maxHr')}
            onBlur={() => s.touch('maxHr')}
            onChange={setMax}
          />
        </Question>
        <Question
          label={<span className="inline-flex flex-wrap items-center gap-2">{t('running.resting')}<SourceBadge source={setup.hrSource.rest} when={setup.hrSource.rest === 'garmin' ? sync : null} /></span>}
          why={t('running.resting.why')}
          hint={t('running.resting.hint')}
          error={err('restingHr')}
        >
          <NumField label={t('running.resting')} suffix="bpm" value={setup.restingHr} invalid={!!err('restingHr')} onBlur={() => s.touch('restingHr')} onChange={setRest} />
        </Question>
        <Question label={<span className="inline-flex flex-wrap items-center gap-2">{t('ob.run.vo2')}{setup.fromGarmin.includes('vo2max') && <SourceBadge source="garmin" />}</span>} hint={t('ob.run.vo2.hint')} error={err('vo2max')}>
          <NumField label={t('ob.run.vo2')} value={setup.vo2max} invalid={!!err('vo2max')} onBlur={() => s.touch('vo2max')} onChange={(v) => s.updateSetup({ vo2max: v, fromGarmin: own('vo2max') })} />
        </Question>
      </div>
      {zones && !err('maxHr') && !err('restingHr') && (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200" data-testid="hr-zones">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
            <span>{t('running.zones')}</span>
            <span className="font-normal text-slate-500">{t(`zones.${zones.method}` as MsgKey)}</span>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {zones.zones.map((z) => (
              <li key={z.zone} className="flex items-center justify-between px-4 py-2">
                <span className="text-slate-700">{t(`zone.${z.zone}` as MsgKey)}</span>
                <span className="font-semibold tabular-nums text-slate-900">{z.from}–{z.to} bpm</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** How often, on which days and the long run: the planner picks the days from the time per weekday, or the person does. */
export function RunDaysScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { a, setup } = s;
  const names = weekdayNames(lang, 'long');
  const short = weekdayNames(lang);
  const free = ALL_DAYS.filter((d) => !setup.unavailableDays.includes(d));
  const [lo, rec, hi] = runsRecommendation(a.goal ?? 'marathon', a.level);
  const picked = setup.runDays.filter((d) => free.includes(d));
  const manual = setup.runDaysMode === 'manual';
  const proposal = runOnlyWeek(a).week;
  const proposed = proposal.flatMap((d, i) => (d.run !== 'rest' ? [names[i]] : []));
  const longProposed = names[proposal.findIndex((d) => d.run === 'long')] ?? '–';
  return (
    <div className="space-y-7">
      <Question label={t('ob.rd.mode.label')} required>
        <Choice
          label={t('ob.rd.mode.label')}
          columns={2}
          value={setup.runDaysMode}
          onChange={(v) => s.updateAll((m) => setRunSettings(m, { runDaysMode: v, longRunAny: v === 'auto' ? true : m.a.setup!.longRunAny }))}
          options={[
            { value: 'auto' as const, title: t('ob.rd.mode.auto'), text: t('ob.rd.mode.auto.d') },
            { value: 'manual' as const, title: t('ob.rd.mode.manual'), text: t('ob.rd.mode.manual.d') },
          ]}
        />
      </Question>

      <Question label={t('running.desired')} required why={t('running.desired.why')} hint={t('running.desired.hint', { lo, rec, hi })} error={s.error('runs')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('running.desired')}>
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <Chip key={n} on={a.runDaysPerWeek === n} disabled={n > free.length} onClick={() => s.updateAll((m) => setRunSettings(m, { runsWanted: n }))}>
              {n}×{n === rec && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800">{t('running.recommended')}</span>}
            </Chip>
          ))}
        </div>
        {a.runDaysPerWeek > setup.runsNow + 2 && <Notice tone="warn" className="mt-2">{t('running.jump', { now: setup.runsNow, want: a.runDaysPerWeek })}</Notice>}
      </Question>

      {!manual && <Notice tone="info"><span data-testid="auto-days">{t('ob.rd.auto.result', { days: proposed.join(', '), long: longProposed })}</span></Notice>}

      {manual && (
        <>
          <Question label={t('ob.rd.days')} hint={t('ob.rd.days.hint')}>
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t('ob.rd.days')}>
              {ALL_DAYS.map((d) => {
                const blocked = !free.includes(d);
                const on = picked.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={blocked}
                    title={blocked ? t('ob.board.noTime') : names[d]}
                    onClick={() => s.updateAll((m) => setRunSettings(m, { runDays: (on ? picked.filter((x) => x !== d) : [...picked, d]).sort() as Weekday[] }))}
                    className={cx('rounded-xl py-2.5 text-xs font-semibold ring-1 transition disabled:opacity-30', on ? 'bg-brand-soft text-slate-900 ring-2 ring-brand' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400')}
                  >
                    {short[d]}
                  </button>
                );
              })}
            </div>
            {picked.length > 0 && picked.length < a.runDaysPerWeek && <Notice tone="info" className="mt-2">{t('ob.rd.few')}</Notice>}
          </Question>

          <Question label={t('ob.long.label')} why={t('week.longDay.why')} error={s.error('longDay')}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ob.long.label')}>
              {ALL_DAYS.map((d) => (
                <Chip key={d} on={!setup.longRunAny && a.longRunDay === d} disabled={!free.includes(d)} onClick={() => { s.touch('longDay'); s.updateAll((m) => setRunSettings(m, { longDay: d })); }}>{names[d]}</Chip>
              ))}
              <Chip on={setup.longRunAny} onClick={() => s.updateAll((m) => setRunSettings(m, { longRunAny: true }))}>{t('ob.long.planner')}</Chip>
            </div>
          </Question>
        </>
      )}
    </div>
  );
}
