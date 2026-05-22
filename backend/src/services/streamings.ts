import type { Database } from 'bun:sqlite';

import type { PublicStreaming, StreamingType } from '../types';

interface StreamingRow {
  id: string;
  companyId: string;
  ingestKey: string;
  type: StreamingType;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveStreamingInput {
  id?: string;
  companyId: string;
  companyName?: string;
  type: StreamingType;
  name: string;
  ingestKey?: string;
}

const selectStreamingByIdSql = `
  SELECT
    id,
    company_id AS companyId,
    ingest_key AS ingestKey,
    type,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM streamings
  WHERE id = ?
  LIMIT 1
`;

const selectStreamingsByCompanyIdSql = `
  SELECT
    id,
    company_id AS companyId,
    ingest_key AS ingestKey,
    type,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM streamings
  WHERE company_id = ?
  ORDER BY type ASC, name ASC
`;

const selectAllStreamingsSql = `
  SELECT
    id,
    company_id AS companyId,
    ingest_key AS ingestKey,
    type,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM streamings
  ORDER BY type ASC, name ASC
`;

const streamKeyLookupSql = `
  SELECT 1
  FROM streamings
  WHERE ingest_key = ?
  LIMIT 1
`;

const upsertStreamingSql = `
  INSERT INTO streamings (
    id,
    company_id,
    ingest_key,
    type,
    name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    company_id = excluded.company_id,
    ingest_key = excluded.ingest_key,
    type = excluded.type,
    name = excluded.name,
    updated_at = excluded.updated_at
`;

const deleteStreamingSql = `DELETE FROM streamings WHERE id = ?`;
const streamingKeyCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCompanySlug(companyName: string): string {
  const normalizedName = companyName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'stream';
}

function randomStreamingSuffix(length: number): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(randomValues, (value) => streamingKeyCharacters[value % streamingKeyCharacters.length]).join('');
}

export function generateStreamingKey(companyName: string): string {
  return `${normalizeCompanySlug(companyName)}-${randomStreamingSuffix(5)}`;
}

export function isValidStreamingKey(value: string): boolean {
  const trimmedValue = value.trim();
  const generatedKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9._~]{5}$/;
  const legacyKeyPattern = /^[0-9a-f]{32}$/i;

  return generatedKeyPattern.test(trimmedValue) || legacyKeyPattern.test(trimmedValue);
}

function streamingKeyExists(db: Database, ingestKey: string): boolean {
  return db.query(streamKeyLookupSql).get(ingestKey) !== null;
}

function createUniqueStreamingKey(db: Database, companyName: string): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = generateStreamingKey(companyName);

    if (!streamingKeyExists(db, candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to generate a unique streaming key for ${companyName}`);
}

function mapRowToStreaming(row: StreamingRow): PublicStreaming {
  return {
    id: row.id,
    companyId: row.companyId,
    ingestKey: row.ingestKey,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findStreamingById(db: Database, id: string): PublicStreaming | null {
  const row = db.query(selectStreamingByIdSql).get(id) as StreamingRow | null;

  return row ? mapRowToStreaming(row) : null;
}

export function listStreamingsByCompanyId(db: Database, companyId: string): PublicStreaming[] {
  const rows = db.query(selectStreamingsByCompanyIdSql).all(companyId) as StreamingRow[];

  return rows.map(mapRowToStreaming);
}

export function listAllStreamings(db: Database): PublicStreaming[] {
  const rows = db.query(selectAllStreamingsSql).all() as StreamingRow[];

  return rows.map(mapRowToStreaming);
}

export function upsertStreaming(db: Database, input: SaveStreamingInput): PublicStreaming {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = nowIso();
  const existingStreaming = input.id ? findStreamingById(db, input.id) : null;
  const ingestKey = input.ingestKey ?? existingStreaming?.ingestKey ?? createUniqueStreamingKey(db, input.companyName ?? 'stream');

  if (input.ingestKey && input.ingestKey !== existingStreaming?.ingestKey && streamingKeyExists(db, input.ingestKey)) {
    throw new Error('Streaming key already exists.');
  }

  db.query(upsertStreamingSql).run(
    id,
    input.companyId,
    ingestKey,
    input.type,
    input.name.trim(),
    timestamp,
    timestamp
  );

  const streaming = findStreamingById(db, id);

  if (!streaming) {
    throw new Error(`Unable to persist streaming ${input.name}`);
  }

  return streaming;
}

export function deleteStreamingById(db: Database, id: string): void {
  db.query(deleteStreamingSql).run(id);
}