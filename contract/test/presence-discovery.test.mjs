/**
 * Presencia y descubrimiento: la frontera de las coordenadas.
 *
 * La regla del contrato no es "no hay coordenadas": es **entran o salen**. Un
 * punto entra por `PUT /presence` y no sale por ningún lado —ni response, ni
 * evento, ni log—. Este archivo prueba las dos mitades:
 *
 *  1. el request acepta un punto **o** una `demoZoneKey`, exactamente uno;
 *  2. ninguna parte de la superficie pública nombra una coordenada, y el schema
 *     del request no está montado en `components.schemas` justamente para que el
 *     guard de geometría (`zones-geometry.test.mjs`) siga cerrado sobre lo que
 *     puede salir.
 *
 * El validador de instancias es un subconjunto mínimo de JSON Schema
 * (`type`, `required`, `properties`, `additionalProperties`, `oneOf`, `allOf`,
 * `if/then`, `const`, `enum`, `minimum`, `maximum`, `minLength`, `pattern`,
 * `items`), el que el contrato usa de verdad. Se escribe acá en vez de sumar una
 * devDependency: el tooling del contrato son dos devDeps pinneadas y un validador
 * general no es lo que este gate necesita.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const SPEC = loadSpec().spec;
const schemas = SPEC.components.schemas;
const byLabel = Object.fromEntries(
  listOperations(SPEC).map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
);

const COORDINATE_KEY = /^(?:lat|lng|lon|latitude|longitude)$/i;
const FORBIDDEN_IN_RESPONSE = /^(?:point|demoZoneKey)$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const TYPE_CHECKS = {
  object: isObject,
  array: Array.isArray,
  string: (value) => typeof value === 'string',
  integer: Number.isInteger,
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
};

/** Valida `value` contra el subconjunto de JSON Schema que usa el contrato. */
function validate(schema, value, trail = '#') {
  if (schema === true || schema === undefined) return [];
  assert.equal(typeof schema, 'object', `${trail}: el schema no es un objeto`);

  const errors = [];

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((option) => validate(option, value, trail).length === 0);
    if (matches.length !== 1) {
      errors.push(`${trail}: oneOf esperaba exactamente una opción, matchearon ${matches.length}`);
    }
  }
  for (const option of schema.allOf ?? []) errors.push(...validate(option, value, trail));

  if (schema.if !== undefined) {
    if (validate(schema.if, value, trail).length === 0) {
      errors.push(...validate(schema.then, value, trail));
    }
  }

  if (schema.type !== undefined) {
    const types = [].concat(schema.type);
    if (!types.some((type) => TYPE_CHECKS[type]?.(value))) {
      errors.push(`${trail}: se esperaba ${types.join('|')}, llegó ${JSON.stringify(value)}`);
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${trail}: se esperaba const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${trail}: ${JSON.stringify(value)} no está en el enum`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${trail}: ${value} < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${trail}: ${value} > ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${trail}: string vacío`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${trail}: ${JSON.stringify(value)} no matchea ${schema.pattern}`);
    }
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${trail}: falta ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        errors.push(...validate(properties[key], entry, `${trail}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${trail}: propiedad no declarada "${key}"`);
      }
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((entry, index) => errors.push(...validate(schema.items, entry, `${trail}[${index}]`)));
  }

  return errors;
}

/** Nombres de propiedad declarados a cualquier profundidad. */
function propertyNames(node, trail = '#', found = []) {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => propertyNames(entry, `${trail}[${index}]`, found));
    return found;
  }
  if (!isObject(node)) return found;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && isObject(value)) {
      for (const name of Object.keys(value)) found.push({ name, at: `${trail}.properties` });
    }
    propertyNames(value, `${trail}.${key}`, found);
  }
  return found;
}

const updatePresence = byLabel['PUT /presence'];
const clearPresence = byLabel['DELETE /presence'];
const discovery = byLabel['GET /discovery'];
const presenceUpdate = updatePresence.requestBody.content['application/json'].schema;

test('PUT /presence acepta un punto o una demoZoneKey, nunca los dos ni ninguno', () => {
  const point = { point: { lat: 19.432608, lng: -99.133209 } };

  assert.deepEqual(validate(presenceUpdate, point), [], 'un punto privado válido se acepta');
  assert.deepEqual(validate(presenceUpdate, { demoZoneKey: 'cdmx' }), [], 'una zona demo válida se acepta');

  const rejected = {
    'sin punto ni demoZoneKey': {},
    'con las dos cosas': { ...point, demoZoneKey: 'cdmx' },
    'con una propiedad de más': { ...point, distanceM: 240 },
    'con latitud fuera de rango': { point: { lat: 91, lng: 0 } },
    'con longitud fuera de rango': { point: { lat: 0, lng: -181 } },
    'con medio punto': { point: { lat: 19.43 } },
    'con una zona que no es clave': { demoZoneKey: 'Guadalajara' },
  };
  for (const [reason, body] of Object.entries(rejected)) {
    assert.notDeepEqual(validate(presenceUpdate, body), [], `${reason}: el schema tiene que rechazarlo`);
  }
  assert.equal(presenceUpdate.additionalProperties, false);
});

test('PresenceState cierra y el fallback vive en el body, no en un Problem', () => {
  const state = schemas.PresenceState;

  assert.equal(state.additionalProperties, false);
  assert.deepEqual(
    Object.keys(state.properties).sort(),
    ['fallbackRequired', 'online', 'profileId', 'regionKey', 'zoneKey'],
  );
  assert.deepEqual([...state.required].sort(), Object.keys(state.properties).sort());
  assert.equal(state.properties.fallbackRequired.type, 'boolean');

  const base = { profileId: 'mx-p03', regionKey: 'mx', online: true };
  assert.deepEqual(
    validate(state, { ...base, zoneKey: 'cdmx', fallbackRequired: false }),
    [],
    'zona derivada: fallbackRequired false',
  );
  assert.deepEqual(
    validate(state, { ...base, zoneKey: null, fallbackRequired: true }),
    [],
    'punto fuera de todo polígono: zoneKey null',
  );
  assert.notDeepEqual(
    validate(state, { ...base, zoneKey: 'cdmx', fallbackRequired: true }),
    [],
    'fallbackRequired true exige zoneKey null',
  );
  assert.notDeepEqual(
    validate(state, { ...base, zoneKey: null, fallbackRequired: false }),
    [],
    'sin fallback, la zona es obligatoria',
  );
});

test('la coordenada sólo entra: no hay lat/lng en la superficie que puede salir', () => {
  // El request y su punto no se montan: `components.schemas` es lo que sale, y
  // montarlos obligaría a abrirle un agujero al guard de geometría.
  assert.equal(schemas.PresenceUpdate, undefined, 'PresenceUpdate no se monta en components.schemas');
  assert.equal(schemas.PrivatePoint, undefined, 'PrivatePoint no se monta en components.schemas');

  // Pero el punto existe del lado de la entrada, con nombre explícito.
  assert.deepEqual(Object.keys(presenceUpdate.properties.point.properties).sort(), ['lat', 'lng']);
  assert.deepEqual([...presenceUpdate.properties.point.required].sort(), ['lat', 'lng']);

  const coordinateNames = (node) =>
    propertyNames(node).filter(({ name }) => COORDINATE_KEY.test(name)).map(({ at }) => at);

  assert.deepEqual(
    coordinateNames(schemas),
    [],
    'un schema montado en components.schemas nombra una coordenada: la coordenada sólo entra',
  );

  for (const { method, path, operation } of listOperations(SPEC)) {
    const found = coordinateNames(operation.responses);
    assert.deepEqual(found, [], `${method.toUpperCase()} ${path}: un response nombra una coordenada`);
  }
});

test('ningún response devuelve el punto ni la zona que recibió', () => {
  for (const { method, path, operation } of listOperations(SPEC)) {
    const named = propertyNames(operation.responses)
      .filter(({ name }) => FORBIDDEN_IN_RESPONSE.test(name))
      .map(({ name }) => name);
    assert.deepEqual(named, [], `${method.toUpperCase()} ${path}: el response repite ${named.join(', ')}`);
  }
});

test('DiscoveryQuery y los parámetros de query son la misma lista', () => {
  const query = schemas.DiscoveryQuery;
  const parameters = Object.fromEntries(discovery.parameters.map((parameter) => [parameter.name, parameter]));

  assert.deepEqual(
    Object.keys(parameters).sort(),
    Object.keys(query.properties).sort(),
    'un filtro declarado en un solo lado: la copia que sobra es la que se desincroniza',
  );

  for (const [name, parameter] of Object.entries(parameters)) {
    const property = query.properties[name];
    assert.equal(parameter.in, 'query', `${name}: no es un parámetro de query`);
    assert.equal(parameter.required, false, `${name}: todos los filtros son opcionales`);
    assert.equal(parameter.schema.type, property.type, `${name}: el tipo no coincide`);
    assert.equal(parameter.schema.minimum, property.minimum, `${name}: el mínimo no coincide`);
    assert.equal(parameter.schema.maximum, property.maximum, `${name}: el máximo no coincide`);
    assert.equal(parameter.schema.default, property.default, `${name}: el default no coincide`);
    assert.deepEqual(parameter.schema.enum, property.enum, `${name}: el enum no coincide`);
  }
  assert.equal(query.additionalProperties, false);
});

test('el radio va de 200 a 5000 metros y no se clampa en silencio', () => {
  const radius = schemas.DiscoveryQuery.properties.radiusM;

  assert.equal(radius.type, 'integer');
  assert.equal(radius.minimum, 200);
  assert.equal(radius.maximum, 5000);
  assert.equal(radius.default, 5000);

  assert.deepEqual(validate(schemas.DiscoveryQuery, { radiusM: 1500 }), []);
  assert.deepEqual(
    validate(schemas.DiscoveryQuery, {
      radiusM: 5000,
      intention: 'networking',
      gender: 'nonbinary',
      verified: true,
      online: false,
    }),
    [],
  );
  for (const radiusM of [199, 5001, 0, -1]) {
    assert.notDeepEqual(
      validate(schemas.DiscoveryQuery, { radiusM }),
      [],
      `${radiusM} m está fuera de 200–5000 y tiene que fallar, no recortarse`,
    );
  }
});

test('DiscoveryResult reusa ProfileSummary y declara el redondeo', () => {
  const result = schemas.DiscoveryResult;
  const summary = schemas.ProfileSummary;

  assert.equal(result.additionalProperties, false);
  assert.deepEqual(Object.keys(result.properties), ['results']);
  assert.equal(result.properties.results.items.additionalProperties, false, 'ProfileSummary cierra');
  assert.deepEqual(
    Object.keys(result.properties.results.items.properties).sort(),
    Object.keys(summary.properties).sort(),
    'la fila del descubrimiento es ProfileSummary: no hay un DTO nuevo',
  );
  assert.equal(result.properties.results.maxItems, 10, 'el catálogo tiene 10 perfiles por región');

  // El redondeo no es cosmético: es lo que hace que dos clientes vean el mismo
  // entero para el mismo par sesión↔perfil.
  assert.match(result.description, /redondea/i);
  assert.match(discovery.description, /redondean? al metro y al grado/i);
});

test('las operations declaran su sprint y los errores que las cierran', () => {
  assert.equal(updatePresence['x-implementation-sprint'], 2);
  assert.equal(clearPresence['x-implementation-sprint'], 2);
  assert.equal(discovery['x-implementation-sprint'], 3);

  assert.deepEqual(Object.keys(updatePresence.responses).sort(), ['200', '401', '404', '422', '429', '500']);
  assert.deepEqual(Object.keys(clearPresence.responses).sort(), ['204', '401', '409']);
  assert.deepEqual(Object.keys(discovery.responses).sort(), ['200', '401', '429', '500', '501']);
  assert.equal(clearPresence.responses['204'].content, undefined, 'un 204 no lleva body');

  // Cada error de estas operations viene de `components.responses`: no se
  // inventa un body por operation. Una response puede declarar más de un `code`
  // (el 401 de credencial y el 422 de presencia): el status es uno y `Problem.code`
  // discrimina.
  const declared = new Set();
  for (const operation of [updatePresence, clearPresence, discovery]) {
    for (const [status, response] of Object.entries(operation.responses)) {
      if (Number(status) < 400) continue;
      for (const code of [].concat(response['x-error-code'] ?? [])) declared.add(code);
    }
  }
  assert.deepEqual(
    [...declared].sort(),
    [
      'INTERNAL',
      'NOT_IMPLEMENTED',
      'PRESENCE_STALE',
      'PROFILE_NOT_FOUND',
      'RATE_LIMITED',
      'UNAUTHENTICATED',
      'VALIDATION_FAILED',
      'ZONE_UNKNOWN',
    ],
    'PR6 tiene que usar los códigos que quedaban sin operation',
  );
  assert.equal(declared.has('UNAUTHENTICATED'), true, 'las tres heredan el 401 de demoSession');
});

test('el descubrimiento declara sus exclusiones sin modelar bloqueos', () => {
  for (const word of [/propio perfil/i, /bloqueados/i, /pausados/i, /otra región/i]) {
    assert.match(discovery.description, word, 'las exclusiones son parte del contrato, no del server');
  }
  assert.match(discovery.description, /501/, 'el server de S1/S2 responde NOT_IMPLEMENTED, no un 404');
});
