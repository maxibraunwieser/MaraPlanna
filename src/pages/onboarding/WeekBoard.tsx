// The week as seven days with the sessions on them. A session is dragged to another day (or moved with the arrows, which also work
// on a phone and with the keyboard); days with no time cannot take a session.

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Footprints } from 'lucide-react';
import { extraLabel } from '../../components/WeekBuilder';
import { cx } from '../../components/ui';
import { useI18n, type MsgKey } from '../../lib/i18n';
import { weekdayNames } from '../../lib/i18n/dates';
import type { DayTemplate, ExtraSession, Weekday } from '../../lib/types';

export type BoardItem = 'run' | 'strength';
export interface BoardMove {
  item: BoardItem;
  from: Weekday;
  to: Weekday;
}

const RUN_TONE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-800',
  quality: 'bg-orange-100 text-orange-800',
  long: 'bg-sky-100 text-sky-800',
  recovery: 'bg-teal-100 text-teal-800',
};
const STRENGTH_IDS = ['lower', 'upper', 'full', 'cali'];

interface Chip {
  item: BoardItem | 'other';
  /** Extra id for strength and other sessions. */
  id?: string;
  label: string;
  tone: string;
}

export function WeekBoard({
  week, extras, unavailable, minutes, onMove, onOpen, runsOnly = false, lockRuns = false, readOnly = false,
}: {
  week: DayTemplate[];
  extras: ExtraSession[];
  unavailable: Weekday[];
  minutes?: (number | null)[];
  onMove: (move: BoardMove) => void;
  /** A strength session was clicked (its extra id: lower, upper or full). */
  onOpen?: (id: string) => void;
  /** Only the runs are shown (before the strength questions). */
  runsOnly?: boolean;
  /** The runs stay on their days (a running plan that is kept); only strength sessions move. */
  lockRuns?: boolean;
  /** Nothing moves (the week is only shown). */
  readOnly?: boolean;
}) {
  const { t, lang } = useI18n();
  const short = weekdayNames(lang);
  const long = weekdayNames(lang, 'long');
  const [drag, setDrag] = useState<{ item: BoardItem; from: Weekday } | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const chipsOf = (d: number): Chip[] => {
    const out: Chip[] = [];
    if (week[d].run !== 'rest') out.push({ item: 'run', label: t(`run.${week[d].run}` as MsgKey), tone: RUN_TONE[week[d].run] });
    if (!runsOnly) {
      for (const id of week[d].extras) {
        const strength = STRENGTH_IDS.includes(id);
        const e = extras.find((x) => x.id === id);
        out.push({ item: strength ? 'strength' : 'other', id, label: strength ? t(`kind.${id}` as MsgKey) : e ? extraLabel(e) : id, tone: strength ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600' });
      }
    }
    return out;
  };
  const has = (d: number, item: BoardItem) => chipsOf(d).some((c) => c.item === item);
  // With the runs locked, a strength session never goes onto the day of the long run.
  const canDrop = (item: BoardItem, from: number, to: number) => to !== from && !unavailable.includes(to as Weekday) && !has(to, item) && !(lockRuns && item === 'strength' && week[to].run === 'long');
  /** The next day in a direction that can take the session (skipping days with no time and days that have one). */
  const neighbour = (item: BoardItem, from: number, dir: 1 | -1): Weekday | null => {
    for (let i = 1; i < 7; i++) {
      const to = (from + dir * i + 7 * 7) % 7;
      if (canDrop(item, from, to)) return to as Weekday;
    }
    return null;
  };
  const time = (d: number) => {
    const m = minutes?.[d];
    if (m === 0) return t('ob.board.noTime');
    if (m === null || m === undefined) return '';
    return m >= 120 ? t('ob.minutes.unlimited') : t('ob.minutes.value', { m });
  };

  return (
    <ol className="space-y-1.5" data-testid="week-board" aria-label={t('week.preview')}>
      {week.map((_, d) => {
        const chips = chipsOf(d);
        const blocked = unavailable.includes(d as Weekday);
        const droppable = !!drag && canDrop(drag.item, drag.from, d);
        return (
          <li
            key={d}
            data-day={d}
            onDragOver={(e) => {
              if (droppable) {
                e.preventDefault();
                setOver(d);
              }
            }}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && canDrop(drag.item, drag.from, d)) onMove({ item: drag.item, from: drag.from, to: d as Weekday });
              setDrag(null);
              setOver(null);
            }}
            className={cx(
              'flex min-h-14 items-center gap-3 rounded-xl p-2.5 ring-1 transition',
              blocked ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-200',
              droppable && 'ring-2 ring-brand/40',
              over === d && droppable && 'bg-brand-soft ring-2 ring-brand',
            )}
          >
            <div className="w-20 shrink-0 sm:w-24">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{short[d]}</div>
              <div className="text-[11px] text-slate-400">{time(d)}</div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {chips.map((c) => {
                const movable = !readOnly && (c.item === 'strength' || (c.item === 'run' && !lockRuns));
                const prev = movable ? neighbour(c.item as BoardItem, d, -1) : null;
                const nextDay = movable ? neighbour(c.item as BoardItem, d, 1) : null;
                const name = `${c.label}, ${long[d]}`;
                return (
                  <div
                    key={`${c.item}-${c.id ?? ''}`}
                    data-item={c.item}
                    data-day={d}
                    draggable={movable}
                    onDragStart={(e) => {
                      if (!movable) return;
                      e.dataTransfer.setData('text/plain', `${c.item}:${d}`);
                      e.dataTransfer.effectAllowed = 'move';
                      setDrag({ item: c.item as BoardItem, from: d as Weekday });
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                    className={cx('flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold leading-tight', c.tone, movable && 'cursor-grab active:cursor-grabbing', drag?.from === d && drag.item === c.item && 'opacity-50')}
                  >
                    {movable && (
                      <button type="button" aria-label={t('ob.board.moveLeft', { name })} disabled={prev === null} onClick={() => prev !== null && onMove({ item: c.item as BoardItem, from: d as Weekday, to: prev })} className="rounded p-0.5 hover:bg-white/60 disabled:opacity-25">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {c.item === 'strength' && onOpen ? (
                      <button type="button" onClick={() => onOpen(c.id!)} className="flex items-center gap-1 whitespace-nowrap px-1 underline decoration-dotted underline-offset-2" aria-label={t('ob.board.open', { name: c.label })}>
                        <Dumbbell className="h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-nowrap">{c.label}</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 px-1">
                        {c.item === 'run' && <Footprints className="h-3.5 w-3.5 shrink-0" />}
                        <span className="whitespace-nowrap">{c.label}</span>
                      </span>
                    )}
                    {movable && (
                      <button type="button" aria-label={t('ob.board.moveRight', { name })} disabled={nextDay === null} onClick={() => nextDay !== null && onMove({ item: c.item as BoardItem, from: d as Weekday, to: nextDay })} className="rounded p-0.5 hover:bg-white/60 disabled:opacity-25">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {chips.length === 0 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">{blocked ? t('ob.board.noTime') : t('run.rest')}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
