export type AudioPlaylistKind = 'default' | 'custom';

export interface AudioLibraryFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudioLibraryTrack {
  id: string;
  folderId: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioPlaylistItem {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  track: AudioLibraryTrack;
}

export interface AudioPlaylistSchedule {
  id: string;
  playlistId: string;
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioPlaylist {
  id: string;
  name: string;
  kind: AudioPlaylistKind;
  color: string;
  priority: number;
  items: AudioPlaylistItem[];
  schedules: AudioPlaylistSchedule[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanyAudioAutodjState {
  enabled: boolean;
  folders: AudioLibraryFolder[];
  tracks: AudioLibraryTrack[];
  playlists: AudioPlaylist[];
}

export interface UpdateAudioAutodjSettingsPayload {
  enabled: boolean;
}

export interface CreateAudioFolderPayload {
  name: string;
}

export interface UpdateAudioTrackPayload {
  folderId: string | null;
}

export interface CreateAudioPlaylistPayload {
  name: string;
  color: string;
}

export interface UpdateAudioPlaylistPayload {
  name?: string;
  color?: string;
}

export interface ReplaceAudioPlaylistItemsPayload {
  trackIds: string[];
}

export interface AudioPlaylistSchedulePayload {
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
}