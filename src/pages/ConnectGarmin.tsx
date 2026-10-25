import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, ShieldCheck, Unplug, Watch } from 'lucide-react';
import { invokeGarmin, type SyncResult } from '../lib/api';
import { useData } from '../lib/data';
import { fmtRelative } from '../lib/format';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, PageHeader, useToast } from '../components/ui';

const KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';

export function GarminKeyForm({ onConnected, replacing }: { onConnected: (r: SyncResult) => void; replacing?: boolean }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeGarmin({ action: 'connect', apiKey: key.trim() });
      setKey('');
      onConnected(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ol className="space-y-3 text-sm text-slate-700">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">1</span>
          <span>
            Open{' '}
            <a href={KEY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
              Garmin Connect → Settings → Personal API <ExternalLink className="h-3.5 w-3.5" />
            </a>{' '}
            and sign in with your Garmin account.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">2</span>
          <span>
            Click <b>Create key</b>, accept the terms and choose <b>1 year</b> as expiry (longest option).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">3</span>
          <span>Copy the key right away – Garmin only shows it once – and paste it below.</span>
        </li>
      </ol>
      <Field label="Garmin Personal API key">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" className="w-full" loading={busy} disabled={key.trim().length < 16} onClick={connect} icon={<KeyRound className="h-4 w-4" />}>
        {busy ? 'Connecting & importing your history…' : replacing ? 'Replace key' : 'Connect Garmin'}
      </Button>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        The key is encrypted and stored server-side in Supabase; it never comes back to your browser. Access is read-only – MaraPlanna can't change
        anything in your Garmin account. You can delete the key in Garmin Connect at any time.
      </p>
    </div>
  );
}

export function ConnectGarmin() {
  const { connection, activities, syncing, syncNow, reload, adapt, plan } = useData();
  const [params] = useSearchParams();
  const onboarding = params.get('onboarding') === '1';
  const navigate = useNavigate();
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const garminRuns = activities.filter((a) => a.source === 'garmin' && a.sport === 'run').length;

  const connected = async (res: SyncResult) => {
    toast(`Garmin connected – imported ${res.activities} activities.`, 'success');
    if (res.warnings?.length) toast(`Some data could not be read: ${res.warnings[0]}`, 'error');
    setReplacing(false);
    await reload();
    await adapt();
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Garmin? Your imported activities stay in MaraPlanna.')) return;
    setDisconnecting(true);
    try {
      await invokeGarmin({ action: 'disconnect' });
      await reload();
      toast('Garmin disconnected.', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const next = () => navigate(plan ? '/' : '/plan/new');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Connect your Garmin"
        subtitle="MaraPlanna reads your runs, strength sessions, resting heart rate, HRV and sleep to build and adjust your plan."
      />
      {connection && !replacing ? (
        <Card>
          <CardTitle icon={<Watch className="h-5 w-5 text-brand" />} action={connection.status === 'connected' ? <Badge tone="green">Connected</Badge> : <Badge tone="red">Needs attention</Badge>}>
            {connection.display_name ? `Garmin · ${connection.display_name}` : 'Garmin Connect'}
          </CardTitle>
          {connection.status !== 'connected' && connection.last_sync_error && <Notice tone="error" className="mb-4">{connection.last_sync_error}</Notice>}
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Last sync</dt>
              <dd className="font-semibold">{fmtRelative(connection.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Runs imported</dt>
              <dd className="font-semibold">{garminRuns}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Garmin VO2max</dt>
              <dd className="font-semibold">{connection.profile?.vo2max ?? '–'}</dd>
            </div>
          </dl>
          {connection.status === 'connected' && connection.last_sync_error && (
            <p className="mt-3 text-xs text-slate-500">Partial data: {connection.last_sync_error}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => syncNow()} loading={syncing} icon={<RefreshCw className="h-4 w-4" />}>
              Sync now
            </Button>
            <Button variant="secondary" onClick={() => syncNow(true)} disabled={syncing}>
              Re-import 6 months
            </Button>
            <Button variant="secondary" onClick={() => setReplacing(true)} icon={<KeyRound className="h-4 w-4" />}>
              Replace key
            </Button>
            <Button variant="ghost" onClick={disconnect} loading={disconnecting} icon={<Unplug className="h-4 w-4" />}>
              Disconnect
            </Button>
          </div>
          {onboarding && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <Button size="lg" className="w-full" onClick={next} icon={<CheckCircle2 className="h-5 w-5" />}>
                Continue to my plan
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 sm:p-8">
          <GarminKeyForm onConnected={connected} replacing={replacing} />
          {replacing && (
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setReplacing(false)}>
              Cancel
            </Button>
          )}
        </Card>
      )}

      {!connection && (
        <Card className="mt-6">
          <h3 className="font-semibold text-slate-900">No key right now?</h3>
          <p className="mt-1 text-sm text-slate-600">
            You can still get a plan from your answers, upload <b>.FIT</b> files exported from Garmin Connect on the{' '}
            <Link to="/activities" className="font-semibold text-brand">Activities</Link> page, or log workouts by hand. Connect Garmin any time later in
            Settings.
          </p>
          {onboarding && (
            <Button variant="secondary" className="mt-4" onClick={next}>
              Skip for now
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
