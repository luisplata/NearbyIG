import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTRACT_ID_PATTERN,
  canonicalContractId,
  listOperations,
  listRefs,
  loadSpec,
} from '../scripts/lib/spec.mjs';

const { raw, spec } = loadSpec();

/**
 * Inventario congelado. Cada PR de la cadena agrega sus filas acá; ninguna se
 * borra ni se renombra. Si un PR agrega una operation sin tocar esta lista, el
 * test falla: el inventario no puede crecer en silencio.
 *
 * Con PR6 la lista quedó **completa** para v0.1: era exactamente la tabla de la
 * spec (S1–S3). De ahí en adelante, una fila nueva es un cambio de superficie,
 * no un PR de la cadena. La primera excepción es deliberada: **v0.2** agrega
 * `POST /auth/takeover` (desalojo explícito de un slot) junto con
 * `ProfileSummary.inUse`, porque la demo de Sprint 1 necesita mostrar "en uso" y
 * desalojar sin inventar superficie fuera del contrato.
 *
 * **v0.3** agrega las cuatro operations de pings (enviar, bandeja, accept y
 * reject). **v0.4** agrega el chat que le faltaba al match —bandeja, conversación,
 * envío y lectura— más `GET /me`, que le da consumer al `SelfProfile` declarado
 * desde S0.
 */
const EXPECTED_OPERATIONS = [
  'POST /auth/demo-session',
  'POST /auth/takeover',
  'POST /auth/logout',
  'POST /auth/stream-ticket',
  'GET /events',
  'GET /events/poll',
  'GET /demo/regions',
  'GET /demo/zones',
  'GET /demo/profiles',
  'PUT /presence',
  'DELETE /presence',
  'GET /discovery',
  'POST /pings',
  'GET /pings',
  'POST /pings/{pingId}/accept',
  'POST /pings/{pingId}/reject',
  'GET /matches',
  'GET /matches/{matchId}/messages',
  'POST /matches/{matchId}/messages',
  'POST /matches/{matchId}/read',
  'GET /me',
];

/** Paths que la superficie congelada S1–S4 deja afuera a propósito. */
const FORBIDDEN_PATHS = /chat|block|report|\/health/;

const SUPPORTED_SPRINTS = [1, 2, 3, 4];
const operations = listOperations(spec);
const label = ({ method, path }) => `${method.toUpperCase()} ${path}`;

test('el documento parsea como OpenAPI 3.1 y resuelve todos los $ref', () => {
  assert.equal(spec.openapi, '3.1.0');
  assert.match(spec.info.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.ok(listRefs(raw).length > 0, 'el contrato debe usar $ref entre archivos');

  // `loadSpec()` ya lanza si un $ref no resuelve: acá se verifica que no quedó
  // ninguno sin expandir, que es lo que hace determinista al x-contract-id.
  assert.equal(JSON.stringify(spec).includes('"$ref"'), false, 'quedó un $ref sin expandir');
});

test('toda operation declara x-implementation-sprint entero en 1..4', () => {
  assert.ok(operations.length > 0, 'el contrato no declara ninguna operation');

  for (const operation of operations) {
    const sprint = operation.operation['x-implementation-sprint'];
    assert.ok(Number.isInteger(sprint), `${label(operation)}: x-implementation-sprint no es entero`);
    assert.ok(
      SUPPORTED_SPRINTS.includes(sprint),
      `${label(operation)}: sprint ${sprint} fuera de 1..4`,
    );
  }
});

test('toda operation declara al menos un error 4xx/5xx', () => {
  for (const operation of operations) {
    const statuses = Object.keys(operation.operation.responses ?? {})
      .filter((status) => /^[1-5]\d{2}$/.test(status))
      .map(Number)
      .filter((status) => status >= 400);

    assert.ok(
      statuses.length > 0,
      `${label(operation)}: no declara ningún 4xx/5xx (redocly: operation-4xx-response)`,
    );
  }
});

test('los operationId son únicos y no vacíos', () => {
  const ids = operations.map((operation) => operation.operationId);

  for (const id of ids) {
    assert.equal(typeof id, 'string', 'toda operation necesita operationId');
    assert.ok(id.length > 0, 'el operationId no puede ser vacío');
  }
  assert.equal(new Set(ids).size, ids.length, `operationId duplicado en ${ids.join(', ')}`);
});

test('el inventario de operations es exactamente el esperado', () => {
  assert.deepEqual(
    operations.map(label).sort(),
    [...EXPECTED_OPERATIONS].sort(),
    'el inventario del contrato cambió: agregá o quitá filas en EXPECTED_OPERATIONS',
  );
});

test('ningún path lleva prefijo de versión', () => {
  for (const path of Object.keys(spec.paths ?? {})) {
    assert.ok(!path.startsWith('/v1'), `${path}: el versionado vive en info, no en el path`);
  }
});

test('la superficie no incluye chat, block, report ni health', () => {
  for (const path of Object.keys(spec.paths ?? {})) {
    assert.doesNotMatch(
      path,
      FORBIDDEN_PATHS,
      `${path}: esa superficie no está congelada; entra cuando exista un diseño que la congele (S5)`,
    );
  }
});

test('x-contract-id coincide con el hash canónico del documento', () => {
  const declared = spec.info['x-contract-id'];

  assert.match(declared, CONTRACT_ID_PATTERN);
  assert.equal(
    declared,
    canonicalContractId(spec),
    'x-contract-id desactualizado: corré `npm run contract:validate` para obtener el valor',
  );
});
