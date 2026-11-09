import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { reducedMotion } from '../lib/spring';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, ClipboardCheck, Dumbbell, Footprints, History, Home, ListChecks, RefreshCw, Salad, Settings, TrendingUp, Utensils, Watch, type LucideIcon } from 'lucide-react';
import { useData } from '../lib/data';
import { fmtRelative } from '../lib/format';
import { cx } from './ui';
import { CoachWidget } from './CoachWidget';
import { LanguageSwitch } from './LanguageSwitch';
import { useI18n, type MsgKey } from '../lib/i18n';

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

interface SubItem {
  to: string;
  label: MsgKey;
  icon: LucideIcon;
  match: (pathname: string, query: URLSearchParams) => boolean;
}

interface Section {
  to: string;
  label: MsgKey;
  icon: LucideIcon;
  end?: boolean;
  /** The section the current page belongs to. */
  owns: (pathname: string) => boolean;
  /** Pages of the section: shown in the child navigation above the main navigation. */
  sub?: SubItem[];
}

// The main navigation: Today, Plan, Running, Strength, Food. Running, Strength and Food have three pages each.
const SECTIONS: Section[] = [
  { to: '/', label: 'nav.today', icon: Home, end: true, owns: (p) => p === '/' },
  { to: '/plan', label: 'nav.plan', icon: CalendarDays, owns: (p) => p.startsWith('/plan') },
  {
    to: '/progress',
    label: 'nav.run',
    icon: Footprints,
    owns: (p) => ['/activities', '/progress', '/analysis'].some((x) => p.startsWith(x)),
    sub: [
      { to: '/progress', label: 'nav.run.report', icon: ClipboardCheck, match: (p) => p === '/progress' },
      { to: '/progress/forecast', label: 'nav.run.forecast', icon: TrendingUp, match: (p) => p.startsWith('/progress/forecast') },
      { to: '/activities', label: 'nav.activities', icon: ListChecks, match: (p) => p.startsWith('/activities') || p.startsWith('/analysis') },
    ],
  },
  {
    to: '/strength',
    label: 'nav.strength',
    icon: Dumbbell,
    owns: (p) => p.startsWith('/strength'),
    sub: [
      { to: '/strength', label: 'sg.tab.workouts', icon: Dumbbell, match: (_p, q) => !q.get('tab') || q.get('tab') === 'workouts' },
      { to: '/strength?tab=progress', label: 'sg.tab.progress', icon: TrendingUp, match: (_p, q) => q.get('tab') === 'progress' },
      { to: '/strength?tab=history', label: 'sg.tab.history', icon: History, match: (_p, q) => q.get('tab') === 'history' },
    ],
  },
  {
    to: '/food',
    label: 'nav.food',
    icon: Utensils,
    owns: (p) => p.startsWith('/food'),
    sub: [
      { to: '/food', label: 'nav.food.diary', icon: Salad, match: (p) => p === '/food' },
      { to: '/food/plan', label: 'nav.food.plan', icon: CalendarDays, match: (p) => p.startsWith('/food/plan') },
      { to: '/food/recipes', label: 'nav.food.recipes', icon: BookOpen, match: (p) => p.startsWith('/food/recipes') },
    ],
  },
];

/** The pages of a section as pills: the row under the header on larger screens. */
function SubTabs({ section }: { section: Section }) {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search);
  return (
    <nav className="mb-6 hidden w-fit gap-1 rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10 sm:flex" aria-label={t(section.label)}>
      {section.sub!.map((x) => (
        <Link key={x.to} to={x.to} aria-current={x.match(pathname, query) ? 'page' : undefined} className={cx('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition', x.match(pathname, query) ? 'bg-white/15 text-brand' : 'text-slate-300 hover:text-white')}>
          <x.icon className="h-4 w-4" /> {t(x.label)}
        </Link>
      ))}
    </nav>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** True once content scrolls under the header: only then does the header become a material (a scroll edge, not a fixed bar). */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return scrolled;
}

/** A new page arrives softly from slightly below (only a fade when less motion is asked for); nothing is remounted for it. */
function usePageIn(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current) { first.current = false; return; }
    if (!el || typeof el.animate !== 'function') return;
    const frames = reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 1, transform: 'none' }];
    el.animate(frames, { duration: reducedMotion() ? 160 : 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
  }, [key]);
  return ref;
}

