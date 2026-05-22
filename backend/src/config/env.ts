import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppEnv } from '../types';

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function parseNumber(name: string, value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid number for ${name}`);
  }

  return parsedValue;
}

function readWorkspaceEnvFile(): Record<string, string> {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = resolve(configDirectory, '..', '..', '..');
  const envFilePath = resolve(workspaceRoot, '.env.main');

  if (!existsSync(envFilePath)) {
    return {};
  }

  return parseEnvFile(readFileSync(envFilePath, 'utf8'));
}

export function loadAppEnv(): AppEnv {
  const fileValues = readWorkspaceEnvFile();
  const runtimeValues = process.env as Record<string, string | undefined>;
  const values = { ...fileValues, ...runtimeValues };

  return {
    appName: values.APP_NAME ?? 'StreamHub',
    host: values.API_HOST ?? '0.0.0.0',
    port: parseNumber('API_PORT', values.API_PORT, 3001),
    corsOrigin: values.CORS_ORIGIN ?? 'http://localhost:5173',
    databasePath: values.DATABASE_PATH ?? './database/data/streamhub.sqlite3',
    jwtSecret: values.JWT_SECRET ?? 'dev-only-secret-change-me',
    jwtIssuer: values.JWT_ISSUER ?? 'streamhub-backend',
    jwtAudience: values.JWT_AUDIENCE ?? 'streamhub-frontend',
    jwtTtlSeconds: parseNumber('JWT_TTL_SECONDS', values.JWT_TTL_SECONDS, 86_400),
    superAdminEmail: values.SUPER_ADMIN_EMAIL ?? 'danielulloa256@gmail.com',
    superAdminPassword: values.SUPER_ADMIN_PASSWORD ?? 'admin123',
    superAdminName: values.SUPER_ADMIN_NAME ?? 'Daniel Ulloa',
  };
}