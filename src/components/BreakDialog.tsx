// Sick / injured / time off: the dialog that pauses the plan, and the banner
// that shows a running break with "I'm feeling better".

import { useMemo, useState, type ReactNode } from 'react';
import { Bandage, Plane, Thermometer } from 'lucide-react';
import type { BreakKind, PlanBreak } from '../lib/types';
import { BREAK_LABEL, breakPhase, comeback, endBreakEarly, planBreak, visibleBreak, type BreakResult } from '../lib/planner/breaks';
import { addDays, daysBetween } from '../lib/planner/dates';
import { fmtDate, fmtDistance } from '../lib/format';
import { useData } from '../lib/data';
import * as api from '../lib/api';
import { Button, cx, Field, Input, Modal, Notice, Segmented, useToast } from './ui';

const ICON: Record<BreakKind, typeof Thermometer> = { sick: Thermometer, injury: Bandage, other: Plane };
const DEFAULT_DAYS: Record<BreakKind, number> = { sick: 3, injury: 7, other: 7 };

const MODE_OPTIONS: Record<BreakKind, { rest: [string, string]; easy: [string, string] }> = {
  sick: {
    rest: ['Fever or below the neck', 'Fever, chest, body aches or stomach'],
    easy: ['Only above the neck', 'Runny nose, sneezing, mild sore throat'],
  },
  injury: {
    rest: ['Running hurts', 'Pain while or after running'],
    easy: ['Easy runs are pain-free', 'Only faster or longer running hurts'],
  },
  other: {
    rest: ['No running', 'Travel, work, family …'],
    easy: ['Short easy runs', "When it fits – they're a bonus"],
  },
};

const GUIDANCE: Record<BreakKind, Record<'rest' | 'easy', string>> = {
  sick: {
    rest: 'Rest until the fever is gone and you feel normal again, then give it one more day. Training with a fever strains the heart. See a doctor if it lasts more than a few days.',
    easy: "Symptoms above the neck only: short easy runs are usually fine (the \"neck check\"). Stop if you feel worse, and switch to full rest if fever or chest symptoms appear.",
  },
  injury: {
    rest: 'Pain that changes your stride, swelling or pain at rest: have it checked by a physio or doctor. Upper-body, core and mobility sessions stay in the plan if they are pain-free.',
    easy: 'Run only if it stays pain-free during and after the run (at most mild discomfort that is gone the next morning). Flat, soft surfaces help.',
  },
  other: {
    rest: 'Enjoy the time off – a short break costs very little fitness.',
    easy: 'Short easy runs keep you ticking over. They are a bonus, not a must.',
  },
};

const dayCount = (from: string, back: string) => Math.max(1, daysBetween(from, back));

