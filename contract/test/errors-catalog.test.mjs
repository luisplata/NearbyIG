/**
 * Catálogo de errores ↔ responses reales del contrato.
 *
 * Se exige:
 *  - cada `ErrorCode` tiene un status HTTP 4xx/5xx en `x-status`, y el mapa y el
 *    enum listan exactamente los mismos códigos;
 *  - `x-reserved` sólo marca códigos que ninguna operation usa; desde v0.4 no
 *    queda ninguno (el chat cableó los dos de S5 y el bloqueo reusará
 *    `CHAT_BLOCKED`, no necesita código propio);
 *  - ninguna response usa un código ausente del enum;
 *  - todo 4xx/5xx responde `application/problem+json` con `Problem`, declara su
 *    `x-error-code` y el status coincide con `x-status`;
 *  - **ningún código no reservado queda huérfano**: cada uno lo usa al menos una
 *    operation.
 *
 * La última regla se activó en PR6, cuando presence y discovery cerraron el uso
 * de todo lo que S1–S3 puede ejercer (`RATE_LIMITED`, `PROFILE_NOT_FOUND`,
 * `PRESENCE_STALE`, `ZONE_UNKNOWN`, `NOT_IMPLEMENTED` e `INTERNAL`). v0.3 sumó
 * los pings y con ellos el uso real de `PING_DUPLICATE` y `PING_EXPIRED`, más
 * los tres códigos nuevos del flujo (`PING_FORBIDDEN`, `PING_NOT_FOUND`,
 * `PING_RESOLVED`). v0.4 trajo el chat: `MATCH_NOT_FOUND` y `CHAT_BLOCKED` dejan
 * de estar reservados porque tienen operation, y `MATCH_CLOSED` nace usándose.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const { spec } = loadSpec();

const { ErrorCode: errorCode, Problem: problem } = spec.components.schemas;
const STATUS_BY_CODE = errorCode?.['x-status'] ?? {};
const RESERVED = errorCode?.['x-reserved'] ?? {};
const PROBLEM_FIELDS = ['code', 'detail', 'requestId', 'status', 'title', 'type'];

/** Códigos congelados en el contrato S1–S4. v0.4 cierra el catálogo. */
const EXPECTED_ENUM_SIZE = 22;

/** Códigos reservados: existen para una operation que todavía no está en `paths/`. */
const EXPECTED_RESERVED = [];

const operations = listOperations(spec);
const label = ({ method, path }) => `${method.toUpperCase()} ${path}`;

/** Responses de error declaradas: `{ operation, httpStatus, response }`. */
const errorResponses = [];
for (const operation of operations) {
  for (const [status, response] of Object.entries(operation.operation.responses ?? {})) {
    if (!/^[1-5]\d{2}$/.test(status)) continue;
    const httpStatus = Number(status);
    if (httpStatus < 400) continue;
    errorResponses.push({ operation, httpStatus, response });
  }
}

/**
 * Códigos de una response. `x-error-code` es un string o una lista: un status
 * puede volver con más de un `code` (los tres 401 de credencial, los dos 422 de
 * `PUT /presence`) y `Problem.code` es el discriminante. La lista no es azúcar:
 * sin ella la regla de huérfanos no puede ver `TICKET_EXPIRED` ni `ZONE_UNKNOWN`,
 * que sí existen en operations reales.
 */
const codesOf = (response) => [].concat(response['x-error-code'] ?? []);

/** Código → operations que lo usan, para nombrar al culpable en el mensaje. */
function codeUsers() {
  const users = new Map();
  for (const { operation, httpStatus, response } of errorResponses) {
    const where = `${label(operation)} ${httpStatus}`;
    for (const code of codesOf(response).filter((entry) => typeof entry === 'string')) {
      users.set(code, [...(users.get(code) ?? []), where]);
    }
  }
  return users;
}

test('ErrorCode declara el catálogo congelado, una sola vez cada código', () => {
  assert.ok(Array.isArray(errorCode?.enum), 'ErrorCode necesita declarar un enum');
  const codes = errorCode.enum;

  assert.equal(new Set(codes).size, codes.length, 'hay códigos repetidos en el enum');
  assert.equal(
    codes.length,
    EXPECTED_ENUM_SIZE,
    'el catálogo cambió de tamaño: si es a propósito, actualizá EXPECTED_ENUM_SIZE en el mismo PR',
  );
});

