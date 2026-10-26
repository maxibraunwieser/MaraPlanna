import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { DayTemplate, Equipment, ExtraSession, ExtraType, RunSlot } from '../lib/types';
import { EXTRA_INFO } from '../lib/planner/extras';
import { checkTemplate } from '../lib/answers';
import { Button, cx, Field, Input, Notice, Segmented, Toggle } from './ui';
import { KIND_STYLE } from './Workout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PRESET_TYPES: ExtraType[] = ['lower', 'upper', 'full', 'core', 'plyo', 'mobility', 'bike', 'swim'];

export const extraLabel = (e: ExtraSession) => (e.type === 'custom' ? e.name || 'Own workout' : EXTRA_INFO[e.type].label);

function Stepper({ value, onChange, min = 1, max = 4 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-white ring-1 ring-slate-300">
      <button type="button" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-16 whitespace-nowrap text-center text-xs font-semibold">{value}× / week</span>
      <button type="button" className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Multi-select of non-running sessions with a frequency for each. */
export function ExtrasPicker({
  extras,
  equipment,
  onChange,
  onEquipment,
}: {
  extras: ExtraSession[];
  equipment: Equipment;
  onChange: (e: ExtraSession[]) => void;
  onEquipment: (e: Equipment) => void;
}) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('45');
  const [hard, setHard] = useState(false);
  const byType = (t: ExtraType) => extras.find((e) => e.type === t && t !== 'custom');
  const toggle = (t: ExtraType) => {
    const existing = byType(t);
    onChange(existing ? extras.filter((e) => e !== existing) : [...extras, { id: t, type: t, perWeek: t === 'mobility' || t === 'core' ? 2 : 1 }]);
  };
  const update = (id: string, perWeek: number) => onChange(extras.map((e) => (e.id === id ? { ...e, perWeek } : e)));
  const customs = extras.filter((e) => e.type === 'custom');
  const needsEquipment = extras.some((e) => e.type === 'upper' || e.type === 'lower' || e.type === 'full' || e.type === 'core');

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {PRESET_TYPES.map((t) => {
          const e = byType(t);
          const info = EXTRA_INFO[t];
          return (
            <div
              key={t}
              className={cx('rounded-xl p-3 ring-1 transition', e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-white ring-slate-300 hover:ring-slate-400')}
            >
              <button type="button" onClick={() => toggle(t)} className="flex w-full items-start gap-2 text-left">
                <span className={cx('mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border', e ? 'border-brand bg-brand text-white' : 'border-slate-400')}>
                  {e && <span className="text-[10px]">✓</span>}
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <span className={cx('h-2 w-2 rounded-full', KIND_STYLE[info.kind].dot)} />
                    {info.label}
                  </span>
                  <span className="block text-xs text-slate-500">{info.hint}</span>
                </span>
              </button>
              {e && (
                <div className="mt-2 pl-6">
                  <Stepper value={e.perWeek} onChange={(v) => update(e.id, v)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 text-sm font-semibold text-slate-800">Your own workouts</div>
        {customs.map((c) => (
          <div key={c.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <span className="flex-1 text-sm font-medium">
              {c.name} <span className="text-xs text-slate-500">· {c.minutes} min · {c.hard ? 'hard' : 'easy'}</span>
            </span>
            <Stepper value={c.perWeek} onChange={(v) => update(c.id, v)} />
            <button type="button" onClick={() => onChange(extras.filter((e) => e.id !== c.id))} className="p-1.5 text-slate-400 hover:text-red-600" aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
          <Input placeholder="e.g. Climbing, Football, Pilates" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="number" min={10} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex-1">
            <Toggle checked={hard} onChange={setHard} label="Hard on the legs" hint="Kept away from long runs and key sessions" />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!name.trim()}
            onClick={() => {
              onChange([...extras, { id: `custom-${Date.now()}`, type: 'custom', name: name.trim(), minutes: Number(minutes) || 45, hard, perWeek: 1 }]);
              setName('');
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Add
          </Button>
        </div>
      </div>

      {needsEquipment && (
        <Field label="Equipment for strength & core">
          <Segmented
            value={equipment}
            onChange={onEquipment}
            options={[
              { value: 'bodyweight', label: 'Bodyweight' },
              { value: 'dumbbells', label: 'Dumbbells' },
              { value: 'gym', label: 'Full gym' },
            ]}
          />
        </Field>
      )}
    </div>
  );
}

const RUN_OPTIONS: { value: RunSlot; label: string; className: string }[] = [
  { value: 'rest', label: 'Rest', className: 'bg-slate-100 text-slate-600' },
  { value: 'easy', label: 'Easy', className: 'bg-emerald-100 text-emerald-800' },
  { value: 'quality', label: 'Intervals / Tempo', className: 'bg-orange-100 text-orange-800' },
  { value: 'long', label: 'Long run', className: 'bg-sky-100 text-sky-800' },
  { value: 'recovery', label: 'Recovery', className: 'bg-teal-100 text-teal-800' },
];

/** The user's fixed week: run type per day plus extra sessions. */
export function CustomWeekEditor({ week, extras, onChange }: { week: DayTemplate[]; extras: ExtraSession[]; onChange: (w: DayTemplate[]) => void }) {
  const set = (day: number, patch: Partial<DayTemplate>) => onChange(week.map((d, i) => (i === day ? { ...d, ...patch } : d)));
  const setRun = (day: number, run: RunSlot) => {
    // Only one long run: moving it clears the old one.
    onChange(week.map((d, i) => (i === day ? { ...d, run } : run === 'long' && d.run === 'long' ? { ...d, run: 'easy' } : d)));
  };
  const { errors, warnings } = checkTemplate(week, extras);

  return (
    <div className="space-y-3">
      {week.map((d, i) => (
        <div key={DAYS[i]} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-semibold text-slate-900">{DAYS[i]}</div>
          <div className="flex flex-wrap gap-1.5">
            {RUN_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setRun(i, o.value)}
                className={cx('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', d.run === o.value ? cx(o.className, 'ring-2 ring-slate-900/70') : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-slate-300')}
              >
                {o.label}
              </button>
            ))}
          </div>
          {extras.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
              {extras.map((e) => {
                const on = d.extras.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => set(i, { extras: on ? d.extras.filter((x) => x !== e.id) : [...d.extras, e.id] })}
                    className={cx('rounded-full px-2.5 py-1 text-xs font-medium transition', on ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                  >
                    {on ? '✓ ' : '+ '}
                    {extraLabel(e)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {extras.map((e) => {
          const count = week.filter((d) => d.extras.includes(e.id)).length;
          return (
            <span key={e.id} className="rounded-full bg-slate-100 px-2.5 py-1">
              {extraLabel(e)}: {count}× / week
            </span>
          );
        })}
      </div>
      {errors.map((e) => (
        <Notice key={e} tone="error">{e}</Notice>
      ))}
      {warnings.map((w) => (
        <Notice key={w} tone="warn">{w}</Notice>
      ))}
    </div>
  );
}
