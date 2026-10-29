import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { appUrl } from '../lib/supabase';
import { fmtRelative } from '../lib/format';
import * as api from '../lib/api';
import { Button, Notice, Spinner, useToast } from './ui';

/** Subscribe the plan in Apple / Google / Outlook calendar. */
export function CalendarSubscribe() {
  const { user } = useAuth();
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
      toast('Calendar link ready – now add it to your calendar.', 'success');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const renew = () => {
    if (confirm('Create a new link? Calendars subscribed to the old link stop updating – you would subscribe again with the new one.')) void create();
  };
  const turnOff = async () => {
    if (!confirm('Turn off the calendar feed? Subscribed calendars stop updating (remove the calendar there too).')) return;
    try {
      await api.deleteCalendarFeed(user.id);
      setFeed(null);
      toast('Calendar feed turned off.', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (error && !feed) return <Notice tone="error">{error}</Notice>;
  if (!feed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Every session – with distance, paces and steps – appears in your phone's calendar and updates by itself when the plan changes.
        </p>
        <Button loading={busy} icon={<CalendarPlus className="h-4 w-4" />} onClick={create}>
          Create calendar link
        </Button>
      </div>
    );
  }

  const url = api.calendarFeedUrl(feed.token);
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://www.google.com/calendar/render?cid=${webcal}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.', 'success');
    } catch {
      prompt('Copy this link:', url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={webcal}>
          <Button icon={<CalendarPlus className="h-4 w-4" />}>Apple Calendar</Button>
        </a>
        <a href={google} target="_blank" rel="noreferrer">
          <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>Google Calendar</Button>
        </a>
        <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copy}>
          Copy link
        </Button>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-600">
        <li>
          <b className="text-slate-800">iPhone / Mac:</b> tap <i>Apple Calendar</i> → <i>Subscribe</i>. Updates about every hour.
        </li>
        <li>
          <b className="text-slate-800">Google:</b> opens Google Calendar in the browser → <i>Add</i>; it then shows in the Google Calendar app too. Google refreshes subscriptions only every 8–24 hours.
        </li>
        <li>
          <b className="text-slate-800">Outlook:</b> <i>Add calendar → Subscribe from web</i> and paste the link.
        </li>
      </ul>
      <p className="text-xs text-slate-500">
        {feed.last_fetched_at ? `Last fetched by a calendar app ${fmtRelative(feed.last_fetched_at)}.` : 'Not fetched by a calendar app yet.'} Keep the link private – anyone who has it can see your plan.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button className="font-medium text-slate-600 hover:text-slate-900 hover:underline" onClick={renew} disabled={busy}>
          New link
        </button>
        <button className="font-medium text-red-600 hover:underline" onClick={turnOff}>
          Turn off
        </button>
      </div>
    </div>
  );
}
