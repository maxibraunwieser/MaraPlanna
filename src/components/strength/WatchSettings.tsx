// What the watch does during strength training (confirm sets by itself, animation, sharing data), the exercises it can count
// besides the ones in the workouts, and a test workout. These used to sit on the strength page's setup tab; the answers about
// goal, level, place and equipment are changed in the questionnaire ("Edit answers"), so only the watch part is left.

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Watch } from 'lucide-react';
import { EXERCISES, FAMILIES, exerciseById, normalizePrefs, prefsReady, watchExercises, type Detect, type Family, type StrengthPrefs } from '../../../supabase/functions/_shared/strength';
import { createTestStrengthWorkout, saveStrengthPrefs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { exName, hintFor, repsLabel } from '../../lib/strengthFormat';
import { Badge, Button, Card, CardTitle, Notice, Toggle, useToast } from '../ui';

const DETECT_TONE: Record<Detect, 'green' | 'amber' | 'red'> = { good: 'green', medium: 'amber', poor: 'red' };
const DETECT_KEY: Record<Detect, MsgKey> = { good: 'st.detect.good', medium: 'st.detect.medium', poor: 'st.detect.poor' };
const WATCH_KEYS = ['autoConfirm', 'animation', 'shareData', 'exercises'] as const;

export function WatchSettings() {
  const { user } = useAuth();
  const { profile, plan, workouts, today, reload } = useData();
  const { t, lang } = useI18n();
  const toast = useToast();
  const prefs = useMemo(() => normalizePrefs(profile?.strength), [profile?.strength]);
  const [draft, setDraft] = useState<StrengthPrefs>(prefs);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => setDraft(prefs), [prefs]);

  const dirty = WATCH_KEYS.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(prefs[k]));
  const ready = prefsReady(prefs);
  const set = (patch: Partial<StrengthPrefs>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (id: string) => set({ exercises: draft.exercises.includes(id) ? draft.exercises.filter((x) => x !== id) : [...draft.exercises, id] });
  const todays = workouts.filter((w) => w.date === today && w.title.startsWith('Strength test'));
  const byFamily = (Object.keys(FAMILIES) as Family[]).map((f) => ({ f, list: EXERCISES.filter((e) => e.family === f) })).filter((g) => g.list.length);
  const fromWorkouts = new Set(watchExercises({ ...draft, exercises: [] }));

  const save = async () => {
    setSaving(true);
    try {
      // Only the watch settings change; everything else of the strength settings stays as it is.
      await saveStrengthPrefs(user!.id, { ...prefs, autoConfirm: draft.autoConfirm, animation: draft.animation, shareData: draft.shareData, exercises: draft.exercises, savedAt: prefs.savedAt ?? new Date().toISOString() });
      await reload();
      toast(t('st.saved.watch'), 'success');
    } catch (e) {
      toast(hintFor((e as Error).message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const createTest = async () => {
    if (!plan) return;
    setCreating(true);
    try {
      await createTestStrengthWorkout(user!.id, plan, workouts, today, watchExercises(prefs));
      await reload();
      toast(t('st.testCreated'), 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Card>
        <CardTitle icon={<Watch className="h-5 w-5 text-brand" />}>{t('st.watch')}</CardTitle>
        <div className="space-y-3">
          <Toggle checked={draft.autoConfirm} onChange={(v) => set({ autoConfirm: v })} label={t('st.autoConfirm')} hint={t('st.autoConfirm.hint')} />
          <Toggle checked={draft.animation} onChange={(v) => set({ animation: v })} label={t('st.animation')} hint={t('st.animation.hint')} />
          <Toggle checked={draft.shareData} onChange={(v) => set({ shareData: v })} label={t('st.share')} hint={t('st.share.hint')} />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-700">{t('st.extra')}</summary>
          <p className="mb-3 mt-2 text-xs text-slate-500">{t('st.extra.text')}</p>
          <div className="space-y-3">
            {byFamily.map(({ f, list }) => (
              <div key={f}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{FAMILIES[f][lang]}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((e) => {
                    const locked = fromWorkouts.has(e.id);
                    return (
                      <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                        <input type="checkbox" checked={locked || draft.exercises.includes(e.id)} disabled={locked} onChange={() => toggle(e.id)} className="h-4 w-4 accent-brand" />
                        <span className="flex-1 font-medium text-slate-800">{exName(exerciseById(e.id)?.en ?? e.id)}</span>
                        <Badge tone={DETECT_TONE[e.detect]}>{t(DETECT_KEY[e.detect])}</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
        <div className="mt-4">
          <Button loading={saving} disabled={!dirty} onClick={save}>{t('st.save')}</Button>
        </div>
      </Card>

      <Card>
        <CardTitle icon={<FlaskConical className="h-5 w-5 text-brand" />}>{t('st.test')}</CardTitle>
        <p className="text-sm text-slate-600">{t('st.test.pre')}<b>{t('st.test.bold')}</b>.</p>
        {!plan && <Notice tone="warn" className="mt-3">{t('st.test.needPlan')}</Notice>}
        {plan && !ready && <Notice tone="info" className="mt-3">{t('st.test.saveFirst')}</Notice>}
        {todays.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {todays.flatMap((w) => w.steps.map((s, i) => (s.type === 'exercise' ? <li key={`${w.id}-${i}`}>{s.sets} × {repsLabel(s.reps)} {exName(s.name)}</li> : null)))}
          </ul>
        )}
        <div className="mt-4">
          <Button variant="secondary" loading={creating} disabled={!plan || !ready} onClick={createTest}>{todays.length ? t('st.test.replace') : t('st.test.create')}</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t('st.test.note')}</p>
      </Card>
    </>
  );
}
