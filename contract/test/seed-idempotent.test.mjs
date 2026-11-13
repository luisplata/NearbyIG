/**
 * Seeds deterministas: doble emisión byte-idéntica y gate anti-drift.
 *
 * El seed es el catálogo emitido en forma canónica más `seed/manifest.json`. Acá
 * se prueba lo único que sin DB se puede probar de verdad:
 *
 *  1. emitir dos veces produce los mismos bytes y el mismo `seedId`;
 *  2. `--check` está verde cuando lo commiteado es exactamente lo emitido;
 *  3. si cambia un byte del catálogo, el archivo queda en `drift`;
 *  4. si cambia `demo/shared/fixtures.json`, el manifest queda en `drift` por
 *     `sources.fixtures.sha256` aunque el catálogo no se haya tocado.
 *
 * La idempotencia de **inserción** no se prueba porque no hay DB: es Sprint 1,
 * por claves naturales. Fingir un INSERT acá sería mentira; el límite está
 * escrito en `contract/README.md`.
 */

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { sha256Hex } from '../../scripts/lib/canonical.mjs';
import { CONTRACT_ROOT, loadSpec } from '../scripts/lib/spec.mjs';
import {
  MANIFEST_PATH,
  SEED_VERSION,
  compareWithDisk,
  computeSeed,
  emitRows,
  encodeCanonical,
  fixturesSha256,
  writeSeed,
} from '../scripts/seed.mjs';

const CONTRACT_ID = loadSpec().spec.info['x-contract-id'];
const FIXTURES_HASH = fixturesSha256();
const DATA_FILES = ['catalog/regions.json', 'catalog/zones.json', 'catalog/profiles.mx.json', 'catalog/profiles.co.json'];
const STATUSES = ['sin cambios', 'drift', 'nuevo'];

/** Seed tal como lo emitiría `npm run contract:seed` en este checkout. */
const seed = (overrides = {}) =>
  computeSeed({ contractId: CONTRACT_ID, fixturesHash: FIXTURES_HASH, ...overrides });

/** Copia el árbol emitido a un directorio temporal, para poder romperlo. */
function tempContract() {
  const dir = mkdtempSync(join(tmpdir(), 'contract-seed-'));
  cpSync(join(CONTRACT_ROOT, 'catalog'), join(dir, 'catalog'), { recursive: true });
  cpSync(join(CONTRACT_ROOT, 'seed'), join(dir, 'seed'), { recursive: true });
  return dir;
}

const statusOf = (report, path) => report.find((row) => row.path === path)?.status;

