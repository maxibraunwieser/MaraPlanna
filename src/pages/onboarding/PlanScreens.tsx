// The two plan screens of the questionnaire: the running plan (after the running questions, before the strength questions) and
// the week with the strength sessions next to the runs. Each one first plays the steps the planner takes (the plan's own numbers,
// with the studies behind them), then shows the result: the weeks, the week to change by dragging, and the steps as the explanation.

import { useEffect, useMemo, useState } from 'react';
import { Clock, Dumbbell, Eye, Minus, Plus } from 'lucide-react';
import type { Routine } from '../../../supabase/functions/_shared/strength';
import { ExerciseThumb } from '../../components/strength/ExerciseImage';
import { RoutineEditor } from '../../components/strength/RoutineEditor';
import { VolumeChart } from '../../components/VolumeChart';
import { Button, Card, Modal, Notice } from '../../components/ui';
import { useData } from '../../lib/data';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { dateText, weekdayNames } from '../../lib/i18n/dates';
import { applyStrengthPlan, moveInWeek, moveRunDay, refresh, runOnlyWeek, setCaliWanted, setStrengthWanted, strengthPlanOf } from '../../lib/onboarding/apply';
import { finalize } from '../../lib/onboarding/finalize';
import { caliOf, distinctWorkouts, withStrengthSessions } from '../../lib/onboarding/strengthMap';
import { assessFitness } from '../../lib/planner/fitness';
import { buildPlan, timeLimits } from '../../lib/planner/generate';
import { fmtDistance } from '../../lib/format';
import { SOURCES, runBuildSteps, strengthBuildSteps, type BuildStep } from '../../lib/planner/rationale';
import { autoWeek, weekInputOf } from '../../lib/planner/week';
import { keptWeekFor, moveKeptStrength } from '../../lib/planner/keepRuns';
import { PATTERN_LABEL, catalogEntry, routineMinutes, setupOf, setupSignature, suggestRoutine, type StrengthType } from '../../lib/strengthPlan';
import { exName, rxText } from '../../lib/strengthFormat';
import type { OnboardingAnswers } from '../../lib/types';
import type { StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import type { StepApi } from './api';
import { BuildGate, BuildSteps, type BuildItem } from './PlanBuild';
import { WeekBoard } from './WeekBoard';

const LETTERS = 'ABCD';

/** The plan that these answers would give, with the fitness it starts from. `runsOnly` leaves the strength sessions out. */
function usePlanPreview(a: OnboardingAnswers, strength: StrengthPrefs, runsOnly = false) {
  const { activities, metrics, connection, today } = useData();
  const garminOn = a.setup?.garmin === 'connected';
  return useMemo(() => {
    try {
      const { answers, prefs } = finalize(a, runsOnly ? { ...strength, perWeek: 0 } : strength, today);
      const assessment = assessFitness({ answers, activities: garminOn ? activities : [], metrics: garminOn ? metrics : [], garmin: garminOn ? (connection?.profile ?? null) : null, today });
      return { today, answers, assessment, plan: buildPlan(answers, assessment, today, prefs?.routines) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([a, strength, runsOnly]), activities, metrics, connection, garminOn, today]);
}

/** A step of the plan in words (title, text and the studies behind it). */
function useItems() {
  const { t } = useI18n();
  return (steps: BuildStep[]): BuildItem[] =>
    steps.map((st) => ({
      id: st.id,
      title: t(`ob.build.${st.id}.t` as MsgKey),
      text: t(`ob.build.${st.id}.x` as MsgKey, st.params),
      sources: st.sources.map((k) => SOURCES[k]),
    }));
}

/** Block 8's last screen: the running plan, built from the days with time, the number of runs and the answers about running. */
export function RunPlanScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { a, setup } = s;
  const names = weekdayNames(lang, 'long');
  const { week } = runOnlyWeek(a);
  const preview = usePlanPreview(a, s.strength, true);
  const items = useItems();

  // A week that was drawn for other answers is planned again.
  useEffect(() => {
    if (a.scheduleMode === 'custom') s.updateAll(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The days carry fewer kilometres than the person runs now: say so, with what would help.
  const cap = preview ? timeLimits(preview.answers, preview.plan.fitness.vdot).weeklyKm : 0;
  const capped = preview && preview.assessment.weeklyKm > cap * 1.1 ? { cap, now: preview.assessment.weeklyKm, runs: preview.answers.runDaysPerWeek } : null;
  const steps = preview ? items(runBuildSteps({ today: preview.today, answers: preview.answers, plan: preview.plan, assessment: preview.assessment, units: a.units, names })) : [];
  const result = (
    <div className="space-y-5">
      <Notice tone="success"><span data-testid="build-result">{t('ob.build.result.run')}</span></Notice>
      {capped && <Notice tone="warn"><span data-testid="capacity-note">{t('ob.rp.capacity', { runs: capped.runs, cap: fmtDistance(capped.cap, a.units, 0), now: fmtDistance(capped.now, a.units, 0) })}</span></Notice>}
      {preview && (
        <Card className="!p-4" data-testid="plan-chart">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('preview.volume')}</h2>
          <VolumeChart units={a.units} plannedOnly data={preview.plan.weeks.map((w, i) => ({ label: `${w.week}`, sublabel: dateText(w.startDate, lang), plannedKm: w.targetKm, actualKm: null, current: i === 0 }))} />
        </Card>
      )}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('ob.rp.week')}</h2>
        <WeekBoard week={week} extras={a.extras} unavailable={setup.unavailableDays} minutes={setup.minutesPerDay} runsOnly onMove={(mv) => s.updateAll((m) => moveRunDay(m, mv.from, mv.to))} />
        <p className="mt-2 text-xs text-slate-500">{t('ob.board.hint')}</p>
      </div>
      {steps.length > 0 && <BuildSteps title={t('ob.build.why')} items={steps} />}
      <p className="text-xs text-slate-500">{t('ob.rp.e4')}</p>
    </div>
  );
  return steps.length > 0 ? <BuildGate kind="run" title={t('ob.build.title.run')} items={steps} result={result} /> : result;
}

const workoutName = (i: number, kind: string, word: string) => `${word} ${LETTERS[i] ?? i + 1} – ${kind}`;

/** What one strength workout contains; its exercises can be changed (and reordered by dragging). */
function WorkoutDialog({ s, kind, index, onClose }: { s: StepApi; kind: StrengthType | null; index: number; onClose: () => void }) {
  const { t } = useI18n();
  const { strength } = s;
  const [editing, setEditing] = useState(false);
  const routine = kind ? strength.routines.find((r) => r.id === kind) : undefined;
  const setup = setupOf(strength);
  const title = kind ? (routine?.name ?? workoutName(index, t(`kind.${kind}` as MsgKey), t('workouts.strength'))) : '';
  const put = (r: Routine) => s.updateStrength({ routines: strength.routines.some((x) => x.id === r.id) ? strength.routines.map((x) => (x.id === r.id ? r : x)) : [...strength.routines, r] });
  return (
    <Modal wide open={!!kind && !!routine} onClose={() => { setEditing(false); onClose(); }} title={title}>
      {kind && routine && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t('workouts.duration', { min: routineMinutes(routine) })}</span>
            <span>{t('workouts.count', { n: routine.exercises.length })}</span>
          </div>
          {editing ? (
            <RoutineEditor routine={routine} type={kind} setup={setup} unit={strength.weightUnit} onChange={put} />
          ) : (
            <ol className="divide-y divide-slate-100 text-sm" data-testid="workout-exercises">
              {routine.exercises.map((x, i) => {
                const entry = catalogEntry(x.key);
                return (
                  <li key={`${x.name}-${i}`} className="flex items-center gap-3 py-2">
                    <ExerciseThumb exercise={x} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{exName(x.name)}</span>
                      {entry && <span className="ml-2 text-xs text-slate-500">{PATTERN_LABEL[entry.pattern]}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">{rxText(x, strength.weightUnit)}</span>
                  </li>
                );
              })}
              {routine.exercises.length === 0 && <li className="py-3 text-slate-500">{t('ob.wd.empty')}</li>}
            </ol>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? t('ob.wd.view') : t('ob.wd.edit')}</Button>
            <Button onClick={() => { setEditing(false); onClose(); }}>{t('ob.wd.done')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Block 9's last screen: the strength sessions placed next to the runs, with the number to choose, the steps behind it and the workouts. */
export function StrengthPlanScreen({ s }: { s: StepApi }) {
  const { t, lang } = useI18n();
  const { a, setup, strength } = s;
  const { workouts: stored, today } = useData();
  const names = weekdayNames(lang, 'long');
  const [open, setOpen] = useState<StrengthType | null>(null);
  const preview = usePlanPreview(a, strength);
  const items = useItems();

  // The strength questions are answered: plan the sessions once.
  useEffect(() => {
    if (strength.perWeek === null) s.updateAll(applyStrengthPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every workout exists: a missing one gets the suggestion, a suggestion made for other answers is made again, own ones stay.
  const cali = Math.min(caliOf(a.extras), strength.perWeek ?? 0);
  const list = distinctWorkouts(strength.perWeek, cali);
  const kinds = list.map((x) => x.kind);
  const signature = setupSignature(setupOf(strength));
  const stale = kinds.some((k) => {
    const r = strength.routines.find((x) => x.id === k);
    return !r || (r.by === 'suggested' && r.basis !== signature);
  });
  useEffect(() => {
    if (!stale) return;
    const now = new Date().toISOString();
    s.updateStrength({
      routines: [
        ...strength.routines.filter((r) => !kinds.includes(r.id as StrengthType)),
        ...kinds.map((k) => {
          const r = strength.routines.find((x) => x.id === k);
          return r && (r.by === 'own' || r.basis === signature) ? r : suggestRoutine(k, setupOf(strength), now);
        }),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  const custom = a.scheduleMode === 'custom' && !!a.customWeek;
  const n = strength.perWeek ?? 0;
  // A running plan that is kept: its usual week from the database, with the strength days around its runs.
  const kept = s.keepRuns ? keptWeekFor(a, stored, today, withStrengthSessions(a.extras, n)) : null;
  const auto = custom || kept ? null : autoWeek(weekInputOf(a, withStrengthSessions(a.extras, n)));
  const week = kept ? kept.week : custom ? a.customWeek! : auto!.week;
  const unplaced = kept ? kept.unplaced : (auto?.solution.unplaced ?? 0);
  const plan = strengthPlanOf(a);
  const chosen = setup.strengthWanted !== null;
  const kindOf = (id: string) => (['lower', 'upper', 'full', 'cali'].includes(id) ? (id as StrengthType) : null);

  const steps = preview
    ? items(
        strengthBuildSteps({
          today: preview.today,
          // Kept: the explanation describes the week of the stored plan, not a new one.
          answers: kept ? { ...preview.answers, scheduleMode: 'custom' as const, customWeek: kept.week } : preview.answers,
          plan: preview.plan,
          assessment: preview.assessment,
          units: a.units,
          names,
          facts: { count: n, recommended: plan.recommended, desired: plan.desired, now: setup.strengthNow ?? 0, chosen, limitedBy: plan.limitedBy, minutes: strength.minutes },
          kindNames: { lower: t('kind.lower'), upper: t('kind.upper'), full: t('kind.full'), cali: t('kind.cali') },
          whyNames: { hardDay: t('ob.why.hardDay'), easyDay: t('ob.why.easyDay'), rest: t('ob.why.rest') },
        }),
      )
    : [];

  const stepper = (
    <Card className="!p-4" data-testid="strength-stepper">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{t('ob.sp.count.label')}</div>
          <div className="text-xs text-slate-500">{t('ob.sp.count.hint')}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('ob.sp.count.less')} disabled={n <= 0} onClick={() => s.updateAll((m) => setStrengthWanted(m, Math.max(0, n - 1)))} className="rounded-full bg-white p-2 ring-1 ring-slate-300 hover:ring-slate-400 disabled:opacity-30">
            <Minus className="h-4 w-4" />
          </button>
          <span data-testid="strength-count" className="w-8 text-center text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{n}</span>
          <button type="button" aria-label={t('ob.sp.count.more')} disabled={n >= plan.max} onClick={() => s.updateAll((m) => setStrengthWanted(m, Math.min(plan.max, n + 1)))} className="rounded-full bg-white p-2 ring-1 ring-slate-300 hover:ring-slate-400 disabled:opacity-30">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {n > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{t('ob.sp.cali.label')}</div>
            <div className="text-xs text-slate-500">{t('ob.sp.cali.hint')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t('ob.sp.cali.less')} disabled={cali <= 0} onClick={() => s.updateAll((m) => setCaliWanted(m, cali - 1))} className="rounded-full bg-white p-2 ring-1 ring-slate-300 hover:ring-slate-400 disabled:opacity-30">
              <Minus className="h-4 w-4" />
            </button>
            <span data-testid="cali-count" className="w-8 text-center text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{cali}</span>
            <button type="button" aria-label={t('ob.sp.cali.more')} disabled={cali >= n} onClick={() => s.updateAll((m) => setCaliWanted(m, cali + 1))} className="rounded-full bg-white p-2 ring-1 ring-slate-300 hover:ring-slate-400 disabled:opacity-30">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{t('ob.sp.count.rec', { n: plan.recommended })}</span>
        <span>{t('ob.sp.count.max', { n: plan.max })}</span>
        {chosen && (
          <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => s.updateAll((m) => setStrengthWanted(m, null))}>{t('ob.sp.count.use')}</button>
        )}
      </div>
    </Card>
  );

  const result = (
    <div className="space-y-5">
      <Notice tone="success"><span data-testid="build-result">{t('ob.build.result.str')}</span></Notice>
      {stepper}
      {plan.max === 0 && <Notice tone="warn">{t('ob.sp.none')}</Notice>}
      {!chosen && plan.limitedBy === 'now' && <Notice tone="info">{t('ob.sp.limit.now', { now: setup.strengthNow ?? 0, n: plan.recommended })}</Notice>}
      {!chosen && plan.limitedBy === 'days' && <Notice tone="info">{t('ob.sp.limit.days', { want: plan.desired, n: plan.recommended })}</Notice>}
      {kept && <Notice tone="info">{t('ob.sp.kept')}</Notice>}
      {unplaced > 0 && <Notice tone="warn">{t('ob.sp.count.short', { missing: unplaced })}</Notice>}

      <WeekBoard
        week={week}
        extras={a.extras}
        unavailable={setup.unavailableDays}
        minutes={setup.minutesPerDay}
        onMove={(mv) =>
          kept
            ? mv.item === 'strength' && s.updateSetup({ keptWeek: moveKeptStrength(kept.week, mv.from, mv.to, setup.unavailableDays) })
            : s.updateAll((m) => moveInWeek(m, mv.item, mv.from, mv.to))
        }
        lockRuns={!!kept}
        onOpen={(id) => setOpen(kindOf(id))}
      />
      <p className="text-xs text-slate-500">{t('ob.board.hint')}</p>

      {list.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('ob.sp.workouts')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map(({ kind, times }, i) => {
              const r = strength.routines.find((x) => x.id === kind);
              return (
                <Card key={kind} className="!p-4" data-testid={`workout-${kind}`}>
                  <div className="flex items-center gap-2"><Dumbbell className="h-4 w-4 shrink-0 text-brand" /><span className="font-semibold text-slate-900">{r?.name ?? workoutName(i, t(`kind.${kind}` as MsgKey), t('workouts.strength'))}</span></div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r ? `${t('workouts.duration', { min: routineMinutes(r) })} · ${t('workouts.count', { n: r.exercises.length })}` : ''}{times > 1 ? ` · ${t('workouts.times', { n: times })}` : ''}
                  </div>
                  <Button size="sm" variant="secondary" className="mt-3" icon={<Eye className="h-4 w-4" />} onClick={() => setOpen(kind)}>{t('ob.sp.view')}</Button>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {steps.length > 0 && <BuildSteps title={t('ob.build.why')} items={steps} />}
      <p className="text-xs text-slate-500">{t('ob.sp.e.adjust')}</p>
      <WorkoutDialog s={s} kind={open} index={Math.max(0, kinds.indexOf(open as StrengthType))} onClose={() => setOpen(null)} />
    </div>
  );
  return steps.length > 0 && strength.perWeek !== null ? <BuildGate kind="str" title={t('ob.build.title.str')} items={steps} result={result} /> : result;
}
