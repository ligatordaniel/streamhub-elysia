import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import type { Database } from 'bun:sqlite';

import { hashPassword, verifyPassword } from './lib/password';
import { createAuthToken, verifyAuthToken } from './lib/token';
import type {
  AdminOverview,
  AppEnv,
  CurrentSession,
  LoginRequest,
  StreamingType,
  UserRole,
} from './types';
import {
  countStreamingsForCompany,
  countUsersForCompany,
  deleteCompanyById,
  findCompanyById,
  listCompanies,
  upsertCompany,
} from './services/companies';
import {
  deleteStreamingById,
  findStreamingById,
  isValidStreamingKey,
  listAllStreamings,
  listStreamingsByCompanyId,
  upsertStreaming,
} from './services/streamings';
import {
  deleteUserById,
  findUserByEmail,
  findUserById,
  listUsers,
  toPublicUser,
  updateUserById,
  upsertUser,
} from './services/users';

interface AppOptions {
  env: AppEnv;
  db: Database;
}

interface CreateCompanyRequest {
  name: string;
}

interface CreateStreamingRequest {
  companyId: string;
  type: StreamingType;
  name: string;
}

interface UpdateStreamingRequest {
  companyId?: string;
  type?: StreamingType;
  name?: string;
  ingestKey?: string;
}

interface CreateUserRequest {
  companyId: string;
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
}

interface UpdateUserRequest {
  companyId?: string;
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value.trim());
}

function parseUuid(value: unknown): string | null {
  return isUuid(value) ? value.trim() : null;
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

function parseStreamingType(value: unknown): StreamingType | null {
  if (value === 'audio' || value === 'video') {
    return value;
  }

  return null;
}

function parseUserRole(value: unknown): UserRole | null {
  if (value === 'super_admin' || value === 'user') {
    return value;
  }

  return null;
}

function parseLoginRequest(body: unknown): LoginRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const email = parseNonEmptyString(record.email);
  const password = parseNonEmptyString(record.password);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function parseCreateCompanyRequest(body: unknown): CreateCompanyRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = parseNonEmptyString(record.name);

  return name ? { name } : null;
}

function parseCreateStreamingRequest(body: unknown): CreateStreamingRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const companyId = parseUuid(record.companyId);
  const type = parseStreamingType(record.type);
  const name = parseNonEmptyString(record.name);

  if (!companyId || !type || !name) {
    return null;
  }

  return { companyId, type, name };
}

function parseUpdateStreamingRequest(body: unknown): UpdateStreamingRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const parsedCompanyId = record.companyId === undefined ? undefined : parseUuid(record.companyId);
  const parsedType = record.type === undefined ? undefined : parseStreamingType(record.type);
  const parsedName = record.name === undefined ? undefined : parseNonEmptyString(record.name);
  const rawIngestKey = record.ingestKey === undefined ? undefined : parseNonEmptyString(record.ingestKey);
  const companyId = typeof parsedCompanyId === 'string' ? parsedCompanyId : undefined;
  const type = parsedType === undefined || parsedType === null ? undefined : parsedType;
  const name = typeof parsedName === 'string' ? parsedName : undefined;
  const ingestKey = typeof rawIngestKey === 'string' ? rawIngestKey : undefined;
  const hasCompanyId = record.companyId !== undefined;
  const hasType = record.type !== undefined;
  const hasName = record.name !== undefined;
  const hasIngestKey = record.ingestKey !== undefined;

  if (
    (hasCompanyId && !companyId) ||
    (hasType && !type) ||
    (hasName && !name) ||
    (hasIngestKey && !ingestKey) ||
    (typeof rawIngestKey === 'string' && !isValidStreamingKey(rawIngestKey)) ||
    (!hasCompanyId && !hasType && !hasName && !hasIngestKey)
  ) {
    return null;
  }

  return {
    ...(companyId !== undefined ? { companyId } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(ingestKey !== undefined ? { ingestKey } : {}),
  };
}

function parseCreateUserRequest(body: unknown): CreateUserRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const companyId = parseUuid(record.companyId);
  const email = parseNonEmptyString(record.email);
  const password = parseNonEmptyString(record.password);
  const displayName = parseNonEmptyString(record.displayName);
  const role = record.role === undefined ? 'user' : parseUserRole(record.role);

  if (!companyId || !email || !password || !displayName || !role) {
    return null;
  }

  return { companyId, email, password, displayName, role };
}

