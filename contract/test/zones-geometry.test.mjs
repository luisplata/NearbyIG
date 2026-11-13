/**
 * Geometría del catálogo y su única frontera: el spec.
 *
 * Los polígonos **sí** tienen coordenadas. La regla no es "no hay coordenadas en
 * el repo": es "una coordenada no puede alcanzar un response ni un payload de
 * evento". Por eso este archivo tiene dos mitades:
 *
 *  1. `catalog/zones.json` se valida como dato: anillos cerrados, ≥3 vértices
 *     distintos, pares posicionales `[lng, lat]` (sin keys), 6 decimales y rango.
 *  2. El spec se recorre por el grafo de `$ref` (resuelto por `loadSpec`) desde
 *     las raíces públicas —toda response y todo `components.schemas`— y falla si
 *     alguna alcanza `polygon`, `center`, `geometry`, `coordinates` o un par de
 *     números. No hay allowlist de nombres: la lista de schemas permitidos
 *     envejece mal y deja pasar el próximo `ZonePolygon` que alguien agregue.
 *
 * La exclusión del catálogo es por construcción: el test nunca mete
 * `catalog/zones.json` en el grafo del spec, y además verifica que ningún `$ref`
 * del contrato apunte a `catalog/`. Un `$ref` sólo resuelve dentro del spec, así
 * que la geometría es inalcanzable por diseño, no por convención.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { CONTRACT_ROOT, SPEC_FILE, listOperations, listRefs, loadSpec, splitRef } from '../scripts/lib/spec.mjs';

const ZONES_FILE = new URL('../catalog/zones.json', import.meta.url);
const REGIONS_FILE = new URL('../catalog/regions.json', import.meta.url);
const ZONES_TEXT = readFileSync(ZONES_FILE, 'utf8');
const REGIONS_TEXT = readFileSync(REGIONS_FILE, 'utf8');
const zones = JSON.parse(ZONES_TEXT);
const regions = JSON.parse(REGIONS_TEXT);
const { raw, spec } = loadSpec();

const VERTEX_LINE = /\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g;

/** Nombres que delatan geometría o una coordenada en un schema público. */
const GEOMETRY_KEY =
  /^(?:polygon|polygons|ring|rings|center|centre|geometry|coordinates|lat|lng|lon|latitude|longitude)$/i;

/** Labels legibles: `mx`/`co` y `cdmx`/`bogota` están congelados en la spec. */
const EXPECTED_REGIONS = ['co', 'mx'];
const EXPECTED_ZONES = ['bogota', 'cdmx'];

const where = (trail) => trail.join('.');

/** Recorre un valor del spec y junta violaciones de geometría con su ruta. */
function findGeometry(node, trail, found) {
  if (Array.isArray(node)) {
    // Un par posicional `[lng, lat]` es una coordenada aunque no tenga nombre.
    if (node.length === 2 && node.every((item) => typeof item === 'number')) {
      found.push(`${where(trail)}: par de números ${JSON.stringify(node)} (coordenada sin nombre)`);
      return;
    }
    node.forEach((item, index) => findGeometry(item, [...trail, `[${index}]`], found));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  if (node.type === 'array' && Array.isArray(node.prefixItems)) {
    const numeric = node.prefixItems.every((item) => item?.type === 'number' || item?.type === 'integer');
    if (node.prefixItems.length === 2 && numeric) {
      found.push(`${where(trail)}: array de dos números (coordenada posicional)`);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    const next = [...trail, key];

    if (key === 'properties' && value !== null && typeof value === 'object') {
      for (const property of Object.keys(value)) {
        if (GEOMETRY_KEY.test(property)) {
          found.push(`${where(next)}.${property}: la propiedad nombra geometría o una coordenada`);
        }
      }
    }

    findGeometry(value, next, found);
  }
}

/** Raíces públicas: toda response de toda operation + todo `components.schemas`. */
function publicRoots() {
  const roots = [];
  for (const { method, path, operation } of listOperations(spec)) {
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      for (const [mediaType, media] of Object.entries(response?.content ?? {})) {
        if (media?.schema) {
          roots.push({
            name: `${method.toUpperCase()} ${path} ${status} ${mediaType}`,
            schema: media.schema,
          });
        }
      }
    }
  }
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    roots.push({ name: `components.schemas.${name}`, schema });
  }
  return roots;
}

