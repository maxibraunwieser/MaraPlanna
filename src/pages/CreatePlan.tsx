import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Gauge, Sparkles, Watch } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { createPlan } from '../lib/api';
import { assessFitness } from '../lib/planner/fitness';
import { buildPlan } from '../lib/planner/generate';
import { fmtDate, fmtDistance, fmtDuration, zonePaceText } from '../lib/format';
import type { PaceZone } from '../lib/types';
import { Button, Card, CardTitle, Notice, PageHeader, Spinner, useToast } from '../components/ui';

const PHASE_COLOR = { base: 'bg-emerald-400', build: 'bg-sky-500', peak: 'bg-brand', taper: 'bg-violet-400' };

export function CreatePlan() {
  const { user } = useAuth();
  const { profile, activities, metrics, connection, plan, today, reload } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const answers = profile?.onboarding;
  const units = profile?.units ?? 'km';

  const preview = useMemo(() => {
    if (!answers) return null;
    const assessment = assessFitness({ answers, activities, metrics, garmin: connection?.profile ?? null, today });
    return { assessment, generated: buildPlan(answers, assessment, today) };
  }, [answers, activities, metrics, connection, today]);

  if (!answers || !preview) return <Spinner label="Loading your answers…" />;
  const { assessment, generated } = preview;
  const f = generated.fitness;
  const runs = generated.workouts.filter((w) => w.distance_km);
  const strengthCount = generated.workouts.filter((w) => w.kind.startsWith('strength')).length;

  const create = async () => {
    setBusy(true);
    try {
      await createPlan(user!.id, answers, generated, today);
      await reload();
      toast('Your plan is ready. Let’s go!', 'success');
      navigate('/');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const zones: [PaceZone, string][] = [
    ['easy', 'Easy'],
    ['long', 'Long run'],
    ['marathon', 'Marathon pace'],
    ['threshold', 'Threshold'],
    ['interval', 'Intervals'],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={plan ? 'Rebuild your plan' : 'Your marathon plan'}
        subtitle={`${answers.raceName || 'Marathon'} · ${fmtDate(answers.raceDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />
      {params.get('updated') === '1' && <Notice tone="success" className="mb-4">Answers saved. Review the new plan below and create it to apply your changes.</Notice>}
      {plan && <Notice tone="warn" className="mb-4">Creating a new plan replaces your current one from today on. Your past activities are kept.</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle icon={<Gauge className="h-5 w-5 text-brand" />}>Where you are now</CardTitle>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Fitness (VDOT)</dt>
              <dd className="font-semibold">{assessment.vdot.toFixed(1)}</dd>
            </div>
            <p className="-mt-2 text-xs text-slate-500">Based on {assessment.vdotSource}.</p>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Weekly volume</dt>
              <dd className="font-semibold">
                {fmtDistance(assessment.weeklyKm, units)} <span className="font-normal text-slate-400">({assessment.weeklyKmSource === 'garmin' ? 'Garmin, last 4 weeks' : 'your answer'})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Longest recent run</dt>
              <dd className="font-semibold">{fmtDistance(assessment.longestRunKm, units)}</dd>
            </div>
            {assessment.restingHr && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Resting heart rate</dt>
                <dd className="font-semibold">{assessment.restingHr} bpm</dd>
              </div>
            )}
          </dl>
          {!connection && (
            <Notice tone="info" className="mt-4">
              <span className="inline-flex items-center gap-1"><Watch className="h-4 w-4" /> Connect Garmin</span> for a plan tuned to your real runs.
            </Notice>
          )}
        </Card>

        <Card>
          <CardTitle icon={<Sparkles className="h-5 w-5 text-brand" />}>Race day projection</CardTitle>
          <div className="text-3xl font-bold tracking-tight">{fmtDuration(f.predictedMarathonS)}</div>
          <p className="text-sm text-slate-500">projected finish if training goes to plan</p>
          {answers.goalType === 'time' && answers.goalTimeS && (
            <p className="mt-3 text-sm">
              Goal <b>{fmtDuration(answers.goalTimeS)}</b> –{' '}
              {f.goalAssessment === 'realistic' ? (
                <span className="font-semibold text-emerald-700">realistic</span>
              ) : f.goalAssessment === 'ambitious' ? (
                <span className="font-semibold text-amber-700">ambitious</span>
              ) : (
                <span className="font-semibold text-red-700">very ambitious</span>
              )}
            </p>
          )}
          <div className="mt-4 space-y-1.5 text-sm">
            {zones.map(([z, label]) => (
              <div key={z} className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium tabular-nums">{zonePaceText(f.paces, z, units)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Plan overview</CardTitle>
        <div className="flex h-3 overflow-hidden rounded-full">
          {generated.weeks.map((w) => (
            <div key={w.week} className={`${PHASE_COLOR[w.phase]} flex-1 border-r border-white last:border-0 ${w.recovery ? 'opacity-50' : ''}`} title={`Week ${w.week}: ${w.phase}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          {(['base', 'build', 'peak', 'taper'] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 capitalize">
              <span className={`h-2.5 w-2.5 rounded-sm ${PHASE_COLOR[p]}`} /> {p} ({generated.weeks.filter((w) => w.phase === p).length} wk)
            </span>
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Weeks</dt>
            <dd className="text-lg font-semibold">{generated.weeks.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Peak week</dt>
            <dd className="text-lg font-semibold">{fmtDistance(Math.max(...generated.weeks.map((w) => w.targetKm)), units, 0)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Longest run</dt>
            <dd className="text-lg font-semibold">{fmtDistance(Math.max(...generated.weeks.map((w) => w.longKm)), units, 0)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sessions</dt>
            <dd className="text-lg font-semibold">
              {runs.length} runs{strengthCount ? ` + ${strengthCount} strength` : ''}
            </dd>
          </div>
        </dl>
        {generated.warnings.length > 0 && (
          <div className="mt-5 space-y-2">
            {generated.warnings.map((w) => (
              <Notice key={w} tone="warn">{w}</Notice>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/onboarding?edit=1')}>
          Change answers
        </Button>
        <Button size="lg" onClick={create} loading={busy}>
          {plan ? 'Replace my plan' : 'Create my plan'}
        </Button>
      </div>
    </div>
  );
}
