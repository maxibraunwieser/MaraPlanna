import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Gauge, HeartPulse, Moon, Waves } from 'lucide-react';
import { distanceName } from '../../../supabase/functions/_shared/content';
import { useData } from '../../lib/data';
import { currentLang, useI18n, type MsgKey } from '../../lib/i18n';
import { daysBetween, mondayOf } from '../../lib/planner/dates';
import { distanceLabel } from '../../lib/planner/goals';
import { greetingPart, restingHrDelta, trainingReadiness } from '../../lib/planner/readiness';
import { fmtDate, fmtDuration, fmtNum } from '../../lib/format';
import { cx } from '../ui';

const HRV_STATUS = ['low', 'poor', 'unbalanced', 'balanced'];

/** Greeting, goal countdown and today's health values: glass boxes straight on the page's night-to-glow background. */
const GLASS = 'rounded-3xl bg-white/[0.08] ring-1 ring-white/15 shadow-lg shadow-black/10 backdrop-blur-md';
const TONE = { good: 'bg-emerald-400', ok: 'bg-amber-400', low: 'bg-red-400', unknown: 'bg-white/30' } as const;

function initialsOf(name: string | null | undefined, email: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  return (email?.[0] ?? '?').toUpperCase();
}

function Tile({ icon, label, value, unit, sub, score, tone }: { icon: ReactNode; label: string; value: string | null; unit?: string; sub?: string | null; score?: number | null; tone?: keyof typeof TONE }) {
  return (
    <div className={cx(GLASS, 'flex min-w-0 flex-col p-3.5')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-white/65">
        {icon}
        <span className="min-w-0">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold italic tabular-nums leading-none">{value ?? '–'}</span>
        {value && unit && <span className="text-sm text-white/60">{unit}</span>}
      </div>
      {score !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className={cx('h-full rounded-full', TONE[tone ?? 'unknown'])} style={{ width: `${score ?? 0}%` }} />
        </div>
      )}
      <div className="mt-2 min-h-4 text-xs leading-4 text-white/60">{sub ?? ''}</div>
    </div>
  );
}

