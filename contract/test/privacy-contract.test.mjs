/**
 * Contrato v0.5: privacidad (ghost, bloqueo, reporte y notificaciones).
 *
 * S5 agrega la superficie que faltaba para que la demo sea usable con
 * desconocidos. Este archivo congela la forma del delta:
 *
 *  - `PUT /presence` acepta `visibility` (`visible` | `ghost`) además de la
 *    posición, y `PresenceState` publica la vigente. Ghost **no** apaga `online`.
 *  - `GET /blocks`, `POST /blocks` (201, idempotente) y
 *    `DELETE /blocks/{profileId}` (204, idempotente). La lista trae la identidad
 *    del otro con el mismo `PingPeer` de los pings.
 *  - `POST /reports` es **202** con `ReportReceipt`: sin identidad del reportado,
 *    sin motivo en la respuesta. Motivo cerrado a cinco valores.
 *  - `GET /notifications` trae items con `readAt` (la única autoridad de lectura)
 *    y `unreadCount`; `POST /notifications/read` marca todos o por id y devuelve
 *    `marked` + `unreadCount`.
 *  - `PROFILE_REQUIRED` (403) es el único código nuevo y lo usan bloqueo y
 *    reporte; `CHAT_BLOCKED` pasa a ser el 403 del bloqueo real, también en
 *    `POST /pings`.
 *
 * Lo que este archivo **no** prueba: que el server lo haga. Eso son los tests de
 * integración (`backend/test/integration/privacy.test.mjs`).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const { spec } = loadSpec();
const byLabel = Object.fromEntries(
  listOperations(spec).map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
);

const updatePresence = byLabel['PUT /presence'];
const listBlocks = byLabel['GET /blocks'];
const createBlock = byLabel['POST /blocks'];
const deleteBlock = byLabel['DELETE /blocks/{profileId}'];
const createReport = byLabel['POST /reports'];
const listNotifications = byLabel['GET /notifications'];
const readNotifications = byLabel['POST /notifications/read'];

const {
  Visibility,
  PresenceState,
  Block,
  BlockCreate,
  BlockList,
  BlockListItem,
  ReportReason,
  ReportCreate,
  ReportReceipt,
  NotificationKind,
  NotificationItem,
  NotificationList,
  NotificationReadRequest,
  NotificationReadResult,
  ErrorCode: errorCode,
  PingPeer,
} = spec.components.schemas;

const fieldsOf = (schema) => Object.keys(schema.properties ?? {}).sort();
const codesOf = (response) => [].concat(response?.['x-error-code'] ?? []);

test('presence publica visibility y ghost no apaga online', () => {
  assert.equal(Visibility.type, 'string');
  assert.deepEqual(Visibility.enum, ['visible', 'ghost']);
  assert.deepEqual(fieldsOf(PresenceState), [
    'fallbackRequired',
    'online',
    'profileId',
    'regionKey',
    'visibility',
    'zoneKey',
  ]);
  assert.ok(PresenceState.properties.visibility, 'PresenceState tiene que publicar visibility');

  const request = updatePresence.requestBody.content['application/json'].schema;
  assert.ok(request.properties.visibility, 'PresenceUpdate acepta visibility');
  assert.deepEqual(request.properties.visibility.enum, ['visible', 'ghost']);
  assert.ok(
    !('visibility' in (request.required ?? [])),
    'visibility es opcional: el heartbeat de posición no debe sacar a nadie de ghost',
  );
  assert.match(PresenceState.properties.online.description, /ghost/i, 'documenta que ghost no apaga online');
});

test('blocks: tres operations, POST 201 idempotente y DELETE 204', () => {
  for (const [label, operation, id] of [
    ['GET /blocks', listBlocks, 'listBlocks'],
    ['POST /blocks', createBlock, 'createBlock'],
    ['DELETE /blocks/{profileId}', deleteBlock, 'deleteBlock'],
  ]) {
    assert.ok(operation, `falta ${label}`);
    assert.equal(operation['x-implementation-sprint'], 5, `${label} es de S5`);
    assert.equal(operation.operationId, id);
  }

  assert.ok(createBlock.responses['201'], 'bloquear crea: 201');
  assert.equal(createBlock.responses['201'].content['application/json'].schema.properties.profileId.type, 'string');
  assert.ok(deleteBlock.responses['204'], 'desbloquear: 204');
  assert.equal(deleteBlock.responses['204'].content, undefined, 'un 204 no lleva body');
  assert.match(createBlock.description, /idempotente/i);
  assert.match(deleteBlock.description, /idempotente/i);

  assert.deepEqual(fieldsOf(BlockCreate), ['profileId']);
  assert.deepEqual(fieldsOf(Block), ['createdAt', 'profileId']);
  assert.deepEqual(fieldsOf(BlockListItem), ['block', 'peer']);
  assert.deepEqual(BlockList.required, ['blocks']);
  assert.deepEqual(
    fieldsOf(BlockListItem.properties.peer),
    fieldsOf(PingPeer),
    'la identidad del bloqueado es la misma proyección que la bandeja de pings',
  );
});

test('reports: 202, motivo cerrado y acuse sin identidad del reportado', () => {
  assert.equal(createReport['x-implementation-sprint'], 5);
  assert.equal(createReport.operationId, 'createReport');
  assert.ok(createReport.responses['202'], 'reportar acepta: 202');
  assert.equal(createReport.responses['202'].content['application/json'].schema.properties.reportId.format, 'uuid');

  assert.deepEqual(ReportReason.enum, ['spam', 'harassment', 'inappropriate', 'impersonation', 'other']);
  assert.deepEqual(fieldsOf(ReportCreate), ['profileId', 'reason']);
  assert.deepEqual(fieldsOf(ReportReceipt), ['createdAt', 'reportId']);
  assert.ok(
    !('profileId' in ReportReceipt.properties),
    'el acuse no repite a quién se reportó: sin PII en la respuesta',
  );
  assert.ok(!('reason' in ReportReceipt.properties), 'el motivo se guarda, no se publica');
});

test('notifications: items con readAt único y contador sobre el perfil', () => {
  for (const [label, operation, id] of [
    ['GET /notifications', listNotifications, 'listNotifications'],
    ['POST /notifications/read', readNotifications, 'readNotifications'],
  ]) {
    assert.ok(operation, `falta ${label}`);
    assert.equal(operation['x-implementation-sprint'], 5, `${label} es de S5`);
    assert.equal(operation.operationId, id);
  }

  assert.deepEqual(NotificationKind.enum, ['ping.received', 'match.created', 'message.created']);
  assert.deepEqual(fieldsOf(NotificationItem), [
    'createdAt',
    'id',
    'kind',
    'matchId',
    'messageId',
    'peer',
    'pingId',
    'readAt',
  ]);
  assert.ok(!('unread' in NotificationItem.properties), 'readAt es la única autoridad del estado de lectura');
  assert.deepEqual(NotificationList.required.sort(), ['notifications', 'unreadCount'].sort());
  assert.equal(NotificationList.properties.notifications.maxItems, 100);
  assert.match(NotificationList.description, /todas/i);

  assert.equal(readNotifications.requestBody.required, false, 'marcar todas no exige body');
  assert.ok(!('notificationIds' in (NotificationReadRequest.required ?? [])), 'sin ids = todas');
  assert.equal(NotificationReadRequest.properties.notificationIds.maxItems, 100);
  assert.deepEqual(NotificationReadResult.required.sort(), ['marked', 'unreadCount'].sort());
});

test('PROFILE_REQUIRED entra al catálogo y lo usan bloqueo y reporte', () => {
  assert.ok(errorCode.enum.includes('PROFILE_REQUIRED'), 'falta PROFILE_REQUIRED en el enum');
  assert.equal(errorCode['x-status'].PROFILE_REQUIRED, 403);

  const users = [];
  for (const operation of [createBlock, deleteBlock, createReport]) {
    for (const response of Object.values(operation.responses)) {
      if (codesOf(response).includes('PROFILE_REQUIRED')) users.push(operation.operationId);
    }
  }
  assert.deepEqual([...new Set(users)].sort(), ['createBlock', 'createReport', 'deleteBlock']);
});

test('CHAT_BLOCKED cubre el bloqueo real en pings y en el chat', () => {
  const ping = byLabel['POST /pings'];
  const send = byLabel['POST /matches/{matchId}/messages'];

  for (const [label, operation] of [
    ['POST /pings', ping],
    ['POST /matches/{matchId}/messages', send],
  ]) {
    const blocked = Object.entries(operation.responses)
      .filter(([, response]) => codesOf(response).includes('CHAT_BLOCKED'))
      .map(([status]) => Number(status));
    assert.deepEqual(blocked, [403], `${label}: CHAT_BLOCKED tiene que ser 403`);
  }
  assert.match(ping.description, /bloque/i, 'el ping documenta el bloqueo');
});

test('el delta v0.5 no rompe las formas de S1–S4', () => {
  // La única forma existente que cambia es PresenceState (suma visibility); este
  // test falla si alguien agrega/quita campos de los DTO que el cliente ya usa.
  assert.deepEqual(fieldsOf(spec.components.schemas.Ping), [
    'createdAt',
    'expiresAt',
    'fromProfileId',
    'id',
    'matchId',
    'status',
    'toProfileId',
  ]);
  assert.deepEqual(fieldsOf(spec.components.schemas.MatchListItem), [
    'lastMessage',
    'match',
    'peer',
    'unreadCount',
  ]);
  assert.deepEqual(fieldsOf(spec.components.schemas.PingList), ['pings']);
  assert.deepEqual(fieldsOf(spec.components.schemas.Message), [
    'body',
    'clientMessageId',
    'createdAt',
    'id',
    'matchId',
    'senderProfileId',
  ]);
});
