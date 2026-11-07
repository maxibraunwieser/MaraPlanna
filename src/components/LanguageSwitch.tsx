import { Languages } from 'lucide-react';
import { useI18n, type Lang } from '../lib/i18n';
import { cx } from './ui';

const OPTIONS: { value: Lang; label: string; name: string }[] = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'de', label: 'DE', name: 'Deutsch' },
];

/** Small language picker for the top right of every page. `dark` is for light backgrounds. */
export function LanguageSwitch({ dark, className }: { dark?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-full p-0.5 text-xs font-semibold', dark ? 'bg-slate-100' : 'bg-white/10', className)} role="group" aria-label={t('lang.label')}>
      <Languages className={cx('ml-1.5 h-3.5 w-3.5', dark ? 'text-slate-500' : 'text-slate-300')} aria-hidden />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          title={o.name}
          className={cx(
            'rounded-full px-2.5 py-1 transition',
            lang === o.value ? (dark ? 'bg-[#fff] text-ink shadow-sm' : 'bg-[#fff] text-ink') : dark ? 'text-slate-500 hover:text-slate-800' : 'text-slate-300 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
