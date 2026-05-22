import { runtime } from '../config/runtime';
import type { CompanyEmergencyFallback, PublicEmergencyFallback } from './types';

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

async function authorizedRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export function getStreamingEmergencyFallback(
  token: string,
  streamingId: string
): Promise<CompanyEmergencyFallback> {
  return authorizedRequest<CompanyEmergencyFallback>(token, `/streamings/${streamingId}/emergency-fallback`);
}

export function updateStreamingEmergencyFallback(
  token: string,
  streamingId: string,
  payload: CompanyEmergencyFallback
): Promise<CompanyEmergencyFallback> {
  return authorizedRequest<CompanyEmergencyFallback>(token, `/streamings/${streamingId}/emergency-fallback`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getPublicStreamingEmergencyFallback(
  streamingAlias: string,
  publishKey: string
): Promise<PublicEmergencyFallback> {
  return request<PublicEmergencyFallback>(
    `/public/streamings/${streamingAlias}/${publishKey}/emergency-fallback`
  );
}