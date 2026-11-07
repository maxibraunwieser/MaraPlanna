import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, RefreshCw, ShieldCheck, Unplug, Watch } from 'lucide-react';
import { invokeGarmin, type SyncResult } from '../lib/api';
import { useData } from '../lib/data';
import { fmtRelative } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, PageHeader, useToast } from '../components/ui';

const KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';

const Num = ({ n }: { n: number }) => <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>;

export function GarminKeyForm({ onConnected, replacing }: { onConnected: (r: SyncResult) => void; replacing?: boolean }) {
  const { t } = useI18n();
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
          <Num n={1} />
          <span>
            {t('key.step1pre')}
            <a href={KEY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
              {t('key.step1link')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {t('key.step1post')}
          </span>
        </li>
        <li className="flex gap-3">
          <Num n={2} />
          <span>
            {t('key.step2pre')}<b>{t('key.step2bold')}</b>{t('key.step2mid')}<b>{t('key.step2bold2')}</b>{t('key.step2post')}
          </span>
        </li>
        <li className="flex gap-3">
          <Num n={3} />
          <span>{t('key.step3')}</span>
        </li>
      </ol>
      <Field label={t('key.label')}>
        <Input type="password" autoComplete="off" spellCheck={false} placeholder={t('key.placeholder')} value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button size="lg" className="w-full" loading={busy} disabled={key.trim().length < 16} onClick={connect} icon={<KeyRound className="h-4 w-4" />}>
        {busy ? t('key.connecting') : replacing ? t('key.replace') : t('key.connect')}
      </Button>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        {t('key.privacy')}
      </p>
    </div>
  );
}

export function ConnectGarmin() {
  const { connection, activities, syncing, syncNow, reload, adapt, plan } = useData();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const onboarding = params.get('onboarding') === '1';
  const navigate = useNavigate();
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const garminRuns = activities.filter((a) => a.source === 'garmin' && a.sport === 'run').length;

  const connected = async (res: SyncResult) => {
    toast(t('cg.connected', { n: res.activities }), 'success');
    if (res.warnings?.length) toast(t('cg.warning', { message: res.warnings[0] }), 'error');
    setReplacing(false);
    await reload();
    await adapt();
  };

  const disconnect = async () => {
    if (!confirm(t('cg.disconnectConfirm'))) return;
    setDisconnecting(true);
    try {
      await invokeGarmin({ action: 'disconnect' });
      await reload();
      toast(t('cg.disconnected'), 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const next = () => navigate(plan ? '/' : '/plan/new');

  return (
    <div className="mx-auto max-w-2xl">
      {onboarding && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate('/onboarding?edit=1&from=connect')} icon={<ArrowLeft className="h-4 w-4" />}>
          {t('cg.back')}
        </Button>
      )}
      <PageHeader title={t('cg.title')} subtitle={t('cg.sub')} />
      {connection && !replacing ? (
        <Card>
          <CardTitle icon={<Watch className="h-5 w-5 text-brand" />} action={connection.status === 'connected' ? <Badge tone="green">{t('cg.badge.connected')}</Badge> : <Badge tone="red">{t('cg.badge.attention')}</Badge>}>
            {connection.display_name ? `Garmin · ${connection.display_name}` : 'Garmin Connect'}
          </CardTitle>
          {connection.status !== 'connected' && connection.last_sync_error && <Notice tone="error" className="mb-4">{connection.last_sync_error}</Notice>}
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">{t('cg.lastSync')}</dt>
              <dd className="font-semibold">{fmtRelative(connection.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('cg.runs')}</dt>
              <dd className="font-semibold">{garminRuns}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('cg.vo2')}</dt>
              <dd className="font-semibold">{connection.profile?.vo2max ?? '–'}</dd>
            </div>
          </dl>
          {connection.status === 'connected' && connection.last_sync_error && (
            <p className="mt-3 text-xs text-slate-500">{t('cg.partial', { message: connection.last_sync_error })}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => syncNow()} loading={syncing} icon={<RefreshCw className="h-4 w-4" />}>
              {t('cg.syncNow')}
            </Button>
            <Button variant="secondary" onClick={() => syncNow(true)} disabled={syncing}>
              {t('cg.reimport')}
            </Button>
            <Button variant="secondary" onClick={() => setReplacing(true)} icon={<KeyRound className="h-4 w-4" />}>
              {t('cg.replace')}
            </Button>
            <Button variant="ghost" onClick={disconnect} loading={disconnecting} icon={<Unplug className="h-4 w-4" />}>
              {t('cg.disconnect')}
            </Button>
          </div>
          {onboarding && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <Button size="lg" className="w-full" onClick={next} icon={<CheckCircle2 className="h-5 w-5" />}>
                {t('cg.continue')}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 sm:p-8">
          <GarminKeyForm onConnected={connected} replacing={replacing} />
          {replacing && (
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setReplacing(false)}>
              {t('cg.cancel')}
            </Button>
          )}
        </Card>
      )}

      {!connection && (
        <Card className="mt-6">
          <h3 className="font-semibold text-slate-900">{t('cg.noKey')}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('cg.noKey.pre')}<b>{t('cg.noKey.bold')}</b>{t('cg.noKey.mid')}
            <Link to="/activities" className="font-semibold text-brand">{t('cg.noKey.link')}</Link>
            {t('cg.noKey.post')}
          </p>
          {onboarding && (
            <Button variant="secondary" className="mt-4" onClick={next}>
              {t('cg.skip')}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
