/**
 * El cliente TypeScript es un artefacto: se compara, no se escribe.
 *
 * `contract/generated/api.ts` se commitea. Este archivo prueba tres cosas que un
 * `git diff` no ve:
 *
 *  1. **Drift**: los bytes commiteados son los que produce `generateClient()` hoy.
 *     `contract:generate:check` es el mismo chequeo por CLI; el test lo corre
 *     también porque `contract:test` tiene que fallar aunque nadie corra el gate.
 *  2. **Determinismo**: dos corridas seguidas dan exactamente el mismo texto. Un
 *     generador que ordena distinto entre corridas hace que el gate de drift sea
 *     peor que no tener gate (falla al azar y se aprende a ignorarlo).
 *  3. **Type-only**: el archivo no importa ni ejecuta nada. Sin runtime deps, S3 lo
 *     consume como tipos y el wrapper `fetch` lo pone la app.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { OUTPUT_FILE, OUTPUT_PATH, generateClient, generatorVersion } from '../scripts/generate-client.mjs';
import { CONTRACT_ROOT, loadSpec } from '../scripts/lib/spec.mjs';

const PACKAGE = JSON.parse(readFileSync(resolve(CONTRACT_ROOT, '..', 'package.json'), 'utf8'));
const COMMITTED = readFileSync(OUTPUT_FILE, 'utf8').replace(/\r\n/g, '\n');
const { spec } = loadSpec();

const lineOf = (text, prefix) => text.split('\n').find((line) => line.trim().startsWith(prefix)) ?? '';

test('el cliente commiteado es el que genera el contrato hoy', async () => {
  const generated = await generateClient();
  assert.equal(
    COMMITTED,
    generated,
    `${OUTPUT_PATH} tiene drift: corré \`npm run contract:generate\` y commiteá el resultado`,
  );
  assert.equal(COMMITTED.includes('\r'), false, 'el generado es LF: un checkout Windows no puede cambiar el gate');
});

test('dos corridas producen bytes idénticos: el gate de drift es estable', async () => {
  const [first, second] = await Promise.all([generateClient(), generateClient()]);
  assert.equal(first, second, 'el generador no es determinista');
  assert.equal(first, COMMITTED, 'una de las dos corridas difiere del archivo commiteado');
});

test('el header fija la versión pinneada y el contrato, sin timestamps', () => {
  const pinned = PACKAGE.devDependencies['openapi-typescript'];

  assert.match(pinned, /^\d+\.\d+\.\d+$/, `openapi-typescript tiene que estar pinneado exacto, no "${pinned}"`);
  assert.equal(pinned, generatorVersion(), 'la versión instalada no es la declarada en package.json');

  const header = COMMITTED.split('\n').slice(0, 12).join('\n');
  assert.match(header, /GENERATED FILE/, 'el header tiene que decir que no se edita');
  assert.match(header, new RegExp(`openapi-typescript ${pinned.replace(/\./g, '\\.')}`), 'falta la versión del generador');
  assert.match(header, new RegExp(`x-contract-id ${spec.info['x-contract-id']}`), 'falta el x-contract-id vigente');
  assert.equal(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(header),
    false,
    'un timestamp en el header rompe el determinismo',
  );
});

test('el cliente es type-only: sin runtime, sin imports, con las tres vistas', () => {
  for (const declaration of ['export interface paths', 'export interface components', 'export interface operations']) {
    assert.ok(COMMITTED.includes(declaration), `falta \`${declaration}\``);
  }

  assert.equal(/^\s*import\s/m.test(COMMITTED), false, 'el generado no puede importar nada');
  assert.equal(/\brequire\s*\(/.test(COMMITTED), false, 'el generado no puede requerir nada');
  assert.equal(/^export default/m.test(COMMITTED), false, 'no hay cliente runtime: sólo tipos');

  // Las 16 operations del contrato existen como claves tipadas.
  const operations = COMMITTED.slice(COMMITTED.indexOf('export interface operations'));
  const operationIds = Object.values(spec.paths).flatMap(operationsOf).map((operation) => operation.operationId);
  assert.equal(operationIds.length, 16, `el contrato declara ${operationIds.length} operations, no 16`);
  for (const operationId of operationIds) {
    assert.ok(operations.includes(`${operationId}:`), `falta la operation ${operationId} en el cliente`);
  }
});

test('la unión ErrorCode del cliente es la del catálogo, completa', () => {
  const codes = spec.components.schemas.ErrorCode.enum;
  const line = lineOf(COMMITTED, 'ErrorCode:');

  assert.ok(line.length > 0, 'falta ErrorCode en components.schemas del cliente');
  for (const code of codes) {
    assert.ok(line.includes(`"${code}"`), `el cliente no exporta ${code}`);
  }
  assert.equal(
    (line.match(/"[A-Z_]+"/g) ?? []).length,
    codes.length,
    'el cliente exporta un ErrorCode que el catálogo no tiene (o le falta uno)',
  );
});

/** Operations de un path item, para no repetir el walk de métodos HTTP. */
function operationsOf(pathItem) {
  return Object.entries(pathItem ?? {})
    .filter(([, operation]) => operation && typeof operation === 'object' && typeof operation.operationId === 'string')
    .map(([, operation]) => operation);
}
