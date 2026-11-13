import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  activeSlots,
  api,
  assertStackUp,
  createStreamTicket,
  deleteSessionsCreatedSince,
  listProfiles,
  logout,
  openSession,
  sessionIdOf,
  sessionRow,
  snapshotSessionIds,
  streamTicketsOf,
  takeover,
} from '../helpers.mjs';

const SESSION_FIELDS = ['demoSlot', 'expiresAt', 'profileId', 'regionKey', 'sourceType', 'token'];

/**
 * `POST /auth/takeover` — contrato v0.2.
 *
 * Lo que fija este archivo es el desalojo **real**, no la forma (eso lo congela
 * `contract/test/takeover-contract.test.mjs`):
 *
 *  - el ocupante anterior pierde la sesión en el acto: su token da 401 y sus
 *    tickets de stream ya no existen;
 *  - el nuevo ocupa el slot, y `ProfileSummary.inUse` lo refleja;
 *  - un slot libre también es 200 (la postcondición es "ocupás el slot");
 *  - el takeover de la propia sesión es 409 y **no** toca el token en uso;
 *  - no cruza regiones: 403 y el ocupante de la otra región sigue vivo;
 *  - un invitado deja de serlo y su sesión de relleno se revoca.
 *
 * Cada test usa slots explícitos y distintos para no depender del orden: el
 * suite corre contra la base real y `deleteSessionsCreatedSince` limpia sólo lo
 * que este archivo creó.
 */
