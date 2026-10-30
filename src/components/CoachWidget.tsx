import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { CoachChat } from './CoachChat';
import { cx } from './ui';

/**
 * The coach as a chat bubble: a round button fixed at the bottom right of every page that opens
 * the conversation as a pop-up (a full-screen sheet on phones). The conversation is only loaded
 * once it is opened for the first time, and stays alive when closed, so an answer that is still
 * being written is not lost; the button shows when something new arrived.
 */
export function CoachWidget() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);

  const show = () => {
    setEverOpened(true);
    setUnread(false);
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const markUnread = useCallback(() => setUnread(true), []);

  // Escape closes the window; on phones the page behind it does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const phone = window.matchMedia('(max-width: 639px)').matches;
    const previous = document.body.style.overflow;
    if (phone) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div
        role="dialog"
        aria-label="Coach chat"
        aria-hidden={!open}
        className={cx(
          'fixed z-50 flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-900/10 transition duration-200 ease-out',
          // phone: the whole screen; larger screens: a window above the button
          'inset-0 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(44rem,calc(100dvh-11rem))] sm:w-[26rem] sm:rounded-2xl',
          open ? 'visible translate-y-0 scale-100 opacity-100' : 'pointer-events-none invisible translate-y-4 scale-95 opacity-0',
        )}
      >
        {everOpened && <CoachChat open={open} onClose={close} onBusy={setBusy} onUnread={markUnread} />}
      </div>

      <button
        onClick={() => (open ? close() : show())}
        aria-label={open ? 'Close coach chat' : 'Open coach chat'}
        aria-expanded={open}
        title="Ask your coach"
        className={cx(
          'fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-orange-500/30 transition hover:scale-105 hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40',
          // above the bottom navigation on phones; in the corner on larger screens
          'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6',
          // on a phone the open window covers the screen, so the button gives way
          open && 'max-sm:invisible',
        )}
      >
        <span className={cx('absolute transition duration-200', open ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')}>
          <MessageCircle className="h-6 w-6" />
        </span>
        <span className={cx('absolute transition duration-200', open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')}>
          <X className="h-6 w-6" />
        </span>
        {!open && busy && <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" aria-hidden />}
        {!open && unread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center" aria-label="New answer">
            <span className="absolute h-4 w-4 animate-ping rounded-full bg-lime/70" />
            <span className="relative h-3.5 w-3.5 rounded-full bg-lime ring-2 ring-white" />
          </span>
        )}
      </button>
    </>
  );
}
