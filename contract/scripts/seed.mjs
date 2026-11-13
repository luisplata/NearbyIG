#!/usr/bin/env node
/**
 * Emisor canónico de seeds del catálogo demo.
 *
 * El seed **es** el catálogo: `catalog/regions.json`, `catalog/zones.json` y los
 * dos `catalog/profiles.*.json` se emiten en una forma única (claves ordenadas,
 * LF, una fila por línea, vértices a 6 decimales) y `seed/manifest.json` fija
 * qué se emitió. La emisión es una función pura del catálogo + el id del
 * contrato + el hash de `demo/shared/fixtures.json`: dos corridas producen bytes
 * idénticos, y `--check` falla en cuanto alguien edita a mano.
 *
 * El límite, escrito también en `contract/README.md`: esto prueba idempotencia
 * de **emisión**. La de **inserción** es Sprint 1 (claves naturales
 * `region_key + zone_key` y `region_key + demo_slot`, `ON CONFLICT DO NOTHING`).
 * Sin DB no hay nada más que probar, y fingir un INSERT acá sería mentira.
 *
 * Modos:
 *   (sin flags)      emite y escribe                          → exit 0
 *   --check          compara lo emitido con lo commiteado      → exit 1 si hay drift
 *   --dry-run        imprime la tabla sin escribir nada        → exit 0
 *   --out <dir>      escribe el árbol en otro directorio (tests)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize, sha256Hex } from '../../scripts/lib/canonical.mjs';
import { CONTRACT_ROOT, loadSpec } from './lib/spec.mjs';

/** Versión del formato de seed. Sube cuando cambia la forma, no cuando cambian los datos. */
export const SEED_VERSION = 1;

export const REPO_ROOT = resolve(CONTRACT_ROOT, '..');
export const FIXTURES_PATH = 'demo/shared/fixtures.json';
export const MANIFEST_PATH = 'seed/manifest.json';

/**
 * Fuentes del seed, en el orden en que viajan al manifest. El orden natural de
 * cada archivo es el que dice la spec: zonas por `(regionKey, zoneKey)` y
 * perfiles por `(regionKey, demoSlot)`. Ordenar acá y no confiar en el archivo
 * es lo que hace que reordenar a mano no cambie el seed.
 */
const SOURCES = [
  { path: 'catalog/regions.json', sort: (row) => [row.regionKey] },
  { path: 'catalog/zones.json', sort: (row) => [row.regionKey, row.zoneKey] },
  { path: 'catalog/profiles.mx.json', sort: (row) => [row.regionKey, row.demoSlot] },
  { path: 'catalog/profiles.co.json', sort: (row) => [row.regionKey, row.demoSlot] },
];

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Fuentes donde un número es una coordenada: se escriben con exactamente 6
 * decimales. No es cosmético — `zones-geometry.test.mjs` exige ese formato en el
 * archivo, y `JSON.stringify(-99.1915)` perdería los ceros.
 */
const COORDINATE_KEY = 'polygon';
const DECIMALS = 6;

