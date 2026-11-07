// Small building blocks of the setup: labels with a "why do we ask" hint, chips, option cards, source badges, a slider.

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check, Info, Watch } from 'lucide-react';
import { Badge, cx, Input } from '../../components/ui';
import { fmtDuration, parseTime } from '../../lib/format';
import { useI18n, type MsgKey, type Translate } from '../../lib/i18n';
import type { Source } from '../../lib/types';

/** Message for an error code of validateStep (`err.<code>`); unknown codes still show something. */
export const errText = (t: Translate, code: string | undefined): string | null => (code ? t(`err.${code}` as MsgKey) : null);

/** Info icon that opens a short reason why the question is asked. */
export function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { t } = useI18n();
  return (
    <span className="inline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={t('why.label')}
        className={cx('ml-1 inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full transition', open ? 'bg-brand-soft text-brand' : 'text-slate-400 hover:text-slate-700')}
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span id={id} role="note" className="mt-1.5 block rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
          {text}
        </span>
      )}
    </span>
  );
}

/** A question: label (with * when required and the reason why we ask), the control, a hint and the inline error. */
export function Question({
  label, required, why, hint, error, children, className,
}: {
  label: ReactNode;
  required?: boolean;
  why?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className} aria-describedby={error ? id : undefined}>
      <div className="mb-1.5 text-sm font-medium text-slate-800">
        {label}
        {required && <span className="ml-0.5 text-brand" aria-hidden>*</span>}
        {why && <Why text={why} />}
      </div>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium ring-1 transition disabled:opacity-40',
        on ? 'bg-brand-soft text-slate-900 ring-2 ring-brand' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-400',
      )}
    >
      {on && <Check className="h-3.5 w-3.5 text-brand" />}
      {children}
    </button>
  );
}

/** A big selectable card: icon, title, one line of text, an optional badge ("coming soon"). */
export function OptionCard({
  on, onClick, icon, title, text, badge, disabled, role = 'radio',
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  role?: 'radio' | 'checkbox';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition',
        on ? 'bg-brand-soft ring-2 ring-brand' : 'bg-white ring-slate-300 hover:ring-slate-400',
        disabled && 'cursor-not-allowed opacity-60 hover:ring-slate-300',
      )}
    >
      {icon && <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', on ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {badge}
        </span>
        {text && <span className="mt-0.5 block text-xs leading-snug text-slate-500">{text}</span>}
      </span>
      {on && <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />}
    </button>
  );
}

/** Where a value came from: Garmin, typed by the person, or estimated. */
export function SourceBadge({ source, when }: { source: Source | null | undefined; when?: string | null }) {
  const { t } = useI18n();
  if (!source) return null;
  if (source === 'garmin')
    return (
      <Badge tone="blue" className="gap-1" >
        <Watch className="h-3 w-3" />
        {t('src.garmin')}
        {when ? ` · ${when}` : ''}
      </Badge>
    );
  if (source === 'estimated') return <Badge tone="amber">{t('src.estimated')}</Badge>;
  return <Badge tone="slate">{t('src.manual')}</Badge>;
}

export function Slider({
  value, min, max, step = 1, onChange, label, display,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  display: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-2 flex-1 cursor-pointer accent-brand"
      />
      <span className="w-20 shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-800">{display}</span>
    </div>
  );
}

export function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const textOf = (n: number | null) => (n === null || Number.isNaN(n) ? '' : String(n));
const numOf = (text: string): number | null => {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** A number field that keeps what is being typed ("5.") while the value outside stays a clean number or null. */
export function NumField({
  value, onChange, onBlur, placeholder, suffix, min, max, step, label, invalid, className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(textOf(value));
  useEffect(() => {
    if (numOf(text) !== value) setText(textOf(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cx('relative', className)}>
      <Input
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        min={min}
        max={max}
        step={step}
        className={cx(suffix && 'pr-12', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-200')}
        onChange={(e) => {
          setText(e.target.value);
          onChange(numOf(e.target.value));
        }}
        onBlur={() => {
          setText(textOf(numOf(text)));
          onBlur?.();
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">{suffix}</span>}
    </div>
  );
}

/** h:mm:ss (or m:ss) field: keeps the typed text, reports seconds or null. */
export function TimeField({
  value, onChange, onBlur, placeholder = 'h:mm:ss', label, invalid, className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  label?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value ? fmtDuration(value) : '');
  useEffect(() => {
    if ((text.trim() ? parseTime(text) : null) !== value) setText(value ? fmtDuration(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      className={cx(invalid && 'border-red-400 focus:border-red-500 focus:ring-red-200', className)}
      inputMode="numeric"
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() ? parseTime(e.target.value) : null);
      }}
      onBlur={() => {
        if (value) setText(fmtDuration(value));
        onBlur?.();
      }}
    />
  );
}

/** One choice of a list of cards (single choice). */
export interface ChoiceOption<V> {
  value: V;
  title: ReactNode;
  text?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Cards, one of which is picked (radio group). */
export function Choice<V extends string | number | boolean>({
  value, onChange, options, columns = 1, label,
}: {
  value: V | null | undefined;
  onChange: (v: V) => void;
  options: ChoiceOption<V>[];
  columns?: 1 | 2 | 3;
  label: string;
}) {
  const grid = columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : '';
  return (
    <div className={cx('grid gap-2.5', grid)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <OptionCard key={String(o.value)} on={value === o.value} onClick={() => onChange(o.value)} title={o.title} text={o.text} badge={o.badge} icon={o.icon} disabled={o.disabled} />
      ))}
    </div>
  );
}

/** Chips, any number of which can be on (multiple choice). */
export function MultiChips<V extends string | number>({
  values, onChange, options, label,
}: {
  values: readonly V[];
  onChange: (next: V[]) => void;
  options: { value: V; label: ReactNode; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={String(o.value)} on={values.includes(o.value)} disabled={o.disabled} onClick={() => onChange(values.includes(o.value) ? values.filter((x) => x !== o.value) : [...values, o.value])}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/** A checkbox row with text (consent, switches). */
export function CheckRow({ checked, onChange, children, hint, required }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode; required?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 transition', checked ? 'bg-brand-soft ring-2 ring-brand' : 'bg-white ring-slate-300 hover:ring-slate-400')}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1 text-sm text-slate-800">
        {children}
        {required && <span className="ml-0.5 text-brand" aria-hidden>*</span>}
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}