test('dos emisiones producen los mismos bytes y el mismo seedId', () => {
  const first = seed();
  const second = seed();
  const dirA = mkdtempSync(join(tmpdir(), 'contract-seed-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'contract-seed-b-'));

  try {
    writeSeed(first, dirA);
    writeSeed(second, dirB);

    assert.equal(first.seedId, second.seedId, 'el seedId cambia entre dos corridas con el mismo input');
    assert.deepEqual(first.manifest, second.manifest, 'el manifest no es estable');

    for (const entry of first.entries) {
      assert.deepEqual(
        readFileSync(join(dirA, entry.path)),
        readFileSync(join(dirB, entry.path)),
        `${entry.path}: los bytes difieren entre dos emisiones`,
      );
    }
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('la emisión es canónica: coordenadas a 6 decimales y filas ordenadas', () => {
  assert.equal(
    encodeCanonical({ polygon: [[[-99.1, 19.4], [-99.2, 19.5]]] }),
    '{"polygon":[[[-99.100000,19.400000],[-99.200000,19.500000]]]}',
    'un vértice no puede perder los ceros: el formato de 6 decimales es del archivo',
  );

  const zones = JSON.parse(readFileSync(join(CONTRACT_ROOT, 'catalog/zones.json'), 'utf8'));
  assert.deepEqual(
    zones.map((zone) => `${zone.regionKey}/${zone.zoneKey}`),
    ['co/bogota', 'mx/cdmx'],
    'el orden natural del seed es (regionKey, zoneKey)',
  );

  const regions = JSON.parse(readFileSync(join(CONTRACT_ROOT, 'catalog/regions.json'), 'utf8'));
  assert.deepEqual(regions.map((region) => region.regionKey), ['co', 'mx'], 'regiones por regionKey');
});

test('--check está verde cuando lo commiteado es lo emitido', () => {
  const report = compareWithDisk(seed());

  assert.deepEqual(
    report.map((row) => row.path),
    [...DATA_FILES, MANIFEST_PATH],
    'el seed son los cuatro archivos del catálogo más el manifest',
  );
  for (const row of report) {
    assert.ok(STATUSES.includes(row.status), `${row.path}: estado desconocido "${row.status}"`);
    assert.equal(row.status, 'sin cambios', `${row.path}: drift — corré \`npm run contract:seed\``);
  }
});

test('un byte distinto en un archivo del catálogo deja el seed en drift', () => {
  const dir = tempContract();

  try {
    const file = join(dir, 'catalog/profiles.mx.json');
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    rows[0].distanceM = 2400;
    writeFileSync(file, emitRows(rows));

    const report = compareWithDisk(seed(), dir);
    assert.equal(
      statusOf(report, 'catalog/profiles.mx.json'),
      'drift',
      'editar el catálogo a mano tiene que romper el gate',
    );
    assert.equal(statusOf(report, 'catalog/profiles.co.json'), 'sin cambios', 'el archivo intacto no se marca');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si fixtures.json cambia, el manifest queda en drift por sources.fixtures.sha256', () => {
  const report = compareWithDisk(seed({ fixturesHash: 'f'.repeat(64) }));

  assert.equal(
    statusOf(report, MANIFEST_PATH),
    'drift',
    'sources.fixtures.sha256 tiene que atar el seed al dataset',
  );
  for (const path of DATA_FILES) {
    assert.equal(statusOf(report, path), 'sin cambios', `${path}: el catálogo no cambia si sólo cambia fixtures`);
  }
});

test('el manifest declara versión, contrato, filas y hashes de lo emitido', () => {
  const manifest = JSON.parse(readFileSync(join(CONTRACT_ROOT, MANIFEST_PATH), 'utf8'));

  assert.deepEqual(
    Object.keys(manifest).sort(),
    ['contractId', 'files', 'seedId', 'seedVersion', 'sources'],
    'el manifest tiene exactamente los cinco campos del diseño',
  );
  assert.equal(manifest.seedVersion, SEED_VERSION, 'seedVersion');
  assert.equal(manifest.contractId, CONTRACT_ID, 'contractId tiene que ser el x-contract-id del spec');
  assert.match(manifest.seedId, /^seed-[0-9a-f]{12}$/, 'seedId es `seed-` + 12 hex');

  assert.deepEqual(manifest.files.map((file) => file.path), DATA_FILES, 'orden y contenido de files[]');
  assert.deepEqual(manifest.files.map((file) => file.rows), [2, 2, 10, 10], 'rows por archivo');

  for (const file of manifest.files) {
    const text = readFileSync(join(CONTRACT_ROOT, file.path), 'utf8');
    assert.equal(file.sha256, sha256Hex(text), `${file.path}: el sha del manifest no es el del archivo`);
  }

  assert.deepEqual(Object.keys(manifest.sources), ['fixtures'], 'sources declara sólo fixtures');
  assert.deepEqual(Object.keys(manifest.sources.fixtures), ['sha256'], 'sources.fixtures es un hash, no una ruta');
  assert.equal(manifest.sources.fixtures.sha256, FIXTURES_HASH, 'el hash de fixtures es el del dataset actual');
});

test('contract:check corre el seed antes del test', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.scripts['contract:seed'], 'node contract/scripts/seed.mjs');
  assert.equal(pkg.scripts['contract:seed:check'], 'node contract/scripts/seed.mjs --check');
  assert.equal(pkg.scripts['contract:seed:dry-run'], 'node contract/scripts/seed.mjs --dry-run');

  const gate = pkg.scripts['contract:check'];
  const [seedAt, testAt] = [gate.indexOf('contract:seed:check'), gate.indexOf('contract:test')];
  assert.ok(seedAt !== -1, 'contract:check tiene que sumar contract:seed:check (design D5)');
  assert.ok(seedAt < testAt, 'el seed se verifica antes de correr los tests');
});
