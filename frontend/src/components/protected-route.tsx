import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';

function LoadingState(): JSX.Element {
  return (
    <div className="page-center w-full">
      <div className="status-card w-full max-w-xl">
        <span className="status-eyebrow">StreamHub</span>
        <h1>Checking your session</h1>
        <p>Waiting for the backend to confirm the token.</p>
      </div>
    </div>
  );
}

export function ProtectedRoute(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingState />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}