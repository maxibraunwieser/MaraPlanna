import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, CalendarCheck, Watch } from 'lucide-react';
import { appUrl, supabase } from '../lib/supabase';
import { CenteredPage } from '../components/Layout';
import { Button, Card, Field, Input, Notice } from '../components/ui';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <CenteredPage>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      <ul className="mt-8 grid gap-3 text-sm text-slate-300">
        <li className="flex items-center gap-3"><CalendarCheck className="h-4 w-4 text-brand" /> A marathon plan built around your race, schedule and goal</li>
        <li className="flex items-center gap-3"><Watch className="h-4 w-4 text-brand" /> Syncs your Garmin runs, HRV, sleep and resting HR</li>
        <li className="flex items-center gap-3"><Activity className="h-4 w-4 text-brand" /> Adapts automatically when you miss or crush a session</li>
      </ul>
    </CenteredPage>
  );
}

export function Login() {
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
    <AuthCard title="Welcome back" subtitle="Sign in to see today's training.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Sign in
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-slate-500 hover:text-slate-800">Forgot password?</Link>
          <Link to="/register" className="font-semibold text-brand hover:text-brand-dark">Create account</Link>
        </div>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
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
      <AuthCard title="Check your inbox">
        <Notice tone="success">
          We sent a confirmation link to <b>{email}</b>. Open it to activate your account – you'll land right in the setup questions.
        </Notice>
        <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-brand">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="Two minutes of questions, then your plan.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Name">
          <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already registered? <Link to="/login" className="font-semibold text-brand">Sign in</Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
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
    <AuthCard title="Reset password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <Notice tone="success">If an account exists for {email}, a reset link is on its way.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-center text-sm font-semibold text-brand">Back to sign in</Link>
    </AuthCard>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else navigate('/');
  };
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="New password">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>Save password</Button>
      </form>
    </AuthCard>
  );
}

export function NotConfigured() {
  return (
    <CenteredPage wide>
      <Card className="p-6 sm:p-8">
        <h1 className="text-xl font-bold">Almost there – connect Supabase</h1>
        <p className="mt-2 text-sm text-slate-600">
          MaraPlanna needs a Supabase project for accounts and data. Set <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> (locally in <code>.env</code>, or as GitHub repository variables for
          the Pages deployment), then rebuild. The README walks through every step.
        </p>
      </Card>
    </CenteredPage>
  );
}
