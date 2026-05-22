import type { Database } from 'bun:sqlite';

import type { PublicStreaming, StreamingType } from '../types';

interface StreamingRow {
  id: string;
  companyId: string;
  type: StreamingType;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveStreamingInput {
  id?: string;
  companyId: string;
  type: StreamingType;
  name: string;
}

const selectStreamingByIdSql = `
  SELECT
    id,
    company_id AS companyId,
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
    type,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM streamings
  ORDER BY type ASC, name ASC
`;

const upsertStreamingSql = `
  INSERT INTO streamings (
    id,
    company_id,
    type,
    name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    company_id = excluded.company_id,
    type = excluded.type,
    name = excluded.name,
    updated_at = excluded.updated_at
`;

const deleteStreamingSql = `DELETE FROM streamings WHERE id = ?`;

function nowIso(): string {
  return new Date().toISOString();
}

function mapRowToStreaming(row: StreamingRow): PublicStreaming {
  return {
    id: row.id,
    companyId: row.companyId,
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

  db.query(upsertStreamingSql).run(
    id,
    input.companyId,
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