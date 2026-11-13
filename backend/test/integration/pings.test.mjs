import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  assertStackUp,
  countMatchesOf,
  createPing,
  deletePingsOf,
  deleteSessionsCreatedSince,
  expirePing,
  extendPresence,
  listPings,
  logout,
  openSession,
  rejectPing,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
  withDb,
} from '../helpers.mjs';

/**
 * Pings y matches — Sprint 4.
 *
 * Lo que fija este archivo, que es exactamente el flujo que la demo promete:
 *
 *  - `A` pinguea a `B` y el ping aparece en la bandeja de los dos con la
 *    proyección del otro perfil y sin una sola coordenada;
 *  - el segundo ping del mismo par dirigido es `409 PING_DUPLICATE`;
 *  - `B` acepta y nace **un** `Match` por par, que los dos ven (`A` por
 *    `Ping.matchId` en su bandeja de enviados, `B` por el `200` y su inbox);
 *  - aceptar dos veces es `409 PING_RESOLVED` y no crea un segundo match;
 *  - rechazar es `204`, no crea match y se ve como `rejected`;
 *  - un ping a un bot vuelve ya `accepted` con `matchId`: el bot acepta solo;
 *  - errores: auto-ping, destino inexistente o de otra región, ping ajeno,
 *    `pingId` malformado, inexistente, vencido, y `box` inválido;
 *  - el ping vencido es `410 PING_EXPIRED` tanto al resolverlo como al volver a
 *    mandarlo, y queda `expired` en la bandeja.
 *
 * Aislamiento: se abren dos sesiones del catálogo `mx` y al terminar se borran
 * sus pings y matches, además de las sesiones creadas. El resto de la base no se
 * toca.
 */

const REGION = 'mx';

/** Las 7 claves de `Ping`: adicionales o faltantes son un contrato roto. */
const PING_FIELDS = [
  'createdAt',
  'expiresAt',
  'fromProfileId',
  'id',
  'matchId',
  'status',
  'toProfileId',
];

const PEER_FIELDS = ['initials', 'intention', 'nickname', 'photoId', 'profileId', 'sourceType'];

const listOf = (body) => {
  assert.deepEqual(Object.keys(body), ['pings'], 'PingList es un objeto con array adentro');
  return body.pings;
};

const findPing = (pings, pingId) => pings.find((item) => item.ping.id === pingId);

const matchCount = (first, second) => countMatchesOf(REGION, first, second);

