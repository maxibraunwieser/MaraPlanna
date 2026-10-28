import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, ExternalLink, RefreshCw, Send, Unlink, Watch } from 'lucide-react';
import type { PlannedWorkout, WatchSync } from '../lib/types';
import { isWatchable, toIntervalsText, watchWorkout } from '../lib/watch';
import { fmtRelative } from '../lib/format';
import { useData } from '../lib/data';
import * as api from '../lib/api';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, useToast } from './ui';

/** What still stands between intervals.icu and the watch, if anything. */
function linkIssue(s: Pick<WatchSync, 'garmin' | 'upload'>): string | null {
  if (!s.garmin) return 'intervals.icu is not linked to Garmin yet: in intervals.icu open Settings → Garmin Connect → Connect and allow everything, including workouts / training.';
  if (!s.upload) return 'Switch on "Upload planned workouts" for Garmin in your intervals.icu settings.';
  return null;
}

/** "Send to Garmin" (via intervals.icu) and ".FIT download" for one planned run. */
export function SendToWatch({ w }: { w: PlannedWorkout }) {
  const { profile, plan, today, reload } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState<'send' | 'fit' | null>(null);
  const [result, setResult] = useState<api.WatchSendResult | null>(null);

  if (!plan || !isWatchable(w.steps) || w.status !== 'planned' || w.date < today) return null;
  const paces = plan.fitness.paces;
  const link = profile?.watch_sync ?? null;
  const sentAt = result?.sentAt ?? w.sent_to_watch_at ?? null;
  const issue = link ? linkIssue(result ?? link) : null;

  const send = async () => {
    setBusy('send');
    try {
      const r = await api.sendToWatch(w.id, toIntervalsText(watchWorkout(w, paces), paces), 1000 / paces.threshold);
      setResult(r);
      if (r.pushErrors.length) toast('intervals.icu could not pass it on to Garmin – see the details.', 'error');
      else toast(linkIssue(r) ? 'Saved in intervals.icu – finish the Garmin link to get it on your watch.' : 'Sent to Garmin Connect – sync your watch.', 'success');
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('fit');
    try {
      const { fitFileName, toFit } = await import('../lib/watchFit');
      const url = URL.createObjectURL(new Blob([toFit(watchWorkout(w, paces)) as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fitFileName(w.date, w.title);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Watch className="h-4 w-4 text-brand" /> On your watch
        </span>
        {link && (
          <Button size="sm" loading={busy === 'send'} onClick={send} icon={<Send className="h-4 w-4" />}>
            {busy === 'send' ? 'Sending…' : sentAt ? 'Send again' : 'Send to Garmin'}
          </Button>
        )}
        <Button size="sm" variant={link ? 'ghost' : 'secondary'} loading={busy === 'fit'} onClick={download} icon={<Download className="h-4 w-4" />}>
          {link ? '.FIT' : 'Download .FIT'}
        </Button>
      </div>

      <div className="mt-2 space-y-2 text-xs text-slate-600">
        {result?.pushErrors.length ? <Notice tone="error">Garmin push failed: {result.pushErrors.join(' · ')}</Notice> : null}
        {result?.warnings.map((m) => (
          <Notice key={m} tone="warn">{m}</Notice>
        ))}
        {issue && <Notice tone="warn">{issue}</Notice>}
        {sentAt && !issue && !result?.pushErrors.length && (
          <p className="flex items-start gap-1.5 text-emerald-700">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Sent {fmtRelative(sentAt)}. It's in your Garmin Connect calendar – sync the watch (Garmin Connect app) and start it from Training → Workouts or today's suggestion.
            </span>
          </p>
        )}
        {!link && (
          <p>
            Copy the file to <span className="font-mono">GARMIN/NewFiles</span> on the watch over USB. For one-tap sending,{' '}
            <Link to="/settings" className="font-semibold text-brand hover:underline">
              connect intervals.icu
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

/** Settings card: link intervals.icu, which forwards planned workouts to Garmin Connect. */
export function WatchSettings() {
  const { profile, reload } = useData();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'connect' | 'check' | 'disconnect' | null>(null);
  const link = profile?.watch_sync ?? null;
  const issue = link ? linkIssue(link) : null;

  const run = async (what: NonNullable<typeof busy>, fn: () => Promise<string>) => {
    setBusy(what);
    try {
      const msg = await fn();
      await reload();
      toast(msg, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardTitle icon={<Send className="h-5 w-5 text-brand" />} action={link ? <Badge tone={issue ? 'amber' : 'green'}>{issue ? 'Almost there' : 'Connected'}</Badge> : <Badge>Not connected</Badge>}>
        Workouts to your watch
      </CardTitle>
      <p className="text-sm text-slate-600">
        Garmin's Personal API can only read data, so MaraPlanna sends workouts through{' '}
        <a href="https://intervals.icu" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">intervals.icu</a>{' '}
        (free, with official access to Garmin's workout API). One tap puts a session with its pace targets in your Garmin Connect calendar, and it's on the watch after the next sync.
      </p>

      {link ? (
        <div className="mt-4 space-y-3">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">intervals.icu account</dt><dd className="font-medium">{link.athlete || '–'}</dd></div>
            <div><dt className="text-xs text-slate-500">Garmin linked</dt><dd className="font-medium">{link.garmin ? 'Yes' : 'No'}</dd></div>
            <div><dt className="text-xs text-slate-500">Upload planned workouts</dt><dd className="font-medium">{link.upload ? 'On' : 'Off'}</dd></div>
          </dl>
          {issue && <Notice tone="warn">{issue}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={busy === 'check'} icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => run('check', async () => (linkIssue(await api.checkWatch()) ? 'Checked – the Garmin link still needs a step.' : 'All set – workouts reach your watch.'))}>
              Check again
            </Button>
            <Button size="sm" variant="ghost" loading={busy === 'disconnect'} icon={<Unlink className="h-4 w-4" />}
              onClick={() => confirm('Disconnect intervals.icu? Workouts already sent stay in your calendars.') && run('disconnect', async () => (await api.disconnectWatch(), 'Disconnected.'))}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>
              Create a free account at{' '}
              <a href="https://intervals.icu" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand hover:underline">
                intervals.icu <ExternalLink className="h-3 w-3" />
              </a>
              .
            </li>
            <li>In intervals.icu open <b>Settings → Garmin Connect → Connect</b> and allow everything on Garmin's page, including workouts / training.</li>
            <li>In the same Settings page scroll to <b>Developer Settings</b> and copy your <b>API key</b>.</li>
            <li>Paste it here. MaraPlanna switches on "Upload planned workouts" and sets your threshold pace in intervals.icu if they're missing.</li>
          </ol>
          <Field label="intervals.icu API key">
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste API key" />
              <Button loading={busy === 'connect'} disabled={key.trim().length < 10}
                onClick={() => run('connect', async () => {
                  const s = await api.connectWatch(key.trim());
                  setKey('');
                  return linkIssue(s) ? 'Connected – one step left in intervals.icu.' : 'Connected – workouts can go to your watch now.';
                })}>
                Connect
              </Button>
            </div>
          </Field>
          <p className="text-xs text-slate-500">The key is stored encrypted on the server and never sent back to the browser. Without intervals.icu you can still download each workout as a .FIT file.</p>
        </div>
      )}
    </Card>
  );
}
