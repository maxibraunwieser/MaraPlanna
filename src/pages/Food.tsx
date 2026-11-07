import { useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, Salad, type LucideIcon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';
import { useI18n, type MsgKey } from '../lib/i18n';

const PAGES: Record<string, { label: MsgKey; icon: LucideIcon }> = {
  '/food': { label: 'nav.food.diary', icon: Salad },
  '/food/plan': { label: 'nav.food.plan', icon: CalendarDays },
  '/food/recipes': { label: 'nav.food.recipes', icon: BookOpen },
};

/** Placeholder of the nutrition section: three pages (diary, meal plan, recipes) that are not built yet. */
export function Food() {
  const { t } = useI18n();
  const page = PAGES[useLocation().pathname.replace(/\/$/, '')] ?? PAGES['/food'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('food.title')} subtitle={t(page.label)} />
      <Card className="text-center">
        <page.icon className="mx-auto h-10 w-10 text-brand" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">{t('food.soon')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{t('food.soon.text')}</p>
      </Card>
    </div>
  );
}
