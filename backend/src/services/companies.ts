import type { Database } from 'bun:sqlite';

import type { PublicCompany } from '../types';

interface CompanyRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCompanyInput {
  id?: string;
  name: string;
}

const selectCompanyByIdSql = `
  SELECT
    id,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM companies
  WHERE id = ?
  LIMIT 1
`;

const selectCompanyByNameSql = `
  SELECT
    id,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM companies
  WHERE name = ?
  LIMIT 1
`;

const selectAllCompaniesSql = `
  SELECT
    id,
    name,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM companies
  ORDER BY name ASC
`;

const upsertCompanySql = `
  INSERT INTO companies (
    id,
    name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    updated_at = excluded.updated_at
`;

const deleteCompanySql = `DELETE FROM companies WHERE id = ?`;
const countUsersByCompanySql = `SELECT COUNT(*) AS total FROM users WHERE company_id = ?`;
const countStreamingsByCompanySql = `SELECT COUNT(*) AS total FROM streamings WHERE company_id = ?`;

function nowIso(): string {
  return new Date().toISOString();
}

function mapRowToCompany(row: CompanyRow): PublicCompany {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findCompanyById(db: Database, id: string): PublicCompany | null {
  const row = db.query(selectCompanyByIdSql).get(id) as CompanyRow | null;

  return row ? mapRowToCompany(row) : null;
}

export function findCompanyByName(db: Database, name: string): PublicCompany | null {
  const row = db.query(selectCompanyByNameSql).get(name.trim()) as CompanyRow | null;

  return row ? mapRowToCompany(row) : null;
}

export function listCompanies(db: Database): PublicCompany[] {
  const rows = db.query(selectAllCompaniesSql).all() as CompanyRow[];

  return rows.map(mapRowToCompany);
}

export function upsertCompany(db: Database, input: SaveCompanyInput): PublicCompany {
  const id = input.id ?? crypto.randomUUID();
  const timestamp = nowIso();

  db.query(upsertCompanySql).run(id, input.name.trim(), timestamp, timestamp);

  const company = findCompanyById(db, id);

  if (!company) {
    throw new Error(`Unable to persist company ${input.name}`);
  }

  return company;
}

export function deleteCompanyById(db: Database, id: string): void {
  db.query(deleteCompanySql).run(id);
}

export function countUsersForCompany(db: Database, companyId: string): number {
  const row = db.query(countUsersByCompanySql).get(companyId) as { total: number } | null;

  return row?.total ?? 0;
}

export function countStreamingsForCompany(db: Database, companyId: string): number {
  const row = db.query(countStreamingsByCompanySql).get(companyId) as { total: number } | null;

  return row?.total ?? 0;
}