/** The selection of a tab bar: one pill that glides to the chosen tab, so the eye follows where it went. */
function TabPill({ index, count }: { index: number; count: number }) {
  return (
    <span
      aria-hidden
      className="tab-pill pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/15"
      style={{ width: `calc((100% - ${(count - 1) * 4}px) / ${count})`, transform: `translate3d(calc(${Math.max(0, index)} * (100% + 4px)), 0, 0)`, opacity: index < 0 ? 0 : 1 }}
    />
  );
}

function SyncBadge() {
  const { connection, syncing, syncNow } = useData();
  const { t } = useI18n();
  if (!connection) {
    return (
      <NavLink to="/connect" aria-label={t('sync.connect')} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20">
        <Watch className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('sync.connect')}</span>
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
      <span className="hidden sm:inline">{syncing ? t('sync.syncing') : ok ? t('sync.ok', { when: fmtRelative(connection.last_sync_at) }) : t('sync.attention')}</span>
    </button>
  );
}

export function AppLayout() {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const home = pathname === '/';
  const query = new URLSearchParams(search);
  const index = SECTIONS.findIndex((x) => x.owns(pathname));
  const section = index >= 0 ? SECTIONS[index] : null;
  const sub = section?.sub ?? null;
  const subIndex = sub ? sub.findIndex((x) => x.match(pathname, query)) : -1;
  const scrolled = useScrolled();
  const pageRef = usePageIn(pathname + search);
  return (
    <div className={cx('fluid min-h-dvh sm:pb-0', sub ? 'pb-44' : 'pb-28')} style={{ '--fab-bottom': sub ? '9.3rem' : '6rem' } as CSSProperties}>
      <ScrollToTop />
      <header className="chrome sticky top-0 z-40 pt-[env(safe-area-inset-top)]" data-scrolled={scrolled}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <NavLink to="/">
            <Logo light className="text-lg" />
          </NavLink>
          <nav className="hidden items-center gap-1 sm:flex">
            {SECTIONS.map((n, i) => (
              <Link key={n.to} to={n.to} className={cx('rounded-lg px-3 py-2 text-sm font-medium transition', i === index ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white')}>
                {t(n.label)}
              </Link>
            ))}
            <NavLink to="/settings" className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white')}>
              {t('nav.settings')}
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <LanguageSwitch />
            <NavLink
              to="/settings"
              aria-label={t('nav.settings')}
              className={({ isActive }) => cx('rounded-full p-2 sm:hidden', home && 'hidden', isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white')}
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {section?.sub && <SubTabs section={section} />}
        <div ref={pageRef}>
          <Outlet />
        </div>
      </main>

      {/* phone: the child navigation floats above the main navigation, its arrow points at the section it belongs to */}
      {sub && (
        <div className="fixed inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-40 sm:hidden" data-testid="child-nav">
          <nav className="tab-bar relative grid grid-cols-3 gap-1 rounded-full p-1.5 ring-1 ring-white/10" aria-label={t(section!.label)}>
            <div className="pointer-events-none absolute inset-1.5"><TabPill index={subIndex} count={sub.length} /></div>
            {sub.map((x) => {
              const active = x.match(pathname, query);
              return (
                <Link key={x.to} to={x.to} aria-current={active ? 'page' : undefined} className={cx('tab relative flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium', active ? 'text-brand' : 'text-slate-400')}>
                  <x.icon className="h-4 w-4" />
                  <span className="truncate">{t(x.label)}</span>
                </Link>
              );
            })}
          </nav>
          <span
            aria-hidden
            className="tab-arrow absolute top-full z-10 -mt-px block h-2.5 w-5 bg-brand"
            style={{ left: `calc(6px + (100% - 12px) * ${(index + 0.5) / SECTIONS.length} - 10px)`, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
          />
        </div>
      )}

      <nav className="tab-bar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-full p-1.5 ring-1 ring-white/10 sm:hidden">
        <div className="relative grid grid-cols-5 gap-1">
          <TabPill index={index} count={SECTIONS.length} />
          {SECTIONS.map((n, i) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={i === index ? 'page' : undefined}
              className={cx('tab relative flex flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-medium', i === index ? 'text-brand' : 'text-slate-400')}
            >
              <n.icon className="h-5 w-5" />
              {t(n.label)}
            </Link>
          ))}
        </div>
      </nav>
      <CoachWidget />
    </div>
  );
}

export function CenteredPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="fluid relative min-h-dvh px-4 pb-10 pt-16 sm:pt-10">
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitch />
      </div>
      <div className={cx('mx-auto', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-8 flex justify-center">
          <Logo light className="text-2xl" />
        </div>
        {children}
      </div>
    </div>
  );
}
