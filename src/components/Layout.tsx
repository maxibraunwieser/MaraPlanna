import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Home, ListChecks, MessageCircle, RefreshCw, Settings, TrendingUp, Watch } from 'lucide-react';
import { useData } from '../lib/data';
import { fmtRelative } from '../lib/format';
import { cx } from './ui';

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill={light ? '#ffffff' : '#0b1220'} />
        <path d="M12 44 L24 22 L32 36 L40 18 L52 44" fill="none" stroke="#f97316" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="40" cy="18" r="4" fill="#a3e635" />
      </svg>
      <span className={light ? 'text-white' : 'text-ink'}>
        Mara<span className="text-brand">Planna</span>
      </span>
    </span>
  );
}

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/coach', label: 'Coach', icon: MessageCircle },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/activities', label: 'Activities', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SyncBadge() {
  const { connection, syncing, syncNow } = useData();
  if (!connection) {
    return (
      <NavLink to="/connect" className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 sm:inline-flex">
        <Watch className="h-3.5 w-3.5" /> Connect Garmin
      </NavLink>
    );
  }
  const ok = connection.status === 'connected';
  return (
    <button
      onClick={() => syncNow()}
      disabled={syncing}
      title={connection.last_sync_error ?? undefined}
      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
    >
      <span className={cx('h-2 w-2 rounded-full', ok ? 'bg-lime' : 'bg-red-400')} />
      <RefreshCw className={cx('h-3.5 w-3.5', syncing && 'animate-spin')} />
      <span className="hidden sm:inline">{syncing ? 'Syncing…' : ok ? `Garmin · ${fmtRelative(connection.last_sync_at)}` : 'Garmin needs attention'}</span>
    </button>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <NavLink to="/">
            <Logo light className="text-lg" />
          </NavLink>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx('rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <SyncBadge />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-6">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-slate-500')}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function CenteredPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-ink via-ink-soft to-ink px-4 py-10">
      <div className={cx('mx-auto', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-8 flex justify-center">
          <Logo light className="text-2xl" />
        </div>
        {children}
      </div>
    </div>
  );
}
