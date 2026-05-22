import type { Database } from 'bun:sqlite';

import { upsertCompany } from '../services/companies';
import { findStreamingById, upsertStreaming } from '../services/streamings';
import { getSeedStreamings, loadSeedData } from './seed-data';
import { findCompanyById } from '../services/companies';

export function seedStaticData(db: Database): void {
  const seedData = loadSeedData();

  for (const company of seedData.companies) {
    if (!findCompanyById(db, company.id)) {
      upsertCompany(db, {
        id: company.id,
        name: company.name,
      });
    }
  }

  for (const streaming of getSeedStreamings(seedData)) {
    if (!findStreamingById(db, streaming.id)) {
      const company = findCompanyById(db, streaming.companyId);

      upsertStreaming(db, {
        id: streaming.id,
        companyId: streaming.companyId,
        ...(company ? { companyName: company.name } : {}),
        type: streaming.type,
        name: streaming.name,
      });
    }
  }
}