import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { before, describe, test } from 'node:test';
import { runScript, withDb } from '../helpers.mjs';

/**
 * Migraciones y seeds: el criterio de aceptación es "correrlo dos veces no
 * rompe ni duplica". Se verifica sobre la base real del compose.
 *
 * El rollback completo (`--rollback` borra el esquema) no se corre acá porque
 * esta suite comparte la base con los demás archivos; el comando exacto está en
 * `README.md` y se valida en la aceptación manual del batch.
 */
describe('migraciones y seeds', () => {
  before(async () => {
    await withDb((client) => client.query('SELECT 1'));
  });

  test('toda migración tiene su archivo .down.sql', async () => {
    const entries = await readdir('sql');
    const ups = entries.filter((name) => name.endsWith('.sql') && !name.endsWith('.down.sql'));
    assert.ok(ups.length > 0);
    for (const up of ups) {
      const down = `${up.slice(0, -'.sql'.length)}.down.sql`;
      assert.ok(entries.includes(down), `falta ${down} para ${up}`);
    }
  });

  test('correr las migraciones dos veces es no-op', async () => {
    const first = await runScript('scripts/migrate.mjs');
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /nada que hacer|aplicada\(s\)/);

    const second = await runScript('scripts/migrate.mjs');
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /nada que hacer/);

    const { rows } = await withDb((client) =>
      client.query('SELECT count(*)::integer AS count FROM schema_migrations'),
    );
    assert.equal(rows[0].count, 1);
  });

  test('correr los seeds dos veces no duplica filas', async () => {
    const first = await runScript('scripts/seed.mjs');
    assert.equal(first.code, 0, first.stderr);

    const countsAfterFirst = await withDb(async (client) => {
      const { rows } = await client.query(`
        SELECT (SELECT count(*)::integer FROM regions) AS regions,
               (SELECT count(*)::integer FROM zones) AS zones,
               (SELECT count(*)::integer FROM profiles) AS profiles
      `);
      return rows[0];
    });
    assert.deepEqual(countsAfterFirst, { regions: 2, zones: 2, profiles: 20 });

    const second = await runScript('scripts/seed.mjs');
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /regiones 2→2/);
    assert.match(second.stdout, /zonas 2→2/);
    assert.match(second.stdout, /perfiles 20→20/);

    const countsAfterSecond = await withDb(async (client) => {
      const { rows } = await client.query(`
        SELECT (SELECT count(*)::integer FROM regions) AS regions,
               (SELECT count(*)::integer FROM zones) AS zones,
               (SELECT count(*)::integer FROM profiles) AS profiles
      `);
      return rows[0];
    });
    assert.deepEqual(countsAfterSecond, countsAfterFirst);
  });

  test('seed --check confirma que la base coincide con el manifiesto', async () => {
    const result = await runScript('scripts/seed.mjs', ['--check']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /coincide con el manifiesto/);
  });

  test('seed --dry-run valida el manifiesto sin escribir', async () => {
    const result = await runScript('scripts/seed.mjs', ['--dry-run']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /no se tocó la base/);
  });

  test('los polígonos quedan en SRID 4326, válidos y cerrados', async () => {
    const { rows } = await withDb((client) =>
      client.query(`
        SELECT region_key, zone_key, ST_SRID(polygon) AS srid, ST_IsValid(polygon) AS valid,
               ST_IsClosed(ST_ExteriorRing(polygon)) AS closed
          FROM zones
         ORDER BY region_key
      `),
    );
    assert.equal(rows.length, 2);
    for (const zone of rows) {
      assert.equal(zone.srid, 4326, zone.zone_key);
      assert.equal(zone.valid, true, zone.zone_key);
      assert.equal(zone.closed, true, zone.zone_key);
    }
  });

  test('ST_Covers ubica cada ciudad en su zona y no en la otra', async () => {
    const { rows } = await withDb((client) =>
      client.query(`
        SELECT
          (SELECT ST_Covers(polygon, ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326))
             FROM zones WHERE zone_key = 'cdmx') AS cdmx_covers_cdmx,
          (SELECT ST_Covers(polygon, ST_SetSRID(ST_MakePoint(-74.0721, 4.7110), 4326))
             FROM zones WHERE zone_key = 'bogota') AS bogota_covers_bogota,
          (SELECT ST_Covers(polygon, ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326))
             FROM zones WHERE zone_key = 'bogota') AS bogota_covers_cdmx,
          (SELECT ST_Covers(polygon, ST_SetSRID(ST_MakePoint(-74.0721, 4.7110), 4326))
             FROM zones WHERE zone_key = 'cdmx') AS cdmx_covers_bogota
      `),
    );
    assert.deepEqual(rows[0], {
      cdmx_covers_cdmx: true,
      bogota_covers_bogota: true,
      bogota_covers_cdmx: false,
      cdmx_covers_bogota: false,
    });
  });

  test('la base recuerda qué seed se aplicó', async () => {
    const { rows } = await withDb((client) =>
      client.query("SELECT key, value FROM demo_meta WHERE key IN ('seed_id', 'contract_id') ORDER BY key"),
    );
    const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    assert.equal(meta.contract_id, '7203b8216b58');
    assert.equal(meta.seed_id, 'seed-19573897bae5');
  });
});
