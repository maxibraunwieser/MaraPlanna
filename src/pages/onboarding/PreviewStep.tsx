import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, CalendarDays, ChevronDown, Dumbbell, HeartPulse, Loader2, Pencil, Rocket, Send, Target, Watch } from 'lucide-react';
import { useData } from '../../lib/data';
import { Badge, Button, Card, Notice, cx } from '../../components/ui';
import { VolumeChart } from '../../components/VolumeChart';
import { ExerciseThumb } from '../../components/strength/ExerciseImage';
import { fmtDistance, fmtDuration, fmtMinutes, fmtNum, localMessage, localNote, localTitle, zonePaceText } from '../../lib/format';
import { exName, repsLabel } from '../../lib/strengthFormat';
import { sourceText } from '../../../supabase/functions/_shared/content';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateLong, dateText } from '../../lib/i18n/dates';
import { hrZones } from '../../lib/hrZones';
import { finalize } from '../../lib/onboarding/finalize';
import { runsRecommendation, strengthRecommendation } from '../../lib/onboarding/derive';
import { checkGoal } from '../../lib/onboarding/goalCheck';
import { parqFlagged } from '../../lib/onboarding/catalog';
import { caliOf, distinctWorkouts } from '../../lib/onboarding/strengthMap';
import { kgToLb } from '../../lib/onboarding/units';
import { explainPlan } from '../../lib/planner/explain';
import { buildPlan, type GeneratedPlan } from '../../lib/planner/generate';
import { currentWeek, keepRunPlan, keptStrengthSessions, keptWeekFor } from '../../lib/planner/keepRuns';
import { assessFitness } from '../../lib/planner/fitness';
import { goalProfile, isRaceGoal } from '../../lib/planner/goals';
import { restOf, routineMinutes } from '../../lib/strengthPlan';
import type { PaceZone } from '../../lib/types';
import type { StepApi } from './api';
import { SourceBadge } from './kit';
import type { SetupStep } from '../../lib/onboarding/draft';
import type { OnboardingAnswers } from '../../lib/types';
import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { raceKeyOf } from './GoalScreens';
import { GoalReality } from './GoalReality';
import { AnswersOverview } from './Overview';

const PHASE_COLOR = { base: 'bg-emerald-400', build: 'bg-sky-500', peak: 'bg-brand', taper: 'bg-violet-400' } as const;
const PACE_ZONES: PaceZone[] = ['easy', 'long', 'marathon', 'threshold', 'interval'];
const STAGES: MsgKey[] = ['preview.stage.1', 'preview.stage.2', 'preview.stage.3', 'preview.stage.4'];

function Section({ icon, title, edit, onEdit, children, id }: { icon: ReactNode; title: ReactNode; edit: string; onEdit?: () => void; children: ReactNode; id: string }) {
  return (
    <Card className="!p-5" >
      <div className="mb-4 flex items-center justify-between gap-3" data-section={id}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">{icon}{title}</h2>
        {onEdit && <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit} aria-label={`${edit}: ${typeof title === 'string' ? title : id}`}>{edit}</Button>}
      </div>
      {children}
    </Card>
  );
}

