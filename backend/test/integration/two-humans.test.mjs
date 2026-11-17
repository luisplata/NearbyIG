import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  assertStackUp,
  createPing,
  deletePingsOf,
  deleteSessionsCreatedSince,
  extendPresence,
  listDiscovery,
  listMatches,
  listMessages,
  listNotifications,
  listPings,
  maxEventSeq,
  openSession,
  pollEvents,
  sendMessage,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
} from '../helpers.mjs';

/**
 * El recorrido completo con **dos personas reales**: descubrirse, ping, aceptar,
 * match y chat. Es el guion de la demo después de `remove-bots`: con dos
 * dispositivos conectados la densidad es la que hay, y todo lo que se promete
 * tiene que cerrar sin relleno sintético.
 *
 * Lo que fija este archivo:
 *
 *  - cada uno ve exactamente una fila en discovery: la del otro, y las dos son
 *    `sourceType: 'human'` (no hay bots que completar);
 *  - `A` pinguea a `B`, `B` acepta y nace **un** match que los dos ven;
 *  - el chat funciona en las dos direcciones y la bandeja de cada lado cuenta lo
 *    que el otro mandó;
 *  - las notificaciones llegan a los dos: `ping.received`/`message.created` al
 *    destinatario y `match.created` al emisor del ping;
 *  - ninguna superficie devuelve una coordenada.
 */

const REGION = 'mx';
const ANCHOR = { lat: 19.44, lng: -99.127297 };
const NEAR = { lat: 19.435, lng: -99.12 };
const GEOMETRY = /"(?:lat|lng|lon|latitude|longitude|point|center|position)"/i;

