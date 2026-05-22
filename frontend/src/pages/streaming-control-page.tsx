import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';

function getStreamingSummary(type: string, companyName: string, streamingId: string): string {
  return `${type} · ${companyName} · ${streamingId}`;
}

export function StreamingControlPage(): JSX.Element {
  const navigate = useNavigate();
  const { streamingId } = useParams();
  const { session } = useAuth();

  if (!session || !streamingId) {
    return <Navigate to="/" replace />;
  }

  const streaming = session.streamings.find((entry) => entry.id === streamingId);

  if (!streaming) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Streaming control</span>
            <h1>{streaming.name}</h1>
            <p>{getStreamingSummary(streaming.type, session.company.name, streaming.id)}</p>
          </div>

          <button className="ghost-button" type="button" onClick={() => void navigate('/')}>
            Back to dashboard
          </button>
        </header>

        <section className="dashboard-content">
          <article className="status-card empty-state">
            <span className="status-eyebrow">Coming soon</span>
            <h2>Control panel empty</h2>
            <p>This page is ready for the streaming controls, but it is empty for now.</p>
          </article>
        </section>
      </section>
    </main>
  );
}