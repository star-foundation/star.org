import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.mjs';
import { readJson, tryReadJson, writeJsonAtomic } from './fsx.mjs';

export function listRegistrations(dir = PATHS.registrations) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => ({ file: name, record: tryReadJson(path.join(dir, name)) }))
    .filter((entry) => entry.record && entry.record.slug);
}

export function registrationPath(slug, dir = PATHS.registrations) {
  return path.join(dir, `${slug}.json`);
}

export function findRegistration(slug, dir = PATHS.registrations) {
  return tryReadJson(registrationPath(slug, dir));
}

export function sortedRegistrations(dir = PATHS.registrations) {
  return listRegistrations(dir)
    .map((entry) => entry.record)
    .sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at)));
}

/** 生成公开登记表索引（供 /registry/ 页面与外部程序读取） */
export function buildRegistryIndex({ dir = PATHS.registrations, outFile = PATHS.registryIndex } = {}) {
  const records = sortedRegistrations(dir);
  const byStar = {};
  for (const record of records) {
    (byStar[record.star_id] ||= []).push(record.slug);
  }
  const index = {
    generated_at: new Date().toISOString(),
    count: records.length,
    unique_stars: Object.keys(byStar).length,
    duplicates: Object.entries(byStar)
      .filter(([, slugs]) => slugs.length > 1)
      .map(([starId, slugs]) => ({ star_id: starId, slugs })),
    entries: records.map((record) => ({
      slug: record.slug,
      star_id: record.star_id,
      star_name: record.star?.proper_name ?? null,
      constellation: record.star?.constellation ?? null,
      magnitude: record.star?.magnitude ?? null,
      owner_display_name: record.owner_display_name ?? null,
      anonymous: Boolean(record.anonymous),
      registered_at: record.registered_at,
      dedication_message: record.dedication_message ?? null,
    })),
  };
  if (outFile) writeJsonAtomic(outFile, index);
  return index;
}

export function registryCount(dir = PATHS.registrations) {
  return listRegistrations(dir).length;
}

export function readRegistryIndex(file = PATHS.registryIndex) {
  return readJson(file);
}
