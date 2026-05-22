import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { login as loginRequest, logout as logoutRequest, me as meRequest } from './api';
import type { AuthSession, CurrentSession, LoginCredentials } from './types';

const storageKey = 'streamhub.auth.token';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login(credentials: LoginCredentials): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(storageKey);
}

function persistToken(token: string): void {
  window.localStorage.setItem(storageKey, token);
}

function removeToken(): void {
  window.localStorage.removeItem(storageKey);
}

function createSession(token: string, session: CurrentSession, expiresAt: number): AuthSession {
  return {
    token,
    expiresAt,
    ...session,
  };
}

function padBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${'='.repeat(paddingLength)}`;
}

function decodeTokenExpiry(token: string): number {
  const parts = token.split('.');
  const payloadPart = parts[1];

  if (parts.length !== 3 || !payloadPart) {
    return Date.now() + 86_400_000;
  }

  try {
    const payload = JSON.parse(window.atob(padBase64Url(payloadPart)));

    if (typeof payload.exp === 'number') {
      return payload.exp;
    }
  } catch {
    // Fall back to the default TTL below.
  }

  return Date.now() + 86_400_000;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    error: null,
  });

  async function refresh(): Promise<void> {
    const token = readToken();

    if (!token) {
      setState({ status: 'anonymous', session: null, error: null });
      return;
    }

    try {
      const payload = await meRequest(token);
      setState({
        status: 'authenticated',
        session: createSession(token, payload, decodeTokenExpiry(token)),
        error: null,
      });
    } catch (error) {
      removeToken();
      setState({
        status: 'anonymous',
        session: null,
        error: error instanceof Error ? error.message : 'Unable to restore session.',
      });
    }
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    const session = await loginRequest(credentials);
    persistToken(session.token);
    setState({
      status: 'authenticated',
      session,
      error: null,
    });
  }

  async function logout(): Promise<void> {
    const token = state.session?.token ?? readToken();

    if (token) {
      try {
        await logoutRequest(token);
      } catch {
        // The client still clears the session for a stateless logout.
      }
    }

    removeToken();
    setState({ status: 'anonymous', session: null, error: null });
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      refresh,
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}