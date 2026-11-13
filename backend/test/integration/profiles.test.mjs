import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  activeSlots,
  api,
  assertStackUp,
  deleteSessionsCreatedSince,
  listProfiles,
  logout,
  openSession,
  PROFILE_FIELDS,
  snapshotSessionIds,
} from '../helpers.mjs';

/**
 * `GET /demo/profiles` — el endpoint del contrato que alimenta la demo.
 *
 * Lo que se fija acá: autenticación, aislamiento regional, orden por slot, shape
 * exacto y la regla que no se negocia — ningún payload lleva coordenadas.
 */
describe('GET /demo/profiles', () => {
  let snapshot = [];
  let mxToken;
  let coToken;
  let mx;
  let co;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const mxSession = await openSession({ regionKey: 'mx' });
    assert.equal(mxSession.status, 201, JSON.stringify(mxSession.body));
    const coSession = await openSession({ regionKey: 'co' });
    assert.equal(coSession.status, 201, JSON.stringify(coSession.body));
    mxToken = mxSession.body.token;
    coToken = coSession.body.token;
    mx = await listProfiles(mxToken, 'mx');
    co = await listProfiles(coToken, 'co');
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
  });

  test('sin token responde 401 UNAUTHENTICATED', async () => {
    const response = await api('/demo/profiles?regionKey=mx');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHENTICATED');
    assert.match(response.headers.get('content-type') ?? '', /application\/problem\+json/);
  });

  test('con un token inválido responde 401', async () => {
    const response = await api('/demo/profiles?regionKey=mx', { token: 'no-es-un-jwt' });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHENTICATED');
  });

  test('sin regionKey responde 422 VALIDATION_FAILED', async () => {
    const response = await listProfiles(mxToken);
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'VALIDATION_FAILED');
  });

  test('regionKey malformado responde 422', async () => {
    for (const value of ['MX', 'm', 'mxx', 'mx-co']) {
      const response = await listProfiles(mxToken, value);
      assert.equal(response.status, 422, `regionKey=${value}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED');
    }
  });

  test('regionKey repetido en la query responde 422', async () => {
    const response = await api('/demo/profiles?regionKey=mx&regionKey=co', { token: mxToken });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'VALIDATION_FAILED');
  });

  test('pedir otra región responde 403 REGION_MISMATCH', async () => {
    const response = await listProfiles(mxToken, 'co');
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'REGION_MISMATCH');
  });

  test('mx devuelve los 10 perfiles ordenados por demoSlot', async () => {
    assert.equal(mx.status, 200);
    assert.equal(mx.body.profiles.length, 10);
    assert.deepEqual(
      mx.body.profiles.map((profile) => profile.demoSlot),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    for (const profile of mx.body.profiles) {
      assert.equal(profile.regionKey, 'mx');
      assert.equal(profile.sourceType, 'human');
      assert.ok(profile.profileId.startsWith('mx-p'));
    }
  });

  test('co devuelve los 10 perfiles ordenados por demoSlot', async () => {
    assert.equal(co.status, 200);
    assert.equal(co.body.profiles.length, 10);
    assert.deepEqual(
      co.body.profiles.map((profile) => profile.demoSlot),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    for (const profile of co.body.profiles) {
      assert.equal(profile.regionKey, 'co');
      assert.ok(profile.profileId.startsWith('co-p'));
    }
  });

  test('el shape de cada fila es exactamente ProfileSummary', async () => {
    for (const profile of [...mx.body.profiles, ...co.body.profiles]) {
      assert.deepEqual(Object.keys(profile).sort(), PROFILE_FIELDS, profile.profileId);
      assert.equal(typeof profile.verified, 'boolean');
      assert.equal(typeof profile.online, 'boolean');
      assert.equal(typeof profile.inUse, 'boolean');
      assert.equal(Number.isInteger(profile.distanceM), true);
      assert.equal(Number.isInteger(profile.bearingDeg), true);
      assert.ok(profile.distanceM >= 200 && profile.distanceM <= 5000);
      assert.ok(profile.bearingDeg >= 0 && profile.bearingDeg <= 359);
    }
  });

  test('inUse marca el slot que ocupa la sesión, y logout lo libera', async () => {
    // Dos sesiones: una observa (su token sigue vivo) y otra es la que se cierra.
    const observer = await openSession({ regionKey: 'mx' });
    const subject = await openSession({ regionKey: 'mx' });
    assert.equal(observer.status, 201, JSON.stringify(observer.body));
    assert.equal(subject.status, 201, JSON.stringify(subject.body));
    const slot = subject.body.demoSlot;

    const before = await listProfiles(observer.body.token, 'mx');
    assert.equal(before.status, 200);
    const slotsInUse = before.body.profiles
      .filter((profile) => profile.inUse)
      .map((profile) => profile.demoSlot);
    assert.ok(slotsInUse.includes(slot), `el slot ${slot} tiene que salir inUse`);
    assert.deepEqual(
      [...slotsInUse].sort((left, right) => left - right),
      await activeSlots('mx'),
      'inUse tiene que ser exactamente el conjunto de slots vivos del índice',
    );

    assert.equal((await logout(subject.body.token)).status, 204);
    const after = await listProfiles(observer.body.token, 'mx');
    assert.equal(after.status, 200);
    const stillInUse = after.body.profiles
      .filter((profile) => profile.inUse)
      .map((profile) => profile.demoSlot);
    assert.equal(stillInUse.includes(slot), false, `el slot ${slot} se liberó y no puede seguir inUse`);
  });

  test('las dos regiones no se mezclan', async () => {
    const mxIds = new Set(mx.body.profiles.map((profile) => profile.profileId));
    const coIds = new Set(co.body.profiles.map((profile) => profile.profileId));
    for (const id of coIds) assert.equal(mxIds.has(id), false, `${id} apareció en mx`);
    assert.equal(mxIds.size, 10);
    assert.equal(coIds.size, 10);
  });

  test('ningún perfil expone coordenadas ni geometría', async () => {
    for (const payload of [mx.body, co.body]) {
      const text = JSON.stringify(payload);
      for (const forbidden of ['lat', 'lng', 'lon', 'polygon', 'geometry', 'coordinates', 'center']) {
        assert.equal(
          new RegExp(`"${forbidden}"`, 'i').test(text),
          false,
          `el payload contiene "${forbidden}"`,
        );
      }
    }
  });

  test('el catálogo no incluye invitados', async () => {
    for (const payload of [mx.body, co.body]) {
      for (const profile of payload.profiles) {
        assert.notEqual(profile.sourceType, 'guest');
        assert.notEqual(profile.demoSlot, null);
      }
    }
  });
});
