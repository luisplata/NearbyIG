/**
 * Contrato v0.4: el chat de un match.
 *
 * v0.3 dejó un match que no tenía dónde escribir. v0.4 cierra el flujo con
 * cuatro operations de chat y `GET /me`, y este archivo congela la forma del
 * delta:
 *
 *  - `GET /matches` devuelve `MatchList`: el match, el peer del **otro** (mismo
 *    `PingPeer` que la bandeja de pings), el último mensaje y `unreadCount`.
 *  - la conversación es `MessagePage`: cronológica, con cursor **opaco** y
 *    `hasMore`; el máximo por página es el `maxItems` del schema.
 *  - `POST .../messages` es idempotente por `clientMessageId`, y la clave es por
 *    emisor: `Message.clientMessageId` viaja de vuelta para reconciliar la
 *    burbuja optimista.
 *  - `POST .../read` es 204 sin body: el efecto se lee en `unreadCount`.
 *  - `GET /me` responde `SelfProfile` —el schema declarado en S0— y no el `self`
 *    del dataset.
 *  - errores: 403 `CHAT_BLOCKED` (no sos parte), 404 `MATCH_NOT_FOUND`, 409
 *    `MATCH_CLOSED` (conversación cerrada), 422 `VALIDATION_FAILED` y 429
 *    `RATE_LIMITED`. Ningún código reservado queda en `x-reserved`.
 *
 * Lo que este archivo **no** prueba: que el server lo haga. Eso son los tests de
 * integración de `backend/` (flujo A↔B, idempotencia, bot por SSE, `/me`). Acá
 * sólo se congela la forma que el server tiene que cumplir.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const { spec } = loadSpec();
const byLabel = Object.fromEntries(
  listOperations(spec).map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
);

const listMatches = byLabel['GET /matches'];
const listMessages = byLabel['GET /matches/{matchId}/messages'];
const sendMessage = byLabel['POST /matches/{matchId}/messages'];
const markRead = byLabel['POST /matches/{matchId}/read'];
const me = byLabel['GET /me'];

const { Message, MessageCreate, MessagePage, MatchList, MatchListItem } = spec.components.schemas;
const { Match, PingPeer } = spec.components.schemas;
const { SelfProfile } = spec.components.schemas;
const { ErrorCode: errorCode } = spec.components.schemas;

/** `x-error-code` puede ser string o lista; acá se normaliza. */
const codesOf = (response) => [].concat(response?.['x-error-code'] ?? []);

const statusesOf = (operation) =>
  Object.keys(operation.responses ?? {})
    .map(Number)
    .filter((status) => status >= 400);

const fieldsOf = (schema) => Object.keys(schema.properties ?? {}).sort();

test('las cinco operations existen, son de Sprint 4 y tienen operationId propio', () => {
  for (const [label, operation, id] of [
    ['GET /matches', listMatches, 'listMatches'],
    ['GET /matches/{matchId}/messages', listMessages, 'listMessages'],
    ['POST /matches/{matchId}/messages', sendMessage, 'sendMessage'],
    ['POST /matches/{matchId}/read', markRead, 'markMatchRead'],
    ['GET /me', me, 'getSelfProfile'],
  ]) {
    assert.ok(operation, `falta ${label}`);
    assert.equal(operation['x-implementation-sprint'], 4, `${label} es de S4`);
    assert.equal(operation.operationId, id);
  }

  assert.equal(sendMessage.responses['201'] !== undefined, true, 'enviar es 201');
  assert.equal(markRead.responses['204'] !== undefined, true, 'marcar leído es 204');
});

test('Message declara los seis campos y devuelve el clientMessageId', () => {
  assert.deepEqual(fieldsOf(Message), [
    'body',
    'clientMessageId',
    'createdAt',
    'id',
    'matchId',
    'senderProfileId',
  ]);
  assert.deepEqual([...Message.required].sort(), fieldsOf(Message), 'todos obligatorios');
  assert.equal(Message.additionalProperties, false);
  assert.equal(Message.properties.id.format, 'uuid');
  assert.equal(Message.properties.body.maxLength, 2000);
  assert.equal(
    Message.properties.clientMessageId.maxLength,
    100,
    'la clave de idempotencia viaja de vuelta para reconciliar la UI optimista',
  );
});

test('MessageCreate es un body cerrado con las dos claves del envío', () => {
  assert.deepEqual(fieldsOf(MessageCreate), ['body', 'clientMessageId']);
  assert.deepEqual([...MessageCreate.required].sort(), ['body', 'clientMessageId']);
  assert.equal(MessageCreate.additionalProperties, false);
});

