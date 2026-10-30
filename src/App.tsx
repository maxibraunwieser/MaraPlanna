import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider, useData } from './lib/data';
import { supabaseConfigured } from './lib/supabase';
import { Spinner, ToastProvider } from './components/ui';
import { AppLayout } from './components/Layout';
import { ForgotPassword, Login, NotConfigured, Register, ResetPassword } from './pages/Auth';
import { Onboarding } from './pages/Onboarding';
import { ConnectGarmin } from './pages/ConnectGarmin';
import { CreatePlan } from './pages/CreatePlan';
import { Dashboard } from './pages/Dashboard';
import { PlanPage } from './pages/PlanPage';
import { Activities } from './pages/Activities';
import { Settings } from './pages/Settings';
import { Analysis } from './pages/Analysis';
import { Progress } from './pages/Progress';
import { Coach } from './pages/Coach';

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading…" />
    </div>
  );
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return session ? <Navigate to="/" replace /> : <>{children}</>;
}

/** Signed-in area: loads the user's data once for all pages. */
function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <DataProvider>
      <DataGate />
    </DataProvider>
  );
}

function DataGate() {
  const { loading } = useData();
  return loading ? <FullPageSpinner /> : <Outlet />;
}

function RequireOnboarding() {
  const { profile } = useData();
  return profile?.onboarding_completed_at ? <AppLayout /> : <Navigate to="/onboarding" replace />;
}

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<Protected />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<RequireOnboarding />}>
                <Route index element={<Dashboard />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/plan/new" element={<CreatePlan />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/coach" element={<Coach />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/connect" element={<ConnectGarmin />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/analysis/:activityId" element={<Analysis />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