test('cada anillo es cerrado, con ≥3 vértices distintos, en pares posicionales', () => {
  assert.ok(Array.isArray(zones), 'zones.json es un array de zonas');

  for (const zone of zones) {
    const at = `zona ${zone.zoneKey}`;
    assert.ok(Array.isArray(zone.polygon), `${at}: falta polygon`);
    assert.ok(zone.polygon.length >= 1, `${at}: polygon necesita al menos un anillo`);

    for (const [index, ring] of zone.polygon.entries()) {
      const ringAt = `${at} anillo ${index}`;
      assert.ok(Array.isArray(ring), `${ringAt}: el anillo es un array de vértices`);

      for (const [vertexIndex, vertex] of ring.entries()) {
        assert.ok(
          Array.isArray(vertex) && vertex.length === 2,
          `${ringAt}[${vertexIndex}]: el vértice es un par posicional [lng, lat], no un objeto con claves`,
        );
        for (const value of vertex) {
          assert.equal(typeof value, 'number', `${ringAt}[${vertexIndex}]: el par debe ser numérico`);
        }
      }

      const first = ring[0];
      const last = ring.at(-1);
      assert.deepEqual(last, first, `${ringAt}: el anillo no está cerrado (último ≠ primero)`);

      const distinct = new Set(ring.slice(0, -1).map((vertex) => JSON.stringify(vertex)));
      assert.ok(
        distinct.size >= 3,
        `${ringAt}: ${distinct.size} vértices distintos; un anillo necesita ≥3`,
      );
    }
  }
});

test('los vértices están en rango y se escriben con 6 decimales', () => {
  const literals = [...ZONES_TEXT.matchAll(VERTEX_LINE)];
  const vertices = zones.flatMap((zone) =>
    zone.polygon.flatMap((ring) => ring.map((vertex) => ({ zone: zone.zoneKey, vertex }))),
  );

  assert.equal(
    literals.length,
    vertices.length,
    'cada vértice del JSON tiene que aparecer una sola vez como literal `[lng, lat]`',
  );

  for (const [index, match] of literals.entries()) {
    const { zone, vertex } = vertices[index];
    const [lngText, latText] = match.slice(1);

    for (const text of [lngText, latText]) {
      assert.match(
        text,
        /^-?\d{1,3}\.\d{6}$/,
        `zona ${zone}: ${text} no tiene exactamente 6 decimales (la precisión es del archivo)`,
      );
    }
    assert.equal(Number(lngText), vertex[0], `zona ${zone}: lng del literal no coincide con el JSON`);
    assert.equal(Number(latText), vertex[1], `zona ${zone}: lat del literal no coincide con el JSON`);

    const [lng, lat] = vertex;
    assert.ok(lng >= -180 && lng <= 180, `zona ${zone}: lng ${lng} fuera de [-180, 180]`);
    assert.ok(lat >= -90 && lat <= 90, `zona ${zone}: lat ${lat} fuera de [-90, 90]`);
  }
});

test('el catálogo declara mx y co con una zona por defecto que existe', () => {
  assert.deepEqual(regions.map((region) => region.regionKey).sort(), EXPECTED_REGIONS);
  assert.deepEqual(zones.map((zone) => zone.zoneKey).sort(), EXPECTED_ZONES);

  const byKey = new Map(zones.map((zone) => [zone.zoneKey, zone]));
  for (const region of regions) {
    const zone = byKey.get(region.defaultZoneKey);
    assert.ok(zone, `${region.regionKey}: defaultZoneKey "${region.defaultZoneKey}" no existe en zones.json`);
    assert.equal(zone.regionKey, region.regionKey, `defaultZoneKey de ${region.regionKey} apunta a otra región`);
    assert.match(region.nameKey, /^region\.[a-z]{2}$/, `${region.regionKey}: nameKey`);
    assert.ok(zone.nameKey.length > 0, `${zone.zoneKey}: nameKey vacío`);
  }

  assert.equal(new Set(zones.map((zone) => zone.zoneKey)).size, zones.length, 'zoneKey repetida');
  for (const zone of zones) {
    assert.ok(
      regions.some((region) => region.regionKey === zone.regionKey),
      `${zone.zoneKey}: regionKey "${zone.regionKey}" no está en regions.json`,
    );
  }
});

