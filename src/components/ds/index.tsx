// Building blocks of the design system (design-system/MASTER.md). Only ds- tokens, lucide icons, no raw colours.

import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../ui';
import { currentLang } from '../../lib/i18n';
import { MUSCLES, muscleLabel, type Muscle, type MuscleLoad } from '../../lib/exerciseInfo';

/** The colour token of a muscle (identical to the exercise-animations skill). */
export const MUSCLE_COLOR: Record<Muscle, string> = {
  chest: 'var(--color-ds-m-chest)', back: 'var(--color-ds-m-back)', shoulders: 'var(--color-ds-m-shoulders)', biceps: 'var(--color-ds-m-biceps)',
  triceps: 'var(--color-ds-m-triceps)', quads: 'var(--color-ds-m-quads)', hamstrings: 'var(--color-ds-m-hamstrings)', glutes: 'var(--color-ds-m-glutes)',
  calves: 'var(--color-ds-m-calves)', core: 'var(--color-ds-m-core)',
};
/** Secondary muscles are drawn at this share of their colour. */
export const SECONDARY_ALPHA = 0.45;
export const muscleFill = (m: Muscle, load: MuscleLoad) => (load === 'primary' ? MUSCLE_COLOR[m] : `color-mix(in oklab, ${MUSCLE_COLOR[m]} ${SECONDARY_ALPHA * 100}%, var(--color-ds-body))`);

const locale = () => (currentLang() === 'de' ? 'de-AT' : 'en-GB');
/** 23176 kg → "23,2 t"; below 10 t with thousands separators: "9.840 kg". */
export function fmtVolume(kg: number): { value: string; unit: string } {
  if (kg >= 10_000) return { value: new Intl.NumberFormat(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(kg / 1000), unit: 't' };
  return { value: new Intl.NumberFormat(locale(), { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Math.round(kg)), unit: 'kg' };
}
export const fmtInt = (n: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(n);

export function DsCard({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-ds-lg border border-ds-line bg-ds-surface p-4 sm:p-5', className)} {...rest}>{children}</div>;
}

export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-ds-title font-semibold text-ds-text">{title}</h2>
      {action}
    </div>
  );
}

/** Icon + number (+ unit). The meaning sits in the icon and the label (tooltip, screen reader), not in text under it. */
export function Stat({ icon: Icon, value, unit, label, size = 'body' }: { icon: LucideIcon; value: ReactNode; unit?: string; label: string; size?: 'body' | 'title' }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label} aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}`} role="img">
      <Icon className={cx('shrink-0 text-ds-text-3', size === 'title' ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden strokeWidth={2} />
      <span className={cx('font-semibold tabular-nums text-ds-text', size === 'title' ? 'text-ds-title' : 'text-ds-body')}>{value}</span>
      {unit && <span className="text-ds-caption text-ds-text-2">{unit}</span>}
    </span>
  );
}

/** Round chip in the muscle's colour; the name is its tooltip and label. */
export function MuscleChip({ muscle, load = 'primary' }: { muscle: Muscle; load?: MuscleLoad }) {
  const name = muscleLabel(muscle);
  return (
    <span
      className="inline-block h-7 w-7 shrink-0 rounded-full border-2 border-ds-surface"
      style={{ background: muscleFill(muscle, load) }}
      title={name}
      aria-label={name}
      role="img"
    />
  );
}

/** The muscles of a workout as chips: main ones first, at most `max` and a "+n". */
export function MuscleChips({ load, max = 6, className }: { load: Partial<Record<Muscle, MuscleLoad>>; max?: number; className?: string }) {
  const list = (['primary', 'secondary'] as const).flatMap((k) => MUSCLES.filter((m) => load[m] === k).map((m) => ({ m, k })));
  if (!list.length) return null;
  const shown = list.slice(0, max);
  return (
    <span className={cx('flex items-center -space-x-1.5', className)}>
      {shown.map(({ m, k }) => <MuscleChip key={m} muscle={m} load={k} />)}
      {list.length > max && <span className="ml-2.5 text-ds-caption font-semibold text-ds-text-2">+{list.length - max}</span>}
    </span>
  );
}

export type DayMark = 'done' | 'planned' | null;
export interface WeekDay {
  date: string;
  run: DayMark;
  strength: DayMark;
}

/** Monday to Sunday with a dot per kind of training (filled = done, ring = planned) and the week's progress. */
export function WeekStrip({ days, today, label, progressLabel }: { days: WeekDay[]; today: string; label: string; progressLabel: string }) {
  const lang = currentLang();
  const planned = days.reduce((n, d) => n + (d.run ? 1 : 0) + (d.strength ? 1 : 0), 0);
  const done = days.reduce((n, d) => n + (d.run === 'done' ? 1 : 0) + (d.strength === 'done' ? 1 : 0), 0);
  const dot = (mark: DayMark, color: string, kind: string) =>
    mark ? (
      <span
        className="h-2 w-2 rounded-full"
        style={mark === 'done' ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` }}
        aria-label={kind}
      />
    ) : null;
  return (
    <DsCard className="!p-3" aria-label={label}>
      <div className="flex items-stretch gap-1">
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const dt = new Date(`${d.date}T12:00:00Z`);
            const isToday = d.date === today;
            return (
              <li key={d.date} className={cx('flex min-h-14 flex-col items-center justify-center gap-1 rounded-ds-md', isToday && 'ring-2 ring-ds-accent')}>
                <span className="text-ds-caption text-ds-text-3">{dt.toLocaleDateString(lang === 'de' ? 'de-AT' : 'en-GB', { weekday: 'narrow', timeZone: 'UTC' })}</span>
                <span className={cx('text-ds-body tabular-nums', isToday ? 'font-semibold text-ds-text' : 'text-ds-text-2')}>{dt.getUTCDate()}</span>
                <span className="flex h-2 gap-1">
                  {dot(d.strength, 'var(--color-ds-strength)', 'strength')}
                  {dot(d.run, 'var(--color-ds-run)', 'run')}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex w-14 shrink-0 flex-col items-center justify-center border-l border-ds-line pl-1" aria-label={progressLabel} role="img">
          <span className="font-display text-ds-title font-bold tabular-nums text-ds-text">{done}<span className="text-ds-text-3">/{planned}</span></span>
        </div>
      </div>
    </DsCard>
  );
}
