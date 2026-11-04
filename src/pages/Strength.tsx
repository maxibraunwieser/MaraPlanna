import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, FlaskConical, ListChecks, Settings2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { addDays } from '../lib/planner/dates';
import { createTestStrengthWorkout, fetchStrengthSets, saveStrengthPrefs } from '../lib/api';
import type { StrengthSetRow } from '../lib/types';
import { EXERCISES, FAMILIES, exerciseById, normalizePrefs, prefsReady, type Detect, type Family, type StrengthPrefs } from '../../supabase/functions/_shared/strength';
import { Badge, Button, Card, CardTitle, Field, Notice, PageHeader, Segmented, Toggle, useToast } from '../components/ui';

const DETECT_TONE: Record<Detect, 'green' | 'amber' | 'red'> = { good: 'green', medium: 'amber', poor: 'red' };
const DETECT_TEXT: Record<Detect, string> = { good: 'well recognised', medium: 'sometimes confused', poor: 'hand barely moves' };

/** Nothing personal is preselected, only the first set of library exercises as a suggestion. */
const suggestion = (saved: StrengthPrefs): StrengthPrefs =>
  saved.savedAt || saved.exercises.length ? saved : { ...saved, exercises: EXERCISES.filter((e) => e.starter).map((e) => e.id) };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function Strength() {
  const { user } = useAuth();
  const { profile, plan, workouts, today, reload } = useData();
  const toast = useToast();
  const saved = useMemo(() => normalizePrefs(profile?.strength), [profile?.strength]);
  const [draft, setDraft] = useState<StrengthPrefs>(() => suggestion(saved));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sets, setSets] = useState<StrengthSetRow[] | null>(null);
  const [setsError, setSetsError] = useState<string | null>(null);

  useEffect(() => setDraft(suggestion(saved)), [saved]);

  useEffect(() => {
    if (!user) return;
    fetchStrengthSets(user.id, addDays(today, -90))
      .then((rows) => setSets(rows))
      .catch((e: Error) => setSetsError(e.message));
  }, [user, today]);

  const complete = !!draft.wrist && !!draft.equipment && draft.exercises.length > 0;
  const dirty =
    draft.wrist !== saved.wrist || draft.equipment !== saved.equipment || draft.weightUnit !== saved.weightUnit || draft.autoConfirm !== saved.autoConfirm ||
    draft.shareData !== saved.shareData || !sameList(draft.exercises, saved.exercises);
  const ready = prefsReady(saved);
  const todays = workouts.filter((w) => w.date === today && w.title.startsWith('Strength test'));

  const set = (patch: Partial<StrengthPrefs>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (id: string) => set({ exercises: draft.exercises.includes(id) ? draft.exercises.filter((x) => x !== id) : [...draft.exercises, id] });

  const save = async () => {
    setSaving(true);
    try {
      await saveStrengthPrefs(user!.id, { ...draft, savedAt: new Date().toISOString() });
      await reload();
      toast('Saved. The watch picks it up the next time it syncs.', 'success');
    } catch (e) {
      toast(hint((e as Error).message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const createTest = async () => {
    if (!plan) return;
    setCreating(true);
    try {
      await createTestStrengthWorkout(user!.id, plan, workouts, today, saved.exercises);
      await reload();
      toast("Test workout created for today. Open the Training menu on the watch.", 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const byFamily = (Object.keys(FAMILIES) as Family[]).map((f) => ({ f, list: EXERCISES.filter((e) => e.family === f) })).filter((g) => g.list.length);
  const sessions = useMemo(() => groupSessions(sets ?? []), [sets]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Strength" subtitle="Your watch counts the repetitions and logs every set. It learns what you do from the answers below – nothing is fixed on the watch." />

      <Card>
        <CardTitle icon={<Settings2 className="h-5 w-5 text-brand" />} action={<Badge tone={ready ? 'green' : 'amber'}>{ready ? 'Ready for the watch' : 'Setup needed'}</Badge>}>
          Your setup
        </CardTitle>
        {!ready && <Notice tone="warn" className="mb-4">The watch only starts strength training after you saved these answers.</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wrist you wear the watch on" hint="The recognition mirrors its data for the other side.">
            <Segmented
              value={draft.wrist ?? ('' as 'left')}
              onChange={(v) => set({ wrist: v })}
              options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
            />
          </Field>
          <Field label="Weight unit">
            <Segmented value={draft.weightUnit} onChange={(v) => set({ weightUnit: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
          </Field>
          <Field label="What do you train with?" hint="Machines where the hands barely move are hard to recognise by wrist.">
            <Segmented
              value={draft.equipment ?? ('' as 'free')}
              onChange={(v) => set({ equipment: v })}
              options={[{ value: 'free', label: 'Free weights' }, { value: 'machines', label: 'Machines' }, { value: 'mixed', label: 'Both' }]}
            />
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-sm font-medium text-slate-800">Exercises you do</div>
          <p className="mb-3 text-xs text-slate-500">
            These appear on the watch for free training and when you change an exercise. The test workout and your plan use them too.
            {!saved.savedAt && ' Preselected as a suggestion – change them to match you.'}
          </p>
          <div className="space-y-3">
            {byFamily.map(({ f, list }) => (
              <div key={f}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{FAMILIES[f].en}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={draft.exercises.includes(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-brand" />
                      <span className="flex-1 font-medium text-slate-800">{e.en}</span>
                      <Badge tone={DETECT_TONE[e.detect]}>{DETECT_TEXT[e.detect]}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Toggle
            checked={draft.autoConfirm}
            onChange={(v) => set({ autoConfirm: v })}
            label="Close sets by itself"
            hint="When the watch is sure and the exercise matches your plan, the set is logged without a tap. Otherwise it asks."
          />
          <Toggle
            checked={draft.shareData}
            onChange={(v) => set({ shareData: v })}
            label="Help improve the exercise recognition"
            hint="Allows motion data of your sets to be stored so the recognition can learn from your watch. Off until you turn it on; you can turn it off any time."
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button loading={saving} disabled={!complete || !dirty} icon={<Dumbbell className="h-4 w-4" />} onClick={save}>Save</Button>
          {!complete && <span className="text-xs text-slate-500">Choose a wrist, your equipment and at least one exercise.</span>}
        </div>
      </Card>

      <Card>
        <CardTitle icon={<FlaskConical className="h-5 w-5 text-brand" />}>Test workout</CardTitle>
        <p className="text-sm text-slate-600">
          Adds a short strength session to today in your plan, built from your exercises (up to five, three sets each). On the watch: <b>Menu → Training → Kraft</b>.
        </p>
        {!plan && <Notice tone="warn" className="mt-3">You need a training plan first.</Notice>}
        {plan && !ready && <Notice tone="info" className="mt-3">Save your setup above first.</Notice>}
        {todays.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {todays.flatMap((w) => w.steps.map((s, i) => (s.type === 'exercise' ? <li key={`${w.id}-${i}`}>{s.sets} × {s.reps} {s.name}</li> : null)))}
          </ul>
        )}
        <div className="mt-4">
          <Button variant="secondary" loading={creating} disabled={!plan || !ready} onClick={createTest}>
            {todays.length ? "Replace today's test workout" : "Create today's test workout"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">If the plan is rebuilt later, the test workout may disappear with the other planned sessions.</p>
      </Card>

      <Card>
        <CardTitle icon={<ListChecks className="h-5 w-5 text-brand" />}>Recorded sets</CardTitle>
        {setsError ? (
          <Notice tone="warn">{hint(setsError)}</Notice>
        ) : sets === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet. Sets show up here after you finish a strength training on the watch.</p>
        ) : (
          <div className="space-y-5">
            {sessions.map((s) => (
              <div key={s.key}>
                <div className="mb-1 text-sm font-semibold text-slate-800">{s.date} · {s.rows.length} sets · {s.rows.reduce((n, r) => n + r.reps, 0)} reps</div>
                <table className="w-full text-sm">
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.idx} className="border-t border-slate-100">
                        <td className="w-8 py-1 text-slate-400">{r.idx + 1}</td>
                        <td className="py-1 font-medium text-slate-800">{r.exercise_id ? exerciseById(r.exercise_id)?.en ?? r.exercise_id : r.exercise_name ?? 'Unknown'}</td>
                        <td className="py-1 text-right">{r.reps} reps</td>
                        <td className="py-1 text-right text-slate-500">{r.weight_kg ? `${fmtWeight(r.weight_kg, saved.weightUnit)}` : '–'}</td>
                        <td className="py-1 text-right text-xs text-slate-400">{r.source === 'plan' ? 'as planned' : r.source === 'pick' ? 'changed' : 'recognised'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function groupSessions(rows: StrengthSetRow[]) {
  const map = new Map<string, { key: string; date: string; rows: StrengthSetRow[] }>();
  for (const r of rows) {
    const g = map.get(r.session_key) ?? { key: r.session_key, date: r.local_date, rows: [] };
    g.rows.push(r);
    map.set(r.session_key, g);
  }
  return [...map.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.idx - b.idx) })).sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

const fmtWeight = (kg: number, unit: 'kg' | 'lb') => (unit === 'lb' ? `${Math.round((kg / 0.45359237) * 2) / 2} lb` : `${Math.round(kg * 2) / 2} kg`);

/** The most common reason for a failing save: the database update was not run yet. */
const hint = (message: string) =>
  /strength|schema cache|column|does not exist/i.test(message)
    ? 'Database update needed: run supabase/migrations/20261104000000_strength.sql in the Supabase SQL Editor.'
    : message;

