import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import type { Database } from 'bun:sqlite';

import { hashPassword, verifyPassword } from './lib/password';
import { createAuthToken, verifyAuthToken } from './lib/token';
import type {
  AdminOverview,
  AppEnv,
  CompanyEmergencyFallback,
  CurrentSession,
  EmergencyImage,
  LoginRequest,
  StreamingType,
  UserRole,
} from './types';
import {
  AudioAutodjConflictError,
  AudioAutodjValidationError,
  clearCompanyAudioLibraryDirectory,
  createAudioFolder,
  createAudioPlaylist,
  createAudioPlaylistSchedule,
  ensureDefaultAudioPlaylistForCompany,
  deleteAudioFolder,
  deleteAudioPlaylist,
  deleteAudioPlaylistSchedule,
  deleteAudioTrack,
  findCompanyAudioAutodjState,
  replaceAudioPlaylistItems,
  saveAudioTrack,
  updateCompanyAudioAutodjEnabled,
  updateAudioFolder,
  updateAudioPlaylist,
  updateAudioPlaylistSchedule,
  updateAudioTrack,
} from './services/audio-autodj';
import {
  countStreamingsForCompany,
  countUsersForCompany,
  deleteCompanyById,
  findCompanyById,
  listCompanies,
  upsertCompany,
} from './services/companies';
import {
  findCompanyEmergencyFallback,
  findPublicEmergencyFallbackByOpaquePath,
  MAX_COMPANY_EMERGENCY_IMAGES,
  saveCompanyEmergencyFallback,
} from './services/emergency-fallbacks';
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

interface StreamingEmergencyFallbackRequest {
  autoplayEnabled: boolean;
  selectedImageId: string | null;
  images: EmergencyImage[];
}

interface CreateAudioFolderRequest {
  name: string;
}

interface UpdateAudioFolderRequest {
  name: string;
}

interface UpdateAudioTrackRequest {
  folderId: string | null;
}

interface CreateAudioPlaylistRequest {
  name: string;
  color: string;
}

interface UpdateAudioPlaylistRequest {
  name?: string;
  color?: string;
}

interface ReplaceAudioPlaylistItemsRequest {
  trackIds: string[];
}

interface AudioPlaylistScheduleRequest {
  startMinuteOfWeek: number;
  endMinuteOfWeek: number;
}

interface UpdateAudioAutodjSettingsRequest {
  enabled: boolean;
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

function parseEmergencyImage(value: unknown): EmergencyImage | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = parseNonEmptyString(record.id);
  const name = parseNonEmptyString(record.name);
  const dataUrl = parseNonEmptyString(record.dataUrl);

  if (!id || !name || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  return {
    id,
    name,
    dataUrl,
  };
}

function parseStreamingEmergencyFallbackRequest(body: unknown): StreamingEmergencyFallbackRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.autoplayEnabled !== 'boolean' || !Array.isArray(record.images)) {
    return null;
  }

  const images: EmergencyImage[] = [];

  for (const image of record.images) {
    const parsedImage = parseEmergencyImage(image);

    if (!parsedImage) {
      return null;
    }

    images.push(parsedImage);
  }

  if (images.length > MAX_COMPANY_EMERGENCY_IMAGES) {
    return null;
  }

  const selectedImageId =
    record.selectedImageId === undefined || record.selectedImageId === null
      ? null
      : parseNonEmptyString(record.selectedImageId);

  if (record.selectedImageId !== undefined && record.selectedImageId !== null && !selectedImageId) {
    return null;
  }

  return {
    autoplayEnabled: record.autoplayEnabled,
    selectedImageId,
    images,
  };
}

function parseCreateCompanyRequest(body: unknown): CreateCompanyRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = parseNonEmptyString(record.name);

  return name ? { name } : null;
}

function parseMinuteOfWeek(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function parseCreateAudioFolderRequest(body: unknown): CreateAudioFolderRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = parseNonEmptyString(record.name);

  return name ? { name } : null;
}

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

function parseHexColor(value: unknown): string | null {
  return typeof value === 'string' && hexColorPattern.test(value.trim()) ? value.trim() : null;
}

function parseCreateAudioPlaylistRequest(body: unknown): CreateAudioPlaylistRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = parseNonEmptyString(record.name);
  const color = parseHexColor(record.color);

  return name && color ? { name, color } : null;
}