/** Persist a break result and refresh. */
function useApplyBreak() {
  const { plan, reload, adapt } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const apply = async (result: BreakResult, message: string) => {
    if (!plan) return false;
    setBusy(true);
    try {
      await api.persistAdaptation(plan, result);
      await reload();
      await adapt();
      toast(message, 'success');
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { apply, busy };
}

function Chips({ options, value, onPick }: { options: { label: string; value: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onPick(o.value)}
          className={cx(
            'rounded-full px-3 py-1.5 text-xs font-medium transition',
            value === o.value ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** What the break does to the plan – shown before saving. */
function BreakPreview({ result, draftDays, ending }: { result: BreakResult; draftDays: number; ending?: boolean }) {
  const { units } = useData();
  const s = result.summary;
  const items: ReactNode[] = [];
  if (!ending) {
    items.push(
      s.paused
        ? `${s.paused} session${s.paused === 1 ? '' : 's'} paused${s.pausedKey ? ` (${s.pausedKey} key session${s.pausedKey === 1 ? '' : 's'})` : ''}.`
        : 'Nothing is planned in that time.',
    );
    if (s.kept) items.push(`${s.kept} light session${s.kept === 1 ? ' stays' : 's stay'} – only if you feel up to it.`);
  }
  const reduced = s.replan && (!!s.easyUntil || (s.startKm !== null && s.startKm < s.baseKm));
  if (s.returnDate && s.replan && !reduced) {
    items.push(
      <>
        Back on <b>{fmtDate(s.returnDate)}</b> – the plan continues at its usual level (~{fmtDistance(s.startKm, units, 0)}/week).
      </>,
    );
  } else if (s.returnDate) {
    items.push(
      s.replan ? (
        <>
          Back on <b>{fmtDate(s.returnDate)}</b>
          {s.easyUntil ? <>: easy runs only until {fmtDate(addDays(s.easyUntil, -1))}</> : null}, then the plan builds back up from ~{fmtDistance(s.startKm, units, 0)}/week
          {s.startKm !== null && s.startKm < s.baseKm ? <> (before: {fmtDistance(s.baseKm, units, 0)})</> : null}.
        </>
      ) : (
        <>
          Short break – the plan simply continues on <b>{fmtDate(s.returnDate)}</b>. No need to make anything up.
        </>
      ),
    );
  }
  if (s.vdotAfter < s.vdotBefore - 0.04)
    items.push(`Paces ease a little (VDOT ${s.vdotBefore.toFixed(1)} → ${s.vdotAfter.toFixed(1)}) – ${draftDays} days off cost some fitness. They go back up as your runs show it.`);
  if (s.taper) items.push('Your return falls into the taper – the plan keeps it light so you still arrive fresh.');
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="mb-1.5 font-semibold text-slate-900">What changes</div>
      <ul className="space-y-1 text-slate-700">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BreakDialog({ edit, onClose }: { edit: PlanBreak | null; onClose: () => void }) {
  const { plan, workouts, activities, today } = useData();
  const { apply, busy } = useApplyBreak();
  const [kind, setKind] = useState<BreakKind>(edit?.kind ?? 'sick');
  const [mode, setMode] = useState<'rest' | 'easy'>(edit?.mode ?? 'rest');
  const [from, setFrom] = useState(edit?.from ?? today);
  const [back, setBack] = useState(edit ? addDays(edit.to, 1) : addDays(today, DEFAULT_DAYS.sick));
  const [backTouched, setBackTouched] = useState(!!edit);

  const draft = { id: edit?.id, kind, mode, from, to: addDays(back, -1) };
  const preview = useMemo((): { result?: BreakResult; error?: string } => {
    if (!plan) return { error: 'No plan.' };
    if (!from || !back || back <= from) return { error: 'The return day has to be after the first day of the break.' };
    try {
      return { result: planBreak({ plan, workouts, activities, today, draft }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, workouts, activities, today, kind, mode, from, back]);
  if (!plan) return null;

  const pickKind = (k: BreakKind) => {
    setKind(k);
    if (!backTouched) setBack(addDays(from, DEFAULT_DAYS[k]));
  };
  const pickFrom = (d: string) => {
    if (!d) return;
    if (!backTouched || back <= d) setBack(addDays(d, Math.max(1, back > from ? dayCount(from, back) : DEFAULT_DAYS[kind])));
    setFrom(d);
  };
  const pickBack = (d: string) => {
    if (!d) return;
    setBack(d);
    setBackTouched(true);
  };
  const days = dayCount(from, back);
  const save = async () => {
    if (!preview.result) return;
    const ok = await apply(preview.result, edit ? 'Break updated – the plan is adjusted.' : `Get well soon! The plan is paused until ${fmtDate(addDays(back, -1))}.`);
    if (ok) onClose();
  };
  const cancelBreak = async () => {
    if (!edit || !confirm('Remove this break? The plan goes back to how it was before.')) return;
    try {
      const result = planBreak({ plan, workouts, activities, today, draft: null, cancelId: edit.id });
      if (await apply(result, 'Break removed.')) onClose();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const opt = MODE_OPTIONS[kind];
  return (
    <Modal open onClose={onClose} title={edit ? 'Change your break' : 'Sick, injured or time off?'}>
      <div className="space-y-5">
        <Segmented
          value={kind}
          onChange={pickKind}
          options={(['sick', 'injury', 'other'] as const).map((k) => {
            const I = ICON[k];
            return { value: k, label: <span className="flex items-center gap-1.5"><I className="h-4 w-4" /> {BREAK_LABEL[k]}</span> };
          })}
        />

        <Segmented
          value={mode}
          onChange={setMode}
          columns={2}
          options={[
            { value: 'rest', label: opt.rest[0], hint: opt.rest[1] },
            { value: 'easy', label: opt.easy[0], hint: opt.easy[1] },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day">
            <Chips
              value={from}
              onPick={pickFrom}
              options={[
                { label: 'Today', value: today },
                { label: 'Yesterday', value: addDays(today, -1) },
                { label: '2 days ago', value: addDays(today, -2) },
              ]}
            />
            <Input className="mt-2" type="date" min={addDays(today, -21)} max={addDays(plan.race_date, -1)} value={from} onChange={(e) => pickFrom(e.target.value)} />
          </Field>
          <Field label="Back to training on" hint={`${days} day${days === 1 ? '' : 's'} off – you can change or end it any time.`}>
            <Chips
              value={back}
              onPick={pickBack}
              options={[2, 3, 5, 7, 14].map((n) => ({ label: n === 7 ? '1 week' : n === 14 ? '2 weeks' : `${n} days`, value: addDays(from, n) }))}
            />
            <Input className="mt-2" type="date" min={addDays(from, 1)} max={plan.race_date} value={back} onChange={(e) => pickBack(e.target.value)} />
          </Field>
        </div>

        <Notice tone="info">
          {GUIDANCE[kind][mode]} <span className="text-sky-700/70">General guidance, not medical advice.</span>
        </Notice>

        {preview.result ? <BreakPreview result={preview.result} draftDays={days} /> : <Notice tone="error">{preview.error}</Notice>}

        <div className="flex flex-wrap items-center gap-2">
          <Button loading={busy} disabled={!preview.result} onClick={save}>
            {edit ? 'Save changes' : 'Pause my plan'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {edit && (
            <button type="button" className="ml-auto text-sm font-medium text-red-600 hover:underline" onClick={cancelBreak}>
              Remove break
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Opens the dialog – for a new break, or the running one. */
export function BreakButton({ className }: { className?: string }) {
  const { plan, today } = useData();
  const [open, setOpen] = useState(false);
  if (!plan) return null;
  const found = visibleBreak(plan, today);
  const current = found && breakPhase(found, today) !== 'comeback' ? found : null;
  return (
    <>
      <Button size="sm" variant="ghost" className={className} icon={<Thermometer className="h-4 w-4" />} onClick={() => setOpen(true)}>
        {current ? 'Change break' : 'Sick or injured?'}
      </Button>
      {open && <BreakDialog key={current?.id ?? 'new'} edit={current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Running, upcoming or just-finished break, with "I'm feeling better". */
export function BreakBanner({ className }: { className?: string }) {
  const { plan, workouts, activities, today } = useData();
  const { apply, busy } = useApplyBreak();
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState<BreakResult | null>(null);
  const toast = useToast();
  if (!plan) return null;
  const b = visibleBreak(plan, today);
  if (!b) return null;
  const phase = breakPhase(b, today);
  const Icon = ICON[b.kind];
  const total = daysBetween(b.from, b.to) + 1;

  if (phase === 'comeback') {
    return (
      <div className={cx('flex items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200', className)}>
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Easing back in</div>
          <p className="text-sky-900/80">
            Easy runs only until {fmtDate(addDays(b.comebackUntil!, -1), { weekday: 'long', day: 'numeric', month: 'short' })} – then the plan builds back up step by step. Listen to your body; one more easy day is never wrong.
          </p>
        </div>
      </div>
    );
  }

  const startEnding = () => {
    try {
      setEnding(endBreakEarly({ plan, workouts, activities, today, id: b.id }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <div className={cx('rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:p-5', className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 ring-1 ring-amber-200">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-amber-950">
                {phase === 'upcoming'
                  ? `${BREAK_LABEL[b.kind]} planned: ${fmtDate(b.from)} – ${fmtDate(b.to)}`
                  : `${BREAK_LABEL[b.kind]} · day ${daysBetween(b.from, today) + 1} of ${total}`}
              </div>
              <p className="text-sm text-amber-900/80">
                {phase === 'upcoming'
                  ? b.mode === 'easy'
                    ? 'Only easy runs and light sessions in that time.'
                    : 'Sessions in that time are paused.'
                  : `Back to training on ${fmtDate(addDays(b.to, 1), { weekday: 'long', day: 'numeric', month: 'short' })}. ${b.mode === 'easy' ? 'Easy runs only – keep them short.' : b.kind === 'sick' ? 'Rest, drink, sleep.' : 'No running until then.'}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {phase === 'active' && (
              <Button size="sm" variant="dark" onClick={startEnding}>
                I'm feeling better
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {phase === 'upcoming' ? 'Change' : 'Change or extend'}
            </Button>
          </div>
        </div>
      </div>
      {editing && <BreakDialog key={b.id} edit={b} onClose={() => setEditing(false)} />}
      {ending && (
        <Modal open onClose={() => setEnding(null)} title="Back to training today?">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Great to hear! {ending.break ? `Your break ends after ${daysBetween(ending.break.from, ending.break.to) + 1} day${ending.break.from === ending.break.to ? '' : 's'}.` : 'The break is removed.'}
            </p>
            <BreakPreview result={ending} draftDays={ending.break ? comeback(ending.break).days : 0} ending />
            {b.kind === 'sick' && <Notice tone="info">Only if the fever is gone and you feel normal again. The first runs should feel easy.</Notice>}
            <div className="flex gap-2">
              <Button
                loading={busy}
                onClick={async () => {
                  if (await apply(ending, 'Welcome back! Easy does it.')) setEnding(null);
                }}
              >
                Yes, I'm back
              </Button>
              <Button variant="ghost" onClick={() => setEnding(null)}>
                Not yet
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
