import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, Trash2, User, Watch } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { deleteActivePlan, saveProfile } from '../lib/api';
import { fmtDate, fmtDistance, fmtDuration, fmtRelative } from '../lib/format';
import type { Units } from '../lib/types';
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Segmented, useToast } from '../components/ui';
import { extraLabel } from '../components/WeekBuilder';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Settings() {
  const { user } = useAuth();
  const { profile, plan, connection, units, reload } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const a = profile?.onboarding;

  const save = async (patch: { display_name?: string; units?: Units }) => {
    setSaving(true);
    try {
      await saveProfile(user!.id, patch);
      await reload();
      toast('Saved.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removePlan = async () => {
    if (!confirm('Delete your current plan? Activities from Garmin stay.')) return;
    await deleteActivePlan(user!.id);
    await reload();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />

      <Card>
        <CardTitle icon={<User className="h-5 w-5 text-brand" />}>Profile</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" loading={saving} onClick={() => save({ display_name: name })}>Save</Button>
            </div>
          </Field>
          <Field label="Units">
            <Segmented
              value={units}
              onChange={(v) => save({ units: v })}
              options={[
                { value: 'km', label: 'km' },
                { value: 'mi', label: 'miles' },
              ]}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">Signed in as {user?.email}</p>
      </Card>

      <Card>
        <CardTitle icon={<ClipboardList className="h-5 w-5 text-brand" />} action={<Link to="/onboarding?edit=1"><Button size="sm" variant="secondary">Edit answers</Button></Link>}>
          Plan settings
        </CardTitle>
        {a ? (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Race</dt><dd className="text-right font-medium">{a.raceName || 'Marathon'} · {fmtDate(a.raceDate)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Goal</dt><dd className="font-medium">{a.goalType === 'time' && a.goalTimeS ? fmtDuration(a.goalTimeS) : 'Finish strong'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Runs per week</dt><dd className="font-medium">{a.runDaysPerWeek} · long run {DAYS[a.longRunDay]}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Available days</dt><dd className="text-right font-medium">{a.availableDays.map((d) => DAYS[d]).join(', ')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Extra training</dt><dd className="text-right font-medium">{a.extras.length ? a.extras.map((e) => `${extraLabel(e)} ${e.perWeek}×`).join(", ") : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Week</dt><dd className="font-medium">{a.scheduleMode === "custom" ? "Your fixed days" : "Planner decides"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Approach</dt><dd className="font-medium capitalize">{a.approach}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Current volume</dt><dd className="font-medium">{fmtDistance(a.currentWeeklyKm, units, 0)}/week</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Experience</dt><dd className="font-medium capitalize">{a.level}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">You haven't answered the setup questions yet.</p>
        )}
        <p className="mt-4 text-xs text-slate-500">After editing your answers you can rebuild the plan – workouts you've already done stay in your history.</p>
      </Card>

      <Card>
        <CardTitle
          icon={<Watch className="h-5 w-5 text-brand" />}
          action={connection ? <Badge tone={connection.status === 'connected' ? 'green' : 'red'}>{connection.status}</Badge> : <Badge>Not connected</Badge>}
        >
          Garmin
        </CardTitle>
        <p className="text-sm text-slate-600">
          {connection ? `Last sync ${fmtRelative(connection.last_sync_at)}.` : 'Connect your Garmin account with a Personal API key to sync activities and wellness data automatically.'}
        </p>
        <Link to="/connect" className="mt-3 inline-block">
          <Button size="sm" variant="secondary">{connection ? 'Manage connection' : 'Connect Garmin'}</Button>
        </Link>
      </Card>

      <Card>
        <CardTitle>Account</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}>
            Sign out
          </Button>
          {plan && (
            <Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={removePlan}>
              Delete current plan
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