describe('dos humanos: de discovery a chat sin relleno', () => {
  let snapshot = [];
  let a;
  let b;
  let matchId;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const first = await openSession({ regionKey: REGION, demoSlot: 3 });
    const second = await openSession({ regionKey: REGION, demoSlot: 4 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    a = { ...first.body, sessionId: sessionIdOf(first.body.token) };
    b = { ...second.body, sessionId: sessionIdOf(second.body.token) };

    // Un run abortado puede dejar el par con pings/matches del escenario.
    await deletePingsOf(REGION, [a.profileId, b.profileId]);

    assert.equal((await updatePresence(a.token, { point: ANCHOR })).status, 200);
    assert.equal((await updatePresence(b.token, { point: NEAR })).status, 200);
    await extendPresence([a.sessionId, b.sessionId], 600);
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('se descubren mutuamente: una fila cada uno, el otro y nadie más', async () => {
    const forA = await listDiscovery(a.token);
    assert.equal(forA.status, 200, JSON.stringify(forA.body));
    assert.deepEqual(
      forA.body.results.map((row) => row.profileId),
      [b.profileId],
      'A no ve exactamente a B',
    );

    const forB = await listDiscovery(b.token);
    assert.equal(forB.status, 200, JSON.stringify(forB.body));
    assert.deepEqual(
      forB.body.results.map((row) => row.profileId),
      [a.profileId],
      'B no ve exactamente a A',
    );

    for (const page of [forA, forB]) {
      for (const row of page.body.results) {
        assert.equal(row.sourceType, 'human', 'una fila del descubrimiento no es un humano');
        assert.equal(row.regionKey, REGION);
      }
      assert.doesNotMatch(JSON.stringify(page.body), GEOMETRY, 'discovery devolvió geometría');
    }
  });

  test('el ping llega a la bandeja y a la campana del destinatario', async () => {
    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    assert.equal(ping.body.status, 'pending', 'un ping a un humano no se acepta solo');
    assert.equal(ping.body.matchId, null);

    const inbox = await listPings(b.token, 'inbox');
    assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
    const item = inbox.body.pings.find((entry) => entry.ping.id === ping.body.id);
    assert.ok(item, 'el ping no está en el inbox de B');
    assert.equal(item.peer.profileId, a.profileId);
    assert.equal(item.peer.sourceType, 'human');
    assert.doesNotMatch(JSON.stringify(inbox.body), GEOMETRY, 'la bandeja de pings devolvió geometría');

    const bell = await listNotifications(b.token);
    assert.equal(bell.status, 200, JSON.stringify(bell.body));
    const received = bell.body.notifications.find((entry) => entry.kind === 'ping.received');
    assert.ok(received, 'el ping no dejó notificación en la campana de B');
    assert.equal(received.pingId, ping.body.id);
    assert.equal(received.peer.profileId, a.profileId);
    assert.equal(received.peer.sourceType, 'human');
    assert.doesNotMatch(JSON.stringify(bell.body), GEOMETRY, 'la campana devolvió geometría');

    matchId = null;
    const accepted = await acceptPing(b.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    matchId = accepted.body.id;
    assert.deepEqual(accepted.body.profileIds, [a.profileId, b.profileId].sort());

    // El emisor se entera por su bandeja de enviados y por la campana.
    const sent = await listPings(a.token, 'sent');
    const sentItem = sent.body.pings.find((entry) => entry.ping.id === ping.body.id);
    assert.equal(sentItem.ping.status, 'accepted');
    assert.equal(sentItem.ping.matchId, matchId);

    const created = await waitFor(
      async () => {
        const list = await listNotifications(a.token);
        return list.body.notifications.find((entry) => entry.kind === 'match.created') ?? null;
      },
      { label: 'el match.created en la campana de A' },
    );
    assert.equal(created.matchId, matchId);
    assert.equal(created.peer.profileId, b.profileId);
  });

  test('el match aparece en las dos bandejas de chat, con el peer humano', async () => {
    assert.equal(typeof matchId, 'string', 'el test anterior no dejó match');

    for (const [session, peer] of [
      [a, b],
      [b, a],
    ]) {
      const response = await listMatches(session.token);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const item = response.body.matches.find((entry) => entry.match.id === matchId);
      assert.ok(item, `${session.profileId} no ve el match`);
      assert.equal(item.peer.profileId, peer.profileId);
      assert.equal(item.peer.sourceType, 'human');
      assert.doesNotMatch(JSON.stringify(response.body), GEOMETRY, 'la bandeja del chat devolvió geometría');
    }
  });

  test('el chat va y vuelve, y el mensaje deja notificación al otro lado', async () => {
    const cursor = `${REGION}:${String(await maxEventSeq(REGION)).padStart(12, '0')}`;

    const fromA = await sendMessage(a.token, matchId, {
      clientMessageId: 'two-humans-1',
      body: 'hola, soy la otra persona',
    });
    assert.equal(fromA.status, 201, JSON.stringify(fromA.body));
    assert.equal(fromA.body.senderProfileId, a.profileId);

    const fromB = await sendMessage(b.token, matchId, {
      clientMessageId: 'two-humans-2',
      body: 'hola, te veo en el radar',
    });
    assert.equal(fromB.status, 201, JSON.stringify(fromB.body));

    const page = await listMessages(a.token, matchId);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(
      page.body.messages.map((message) => message.body),
      ['hola, soy la otra persona', 'hola, te veo en el radar'],
      'la conversación no está en orden cronológico',
    );
    assert.doesNotMatch(JSON.stringify(page.body), GEOMETRY, 'los mensajes llevan geometría');

    const bell = await waitFor(
      async () => {
        const list = await listNotifications(a.token);
        return list.body.notifications.find((entry) => entry.kind === 'message.created') ?? null;
      },
      { label: 'la notificación del mensaje de B' },
    );
    assert.equal(bell.matchId, matchId);
    assert.equal(bell.messageId, fromB.body.id);
    assert.equal(bell.peer.profileId, b.profileId);

    // El `message.created` también llega por el stream, y a un tercero no.
    const stream = await waitFor(
      async () => {
        const response = await pollEvents(a.token, { cursor, limit: 100 });
        return response.body.events.find(
          (event) => event.type === 'message.created' && event.payload.messageId === fromB.body.id,
        ) ?? null;
      },
      { label: 'el message.created en el stream de A' },
    );
    assert.equal(stream.payload.matchId, matchId);
    assert.deepEqual(
      Object.keys(stream.payload).sort(),
      ['matchId', 'messageId', 'senderProfileId'],
      'el evento del chat no declara exactamente los tres campos',
    );
  });
});
