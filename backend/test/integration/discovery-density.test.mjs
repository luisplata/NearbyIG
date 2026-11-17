import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  clearPresence,
  deleteSessionsCreatedSince,
  listDiscovery,
  logout,
  openSession,
  PROBLEM_FIELDS,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
} from '../helpers.mjs';

/**
 * `GET /discovery` con densidad real: cero contrapartes y una contraparte.
 *
 * Lo que fija este archivo:
 *
 *  - **una persona sola recibe `200` con `results: []`**, no un 422: el vacío es
 *    una respuesta válida del contrato, no un error de validación;
 *  - **el propio perfil nunca aparece**, ni siquiera cuando es la única sesión
 *    viva de la región;
 *  - sin presencia viva tampoco hay origen ni filas, y sigue siendo `200`.
 *
 * El escenario usa un slot que los demás archivos no tocan: un test de densidad
 * sólo mide algo si nadie más está vivo en la región al mismo tiempo.
 */

/** Ancla de `cdmx` (`ST_PointOnSurface`), la misma que usa discovery.test.mjs. */
const ANCHOR = { lat: 19.44, lng: -99.127297 };

const at = (point) => ({ point });

/** `GET /discovery` con status 200 obligatorio: las filas o el fallo del test. */
async function rows(token, filters = {}) {
  const response = await listDiscovery(token, filters);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(Object.keys(response.body), ['results'], 'DiscoveryResult es un objeto con array adentro');
  return response.body.results;
}

describe('discovery: cero contrapartes es una respuesta válida', () => {
  let snapshot = [];
  let alone;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const response = await openSession({ regionKey: 'mx', demoSlot: 9 });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    alone = { ...response.body, sessionId: sessionIdOf(response.body.token) };
    const presence = await updatePresence(alone.token, at(ANCHOR));
    assert.equal(presence.status, 200, JSON.stringify(presence.body));
  });

  after(async () => {
    await logout(alone.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('una sola sesión viva recibe 200 con results vacío', async () => {
    const page = await rows(alone.token);
    assert.deepEqual(page, [], 'una persona sola no tiene contrapartes que descubrir');
  });

  test('el propio perfil no aparece nunca en el descubrimiento', async () => {
    const page = await rows(alone.token);
    assert.ok(
      !page.some((row) => row.profileId === alone.profileId),
      'el observador aparece en su propio descubrimiento',
    );
    // Con filtros explícitos tampoco: el vacío no es un default del query.
    const filtered = await rows(alone.token, { radiusM: 5000, online: 'true', verified: 'false' });
    assert.deepEqual(filtered, []);
  });

  test('sin presencia viva sigue siendo 200 y no un error', async () => {
    const cleared = await clearPresence(alone.token);
    assert.equal(cleared.status, 204, JSON.stringify(cleared.body));

    const page = await rows(alone.token);
    assert.deepEqual(page, [], 'sin origen no hay filas, y eso no es un error');

    // Se restituye para no dejar la sesión sin presencia si el archivo crece.
    const presence = await updatePresence(alone.token, at(ANCHOR));
    assert.equal(presence.status, 200, JSON.stringify(presence.body));
  });

  test('el vacío no es un problem+json', async () => {
    const response = await listDiscovery(alone.token);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body), ['results']);
    for (const field of PROBLEM_FIELDS) {
      assert.ok(!(field in response.body), `la respuesta lleva el campo de problem ${field}`);
    }
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /"(?:lat|lng|lon|latitude|longitude|point|center|position)"/i,
      'la respuesta lleva geometría',
    );
  });
});
