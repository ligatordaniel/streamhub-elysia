import { Link } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { AdminPanel } from '../components/admin-panel';

function StreamingCard({
  id,
  type,
  name,
  companyName,
}: {
  id: string;
  type: string;
  name: string;
  companyName: string;
}): JSX.Element {
  return (
    <Link
      className="stream-card stream-card-link"
      to={`/streamings/${id}`}
      title={`${name} · ${type} · ${companyName} · ${id}`}
      aria-label={`Open control page for ${name}`}
    >
      <h3>{name}</h3>
      <p>{type} · {companyName} · {id}</p>
    </Link>
  );
}

export function DashboardPage(): JSX.Element {
  const { session, logout } = useAuth();

  if (!session) {
    return <div />;
  }

  const isSuperAdmin = session.user.role === 'super_admin';

  return (
    <main className="dashboard-page w-full">
      <section className="dashboard-shell w-full">
        <header className="dashboard-topbar">
          <div>
            <span className="status-eyebrow">Signed in</span>
            <h1>{session.user.displayName}</h1>
            <p>
              {session.company.name} · {session.user.email}
            </p>
          </div>

          <button className="ghost-button" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </header>

        <section className="dashboard-content">
          <article className="status-card">
            <span className="status-eyebrow">Company</span>
            <h2>{session.company.name}</h2>
            <p>{session.company.id}</p>
          </article>

          <section>
            <div className="section-heading">
              <div>
                <span className="status-eyebrow">My streamings</span>
                <h2>{session.streamings.length}</h2>
              </div>
              <p>These are the streamings attached to your company.</p>
            </div>

            <div className="streamings-viewport mt-4">
              {session.streamings.length > 0 ? (
                <div className="streaming-grid">
                  {session.streamings.map((streaming) => (
                    <StreamingCard
                      key={streaming.id}
                      id={streaming.id}
                      type={streaming.type}
                      name={streaming.name}
                      companyName={session.company.name}
                    />
                  ))}
                </div>
              ) : (
                <article className="status-card empty-state">
                  <p>No streamings are attached to this company yet.</p>
                </article>
              )}
            </div>
          </section>

          {isSuperAdmin && <AdminPanel token={session.token} />}
        </section>
      </section>
    </main>
  );
}