function parseUpdateUserRequest(body: unknown): UpdateUserRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const companyId = record.companyId === undefined ? undefined : parseUuid(record.companyId);
  const email = record.email === undefined ? undefined : parseNonEmptyString(record.email);
  const password = record.password === undefined ? undefined : parseNonEmptyString(record.password);
  const displayName =
    record.displayName === undefined ? undefined : parseNonEmptyString(record.displayName);
  const role = record.role === undefined ? undefined : parseUserRole(record.role);

  if (
    (record.companyId !== undefined && !companyId) ||
    (record.email !== undefined && !email) ||
    (record.password !== undefined && !password) ||
    (record.displayName !== undefined && !displayName) ||
    (record.role !== undefined && !role) ||
    (companyId === undefined && email === undefined && password === undefined && displayName === undefined && role === undefined)
  ) {
    return null;
  }

  return { companyId, email, password, displayName, role };
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim();
}

function buildPermissions(role: UserRole) {
  const isSuperAdmin = role === 'super_admin';

  return {
    canManageCompanies: isSuperAdmin,
    canManageUsers: isSuperAdmin,
    canManageStreamings: isSuperAdmin,
  };
}

function buildCurrentSession(db: Database, userId: string): CurrentSession | null {
  const user = findUserById(db, userId);

  if (!user) {
    return null;
  }

  const company = findCompanyById(db, user.companyId);

  if (!company) {
    return null;
  }

  return {
    user: toPublicUser(user),
    company,
    streamings: listStreamingsByCompanyId(db, company.id),
    permissions: buildPermissions(user.role),
  };
}

function buildAdminOverview(db: Database): AdminOverview {
  return {
    companies: listCompanies(db),
    users: listUsers(db),
    streamings: listAllStreamings(db),
  };
}

async function resolveAuthenticatedSession(env: AppEnv, db: Database, request: Request) {
  const token = extractBearerToken(request.headers.get('authorization'));

  if (!token) {
    return null;
  }

  const claims = await verifyAuthToken(token, env.jwtSecret);

  if (!claims) {
    return null;
  }

  const user = findUserById(db, claims.sub);

  if (!user) {
    return null;
  }

  if (user.email !== claims.email || user.companyId !== claims.companyId || user.role !== claims.role) {
    return null;
  }

  return buildCurrentSession(db, user.id);
}

async function requireSuperAdminSession(env: AppEnv, db: Database, request: Request) {
  const session = await resolveAuthenticatedSession(env, db, request);

  if (!session || session.user.role !== 'super_admin') {
    return null;
  }

  return session;
}

