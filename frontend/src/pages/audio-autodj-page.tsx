import { Link } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { AudioAutodjPanel } from '../components/audio-autodj-panel';

export function AudioAutodjPage(): JSX.Element {
  const { session } = useAuth();

  if (!session) {
    return <div />;
  }

  const audioStreamingCount = session.streamings.filter((streaming) => streaming.type === 'audio').length;

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Audio AutoDJ</span>
            <h1>{session.company.name}</h1>
            <p>
              Company-scoped library, default 24/7 playlist, custom priority-1 schedules, and drag/drop routing across {audioStreamingCount} audio signal(s).
            </p>
          </div>

          <Link className="ghost-button inline-flex items-center justify-center no-underline" to="/">
            Back to dashboard
          </Link>
        </header>

        <section className="dashboard-content">
          <AudioAutodjPanel />
        </section>
      </section>
    </main>
  );
}