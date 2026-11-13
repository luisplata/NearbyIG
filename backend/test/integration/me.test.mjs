import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  deleteSessionsCreatedSince,
  getMe,
  listProfiles,
  logout,
  openSession,
  pointSessionToMissingProfile,
  sessionIdOf,
  snapshotSessionIds,
} from '../helpers.mjs';

/**
 * `GET /me` — delta v0.4.
 *
 * Lo que fija este archivo:
 *
 *  - devuelve **el perfil de la sesión**, no el `self` del dataset: los valores
 *    coinciden con la fila del catálogo del `profileId` que la sesión reclamó;
 *  - la fila es `SelfProfile`: 10 campos, sin `distanceM`/`bearingDeg` ni
 *    `online`, sin `gender`/`verified`/`bioKey` y sin coordenadas;
 *  - dos sesiones en slots distintos ven perfiles distintos;
 *  - un perfil que ya no está es `404 PROFILE_NOT_FOUND` (el mismo camino que un
 *    invitado, que nunca tuvo fila de catálogo);
 *  - sin token es `401`.
 *
 * Aislamiento: se usan los slots 6 y 7 de `co` y al terminar se borran las
 * sesiones creadas.
 */

const REGION = 'co';

/** Las 11 claves de `SelfProfile`: ni una más. */
const SELF_FIELDS = [
  'demoSlot',
  'initials',
  'instagramHandle',
  'intention',
  'nickname',
  'photoId',
  'profileId',
  'regionKey',
  'sourceType',
  'statusKey',
];

describe('GET /me', () => {
  let snapshot = [];
  let first;
  let second;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const one = await openSession({ regionKey: REGION, demoSlot: 6 });
    assert.equal(one.status, 201, JSON.stringify(one.body));
    const two = await openSession({ regionKey: REGION, demoSlot: 7 });
    assert.equal(two.status, 201, JSON.stringify(two.body));
    first = { token: one.body.token, profileId: one.body.profileId, demoSlot: 6 };
    second = { token: two.body.token, profileId: two.body.profileId, demoSlot: 7 };
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
  });

  test('devuelve el perfil de la sesión, con la forma de SelfProfile', async () => {
    const response = await getMe(first.token);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(Object.keys(response.body).sort(), SELF_FIELDS, 'SelfProfile declara 10 campos');
    assert.equal(response.body.profileId, first.profileId);
    assert.equal(response.body.regionKey, REGION);
    assert.equal(response.body.demoSlot, first.demoSlot);
    assert.equal(response.body.sourceType, 'human');

    // Los valores son los de la fila del catálogo, no los del `self` del dataset.
    const catalog = await listProfiles(first.token, REGION);
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    const row = catalog.body.profiles.find((profile) => profile.profileId === first.profileId);
    assert.ok(row !== undefined, 'el perfil de la sesión está en el catálogo');
    for (const field of ['nickname', 'initials', 'intention', 'photoId', 'instagramHandle', 'statusKey']) {
      assert.equal(response.body[field], row[field], `${field} viene del catálogo`);
    }

    assert.equal('distanceM' in response.body, false, 'no hay distancia a sí mismo');
    assert.equal('bearingDeg' in response.body, false);
    assert.equal('online' in response.body, false, 'la sesión está viva por construcción');
    assert.equal(JSON.stringify(response.body).includes('"lat"'), false, 'sin coordenadas');
    assert.equal(JSON.stringify(response.body).includes('"lng"'), false, 'sin coordenadas');
  });

  test('dos sesiones en slots distintos ven cada una el suyo', async () => {
    const one = await getMe(first.token);
    const two = await getMe(second.token);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.notEqual(one.body.profileId, two.body.profileId, 'no es el self fijo del dataset');
    assert.equal(two.body.profileId, second.profileId);
    assert.equal(two.body.demoSlot, second.demoSlot);
  });

  test('un perfil que ya no está es 404 PROFILE_NOT_FOUND', async () => {
    const sessionId = sessionIdOf(second.token);
    await pointSessionToMissingProfile(sessionId, `${REGION}-nadie`);

    const response = await getMe(second.token);
    assert.equal(response.status, 404, JSON.stringify(response.body));
    assert.equal(response.body.code, 'PROFILE_NOT_FOUND');
    assert.deepEqual(Object.keys(response.body).sort(), ['code', 'detail', 'requestId', 'status', 'title', 'type']);
  });

  test('sin token es 401 y un token cerrado tampoco entra', async () => {
    assert.equal((await getMe(undefined)).status, 401);
    assert.equal((await logout(first.token)).status, 204);
    assert.equal((await getMe(first.token)).status, 401);
  });
});
