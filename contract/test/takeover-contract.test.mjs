/**
 * Contrato v0.2: ocupación visible y desalojo explícito.
 *
 * La demo de Sprint 1 tiene un selector de perfiles que muestra "en uso" y un
 * botón de takeover. Sin contrato, las dos cosas se resuelven a los golpes:
 * `GET /demo/profiles` devuelve 10 filas siempre y el cliente descubre la
 * ocupación comiendo un `409 PROFILE_IN_USE`, y desalojar exige extender
 * `DemoSessionRequest`, que es un claim disfrazado de takeover.
 *
 * Este archivo congela la forma del delta:
 *
 *  - `ProfileSummary.inUse` es un `boolean` obligatorio, y **no** está en el
 *    seed: el catálogo es data congelada, `inUse` es estado de runtime.
 *  - `POST /auth/takeover` es una operation propia (no un flag implícito),
 *    autenticada, con body cerrado `{ regionKey, demoSlot }` y respuesta
 *    `DemoSession`.
 *  - el desalojo exige nombrar el slot: no hay variante "el que sea".
 *  - los errores se reusan del catálogo cerrado: 401 `UNAUTHENTICATED`, 403
 *    `REGION_MISMATCH`, 409 `PROFILE_IN_USE` y 422 `VALIDATION_FAILED`. Ningún
 *    código nuevo.
 *
 * Lo que este archivo **no** prueba: que el server lo haga. Eso son los tests de
 * integración de `backend/` (token del desalojado → 401, tickets quemados,
 * `inUse` coherente). Acá sólo se congela la forma que el server tiene que
 * cumplir.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const { spec } = loadSpec();
const byLabel = Object.fromEntries(
  listOperations(spec).map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
);

const takeover = byLabel['POST /auth/takeover'];
const demoSession = byLabel['POST /auth/demo-session'];
const request = spec.components.schemas.TakeoverRequest;
const summary = spec.components.schemas.ProfileSummary;
const errorCodes = spec.components.schemas.ErrorCode.enum;

/** `x-error-code` puede ser string o lista; acá se normaliza. */
const codesOf = (response) => [].concat(response?.['x-error-code'] ?? []);

const CATALOG = {
  mx: JSON.parse(readFileSync(new URL('../catalog/profiles.mx.json', import.meta.url), 'utf8')),
  co: JSON.parse(readFileSync(new URL('../catalog/profiles.co.json', import.meta.url), 'utf8')),
};

test('la operation existe, es de Sprint 1 y tiene operationId propio', () => {
  assert.ok(takeover, 'falta POST /auth/takeover (¿se montó paths/auth.yaml#/takeover?)');
  assert.equal(takeover['x-implementation-sprint'], 1, 'la demo de S1 no se entrega sin takeover');
  assert.equal(takeover.operationId, 'takeoverDemoSlot');
  assert.notEqual(
    takeover.operationId,
    demoSession.operationId,
    'takeover no es un modo de demo-session: es otra operation',
  );
});

test('takeover es explícito: operation aparte y sin flag en DemoSessionRequest', () => {
  const demoRequest = spec.components.schemas.DemoSessionRequest;

  assert.equal(
    Object.hasOwn(demoRequest.properties ?? {}, 'takeover'),
    false,
    'DemoSessionRequest no lleva `takeover`: el desalojo no puede ser implícito',
  );
  assert.equal(
    Object.hasOwn(demoRequest.properties ?? {}, 'force'),
    false,
    'ni un alias (`force`): un claim que desaloja sin decirlo es el bug que v0.2 evita',
  );
  assert.equal(takeover.requestBody?.required, true, 'el takeover necesita body: el slot no se adivina');
});

test('el body es cerrado, obligatorio y nombra el slot', () => {
  assert.ok(request, 'falta components.schemas.TakeoverRequest');
  assert.equal(request.type, 'object');
  assert.equal(request.additionalProperties, false, 'TakeoverRequest cierra con additionalProperties: false');
  assert.deepEqual(
    Object.keys(request.properties ?? {}).sort(),
    ['demoSlot', 'regionKey'],
    'el body lleva exactamente regionKey y demoSlot',
  );
  assert.deepEqual(
    [...(request.required ?? [])].sort(),
    ['demoSlot', 'regionKey'],
    'los dos campos son obligatorios: un takeover sin slot sería "desalojá el que sea"',
  );

  const slot = request.properties.demoSlot;
  assert.equal(slot.type, 'integer');
  assert.equal(slot.minimum, 1);
  assert.equal(slot.maximum, 10);
  assert.deepEqual(
    request.properties.regionKey,
    spec.components.schemas.RegionKey,
    'regionKey es el RegionKey del contrato, no una copia',
  );
  assert.equal(
    Object.hasOwn(request.properties, 'profileId'),
    false,
    'el takeover no acepta profileId: la identidad del ocupante sale del slot',
  );
});

test('responde DemoSession, la misma forma que abre demo-session', () => {
  const ok = takeover.responses?.['200'];
  assert.ok(ok, 'el takeover responde 200');
  assert.deepEqual(
    ok.content?.['application/json']?.schema,
    spec.components.schemas.DemoSession,
    'el 200 del takeover es `DemoSession`: el cliente no necesita un DTO nuevo',
  );
  assert.deepEqual(
    Object.keys(takeover.responses['200'].content),
    ['application/json'],
    'el token viaja en el body, nunca en la URL',
  );
});

test('hereda demoSession: el desalojo tiene sujeto', () => {
  assert.equal(
    Object.hasOwn(takeover, 'security'),
    false,
    'takeover no sobreescribe `security`: hereda `demoSession` (no es público)',
  );
  assert.deepEqual(spec.security, [{ demoSession: [] }], 'la seguridad global sigue siendo la sesión demo');
});

test('los errores del takeover reusan el catálogo cerrado', () => {
  const statuses = Object.keys(takeover.responses ?? {}).sort();
  assert.deepEqual(statuses, ['200', '401', '403', '409', '422'], 'statuses del takeover');

  const expected = {
    '401': ['UNAUTHENTICATED'],
    '403': ['REGION_MISMATCH'],
    '409': ['PROFILE_IN_USE'],
    '422': ['VALIDATION_FAILED'],
  };

  for (const [status, codes] of Object.entries(expected)) {
    assert.deepEqual(
      codesOf(takeover.responses[status]).sort(),
      codes,
      `${status} del takeover: ${codes.join(', ')}`,
    );
    for (const code of codes) {
      assert.ok(errorCodes.includes(code), `${code} tiene que existir en ErrorCode`);
    }
  }
});

test('inUse es ocupación de respuesta, nunca del seed', () => {
  assert.ok(summary, 'falta components.schemas.ProfileSummary');
  const inUse = summary.properties?.inUse;

  assert.ok(inUse, 'ProfileSummary.inUse es lo que hace visible "en uso" en el selector');
  assert.equal(inUse.type, 'boolean', 'inUse no es `null`: la respuesta siempre sabe si hay sesión viva');
  assert.ok(
    (summary.required ?? []).includes('inUse'),
    'inUse es obligatorio: un perfil sin el campo obliga al cliente a adivinar',
  );
  assert.equal(
    summary.additionalProperties,
    false,
    'agregar inUse no abre el schema: sigue cerrado',
  );

  for (const [regionKey, rows] of Object.entries(CATALOG)) {
    for (const profile of rows) {
      assert.equal(
        Object.hasOwn(profile, 'inUse'),
        false,
        `${regionKey}/${profile.profileId}: el catálogo es seed, la ocupación es runtime`,
      );
    }
  }
});
