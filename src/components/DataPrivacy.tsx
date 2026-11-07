import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { deleteAccount, saveProfile } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { dateLong } from '../lib/i18n/dates';
import { supabase } from '../lib/supabase';
import { Button, Card, CardTitle, Input, Modal, Notice, Toggle, useToast } from './ui';

/** Consent status, the analytics choice, the privacy policy, and deleting the account with all its data. */
export function DataPrivacyCard() {
  const { user } = useAuth();
  const { profile, reload } = useData();
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = profile?.onboarding;
  const consent = a?.setup?.consent;
  const word = t('priv.delete.word');

  const setAnalytics = async (v: boolean) => {
    if (!a?.setup || !user) return;
    try {
      await saveProfile(user.id, { onboarding: { ...a, setup: { ...a.setup, consent: { ...a.setup.consent, analytics: v } } } });
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      toast(t('priv.delete.done'), 'success');
      navigate('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle icon={<ShieldCheck className="h-5 w-5 text-brand" />}>{t('priv.card')}</CardTitle>
      <p className="text-sm text-slate-600">{consent?.health && consent.at ? t('priv.consent.given', { date: dateLong(consent.at, lang) }) : t('priv.consent.none')}</p>
      {a?.setup && <div className="mt-4"><Toggle checked={!!consent?.analytics} onChange={(v) => void setAnalytics(v)} label={t('priv.analytics')} /></div>}
      <p className="mt-4 text-xs text-slate-500">{t('priv.withdraw')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link to="/privacy" target="_blank"><Button size="sm" variant="secondary">{t('priv.read')}</Button></Link>
        <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => { setTyped(''); setError(null); setAsking(true); }}>{t('priv.delete')}</Button>
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title={t('priv.delete.title')}>
        <div className="space-y-4">
          <Notice tone="error">{t('priv.delete.text')}</Notice>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t('priv.delete.type', { word })}</span>
            <Input aria-label={t('priv.delete.type', { word })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} disabled={typed.trim().toUpperCase() !== word} onClick={() => void remove()}>{t('priv.delete.confirm')}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
