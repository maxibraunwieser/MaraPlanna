import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { appUrl } from '../lib/supabase';
import { fmtRelative } from '../lib/format';
import { useI18n } from '../lib/i18n';
import * as api from '../lib/api';
import { Button, Notice, Spinner, useToast } from './ui';

/** Subscribe the plan in Apple / Google / Outlook calendar. The feed is written in the language of the page when the link is shown. */
export function CalendarSubscribe() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [feed, setFeed] = useState<api.CalendarFeed | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.fetchCalendarFeed(user.id).then(setFeed, (e: Error) => {
      setError(e.message);
      setFeed(null);
    });
  }, [user]);

  if (!user) return null;
  if (feed === undefined) return <Spinner />;

  const create = async () => {
    setBusy(true);
    try {
      setFeed(await api.createCalendarFeed(user.id, appUrl('plan')));
      setError(null);
      toast(t('cal.ready'), 'success');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const renew = () => {
    if (confirm(t('cal.renewConfirm'))) void create();
  };
  const turnOff = async () => {
    if (!confirm(t('cal.offConfirm'))) return;
    try {
      await api.deleteCalendarFeed(user.id);
      setFeed(null);
      toast(t('cal.off'), 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (error && !feed) return <Notice tone="error">{error}</Notice>;
  if (!feed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{t('cal.create.text')}</p>
        <Button loading={busy} icon={<CalendarPlus className="h-4 w-4" />} onClick={create}>
          {t('cal.create')}
        </Button>
      </div>
    );
  }

  const url = api.calendarFeedUrl(feed.token, lang);
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://www.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('cal.copied'), 'success');
    } catch {
      prompt(t('cal.copyPrompt'), url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={webcal}>
          <Button icon={<CalendarPlus className="h-4 w-4" />}>{t('cal.apple')}</Button>
        </a>
        <a href={google} target="_blank" rel="noreferrer">
          <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>{t('cal.google')}</Button>
        </a>
        <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copy}>
          {t('cal.copy')}
        </Button>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-600">
        <li><b className="text-slate-800">{t('cal.ios.pre')}</b>{t('cal.ios.text')}</li>
        <li><b className="text-slate-800">{t('cal.google.pre')}</b>{t('cal.google.text')}</li>
        <li><b className="text-slate-800">{t('cal.outlook.pre')}</b>{t('cal.outlook.text')}</li>
      </ul>
      <p className="text-xs text-slate-500">
        {feed.last_fetched_at ? t('cal.fetched', { when: fmtRelative(feed.last_fetched_at) }) : t('cal.notFetched')}
        {t('cal.private')}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button className="font-medium text-slate-600 hover:text-slate-900 hover:underline" onClick={renew} disabled={busy}>
          {t('cal.new')}
        </button>
        <button className="font-medium text-red-600 hover:underline" onClick={turnOff}>
          {t('cal.turnOff')}
        </button>
      </div>
    </div>
  );
}