/** JSON canónico: claves ordenadas, sin espacios, LF y coordenadas a 6 decimales. */
export function encodeCanonical(value, keys = []) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`número no finito en ${keys.join('.') || '<root>'}`);
    }
    if (keys.includes(COORDINATE_KEY)) return value.toFixed(DECIMALS);
    return String(Object.is(value, -0) ? 0 : value);
  }
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => encodeCanonical(item, keys)).join(',')}]`;
  }
  if (type === 'object') {
    const sorted = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compare);
    return `{${sorted.map((key) => `${JSON.stringify(key)}:${encodeCanonical(value[key], [...keys, key])}`).join(',')}}`;
  }
  throw new Error(`valor no serializable (${type}) en ${keys.join('.') || '<root>'}`);
}

/** Tabla JSON: `[` + una fila por línea + `]`, con LF final. */
export function emitRows(rows) {
  return `[\n${rows.map((row) => encodeCanonical(row)).join(',\n')}\n]\n`;
}

/** Ordena por la clave natural declarada en `SOURCES`. */
function sortRows(rows, sort) {
  return [...rows].sort((left, right) => {
    for (const [index, value] of sort(left).entries()) {
      const diff = compare(value, sort(right)[index]);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

/** Hash del dataset con LF: un checkout Windows no puede cambiar el gate. */
export function fixturesSha256(repoRoot = REPO_ROOT) {
  const text = readFileSync(join(repoRoot, FIXTURES_PATH), 'utf8').replace(/\r\n/g, '\n');
  return sha256Hex(text);
}

/**
 * Calcula el seed completo sin tocar disco (salvo leer el catálogo de `root`).
 * Devuelve el manifest ya armado, su texto y las entradas a escribir/comparar.
 */
export function computeSeed({ contractId, fixturesHash, root = CONTRACT_ROOT } = {}) {
  if (typeof contractId !== 'string' || contractId === '') {
    throw new Error('computeSeed necesita el contractId del contrato');
  }
  if (typeof fixturesHash !== 'string' || !/^[0-9a-f]{64}$/.test(fixturesHash)) {
    throw new Error('computeSeed necesita el sha256 de fixtures.json');
  }

  const files = SOURCES.map(({ path, sort }) => {
    const rows = sortRows(JSON.parse(readFileSync(join(root, path), 'utf8')), sort);
    const text = emitRows(rows);
    return { path, rows: rows.length, sha256: sha256Hex(text), text };
  });

  const basis = {
    contractId,
    files: files.map(({ path, rows, sha256 }) => ({ path, rows, sha256 })),
    seedVersion: SEED_VERSION,
    sources: { fixtures: { sha256: fixturesHash } },
  };
  // `seedId` no entra en su propia base: es el hash de lo emitido, no del archivo.
  const seedId = `seed-${sha256Hex(canonicalize(basis)).slice(0, 12)}`;

  const manifest = {
    contractId: basis.contractId,
    files: basis.files,
    seedId,
    seedVersion: basis.seedVersion,
    sources: basis.sources,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const entries = [
    ...files,
    { path: MANIFEST_PATH, rows: null, sha256: sha256Hex(manifestText), text: manifestText },
  ];

  return { files, manifest, manifestText, seedId, entries };
}

/** Escribe el árbol emitido bajo `root` (por default, `contract/`). */
export function writeSeed(seed, root = CONTRACT_ROOT) {
  for (const entry of seed.entries) {
    const file = join(root, entry.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, entry.text, 'utf8');
  }
  return seed.entries.map((entry) => entry.path);
}

/**
 * Compara lo emitido con lo que hay en disco. El status es el de la tabla:
 * `sin cambios`, `drift` (existe y difiere) o `nuevo` (no existe).
 */
export function compareWithDisk(seed, root = CONTRACT_ROOT) {
  return seed.entries.map((entry) => {
    const file = join(root, entry.path);
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    const status = current === null ? 'nuevo' : current === entry.text ? 'sin cambios' : 'drift';
    return { path: entry.path, rows: entry.rows, sha256: entry.sha256.slice(0, 12), status };
  });
}

/** Tabla `path | rows | sha | estado`, alineada como en el resto de los scripts. */
export function formatTable(report) {
  const widths = {
    path: Math.max(...report.map((row) => row.path.length)),
    rows: Math.max(...report.map((row) => String(row.rows ?? '—').length)),
    sha: Math.max(...report.map((row) => row.sha256.length)),
  };
  return report
    .map(
      (row) =>
        `  ${row.path.padEnd(widths.path)}  ${String(row.rows ?? '—').padStart(widths.rows)}  ` +
        `${row.sha256.padEnd(widths.sha)}  ${row.status}`,
    )
    .join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dryRun = args.includes('--dry-run');
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex === -1 ? CONTRACT_ROOT : resolve(args[outIndex + 1] ?? '');

  if (check && dryRun) {
    console.error('✗ contract:seed — --check y --dry-run no se combinan');
    process.exit(1);
  }

  const spec = loadSpec().spec;
  const contractId = spec.info?.['x-contract-id'];
  const seed = computeSeed({ contractId, fixturesHash: fixturesSha256() });

  if (dryRun) {
    console.log(`▶ seed ${seed.seedId} · contrato ${contractId} (dry-run: no se escribe nada)`);
    console.log(formatTable(compareWithDisk(seed)));
    return;
  }

  if (check) {
    const report = compareWithDisk(seed);
    console.log(`▶ seed ${seed.seedId} · contrato ${contractId}`);
    console.log(formatTable(report));

    const drift = report.filter((row) => row.status !== 'sin cambios');
    if (drift.length > 0) {
      console.error(`\n✗ contract:seed:check — ${drift.length} archivo(s) fuera de sync:`);
      for (const row of drift) console.error(`  - ${row.path}: ${row.status}`);
      console.error('  corré `npm run contract:seed` y commiteá el resultado');
      process.exit(1);
    }
    console.log('\n✓ contract:seed:check verde: el seed commiteado es el emitido.');
    return;
  }

  const report = compareWithDisk(seed, outRoot);
  const target = relative(REPO_ROOT, outRoot).split('\\').join('/') || '.';
  console.log(`▶ seed ${seed.seedId} · contrato ${contractId} → ${target}`);
  console.log(formatTable(report));
  writeSeed(seed, outRoot);
  console.log(`\n✓ contract:seed verde: ${seed.entries.length} archivo(s) emitidos.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
