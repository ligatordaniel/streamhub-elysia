import type { Database } from 'bun:sqlite';

import type { AppEnv, PublicUser } from '../types';
import { hashPassword } from '../lib/password';
import { findCompanyById } from '../services/companies';
import { findUserById, toPublicUser, upsertUser } from '../services/users';
import { getScriptdogCompanyId } from './seed-data';

const SUPER_ADMIN_USER_ID = '1f9c3c28-3b8a-4b4d-a5f3-7ef9f6b70001';

export async function bootstrapSuperAdmin(db: Database, env: AppEnv): Promise<PublicUser> {
  const companyId = getScriptdogCompanyId();
  const company = findCompanyById(db, companyId);

  if (!company) {
    throw new Error('Seed company scriptdog_limitada is missing');
  }

  const existingUser = findUserById(db, SUPER_ADMIN_USER_ID);

  if (existingUser) {
    return toPublicUser(existingUser);
  }

  const passwordHash = await hashPassword(env.superAdminPassword);
  const user = upsertUser(db, {
    id: SUPER_ADMIN_USER_ID,
    companyId,
    email: env.superAdminEmail,
    passwordHash,
    role: 'super_admin',
    displayName: env.superAdminName,
  });

  return toPublicUser(user);
}