import { useEffect, useState } from 'react';
import { Link2, Trash2, Watch } from 'lucide-react';
import { fmtDate, fmtRelative } from '../lib/format';
import { useI18n } from '../lib/i18n';
import * as api from '../lib/api';
import { Button, Card, CardTitle, Input, Notice, useToast } from './ui';

/** Settings card: link the MaraPlanna watch face or run app with the code it shows. */
export function WatchFaceCard() {
  const toast = useToast();
  const { t } = useI18n();
  const [devices, setDevices] = useState<api.WatchDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.listWatches().then(
      (r) => {
        setDevices(r.devices);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  useEffect(() => {
    void load();
  }, []);

  const digits = code.replace(/\D/g, '');
  const link = async () => {
    setBusy(true);
    try {
      await api.linkWatch(digits);
      setCode('');
      toast(t('wf.linked'), 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const unlink = async (d: api.WatchDevice) => {
    if (!confirm(t('wf.removeConfirm'))) return;
    try {
      await api.unlinkWatch(d.id);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Card>
      <CardTitle icon={<Watch className="h-5 w-5 text-brand" />}>{t('wf.title')}</CardTitle>
      <p className="text-sm text-slate-600">
        {t('wf.text')}
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>{t('wf.step1')}</li>
        <li>{t('wf.step2')}</li>
        <li>{t('wf.step3')}</li>
      </ol>
      <div className="mt-4 flex gap-2">
        <Input
          inputMode="numeric"
          autoComplete="off"
          placeholder="123 456"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="max-w-40 text-center font-mono text-lg tracking-widest"
        />
        <Button loading={busy} disabled={digits.length !== 6} icon={<Link2 className="h-4 w-4" />} onClick={link}>
          {t('wf.link')}
        </Button>
      </div>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      {devices && devices.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Watch className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{d.model || t('wf.model')}</div>
                <div className="text-xs text-slate-500">
                  {t('wf.linkedOn', { date: d.paired_at ? fmtDate(d.paired_at.slice(0, 10)) : '', seen: d.last_seen_at ? t('wf.lastUpdate', { when: fmtRelative(d.last_seen_at) }) : t('wf.waiting') })}
                </div>
              </div>
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => unlink(d)} aria-label={t('wf.remove')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
