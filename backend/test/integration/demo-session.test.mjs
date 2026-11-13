import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  deleteSessionsCreatedSince,
  listProfiles,
  openSession,
  snapshotSessionIds,
} from '../helpers.mjs';

const SESSION_FIELDS = ['demoSlot', 'expiresAt', 'profileId', 'regionKey', 'sourceType', 'token'];

/**
 * `POST /auth/demo-session`: la puerta de entrada de la demo.
 *
 * El contrato fija el shape (`DemoSession`), el invariante guest/slot y que el
 * slot ocupado es 409. Este batch implementa sólo la apertura: logout, ticket de
 * stream y takeover llegan después.
 */
describe('POST /auth/demo-session', () => {
  let snapshot = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
  });

  test('sin body abre sesión humana en el primer slot libre', async () => {
    const response = await openSession();
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.deepEqual(Object.keys(response.body).sort(), SESSION_FIELDS);
    assert.equal(response.body.regionKey, 'mx');
    assert.equal(response.body.sourceType, 'human');
    assert.equal(Number.isInteger(response.body.demoSlot), true);
    assert.ok(response.body.demoSlot >= 1 && response.body.demoSlot <= 10);
    assert.ok(response.body.profileId.startsWith('mx-p'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(Date.parse(response.body.expiresAt) > Date.now());
  });

  test('el token emitido sirve para leer los perfiles de su región', async () => {
    const session = await openSession({ regionKey: 'co' });
    assert.equal(session.status, 201);
    const profiles = await listProfiles(session.body.token, 'co');
    assert.equal(profiles.status, 200);
    assert.equal(profiles.body.profiles.length, 10);
  });

  test('un slot explícito ocupado responde 409 PROFILE_IN_USE', async () => {
    const first = await openSession({ regionKey: 'mx', demoSlot: 7 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.demoSlot, 7);

    const second = await openSession({ regionKey: 'mx', demoSlot: 7 });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'PROFILE_IN_USE');
  });

  test('demoSlot fuera de rango responde 422', async () => {
    for (const demoSlot of [0, 11, 1.5, '3']) {
      const response = await openSession({ demoSlot });
      assert.equal(response.status, 422, `demoSlot=${String(demoSlot)}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED');
    }
  });

  test('campo desconocido responde 422 (additionalProperties: false)', async () => {
    const response = await openSession({ nickname: 'no-va' });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, 'VALIDATION_FAILED');
  });

  test('región fuera del catálogo responde 422', async () => {
    for (const regionKey of ['zz', 'MX', 'mx-co']) {
      const response = await openSession({ regionKey });
      assert.equal(response.status, 422, `regionKey=${regionKey}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED');
    }
  });

  test('con los 10 slots vivos, el siguiente entra como invitado', async () => {
    for (let demoSlot = 1; demoSlot <= 10; demoSlot += 1) {
      const response = await openSession({ regionKey: 'co', demoSlot });
      // 201 si el slot estaba libre; 409 si ya lo ocupaba una sesión previa.
      assert.ok([201, 409].includes(response.status), `slot ${demoSlot}: ${response.status}`);
    }

    const guest = await openSession({ regionKey: 'co' });
    assert.equal(guest.status, 201, JSON.stringify(guest.body));
    assert.equal(guest.body.sourceType, 'guest');
    assert.equal(guest.body.demoSlot, null);
    assert.ok(guest.body.profileId.startsWith('guest-'));

    // Un invitado no ocupa slot y no aparece en el catálogo, pero puede leerlo.
    const profiles = await listProfiles(guest.body.token, 'co');
    assert.equal(profiles.status, 200);
    assert.equal(profiles.body.profiles.length, 10);
    assert.equal(
      profiles.body.profiles.some((profile) => profile.profileId === guest.body.profileId),
      false,
    );
  });

  test('al liberar las sesiones, el slot vuelve a estar disponible', async () => {
    await deleteSessionsCreatedSince(snapshot);
    const response = await openSession({ regionKey: 'co', demoSlot: 1 });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.demoSlot, 1);
  });

  test('un token cuya sesión ya no existe responde 401', async () => {
    const session = await openSession({ regionKey: 'mx' });
    assert.equal(session.status, 201);
    await deleteSessionsCreatedSince(snapshot);
    const profiles = await listProfiles(session.body.token, 'mx');
    assert.equal(profiles.status, 401);
    assert.equal(profiles.body.code, 'UNAUTHENTICATED');
  });
});