export function HomeHero() {
  const { profile, plan, metrics, activities, connection, today } = useData();
  const { t } = useI18n();
  const now = new Date();
  const greeting = t(`hm.greet.${greetingPart(now.getHours())}` as MsgKey);
  const name = profile?.display_name?.trim().split(/\s+/)[0] ?? '';

  // goal: what the person chose in the setup (a race with a date, or a plan that ends on a goal date)
  let goalCard: ReactNode = null;
  if (plan) {
    const raceM = plan.fitness.raceDistanceM === undefined ? 42_195 : plan.fitness.raceDistanceM;
    const hasRace = raceM !== null;
    const days = daysBetween(today, plan.race_date);
    const total = Math.max(1, daysBetween(plan.start_date, plan.race_date));
    const progress = Math.max(0, Math.min(100, (daysBetween(plan.start_date, today) / total) * 100));
    const title = plan.race_name || (hasRace ? distanceName(distanceLabel(raceM), currentLang()) : t(`goal.${plan.inputs.goal ?? 'marathon'}` as MsgKey));
    const week = plan.weeks.find((w) => w.startDate === mondayOf(today));
    const totalWeeks = plan.weeks[plan.weeks.length - 1]?.week ?? 0;
    const target = hasRace ? (plan.inputs.goalType === 'time' && plan.inputs.goalTimeS ? fmtDuration(plan.inputs.goalTimeS) : t('hm.finish')) : null;
    const projected = hasRace && plan.fitness.predictedMarathonS ? fmtDuration(plan.fitness.predictedMarathonS).replace(/:\d\d$/, '') : null;
    goalCard = (
      <section className={cx(GLASS, 'p-4 sm:p-5')} aria-label={t('hm.goal')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/65">
              <Flag className="h-3.5 w-3.5" /> {t('hm.goal')}
            </div>
            <h2 className="mt-1.5 text-xl font-bold leading-tight sm:text-2xl">{title}</h2>
            <p className="mt-0.5 text-sm text-white/70">{fmtDate(plan.race_date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="shrink-0 text-right">
            {days > 0 ? (
              <>
                <div className="font-display text-6xl font-bold italic tabular-nums leading-none text-brand">{days}</div>
                <div className="mt-1 max-w-[7.5rem] text-xs leading-4 text-white/70">{hasRace ? t('hm.toRace') : t('hm.toEnd')}</div>
              </>
            ) : (
              <div className="max-w-[8rem] text-sm font-bold leading-5 text-brand">{days === 0 && hasRace ? t('hm.raceToday') : t('hm.goalDone')}</div>
            )}
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-white/65">
          <span>{week ? t('dash.weekOf', { week: week.week, total: totalWeeks, phase: t(`phase.${week.phase}` as MsgKey) }) : ''}</span>
          <span className="flex gap-3">
            {target && <span>{t('hm.target')}: <b className="font-semibold text-white/90">{target}</b></span>}
            {projected && <span>{t('hm.projected')}: <b className="font-semibold text-white/90">{projected}</b></span>}
          </span>
        </div>
      </section>
    );
  }

  // health: the watch's values; the readiness is Garmin's when it has one, otherwise computed from the data
  const r = trainingReadiness(metrics, activities, today);
  const m = r.metric;
  const sleepScore = m?.sleep_score ?? null;
  const sleepTone = sleepScore === null ? 'unknown' : sleepScore >= 80 ? 'good' : sleepScore >= 60 ? 'ok' : 'low';
  const sleepWord = sleepScore === null ? null : t(`hm.sleep.${sleepScore >= 85 ? 'great' : sleepScore >= 70 ? 'good' : sleepScore >= 50 ? 'fair' : 'poor'}` as MsgKey);
  const sleepSub = [sleepWord, m?.sleep_s ? `${fmtNum(m.sleep_s / 3600)} h` : null].filter(Boolean).join(' · ');
  const hrvStatus = m?.hrv_status?.toLowerCase();
  const hrvSub = hrvStatus ? (HRV_STATUS.includes(hrvStatus) ? t(`rd.hrv.${hrvStatus}` as MsgKey) : hrvStatus) : m?.hrv_weekly_avg ? t('hm.hrv.avg', { n: Math.round(m.hrv_weekly_avg) }) : null;
  const delta = restingHrDelta(metrics, m);
  const rhrSub = delta === null ? null : delta === 0 || Math.abs(delta) <= 2 ? t('hm.rhr.same') : t(delta > 0 ? 'hm.rhr.up' : 'hm.rhr.down', { n: Math.abs(delta) });
  const readySub = r.score === null ? null : `${t(`rd.${r.level}` as MsgKey)} · ${t(r.source === 'garmin' ? 'hm.readiness.garmin' : 'hm.readiness.calc')}`;

  return (
    <div className="text-white">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-white/75">{greeting}</p>
          <h1 className="font-display truncate text-4xl font-bold tracking-tight sm:text-5xl">{name || ' '}</h1>
        </div>
        <Link
          to="/settings"
          aria-label={t('hm.profile')}
          title={t('hm.profile')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold ring-1 ring-white/25 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
        >
          {initialsOf(profile?.display_name, undefined)}
        </Link>
      </header>

      <div className="mt-5 space-y-5">
        {goalCard}

        <section aria-label={t('hm.health')}>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-white/65">{t('hm.health')}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<Moon className="h-3.5 w-3.5" />} label={t('hm.sleep')} value={sleepScore !== null ? String(sleepScore) : m?.sleep_s ? fmtNum(m.sleep_s / 3600) : null} unit={sleepScore === null ? 'h' : undefined} sub={sleepSub || null} score={sleepScore ?? undefined} tone={sleepTone} />
            <Tile icon={<Waves className="h-3.5 w-3.5" />} label={t('hm.hrv')} value={m?.hrv_last_night ? String(Math.round(m.hrv_last_night)) : null} unit="ms" sub={hrvSub} />
            <Tile icon={<Gauge className="h-3.5 w-3.5" />} label={t('hm.readiness')} value={r.score !== null ? String(r.score) : null} sub={readySub} score={r.score ?? 0} tone={r.level} />
            <Tile icon={<HeartPulse className="h-3.5 w-3.5" />} label={t('hm.rhr')} value={m?.resting_hr ? String(m.resting_hr) : null} unit="bpm" sub={rhrSub} />
          </div>
          {!connection ? (
            <Link to="/connect" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">{t('hm.connect')} →</Link>
          ) : (
            m && m.date !== today && <p className="mt-2 text-xs text-white/50">{t('hm.latest', { date: fmtDate(m.date) })}</p>
          )}
        </section>
      </div>
    </div>
  );
}
