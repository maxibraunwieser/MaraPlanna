import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, FileUp, Footprints, Gauge, Plus, Trash2, Watch } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { deleteActivity, insertActivities } from '../lib/api';
import { fmtDate, fmtDistance, fmtDuration, fmtPace, fromUnit } from '../lib/format';
import { useI18n, tr, type MsgKey } from '../lib/i18n';
import type { Activity, Sport } from '../lib/types';
import { Badge, Button, Card, CardTitle, cx, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, useToast } from '../components/ui';

const SPORTS: Sport[] = ['run', 'strength', 'bike', 'swim', 'walk', 'mobility', 'other'];
/** What a hand-made activity is called in the database (English); shown in the language of the page. */
const SPORT_EN: Record<Sport, string> = { run: 'Run', strength: 'Strength', bike: 'Bike', swim: 'Swim', walk: 'Walk / hike', mobility: 'Mobility', other: 'Other' };
const sportLabel = (s: Sport) => tr(`sport.${s}` as MsgKey);
const activityName = (a: Activity) => (a.name && a.name !== SPORT_EN[a.sport] ? a.name : sportLabel(a.sport));

function ActivityLine({ a, onDelete }: { a: Activity; onDelete?: () => void }) {
  const { units } = useData();
  const { t } = useI18n();
  const time = a.moving_s ?? a.duration_s;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200 py-3">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', a.sport === 'run' ? 'bg-orange-100 text-orange-700' : a.sport === 'strength' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600')}>
        {a.sport === 'strength' ? <Dumbbell className="h-4 w-4" /> : <Footprints className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-slate-900">{activityName(a)}</span>
          <Badge tone={a.source === 'garmin' ? 'blue' : a.source === 'fit' ? 'violet' : 'slate'}>{a.source === 'garmin' ? t('act.src.garmin') : a.source === 'fit' ? t('act.src.fit') : t('act.src.manual')}</Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          <span>{fmtDate(a.local_date)}</span>
          {a.distance_m ? <span>{fmtDistance(a.distance_m / 1000, units, 2)}</span> : null}
          {time ? <span>{fmtDuration(time)}</span> : null}
          {a.sport === 'run' && a.distance_m && time ? <span>{fmtPace(time / (a.distance_m / 1000), units)}</span> : null}
          {a.avg_hr ? <span>♥ {a.avg_hr}</span> : null}
        </div>
      </div>
      <Link to={`/analysis/${a.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-orange-50 hover:text-brand" aria-label={t('act.openAnalysis')} title={t('act.analysis')}>
        <Gauge className="h-4 w-4" />
      </Link>
      {onDelete && (
        <button onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('act.delete')}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export function Activities() {
  const { user } = useAuth();
  const { loading, activities, units, connection, reload, adapt, today } = useData();
  const { t } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<'run' | 'all'>('run');
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ sport: 'run' as Sport, date: today, distance: '', minutes: '', hr: '' });
  const [limit, setLimit] = useState(50);

  if (loading) return <Spinner />;
  const list = activities.filter((a) => filter === 'all' || a.sport === 'run');

  const afterChange = async () => {
    await reload();
    await adapt();
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    try {
      const { parseActivityFiles } = await import('../lib/fitImport');
      const { rows, errors } = await parseActivityFiles([...files], user!.id);
      if (rows.length) await insertActivities(rows);
      toast(`${rows.length === 1 ? t('act.imported1') : t('act.importedN', { n: rows.length })}${errors.length ? t('act.skipped', { n: errors.length }) : ''}.`, rows.length ? 'success' : 'error');
      if (errors.length) console.warn(errors);
      await afterChange();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addManual = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const minutes = Number(form.minutes) || null;
      await insertActivities([
        {
          user_id: user!.id,
          source: 'manual',
          external_id: null,
          name: SPORT_EN[form.sport],
          sport: form.sport,
          sub_type: 'manual',
          start_time: `${form.date}T12:00:00Z`,
          local_date: form.date,
          duration_s: minutes ? minutes * 60 : null,
          moving_s: minutes ? minutes * 60 : null,
          distance_m: form.distance ? Math.round(fromUnit(Number(form.distance), units) * 1000) : null,
          avg_hr: Number(form.hr) || null,
          max_hr: null,
          elevation_gain_m: null,
          calories: null,
          training_load: null,
          aerobic_te: null,
          vo2max: null,
        },
      ]);
      setAdding(false);
      setForm({ ...form, distance: '', minutes: '', hr: '' });
      toast(t('act.added'), 'success');
      await afterChange();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const remove = async (a: Activity) => {
    if (!confirm(t('act.confirmDelete'))) return;
    await deleteActivity(a.id);
    await afterChange();
  };

  return (
    <div>
      <PageHeader
        title={t('act.title')}
        subtitle={connection ? undefined : t('act.sub.manual')}
        actions={
          connection ? undefined : <>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={importing} icon={<FileUp className="h-4 w-4" />}>
              {t('act.import')}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
              {t('act.add')}
            </Button>
          </>
        }
      />
      <input ref={fileRef} type="file" accept=".fit,.zip" multiple hidden onChange={(e) => importFiles(e.target.files)} />

      {!connection && (
        <Card className="mb-5">
          <CardTitle icon={<Watch className="h-5 w-5 text-brand" />}>{t('act.fitTitle')}</CardTitle>
          <p className="text-sm text-slate-600">
            {t('act.fitPre')}<b>{t('act.fitBold')}</b>{t('act.fitPost')}
          </p>
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="w-48">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'run', label: t('act.filter.runs') },
                { value: 'all', label: t('act.filter.all') },
              ]}
            />
          </div>
          <span className="text-sm text-slate-500">{t('act.count', { n: list.length })}</span>
        </div>
        {list.length ? (
          <>
            <ul className="space-y-2">
              {list.slice(0, limit).map((a) => (
                <ActivityLine key={a.id} a={a} onDelete={a.source !== 'garmin' ? () => remove(a) : undefined} />
              ))}
            </ul>
            {list.length > limit && (
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setLimit(limit + 50)}>
                {t('act.more')}
              </Button>
            )}
          </>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">{t('act.none')}</p>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('act.add')}>
        <form onSubmit={addManual} className="space-y-4">
          <Field label={t('act.form.type')}>
            <Select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value as Sport })}>
              {SPORTS.map((s) => (
                <option key={s} value={s}>{sportLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('act.form.date')}>
            <Input type="date" max={today} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('act.form.distance', { unit: units })}>
              <Input type="number" step="0.01" inputMode="decimal" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
            </Field>
            <Field label={t('act.form.minutes')}>
              <Input type="number" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            </Field>
            <Field label={t('act.form.hr')}>
              <Input type="number" inputMode="numeric" value={form.hr} onChange={(e) => setForm({ ...form, hr: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" className="w-full">{t('common.save')}</Button>
        </form>
      </Modal>
    </div>
  );
}
