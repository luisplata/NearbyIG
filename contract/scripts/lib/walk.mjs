/**
 * Recorrido de schemas del contrato, independiente de cómo estén escritos.
 *
 * El guard de "nunca coordenadas" no puede mirar el YAML: tiene que mirar la
 * **semántica** que el server va a serializar. Este módulo camina un schema ya
 * resuelto (lo que devuelve `loadSpec()`, sin `$ref` colgando) y avisa de cada
 * nodo con su ruta, para que el test nombre schema y propiedad en vez de tirar un
 * "falló".
 *
 * Qué se recorre:
 *  - keywords cuyo valor es un schema: `items`, `prefixItems`, `allOf`, `anyOf`,
 *    `oneOf`, `not`, `if`/`then`/`else`, `contains`, `propertyNames`,
 *    `additionalProperties`, `unevaluatedProperties`, `contentSchema`;
 *  - mapas de schemas: `properties`, `patternProperties`, `dependentSchemas`,
 *    `$defs`, `definitions` — acá además se emite el **nombre** de cada propiedad,
 *    que es lo que delata a `lat`, `lng`, `latitude` o `user_lng`;
 *  - literales: `example`, `examples`, `default`, `const`, `enum`. No son
 *    schemas, son valores que viajan en la respuesta: un `lat` adentro de un
 *    `example` es una coordenada expuesta igual que una propiedad.
 *
 * Un `$ref` sin resolver emite `kind: 'ref'` y **no** se sigue: el contrato se
 * camina siempre resuelto, y que quede un ref suelto es una violación del gate
 * (`validate-spec` y `no-coordinates.test.mjs` lo cubren).
 */

/** Keywords cuyo valor es un mapa nombre → schema. */
const SCHEMA_MAPS = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];

/** Keywords cuyo valor es una lista de schemas. */
const SCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

/** Keywords cuyo valor es un schema (o un booleano, en `additionalProperties`). */
const SCHEMA_VALUES = [
  'items',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'additionalProperties',
  'unevaluatedProperties',
  'contentSchema',
];

/** Keywords cuyo valor es un literal que viaja en el payload. */
const VALUE_LITERALS = ['example', 'examples', 'default', 'const', 'enum'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const at = (trail, key) => `${trail}.${key}`;

/**
 * Camina un valor cualquiera (no un schema) y emite una entrada por cada clave de
 * objeto que encuentra. Sólo importan los nombres: los valores son datos.
 */
function walkValue(value, visit, trail) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkValue(entry, visit, `${trail}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [name, entry] of Object.entries(value)) {
    const next = at(trail, name);
    visit({ kind: 'literalKey', name, value: entry, trail: next });
    walkValue(entry, visit, next);
  }
}

/**
 * DFS sobre un schema resuelto.
 *
 * `visit` recibe:
 *  - `{ kind: 'schema', node, trail }` por cada nodo de schema,
 *  - `{ kind: 'propertyName', name, trail }` por cada propiedad declarada
 *    (`trail` ya apunta al schema que la declara),
 *  - `{ kind: 'literalKey', name, value, trail }` por cada clave dentro de un
 *    `example`/`examples`/`default`/`const`/`enum`,
 *  - `{ kind: 'ref', ref, trail }` si quedó un `$ref` sin resolver.
 */
export function walkSchema(node, visit, trail = '#') {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walkSchema(entry, visit, `${trail}[${index}]`));
    return;
  }
  if (!isObject(node)) return;

  visit({ kind: 'schema', node, trail });

  if (typeof node.$ref === 'string') {
    visit({ kind: 'ref', ref: node.$ref, trail });
  }

  for (const keyword of SCHEMA_MAPS) {
    const map = node[keyword];
    if (!isObject(map)) continue;
    const next = at(trail, keyword);
    for (const [name, schema] of Object.entries(map)) {
      const child = at(next, name);
      if (keyword === 'properties' || keyword === 'patternProperties') {
        visit({ kind: 'propertyName', name, trail: next });
      }
      walkSchema(schema, visit, child);
    }
  }

  for (const keyword of SCHEMA_LISTS) {
    const list = node[keyword];
    if (!Array.isArray(list)) continue;
    list.forEach((schema, index) => walkSchema(schema, visit, `${at(trail, keyword)}[${index}]`));
  }

  for (const keyword of SCHEMA_VALUES) {
    const schema = node[keyword];
    if (!isObject(schema)) continue; // `additionalProperties: false|true` no es un schema
    walkSchema(schema, visit, at(trail, keyword));
  }

  for (const keyword of VALUE_LITERALS) {
    if (!Object.hasOwn(node, keyword)) continue;
    walkValue(node[keyword], visit, at(trail, keyword));
  }
}
