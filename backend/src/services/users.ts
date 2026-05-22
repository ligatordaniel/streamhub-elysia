import type { Database } from 'bun:sqlite';

import type { AdminUser, PublicCompany, PublicUser, StoredUser, UserRole } from '../types';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  companyId: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminUserRow {
  id: string;
  email: string;
  companyId: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  companyName: string;
  companyCreatedAt: string;
  companyUpdatedAt: string;
}

export interface UpsertUserInput {
  id?: string;
  companyId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
}

export interface UpdateUserInput {
  id: string;
  companyId?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRole;
  displayName?: string;
}

const selectUserByEmailSql = `
  SELECT
    id,
    email,
    password_hash AS passwordHash,
    company_id AS companyId,
    role,
    display_name AS displayName,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM users
  WHERE email = ?
  LIMIT 1
`;

const selectUserByIdSql = `
  SELECT
    id,
    email,
    password_hash AS passwordHash,
    company_id AS companyId,
    role,
    display_name AS displayName,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM users
  WHERE id = ?
  LIMIT 1
`;

const selectAllUsersSql = `
  SELECT
    u.id,
    u.email,
    u.company_id AS companyId,
    u.role,
    u.display_name AS displayName,
    u.created_at AS createdAt,
    u.updated_at AS updatedAt,
    c.name AS companyName,
    c.created_at AS companyCreatedAt,
    c.updated_at AS companyUpdatedAt
  FROM users u
  INNER JOIN companies c ON c.id = u.company_id
  ORDER BY u.created_at ASC
`;

const upsertUserSql = `
  INSERT INTO users (
    id,
    company_id,
    email,
    password_hash,
    role,
    display_name,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    company_id = excluded.company_id,
    email = excluded.email,
    password_hash = excluded.password_hash,
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = excluded.updated_at
`;

const updateUserByIdSql = `
  UPDATE users
  SET
    company_id = COALESCE(?, company_id),
    email = COALESCE(?, email),
    password_hash = COALESCE(?, password_hash),
    role = COALESCE(?, role),
    display_name = COALESCE(?, display_name),
    updated_at = ?
  WHERE id = ?
`;

const deleteUserByIdSql = `DELETE FROM users WHERE id = ?`;

function mapRowToStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    companyId: row.companyId,
    role: row.role,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    companyId: row.companyId,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    company: {
      id: row.companyId,
      name: row.companyName,
      createdAt: row.companyCreatedAt,
      updatedAt: row.companyUpdatedAt,
    },
  };
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    companyId: user.companyId,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function findUserByEmail(db: Database, email: string): StoredUser | null {
  const normalizedEmail = normalizeEmail(email);
  const row = db.query(selectUserByEmailSql).get(normalizedEmail) as UserRow | null;

  return row ? mapRowToStoredUser(row) : null;
}

export function findUserById(db: Database, id: string): StoredUser | null {
  const row = db.query(selectUserByIdSql).get(id) as UserRow | null;

  return row ? mapRowToStoredUser(row) : null;
}

export function listUsers(db: Database): AdminUser[] {
  const rows = db.query(selectAllUsersSql).all() as AdminUserRow[];

  return rows.map(mapRowToAdminUser);
}

export function upsertUser(db: Database, input: UpsertUserInput): StoredUser {
  const timestamp = nowIso();
  const id = input.id ?? crypto.randomUUID();

  db.query(upsertUserSql).run(
    id,
    input.companyId,
    normalizeEmail(input.email),
    input.passwordHash,
    input.role,
    input.displayName,
    timestamp,
    timestamp
  );

  const user = findUserById(db, id);

  if (!user) {
    throw new Error(`Unable to persist user ${input.email}`);
  }

  return user;
}

export function updateUserById(db: Database, input: UpdateUserInput): StoredUser {
  const existingUser = findUserById(db, input.id);

  if (!existingUser) {
    throw new Error(`User not found: ${input.id}`);
  }

  const timestamp = nowIso();
  const companyId = input.companyId ?? existingUser.companyId;
  const normalizedEmail = input.email ? normalizeEmail(input.email) : existingUser.email;
  const passwordHash = input.passwordHash ?? existingUser.passwordHash;
  const role = input.role ?? existingUser.role;
  const displayName = input.displayName ?? existingUser.displayName;

  db.query(updateUserByIdSql).run(
    companyId,
    normalizedEmail,
    passwordHash,
    role,
    displayName,
    timestamp,
    input.id
  );

  const updatedUser = findUserById(db, input.id);

  if (!updatedUser) {
    throw new Error(`Unable to update user ${input.id}`);
  }

  return updatedUser;
}

export function deleteUserById(db: Database, id: string): void {
  db.query(deleteUserByIdSql).run(id);
}