describe('POST /auth/takeover', () => {
  let snapshot = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
  });

  test('sin token responde 401 UNAUTHENTICATED', async () => {
    const response = await api('/auth/takeover', {
      method: 'POST',
      body: { regionKey: 'mx', demoSlot: 1 },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHENTICATED');
  });

  test('el body exige regionKey y demoSlot, y no admite campos extra', async () => {
    const session = await openSession({ regionKey: 'mx', demoSlot: 1 });
    assert.equal(session.status, 201, JSON.stringify(session.body));

    const cases = [
      { body: {}, label: 'sin campos' },
      { body: { regionKey: 'mx' }, label: 'sin demoSlot' },
      { body: { demoSlot: 2 }, label: 'sin regionKey' },
      { body: { regionKey: 'mx', demoSlot: 0 }, label: 'slot 0' },
      { body: { regionKey: 'mx', demoSlot: 11 }, label: 'slot 11' },
      { body: { regionKey: 'mx', demoSlot: 1.5 }, label: 'slot fraccionario' },
      { body: { regionKey: 'mx', demoSlot: '3' }, label: 'slot string' },
      { body: { regionKey: 'MX', demoSlot: 3 }, label: 'región en mayúsculas' },
      { body: { regionKey: 'mx', demoSlot: 3, force: true }, label: 'campo desconocido' },
    ];

    for (const { body, label } of cases) {
      const response = await takeover(session.body.token, body);
      assert.equal(response.status, 422, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED', label);
    }

    // Libera el slot para que el resto del archivo no dependa de este test.
    assert.equal((await logout(session.body.token)).status, 204);
  });

  test('desaloja al ocupante: su token deja de servir y los tickets se queman', async () => {
    const occupant = await openSession({ regionKey: 'mx', demoSlot: 4 });
    assert.equal(occupant.status, 201, JSON.stringify(occupant.body));
    const actor = await openSession({ regionKey: 'mx', demoSlot: 1 });
    assert.equal(actor.status, 201, JSON.stringify(actor.body));

    const occupantId = sessionIdOf(occupant.body.token);
    const ticket = await createStreamTicket(occupant.body.token);
    assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
    assert.equal((await streamTicketsOf(occupantId)).length, 1);

    const response = await takeover(actor.body.token, { regionKey: 'mx', demoSlot: 4 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(Object.keys(response.body).sort(), SESSION_FIELDS);
    assert.equal(response.body.regionKey, 'mx');
    assert.equal(response.body.demoSlot, 4);
    assert.equal(response.body.sourceType, 'human');
    assert.notEqual(response.body.token, occupant.body.token);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    // El desalojo es de DB, no de firma: el JWT del ocupante sigue siendo
    // criptográficamente válido y el guard lo rechaza igual.
    const displaced = await sessionRow(occupantId);
    assert.notEqual(displaced.revoked_at, null, 'el ocupante quedó revocado en el acto');
    assert.deepEqual(await streamTicketsOf(occupantId), [], 'los tickets del desalojado se borraron');

    const oldToken = await listProfiles(occupant.body.token, 'mx');
    assert.equal(oldToken.status, 401);
    assert.equal(oldToken.body.code, 'UNAUTHENTICATED');

    // El token nuevo sí sirve, y `inUse` refleja el nuevo ocupante.
    const fresh = await listProfiles(response.body.token, 'mx');
    assert.equal(fresh.status, 200);
    const slot4 = fresh.body.profiles.find((profile) => profile.demoSlot === 4);
    assert.equal(slot4.inUse, true);
    assert.equal(slot4.profileId, response.body.profileId);
  });

  test('sobre un slot libre responde 200 y libera el slot anterior del que llama', async () => {
    const actor = await openSession({ regionKey: 'mx', demoSlot: 2 });
    assert.equal(actor.status, 201, JSON.stringify(actor.body));

    const response = await takeover(actor.body.token, { regionKey: 'mx', demoSlot: 6 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.demoSlot, 6);

    const slots = await activeSlots('mx');
    assert.equal(slots.includes(6), true, 'el slot pedido quedó ocupado');
    assert.equal(slots.includes(2), false, 'el slot anterior del que llama se liberó');
    assert.equal((await listProfiles(actor.body.token, 'mx')).status, 401);
  });

  test('de la propia sesión responde 409 PROFILE_IN_USE y conserva el token', async () => {
    const session = await openSession({ regionKey: 'mx', demoSlot: 7 });
    assert.equal(session.status, 201, JSON.stringify(session.body));

    const response = await takeover(session.body.token, { regionKey: 'mx', demoSlot: 7 });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.code, 'PROFILE_IN_USE');

    // No hay desalojo ni renovación: el token que el cliente está usando sigue
    // sirviendo y su slot sigue siendo suyo.
    const stillMine = await listProfiles(session.body.token, 'mx');
    assert.equal(stillMine.status, 200);
    assert.equal(stillMine.body.profiles.find((profile) => profile.demoSlot === 7).inUse, true);
  });

  test('no cruza regiones: 403 y el ocupante de la otra región sigue vivo', async () => {
    const mxOccupant = await openSession({ regionKey: 'mx', demoSlot: 8 });
    assert.equal(mxOccupant.status, 201, JSON.stringify(mxOccupant.body));
    const coSession = await openSession({ regionKey: 'co', demoSlot: 1 });
    assert.equal(coSession.status, 201, JSON.stringify(coSession.body));

    const response = await takeover(coSession.body.token, { regionKey: 'mx', demoSlot: 8 });
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(response.body.code, 'REGION_MISMATCH');

    const untouched = await listProfiles(mxOccupant.body.token, 'mx');
    assert.equal(untouched.status, 200, 'el takeover ajeno no desalojó a nadie');
    assert.equal(untouched.body.profiles.find((profile) => profile.demoSlot === 8).inUse, true);
    // Y la sesión que lo intentó tampoco perdió la suya.
    assert.equal((await listProfiles(coSession.body.token, 'co')).status, 200);
  });

  test('un invitado deja de serlo y su sesión de relleno se revoca', async () => {
    // Este test llena `co` entero, por eso va último: deja 10 slots vivos.
    for (let demoSlot = 1; demoSlot <= 10; demoSlot += 1) {
      const claimed = await openSession({ regionKey: 'co', demoSlot });
      assert.ok([201, 409].includes(claimed.status), `slot co ${demoSlot}: ${claimed.status}`);
    }

    const guest = await openSession({ regionKey: 'co' });
    assert.equal(guest.status, 201, JSON.stringify(guest.body));
    assert.equal(guest.body.sourceType, 'guest');
    assert.equal(guest.body.demoSlot, null);

    const guestId = sessionIdOf(guest.body.token);
    const response = await takeover(guest.body.token, { regionKey: 'co', demoSlot: 10 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.sourceType, 'human');
    assert.equal(response.body.demoSlot, 10);

    const revokedGuest = await sessionRow(guestId);
    assert.notEqual(revokedGuest.revoked_at, null, 'la sesión de invitado no queda viva');
    assert.equal((await listProfiles(guest.body.token, 'co')).status, 401);
    assert.equal((await listProfiles(response.body.token, 'co')).status, 200);
  });
});
