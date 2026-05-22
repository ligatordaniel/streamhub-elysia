import { runtime } from '../config/runtime';
import type {
  AdminOverview,
  PublicCompany,
  PublicStreaming,
  PublicUser,
  StreamingType,
  UserRole,
} from '../auth/types';

interface ApiErrorResponse {
  error?: string;
}

export interface CreateCompanyPayload {
  name: string;
}

export interface CreateStreamingPayload {
  companyId: string;
  type: StreamingType;
  name: string;
}

export interface UpdateStreamingPayload {
  companyId?: string;
  type?: StreamingType;
  name?: string;
  ingestKey?: string;
}

export interface CreateUserPayload {
  companyId: string;
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
}

export interface UpdateUserPayload {
  companyId?: string;
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
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

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readResponseBody<T>(response);
}

export function getAdminOverview(token: string): Promise<AdminOverview> {
  return request<AdminOverview>(token, '/admin/overview');
}

export function createCompany(token: string, payload: CreateCompanyPayload): Promise<PublicCompany> {
  return request<PublicCompany>(token, '/admin/companies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCompany(
  token: string,
  companyId: string,
  payload: CreateCompanyPayload
): Promise<PublicCompany> {
  return request<PublicCompany>(token, `/admin/companies/${companyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteCompany(token: string, companyId: string): Promise<void> {
  return request<void>(token, `/admin/companies/${companyId}`, { method: 'DELETE' });
}

export function createUser(token: string, payload: CreateUserPayload): Promise<PublicUser> {
  return request<PublicUser>(token, '/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUser(
  token: string,
  userId: string,
  payload: UpdateUserPayload
): Promise<PublicUser> {
  return request<PublicUser>(token, `/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteUser(token: string, userId: string): Promise<void> {
  return request<void>(token, `/admin/users/${userId}`, { method: 'DELETE' });
}

export function createStreaming(
  token: string,
  payload: CreateStreamingPayload
): Promise<PublicStreaming> {
  return request<PublicStreaming>(token, '/admin/streamings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateStreaming(
  token: string,
  streamingId: string,
  payload: UpdateStreamingPayload
): Promise<PublicStreaming> {
  return request<PublicStreaming>(token, `/admin/streamings/${streamingId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteStreaming(token: string, streamingId: string): Promise<void> {
  return request<void>(token, `/admin/streamings/${streamingId}`, { method: 'DELETE' });
}