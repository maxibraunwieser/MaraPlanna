import { useEffect, useState } from 'react';
import { Link2, Trash2, Watch } from 'lucide-react';
import { fmtDate, fmtRelative } from '../lib/format';
import * as api from '../lib/api';
import { Button, Card, CardTitle, Input, Notice, useToast } from './ui';

/** Settings card: link the MaraPlanna watch face with the code it shows. */
export function WatchFaceCard() {
  const toast = useToast();
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
      toast('Watch linked – your plan shows up on it within a few minutes.', 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const unlink = async (d: api.WatchDevice) => {
    if (!confirm('Remove this watch? It stops showing your plan and asks for a new code.')) return;
    try {
      await api.unlinkWatch(d.id);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Card>
      <CardTitle icon={<Watch className="h-5 w-5 text-brand" />}>Garmin watch face</CardTitle>
      <p className="text-sm text-slate-600">
        The MaraPlanna watch face shows today's session with its target pace, your week and the countdown to race day – right on your Garmin.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Install the <b>MaraPlanna</b> watch face on your watch.</li>
        <li>It shows a 6-digit code (the phone needs to be nearby with the Garmin Connect app).</li>
        <li>Enter the code here.</li>
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
          Link watch
        </Button>
      </div>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      {devices && devices.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Watch className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{d.model || 'Garmin watch'}</div>
                <div className="text-xs text-slate-500">
                  Linked {d.paired_at ? fmtDate(d.paired_at.slice(0, 10)) : ''} · {d.last_seen_at ? `last update ${fmtRelative(d.last_seen_at)}` : 'waiting for the first update'}
                </div>
              </div>
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => unlink(d)} aria-label="Remove watch">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
