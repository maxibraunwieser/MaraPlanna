// Moving workouts: one code path for the Move dialog and drag & drop, with Undo.

import { useState, useSyncExternalStore, type DragEvent, type HTMLAttributes } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { PlannedWorkout } from '../lib/types';
import type { WorkoutPatch } from '../lib/planner/adapt';
import { canMove, inBounds, moveBounds, movePatches, moveWarnings, swapCandidate } from '../lib/planner/move';
import { fmtDate } from '../lib/format';
import { useData } from '../lib/data';
import * as api from '../lib/api';
import { Button, Modal, Notice, useToast } from './ui';

export type Patches = { id: string; patch: WorkoutPatch }[];

/** Save moves, then offer Undo (restores date, status and note of every touched workout). */
export function useMoveWorkout() {
  const { workouts, reload, adapt } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const save = async (patches: Patches) => {
    await Promise.all(patches.map((p) => api.updateWorkout(p.id, p.patch)));
    await reload();
    await adapt();
  };

  const move = async (patches: Patches, message: string) => {
    const before: Patches = patches.flatMap((p) => {
      const w = workouts.find((x) => x.id === p.id);
      return w ? [{ id: w.id, patch: { date: w.date, original_date: w.original_date, status: w.status, status_source: w.status_source, note: w.note } }] : [];
    });
    setBusy(true);
    try {
      await save(patches);
      toast(message, 'success', {
        label: 'Undo',
        onClick: () => {
          save(before).then(
            () => toast('Move undone.', 'info'),
            (e) => toast((e as Error).message, 'error'),
          );
        },
      });
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { move, busy };
}

// ---------------------------------------------------------------------------
// Drag & drop (desktop; touch devices use the Move dialog)
// ---------------------------------------------------------------------------

// Which workout is being dragged – shared by every day grid on the page.
let draggingId: string | null = null;
const listeners = new Set<() => void>();
const setDragging = (id: string | null) => {
  draggingId = id;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type DropState = 'target' | 'over' | 'blocked' | null;

/** Outline/opacity classes for a day cell while something is dragged. */
export const dropClass = (s: DropState) =>
  s === 'over'
    ? 'outline-2 outline-solid outline-brand bg-brand-soft'
    : s === 'target'
      ? 'outline-2 outline-dashed outline-brand/40'
      : s === 'blocked'
        ? 'opacity-40'
        : '';

export function useWorkoutDnd() {
  const { plan, workouts, today } = useData();
  const mover = useMoveWorkout();
  const id = useSyncExternalStore(subscribe, () => draggingId);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<{ w: PlannedWorkout; date: string } | null>(null);
  const bounds = plan ? moveBounds(today, plan.race_date) : null;
  const dragging = id ? (workouts.find((w) => w.id === id) ?? null) : null;
  const valid = (date: string) => !!dragging && !!bounds && date !== dragging.date && inBounds(date, bounds);

  const drop = (w: PlannedWorkout, date: string) => {
    const swap = swapCandidate(workouts, w, date, today);
    const warnings = moveWarnings(workouts, movePatches(workouts, w, date, today, !!swap));
    if (swap || warnings.length) setPending({ w, date });
    else void mover.move(movePatches(workouts, w, date, today, false), `${w.title} moved to ${fmtDate(date)}.`);
  };

  const dragProps = (w: PlannedWorkout): HTMLAttributes<HTMLDivElement> =>
    canMove(w) && !mover.busy
      ? {
          draggable: true,
          onDragStart: (e: DragEvent<HTMLDivElement>) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', w.id);
            setDragging(w.id);
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
        }
      : {};

  const dropProps = (date: string): HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => {
      if (!valid(date)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== date) setOver(date);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === date ? null : o));
    },
    onDrop: (e) => {
      e.preventDefault();
      const w = dragging;
      setDragging(null);
      setOver(null);
      if (w && valid(date)) drop(w, date);
    },
  });

  const dropState = (date: string): DropState => (!dragging ? null : !valid(date) ? (date === dragging.date ? null : 'blocked') : over === date ? 'over' : 'target');

  const dialog = pending ? <MoveConfirm {...pending} busy={mover.busy} onClose={() => setPending(null)} onMove={async (p, msg) => (await mover.move(p, msg)) && setPending(null)} /> : null;

  return { dragProps, dropProps, dropState, isDragging: (w: PlannedWorkout) => id === w.id, dialog, busy: mover.busy };
}

/** Shown when a drop needs a decision: swap with the run that's there, or warnings. */
function MoveConfirm({ w, date, busy, onClose, onMove }: { w: PlannedWorkout; date: string; busy: boolean; onClose: () => void; onMove: (p: Patches, msg: string) => void }) {
  const { workouts, today } = useData();
  const swap = swapCandidate(workouts, w, date, today);
  const warnings = moveWarnings(workouts, movePatches(workouts, w, date, today, !!swap));
  return (
    <Modal open onClose={onClose} title={`Move ${w.title}?`}>
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">{fmtDate(w.date)}</span>
          <ArrowRightLeft className="h-4 w-4 text-slate-400" />
          <span className="font-medium">{fmtDate(date)}</span>
        </p>
        {swap && (
          <p className="text-sm text-slate-600">
            "{swap.title}" is already on that day. <b>Swap days</b> puts it on {fmtDate(w.date)} instead.
          </p>
        )}
        {warnings.map((m) => (
          <Notice key={m} tone="warn">{m}</Notice>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          {swap && (
            <Button loading={busy} icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => onMove(movePatches(workouts, w, date, today, true), `Swapped with ${swap.title}.`)}>
              Swap days
            </Button>
          )}
          <Button variant={swap ? 'secondary' : 'primary'} loading={busy} onClick={() => onMove(movePatches(workouts, w, date, today, false), `${w.title} moved to ${fmtDate(date)}.`)}>
            {swap ? 'Move – keep both' : 'Move anyway'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