function parseUpdateAudioPlaylistRequest(body: unknown): UpdateAudioPlaylistRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = 'name' in record ? parseNonEmptyString(record.name) ?? undefined : undefined;
  const color = 'color' in record ? parseHexColor(record.color) ?? undefined : undefined;

  if (name === undefined && color === undefined) {
    return null;
  }

  const result: UpdateAudioPlaylistRequest = {};
  if (name !== undefined) result.name = name;
  if (color !== undefined) result.color = color;
  return result;
}

function parseUpdateAudioTrackRequest(body: unknown): UpdateAudioTrackRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(record, 'folderId')) {
    return null;
  }

  if (record.folderId === null) {
    return { folderId: null };
  }

  const folderId = parseUuid(record.folderId);

  return folderId ? { folderId } : null;
}

function parseReplaceAudioPlaylistItemsRequest(body: unknown): ReplaceAudioPlaylistItemsRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.trackIds)) {
    return null;
  }

  const trackIds: string[] = [];

  for (const value of record.trackIds) {
    const trackId = parseUuid(value);

    if (!trackId) {
      return null;
    }

    trackIds.push(trackId);
  }

  return { trackIds };
}

function parseAudioPlaylistScheduleRequest(body: unknown): AudioPlaylistScheduleRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const startMinuteOfWeek = parseMinuteOfWeek(record.startMinuteOfWeek);
  const endMinuteOfWeek = parseMinuteOfWeek(record.endMinuteOfWeek);

  if (startMinuteOfWeek === null || endMinuteOfWeek === null) {
    return null;
  }

  return {
    startMinuteOfWeek,
    endMinuteOfWeek,
  };
}

