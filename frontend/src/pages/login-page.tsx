import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import type { LoginCredentials } from '../auth/types';
import { runtime } from '../config/runtime';

function getFallbackDestination(state: unknown): string {
  if (typeof state !== 'object' || state === null) {
    return '/';
  }

  const record = state as { from?: { pathname?: string } };

  return record.from?.pathname ?? '/';
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, status, error, session } = useAuth();
  const destination = useMemo(() => getFallbackDestination(location.state), [location.state]);
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: 'danielulloa256@gmail.com',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session) {
      void navigate(destination, { replace: true });
    }
  }, [destination, navigate, session, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await login(credentials);
      navigate(destination, { replace: true });
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page w-full">
      <section className="auth-shell auth-shell--login">
        <div className="auth-card auth-card--login">
          <div className="auth-card-head auth-card-head--centered">
            <h1>{runtime.appName}</h1>
          </div>
          <form className="auth-form w-full" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={credentials.email}
                onChange={(event) =>
                  setCredentials((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                      <path d="M9.9 4.75A11.5 11.5 0 0 1 12 4.5C17.5 4.5 21.4 8.4 22.5 12c-.5 1.6-1.4 3.2-2.6 4.5" />
                      <path d="M6.7 6.7C4 8.3 2.1 10.8 1.5 12c1.1 3.6 5 7.5 10.5 7.5 1.2 0 2.3-.2 3.4-.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {(formError ?? error) && <p className="error-banner">{formError ?? error}</p>}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}