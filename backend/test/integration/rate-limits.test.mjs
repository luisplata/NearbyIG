import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  assertStackUp,
  createPing,
  deletePingsOf,
  deleteSessionsCreatedSince,
  listDiscovery,
  openSession,
  sendMessage,
  snapshotSessionIds,
  updatePresence,
  withDb,
} from '../helpers.mjs';

/**
 * Rate limits de S7 — los tres que la demo declara y que hasta S7 sólo existían
 * en el código:
 *
 * | Clase | Tope | Dónde vive el contador |
 * |---|---|---|
 * | pings | 30 / 60 s por perfil | filas de `pings` (el hecho que se limita) |
 * | mensajes | 60 / 60 s por perfil | filas de `messages` |
 * | discovery | 2 / s por sesión, ráfaga 20 | bucket en memoria (S7) |
 *
 * Los tres se prueban **por HTTP y hasta el 429**, no mirando la constante: un
 * límite que no se ejerce es una promesa, no un límite. La respuesta tiene que
 * ser `429 RATE_LIMITED` —el `code` del contrato— para que el cliente sepa qué
 * hacer sin parsear el texto.
 *
 * **El aceptador es humano.** Antes el límite de pings se probaba contra el bot
 * propio, que aceptaba solo y dejaba el par libre sin más. Sin población
 * sintética, el aceptador es una segunda sesión real: acepta cada ping y así
 * cada envío cuenta como hecho sin quedar `pending`.
 *
 * Aislamiento: región `co` y slots 6–9, que ningún otro archivo usa, y limpieza
 * de todo lo creado al final. El bucket de discovery es por `sessionId`, así que
 * no puede contaminar otras suites.
 */

const REGION = 'co';
const ZONE = 'bogota';

let snapshot = [];
const opened = [];
/** El aceptador humano: una sola sesión para las dos pruebas de escritura. */
let acceptor;

async function openAt(slot) {
  const response = await openSession({ regionKey: REGION, demoSlot: slot });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const session = response.body;
  opened.push(session);
  const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
  assert.equal(presence.status, 200, JSON.stringify(presence.body));
  return session;
}

describe('rate limits: 429 RATE_LIMITED con el code del contrato', () => {
  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    acceptor = await openAt(6);
  });

  after(async () => {
    const profileIds = opened.map((session) => session.profileId);
    if (profileIds.length > 0) {
      await deletePingsOf(REGION, profileIds);
      await withDb(async (client) => {
        await client.query('DELETE FROM messages WHERE sender_profile_id = ANY($1::text[])', [
          profileIds,
        ]);
        await client.query(
          'DELETE FROM notifications WHERE recipient_profile_id = ANY($1::text[])',
          [profileIds],
        );
      });
    }
    await deleteSessionsCreatedSince(snapshot);
  });

  test('discovery: la ráfaga se agota y el 429 no es permanente', async () => {
    const session = await openAt(7);

    const statuses = [];
    for (let index = 0; index < 65; index += 1) {
      const response = await listDiscovery(session.token);
      statuses.push(response.status);
      if (response.status === 429) {
        assert.equal(response.body.code, 'RATE_LIMITED');
        assert.equal(response.body.status, 429);
        assert.match(response.body.detail, /Reintentá en \d+ ms/);
      }
    }

    const accepted = statuses.filter((status) => status === 200).length;
    const refused = statuses.filter((status) => status === 429).length;
    assert.equal(
      accepted + refused,
      statuses.length,
      `status inesperado: ${[...new Set(statuses)].join(', ')}`,
    );
    assert.ok(accepted >= 60, `la ráfaga inicial aceptó sólo ${accepted}`);
    assert.ok(refused > 0, 'el límite no se ejerció: 65 consultas seguidas dieron todas 200');

    // El rechazo es temporal: 600 ms de recarga alcanzan para el token siguiente.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const afterRefill = await listDiscovery(session.token);
    assert.equal(afterRefill.status, 200, JSON.stringify(afterRefill.body));
  });

  test('pings: el envío 31 del minuto es 429', async () => {
    const session = await openAt(8);
    // El aceptador humano cierra cada ping: es el mismo camino que la demo y
    // deja el par libre para el envío siguiente.

    for (let index = 1; index <= 30; index += 1) {
      const response = await createPing(session.token, { targetProfileId: acceptor.profileId });
      assert.equal(response.status, 201, `ping ${index}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.status, 'pending', `ping ${index}: un humano no acepta solo`);
      const accepted = await acceptPing(acceptor.token, response.body.id);
      assert.equal(accepted.status, 200, `accept ${index}: ${JSON.stringify(accepted.body)}`);
    }

    const refused = await createPing(session.token, { targetProfileId: acceptor.profileId });
    assert.equal(refused.status, 429, JSON.stringify(refused.body));
    assert.equal(refused.body.code, 'RATE_LIMITED');
    assert.equal(refused.body.status, 429);
    assert.match(refused.body.detail, /30 pings por minuto/);
  });

  test('mensajes: el envío 61 del minuto es 429', async () => {
    const session = await openAt(9);
    const ping = await createPing(session.token, { targetProfileId: acceptor.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    const accepted = await acceptPing(acceptor.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const matchId = accepted.body.id;
    assert.equal(typeof matchId, 'string', 'el ping aceptado tiene que producir el match');

    for (let index = 1; index <= 60; index += 1) {
      const response = await sendMessage(session.token, matchId, {
        clientMessageId: `rate-limit-${index}`,
        body: `mensaje ${index}`,
      });
      assert.equal(response.status, 201, `mensaje ${index}: ${JSON.stringify(response.body)}`);
    }

    const refused = await sendMessage(session.token, matchId, {
      clientMessageId: 'rate-limit-61',
      body: 'mensaje 61',
    });
    assert.equal(refused.status, 429, JSON.stringify(refused.body));
    assert.equal(refused.body.code, 'RATE_LIMITED');
    assert.equal(refused.body.status, 429);
    assert.match(refused.body.detail, /60 mensajes por minuto/);
  });
});
