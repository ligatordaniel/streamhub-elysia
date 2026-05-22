import type {
  AuthSession,
  CurrentSession,
  LoginCredentials,
} from './types';
import { runtime } from '../config/runtime';

interface ApiErrorResponse {
  error?: string;
}

function getBaseUrl(): string {
  return runtime.apiUrl.replace(/\/$/, '');
}

async function readResponseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await readResponseBody<ApiErrorResponse>(response);

    if (payload?.error) {
      return payload.error;
    }
  } catch {
    // Fall back to the default message below.
  }

  return 'Request failed.';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readResponseBody<T>(response);
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function me(token: string): Promise<CurrentSession> {
  return request<CurrentSession>('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function logout(token: string): Promise<void> {
  await request<void>('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}