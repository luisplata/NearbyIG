#!/usr/bin/env node
/**
 * Seeds de referencia de NearbyIG, derivados del contrato congelado.
 *
 *   node scripts/seed.mjs            aplica (upsert) y reporta conteos
 *   node scripts/seed.mjs --check    no escribe: verifica manifiesto + base
 *   node scripts/seed.mjs --dry-run  valida el manifiesto y no conecta a la base
 *
 * Fuente única: `contract/catalog/*.json` y `contract/seed/manifest.json`. El
 * script no inventa filas ni completa huecos: si el manifiesto no cuadra con los
 * archivos, sale con error.
 *
 * Idempotencia: todo es `INSERT ... ON CONFLICT DO UPDATE` sobre la clave
 * natural (`region_key`, `(region_key, zone_key)`, `(region_key, profile_id)`).
 * Correrlo dos veces deja exactamente las mismas filas; nada se borra, así que
 * no puede tirar una sesión viva por accidente.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const dryRun = args.has('--dry-run');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function resolveSeedRoot() {
  const explicit = process.env.SEED_DIR ?? process.env.CONTRACT_DIR;
  const candidates = explicit
    ? [resolve(explicit)]
    : [resolve(HERE, '..', '..', 'contract'), '/seed'];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'seed', 'manifest.json'))) return candidate;
  }
  throw new Error(
    `seed: no encuentro seed/manifest.json. Probé: ${candidates.join(', ')}. ` +
      'Definí SEED_DIR apuntando a la raíz del contrato.',
  );
}

async function readJson(path) {
  const text = await readFile(path, 'utf8');
  return { text, value: JSON.parse(text) };
}

async function loadSeed() {
  const root = resolveSeedRoot();
  const manifestPath = join(root, 'seed', 'manifest.json');
  const { value: manifest } = await readJson(manifestPath);

  const files = new Map();
  for (const entry of manifest.files ?? []) {
    const abs = join(root, entry.path);
    const { text, value } = await readJson(abs);
    const rows = Array.isArray(value) ? value.length : 1;
    if (rows !== entry.rows) {
      throw new Error(`seed: ${entry.path} tiene ${rows} filas y el manifiesto dice ${entry.rows}`);
    }
    const digest = sha256(text);
    if (digest !== entry.sha256) {
      throw new Error(
        `seed: ${entry.path} no coincide con el manifiesto (sha256 ${digest} ≠ ${entry.sha256})`,
      );
    }
    files.set(entry.path, value);
  }

  const required = ['catalog/regions.json', 'catalog/zones.json'];
  for (const path of required) {
    if (!files.has(path)) throw new Error(`seed: el manifiesto no lista ${path}`);
  }

  const regions = files.get('catalog/regions.json');
  const zones = files.get('catalog/zones.json');
  const profiles = [];
  for (const region of regions) {
    const path = `catalog/profiles.${region.regionKey}.json`;
    if (!files.has(path)) throw new Error(`seed: falta ${path} para la región ${region.regionKey}`);
    for (const row of files.get(path)) profiles.push(row);
  }

  return { root, manifest, regions, zones, profiles };
}

function polygonToGeoJson(zone) {
  const rings = zone.polygon;
  if (!Array.isArray(rings) || rings.length === 0) {
    throw new Error(`seed: la zona ${zone.zoneKey} no tiene polígono`);
  }
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new Error(`seed: la zona ${zone.zoneKey} tiene un anillo con menos de 4 puntos`);
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      throw new Error(`seed: el anillo de ${zone.zoneKey} no cierra`);
    }
    for (const point of ring) {
      const [lng, lat] = point ?? [];
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        throw new Error(`seed: la zona ${zone.zoneKey} tiene un punto no numérico`);
      }
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new Error(`seed: la zona ${zone.zoneKey} tiene coordenadas fuera de rango`);
      }
    }
  }
  // GeoJSON es [lng, lat] por especificación: es lo mismo que guarda el catálogo.
  return JSON.stringify({ type: 'Polygon', coordinates: rings });
}

const PROFILE_COLUMNS = [
  ['profile_id', 'profileId'],
  ['demo_slot', 'demoSlot'],
  ['source_type', 'sourceType'],
  ['nickname', 'nickname'],
  ['initials', 'initials'],
  ['intention', 'intention'],
  ['gender', 'gender'],
  ['verified', 'verified'],
  ['online', 'online'],
  ['distance_m', 'distanceM'],
  ['bearing_deg', 'bearingDeg'],
  ['photo_id', 'photoId'],
  ['instagram_handle', 'instagramHandle'],
  ['status_key', 'statusKey'],
  ['bio_key', 'bioKey'],
];

async function applySeed(client, seed) {
  await client.query('BEGIN');
  try {
    for (const region of seed.regions) {
      await client.query(
        `INSERT INTO regions (region_key, name_key, default_zone_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (region_key) DO UPDATE
           SET name_key = EXCLUDED.name_key,
               default_zone_key = EXCLUDED.default_zone_key,
               updated_at = now()`,
        [region.regionKey, region.nameKey, region.defaultZoneKey],
      );
    }

    for (const zone of seed.zones) {
      await client.query(
        `INSERT INTO zones (region_key, zone_key, name_key, polygon)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
         ON CONFLICT (region_key, zone_key) DO UPDATE
           SET name_key = EXCLUDED.name_key,
               polygon = EXCLUDED.polygon,
               updated_at = now()`,
        [zone.regionKey, zone.zoneKey, zone.nameKey, polygonToGeoJson(zone)],
      );
    }

    const columns = PROFILE_COLUMNS.map(([column]) => column);
    const placeholders = PROFILE_COLUMNS.map((_, index) => `$${index + 2}`);
    const updates = columns
      .slice(1)
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ');
    for (const profile of seed.profiles) {
      const values = PROFILE_COLUMNS.map(([, key]) => profile[key] ?? null);
      await client.query(
        `INSERT INTO profiles (region_key, ${columns.join(', ')})
         VALUES ($1, ${placeholders.join(', ')})
         ON CONFLICT (region_key, profile_id) DO UPDATE
           SET ${updates}, updated_at = now()`,
        [profile.regionKey, ...values],
      );
    }

    const meta = [
      ['seed_id', seed.manifest.seedId],
      ['contract_id', seed.manifest.contractId],
      ['seed_version', String(seed.manifest.seedVersion)],
      ['seed_applied_at', new Date().toISOString()],
    ];
    for (const [key, value] of meta) {
      await client.query(
        `INSERT INTO demo_meta (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function counts(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM regions)  AS regions,
      (SELECT count(*)::integer FROM zones)    AS zones,
      (SELECT count(*)::integer FROM profiles) AS profiles,
      (SELECT count(*)::integer FROM sessions) AS sessions
  `);
  return rows[0];
}

async function checkAgainstDb(client, seed) {
  const problems = [];
  const before = await counts(client);
  const expected = {
    regions: seed.regions.length,
    zones: seed.zones.length,
    profiles: seed.profiles.length,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (before[key] !== value) problems.push(`${key}: base ${before[key]} ≠ seed ${value}`);
  }

  const meta = await client.query("SELECT key, value FROM demo_meta WHERE key IN ('seed_id', 'contract_id')");
  const stored = Object.fromEntries(meta.rows.map((row) => [row.key, row.value]));
  if (stored.seed_id !== seed.manifest.seedId) {
    problems.push(`seed_id: base ${stored.seed_id ?? '(sin fila)'} ≠ manifiesto ${seed.manifest.seedId}`);
  }
  if (stored.contract_id !== seed.manifest.contractId) {
    problems.push(`contract_id: base ${stored.contract_id ?? '(sin fila)'} ≠ manifiesto ${seed.manifest.contractId}`);
  }

  const dbProfiles = await client.query(
    `SELECT region_key, profile_id, demo_slot, source_type, nickname, initials, intention, gender,
            verified, online, distance_m, bearing_deg, photo_id, instagram_handle, status_key, bio_key
       FROM profiles`,
  );
  const key = (row) => `${row.region_key}/${row.profile_id}`;
  const byKey = new Map(dbProfiles.rows.map((row) => [key(row), row]));
  for (const profile of seed.profiles) {
    const row = byKey.get(`${profile.regionKey}/${profile.profileId}`);
    if (!row) {
      problems.push(`perfil faltante: ${profile.regionKey}/${profile.profileId}`);
      continue;
    }
    for (const [column, field] of PROFILE_COLUMNS) {
      const expectedValue = profile[field] ?? null;
      const actualValue = row[column] ?? null;
      if (String(actualValue) !== String(expectedValue)) {
        problems.push(
          `perfil ${profile.regionKey}/${profile.profileId} campo ${column}: base ${actualValue} ≠ seed ${expectedValue}`,
        );
      }
    }
  }

  const dbZones = await client.query(
    `SELECT region_key, zone_key, name_key, ST_SRID(polygon) AS srid, ST_IsValid(polygon) AS valid FROM zones`,
  );
  const zonesByKey = new Map(dbZones.rows.map((row) => [`${row.region_key}/${row.zone_key}`, row]));
  for (const zone of seed.zones) {
    const row = zonesByKey.get(`${zone.regionKey}/${zone.zoneKey}`);
    if (!row) {
      problems.push(`zona faltante: ${zone.regionKey}/${zone.zoneKey}`);
      continue;
    }
    if (row.srid !== 4326) problems.push(`zona ${zone.zoneKey}: SRID ${row.srid} ≠ 4326`);
    if (!row.valid) problems.push(`zona ${zone.zoneKey}: polígono inválido`);
    if (row.name_key !== zone.nameKey) problems.push(`zona ${zone.zoneKey}: name_key distinto`);
  }

  return { problems, counts: before };
}

async function main() {
  const seed = await loadSeed();
  console.log(
    `seed: ${seed.root} · ${seed.manifest.seedId} · contract ${seed.manifest.contractId} · ` +
      `${seed.regions.length} regiones, ${seed.zones.length} zonas, ${seed.profiles.length} perfiles`,
  );

  if (dryRun) {
    console.log('seed (dry-run): manifiesto y archivos OK, no se tocó la base');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('seed: falta DATABASE_URL');
    process.exitCode = 2;
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    if (checkOnly) {
      const { problems, counts: dbCounts } = await checkAgainstDb(client, seed);
      console.log(
        `seed --check: base con ${dbCounts.regions} regiones, ${dbCounts.zones} zonas, ` +
          `${dbCounts.profiles} perfiles, ${dbCounts.sessions} sesiones`,
      );
      if (problems.length > 0) {
        for (const problem of problems) console.error(`  ✗ ${problem}`);
        process.exitCode = 1;
        return;
      }
      console.log('seed --check: OK — la base coincide con el manifiesto');
      return;
    }

    const before = await counts(client);
    await applySeed(client, seed);
    const after = await counts(client);
    console.log(
      `seed: aplicado — regiones ${before.regions}→${after.regions}, ` +
        `zonas ${before.zones}→${after.zones}, perfiles ${before.profiles}→${after.profiles}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