describe('pings y matches', () => {
  let snapshot = [];
  let a;
  let b;
  /** Perfiles del escenario, incluidos los dos bots de `b`. */
  let scenarioProfiles = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();

    const first = await openSession({ regionKey: REGION, demoSlot: 9 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await openSession({ regionKey: REGION, demoSlot: 10 });
    assert.equal(second.status, 201, JSON.stringify(second.body));

    a = { token: first.body.token, profileId: first.body.profileId, sessionId: sessionIdOf(first.body.token) };
    b = { token: second.body.token, profileId: second.body.profileId, sessionId: sessionIdOf(second.body.token) };
    scenarioProfiles = [a.profileId, b.profileId, `${b.profileId}-b1`, `${b.profileId}-b2`];
    // Un run anterior que falló a mitad de camino puede dejar pings del
    // escenario: se limpian para que el conteo de matches no arrastre basura.
    await deletePingsOf(REGION, scenarioProfiles);

    // Un punto real dentro de CDMX: sin presencia no hay bots que pinguear.
    const presence = await updatePresence(b.token, { demoZoneKey: 'cdmx' });
    assert.equal(presence.status, 200, JSON.stringify(presence.body));
    await extendPresence([b.sessionId, a.sessionId], 180);
  });

  after(async () => {
    await deletePingsOf(REGION, scenarioProfiles);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('A pinguea a B: el ping queda pendiente y los dos lo ven en su bandeja', async () => {
    const created = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(Object.keys(created.body).sort(), PING_FIELDS, 'Ping declara exactamente 7 campos');
    assert.equal(created.body.fromProfileId, a.profileId);
    assert.equal(created.body.toProfileId, b.profileId);
    assert.equal(created.body.status, 'pending');
    assert.equal(created.body.matchId, null);
    assert.match(created.body.id, /^[0-9a-f-]{36}$/i);
    assert.ok(Date.parse(created.body.expiresAt) > Date.parse(created.body.createdAt));

    const inbox = await listPings(b.token, 'inbox');
    assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
    const inboxItem = findPing(listOf(inbox.body), created.body.id);
    assert.ok(inboxItem !== undefined, 'el ping está en el inbox del destinatario');
    assert.deepEqual(Object.keys(inboxItem).sort(), ['peer', 'ping'], 'PingListItem es { ping, peer }');
    assert.deepEqual(Object.keys(inboxItem.peer).sort(), PEER_FIELDS);
    assert.equal(inboxItem.peer.profileId, a.profileId, 'el peer del inbox es quien lo mandó');
    assert.equal(typeof inboxItem.peer.nickname, 'string');
    assert.equal(typeof inboxItem.peer.photoId, 'string');
    assert.equal(inboxItem.peer.sourceType, 'human');
    assert.equal(JSON.stringify(inboxItem).includes('lat'), false, 'sin coordenadas en la bandeja');
    assert.equal(JSON.stringify(inboxItem).includes('lng'), false, 'sin coordenadas en la bandeja');

    const sent = await listPings(a.token, 'sent');
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const sentItem = findPing(listOf(sent.body), created.body.id);
    assert.ok(sentItem !== undefined, 'el ping está en la bandeja de enviados del emisor');
    assert.equal(sentItem.peer.profileId, b.profileId, 'el peer de sent es el destinatario');

    // El test deja el par libre: el resto del archivo es un escenario, no una
    // cadena de pendientes que se bloquean entre sí.
    assert.equal((await rejectPing(b.token, created.body.id)).status, 204);
  });

  test('el segundo ping del mismo par dirigido es 409 PING_DUPLICATE', async () => {
    const first = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const duplicate = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
    assert.equal(duplicate.body.code, 'PING_DUPLICATE');

    // El otro sentido es otro ping: B → A no choca con A → B.
    const reverse = await createPing(b.token, { targetProfileId: a.profileId });
    assert.equal(reverse.status, 201, JSON.stringify(reverse.body));
    assert.equal(reverse.body.status, 'pending');

    // Se limpian los dos pendientes: el de A → B lo rechaza B y el de B → A lo
    // rechaza A. Así el resto del archivo arranca sin pendientes del par.
    assert.equal((await rejectPing(b.token, first.body.id)).status, 204);
    assert.equal((await rejectPing(a.token, reverse.body.id)).status, 204);
  });

  test('B acepta: nace un Match que los dos ven y repetirlo es 409', async () => {
    const created = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(await matchCount(a.profileId, b.profileId), 0, 'todavía no hay match');

    const accepted = await acceptPing(b.token, created.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.deepEqual(Object.keys(accepted.body).sort(), ['createdAt', 'id', 'profileIds']);
    assert.deepEqual(
      accepted.body.profileIds,
      [a.profileId, b.profileId].sort(),
      'profileIds viene ordenado, no [yo, el otro]',
    );
    assert.match(accepted.body.id, /^[0-9a-f-]{36}$/i);
    assert.equal(await matchCount(a.profileId, b.profileId), 1, 'un match por par');

    // A no recibió el 200: lo ve en su bandeja de enviados, con el matchId.
    const sent = findPing(listOf((await listPings(a.token, 'sent')).body), created.body.id);
    assert.equal(sent.ping.status, 'accepted');
    assert.equal(sent.ping.matchId, accepted.body.id, 'el emisor descubre el match por matchId');

    const inbox = findPing(listOf((await listPings(b.token, 'inbox')).body), created.body.id);
    assert.equal(inbox.ping.status, 'accepted');
    assert.equal(inbox.ping.matchId, accepted.body.id);

    const again = await acceptPing(b.token, created.body.id);
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.code, 'PING_RESOLVED');
    assert.equal(await matchCount(a.profileId, b.profileId), 1, 'aceptar dos veces no duplica el match');
  });

  test('rechazar es 204, no crea match y no se puede repetir', async () => {
    const created = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const rejected = await rejectPing(b.token, created.body.id);
    assert.equal(rejected.status, 204, JSON.stringify(rejected.body));
    assert.equal(rejected.body, null, '204 sin body');

    const sent = findPing(listOf((await listPings(a.token, 'sent')).body), created.body.id);
    assert.equal(sent.ping.status, 'rejected');
    assert.equal(sent.ping.matchId, null, 'rechazar no crea match');

    const again = await rejectPing(b.token, created.body.id);
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.code, 'PING_RESOLVED');

    const acceptedAfter = await acceptPing(b.token, created.body.id);
    assert.equal(acceptedAfter.status, 409, 'un ping rechazado no se puede aceptar después');
    assert.equal(acceptedAfter.body.code, 'PING_RESOLVED');
  });

  test('un ping a un bot vuelve aceptado: el bot acepta solo y hay match', async () => {
    const botId = await waitFor(
      async () => {
        const { rows } = await withDb((client) =>
          client.query(
            `SELECT bot_profile_id
               FROM bots
              WHERE region_key = $1 AND owner_profile_id = $2
              ORDER BY bot_profile_id`,
            [REGION, b.profileId],
          ),
        );
        return rows.length === 2 ? rows[0].bot_profile_id : null;
      },
      { label: `los 2 bots de ${b.profileId}` },
    );
    await extendPresence([b.sessionId], 180);

    const created = await createPing(a.token, { targetProfileId: botId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, 'accepted', 'el bot acepta en la misma transacción');
    assert.notEqual(created.body.matchId, null, 'y deja el matchId');
    assert.equal(await matchCount(a.profileId, botId), 1);

    const sent = findPing(listOf((await listPings(a.token, 'sent')).body), created.body.id);
    assert.equal(sent.peer.profileId, botId);
    assert.equal(sent.peer.sourceType, 'bot', 'el peer de un bot se distingue por sourceType');
    assert.equal(typeof sent.peer.nickname, 'string', 'el bot hereda la proyección de su dueño');
    assert.equal(sent.ping.status, 'accepted');
  });

  test('errores: auto-ping, destino inexistente o de otra región, ping ajeno y box inválido', async () => {
    const self = await createPing(a.token, { targetProfileId: a.profileId });
    assert.equal(self.status, 422, JSON.stringify(self.body));
    assert.equal(self.body.code, 'VALIDATION_FAILED');

    const unknown = await createPing(a.token, { targetProfileId: `${REGION}-nadie` });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    assert.equal(unknown.body.code, 'PROFILE_NOT_FOUND');

    // Un perfil real, pero de la otra región: el ping no cruza regiones.
    const otherRegion = await createPing(a.token, { targetProfileId: 'co-p01' });
    assert.equal(otherRegion.status, 404, JSON.stringify(otherRegion.body));
    assert.equal(otherRegion.body.code, 'PROFILE_NOT_FOUND');

    const noBody = await createPing(a.token, {});
    assert.equal(noBody.status, 422, JSON.stringify(noBody.body));
    assert.equal(noBody.body.code, 'VALIDATION_FAILED');

    const extraField = await createPing(a.token, { targetProfileId: b.profileId, message: 'hola' });
    assert.equal(extraField.status, 422, 'PingCreate cierra con additionalProperties: false');

    const invalidBox = await listPings(a.token, 'spam');
    assert.equal(invalidBox.status, 422, JSON.stringify(invalidBox.body));
    assert.equal(invalidBox.body.code, 'VALIDATION_FAILED');

    const missingBox = await listPings(a.token);
    assert.equal(missingBox.status, 422, 'box es obligatorio');

    const malformed = await acceptPing(b.token, 'no-es-un-uuid');
    assert.equal(malformed.status, 422, JSON.stringify(malformed.body));
    assert.equal(malformed.body.code, 'VALIDATION_FAILED');

    const missingPing = await acceptPing(b.token, '00000000-0000-4000-8000-000000000000');
    assert.equal(missingPing.status, 404, JSON.stringify(missingPing.body));
    assert.equal(missingPing.body.code, 'PING_NOT_FOUND');

    const anonymous = await listPings(undefined, 'inbox');
    assert.equal(anonymous.status, 401);

    // El emisor no puede resolver su propio ping: sólo el destinatario.
    const own = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    const notRecipient = await acceptPing(a.token, own.body.id);
    assert.equal(notRecipient.status, 403, JSON.stringify(notRecipient.body));
    assert.equal(notRecipient.body.code, 'PING_FORBIDDEN');
    assert.equal((await rejectPing(a.token, own.body.id)).status, 403);
    assert.equal((await rejectPing(b.token, own.body.id)).status, 204, 'el destinatario sí puede');
  });

  test('un ping vencido es 410 al resolverlo y al reenviarlo, y queda expired', async () => {
    const first = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    await expirePing(first.body.id);

    const late = await acceptPing(b.token, first.body.id);
    assert.equal(late.status, 410, JSON.stringify(late.body));
    assert.equal(late.body.code, 'PING_EXPIRED');
    assert.equal(await matchCount(a.profileId, b.profileId), 1, 'un vencido no crea un segundo match');

    const inbox = findPing(listOf((await listPings(b.token, 'inbox')).body), first.body.id);
    assert.equal(inbox.ping.status, 'expired', 'el vencimiento se ve en la bandeja');

    // El par quedó libre: un pendiente vencido no bloquea el próximo envío...
    const second = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(second.status, 201, JSON.stringify(second.body));

    // ...pero si el nuevo pendiente también venció, el envío siguiente es 410 y
    // lo cierra. Reintentar después sí crea uno nuevo.
    await expirePing(second.body.id);
    const stale = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(stale.status, 410, JSON.stringify(stale.body));
    assert.equal(stale.body.code, 'PING_EXPIRED');

    const third = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(third.status, 201, JSON.stringify(third.body));
    assert.equal((await rejectPing(b.token, third.body.id)).status, 204);
  });

  test('cerrar la sesión del destinatario no borra su bandeja', async () => {
    const created = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    // La bandeja es del perfil, no de la sesión: un logout no vacía el inbox.
    assert.equal((await logout(b.token)).status, 204);
    const still = findPing(listOf((await listPings(a.token, 'sent')).body), created.body.id);
    assert.equal(still.ping.status, 'pending', 'el ping sigue en la bandeja del emisor');
  });
});
