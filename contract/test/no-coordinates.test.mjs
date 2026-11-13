/**
 * Ninguna coordenada a la salida: walk del **spec**, no de los archivos.
 *
 * La regla del contrato es "la coordenada entra, no sale". Este archivo prueba la
 * mitad de la salida sobre el grafo **resuelto** (`loadSpec()` expande todos los
 * `$ref`), desde las raíces públicas:
 *
 *  - toda `responses.*.content.*.schema` de las 21 operations;
 *  - el envelope de eventos y la página de polling (`EventEnvelope` cubre la unión
 *    de los 6 payloads; `EventsPage` cubre el envelope).
 *
 * Falla si a cualquier profundidad aparece una propiedad que nombre una
 * coordenada, si un `example`/`default`/`enum` lleva una clave así, si un schema
 * de respuesta deja `additionalProperties` abierto (el agujero por donde entraría
 * una coordenada sin nombre) o si quedó un `$ref` sin resolver.
 *
 * **Frontera con los otros guards — no se duplica:**
 *  - `zones-geometry.test.mjs` valida `catalog/zones.json` como dato y que ningún
 *    `$ref` del contrato apunte a `catalog/`; por eso acá no se vuelve a mirar el
 *    catálogo ni los pares posicionales `[lng, lat]`.
 *  - `presence-discovery.test.mjs` cubre la entrada: `PUT /presence` acepta un
 *    punto o una zona, y `PresenceUpdate`/`PrivatePoint` no están montados en
 *    `components.schemas`.
 *  - `events-contract.test.mjs` valida el envelope contra el log real.
 *
 * Lo que sólo vive acá: el DFS de `lib/walk.mjs` con nombres **compuestos**
 * (`user_lat`, `lastLat`, `longitudeDeg`), el walk de literales y el chequeo de
 * `additionalProperties`. Sin allowlist de schemas permitidos: una lista así
 * envejece y deja pasar el próximo tipo que alguien agregue.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOperations, listRefs, loadSpec } from '../scripts/lib/spec.mjs';
import { walkSchema } from '../scripts/lib/walk.mjs';

const { spec } = loadSpec();

/**
 * Nombre de propiedad que delata una coordenada. Es el patrón de la spec
 * (`latitude|longitude|(^|[_.-])(lat|lng|lon)([_.-]|$)`) más un segundo patrón
 * para camelCase: `lastLat` y `userLng` no tienen separador, así que el primero
 * los deja pasar.
 */
const COORDINATE_NAME = /latitude|longitude|(^|[_.-])(lat|lng|lon)([_.-]|$)/i;
const CAMEL_COORDINATE_NAME = /[a-z](Lat|Lng|Lon|Latitude|Longitude)([A-Z0-9_]|$)/;

const isCoordinateName = (name) => COORDINATE_NAME.test(name) || CAMEL_COORDINATE_NAME.test(name);

/**
 * Raíces públicas. El request de `PUT /presence` no está: es la única entrada que
 * lleva un punto y su schema vive fuera de `components.schemas` a propósito.
 */
function publicRoots() {
  const roots = [];
  for (const { method, path, operation } of listOperations(spec)) {
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      for (const [mediaType, media] of Object.entries(response?.content ?? {})) {
        if (!media?.schema) continue;
        roots.push({
          kind: 'response',
          label: `${method.toUpperCase()} ${path} ${status} ${mediaType}`,
          schema: media.schema,
        });
      }
    }
  }
  for (const name of ['EventEnvelope', 'EventsPage']) {
    roots.push({ kind: 'event', label: `components.schemas.${name}`, schema: spec.components.schemas[name] });
  }
  return roots;
}

/** Camina una raíz y junta todo lo que viola la regla. */
function inspect(root) {
  const found = {
    coordinates: [],
    literals: [],
    open: [],
    refs: [],
    names: new Set(),
    nodes: 0,
  };

  walkSchema(root.schema, (entry) => {
    if (entry.kind === 'schema') {
      found.nodes += 1;
      // `false` cierra; `true` o un schema dejan entrar claves sin nombre.
      if (entry.node.type === 'object' && entry.node.additionalProperties !== false) {
        found.open.push(
          `${root.label} ${entry.trail}: additionalProperties ${JSON.stringify(entry.node.additionalProperties)}`,
        );
      }
      return;
    }
    if (entry.kind === 'propertyName') {
      found.names.add(entry.name);
      if (isCoordinateName(entry.name)) {
        found.coordinates.push(`${root.label} ${entry.trail}.${entry.name}`);
      }
      return;
    }
    if (entry.kind === 'literalKey') {
      if (isCoordinateName(entry.name)) {
        found.literals.push(`${root.label} ${entry.trail}.${entry.name}`);
      }
      return;
    }
    if (entry.kind === 'ref') {
      found.refs.push(`${root.label} ${entry.trail}: $ref sin resolver (${entry.ref})`);
    }
  });

  return found;
}

function inspectAll() {
  const roots = publicRoots();
  const total = { coordinates: [], literals: [], open: [], refs: [], names: new Set(), nodes: 0 };
  for (const root of roots) {
    const found = inspect(root);
    total.coordinates.push(...found.coordinates);
    total.literals.push(...found.literals);
    total.open.push(...found.open);
    total.refs.push(...found.refs);
    total.nodes += found.nodes;
    for (const name of found.names) total.names.add(name);
  }
  return { roots, total };
}

test('el spec llega resuelto: el walk no se puede esquivar con un $ref', () => {
  // `loadSpec()` expande todo. Si quedara un ref suelto, el DFS no lo seguiría y
  // el guard tendría un agujero silencioso.
  assert.deepEqual(listRefs(spec), [], 'quedaron $ref sin resolver en el documento');
});

