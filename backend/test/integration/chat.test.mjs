import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  assertStackUp,
  createPing,
  deletePingsOf,
  deleteSessionsCreatedSince,
  extendPresence,
  getMe,
  insertMessages,
  listMatches,
  listMessages,
  markMatchRead,
  maxEventSeq,
  messageRowsOf,
  openSession,
  pollEvents,
  sendMessage,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
  withDb,
} from '../helpers.mjs';

/**
 * Chat — Sprint 4, delta v0.4.
 *
 * Lo que fija este archivo, que es el flujo que la demo promete:
 *
 *  - `A` y `B` matchean y los dos ven el match en `GET /matches` con el peer del
 *    otro, `lastMessage: null` y `unreadCount: 0`;
 *  - `A` manda dos mensajes, `B` los lee paginados con cursor, `B` marca leído y
 *    su `unreadCount` baja a 0;
 *  - reintentar el mismo `clientMessageId` **no** duplica;
 *  - el cursor pagina de verdad (dos páginas, sin repetir ni perder filas);
 *  - un ping a un bot → match → mensaje → el bot contesta con texto fijo, el
 *    `message.created` y el `typing.started` llegan por el stream, y dos
 *    respuestas seguidas del bot no repiten texto;
 *  - errores: match ajeno (403), inexistente (404), `matchId` malformado, body
 *    vacío, campo de más y `clientMessageId` ausente (422), sin token (401);
 *  - el aislamiento del stream: un tercero que no es parte del match no recibe
 *    los eventos de esa conversación.
 *
 * Aislamiento: dos sesiones vivas del catálogo `mx` (slots 9 y 10) y una tercera
 * para el aislamiento (slot 8). Al terminar se borran los pings y matches del
 * escenario —el borrado del match cae en cascada sobre mensajes y acuses— y las
 * sesiones creadas.
 */

const REGION = 'mx';

/** Las 6 claves de `Message`: adicionales o faltantes son un contrato roto. */
const MESSAGE_FIELDS = ['body', 'clientMessageId', 'createdAt', 'id', 'matchId', 'senderProfileId'];

const PEER_FIELDS = ['initials', 'intention', 'nickname', 'photoId', 'profileId', 'sourceType'];

const matchesOf = (body) => {
  assert.deepEqual(Object.keys(body), ['matches'], 'MatchList es un objeto con array adentro');
  return body.matches;
};

const only = (matches, matchId) => matches.filter((item) => item.match.id === matchId);

