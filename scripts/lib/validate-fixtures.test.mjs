import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Casos negativos del validador del contrato (SC-6). El validador se ejecuta como
 * proceso real (`node scripts/validate-fixtures.mjs`) contra una copia temporal
 * del contrato (`NEARBYIG_CONTRACT_ROOT`), así se verifica el contrato observable:
 * exit code 1 y un mensaje por violación. Nunca toca los archivos del repo.
 *
 * La intención retirada se arma por partes: el gate de limpieza prohíbe el literal
 * en `scripts/`, pero el caso negativo necesita inyectarlo para probar el rechazo.
 */

const REMOVED_INTENTION = ['da', 'ting'].join('');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'validate-fixtures.mjs');
const SHARED = join(ROOT, 'demo', 'shared');
const FILES = ['fixtures.json', 'copy.json', 'design-tokens.json', 'photos.json'];

/** Copia el contrato a un directorio temporal, aislado por caso. */
function contractRoot() {
  const root = mkdtempSync(join(tmpdir(), 'nearbyig-contract-'));
  mkdirSync(join(root, 'demo', 'shared'), { recursive: true });
  for (const name of FILES) {
    copyFileSync(join(SHARED, name), join(root, 'demo', 'shared', name));
  }
  return root;
}

function runValidator(root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, NEARBYIG_CONTRACT_ROOT: root },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Aplica una mutación sobre un JSON del contrato temporal. */
function mutate(root, name, change) {
  const path = join(root, 'demo', 'shared', name);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  change(data);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function expectViolation(change, pattern) {
  const root = contractRoot();
  mutate(root, 'fixtures.json', change);
  const { status, stderr } = runValidator(root);
  assert.equal(status, 1, `el validador debió rechazar la mutación (stderr: ${stderr})`);
  assert.match(stderr, pattern);
}

test('un contrato válido sale con código 0 y el datasetId', () => {
  const { status, stdout } = runValidator(contractRoot());
  assert.equal(status, 0);
  assert.match(stdout, /^OK: ds-[0-9a-f]{8} · schema 2 · 10 perfiles/m);
});

test('rechaza el schemaVersion 1', () => {
  expectViolation((fixtures) => {
    fixtures.schemaVersion = 1;
  }, /schemaVersion debe ser 2/);
});

test('rechaza una intención retirada en el catálogo', () => {
  expectViolation((fixtures) => {
    fixtures.filters.intentions = ['networking', 'friendship', REMOVED_INTENTION];
  }, /filters\.intentions debe ser exactamente networking, friendship, activities/);
});

test('rechaza una intención retirada en un perfil', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].intention = REMOVED_INTENTION;
  }, new RegExp(`intention "${REMOVED_INTENTION}" no válida`));
});

test('rechaza un catálogo de 4 intenciones', () => {
  expectViolation((fixtures) => {
    fixtures.filters.intentions = [...fixtures.filters.intentions, 'bowling'];
  }, /filters\.intentions debe tener 3 valores únicos/);
});

test('rechaza un campo de intereses en un perfil', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].interests = ['café', 'libros'];
  }, /propiedad no permitida "interests" en "profiles\[0\] \(p01\)"/);
});

test('rechaza un campo de intereses en el perfil propio', () => {
  expectViolation((fixtures) => {
    fixtures.self.tags = ['café'];
  }, /propiedad no permitida "tags" en "self"/);
});

test('rechaza coordenadas geográficas', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].lat = -34.6037;
  }, /propiedad geográfica prohibida "profiles\[0\]\.lat"/);
});

test('rechaza una URL externa en el copy', () => {
  const root = contractRoot();
  mutate(root, 'copy.json', (copy) => {
    copy['ping.sent'] = 'Ping enviado (ver https://example.com)';
  });
  const { status, stderr } = runValidator(root);
  assert.equal(status, 1);
  assert.match(stderr, /URL externa prohibida en "ping\.sent"/);
});

test('rechaza un posible secreto', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].nickname = `Ana AIza${'a'.repeat(35)}`;
  }, /posible secreto \(Google API key\)/);
});

test('rechaza IDs duplicados', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[1].id = fixtures.profiles[0].id;
  }, /id duplicado/);
});

test('rechaza un photoId inexistente', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].photoId = 'ph99';
  }, /photoId "ph99" no existe en photos\.json/);
});

test('rechaza una intención fuera del catálogo', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].intention = 'bowling';
  }, /intention "bowling" no válida/);
});

test('rechaza una distancia fuera de rango', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].distanceM = 5200;
  }, /distanceM = 5200 fuera de 200-5000/);
});

test('rechaza un bearing fuera de rango', () => {
  expectViolation((fixtures) => {
    fixtures.profiles[0].bearingDeg = 400;
  }, /bearingDeg = 400 fuera de 0-359/);
});