test('ninguna response ni evento alcanza una coordenada, a ninguna profundidad', (t) => {
  const { roots, total } = inspectAll();

  assert.deepEqual(total.coordinates, [], `propiedades con nombre de coordenada:\n  ${total.coordinates.join('\n  ')}`);
  assert.deepEqual(total.literals, [], `literales con nombre de coordenada:\n  ${total.literals.join('\n  ')}`);
  assert.deepEqual(total.refs, [], `$ref sin resolver:\n  ${total.refs.join('\n  ')}`);

  // El walk tiene que llegar de verdad: si las raíces o el DFS se rompen, el
  // guard pasaría sin probar nada. Estos nombres son la prueba de que recorrió
  // respuestas y eventos.
  for (const marker of ['distanceM', 'profileId', 'occurredAt', 'zoneKey', 'fallbackRequired']) {
    assert.ok(total.names.has(marker), `el walk no llegó a "${marker}": el guard estaría vacío`);
  }
  assert.ok(total.nodes > 100, `el walk recorrió ${total.nodes} nodos: demasiado poco para ser creíble`);

  t.diagnostic(
    `${roots.length} raíces (responses + envelope y EventsPage) · ` +
      `${total.nodes} nodos de schema · ${total.names.size} nombres de propiedad distintos · 0 coordenadas`,
  );
});

test('el walk está armado: detecta una coordenada inyectada a cualquier profundidad', () => {
  const inject = (schema) => inspect({ kind: 'response', label: 'inyectado', schema }).coordinates;

  // Los cuatro nombres de la spec, en el nivel que sea.
  for (const name of ['latitude', 'longitude', 'lat', 'lng', 'lon']) {
    assert.equal(inject({ type: 'object', additionalProperties: false, properties: { [name]: { type: 'number' } } }).length, 1);
    assert.equal(
      inject({
        type: 'object',
        additionalProperties: false,
        properties: { zone: { type: 'object', additionalProperties: false, properties: { [name]: { type: 'number' } } } },
      }).length,
      1,
      `${name} anidado en un objeto`,
    );
    assert.equal(
      inject({
        type: 'array',
        items: { type: 'object', additionalProperties: false, properties: { [name]: { type: 'number' } } },
      }).length,
      1,
      `${name} dentro de items`,
    );
    assert.equal(
      inject({ allOf: [{ type: 'object', additionalProperties: false, properties: { [name]: { type: 'number' } } }] }).length,
      1,
      `${name} debajo de allOf`,
    );
  }

  // Nombres compuestos: la spec sólo cubre separadores, así que el guard suma
  // camelCase. `lastLat` con el patrón solo de la spec pasaría.
  for (const name of ['user_lat', 'lastLat', 'userLng', 'longitudeDeg', 'Lat']) {
    assert.equal(
      inject({ type: 'object', additionalProperties: false, properties: { [name]: { type: 'number' } } }).length,
      1,
      `${name} debería fallar`,
    );
  }

  // Y no se lleva puesto el vocabulario del dataset.
  for (const name of ['distanceM', 'bearingDeg', 'flat', 'belong', 'location', 'related']) {
    assert.equal(
      inject({ type: 'object', additionalProperties: false, properties: { [name]: { type: 'string' } } }).length,
      0,
      `${name} no es una coordenada`,
    );
  }

  // Los literales también viajan en la respuesta.
  const literal = inspect({
    kind: 'response',
    label: 'inyectado',
    schema: { type: 'object', additionalProperties: false, example: { lat: 19.43, lng: -99.13 } },
  });
  assert.equal(literal.literals.length, 2, 'un `example` con lat/lng es una coordenada expuesta');
});

test('ningún schema público deja additionalProperties abierto', () => {
  const { roots } = inspectAll();
  const open = roots.flatMap((root) => inspect(root).open);
  assert.deepEqual(open, [], `schemas sin cerrar:\n  ${open.join('\n  ')}`);

  // Self-test del agujero: `true` y un schema dejan entrar claves sin declarar, así
  // que el walk no puede confiar sólo en `properties`.
  const hole = (schema) => inspect({ kind: 'response', label: 'inyectado', schema }).open;
  assert.equal(hole({ type: 'object', additionalProperties: true }).length, 1);
  assert.equal(hole({ type: 'object', additionalProperties: { type: 'string' } }).length, 1);
  assert.equal(hole({ type: 'object', additionalProperties: false }).length, 0);
  assert.equal(hole({ type: 'object' }).length, 1, 'sin la clave, el schema está abierto');
});

test('las raíces son las responses y los eventos, no el request de presencia', () => {
  const { roots } = inspectAll();
  const labels = roots.map((root) => root.label);

  assert.equal(labels.filter((label) => label.includes('application/problem+json')).length > 0, true);
  assert.equal(labels.includes('PUT /presence 200 application/json'), true);
  assert.equal(labels.includes('components.schemas.EventEnvelope'), true);
  assert.equal(labels.includes('components.schemas.EventsPage'), true);
  assert.equal(
    labels.some((label) => label.includes('requestBody')),
    false,
    'el walk de salida no puede meter el body de entrada',
  );

  // El request sí lleva coordenadas: si esto dejara de ser cierto, el guard de
  // arriba estaría mirando el lado equivocado.
  const updatePresence = listOperations(spec).find(
    ({ method, path }) => method === 'put' && path === '/presence',
  ).operation;
  const request = updatePresence.requestBody.content['application/json'].schema;
  assert.deepEqual(Object.keys(request.properties.point.properties).sort(), ['lat', 'lng']);
});