function parseUpdateAudioAutodjSettingsRequest(body: unknown): UpdateAudioAutodjSettingsRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.enabled !== 'boolean') {
    return null;
  }

  return { enabled: record.enabled };
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
  const parsedCompanyId = record.companyId === undefined ? undefined : parseUuid(record.companyId);
  const parsedEmail = record.email === undefined ? undefined : parseNonEmptyString(record.email);
  const parsedPassword = record.password === undefined ? undefined : parseNonEmptyString(record.password);
  const parsedDisplayName =
    record.displayName === undefined ? undefined : parseNonEmptyString(record.displayName);
  const parsedRole = record.role === undefined ? undefined : parseUserRole(record.role);
  const companyId = typeof parsedCompanyId === 'string' ? parsedCompanyId : undefined;
  const email = typeof parsedEmail === 'string' ? parsedEmail : undefined;
  const password = typeof parsedPassword === 'string' ? parsedPassword : undefined;
  const displayName = typeof parsedDisplayName === 'string' ? parsedDisplayName : undefined;
  const role = parsedRole === undefined || parsedRole === null ? undefined : parsedRole;

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

  return {
    ...(companyId !== undefined ? { companyId } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(password !== undefined ? { password } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(role !== undefined ? { role } : {}),
  };
}

function parseRequestedCompanyId(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseUuid(value);
}

function isFormDataFile(value: FormDataEntryValue): value is File {
  return typeof value !== 'string';
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

function resolveEmergencyFallbackCompanyId(
  session: CurrentSession,
  fallbackStreaming: { companyId: string }
): string | null {
  if (session.user.role === 'super_admin') {
    return fallbackStreaming.companyId;
  }

  return session.company.id === fallbackStreaming.companyId ? session.company.id : null;
}

function resolveAudioAutodjCompanyId(
  session: CurrentSession,
  requestedCompanyId: string | undefined
): string | null {
  if (!requestedCompanyId) {
    return session.company.id;
  }

  if (session.user.role === 'super_admin') {
    return requestedCompanyId;
  }

  return session.company.id === requestedCompanyId ? session.company.id : null;
}

function handleAudioAutodjError(set: { status: number }, error: unknown) {
  if (error instanceof AudioAutodjConflictError) {
    set.status = 409;
    return { error: error.message };
  }

  if (error instanceof AudioAutodjValidationError) {
    set.status = 400;
    return { error: error.message };
  }

  throw error;
}

export function createApp({ env, db }: AppOptions) {
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
    .get('/audio/autodj', async ({ request, query, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId) {
        set.status = 400;
        return { error: 'Valid company id is required.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      if (!findCompanyById(db, companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      return findCompanyAudioAutodjState(db, companyId);
    })
    .patch('/audio/autodj/settings', async ({ request, query, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const payload = parseUpdateAudioAutodjSettingsRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'AutoDJ settings payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      if (!findCompanyById(db, companyId)) {
        set.status = 404;
        return { error: 'Company not found.' };
      }

      try {
        return updateCompanyAudioAutodjEnabled(db, companyId, payload.enabled);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .post('/audio/autodj/folders', async ({ request, query, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const payload = parseCreateAudioFolderRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Folder payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return createAudioFolder(db, companyId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .patch('/audio/autodj/folders/:folderId', async ({ request, query, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const folderId = parseUuid(params.folderId);
      const payload = parseCreateAudioFolderRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!folderId || !payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Folder update payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return updateAudioFolder(db, companyId, folderId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .delete('/audio/autodj/folders/:folderId', async ({ request, query, params, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const folderId = parseUuid(params.folderId);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!folderId || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Valid folder id is required.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        deleteAudioFolder(db, companyId, folderId);
        set.status = 204;
        return null;
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .post('/audio/autodj/tracks/upload', async ({ request, query, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId) {
        set.status = 400;
        return { error: 'Valid company id is required.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      const formData = await request.formData();
      const rawFolderId = formData.get('folderId');
      const folderId = rawFolderId === null || rawFolderId === '' ? null : parseUuid(rawFolderId);

      if (rawFolderId !== null && rawFolderId !== '' && !folderId) {
        set.status = 400;
        return { error: 'Valid folder id is required.' };
      }

      const files = formData.getAll('files').filter(isFormDataFile);

      if (files.length === 0) {
        set.status = 400;
        return { error: 'At least one audio file is required.' };
      }

      try {
        const tracks = [];

        for (const file of files) {
          if (!file.name.trim() || file.size <= 0) {
            throw new AudioAutodjValidationError('Every uploaded track must have a name and content.');
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          tracks.push(
            saveAudioTrack(db, companyId, {
              folderId,
              originalFileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              data: bytes,
            })
          );
        }

        return { tracks };
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .patch('/audio/autodj/tracks/:trackId', async ({ request, query, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const trackId = parseUuid(params.trackId);
      const payload = parseUpdateAudioTrackRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!trackId || !payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Track update payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return updateAudioTrack(db, companyId, trackId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .delete('/audio/autodj/tracks/:trackId', async ({ request, query, params, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const trackId = parseUuid(params.trackId);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!trackId || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Valid track id is required.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        deleteAudioTrack(db, companyId, trackId);
        set.status = 204;
        return null;
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .post('/audio/autodj/playlists', async ({ request, query, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const payload = parseCreateAudioPlaylistRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Playlist payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return createAudioPlaylist(db, companyId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .patch('/audio/autodj/playlists/:playlistId', async ({ request, query, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const playlistId = parseUuid(params.playlistId);
      const payload = parseUpdateAudioPlaylistRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!playlistId || !payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Playlist update payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return updateAudioPlaylist(db, companyId, playlistId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .delete('/audio/autodj/playlists/:playlistId', async ({ request, query, params, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const playlistId = parseUuid(params.playlistId);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!playlistId || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Valid playlist id is required.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        deleteAudioPlaylist(db, companyId, playlistId);
        set.status = 204;
        return null;
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .put('/audio/autodj/playlists/:playlistId/items', async ({ request, query, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const playlistId = parseUuid(params.playlistId);
      const payload = parseReplaceAudioPlaylistItemsRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!playlistId || !payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Playlist items payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return replaceAudioPlaylistItems(db, companyId, playlistId, payload.trackIds);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .post('/audio/autodj/playlists/:playlistId/schedules', async ({ request, query, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const playlistId = parseUuid(params.playlistId);
      const payload = parseAudioPlaylistScheduleRequest(body);
      const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

      if (!playlistId || !payload || ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)) {
        set.status = 400;
        return { error: 'Schedule payload is invalid.' };
      }

      const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

      if (!companyId) {
        set.status = 403;
        return { error: 'Forbidden.' };
      }

      try {
        return createAudioPlaylistSchedule(db, companyId, playlistId, payload);
      } catch (error) {
        return handleAudioAutodjError(set, error);
      }
    })
    .patch(
      '/audio/autodj/playlists/:playlistId/schedules/:scheduleId',
      async ({ request, query, params, body, set }) => {
        const session = await resolveAuthenticatedSession(env, db, request);

        if (!session) {
          set.status = 401;
          return { error: 'Unauthorized.' };
        }

        const playlistId = parseUuid(params.playlistId);
        const scheduleId = parseUuid(params.scheduleId);
        const payload = parseAudioPlaylistScheduleRequest(body);
        const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

        if (
          !playlistId ||
          !scheduleId ||
          !payload ||
          ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)
        ) {
          set.status = 400;
          return { error: 'Schedule payload is invalid.' };
        }

        const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

        if (!companyId) {
          set.status = 403;
          return { error: 'Forbidden.' };
        }

        try {
          return updateAudioPlaylistSchedule(db, companyId, playlistId, scheduleId, payload);
        } catch (error) {
          return handleAudioAutodjError(set, error);
        }
      }
    )
    .delete(
      '/audio/autodj/playlists/:playlistId/schedules/:scheduleId',
      async ({ request, query, params, set }) => {
        const session = await resolveAuthenticatedSession(env, db, request);

        if (!session) {
          set.status = 401;
          return { error: 'Unauthorized.' };
        }

        const playlistId = parseUuid(params.playlistId);
        const scheduleId = parseUuid(params.scheduleId);
        const requestedCompanyId = parseRequestedCompanyId((query as Record<string, unknown>).companyId);

        if (
          !playlistId ||
          !scheduleId ||
          ((query as Record<string, unknown>).companyId !== undefined && !requestedCompanyId)
        ) {
          set.status = 400;
          return { error: 'Valid playlist id and schedule id are required.' };
        }

        const companyId = resolveAudioAutodjCompanyId(session, requestedCompanyId);

        if (!companyId) {
          set.status = 403;
          return { error: 'Forbidden.' };
        }

        try {
          return deleteAudioPlaylistSchedule(db, companyId, playlistId, scheduleId);
        } catch (error) {
          return handleAudioAutodjError(set, error);
        }
      }
    )
    .get('/streamings/:streamingId/emergency-fallback', async ({ request, params, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const streamingId = parseUuid(params.streamingId);

      if (!streamingId) {
        set.status = 400;
        return { error: 'Valid streaming id is required.' };
      }

      const streaming = findStreamingById(db, streamingId);

      if (!streaming) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      const companyId = resolveEmergencyFallbackCompanyId(session, streaming);

      if (!companyId) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      return findCompanyEmergencyFallback(db, companyId);
    })
    .put('/streamings/:streamingId/emergency-fallback', async ({ request, params, body, set }) => {
      const session = await resolveAuthenticatedSession(env, db, request);

      if (!session) {
        set.status = 401;
        return { error: 'Unauthorized.' };
      }

      const streamingId = parseUuid(params.streamingId);
      const payload = parseStreamingEmergencyFallbackRequest(body);

      if (!streamingId || !payload) {
        set.status = 400;
        return { error: 'Emergency fallback payload is invalid.' };
      }

      const streaming = findStreamingById(db, streamingId);

      if (!streaming) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      const companyId = resolveEmergencyFallbackCompanyId(session, streaming);

      if (!companyId) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      return saveCompanyEmergencyFallback(db, companyId, payload as CompanyEmergencyFallback);
    })
    .get('/public/streamings/:streamingAlias/:publishKey/emergency-fallback', async ({ params, set }) => {
      const streamingAlias = parseNonEmptyString(params.streamingAlias);
      const publishKey = parseNonEmptyString(params.publishKey);

      if (!streamingAlias || !publishKey) {
        set.status = 400;
        return { error: 'Valid streaming alias and publish key are required.' };
      }

      const fallback = findPublicEmergencyFallbackByOpaquePath(db, streamingAlias, publishKey);

      if (!fallback) {
        set.status = 404;
        return { error: 'Streaming not found.' };
      }

      return fallback;
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

      const company = upsertCompany(db, { name: payload.name });
      ensureDefaultAudioPlaylistForCompany(db, company.id);
      return company;
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
      clearCompanyAudioLibraryDirectory(companyId);
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
        ...(payload.companyId !== undefined ? { companyId: payload.companyId } : {}),
        ...(payload.email !== undefined ? { email: payload.email } : {}),
        ...(payload.password !== undefined
          ? { passwordHash: await hashPassword(payload.password) }
          : {}),
        ...(payload.role !== undefined ? { role: payload.role } : {}),
        ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
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