test('MessagePage es cronológica, con cursor opaco y hasMore', () => {
  assert.deepEqual(fieldsOf(MessagePage), ['hasMore', 'messages', 'nextCursor']);
  assert.equal(MessagePage.properties.messages.maxItems, 100);
  assert.equal(MessagePage.properties.nextCursor.type.includes('null'), true, 'sin más páginas es null');
  assert.equal(
    JSON.stringify(MessagePage.properties.nextCursor).includes('pattern'),
    false,
    'el cursor es opaco: el contrato no fija su encoding',
  );
  assert.deepEqual([...MessagePage.required].sort(), fieldsOf(MessagePage));
});

test('MatchList anida el match, el peer del otro, el último mensaje y unreadCount', () => {
  assert.deepEqual(fieldsOf(MatchListItem), ['lastMessage', 'match', 'peer', 'unreadCount']);
  assert.deepEqual([...MatchListItem.required].sort(), fieldsOf(MatchListItem));
  assert.equal(MatchListItem.additionalProperties, false);
  assert.deepEqual(
    fieldsOf(MatchListItem.properties.peer),
    fieldsOf(PingPeer),
    'el peer del match es el mismo shape que el de la bandeja de pings, no una copia',
  );
  assert.deepEqual(
    fieldsOf(MatchListItem.properties.match),
    fieldsOf(Match),
    'el match anidado es el de v0.3, no un shape nuevo',
  );
  assert.equal(MatchListItem.properties.unreadCount.minimum, 0);
  assert.equal(MatchListItem.properties.lastMessage.oneOf.length, 2, 'Message o null');

  assert.deepEqual(fieldsOf(MatchList), ['matches']);
  assert.equal(MatchList.properties.matches.maxItems, 100);
  assert.deepEqual(
    fieldsOf(Match),
    ['createdAt', 'id', 'profileIds'],
    'Match sigue siendo el de v0.3: el chat no le agrega campos',
  );
  assert.deepEqual(fieldsOf(PingPeer), [
    'initials',
    'intention',
    'nickname',
    'photoId',
    'profileId',
    'sourceType',
  ]);
});

test('GET /me responde SelfProfile, el schema declarado en S0', () => {
  assert.deepEqual(
    fieldsOf(me.responses['200'].content['application/json'].schema),
    fieldsOf(SelfProfile),
    'GET /me devuelve SelfProfile, no un DTO nuevo',
  );
  assert.deepEqual(fieldsOf(SelfProfile), [
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
  ]);
  for (const absent of ['distanceM', 'bearingDeg', 'online', 'gender', 'verified', 'bioKey']) {
    assert.equal(absent in SelfProfile.properties, false, `SelfProfile no lleva ${absent}`);
  }
  assert.ok(codesOf(me.responses['404']).includes('PROFILE_NOT_FOUND'), 'un invitado no tiene perfil');
});

test('los errores del chat usan el catálogo y no queda ningún código reservado', () => {
  assert.deepEqual(statusesOf(sendMessage), [401, 403, 404, 409, 422, 429, 500]);
  assert.deepEqual(statusesOf(listMessages), [401, 403, 404, 422, 500]);
  assert.deepEqual(statusesOf(markRead), [401, 403, 404, 422, 500]);
  assert.deepEqual(statusesOf(listMatches), [401, 500]);

  assert.deepEqual(codesOf(sendMessage.responses['403']), ['CHAT_BLOCKED']);
  assert.deepEqual(codesOf(sendMessage.responses['404']), ['MATCH_NOT_FOUND']);
  assert.deepEqual(codesOf(sendMessage.responses['409']), ['MATCH_CLOSED']);

  assert.equal(errorCode.enum.includes('MATCH_CLOSED'), true);
  assert.equal(errorCode['x-status'].MATCH_CLOSED, 409);
  assert.deepEqual(errorCode['x-reserved'] ?? {}, {}, 'v0.4 no deja códigos reservados');
});

test('las dos operations de mensajes declaran el matchId del path como uuid', () => {
  for (const operation of [listMessages, sendMessage, markRead]) {
    const parameter = (operation.parameters ?? []).find((entry) => entry.in === 'path');
    assert.ok(parameter, 'falta el parámetro de path');
    assert.equal(parameter.name, 'matchId');
    assert.equal(parameter.schema.format, 'uuid');
  }

  const cursor = (listMessages.parameters ?? []).find((entry) => entry.name === 'cursor');
  assert.ok(cursor, 'la conversación se pagina con cursor');
  assert.equal(cursor.in, 'query');
  assert.equal(cursor.required, false, 'sin cursor es la primera página');
});
