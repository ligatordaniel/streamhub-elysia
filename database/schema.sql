PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'user')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS streamings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  ingest_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('audio', 'video')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS company_emergency_fallback_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  autoplay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (autoplay_enabled IN (0, 1)),
  selected_image_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS company_emergency_fallback_images (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id)
);

CREATE TABLE IF NOT EXISTS company_audio_library_folders (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id)
);

CREATE TABLE IF NOT EXISTS company_audio_autodj_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS company_audio_library_tracks (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  folder_id TEXT,
  original_file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, folder_id)
    REFERENCES company_audio_library_folders (company_id, id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS company_audio_playlists (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('default', 'custom')),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  shuffle_enabled INTEGER NOT NULL DEFAULT 0 CHECK (shuffle_enabled IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id)
);

CREATE TABLE IF NOT EXISTS company_audio_playlist_items (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, playlist_id)
    REFERENCES company_audio_playlists (company_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (company_id, track_id)
    REFERENCES company_audio_library_tracks (company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS company_audio_playlist_schedules (
  company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  start_minute_of_week INTEGER NOT NULL CHECK (start_minute_of_week >= 0 AND start_minute_of_week < 10080),
  end_minute_of_week INTEGER NOT NULL CHECK (
    end_minute_of_week > 0 AND end_minute_of_week <= 10080 AND end_minute_of_week > start_minute_of_week
  ),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, playlist_id)
    REFERENCES company_audio_playlists (company_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_streamings_company_id ON streamings (company_id);
CREATE INDEX IF NOT EXISTS idx_streamings_type ON streamings (type);
CREATE INDEX IF NOT EXISTS idx_company_emergency_fallback_images_company_id_position
  ON company_emergency_fallback_images (company_id, position);
CREATE INDEX IF NOT EXISTS idx_company_audio_autodj_settings_enabled
  ON company_audio_autodj_settings (enabled);
CREATE INDEX IF NOT EXISTS idx_company_audio_library_folders_company_name
  ON company_audio_library_folders (company_id, name);
CREATE INDEX IF NOT EXISTS idx_company_audio_library_tracks_company_folder
  ON company_audio_library_tracks (company_id, folder_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_audio_library_tracks_company_storage_path
  ON company_audio_library_tracks (company_id, storage_path);
CREATE INDEX IF NOT EXISTS idx_company_audio_playlists_company_kind_name
  ON company_audio_playlists (company_id, kind, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_audio_playlists_default
  ON company_audio_playlists (company_id)
  WHERE kind = 'default';
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_audio_playlist_items_playlist_position
  ON company_audio_playlist_items (company_id, playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_company_audio_playlist_items_playlist_track
  ON company_audio_playlist_items (company_id, playlist_id, track_id);
CREATE INDEX IF NOT EXISTS idx_company_audio_playlist_schedules_company_window
  ON company_audio_playlist_schedules (company_id, start_minute_of_week, end_minute_of_week);