import { runtime } from '../config/runtime';
import type {
  AudioLibraryFolder,
  AudioLibraryTrack,
  AudioPlaylist,
  AudioPlaylistSchedulePayload,
  CompanyAudioAutodjState,
  CreateAudioFolderPayload,
  CreateAudioPlaylistPayload,
  ReplaceAudioPlaylistItemsPayload,
  UpdateAudioAutodjSettingsPayload,
  UpdateAudioTrackPayload,
} from './types';

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

async function authorizedRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readResponseBody<T>(response);
}

export function getCompanyAudioAutodjState(token: string): Promise<CompanyAudioAutodjState> {
  return authorizedRequest<CompanyAudioAutodjState>(token, '/audio/autodj');
}

export function updateCompanyAudioAutodjSettings(
  token: string,
  payload: UpdateAudioAutodjSettingsPayload
): Promise<CompanyAudioAutodjState> {
  return authorizedRequest<CompanyAudioAutodjState>(token, '/audio/autodj/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateAudioFolder(
  token: string,
  folderId: string,
  payload: CreateAudioFolderPayload
): Promise<AudioLibraryFolder> {
  return authorizedRequest<AudioLibraryFolder>(token, `/audio/autodj/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAudioFolder(token: string, folderId: string): Promise<void> {
  return authorizedRequest<void>(token, `/audio/autodj/folders/${folderId}`, {
    method: 'DELETE',
  });
}

export function uploadAudioTracks(
  token: string,
  files: File[],
  folderId: string | null = null
): Promise<{ tracks: AudioLibraryTrack[] }> {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file, file.name);
  });

  if (folderId) {
    formData.set('folderId', folderId);
  }

  return authorizedRequest<{ tracks: AudioLibraryTrack[] }>(token, '/audio/autodj/tracks/upload', {
    method: 'POST',
    body: formData,
  });
}

export function updateAudioTrack(
  token: string,
  trackId: string,
  payload: UpdateAudioTrackPayload
): Promise<AudioLibraryTrack> {
  return authorizedRequest<AudioLibraryTrack>(token, `/audio/autodj/tracks/${trackId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAudioTrack(token: string, trackId: string): Promise<void> {
  return authorizedRequest<void>(token, `/audio/autodj/tracks/${trackId}`, {
    method: 'DELETE',
  });
}

export function createAudioPlaylist(
  token: string,
  payload: CreateAudioPlaylistPayload
): Promise<AudioPlaylist> {
  return authorizedRequest<AudioPlaylist>(token, '/audio/autodj/playlists', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAudioPlaylist(
  token: string,
  playlistId: string,
  payload: CreateAudioPlaylistPayload
): Promise<AudioPlaylist> {
  return authorizedRequest<AudioPlaylist>(token, `/audio/autodj/playlists/${playlistId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAudioPlaylist(token: string, playlistId: string): Promise<void> {
  return authorizedRequest<void>(token, `/audio/autodj/playlists/${playlistId}`, {
    method: 'DELETE',
  });
}

export function replaceAudioPlaylistItems(
  token: string,
  playlistId: string,
  payload: ReplaceAudioPlaylistItemsPayload
): Promise<AudioPlaylist> {
  return authorizedRequest<AudioPlaylist>(token, `/audio/autodj/playlists/${playlistId}/items`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createAudioPlaylistSchedule(
  token: string,
  playlistId: string,
  payload: AudioPlaylistSchedulePayload
): Promise<AudioPlaylist> {
  return authorizedRequest<AudioPlaylist>(token, `/audio/autodj/playlists/${playlistId}/schedules`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAudioPlaylistSchedule(
  token: string,
  playlistId: string,
  scheduleId: string
): Promise<AudioPlaylist> {
  return authorizedRequest<AudioPlaylist>(
    token,
    `/audio/autodj/playlists/${playlistId}/schedules/${scheduleId}`,
    {
      method: 'DELETE',
    }
  );
}