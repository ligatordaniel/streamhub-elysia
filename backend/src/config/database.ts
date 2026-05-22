import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppEnv } from '../types';

function getWorkspaceRoot(): string {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(configDirectory, '..', '..', '..');
}

export function resolveDatabasePath(databasePath: string): string {
  return resolve(getWorkspaceRoot(), databasePath);
}

export function createDatabase(env: AppEnv): Database {
  const databaseFilePath = resolveDatabasePath(env.databasePath);
  const databaseDirectory = dirname(databaseFilePath);
  const schemaPath = resolve(getWorkspaceRoot(), 'database', 'schema.sql');

  mkdirSync(databaseDirectory, { recursive: true });

  const database = new Database(databaseFilePath);
  const schemaSql = readFileSync(schemaPath, 'utf8');

  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(schemaSql);

  return database;
}