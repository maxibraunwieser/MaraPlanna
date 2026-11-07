import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarSync, ClipboardList, LogOut, Trash2, User, Watch } from 'lucide-react';
import { normalizePrefs } from '../../supabase/functions/_shared/strength';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { deleteActivePlan, saveProfile, saveStrengthPrefs } from '../lib/api';
import { fmtDate, fmtDistance, fmtDuration, fmtRelative } from '../lib/format';
import { useI18n, type MsgKey } from '../lib/i18n';
import { weekdayNames } from '../lib/i18n/dates';
import { distanceName } from '../../supabase/functions/_shared/content';
import { distanceLabel, isRaceGoal } from '../lib/planner/goals';
import type { Units } from '../lib/types';
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Segmented, useToast } from '../components/ui';
import { extraLabel } from '../components/WeekBuilder';
import { CalendarSubscribe } from '../components/CalendarFeed';
import { WatchFaceCard } from '../components/WatchFace';
import { WatchSettings } from '../components/strength/WatchSettings';
import { DataPrivacyCard } from '../components/DataPrivacy';

export function Settings() {
  const { user } = useAuth();
  const { profile, plan, connection, units, reload } = useData();
  const { t, lang } = useI18n();
  const days = weekdayNames(lang);
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const a = profile?.onboarding;
  const weightUnit = a?.setup?.weightUnit ?? 'kg';
  const heightUnit = a?.setup?.heightUnit ?? 'm';

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      await reload();
      toast(t('set.saved'), 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const save = (patch: { display_name?: string; units?: Units }) => run(() => saveProfile(user!.id, patch));
  // Body weight and height units live with the answers; the strength page's unit follows the weight unit.
  const saveSetup = (patch: { weightUnit?: 'kg' | 'lb'; heightUnit?: 'm' | 'ft' }) =>
    run(async () => {
      if (!a) return;
      await saveProfile(user!.id, { onboarding: { ...a, setup: { ...a.setup!, ...patch } } });
      if (patch.weightUnit && profile?.strength) await saveStrengthPrefs(user!.id, { ...normalizePrefs(profile.strength), weightUnit: patch.weightUnit });
    });

  const removePlan = async () => {
    if (!confirm(t('set.confirmDelete'))) return;
    await deleteActivePlan(user!.id);
    await reload();
    navigate('/');
  };

  const goal = a?.goal ?? 'marathon';
  const race = isRaceGoal(goal);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('set.title')} />

      <Card>
        <CardTitle icon={<User className="h-5 w-5 text-brand" />}>{t('set.profile')}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('set.name')}>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" loading={saving} onClick={() => save({ display_name: name })}>{t('common.save')}</Button>
            </div>
          </Field>
          <div>
            <div className="mb-1.5 text-sm font-medium text-slate-700">{t('set.units')}</div>
            <div className="space-y-2">
              <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                <span className="text-xs text-slate-500">{t('set.units.distance')}</span>
                <Segmented value={units} onChange={(v) => save({ units: v })} options={[{ value: 'km' as Units, label: 'km' }, { value: 'mi' as Units, label: t('set.units.mi') }]} />
              </div>
              <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                <span className="text-xs text-slate-500">{t('set.units.weight')}</span>
                <Segmented value={weightUnit} onChange={(v) => saveSetup({ weightUnit: v })} options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} />
              </div>
              <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                <span className="text-xs text-slate-500">{t('set.units.height')}</span>
                <Segmented value={heightUnit} onChange={(v) => saveSetup({ heightUnit: v })} options={[{ value: 'm' as const, label: 'm / cm' }, { value: 'ft' as const, label: 'ft / in' }]} />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t('set.signedIn', { email: user?.email ?? '' })}</p>
      </Card>

      <Card>
        <CardTitle icon={<ClipboardList className="h-5 w-5 text-brand" />} action={<Link to="/onboarding?edit=1"><Button size="sm" variant="secondary">{t('set.editAnswers')}</Button></Link>}>
          {t('set.plan')}
        </CardTitle>
        {a ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.goal')}</dt><dd className="text-right font-medium">{t(`goal.${goal}` as MsgKey)}</dd></div>
            {race ? (
              <>
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.race')}</dt><dd className="text-right font-medium">{a.raceName || distanceName(distanceLabel(a.raceDistanceM ?? 42_195), lang)} · {fmtDate(a.raceDate)}</dd></div>
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.target')}</dt><dd className="font-medium">{a.goalType === 'time' && a.goalTimeS ? fmtDuration(a.goalTimeS) : t('set.finish')}</dd></div>
              </>
            ) : (
              <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.length')}</dt><dd className="font-medium">{t('goal.weeks', { n: a.planWeeks ?? plan?.weeks.length ?? 0 })}</dd></div>
            )}
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.runs')}</dt><dd className="font-medium">{t('set.runsValue', { n: a.runDaysPerWeek, day: days[a.longRunDay] })}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.days')}</dt><dd className="text-right font-medium">{a.availableDays.map((d) => days[d]).join(', ')}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.extra')}</dt><dd className="text-right font-medium">{a.extras.length ? a.extras.map((e) => `${extraLabel(e)} ${e.perWeek}×`).join(', ') : t('common.none')}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.week')}</dt><dd className="font-medium">{a.scheduleMode === 'custom' ? t('set.week.custom') : t('set.week.auto')}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.approach')}</dt><dd className="font-medium">{t(`set.approach.${a.approach}` as MsgKey)}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.volume')}</dt><dd className="font-medium">{fmtDistance(a.currentWeeklyKm, units, 0)}{t('common.perWeek')}</dd></div>
            <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200"><dt className="text-slate-500">{t('set.experience')}</dt><dd className="font-medium">{t(`set.level.${a.level}` as MsgKey)}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{t('set.noAnswers')}</p>
        )}
        <p className="mt-4 text-xs text-slate-500">{t('set.afterEdit')}</p>
      </Card>

      <Card>
        <CardTitle
          icon={<Watch className="h-5 w-5 text-brand" />}
          action={connection ? <Badge tone={connection.status === 'connected' ? 'green' : 'red'}>{t(`set.status.${connection.status}` as MsgKey)}</Badge> : <Badge>{t('set.notConnected')}</Badge>}
        >
          {t('set.garmin')}
        </CardTitle>
        <p className="text-sm text-slate-600">
          {connection ? t('set.lastSync', { when: fmtRelative(connection.last_sync_at) }) : t('set.connectText')}
        </p>
        <Link to="/connect" className="mt-3 inline-block">
          <Button size="sm" variant="secondary">{connection ? t('set.manage') : t('sync.connect')}</Button>
        </Link>
      </Card>

      <Card>
        <CardTitle icon={<CalendarSync className="h-5 w-5 text-brand" />}>{t('set.calendar')}</CardTitle>
        <CalendarSubscribe />
      </Card>

      <WatchFaceCard />

      <WatchSettings />

      <DataPrivacyCard />

      <Card>
        <CardTitle>{t('set.account')}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}>
            {t('set.signOut')}
          </Button>
          {plan && (
            <Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={removePlan}>
              {t('set.deletePlan')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
