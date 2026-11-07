import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Gauge, Sparkles, Watch } from 'lucide-react';
import { SOURCES, type SourceKey } from '../lib/evidence';
import { normalizePrefs } from '../../supabase/functions/_shared/strength';
import { distanceName, sourceText } from '../../supabase/functions/_shared/content';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { createPlan } from '../lib/api';
import { assessFitness } from '../lib/planner/fitness';
import { buildPlan } from '../lib/planner/generate';
import { distanceLabel } from '../lib/planner/goals';
import { fmtDate, fmtDistance, fmtDuration, fmtNum, localMessage, zonePaceText } from '../lib/format';
import { useI18n, type MsgKey } from '../lib/i18n';
import type { PaceZone } from '../lib/types';
import { Button, Card, CardTitle, Notice, PageHeader, Spinner, useToast } from '../components/ui';

const PHASE_COLOR = { base: 'bg-emerald-400', build: 'bg-sky-500', peak: 'bg-brand', taper: 'bg-violet-400' };

export function CreatePlan() {
  const { user } = useAuth();
  const { profile, activities, metrics, connection, plan, today, reload } = useData();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const answers = profile?.onboarding;
  const units = profile?.units ?? 'km';

  const preview = useMemo(() => {
    if (!answers) return null;
    const assessment = assessFitness({ answers, activities, metrics, garmin: connection?.profile ?? null, today });
    return { assessment, generated: buildPlan(answers, assessment, today, normalizePrefs(profile?.strength).routines) };
  }, [answers, activities, metrics, connection, today, profile?.strength]);

  if (!answers || !preview) return <Spinner label={t('cp.loading')} />;
  const { assessment, generated } = preview;
  const f = generated.fitness;
  const hasRace = f.raceDistanceM !== null;
  const runs = generated.workouts.filter((w) => w.distance_km);
  const strengthCount = generated.workouts.filter((w) => !w.distance_km && w.kind !== 'race').length;
  const longest = Math.max(...generated.weeks.map((w) => w.longKm));
  const bigRuns = generated.weeks.filter((w) => w.longKm >= longest - 2).length;
  const peakWeek = Math.max(...generated.weeks.map((w) => w.targetKm));
  const evidence: { key: string; title: string; text: string; source: SourceKey }[] = [
    { key: 'long', title: t('cp.e.long.title', { d: fmtDistance(longest, units, 0) }), text: t('cp.e.long.text', { n: bigRuns }), source: 'fokkema' },
    { key: 'peak', title: t('cp.e.peak.title', { d: fmtDistance(peakWeek, units, 0) }), text: t('cp.e.peak.text'), source: 'doherty' },
    { key: 'easy', title: t('cp.e.easy.title'), text: t('cp.e.easy.text'), source: 'casado' },
    ...(hasRace ? [{ key: 'taper', title: t('cp.e.taper.title'), text: t('cp.e.taper.text'), source: 'taper' as SourceKey }] : []),
    ...(strengthCount ? [{ key: 'strength', title: t('cp.e.strength.title'), text: t('cp.e.strength.text'), source: 'strength' as SourceKey }] : []),
  ];

  const create = async () => {
    setBusy(true);
    try {
      await createPlan(user!.id, answers, generated, today);
      await reload();
      toast(t('cp.ready'), 'success');
      navigate('/');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const zones: PaceZone[] = hasRace ? ['easy', 'long', 'marathon', 'threshold', 'interval'] : ['easy', 'long', 'threshold', 'interval'];
  const title = answers.raceName || (hasRace ? distanceName(distanceLabel(f.raceDistanceM ?? 42_195), lang) : t('cp.title.new'));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={plan ? t('cp.title.rebuild') : t('cp.title.new')}
        subtitle={`${title} · ${fmtDate(answers.raceDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />
      {params.get('updated') === '1' && <Notice tone="success" className="mb-4">{t('cp.updated')}</Notice>}
      {plan && <Notice tone="warn" className="mb-4">{t('cp.replaceWarn')}</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle icon={<Gauge className="h-5 w-5 text-brand" />}>{t('cp.now')}</CardTitle>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('cp.vdot')}</dt>
              <dd className="font-semibold">{fmtNum(assessment.vdot)}</dd>
            </div>
            <p className="-mt-2 text-xs text-slate-500">{t('cp.basedOn', { source: sourceText(assessment.vdotSource, lang) })}</p>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('cp.volume')}</dt>
              <dd className="font-semibold">
                {fmtDistance(assessment.weeklyKm, units)} <span className="font-normal text-slate-400">({assessment.weeklyKmSource === 'garmin' ? t('cp.volume.garmin') : t('cp.volume.answers')})</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('cp.longest')}</dt>
              <dd className="font-semibold">{fmtDistance(assessment.longestRunKm, units)}</dd>
            </div>
            {assessment.restingHr && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('cp.resting')}</dt>
                <dd className="font-semibold">{assessment.restingHr} bpm</dd>
              </div>
            )}
          </dl>
          {!connection && (
            <Notice tone="info" className="mt-4">
              <span className="inline-flex items-center gap-1"><Watch className="h-4 w-4" /> {t('cp.connectPre')}</span>{t('cp.connectPost')}
            </Notice>
          )}
        </Card>

        {hasRace && (
          <Card>
            <CardTitle icon={<Sparkles className="h-5 w-5 text-brand" />}>{t('cp.projection')}</CardTitle>
            <div className="text-3xl font-bold tracking-tight">{fmtDuration(f.predictedMarathonS)}</div>
            <p className="text-sm text-slate-500">{t('cp.projected')}</p>
            {answers.goalType === 'time' && answers.goalTimeS && (
              <p className="mt-3 text-sm">
                {t('cp.goalLine')} <b>{fmtDuration(answers.goalTimeS)}</b> –{' '}
                {f.goalAssessment !== 'none' && (
                  <span className={f.goalAssessment === 'realistic' ? 'font-semibold text-emerald-700' : f.goalAssessment === 'ambitious' ? 'font-semibold text-amber-700' : 'font-semibold text-red-700'}>
                    {t(`cp.verdict.${f.goalAssessment}` as MsgKey)}
                  </span>
                )}
              </p>
            )}
            <div className="mt-4 space-y-1.5 text-sm">
              {zones.map((z) => (
                <div key={z} className="flex justify-between">
                  <span className="text-slate-500">{t(`cp.zone.${z}` as MsgKey)}</span>
                  <span className="font-medium tabular-nums">{zonePaceText(f.paces, z, units)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card className="mt-4">
        <CardTitle>{t('cp.overview')}</CardTitle>
        <div className="flex h-3 overflow-hidden rounded-full">
          {generated.weeks.map((w) => (
            <div key={w.week} className={`${PHASE_COLOR[w.phase]} flex-1 border-r border-white last:border-0 ${w.recovery ? 'opacity-50' : ''}`} title={`${t('common.week', { n: w.week })}: ${t(`phase.${w.phase}` as MsgKey)}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          {(['base', 'build', 'peak', 'taper'] as const).filter((p) => generated.weeks.some((w) => w.phase === p)).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${PHASE_COLOR[p]}`} /> {t(`phase.${p}` as MsgKey)} ({generated.weeks.filter((w) => w.phase === p).length})
            </span>
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">{t('cp.weeks')}</dt>
            <dd className="text-lg font-semibold">{generated.weeks.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('cp.peak')}</dt>
            <dd className="text-lg font-semibold">{fmtDistance(peakWeek, units, 0)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('cp.longestRun')}</dt>
            <dd className="text-lg font-semibold">{fmtDistance(longest, units, 0)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('cp.sessions')}</dt>
            <dd className="text-lg font-semibold">{strengthCount ? t('cp.runsOther', { n: runs.length, m: strengthCount }) : t('cp.runs', { n: runs.length })}</dd>
          </div>
        </dl>
        {generated.warnings.length > 0 && (
          <div className="mt-5 space-y-2">
            {generated.warnings.map((w) => (
              <Notice key={w} tone="warn">{localMessage(w)}</Notice>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle icon={<BookOpen className="h-5 w-5 text-brand" />}>{t('cp.why')}</CardTitle>
        <ul className="grid gap-4 sm:grid-cols-2">
          {evidence.map((e) => (
            <li key={e.key} className="text-sm">
              <div className="font-semibold text-slate-900">{e.title}</div>
              <p className="mt-0.5 text-slate-600">{e.text}</p>
              <a href={SOURCES[e.source].url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand hover:underline">
                {SOURCES[e.source].label} ↗
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {!plan && params.get('updated') !== '1' && (
          <Button variant="ghost" onClick={() => navigate('/connect?onboarding=1')} icon={<ArrowLeft className="h-4 w-4" />}>
            {t('cp.back')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/onboarding?edit=1')}>
          {t('cp.change')}
        </Button>
        <Button size="lg" onClick={create} loading={busy}>
          {plan ? t('cp.replace') : t('cp.create')}
        </Button>
      </div>
    </div>
  );
}

