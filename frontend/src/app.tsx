import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/auth-context';
import { ProtectedRoute } from './components/protected-route';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';

function LoadingScreen(): JSX.Element {
  return (
    <div className="page-center w-full">
      <div className="status-card w-full max-w-xl">
        <span className="status-eyebrow">StreamHub</span>
        <h1>Preparing the login view</h1>
        <p>Reading the stored token before showing the form.</p>
      </div>
    </div>
  );
}

function LoginRedirect(): JSX.Element {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginRedirect />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}