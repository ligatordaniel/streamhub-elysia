import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StreamingType } from '../types';

interface SeedCompany {
  id: string;
  name: string;
}

interface SeedStreaming {
  id: string;
  companyId: string;
  type: StreamingType;
  name: string;
}

interface SeedData {
  companies: SeedCompany[];
  streamings: SeedStreaming[];
}

function parseSeedData(contents: string): SeedData {
  const parsed = JSON.parse(contents) as Partial<SeedData>;

  if (!parsed || !Array.isArray(parsed.companies) || !Array.isArray(parsed.streamings)) {
    throw new Error('Invalid seed data file');
  }

  return {
    companies: parsed.companies as SeedCompany[],
    streamings: parsed.streamings as SeedStreaming[],
  };
}

function getWorkspaceRoot(): string {
  const configDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(configDirectory, '..', '..', '..');
}

export function loadSeedData(): SeedData {
  const seedPath = resolve(getWorkspaceRoot(), 'database', 'seed.json');

  if (!existsSync(seedPath)) {
    throw new Error('Missing database/seed.json');
  }

  return parseSeedData(readFileSync(seedPath, 'utf8'));
}

export function getScriptdogCompanyId(seedData: SeedData = loadSeedData()): string {
  const company = seedData.companies.find((item) => item.name === 'scriptdog_limitada');

  if (!company) {
    throw new Error('Missing seed company scriptdog_limitada');
  }

  return company.id;
}

export function getSeedStreamings(seedData: SeedData = loadSeedData()): SeedStreaming[] {
  return seedData.streamings;
}

export type { SeedData, SeedCompany, SeedStreaming };