export function createApp({ env, db }: AppOptions): Elysia {
  return new Elysia()
    .use(cors({ origin: env.corsOrigin }))
    .get('/health', () => ({ ok: true, app: env.appName }))
    .post('/auth/login', async ({ body, set }) => {
      const payload = parseLoginRequest(body);

      if (!payload) {
        set.status = 400;
        return { error: 'Email and password are required.' };
      }

      const user = findUserByEmail(db, payload.email);

      if (!user) {
        set.status = 401;
        return { error: 'Invalid credentials.' };
      }

      const passwordIsValid = await verifyPassword(payload.password, user.passwordHash);

      if (!passwordIsValid) {
        set.status = 401;
        return { error: 'Invalid credentials.' };
      }

      const session = buildCurrentSession(db, user.id);

      if (!session) {
        set.status = 500;
        return { error: 'Unable to resolve session.' };
      }

      const issuedAt = Date.now();
      const expiresAt = issuedAt + env.jwtTtlSeconds * 1000;

      const token = await createAuthToken(
        {
          sub: user.id,
          email: user.email,
          companyId: user.companyId,
          role: user.role,
          displayName: user.displayName,
          iat: issuedAt,
          exp: expiresAt,
          iss: env.jwtIssuer,
          aud: env.jwtAudience,
        },
        env.jwtSecret
      );

      return {
        token,
        expiresAt,
        ...session,
      };
    })
    .get('/auth/me', async ({ request, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      return session;
    })
    .get('/streamings/mine', async ({ request, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      return { streamings: session.streamings };
    })
    .get('/admin/overview', async ({ request, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      return buildAdminOverview(db);
    })
    .post('/admin/companies', async ({ request, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const payload = parseCreateCompanyRequest(body);

      if (!payload) {
        set.status = 400;
        return { error: 'Company name is required.' };
      }

      return upsertCompany(db, { name: payload.name });
    })
    .patch('/admin/companies/:companyId', async ({ request, params, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const companyId = parseUuid(params.companyId);
      const payload = parseCreateCompanyRequest(body);

      if (!companyId || !payload) {
        set.status = 400;
        return { error: 'Valid company id and name are required.' };
      }

      if (!findCompanyById(db, companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      return upsertCompany(db, { id: companyId, name: payload.name });
    })
    .delete('/admin/companies/:companyId', async ({ request, params, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const companyId = parseUuid(params.companyId);

      if (!companyId) {
        set.status = 400;
        return { error: 'Valid company id is required.' };
      }

      const usersCount = countUsersForCompany(db, companyId);
      const streamingsCount = countStreamingsForCompany(db, companyId);

      if (usersCount > 0 || streamingsCount > 0) {
        set.status = 409;
        return { error: 'Reassign users and streamings before deleting the company.' };
      }

      deleteCompanyById(db, companyId);
      set.status = 204;
      return null;
    })
    .post('/admin/users', async ({ request, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const payload = parseCreateUserRequest(body);

      if (!payload) {
        set.status = 400;
        return { error: 'User payload is invalid.' };
      }

      if (!findCompanyById(db, payload.companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      const user = upsertUser(db, {
        companyId: payload.companyId,
        email: payload.email,
        passwordHash: await hashPassword(payload.password),
        role: payload.role ?? 'user',
        displayName: payload.displayName,
      });

      return toPublicUser(user);
    })
    .patch('/admin/users/:userId', async ({ request, params, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const userId = parseUuid(params.userId);
      const payload = parseUpdateUserRequest(body);

      if (!userId || !payload) {
        set.status = 400;
        return { error: 'Valid user id and update payload are required.' };
      }

      const existingUser = findUserById(db, userId);

      if (!existingUser) {
        set.status = 404;
        return { error: 'User not found.' };
      }

      if (payload.companyId && !findCompanyById(db, payload.companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      const updatedUser = updateUserById(db, {
        id: userId,
        companyId: payload.companyId,
        email: payload.email,
        passwordHash: payload.password ? await hashPassword(payload.password) : undefined,
        role: payload.role,
        displayName: payload.displayName,
      });

      return toPublicUser(updatedUser);
    })
    .delete('/admin/users/:userId', async ({ request, params, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const userId = parseUuid(params.userId);

      if (!userId) {
        set.status = 400;
        return { error: 'Valid user id is required.' };
      }

      deleteUserById(db, userId);
      set.status = 204;
      return null;
    })
    .post('/admin/streamings', async ({ request, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const payload = parseCreateStreamingRequest(body);

      if (!payload) {
        set.status = 400;
        return { error: 'Streaming payload is invalid.' };
      }

      if (!findCompanyById(db, payload.companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      const company = findCompanyById(db, payload.companyId);

      return upsertStreaming(db, {
        ...payload,
        ...(company ? { companyName: company.name } : {}),
      });
    })
    .patch('/admin/streamings/:streamingId', async ({ request, params, body, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const streamingId = parseUuid(params.streamingId);
      const payload = parseUpdateStreamingRequest(body);

      if (!streamingId || !payload) {
        set.status = 400;
        return { error: 'Valid streaming id and update payload are required.' };
      }

      const existingStreaming = findStreamingById(db, streamingId);

      if (!existingStreaming) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      const nextCompanyId = payload.companyId ?? existingStreaming.companyId;
      const nextCompany = findCompanyById(db, nextCompanyId);

      if (!nextCompany) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      return upsertStreaming(db, {
        id: streamingId,
        companyId: nextCompanyId,
        ...(nextCompany ? { companyName: nextCompany.name } : {}),
        type: payload.type ?? existingStreaming.type,
        name: payload.name ?? existingStreaming.name,
        ...(payload.ingestKey !== undefined ? { ingestKey: payload.ingestKey } : {}),
      });
    })
    .delete('/admin/streamings/:streamingId', async ({ request, params, set }) => {
      const session = await requireSuperAdminSession(env, db, request);

      if (!session) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const streamingId = parseUuid(params.streamingId);

      if (!streamingId) {
        set.status = 400;
        return { error: 'Valid streaming id is required.' };
      }

      deleteStreamingById(db, streamingId);
      set.status = 204;
      return null;
    })
    .post('/auth/logout', ({ set }) => {
      set.status = 204;
      return null;
    });
}