import React, { useCallback, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicRoute, PublicSite } from './components/PublicSite';
import { CustomerDashboard } from './components/CustomerDashboard';

function MCloudShell() {
  const { isAuthenticated, loading } = useAuth();
  const [surface, setSurface] = useState<'public' | 'dashboard'>('public');
  const [publicRoute, setPublicRoute] = useState<PublicRoute>('home');
  const [preselectPlanId, setPreselectPlanId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  const handleEnterConsole = (planId?: number) => {
    if (planId) setPreselectPlanId(planId);
    if (isAuthenticated) {
      setSurface('dashboard');
    } else {
      setPublicRoute('register');
      setSurface('public');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F4F8] dark:bg-[#0B111E] text-slate-600 dark:text-slate-400 text-sm">
        Initializing MCloud Control Plane...
      </div>
    );
  }

  return (
    <>
      {surface === 'public' && (
        <PublicSite
          route={publicRoute}
          onNavigate={(r) => {
            setPublicRoute(r);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onEnterConsole={handleEnterConsole}
        />
      )}

      {surface === 'dashboard' && isAuthenticated && (
        <CustomerDashboard
          preselectedPlanId={preselectPlanId}
          onClearPreselect={() => setPreselectPlanId(null)}
          onBackToSite={() => {
            setPublicRoute('home');
            setSurface('public');
          }}
          onNotify={notify}
        />
      )}

      {surface === 'dashboard' && !isAuthenticated && (
        <PublicSite
          route="login"
          onNavigate={(r) => {
            setPublicRoute(r);
            setSurface('public');
          }}
          onEnterConsole={handleEnterConsole}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 text-xs font-medium rounded-lg border ${
            toast.tone === 'error'
              ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
              : 'bg-[#F8FAFC] dark:bg-[#111A2C] border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MCloudShell />
    </AuthProvider>
  );
}
