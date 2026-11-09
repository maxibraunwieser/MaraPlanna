import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { tr } from '../lib/i18n';
import { animateSpring, project, reducedMotion, rubberband, SHEET, SMOOTH } from '../lib/spring';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        variant === 'primary' && 'bg-brand text-white shadow-sm hover:bg-brand-dark',
        variant === 'secondary' && 'bg-white text-slate-800 ring-1 ring-white/20 hover:bg-white/10',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'dark' && 'bg-white/15 text-white ring-1 ring-white/20 hover:bg-white/25',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-3xl bg-white p-5 shadow-lg shadow-black/10 ring-1 ring-white/10', className)} {...rest}>{children}</div>;
}

export function CardTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        {icon}
        {children}
      </h2>
      {action && <div className="shrink-0 [&_button]:whitespace-nowrap">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Badge({ tone = 'slate', children, className }: { tone?: 'slate' | 'green' | 'amber' | 'red' | 'orange' | 'blue' | 'violet'; children: ReactNode; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-800',
    blue: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  };
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cx('flex gap-3 rounded-xl px-4 py-3 text-sm ring-1', styles[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'pr-8', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-24', props.className)} />;
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  columns,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  columns?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition',
            value === o.value ? 'bg-brand-soft ring-2 ring-brand text-slate-900' : 'bg-white ring-slate-300 text-slate-700 hover:ring-slate-400',
          )}
        >
          <span className="block font-semibold">{o.label}</span>
          {o.hint && <span className="mt-0.5 block text-xs text-slate-500">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 text-left">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition', checked ? 'left-5.5' : 'left-0.5')} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/** Open dialogs, the top one last: Escape closes only that one (a picture opened inside an editor closes alone). */
const openModals: symbol[] = [];

/** A phone-sized screen: dialogs are sheets from the bottom that can be pulled down. */
const sheetScreen = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 639px)').matches;

/**
 * A dialog. On a phone it is a sheet: it slides up from the bottom, follows the finger 1:1 when pulled by its grabber or title
 * (softly resisting upwards), and on release goes where the gesture was heading: closed when the flick projects past half its
 * height, otherwise back with a little spring. It leaves the way it came, also when closed with X, the backdrop or Escape.
 */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const y = useRef(0);
  const stop = useRef<(() => void) | null>(null);
  const drag = useRef<{ id: number; startY: number; from: number; samples: { t: number; y: number }[] } | null>(null);
  const closing = useRef(false);
  // The parent hands a new onClose on every render: keep the latest without restarting anything (a running close must go on).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const set = useCallback((v: number) => {
    y.current = v;
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = v ? `translate3d(0, ${v}px, 0)` : '';
    const h = el.offsetHeight || 1;
    if (backRef.current) backRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h)));
  }, []);

  /** Close the way it came: down off the screen, then tell the parent. */
  const close = useCallback((velocity = 0) => {
    if (closing.current) return;
    const el = sheetRef.current;
    if (!el || !sheetScreen() || reducedMotion()) return onCloseRef.current();
    closing.current = true;
    stop.current?.();
    stop.current = animateSpring({ from: y.current, to: el.offsetHeight + 24, velocity, params: SMOOTH, onUpdate: set, onDone: () => onCloseRef.current() });
  }, [set]);

  useEffect(() => {
    if (!open) return;
    closing.current = false;
    const id = Symbol('modal');
    openModals.push(id);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openModals[openModals.length - 1] === id && close();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(id), 1);
      if (!openModals.length) document.body.style.overflow = '';
    };
  }, [open, close]);
  // stop a running animation only when the dialog goes away
  useEffect(() => () => stop.current?.(), []);

  // Arrive from the bottom (on a phone, unless the person asked for less motion).
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!open || !el || !sheetScreen() || reducedMotion()) return;
    set(el.offsetHeight);
    stop.current = animateSpring({ from: el.offsetHeight, to: 0, params: SMOOTH, onUpdate: set });
  }, [open, set]);

  if (!open) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheetScreen() || (e.target as HTMLElement).closest('button')) return;
    stop.current?.(); // grab it mid-flight, from where it is now
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, from: y.current, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = d.from + e.clientY - d.startY;
    set(raw < 0 ? rubberband(raw, sheetRef.current?.offsetHeight ?? 600) : raw);
    d.samples = [...d.samples.filter((x) => e.timeStamp - x.t < 100), { t: e.timeStamp, y: e.clientY }];
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const velocity = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const h = sheetRef.current?.offsetHeight ?? 600;
    // where the flick is heading decides, not where the finger let go
    if (y.current + project(velocity) > h / 2) return close(velocity);
    stop.current = animateSpring({ from: y.current, to: 0, velocity, params: SHEET, onUpdate: set });
  };
  const grab = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={() => close()}>
      <div ref={backRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        ref={sheetRef}
        className={cx('relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-5 shadow-xl ring-1 ring-white/10 will-change-transform sm:rounded-3xl sm:p-6', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* grabber and title: the part of the sheet the finger can pull (the content below keeps scrolling) */}
        <div className="sticky top-0 z-10 -mx-5 touch-none bg-surface/95 px-5 pt-2 backdrop-blur sm:static sm:mx-0 sm:touch-auto sm:bg-transparent sm:px-0 sm:pt-0" {...grab}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25 sm:hidden" aria-hidden />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="text-lg font-semibold tracking-[-0.01em] text-slate-900">{title}</div>
            <button onClick={() => close()} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={tr('common.close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastTone = 'info' | 'success' | 'error';
export type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: ToastTone; action?: ToastAction };
const ToastContext = createContext<(message: string, tone?: ToastTone, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, tone, action }]);
      setTimeout(() => dismiss(id), action ? 10000 : tone === 'error' ? 8000 : 6000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ring-1',
              t.tone === 'success' && 'bg-emerald-600 text-white ring-emerald-700',
              t.tone === 'error' && 'bg-red-600 text-white ring-red-700',
              t.tone === 'info' && 'bg-ink text-white ring-slate-800',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.action && (
                <button
                  className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25"
                  onClick={() => {
                    dismiss(t.id);
                    t.action!.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
