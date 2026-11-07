import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { CenteredPage } from '../components/Layout';
import { Card, Notice } from '../components/ui';
import { useI18n, type MsgKey } from '../lib/i18n';

const SECTIONS: { h: MsgKey; items: MsgKey[] }[] = [
  { h: 'priv.h.what', items: ['priv.what.1', 'priv.what.2', 'priv.what.3', 'priv.what.4', 'priv.what.5'] },
  { h: 'priv.h.why', items: ['priv.why'] },
  { h: 'priv.h.where', items: ['priv.where.1', 'priv.where.2', 'priv.where.3'] },
  { h: 'priv.h.rights', items: ['priv.rights'] },
  { h: 'priv.h.keep', items: ['priv.keep'] },
  { h: 'priv.h.contact', items: ['priv.contact'] },
];

/** What the app does with the data of a person (a working draft that needs a legal check before the app goes live). */
export function Privacy() {
  const { t } = useI18n();
  return (
    <CenteredPage wide>
      <Card className="p-5 sm:p-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><ShieldCheck className="h-6 w-6 text-brand" />{t('priv.title')}</h1>
        <Notice tone="warn" className="mt-3">{t('priv.draft')}</Notice>
        <div className="mt-6 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="text-base font-semibold text-slate-900">{t(s.h)}</h2>
              {s.items.length > 1 ? (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                  {s.items.map((k) => <li key={k}>{t(k)}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-700">{t(s.items[0])}</p>
              )}
            </section>
          ))}
        </div>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />{t('priv.back')}</Link>
      </Card>
    </CenteredPage>
  );
}
