import type { Database } from 'bun:sqlite';

import type {
  CompanyEmergencyFallback,
  EmergencyImage,
  PublicEmergencyFallback,
} from '../types';
import { findStreamingByOpaquePath } from './streamings';

interface EmergencyFallbackSettingsRow {
  autoplayEnabled: number;
  selectedImageId: string | null;
}

interface EmergencyFallbackImageRow {
  id: string;
  name: string;
  dataUrl: string;
}

export const MAX_COMPANY_EMERGENCY_IMAGES = 10;

const selectEmergencyFallbackSettingsByCompanyIdSql = `
  SELECT
    autoplay_enabled AS autoplayEnabled,
    selected_image_id AS selectedImageId
  FROM company_emergency_fallback_settings
  WHERE company_id = ?
  LIMIT 1
`;

const selectEmergencyFallbackImagesByCompanyIdSql = `
  SELECT
    id,
    name,
    data_url AS dataUrl
  FROM company_emergency_fallback_images
  WHERE company_id = ?
  ORDER BY position ASC, created_at ASC
`;

const upsertEmergencyFallbackSettingsSql = `
  INSERT INTO company_emergency_fallback_settings (
    company_id,
    autoplay_enabled,
    selected_image_id,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(company_id) DO UPDATE SET
    autoplay_enabled = excluded.autoplay_enabled,
    selected_image_id = excluded.selected_image_id,
    updated_at = excluded.updated_at
`;

const deleteAllEmergencyFallbackImagesByCompanyIdSql = `
  DELETE FROM company_emergency_fallback_images
  WHERE company_id = ?
`;

const upsertEmergencyFallbackImageSql = `
  INSERT INTO company_emergency_fallback_images (
    company_id,
    id,
    position,
    name,
    data_url,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id, id) DO UPDATE SET
    position = excluded.position,
    name = excluded.name,
    data_url = excluded.data_url,
    updated_at = excluded.updated_at
`;

function nowIso(): string {
  return new Date().toISOString();
}

function getDefaultCompanyEmergencyFallback(): CompanyEmergencyFallback {
  return {
    autoplayEnabled: false,
    selectedImageId: null,
    images: [],
  };
}

function sanitizeEmergencyFallback(input: CompanyEmergencyFallback): CompanyEmergencyFallback {
  const images: EmergencyImage[] = [];
  const seenIds = new Set<string>();

  for (const image of input.images) {
    const id = image.id.trim();
    const name = image.name.trim();
    const dataUrl = image.dataUrl.trim();

    if (!id || !name || !dataUrl || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    images.push({ id, name, dataUrl });

    if (images.length >= MAX_COMPANY_EMERGENCY_IMAGES) {
      break;
    }
  }

  const selectedImageId =
    typeof input.selectedImageId === 'string' && images.some((image) => image.id === input.selectedImageId)
      ? input.selectedImageId
      : images[0]?.id ?? null;

  return {
    autoplayEnabled: input.autoplayEnabled,
    selectedImageId,
    images,
  };
}

function buildDeleteMissingEmergencyFallbackImagesSql(imageCount: number): string {
  const placeholders = Array.from({ length: imageCount }, () => '?').join(', ');

  return `
    DELETE FROM company_emergency_fallback_images
    WHERE company_id = ?
      AND id NOT IN (${placeholders})
  `;
}

export function findCompanyEmergencyFallback(db: Database, companyId: string): CompanyEmergencyFallback {
  const settingsRow = db
    .query(selectEmergencyFallbackSettingsByCompanyIdSql)
    .get(companyId) as EmergencyFallbackSettingsRow | null;
  const imageRows = db
    .query(selectEmergencyFallbackImagesByCompanyIdSql)
    .all(companyId) as EmergencyFallbackImageRow[];

  if (!settingsRow && imageRows.length === 0) {
    return getDefaultCompanyEmergencyFallback();
  }

  return sanitizeEmergencyFallback({
    autoplayEnabled: settingsRow?.autoplayEnabled === 1,
    selectedImageId: settingsRow?.selectedImageId ?? null,
    images: imageRows.map((row) => ({
      id: row.id,
      name: row.name,
      dataUrl: row.dataUrl,
    })),
  });
}

export function saveCompanyEmergencyFallback(
  db: Database,
  companyId: string,
  input: CompanyEmergencyFallback
): CompanyEmergencyFallback {
  const payload = sanitizeEmergencyFallback(input);
  const timestamp = nowIso();

  db.exec('BEGIN');

  try {
    db.query(upsertEmergencyFallbackSettingsSql).run(
      companyId,
      payload.autoplayEnabled ? 1 : 0,
      payload.selectedImageId,
      timestamp,
      timestamp
    );

    if (payload.images.length === 0) {
      db.query(deleteAllEmergencyFallbackImagesByCompanyIdSql).run(companyId);
    } else {
      db.query(buildDeleteMissingEmergencyFallbackImagesSql(payload.images.length)).run(
        companyId,
        ...payload.images.map((image) => image.id)
      );

      const upsertEmergencyFallbackImage = db.query(upsertEmergencyFallbackImageSql);

      payload.images.forEach((image, index) => {
        upsertEmergencyFallbackImage.run(
          companyId,
          image.id,
          index,
          image.name,
          image.dataUrl,
          timestamp,
          timestamp
        );
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return findCompanyEmergencyFallback(db, companyId);
}

export function findPublicEmergencyFallbackByOpaquePath(
  db: Database,
  streamingAlias: string,
  publishKey: string
): PublicEmergencyFallback | null {
  const streaming = findStreamingByOpaquePath(db, streamingAlias, publishKey);

  if (!streaming) {
    return null;
  }

  const companyEmergencyFallback = findCompanyEmergencyFallback(db, streaming.companyId);
  const selectedImage =
    companyEmergencyFallback.selectedImageId === null
      ? null
      : companyEmergencyFallback.images.find(
        (image) => image.id === companyEmergencyFallback.selectedImageId
      ) ?? null;

  return {
    autoplayEnabled: companyEmergencyFallback.autoplayEnabled,
    selectedImage: companyEmergencyFallback.autoplayEnabled ? selectedImage : null,
  };
}