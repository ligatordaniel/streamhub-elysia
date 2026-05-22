export type UserRole = 'super_admin' | 'user';
export type StreamingType = 'audio' | 'video';

export interface PublicCompany {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStreaming {
  id: string;
  companyId: string;
  type: StreamingType;
  name: string;
  createdAt: string;
  updatedAt: string;
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

export interface AuthSession {
  token: string;
  expiresAt: number;
  user: PublicUser;
  company: PublicCompany;
  streamings: PublicStreaming[];
  permissions: SessionPermissions;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AdminUser extends PublicUser {
  company: PublicCompany;
}

export interface AdminOverview {
  companies: PublicCompany[];
  users: AdminUser[];
  streamings: PublicStreaming[];
}