test('ningún schema público alcanza la geometría (recorrido de $ref, no allowlist)', () => {
  const roots = publicRoots();
  assert.ok(roots.length > 0, 'no hay raíces públicas que recorrer');

  const found = [];
  for (const { name, schema } of roots) findGeometry(schema, [name], found);

  assert.deepEqual(found, [], `geometría alcanzable desde el spec:\n  ${found.join('\n  ')}`);

  // Y el recorrido tiene que llegar de verdad a la proyección: si `ZoneList`
  // desapareciera, el guard no probaría nada.
  const zoneSchema = spec.components.schemas.ZoneList.properties.zones.items;
  assert.deepEqual(
    Object.keys(zoneSchema.properties ?? {}).sort(),
    ['nameKey', 'regionKey', 'zoneKey'],
    'ZoneSummary es zoneKey + nameKey + regionKey y nada más',
  );
  assert.equal(zoneSchema.additionalProperties, false, 'ZoneSummary cierra con additionalProperties: false');
  assert.deepEqual([...(zoneSchema.required ?? [])].sort(), ['nameKey', 'regionKey', 'zoneKey']);

  const regionSchema = spec.components.schemas.RegionList.properties.regions.items;
  assert.deepEqual(
    Object.keys(regionSchema.properties ?? {}).sort(),
    ['defaultZoneKey', 'nameKey', 'regionKey'],
    'Region es región + nameKey + zona por defecto, sin geometría',
  );
});

test('el catálogo queda fuera del spec: ningún $ref apunta a catalog/', () => {
  for (const { ref, at } of listRefs(raw)) {
    const { file } = splitRef(ref, SPEC_FILE);
    const fromContract = relative(CONTRACT_ROOT, file).split('\\').join('/');
    assert.equal(
      fromContract.startsWith('catalog/'),
      false,
      `${at}: $ref al catálogo (${ref}) — la geometría no se referencia desde un schema`,
    );
  }

  // Los schemas y paths también pueden traer `$ref` que la raíz no ve (se
  // resuelven dentro de su propio archivo). Se miran sólo las líneas con `$ref`:
  // prosa que *menciona* `catalog/` para explicar dónde vive la geometría es
  // correcta y no se persigue.
  for (const dir of ['paths', 'schemas']) {
    for (const file of readdirSync(join(CONTRACT_ROOT, dir))) {
      const text = readFileSync(join(CONTRACT_ROOT, dir, file), 'utf8');
      for (const [index, line] of text.split('\n').entries()) {
        if (!line.includes('$ref')) continue;
        assert.equal(
          line.includes('catalog/'),
          false,
          `${dir}/${file}:${index + 1}: $ref al catálogo — ${line.trim()}`,
        );
      }
    }
  }
});

test('las dos operations de catálogo declaran 401 y no exponen geometría en examples', () => {
  const operations = Object.fromEntries(
    listOperations(spec).map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
  );

  for (const label of ['GET /demo/regions', 'GET /demo/zones']) {
    const operation = operations[label];
    assert.ok(operation, `${label}: falta la operation en paths/catalog.yaml`);
    assert.equal(operation['x-implementation-sprint'], 2, `${label}: sprint`);
    assert.ok(operation.responses['401'], `${label}: falta el 401 de demoSession`);
  }

  const found = [];
  for (const operation of Object.values(operations)) {
    const responses = JSON.stringify(operation.responses ?? {});
    for (const literal of responses.matchAll(VERTEX_LINE)) {
      found.push(`${operation.operationId}: ${literal[0]}`);
    }
  }
  assert.deepEqual(found, [], 'un response no puede llevar un par [lng, lat], ni en un example');
});
