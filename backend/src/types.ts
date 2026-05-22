export type UserRole = 'super_admin' | 'user';
export type StreamingType = 'audio' | 'video';

export interface AppEnv {
  appName: string;
  host: string;
  port: number;
  corsOrigin: string;
  databasePath: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtTtlSeconds: number;
  superAdminEmail: string;
  superAdminPassword: string;
  superAdminName: string;
}

export interface PublicCompany {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStreaming {
  id: string;
  companyId: string;
  ingestKey: string;
  type: StreamingType;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface CompanyEmergencyFallback {
  autoplayEnabled: boolean;
  selectedImageId: string | null;
  images: EmergencyImage[];
}

export interface PublicEmergencyFallback {
  autoplayEnabled: boolean;
  selectedImage: EmergencyImage | null;
}

export interface PublicUser {
  id: string;
  email: string;
  companyId: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface StoredUser extends PublicUser {
  passwordHash: string;
}

export interface AdminUser extends PublicUser {
  company: PublicCompany;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionPermissions {
  canManageCompanies: boolean;
  canManageUsers: boolean;
  canManageStreamings: boolean;
}

export interface CurrentSession {
  user: PublicUser;
  company: PublicCompany;
  streamings: PublicStreaming[];
  permissions: SessionPermissions;
}

export interface AuthSession extends CurrentSession {
  token: string;
  expiresAt: number;
}

export interface AdminOverview {
  companies: PublicCompany[];
  users: AdminUser[];
  streamings: PublicStreaming[];
}

export interface AuthClaims {
  sub: string;
  email: string;
  companyId: string;
  role: UserRole;
  displayName: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}