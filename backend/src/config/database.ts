import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateStreamingKey } from '../services/streamings';
import type { AppEnv } from '../types';

interface ColumnInfoRow {
  name: string;
}

interface MissingStreamingKeyRow {
  id: string;
  companyName: string;
}

interface ExistingStreamingKeyRow {
  ingestKey: string;
}

function getTableColumns(db: Database, tableName: string): string[] {
  const rows = db.query(`PRAGMA table_info(${tableName})`).all() as ColumnInfoRow[];

  return rows.map((row) => row.name);
}

function ensureStreamingIngestKeys(db: Database): void {
  const columns = getTableColumns(db, 'streamings');

  if (!columns.includes('ingest_key')) {
    db.exec('ALTER TABLE streamings ADD COLUMN ingest_key TEXT');
  }

  const missingRows = db.query(`
    SELECT
      streamings.id AS id,
      companies.name AS companyName
    FROM streamings
    INNER JOIN companies ON companies.id = streamings.company_id
    WHERE streamings.ingest_key IS NULL OR trim(streamings.ingest_key) = ''
  `).all() as MissingStreamingKeyRow[];

  if (missingRows.length > 0) {
    const existingRows = db.query(`
      SELECT ingest_key AS ingestKey
      FROM streamings
      WHERE ingest_key IS NOT NULL AND trim(ingest_key) != ''
    `).all() as ExistingStreamingKeyRow[];
    const existingKeys = new Set(existingRows.map((row) => row.ingestKey));
    const updateStreamingKey = db.query('UPDATE streamings SET ingest_key = ? WHERE id = ?');

    for (const row of missingRows) {
      let ingestKey = generateStreamingKey(row.companyName);

      while (existingKeys.has(ingestKey)) {
        ingestKey = generateStreamingKey(row.companyName);
      }

      existingKeys.add(ingestKey);
      updateStreamingKey.run(ingestKey, row.id);
    }
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_streamings_ingest_key ON streamings (ingest_key)');
}

function getWorkspaceRoot(): string {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(configDirectory, '..', '..', '..');
}

export function resolveDatabasePath(databasePath: string): string {
  return resolve(getWorkspaceRoot(), databasePath);
}

function ensurePlaylistColorColumn(db: Database): void {
  const columns = getTableColumns(db, 'company_audio_playlists');

  if (!columns.includes('color')) {
    db.exec("ALTER TABLE company_audio_playlists ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6'");
  }
}

export function createDatabase(env: AppEnv): Database {
  const databaseFilePath = resolveDatabasePath(env.databasePath);
  const databaseDirectory = dirname(databaseFilePath);
  const schemaPath = resolve(getWorkspaceRoot(), 'database', 'schema.sql');

  mkdirSync(databaseDirectory, { recursive: true });

  const database = new Database(databaseFilePath);
  const schemaSql = readFileSync(schemaPath, 'utf8');

  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(schemaSql);
  ensureStreamingIngestKeys(database);
  ensurePlaylistColorColumn(database);

  return database;
}