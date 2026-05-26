import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AudioLibraryFolder,
  AudioLibraryTrack,
  AudioPlaylist,
  AudioPlaylistItem,
  AudioPlaylistSchedule,
  AudioPlaylistScheduleConflict,
  CompanyAudioAutodjState,
} from '../types';

interface FolderRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface TrackRow {
  id: string;
  folderId: string | null;
  originalFileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistRow {
  id: string;
  name: string;
  kind: 'default' | 'custom';
  createdAt: string;
  updatedAt: string;
}

interface PlaylistItemRow {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
}

interface PlaylistScheduleRow {
  id: string;
  playlistId: string;
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
  createdAt: string;
  updatedAt: string;
}

interface CompanyRow {
  id: string;
}

interface AudioAutodjSettingsRow {
  enabled: number;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistConflictRow {
  scheduleId: string;
  playlistId: string;
  playlistName: string;
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
}

interface CountRow {
  count: number;
}

export interface SaveAudioTrackInput {
  folderId: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Uint8Array;
}

export interface CreateAudioFolderInput {
  name: string;
}

export interface UpdateAudioFolderInput {
  name: string;
}

export interface UpdateAudioTrackInput {
  folderId: string | null;
}

export interface CreateAudioPlaylistInput {
  name: string;
}

export interface UpdateAudioPlaylistInput {
  name: string;
}

export interface SaveAudioPlaylistScheduleInput {
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const DEFAULT_PLAYLIST_NAME = 'Default 24/7';
const DEFAULT_AUDIO_LIBRARY_DIRECTORY = 'infra/audio/library/companies';
const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const selectCompaniesSql = 'SELECT id FROM companies ORDER BY name ASC';
const selectAudioAutodjSettingsByCompanyIdSql = `
  SELECT
    enabled,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_autodj_settings
  WHERE company_id = ?
  LIMIT 1
`;
const selectFoldersByCompanyIdSql = `
  SELECT
    id,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_library_folders
  WHERE company_id = ?
  ORDER BY name COLLATE NOCASE ASC, created_at ASC
`;
const selectTracksByCompanyIdSql = `
  SELECT
    id,
    folder_id AS folderId,
    original_file_name AS originalFileName,
    storage_path AS storagePath,
    mime_type AS mimeType,
    size_bytes AS sizeBytes,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_library_tracks
  WHERE company_id = ?
  ORDER BY created_at ASC, original_file_name COLLATE NOCASE ASC
`;
const selectFolderByIdSql = `
  SELECT
    id,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_library_folders
  WHERE company_id = ? AND id = ?
  LIMIT 1
`;
const selectTrackByIdSql = `
  SELECT
    id,
    folder_id AS folderId,
    original_file_name AS originalFileName,
    storage_path AS storagePath,
    mime_type AS mimeType,
    size_bytes AS sizeBytes,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_library_tracks
  WHERE company_id = ? AND id = ?
  LIMIT 1
`;
const selectPlaylistsByCompanyIdSql = `
  SELECT
    id,
    name,
    kind,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_playlists
  WHERE company_id = ?
  ORDER BY CASE kind WHEN 'default' THEN 0 ELSE 1 END ASC, name COLLATE NOCASE ASC, created_at ASC
`;
const selectPlaylistByIdSql = `
  SELECT
    id,
    name,
    kind,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_playlists
  WHERE company_id = ? AND id = ?
  LIMIT 1
`;
const selectDefaultPlaylistByCompanyIdSql = `
  SELECT
    id,
    name,
    kind,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_playlists
  WHERE company_id = ? AND kind = 'default'
  LIMIT 1
`;
const selectPlaylistItemsByCompanyIdSql = `
  SELECT
    id,
    playlist_id AS playlistId,
    track_id AS trackId,
    position
  FROM company_audio_playlist_items
  WHERE company_id = ?
  ORDER BY playlist_id ASC, position ASC, created_at ASC
`;
const selectPlaylistSchedulesByCompanyIdSql = `
  SELECT
    id,
    playlist_id AS playlistId,
    start_minute_of_week AS startMinuteOfWeek,
    end_minute_of_week AS endMinuteOfWeek,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_playlist_schedules
  WHERE company_id = ?
  ORDER BY playlist_id ASC, start_minute_of_week ASC, end_minute_of_week ASC
`;
const selectScheduleByIdSql = `
  SELECT
    id,
    playlist_id AS playlistId,
    start_minute_of_week AS startMinuteOfWeek,
    end_minute_of_week AS endMinuteOfWeek,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM company_audio_playlist_schedules
  WHERE company_id = ? AND id = ?
  LIMIT 1
`;
const selectOverlappingScheduleSql = `
  SELECT
    schedules.id AS scheduleId,
    schedules.playlist_id AS playlistId,
    playlists.name AS playlistName,
    schedules.start_minute_of_week AS startMinuteOfWeek,
    schedules.end_minute_of_week AS endMinuteOfWeek
  FROM company_audio_playlist_schedules AS schedules
  INNER JOIN company_audio_playlists AS playlists
    ON playlists.company_id = schedules.company_id
   AND playlists.id = schedules.playlist_id
  WHERE schedules.company_id = ?
    AND playlists.kind = 'custom'
    AND schedules.id != ?
    AND schedules.start_minute_of_week < ?
    AND ? < schedules.end_minute_of_week
  ORDER BY schedules.start_minute_of_week ASC
  LIMIT 1
`;
const countTracksByFolderIdSql = `
  SELECT COUNT(*) AS count
  FROM company_audio_library_tracks
  WHERE company_id = ? AND folder_id = ?
`;
const insertFolderSql = `
  INSERT INTO company_audio_library_folders (
    company_id,
    id,
    name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?)
`;
const insertAudioAutodjSettingsSql = `
  INSERT INTO company_audio_autodj_settings (
    company_id,
    enabled,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?)
`;
const updateAudioAutodjSettingsSql = `
  UPDATE company_audio_autodj_settings
  SET enabled = ?, updated_at = ?
  WHERE company_id = ?
`;
const updateFolderSql = `
  UPDATE company_audio_library_folders
  SET name = ?, updated_at = ?
  WHERE company_id = ? AND id = ?
`;
const deleteFolderSql = `
  DELETE FROM company_audio_library_folders
  WHERE company_id = ? AND id = ?
`;
const insertTrackSql = `
  INSERT INTO company_audio_library_tracks (
    company_id,
    id,
    folder_id,
    original_file_name,
    storage_path,
    mime_type,
    size_bytes,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
const updateTrackFolderSql = `
  UPDATE company_audio_library_tracks
  SET folder_id = ?, updated_at = ?
  WHERE company_id = ? AND id = ?
`;
const deleteTrackSql = `
  DELETE FROM company_audio_library_tracks
  WHERE company_id = ? AND id = ?
`;
const insertPlaylistSql = `
  INSERT INTO company_audio_playlists (
    company_id,
    id,
    name,
    kind,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`;
const updatePlaylistSql = `
  UPDATE company_audio_playlists
  SET name = ?, updated_at = ?
  WHERE company_id = ? AND id = ?
`;
const deletePlaylistSql = `
  DELETE FROM company_audio_playlists
  WHERE company_id = ? AND id = ?
`;
const deletePlaylistItemsSql = `
  DELETE FROM company_audio_playlist_items
  WHERE company_id = ? AND playlist_id = ?
`;
const insertPlaylistItemSql = `
  INSERT INTO company_audio_playlist_items (
    company_id,
    id,
    playlist_id,
    track_id,
    position,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;
const insertPlaylistScheduleSql = `
  INSERT INTO company_audio_playlist_schedules (
    company_id,
    id,
    playlist_id,
    start_minute_of_week,
    end_minute_of_week,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;
const updatePlaylistScheduleSql = `
  UPDATE company_audio_playlist_schedules
  SET start_minute_of_week = ?, end_minute_of_week = ?, updated_at = ?
  WHERE company_id = ? AND id = ? AND playlist_id = ?
`;
const deletePlaylistScheduleSql = `
  DELETE FROM company_audio_playlist_schedules
  WHERE company_id = ? AND id = ? AND playlist_id = ?
`;

export class AudioAutodjValidationError extends Error { }
export class AudioAutodjConflictError extends Error { }

function nowIso(): string {
  return new Date().toISOString();
}

function getWorkspaceRoot(): string {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(configDirectory, '..', '..', '..');
}

function getAudioLibraryRoot(): string {
  return resolve(getWorkspaceRoot(), DEFAULT_AUDIO_LIBRARY_DIRECTORY);
}

function mapFolderRow(row: FolderRow): AudioLibraryFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTrackRow(row: TrackRow): AudioLibraryTrack {
  return {
    id: row.id,
    folderId: row.folderId,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function ensureAudioAutodjSettings(db: Database, companyId: string): AudioAutodjSettingsRow {
  const settings = db.query(selectAudioAutodjSettingsByCompanyIdSql).get(companyId) as AudioAutodjSettingsRow | null;

  if (settings) {
    return settings;
  }

  const timestamp = nowIso();

  db.query(insertAudioAutodjSettingsSql).run(companyId, 1, timestamp, timestamp);

  const createdSettings = db.query(selectAudioAutodjSettingsByCompanyIdSql).get(companyId) as AudioAutodjSettingsRow | null;

  if (!createdSettings) {
    throw new Error(`Unable to persist AutoDJ settings for company ${companyId}`);
  }

  return createdSettings;
}

function sanitizeFileName(fileName: string): string {
  const trimmedName = fileName.trim();
  const collapsedName = trimmedName.replace(/\s+/g, '-');
  const sanitizedName = collapsedName.replace(/[^a-zA-Z0-9._-]+/g, '');

  return sanitizedName || 'track';
}

function ensureFolderExists(db: Database, companyId: string, folderId: string): FolderRow {
  const folder = db.query(selectFolderByIdSql).get(companyId, folderId) as FolderRow | null;

  if (!folder) {
    throw new AudioAutodjValidationError('Folder not found.');
  }

  return folder;
}

function ensureTrackExists(db: Database, companyId: string, trackId: string): TrackRow {
  const track = db.query(selectTrackByIdSql).get(companyId, trackId) as TrackRow | null;

  if (!track) {
    throw new AudioAutodjValidationError('Track not found.');
  }

  return track;
}

function ensurePlaylistExists(db: Database, companyId: string, playlistId: string): PlaylistRow {
  const playlist = db.query(selectPlaylistByIdSql).get(companyId, playlistId) as PlaylistRow | null;

  if (!playlist) {
    throw new AudioAutodjValidationError('Playlist not found.');
  }

  return playlist;
}

function ensureScheduleExists(db: Database, companyId: string, scheduleId: string): PlaylistScheduleRow {
  const schedule = db.query(selectScheduleByIdSql).get(companyId, scheduleId) as PlaylistScheduleRow | null;

  if (!schedule) {
    throw new AudioAutodjValidationError('Schedule not found.');
  }

  return schedule;
}

function formatMinuteOfWeek(value: number): string {
  const safeValue = Math.max(0, Math.min(MINUTES_PER_WEEK - 1, value));
  const dayIndex = Math.floor(safeValue / MINUTES_PER_DAY);
  const minuteOfDay = safeValue % MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const dayLabel = dayLabels[dayIndex] ?? dayLabels[0];

  return `${dayLabel} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function validateScheduleWindow(input: SaveAudioPlaylistScheduleInput): void {
  if (
    input.startMinuteOfWeek < 0 ||
    input.startMinuteOfWeek >= MINUTES_PER_WEEK ||
    input.endMinuteOfWeek <= 0 ||
    input.endMinuteOfWeek > MINUTES_PER_WEEK ||
    input.endMinuteOfWeek <= input.startMinuteOfWeek
  ) {
    throw new AudioAutodjValidationError('Schedule window is invalid.');
  }
}

function resolveScheduleConflict(
  db: Database,
  companyId: string,
  input: SaveAudioPlaylistScheduleInput,
  ignoredScheduleId = ''
): AudioPlaylistScheduleConflict | null {
  const row = db
    .query(selectOverlappingScheduleSql)
    .get(companyId, ignoredScheduleId, input.endMinuteOfWeek, input.startMinuteOfWeek) as
    | PlaylistConflictRow
    | null;

  if (!row) {
    return null;
  }

  return {
    scheduleId: row.scheduleId,
    playlistId: row.playlistId,
    playlistName: row.playlistName,
    startMinuteOfWeek: row.startMinuteOfWeek,
    endMinuteOfWeek: row.endMinuteOfWeek,
  };
}

function assertNoScheduleConflict(
  db: Database,
  companyId: string,
  input: SaveAudioPlaylistScheduleInput,
  ignoredScheduleId = ''
): void {
  const conflict = resolveScheduleConflict(db, companyId, input, ignoredScheduleId);

  if (!conflict) {
    return;
  }

  throw new AudioAutodjConflictError(
    `Schedule overlaps with "${conflict.playlistName}" from ${formatMinuteOfWeek(
      conflict.startMinuteOfWeek
    )} to ${formatMinuteOfWeek(conflict.endMinuteOfWeek)}.`
  );
}

function createPlaylistMap(
  playlistRows: PlaylistRow[],
  tracksById: Map<string, AudioLibraryTrack>,
  itemRows: PlaylistItemRow[],
  scheduleRows: PlaylistScheduleRow[]
): AudioPlaylist[] {
  const itemsByPlaylistId = new Map<string, AudioPlaylistItem[]>();
  const schedulesByPlaylistId = new Map<string, AudioPlaylistSchedule[]>();

  for (const itemRow of itemRows) {
    const track = tracksById.get(itemRow.trackId);

    if (!track) {
      continue;
    }

    const currentItems = itemsByPlaylistId.get(itemRow.playlistId) ?? [];
    currentItems.push({
      id: itemRow.id,
      playlistId: itemRow.playlistId,
      trackId: itemRow.trackId,
      position: itemRow.position,
      track,
    });
    itemsByPlaylistId.set(itemRow.playlistId, currentItems);
  }

  for (const scheduleRow of scheduleRows) {
    const currentSchedules = schedulesByPlaylistId.get(scheduleRow.playlistId) ?? [];
    currentSchedules.push({
      id: scheduleRow.id,
      playlistId: scheduleRow.playlistId,
      startMinuteOfWeek: scheduleRow.startMinuteOfWeek,
      endMinuteOfWeek: scheduleRow.endMinuteOfWeek,
      createdAt: scheduleRow.createdAt,
      updatedAt: scheduleRow.updatedAt,
    });
    schedulesByPlaylistId.set(scheduleRow.playlistId, currentSchedules);
  }

  return playlistRows.map((playlistRow) => ({
    id: playlistRow.id,
    name: playlistRow.name,
    kind: playlistRow.kind,
    priority: playlistRow.kind === 'custom' ? 1 : 2,
    items: itemsByPlaylistId.get(playlistRow.id) ?? [],
    schedules: schedulesByPlaylistId.get(playlistRow.id) ?? [],
    createdAt: playlistRow.createdAt,
    updatedAt: playlistRow.updatedAt,
  }));
}

function replacePlaylistItems(db: Database, companyId: string, playlistId: string, trackIds: string[]): void {
  const deleteItems = db.query(deletePlaylistItemsSql);
  const insertItem = db.query(insertPlaylistItemSql);
  const timestamp = nowIso();

  db.exec('BEGIN');

  try {
    deleteItems.run(companyId, playlistId);

    trackIds.forEach((trackId, index) => {
      insertItem.run(companyId, crypto.randomUUID(), playlistId, trackId, index, timestamp, timestamp);
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function deleteTrackFile(storagePath: string): void {
  const absolutePath = resolve(getAudioLibraryRoot(), storagePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  unlinkSync(absolutePath);
}

export function getCompanyAudioLibraryDirectory(companyId: string): string {
  const companyDirectory = resolve(getAudioLibraryRoot(), companyId);
  mkdirSync(companyDirectory, { recursive: true });
  return companyDirectory;
}

export function ensureDefaultAudioPlaylistForCompany(db: Database, companyId: string): AudioPlaylist {
  ensureAudioAutodjSettings(db, companyId);

  const existingPlaylist = db.query(selectDefaultPlaylistByCompanyIdSql).get(companyId) as PlaylistRow | null;

  if (!existingPlaylist) {
    const timestamp = nowIso();
    db.query(insertPlaylistSql).run(
      companyId,
      crypto.randomUUID(),
      DEFAULT_PLAYLIST_NAME,
      'default',
      timestamp,
      timestamp
    );
  }

  const state = findCompanyAudioAutodjState(db, companyId);
  const defaultPlaylist = state.playlists.find((playlist) => playlist.kind === 'default');

  if (!defaultPlaylist) {
    throw new Error(`Unable to ensure default audio playlist for company ${companyId}`);
  }

  return defaultPlaylist;
}

export function ensureDefaultAudioPlaylists(db: Database): void {
  const companies = db.query(selectCompaniesSql).all() as CompanyRow[];

  for (const company of companies) {
    ensureDefaultAudioPlaylistForCompany(db, company.id);
  }
}

export function findCompanyAudioAutodjState(db: Database, companyId: string): CompanyAudioAutodjState {
  const settings = ensureAudioAutodjSettings(db, companyId);
  const defaultPlaylist = db.query(selectDefaultPlaylistByCompanyIdSql).get(companyId) as PlaylistRow | null;

  if (!defaultPlaylist) {
    const timestamp = nowIso();
    db.query(insertPlaylistSql).run(
      companyId,
      crypto.randomUUID(),
      DEFAULT_PLAYLIST_NAME,
      'default',
      timestamp,
      timestamp
    );
  }

  const folderRows = db.query(selectFoldersByCompanyIdSql).all(companyId) as FolderRow[];
  const trackRows = db.query(selectTracksByCompanyIdSql).all(companyId) as TrackRow[];
  const playlistRows = db.query(selectPlaylistsByCompanyIdSql).all(companyId) as PlaylistRow[];
  const itemRows = db.query(selectPlaylistItemsByCompanyIdSql).all(companyId) as PlaylistItemRow[];
  const scheduleRows = db.query(selectPlaylistSchedulesByCompanyIdSql).all(companyId) as PlaylistScheduleRow[];
  const folders = folderRows.map(mapFolderRow);
  const tracks = trackRows.map(mapTrackRow);
  const tracksById = new Map(tracks.map((track) => [track.id, track]));

  return {
    enabled: settings.enabled === 1,
    folders,
    tracks,
    playlists: createPlaylistMap(playlistRows, tracksById, itemRows, scheduleRows),
  };
}

export function updateCompanyAudioAutodjEnabled(
  db: Database,
  companyId: string,
  enabled: boolean
): CompanyAudioAutodjState {
  ensureAudioAutodjSettings(db, companyId);
  db.query(updateAudioAutodjSettingsSql).run(enabled ? 1 : 0, nowIso(), companyId);

  return findCompanyAudioAutodjState(db, companyId);
}

export function createAudioFolder(db: Database, companyId: string, input: CreateAudioFolderInput): AudioLibraryFolder {
  const name = input.name.trim();

  if (!name) {
    throw new AudioAutodjValidationError('Folder name is required.');
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();

  db.query(insertFolderSql).run(companyId, id, name, timestamp, timestamp);

  return mapFolderRow(ensureFolderExists(db, companyId, id));
}

export function updateAudioFolder(
  db: Database,
  companyId: string,
  folderId: string,
  input: UpdateAudioFolderInput
): AudioLibraryFolder {
  const name = input.name.trim();

  if (!name) {
    throw new AudioAutodjValidationError('Folder name is required.');
  }

  ensureFolderExists(db, companyId, folderId);
  db.query(updateFolderSql).run(name, nowIso(), companyId, folderId);

  return mapFolderRow(ensureFolderExists(db, companyId, folderId));
}

export function deleteAudioFolder(db: Database, companyId: string, folderId: string): void {
  ensureFolderExists(db, companyId, folderId);
  const tracksInFolder = db.query(countTracksByFolderIdSql).get(companyId, folderId) as CountRow | null;

  if ((tracksInFolder?.count ?? 0) > 0) {
    throw new AudioAutodjConflictError('Folder cannot be removed while it still contains tracks.');
  }

  db.query(deleteFolderSql).run(companyId, folderId);
}

export function saveAudioTrack(db: Database, companyId: string, input: SaveAudioTrackInput): AudioLibraryTrack {
  if (!input.originalFileName.trim()) {
    throw new AudioAutodjValidationError('Audio file name is required.');
  }

  if (input.folderId) {
    ensureFolderExists(db, companyId, input.folderId);
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const safeName = sanitizeFileName(input.originalFileName);
  const extension = extname(safeName);
  const storageFileName = extension ? `${id}${extension}` : `${id}`;
  const companyDirectory = getCompanyAudioLibraryDirectory(companyId);
  const absoluteFilePath = resolve(companyDirectory, storageFileName);
  const storagePath = `${companyId}/${storageFileName}`;

  writeFileSync(absoluteFilePath, input.data);

  db.query(insertTrackSql).run(
    companyId,
    id,
    input.folderId,
    input.originalFileName.trim(),
    storagePath,
    input.mimeType.trim() || 'audio/mpeg',
    input.sizeBytes,
    timestamp,
    timestamp
  );

  return mapTrackRow(ensureTrackExists(db, companyId, id));
}

export function updateAudioTrack(
  db: Database,
  companyId: string,
  trackId: string,
  input: UpdateAudioTrackInput
): AudioLibraryTrack {
  ensureTrackExists(db, companyId, trackId);

  if (input.folderId) {
    ensureFolderExists(db, companyId, input.folderId);
  }

  db.query(updateTrackFolderSql).run(input.folderId, nowIso(), companyId, trackId);

  return mapTrackRow(ensureTrackExists(db, companyId, trackId));
}

export function deleteAudioTrack(db: Database, companyId: string, trackId: string): void {
  const track = ensureTrackExists(db, companyId, trackId);
  db.query(deleteTrackSql).run(companyId, trackId);
  deleteTrackFile(track.storagePath);
}

export function createAudioPlaylist(
  db: Database,
  companyId: string,
  input: CreateAudioPlaylistInput
): AudioPlaylist {
  const name = input.name.trim();

  if (!name) {
    throw new AudioAutodjValidationError('Playlist name is required.');
  }

  const id = crypto.randomUUID();
  const timestamp = nowIso();

  db.query(insertPlaylistSql).run(companyId, id, name, 'custom', timestamp, timestamp);

  const state = findCompanyAudioAutodjState(db, companyId);
  const playlist = state.playlists.find((item) => item.id === id);

  if (!playlist) {
    throw new Error(`Unable to persist audio playlist ${name}`);
  }

  return playlist;
}

export function updateAudioPlaylist(
  db: Database,
  companyId: string,
  playlistId: string,
  input: UpdateAudioPlaylistInput
): AudioPlaylist {
  const name = input.name.trim();

  if (!name) {
    throw new AudioAutodjValidationError('Playlist name is required.');
  }

  const playlist = ensurePlaylistExists(db, companyId, playlistId);

  if (playlist.kind === 'default' && name !== playlist.name) {
    throw new AudioAutodjValidationError('Default playlist name cannot be changed.');
  }

  db.query(updatePlaylistSql).run(name, nowIso(), companyId, playlistId);

  const state = findCompanyAudioAutodjState(db, companyId);
  const updatedPlaylist = state.playlists.find((item) => item.id === playlistId);

  if (!updatedPlaylist) {
    throw new Error(`Unable to update audio playlist ${playlistId}`);
  }

  return updatedPlaylist;
}

export function deleteAudioPlaylist(db: Database, companyId: string, playlistId: string): void {
  const playlist = ensurePlaylistExists(db, companyId, playlistId);

  if (playlist.kind === 'default') {
    throw new AudioAutodjValidationError('Default playlist cannot be deleted.');
  }

  db.query(deletePlaylistSql).run(companyId, playlistId);
}

export function replaceAudioPlaylistItems(
  db: Database,
  companyId: string,
  playlistId: string,
  trackIds: string[]
): AudioPlaylist {
  ensurePlaylistExists(db, companyId, playlistId);

  for (const trackId of trackIds) {
    ensureTrackExists(db, companyId, trackId);
  }

  replacePlaylistItems(db, companyId, playlistId, trackIds);

  const state = findCompanyAudioAutodjState(db, companyId);
  const playlist = state.playlists.find((item) => item.id === playlistId);

  if (!playlist) {
    throw new Error(`Unable to update playlist items for ${playlistId}`);
  }

  return playlist;
}

export function createAudioPlaylistSchedule(
  db: Database,
  companyId: string,
  playlistId: string,
  input: SaveAudioPlaylistScheduleInput
): AudioPlaylist {
  const playlist = ensurePlaylistExists(db, companyId, playlistId);

  if (playlist.kind !== 'custom') {
    throw new AudioAutodjValidationError('Only custom playlists can have schedules.');
  }

  validateScheduleWindow(input);
  assertNoScheduleConflict(db, companyId, input);

  const timestamp = nowIso();

  db.query(insertPlaylistScheduleSql).run(
    companyId,
    crypto.randomUUID(),
    playlistId,
    input.startMinuteOfWeek,
    input.endMinuteOfWeek,
    timestamp,
    timestamp
  );

  const state = findCompanyAudioAutodjState(db, companyId);
  const updatedPlaylist = state.playlists.find((item) => item.id === playlistId);

  if (!updatedPlaylist) {
    throw new Error(`Unable to create playlist schedule for ${playlistId}`);
  }

  return updatedPlaylist;
}

export function updateAudioPlaylistSchedule(
  db: Database,
  companyId: string,
  playlistId: string,
  scheduleId: string,
  input: SaveAudioPlaylistScheduleInput
): AudioPlaylist {
  const playlist = ensurePlaylistExists(db, companyId, playlistId);

  if (playlist.kind !== 'custom') {
    throw new AudioAutodjValidationError('Only custom playlists can have schedules.');
  }

  const schedule = ensureScheduleExists(db, companyId, scheduleId);

  if (schedule.playlistId !== playlistId) {
    throw new AudioAutodjValidationError('Schedule does not belong to the selected playlist.');
  }

  validateScheduleWindow(input);
  assertNoScheduleConflict(db, companyId, input, scheduleId);

  db.query(updatePlaylistScheduleSql).run(
    input.startMinuteOfWeek,
    input.endMinuteOfWeek,
    nowIso(),
    companyId,
    scheduleId,
    playlistId
  );

  const state = findCompanyAudioAutodjState(db, companyId);
  const updatedPlaylist = state.playlists.find((item) => item.id === playlistId);

  if (!updatedPlaylist) {
    throw new Error(`Unable to update playlist schedule ${scheduleId}`);
  }

  return updatedPlaylist;
}

export function deleteAudioPlaylistSchedule(
  db: Database,
  companyId: string,
  playlistId: string,
  scheduleId: string
): AudioPlaylist {
  const schedule = ensureScheduleExists(db, companyId, scheduleId);

  if (schedule.playlistId !== playlistId) {
    throw new AudioAutodjValidationError('Schedule does not belong to the selected playlist.');
  }

  db.query(deletePlaylistScheduleSql).run(companyId, scheduleId, playlistId);

  const state = findCompanyAudioAutodjState(db, companyId);
  const updatedPlaylist = state.playlists.find((item) => item.id === playlistId);

  if (!updatedPlaylist) {
    throw new Error(`Unable to delete playlist schedule ${scheduleId}`);
  }

  return updatedPlaylist;
}

export function clearCompanyAudioLibraryDirectory(companyId: string): void {
  const companyDirectory = resolve(getAudioLibraryRoot(), companyId);

  if (!existsSync(companyDirectory)) {
    return;
  }

  rmSync(companyDirectory, { recursive: true, force: true });
}