test('cada ErrorCode tiene un status HTTP válido en x-status', () => {
  const codes = errorCode.enum;

  for (const code of codes) {
    const status = STATUS_BY_CODE[code];
    assert.ok(Number.isInteger(status), `${code}: falta en x-status (o no es un entero)`);
    assert.ok(status >= 400 && status <= 599, `${code}: ${status} no es un status de error (4xx/5xx)`);
  }

  assert.deepEqual(
    Object.keys(STATUS_BY_CODE).sort(),
    [...codes].sort(),
    'x-status y el enum no listan los mismos códigos: sobra o falta una fila',
  );
});

test('x-reserved marca sólo códigos sin operation, y son los de S5', () => {
  const reserved = Object.keys(RESERVED).sort();
  assert.deepEqual(reserved, [...EXPECTED_RESERVED].sort(), 'el conjunto de códigos reservados cambió');

  const users = codeUsers();
  for (const [code, flag] of Object.entries(RESERVED)) {
    assert.equal(flag, true, `${code}: x-reserved debe ser \`true\``);
    assert.ok(errorCode.enum.includes(code), `${code}: está reservado pero no existe en el enum`);
    assert.equal(
      users.has(code),
      false,
      `${code}: está reservado y lo usa ${users.get(code)?.join(', ')} — sacalo de x-reserved`,
    );
  }
});

test('ninguna response usa un código ausente del enum', () => {
  assert.ok(errorResponses.length > 0, 'no hay ninguna response 4xx/5xx declarada');

  const unknown = [];
  for (const { operation, httpStatus, response } of errorResponses) {
    const codes = codesOf(response);
    if (codes.length === 0) {
      unknown.push(`${label(operation)} ${httpStatus}: falta x-error-code`);
      continue;
    }
    assert.equal(
      new Set(codes).size,
      codes.length,
      `${label(operation)} ${httpStatus}: un código repetido en x-error-code`,
    );
    for (const code of codes) {
      if (typeof code !== 'string' || !errorCode.enum.includes(code)) {
        unknown.push(`${label(operation)} ${httpStatus}: "${code}" no está en ErrorCode`);
      }
    }
  }

  assert.deepEqual(unknown, [], 'códigos fuera del catálogo: agregalos a schemas/errors.yaml o corregí la response');
});

test('ningún código no reservado queda huérfano', () => {
  const users = codeUsers();
  const orphan = errorCode.enum.filter((code) => !RESERVED[code] && !users.has(code));

  assert.deepEqual(
    orphan,
    [],
    `códigos sin operation: ${orphan.join(', ')} — usalos en alguna response o marcalos en x-reserved`,
  );

  // Y la otra mitad: reservado = sin uso. Si S4 cablea un path y el código sigue
  // marcado, la reserva miente.
  const reservedInUse = Object.keys(RESERVED).filter((code) => users.has(code));
  assert.deepEqual(reservedInUse, [], 'un código reservado ya tiene operation: sacalo de x-reserved');
});

test('todo 4xx/5xx responde Problem y su status coincide con x-status', () => {
  for (const { operation, httpStatus, response } of errorResponses) {
    const where = `${label(operation)} ${httpStatus}`;

    assert.deepEqual(
      Object.keys(response.content ?? {}),
      ['application/problem+json'],
      `${where}: el error viaja sólo en application/problem+json`,
    );
    const schema = response.content['application/problem+json'].schema;
    assert.deepEqual(
      Object.keys(schema.properties ?? {}).sort(),
      PROBLEM_FIELDS,
      `${where}: el body de error no es Problem`,
    );
    for (const code of codesOf(response)) {
      assert.equal(STATUS_BY_CODE[code], httpStatus, `${where}: ${code} es ${STATUS_BY_CODE[code]} en x-status`);
    }
  }
});

test('Problem es RFC 9457 cerrado: seis campos, ninguno adicional', () => {
  assert.equal(problem?.type, 'object');
  assert.equal(problem.additionalProperties, false, 'Problem debe cerrar con additionalProperties: false');
  assert.deepEqual(
    Object.keys(problem.properties ?? {}).sort(),
    PROBLEM_FIELDS,
    'Problem tiene que declarar exactamente los seis campos',
  );
  assert.deepEqual(
    [...(problem.required ?? [])].sort(),
    PROBLEM_FIELDS,
    'los seis campos de Problem son obligatorios',
  );

  assert.equal(problem.properties.type.format, 'uri', 'Problem.type es una URI');
  assert.equal(problem.properties.status.minimum, 400);
  assert.equal(problem.properties.status.maximum, 599);
  assert.deepEqual(
    problem.properties.code.enum,
    errorCode.enum,
    'Problem.code tiene que ser el enum ErrorCode, no una copia',
  );
});