describe('chat de un match', () => {
  let snapshot = [];
  let a;
  let b;
  let c;
  let scenarioProfiles = [];
  /** El match humano↔humano del escenario. */
  let matchId;

  const send = (token, text, clientMessageId) =>
    sendMessage(token, matchId, { clientMessageId: clientMessageId ?? `cm-${text}`, body: text });

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();

    const first = await openSession({ regionKey: REGION, demoSlot: 9 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await openSession({ regionKey: REGION, demoSlot: 10 });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const third = await openSession({ regionKey: REGION, demoSlot: 8 });
    assert.equal(third.status, 201, JSON.stringify(third.body));

    a = { token: first.body.token, profileId: first.body.profileId, sessionId: sessionIdOf(first.body.token) };
    b = { token: second.body.token, profileId: second.body.profileId, sessionId: sessionIdOf(second.body.token) };
    c = { token: third.body.token, profileId: third.body.profileId, sessionId: sessionIdOf(third.body.token) };
    scenarioProfiles = [a.profileId, b.profileId, c.profileId, `${b.profileId}-b1`, `${b.profileId}-b2`];

    // Un run abortado puede dejar pings/matches del escenario: se limpian para
    // que el conteo de matches no arrastre basura de otra corrida.
    await deletePingsOf(REGION, scenarioProfiles);

    // Un punto real dentro de CDMX: sin presencia no hay bots que pinguear y el
    // bot solo existe con dueño vivo.
    const presence = await updatePresence(b.token, { demoZoneKey: 'cdmx' });
    assert.equal(presence.status, 200, JSON.stringify(presence.body));
    await extendPresence([a.sessionId, b.sessionId, c.sessionId], 240);

    // A pinguea a B y B acepta: el match del escenario, por la API real.
    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    const accepted = await acceptPing(b.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    matchId = accepted.body.id;
  });

  after(async () => {
    // `deletePingsOf` borra pings y matches del escenario: la FK de `messages`
    // cae en cascada con el match, así que la conversación se va con él.
    await deletePingsOf(REGION, scenarioProfiles);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('los dos lados ven el match, con el peer del otro y la conversación vacía', async () => {
    const forA = only(matchesOf((await listMatches(a.token)).body), matchId);
    assert.equal(forA.length, 1, 'A ve su match');
    const itemA = forA[0];
    assert.deepEqual(Object.keys(itemA).sort(), ['lastMessage', 'match', 'peer', 'unreadCount']);
    assert.deepEqual(Object.keys(itemA.peer).sort(), PEER_FIELDS);
    assert.equal(itemA.peer.profileId, b.profileId, 'el peer de A es B, no A');
    assert.equal(itemA.peer.sourceType, 'human');
    assert.equal(itemA.match.id, matchId);
    assert.deepEqual(itemA.match.profileIds, [a.profileId, b.profileId].sort());
    assert.equal(itemA.lastMessage, null, 'un match sin mensajes no tiene preview');
    assert.equal(itemA.unreadCount, 0);
    assert.equal(JSON.stringify(itemA).includes('"lat"'), false, 'sin coordenadas en la bandeja');
    assert.equal(JSON.stringify(itemA).includes('"lng"'), false, 'sin coordenadas en la bandeja');

    const forB = only(matchesOf((await listMatches(b.token)).body), matchId);
    assert.equal(forB[0].peer.profileId, a.profileId, 'el peer de B es A');

    const forC = matchesOf((await listMatches(c.token)).body);
    assert.deepEqual(only(forC, matchId), [], 'un tercero no ve un match del que no es parte');

    const empty = await listMessages(a.token, matchId);
    assert.equal(empty.status, 200, JSON.stringify(empty.body));
    assert.deepEqual(empty.body, { messages: [], nextCursor: null, hasMore: false });
  });

  test('A manda dos mensajes: B los lee en orden, marca leído y el badge baja a 0', async () => {
    const first = await send(a.token, 'hola, qué tal', 'cm-1');
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.deepEqual(Object.keys(first.body).sort(), MESSAGE_FIELDS, 'Message declara exactamente 6 campos');
    assert.equal(first.body.matchId, matchId);
    assert.equal(first.body.senderProfileId, a.profileId);
    assert.equal(first.body.clientMessageId, 'cm-1');
    assert.equal(first.body.body, 'hola, qué tal');
    assert.match(first.body.id, /^[0-9a-f-]{36}$/i);

    const second = await send(a.token, '  ¿nos vemos hoy?  ', 'cm-2');
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.body, '¿nos vemos hoy?', 'el body se recorta en los bordes');

    // B: unread 2 y preview del último.
    const forB = only(matchesOf((await listMatches(b.token)).body), matchId)[0];
    assert.equal(forB.unreadCount, 2, 'los dos mensajes de A están sin leer para B');
    assert.equal(forB.lastMessage.id, second.body.id, 'el preview es el último mensaje');
    assert.equal(forB.lastMessage.body, '¿nos vemos hoy?');

    // A no tiene nada sin leer: sus propios mensajes no cuentan.
    const forA = only(matchesOf((await listMatches(a.token)).body), matchId)[0];
    assert.equal(forA.unreadCount, 0);

    // B lee la conversación: orden cronológico, el más viejo primero.
    const page = await listMessages(b.token, matchId);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(Object.keys(page.body).sort(), ['hasMore', 'messages', 'nextCursor']);
    assert.deepEqual(
      page.body.messages.map((message) => message.id),
      [first.body.id, second.body.id],
      'la página llega en orden cronológico',
    );
    assert.equal(page.body.hasMore, false);
    assert.equal(page.body.nextCursor, null);

    const read = await markMatchRead(b.token, matchId);
    assert.equal(read.status, 204, JSON.stringify(read.body));
    assert.equal(read.body, null, 'el read no devuelve body');

    const afterRead = only(matchesOf((await listMatches(b.token)).body), matchId)[0];
    assert.equal(afterRead.unreadCount, 0, 'marcar leído apaga el badge');

    // Marcar leído dos veces es idempotente por resultado.
    assert.equal((await markMatchRead(b.token, matchId)).status, 204);
    assert.equal(only(matchesOf((await listMatches(b.token)).body), matchId)[0].unreadCount, 0);

    // Un mensaje nuevo de A vuelve a subir el badge a 1.
    const third = await send(a.token, '¿te llegó?', 'cm-3');
    assert.equal(third.status, 201);
    assert.equal(only(matchesOf((await listMatches(b.token)).body), matchId)[0].unreadCount, 1);
    assert.equal((await markMatchRead(b.token, matchId)).status, 204);
  });

  test('el mismo clientMessageId no duplica el mensaje', async () => {
    const countBefore = (await messageRowsOf(matchId)).length;

    const original = await send(a.token, 'reintento', 'cm-duplicado');
    assert.equal(original.status, 201, JSON.stringify(original.body));

    const replay = await send(a.token, 'reintento', 'cm-duplicado');
    assert.equal(replay.status, 201, JSON.stringify(replay.body));
    assert.equal(replay.body.id, original.body.id, 'el reintento devuelve el mismo Message');
    assert.equal(replay.body.createdAt, original.body.createdAt);

    const countAfter = (await messageRowsOf(matchId)).length;
    assert.equal(countAfter, countBefore + 1, 'una sola fila nueva, no dos');

    // El emisor es parte de la clave: B puede usar el mismo clientMessageId en el
    // mismo match sin pisar el de A.
    const fromB = await send(b.token, 'mismo id, otro emisor', 'cm-duplicado');
    assert.equal(fromB.status, 201, JSON.stringify(fromB.body));
    assert.notEqual(fromB.body.id, original.body.id, 'la idempotencia es por emisor');
    assert.equal((await messageRowsOf(matchId)).length, countBefore + 2);
    assert.equal((await markMatchRead(a.token, matchId)).status, 204);
  });

  test('el cursor pagina de verdad: dos páginas sin repetir ni perder filas', async () => {
    // 105 filas nuevas directo en la base: el endpoint tiene rate limit y la
    // página es de 100, así que la segunda sólo tiene 5 + lo que ya había.
    const before = (await messageRowsOf(matchId)).length;
    await insertMessages(
      matchId,
      REGION,
      b.profileId,
      Array.from({ length: 105 }, (_, index) => `pagina-${index}`),
    );

    const firstPage = await listMessages(a.token, matchId);
    assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
    assert.equal(firstPage.body.messages.length, 100, 'la página corta en 100');
    assert.equal(firstPage.body.hasMore, true);
    assert.equal(typeof firstPage.body.nextCursor, 'string');

    const secondPage = await listMessages(a.token, matchId, firstPage.body.nextCursor);
    assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
    assert.equal(secondPage.body.messages.length, before + 5, 'la segunda página trae el resto');
    assert.equal(secondPage.body.hasMore, false);
    assert.equal(secondPage.body.nextCursor, null, 'sin más páginas, no hay cursor que seguir');

    const ids = [...firstPage.body.messages, ...secondPage.body.messages].map((message) => message.id);
    assert.equal(new Set(ids).size, ids.length, 'ninguna fila se repite entre páginas');
    assert.equal(ids.length, before + 105, 'ninguna fila se pierde entre páginas');
  });

  test('errores del chat: ajeno, inexistente, malformado y body inválido', async () => {
    const foreign = await sendMessage(c.token, matchId, { clientMessageId: 'x', body: 'no debería' });
    assert.equal(foreign.status, 403, JSON.stringify(foreign.body));
    assert.equal(foreign.body.code, 'CHAT_BLOCKED');

    assert.equal((await listMessages(c.token, matchId)).body.code, 'CHAT_BLOCKED');
    assert.equal((await markMatchRead(c.token, matchId)).body.code, 'CHAT_BLOCKED');

    const missing = await sendMessage(a.token, '00000000-0000-4000-8000-000000000000', {
      clientMessageId: 'x',
      body: 'hola',
    });
    assert.equal(missing.status, 404, JSON.stringify(missing.body));
    assert.equal(missing.body.code, 'MATCH_NOT_FOUND');

    const malformed = await listMessages(a.token, 'no-es-un-uuid');
    assert.equal(malformed.status, 422, JSON.stringify(malformed.body));
    assert.equal(malformed.body.code, 'VALIDATION_FAILED');

    const empty = await sendMessage(a.token, matchId, { clientMessageId: 'x', body: '   ' });
    assert.equal(empty.status, 422, JSON.stringify(empty.body));
    assert.equal(empty.body.code, 'VALIDATION_FAILED');

    const noKey = await sendMessage(a.token, matchId, { body: 'hola' });
    assert.equal(noKey.status, 422, 'clientMessageId es obligatorio');

    const extra = await sendMessage(a.token, matchId, {
      clientMessageId: 'x',
      body: 'hola',
      senderProfileId: 'otro',
    });
    assert.equal(extra.status, 422, 'MessageCreate cierra con additionalProperties: false');

    const badCursor = await listMessages(a.token, matchId, 'no-es-un-cursor!!');
    assert.equal(badCursor.status, 422, JSON.stringify(badCursor.body));
    assert.equal(badCursor.body.code, 'VALIDATION_FAILED');

    const anonymous = await listMatches(undefined);
    assert.equal(anonymous.status, 401);
    assert.equal((await getMe(undefined)).status, 401);
  });

  test('un bot responde con texto fijo, llega por SSE y no repite el texto anterior', async () => {
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
    await extendPresence([b.sessionId], 240);

    const ping = await createPing(a.token, { targetProfileId: botId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    assert.equal(ping.body.status, 'accepted', 'el bot acepta el ping solo');
    const botMatchId = ping.body.matchId;
    assert.notEqual(botMatchId, null);

    // Un cursor congelado en el final del log: desde acá sólo se ven los
    // eventos de este escenario (el ticker del mundo ensucia el stream).
    const cursor = `${REGION}:${String(await maxEventSeq(REGION)).padStart(12, '0')}`;

    const sent = await sendMessage(a.token, botMatchId, { clientMessageId: 'bot-1', body: 'hola bot' });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));

    const reply = await waitFor(
      async () => {
        const rows = await messageRowsOf(botMatchId);
        return rows.find((row) => row.sender === botId) ?? null;
      },
      { timeoutMs: 12_000, label: 'la respuesta del bot' },
    );
    assert.equal(typeof reply.body, 'string');
    assert.ok(reply.body.length > 0, 'el bot contesta algo');
    assert.notEqual(reply.body, 'hola bot', 'y no repite el mensaje del humano');

    // El bot no contesta dos veces lo mismo seguido.
    await sendMessage(a.token, botMatchId, { clientMessageId: 'bot-2', body: '¿y vos?' });
    const secondReply = await waitFor(
      async () => {
        const rows = (await messageRowsOf(botMatchId)).filter((row) => row.sender === botId);
        return rows.length >= 2 ? rows[rows.length - 1] : null;
      },
      { timeoutMs: 12_000, label: 'la segunda respuesta del bot' },
    );
    assert.notEqual(secondReply.body, reply.body, 'dos respuestas seguidas nunca repiten texto');

    // Un mensaje del humano → una respuesta del bot: no hay timers duplicados.
    const botRows = (await messageRowsOf(botMatchId)).filter((row) => row.sender === botId);
    assert.equal(botRows.length, 2, 'dos mensajes producen dos respuestas, no cuatro');

    // Los dos eventos del bot están en el stream del participante. Se espera
    // activamente: el `message.created` del bot se escribe después de la fila.
    const page = await waitFor(
      async () => {
        const response = await pollEvents(a.token, { cursor });
        const types = response.body.events.map((event) => event.type);
        return types.includes('message.created') && types.includes('typing.started') ? response : null;
      },
      { timeoutMs: 12_000, label: 'los eventos del chat en el stream' },
    );
    const types = page.body.events.map((event) => event.type);
    assert.ok(types.includes('message.created'), 'message.created llega por el stream');
    assert.ok(types.includes('typing.started'), 'typing.started llega por el stream');
    const created = page.body.events.filter((event) => event.type === 'message.created');
    for (const event of created) {
      assert.deepEqual(Object.keys(event.payload).sort(), ['matchId', 'messageId', 'senderProfileId']);
      assert.equal(event.payload.matchId, botMatchId);
      assert.equal(JSON.stringify(event.payload).includes('body'), false, 'el evento no lleva el texto');
    }
    assert.equal(JSON.stringify(page.body).includes('lat'), false, 'el stream del chat no lleva coordenadas');

    // El tercero no es parte de esta conversación: no ve sus eventos.
    const stranger = await pollEvents(c.token, { cursor });
    assert.equal(stranger.status, 200);
    const chatEvents = stranger.body.events.filter((event) =>
      ['message.created', 'typing.started'].includes(event.type),
    );
    assert.deepEqual(chatEvents, [], 'el chat de un match no se filtra a un tercero');
  });
});
