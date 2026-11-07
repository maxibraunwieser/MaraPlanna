import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, CalendarCheck, Watch } from 'lucide-react';
import { appUrl, supabase } from '../lib/supabase';
import { CenteredPage } from '../components/Layout';
import { Button, Card, Field, Input, Notice } from '../components/ui';
import { useI18n, type MsgKey, type Translate } from '../lib/i18n';

/** The messages of Supabase Auth come in English; the usual ones are shown in the language of the page. */
export function authMessage(message: string, t: Translate): string {
  const table: [RegExp, MsgKey][] = [
    [/invalid login credentials/i, 'auth.err.credentials'],
    [/email not confirmed/i, 'auth.err.unconfirmed'],
    [/already (been )?registered/i, 'auth.err.exists'],
    [/password should be at least|weak password/i, 'auth.err.weak'],
    [/rate limit|too many/i, 'auth.err.rate'],
  ];
  const hit = table.find(([re]) => re.test(message));
  return hit ? t(hit[1]) : message;
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <CenteredPage>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      <ul className="mt-8 grid gap-3 text-sm text-slate-300">
        <li className="flex items-center gap-3"><CalendarCheck className="h-4 w-4 text-brand" /> {t('auth.tag1')}</li>
        <li className="flex items-center gap-3"><Watch className="h-4 w-4 text-brand" /> {t('auth.tag2')}</li>
        <li className="flex items-center gap-3"><Activity className="h-4 w-4 text-brand" /> {t('auth.tag3')}</li>
      </ul>
    </CenteredPage>
  );
}

export function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else navigate('/');
  };

  return (
    <AuthCard title={t('auth.welcome')} subtitle={t('auth.welcome.sub')}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{authMessage(error, t)}</Notice>}
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.signIn')}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-slate-500 hover:text-slate-800">{t('auth.forgot')}</Link>
          <Link to="/register" className="font-semibold text-brand hover:text-brand-dark">{t('auth.create')}</Link>
        </div>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('too short');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name }, emailRedirectTo: appUrl('onboarding') },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) navigate('/onboarding');
    else setSent(true);
  };

  if (sent) {
    return (
      <AuthCard title={t('auth.inbox')}>
        <Notice tone="success">{t('auth.inbox.text', { email })}</Notice>
        <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-brand">{t('auth.backToSignIn')}</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.createTitle')} subtitle={t('auth.createSub')}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error === 'too short' ? t('auth.min8') : authMessage(error, t)}</Notice>}
        <Field label={t('auth.name')}>
          <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.password.hint')}>
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.create')}
        </Button>
        <p className="text-center text-sm text-slate-500">
          {t('auth.already')} <Link to="/login" className="font-semibold text-brand">{t('auth.signIn')}</Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('reset-password') });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };
  return (
    <AuthCard title={t('auth.reset')} subtitle={t('auth.reset.sub')}>
      {sent ? (
        <Notice tone="success">{t('auth.reset.sent', { email })}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{authMessage(error, t)}</Notice>}
          <Field label={t('auth.email')}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>{t('auth.reset.send')}</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-brand">{t('auth.backToSignIn')}</Link>
    </AuthCard>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('too short');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else navigate('/');
  };
  return (
    <AuthCard title={t('auth.newPassword')}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error === 'too short' ? t('auth.min8short') : authMessage(error, t)}</Notice>}
        <Field label={t('auth.newPassword.label')}>
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>{t('auth.newPassword.save')}</Button>
      </form>
    </AuthCard>
  );
}

export function NotConfigured() {
  const { t } = useI18n();
  return (
    <CenteredPage wide>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-bold">{t('auth.setup.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('auth.setup.text')}</p>
      </Card>
    </CenteredPage>
  );
}