/** The plan is "generated": a short staged animation, then the preview. */
function Generating({ stage }: { stage: number }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center" role="status" aria-live="polite" data-testid="generating">
      <Loader2 className="h-10 w-10 animate-spin text-brand" />
      <div className="text-lg font-semibold text-slate-900">{t('preview.generating')}</div>
      <ol className="w-full max-w-xs space-y-2 text-left text-sm">
        {STAGES.map((k, i) => (
          <li key={k} className={cx('flex items-center gap-2 transition-opacity', i <= stage ? 'opacity-100' : 'opacity-30')}>
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold', i < stage ? 'bg-emerald-500 text-white' : i === stage ? 'bg-brand text-white' : 'bg-slate-200 text-slate-500')}>{i < stage ? '✓' : i + 1}</span>
            {t(k)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface PreviewProps {
  s: StepApi;
  busy: boolean;
  editing: boolean;
  hasPlan: boolean;
  /** Strength is being added to the running plan that is already there. */
  addStrength?: boolean;
  onStart: (answers: OnboardingAnswers, prefs: StrengthPrefs | undefined, plan: GeneratedPlan) => void;
}

/** The last page: the generated plan, explained, with a way back to every answer. */
export function PreviewStep({ s, busy, editing, hasPlan, addStrength = false, onStart }: PreviewProps) {
  const { t, lang } = useI18n();
  const { activities, metrics, connection, today, plan: stored, workouts: storedWorkouts } = useData();
  const [stage, setStage] = useState(0);
  const [ready, setReady] = useState(false);
  const garminOn = s.setup.garmin === 'connected';
  // The plan screens: the week with the strength sessions, or just the runs when there is no strength share.
  const planScreen = s.setup.runPct < 100 ? ('strengthPlan' as const) : ('runPlan' as const);

  // What goes into the plan (and into the database when it is started).
  const built = useMemo(() => {
    try {
      const { answers, prefs } = finalize(s.a, s.strength, today);
      const assessment = assessFitness({ answers, activities: garminOn ? activities : [], metrics: garminOn ? metrics : [], garmin: garminOn ? (connection?.profile ?? null) : null, today });
      // Strength added to a running plan that is kept: what is shown is the plan from the database with only the new strength
      // sessions in it, placed around its runs (the same sessions "Add strength" saves).
      const kept = addStrength && stored ? keptWeekFor(answers, storedWorkouts, today) : null;
      const plan = addStrength && stored
        ? keepRunPlan(stored, storedWorkouts, kept ? keptStrengthSessions(stored, storedWorkouts, answers, prefs?.routines, kept.week, today) : [], today)
        : buildPlan(answers, assessment, today, prefs?.routines);
      return { ok: true as const, answers, prefs, assessment, plan };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([s.a, s.strength]), activities, metrics, connection, garminOn, today, addStrength, stored, storedWorkouts]);

  useEffect(() => {
    setReady(false);
    setStage(0);
    const timers = [500, 1000, 1500].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    const done = setTimeout(() => setReady(true), 2000);
    return () => [...timers, done].forEach(clearTimeout);
  }, []);

  if (!ready) return <Generating stage={stage} />;
  if (!built.ok) {
    return (
      <div className="space-y-4">
        <Notice tone="error">{t('preview.error', { message: built.error })}</Notice>
        <Button variant="secondary" onClick={() => s.goTo(planScreen)}>{t('nav.back')}</Button>
      </div>
    );
  }

  const { answers, prefs, assessment, plan } = built;
  const goalKind = answers.goal ?? 'marathon';
  const profile = goalProfile(goalKind, answers.raceDistanceM);
  const race = isRaceGoal(goalKind);
  const f = plan.fitness;
  const units = s.units;
  const peak = Math.max(...plan.weeks.map((w) => w.targetKm));
  const longest = Math.max(...plan.weeks.map((w) => w.longKm));
  const first = addStrength ? currentWeek(plan.weeks, today) : plan.weeks[0];
  const week1 = plan.workouts.filter((w) => w.week === first.week);
  const runs = plan.workouts.filter((w) => w.distance_km).length;
  const explain = explainPlan({ answers, plan, units, today });
  const check = checkGoal(answers, assessment, today);
  const informed = !assessment.vdotSource.startsWith('a typical');
  // How much more the first planned week asks than the person runs now (the usual rule of thumb is at most 10 %).
  const currentKm = answers.currentWeeklyKm;
  const jump = !addStrength && currentKm > 0 && first.targetKm > currentKm * 1.1 + 0.5 ? Math.round((first.targetKm / currentKm - 1) * 100) : null;
  const edit = (step: SetupStep) => () => s.goTo(step);
  const max = answers.maxHr;
  const zones = max ? hrZones({ maxHr: max, restingHr: answers.setup!.restingHr, garminFloors: garminOn && answers.setup!.hrSource.max === 'garmin' ? (connection?.profile?.zones ?? null) : null }) : null;
  const sync = answers.setup!.hrSyncedAt ? dateText(answers.setup!.hrSyncedAt, lang) : null;
  const setup = answers.setup!;
  const goalName = race ? t(`race.${raceKeyOf(profile.distanceM)}` as MsgKey) : t(`goal.${goalKind}` as MsgKey);

  return (
    <div className="space-y-4" data-testid="preview">
      <Notice tone="success">
        <div className="font-semibold">{setup.name.trim() ? t('preview.ready.named', { name: setup.name.trim() }) : t('preview.ready')}</div>
        <div className="mt-0.5">{addStrength ? t('preview.addStrength.ready') : t('preview.ready.text')}</div>
      </Notice>

      <Section id="goal" icon={<Target className="h-5 w-5 text-brand" />} title={t('preview.goal')} edit={t('nav.edit')} onEdit={addStrength ? undefined : edit('goal')}>
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{goalName}</span>
          {race && !answers.planWeeks ? ` · ${dateLong(answers.raceDate, lang)}` : ` · ${t('goal.weeks', { n: plan.weeks.length })}`}
          {answers.goalType === 'time' && answers.goalTimeS ? ` · ${t('preview.target', { time: fmtDuration(answers.goalTimeS) })}` : ''}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-700" data-testid="explain">
          {explain.map((x, i) => (
            <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /><span>{t(x.key as MsgKey, x.params)}</span></li>
          ))}
        </ul>
        {plan.warnings.map((w) => <Notice key={w} tone="warn" className="mt-3">{localMessage(w)}</Notice>)}
        {parqFlagged(setup.parq) && <Notice tone="warn" className="mt-3">{t('ob.overview.parq')}</Notice>}
        {jump !== null && <Notice tone="warn" className="mt-3">{t('ob.overview.jump', { pct: jump })}</Notice>}
        {race && answers.goalType === 'time' && answers.goalTimeS && check && informed && (
          <div className="mt-3">
            <GoalReality check={check} goalTimeS={answers.goalTimeS} units={units} distanceText={t(`race.${raceKeyOf(profile.distanceM)}` as MsgKey)} onAdopt={(timeS) => s.update((x) => ({ ...x, goalType: 'time', goalTimeS: timeS }))} />
          </div>
        )}
        <p className="mt-3 text-sm text-slate-700" data-testid="sessions">{t('ob.overview.sessions', { runs: answers.runDaysPerWeek, strength: s.strength.perWeek ?? 0 })}</p>
        <p className="text-xs text-slate-500">{t('ob.overview.recommended', { runs: runsRecommendation(goalKind, answers.level)[1], strength: strengthRecommendation(goalKind)[0] })}</p>
        {race && setup.timeUnknown && <p className="mt-1 text-sm font-medium text-slate-800">{t('ob.overview.target', { time: fmtDuration(f.predictedMarathonS) })}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5"><dt className="text-slate-500">{t('preview.weeks')}</dt><dd className="text-lg font-semibold">{plan.weeks.length}</dd></div>
          <div className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5"><dt className="text-slate-500">{t('preview.peak')}</dt><dd className="text-lg font-semibold">{fmtDistance(peak, units, 0)}</dd></div>
          <div className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5"><dt className="text-slate-500">{t('preview.longest')}</dt><dd className="text-lg font-semibold">{fmtDistance(longest, units, 0)}</dd></div>
          <div className="rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2.5"><dt className="text-slate-500">{t('preview.sessions')}</dt><dd className="text-lg font-semibold">{runs} {t('preview.runs')}</dd></div>
        </dl>

        <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">{t('preview.phases')}</h3>
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={t('preview.phases')}>
          {plan.weeks.map((w) => (
            <div key={w.week} className={cx(PHASE_COLOR[w.phase], 'flex-1 border-r border-white last:border-0', w.recovery && 'opacity-50')} title={`${t('preview.week', { n: w.week })}: ${t(`phase.${w.phase}` as MsgKey)}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {(['base', 'build', 'peak', 'taper'] as const).filter((p) => plan.weeks.some((w) => w.phase === p)).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', PHASE_COLOR[p])} />{t(`phase.${p}` as MsgKey)} ({plan.weeks.filter((w) => w.phase === p).length})</span>
          ))}
        </div>

        <h3 className="mb-1 mt-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><BarChart3 className="h-3.5 w-3.5" />{t('preview.volume')}</h3>
        <VolumeChart
          units={units}
          data={plan.weeks.map((w) => ({ label: `${w.week}`, sublabel: dateText(w.startDate, lang), plannedKm: w.targetKm, actualKm: null, current: w.week === first.week }))}
        />
      </Section>

      <Section id="week" icon={<CalendarDays className="h-5 w-5 text-brand" />} title={addStrength ? t('preview.addStrength.week') : t('preview.firstWeek')} edit={t('nav.edit')} onEdit={edit(planScreen)}>
        <ul className="divide-y divide-slate-100 text-sm">
          {week1.map((w) => (
            <li key={`${w.date}-${w.title}`} className="flex items-center justify-between gap-3 py-2">
              <span className="w-24 shrink-0 text-slate-500">{dateText(w.date, lang)}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{localTitle(w.title)}</span>
              <span className="shrink-0 tabular-nums text-slate-600">{w.distance_km ? fmtDistance(w.distance_km, units) : w.duration_min ? fmtMinutes(w.duration_min) : ''}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="numbers" icon={<HeartPulse className="h-5 w-5 text-brand" />} title={t('preview.numbers')} edit={t('nav.edit')} onEdit={addStrength ? undefined : edit('runExperience')}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('preview.hrZones')}{zones && <span className="font-normal normal-case text-slate-400">· {t(`zones.${zones.method}` as MsgKey)}</span>}</h3>
            {zones ? (
              <ul className="space-y-2 text-sm">
                {zones.zones.map((z) => (
                  <li key={z.zone} className="flex justify-between rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2"><span className="text-slate-600">{t(`zone.${z.zone}` as MsgKey)}</span><span className="font-medium tabular-nums">{z.from}–{z.to}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">{t('preview.noHr')}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {setup.restingHr ? <span className="inline-flex items-center gap-1">{t('running.resting')}: <b className="text-slate-800">{setup.restingHr}</b><SourceBadge source={setup.hrSource.rest} when={setup.hrSource.rest === 'garmin' ? sync : null} /></span> : null}
              {max ? <span className="inline-flex items-center gap-1">{t('running.max')}: <b className="text-slate-800">{max}</b><SourceBadge source={setup.hrSource.max} when={setup.hrSource.max === 'garmin' ? sync : null} /></span> : null}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('preview.paceZones')}</h3>
            <ul className="space-y-2 text-sm">
              {PACE_ZONES.filter((z) => race || z !== 'marathon').map((z) => (
                <li key={z} className="flex justify-between rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-2"><span className="text-slate-600">{t(`pace.${z}` as MsgKey)}</span><span className="font-medium tabular-nums">{zonePaceText(f.paces, z, units)}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{t('preview.vdot', { vdot: fmtNum(assessment.vdot), source: sourceText(assessment.vdotSource, lang) })}</p>
            {garminOn && <div className="mt-1"><SourceBadge source="garmin" when={sync} /></div>}
          </div>
        </div>
        {race && (
          <p className="mt-4 text-sm text-slate-700">{t('preview.projection', { time: fmtDuration(f.predictedMarathonS) })}</p>
        )}
      </Section>

      {prefs && (
        <Section id="strength" icon={<Dumbbell className="h-5 w-5 text-brand" />} title={t('preview.strength')} edit={t('nav.edit')} onEdit={edit('strengthPlan')}>
          <div className="space-y-2">
            {distinctWorkouts(s.strength.perWeek, caliOf(s.a.extras)).map(({ kind, times }, i) => {
              const r = prefs.routines.find((x) => x.id === kind);
              if (!r) return null;
              return (
                <details key={kind} className="group rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{r.name ?? `${t('workouts.strength')} ${'ABCD'[i]} – ${t(`kind.${kind}` as MsgKey)}`}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-slate-500 group-open:hidden">{r.exercises.map((x) => exName(x.name)).join(' · ')}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">{t('workouts.duration', { min: routineMinutes(r) })}{times > 1 ? ` · ${t('workouts.times', { n: times })}` : ''}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></span>
                  </summary>
                  <ol className="divide-y divide-slate-100 px-4 pb-2 text-sm">
                    {r.exercises.map((x, j) => (
                      <li key={`${x.name}-${j}`} className="flex items-center gap-3 py-1.5">
                        <ExerciseThumb exercise={x} className="hidden sm:block" />
                        <span className="min-w-0 flex-1 text-slate-800">{exName(x.name)}{x.note ? <span className="text-xs text-slate-400"> · {localNote(x.note)}</span> : null}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">{x.sets}×{repsLabel(x.reps)}{x.kg ? ` · ${prefs.weightUnit === 'lb' ? Math.round(kgToLb(x.kg)) : fmtNum(x.kg, 2)} ${prefs.weightUnit}` : ''} · {restOf(x)} s</span>
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
        </Section>
      )}

      <AnswersOverview s={s} answers={answers} strength={prefs ?? s.strength} />

      <Card className="!p-5">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900"><Watch className="h-5 w-5 text-brand" />{t('preview.watch')}</h2>
        <p className="text-sm text-slate-600">{t('preview.watch.text')}</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>{t('preview.watch.1')}</li>
          <li>{t('preview.watch.2')}</li>
          <li>{t('preview.watch.3')}</li>
          <li>{t('preview.watch.4')}</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled icon={<Send className="h-4 w-4" />}>{t('preview.sendGarmin')}</Button>
          <Badge tone="violet">{t('goal.soon')}</Badge>
          <span className="text-xs text-slate-500">{t('preview.sendGarmin.text')}</span>
        </div>
      </Card>

      {hasPlan && (addStrength ? <Notice tone="info">{t('preview.addStrength.note')}</Notice> : <Notice tone="warn">{t('preview.replace')}</Notice>)}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" size="lg" onClick={() => s.goTo(planScreen)}>{t('preview.adjust')}</Button>
        <Button size="lg" loading={busy} icon={<Rocket className="h-5 w-5" />} onClick={() => onStart(answers, prefs, plan)}>
          {addStrength ? t('preview.addStrength.start') : hasPlan ? t('preview.replaceStart') : editing ? t('preview.save') : t('preview.start')}
        </Button>
      </div>
    </div>
  );
}
