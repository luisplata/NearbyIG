import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  apiRaw,
  assertStackUp,
  createPing,
  deletePingsOf,
  deleteSessionsCreatedSince,
  listDiscovery,
  listMessages,
  listNotifications,
  listPings,
  openSession,
  pollEvents,
  sendMessage,
  snapshotSessionIds,
  updatePresence,
  withDb,
} from '../helpers.mjs';

/**
 * Validación de entrada de S7 — la regla es una sola:
 *
 *   **un pedido mal formado es `422 VALIDATION_FAILED`, nunca `500`.**
 *
 * Este archivo es el barrido de lo que llegó a Postgres antes de S7 y reventaba
 * ahí (`0x00` en un `profileId` ⇒ `invalid byte sequence for encoding "UTF8"` ⇒
 * 500 `INTERNAL`), más los casos de body-parser que el contrato no declaraba
 * (JSON roto ⇒ 400, payload de 200 KB ⇒ 413; `errors.yaml` dice explícitamente
 * que no existe 400).
 *
 * Los casos están agrupados por endpoint y todos los que no son "recurso
 * inexistente" exigen 422. El test final `ningún 500` recorre el registro
 * completo: si mañana alguien agrega un validador que deja pasar un tipo raro,
 * el fallo es explícito en vez de un 500 silencioso.
 */

const REGION = 'mx';
const ZONE = 'cdmx';
const SLOT = 8;

let snapshot = [];
let session;
let otherSession;

/** Lo que se mandó, para el resumen final y para probar que nada fue 500. */
const attempts = [];

/**
 * Ejecuta una sonda y exige 422 con el `code` del contrato.
 *
 * `status === body.status` y `requestId` presente se verifican en todas: el
 * `Problem` es el mismo shape para todos los errores, no uno especial para
 * validación.
 */
async function expect422(label, run) {
  const response = await run();
  attempts.push({ label, status: response.status });
  assert.equal(response.status, 422, `${label}: esperaba 422, vino ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(response.body?.code, 'VALIDATION_FAILED', label);
  assert.equal(response.body?.status, 422, `${label}: el body repite el status`);
  assert.equal(typeof response.body?.requestId, 'string', `${label}: falta requestId`);
  assert.ok(response.body.requestId.length > 0, `${label}: requestId vacío`);
  return response;
}

/** Todo lo que no es 422 se registra igual: es la red contra un 500 nuevo. */
async function record(label, run) {
  const response = await run();
  attempts.push({ label, status: response.status });
  return response;
}

describe('validación: 422 y nunca 500 en toda la superficie de escritura', () => {
  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const opened = await openSession({ regionKey: REGION, demoSlot: SLOT });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    session = opened.body;

    // Un segundo perfil para tener un match real en los casos de chat.
    const other = await openSession({ regionKey: REGION, demoSlot: SLOT + 1 });
    assert.equal(other.status, 201, JSON.stringify(other.body));
    otherSession = other.body;

    const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
    assert.equal(presence.status, 200, JSON.stringify(presence.body));
    const otherPresence = await updatePresence(otherSession.token, { demoZoneKey: ZONE });
    assert.equal(otherPresence.status, 200, JSON.stringify(otherPresence.body));
  });

  after(async () => {
    const profileIds = [session?.profileId, otherSession?.profileId].filter(Boolean);
    if (profileIds.length > 0) {
      await deletePingsOf(REGION, profileIds);
      await withDb(async (client) => {
        await client.query('DELETE FROM messages WHERE sender_profile_id = ANY($1::text[])', [profileIds]);
        await client.query('DELETE FROM notifications WHERE recipient_profile_id = ANY($1::text[])', [profileIds]);
        await client.query('DELETE FROM blocks WHERE blocker_profile_id = ANY($1::text[])', [profileIds]);
        await client.query('DELETE FROM reports WHERE reporter_profile_id = ANY($1::text[])', [profileIds]);
      });
    }
    await deleteSessionsCreatedSince(snapshot);
  });

  test('body-parser: JSON roto, primitivo, charset y payload gigante son 422', async () => {
    await expect422('JSON roto', () =>
      apiRaw('/auth/demo-session', { method: 'POST', body: '{"regionKey":' }),
    );
    await expect422('JSON primitivo', () =>
      apiRaw('/auth/demo-session', { method: 'POST', body: '5' }),
    );
    await expect422('charset no soportado', () =>
      apiRaw('/auth/demo-session', {
        method: 'POST',
        body: '{}',
        contentType: 'application/json; charset=utf-16',
      }),
    );
    await expect422('payload > 100 KB', () =>
      apiRaw('/pings', {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({ targetProfileId: 'x'.repeat(200_000) }),
      }),
    );
  });

  test('sesión: tipos, rangos, región y claves desconocidas', async () => {
    for (const [label, body] of [
      ['body array', []],
      ['slot 0', { demoSlot: 0 }],
      ['slot 11', { demoSlot: 11 }],
      ['slot decimal', { demoSlot: 1.5 }],
      ['slot string', { demoSlot: '1' }],
      ['región en mayúsculas', { regionKey: 'MX' }],
      ['región inexistente', { regionKey: 'zz' }],
      ['clave desconocida', { userId: 'x' }],
    ]) {
      await expect422(`demo-session ${label}`, () => apiRaw('/auth/demo-session', { method: 'POST', body: JSON.stringify(body) }));
    }
  });

  test('presence: exactamente un origen, números finitos y visibilidad del enum', async () => {
    for (const [label, body] of [
      ['sin origen', {}],
      ['dos orígenes', { demoZoneKey: ZONE, point: { lat: 19.43, lng: -99.13 } }],
      ['point null', { point: null }],
      ['point array', { point: [] }],
      ['lat string', { point: { lat: '19.43', lng: -99.13 } }],
      ['lat fuera de rango', { point: { lat: 99, lng: -99.13 } }],
      ['lng fuera de rango', { point: { lat: 19.43, lng: 200 } }],
      ['lat NaN', { point: { lat: Number.NaN, lng: -99.13 } }],
      ['point con clave extra', { point: { lat: 19.43, lng: -99.13, alt: 1 } }],
      ['zona con mayúsculas', { demoZoneKey: 'CDMX' }],
      ['zona numérica', { demoZoneKey: 12 }],
      ['visibility fuera del enum', { demoZoneKey: ZONE, visibility: 'invisible' }],
      ['clave desconocida', { demoZoneKey: ZONE, ghost: true }],
    ]) {
      await expect422(`presence ${label}`, () => updatePresence(session.token, body));
    }
  });

  test('discovery: radio y enums fuera de rango, y parámetros repetidos', async () => {
    for (const [label, filters] of [
      ['radio 199', { radiusM: 199 }],
      ['radio 5001', { radiusM: 5001 }],
      ['radio no numérico', { radiusM: 'abc' }],
      ['radio decimal', { radiusM: 1.5 }],
      ['radio repetido', { radiusM: [500, 600] }],
      ['intención fuera del catálogo', { intention: 'amor' }],
      ['género fuera del catálogo', { gender: 'other' }],
      ['verified no booleano', { verified: 'si' }],
      ['online no booleano', { online: 'si' }],
      ['online repetido', { online: ['true', 'false'] }],
    ]) {
      await expect422(`discovery ${label}`, () => listDiscovery(session.token, filters));
    }
  });

  test('pings: target con NUL, basura, gigante, tipos y claves desconocidas', async () => {
    for (const [label, body] of [
      ['body vacío', {}],
      ['body array', [1]],
      ['target numérico', { targetProfileId: 3 }],
      ['target vacío', { targetProfileId: '   ' }],
      ['target con NUL', { targetProfileId: 'mx-p01\u0000' }],
      ['target con barra', { targetProfileId: '../../etc/passwd' }],
      ['target con mayúsculas', { targetProfileId: 'MX-P01' }],
      ['target de 70 KB', { targetProfileId: 'x'.repeat(70_000) }],
      ['clave desconocida', { targetProfileId: 'mx-p01', noteKey: 'hi' }],
    ]) {
      await expect422(`ping ${label}`, () => createPing(session.token, body));
    }

    // El uuid del path se valida antes del SQL: malformado es 422, no 404.
    for (const [label, pingId] of [
      ['uuid malformado', 'no-es-uuid'],
      ['uuid corto', '1234'],
      ['uuid con NUL', '%00'],
    ]) {
      await expect422(`accept ${label}`, () =>
        apiRaw(`/pings/${pingId}/accept`, { method: 'POST', token: session.token }),
      );
      await expect422(`reject ${label}`, () =>
        apiRaw(`/pings/${pingId}/reject`, { method: 'POST', token: session.token }),
      );
    }
  });

  test('pings: box obligatorio y del enum', async () => {
    await expect422('box ausente', () => listPings(session.token));
    await expect422('box fuera del enum', () => listPings(session.token, 'all'));
    await expect422('box vacío', () => listPings(session.token, ''));
    await expect422('box repetido', () => apiRaw('/pings?box=inbox&box=sent', { token: session.token }));
  });

  test('chat: matchId, cursor, texto y claves desconocidas', async () => {
    const matchId = '00000000-0000-4000-8000-000000000000';
    for (const [label, id] of [
      ['matchId malformado', 'no-es-uuid'],
      ['matchId con NUL', '%00'],
    ]) {
      await expect422(`messages ${label}`, () => listMessages(session.token, id));
      await expect422(`read ${label}`, () => apiRaw(`/matches/${id}/read`, { method: 'POST', token: session.token }));
    }

    await expect422('cursor malformado', () => listMessages(session.token, matchId, '@@@'));
    await expect422('cursor repetido', () =>
      apiRaw(`/matches/${matchId}/messages?cursor=a&cursor=b`, { token: session.token }),
    );

    for (const [label, body] of [
      ['body vacío', {}],
      ['body array', []],
      ['clientMessageId numérico', { clientMessageId: 7, body: 'hola' }],
      ['clientMessageId vacío', { clientMessageId: '  ', body: 'hola' }],
      ['texto numérico', { clientMessageId: 'c1', body: 42 }],
      ['texto vacío', { clientMessageId: 'c1', body: '   ' }],
      ['texto > 2000', { clientMessageId: 'c1', body: 'x'.repeat(2_001) }],
      ['clave desconocida', { clientMessageId: 'c1', body: 'hola', textKey: 'x' }],
    ]) {
      await expect422(`send ${label}`, () => sendMessage(session.token, matchId, body));
    }
  });

  test('blocks: profileId con NUL, basura y gigante; path con NUL', async () => {
    for (const [label, body] of [
      ['body vacío', {}],
      ['body array', []],
      ['profileId numérico', { profileId: 4 }],
      ['profileId vacío', { profileId: ' ' }],
      ['profileId con NUL', { profileId: 'mx-p01\u0000' }],
      ['profileId con %', { profileId: '%%%' }],
      ['profileId de 70 KB', { profileId: 'y'.repeat(70_000) }],
      ['clave desconocida', { profileId: 'mx-p02', note: 'x' }],
    ]) {
      await expect422(`blocks ${label}`, () =>
        apiRaw('/blocks', { method: 'POST', token: session.token, body: JSON.stringify(body) }),
      );
    }

    // El path tiene que validarse igual que el body: antes, el NUL llegaba a
    // Postgres y el DELETE respondía 500.
    await expect422('unblock NUL', () =>
      apiRaw('/blocks/%00', { method: 'DELETE', token: session.token }),
    );
    await expect422('unblock de 5 KB', () =>
      apiRaw(`/blocks/${'z'.repeat(5_000)}`, { method: 'DELETE', token: session.token }),
    );
  });

  test('reports: motivo del catálogo, profileId válido y sin claves de más', async () => {
    for (const [label, body] of [
      ['body vacío', {}],
      ['body array', []],
      ['profileId con NUL', { profileId: 'mx-p02\u0000', reason: 'spam' }],
      ['profileId de 70 KB', { profileId: 'q'.repeat(70_000), reason: 'spam' }],
      ['motivo fuera del catálogo', { profileId: 'mx-p02', reason: 'porque si' }],
      ['motivo numérico', { profileId: 'mx-p02', reason: 3 }],
      ['clave desconocida', { profileId: 'mx-p02', reason: 'spam', evidence: 'x' }],
    ]) {
      await expect422(`reports ${label}`, () =>
        apiRaw('/reports', { method: 'POST', token: session.token, body: JSON.stringify(body) }),
      );
    }
  });

  test('notifications/read: ids uuid, array de tamaño acotado y body objeto', async () => {
    for (const [label, body] of [
      ['body número', 5],
      ['body string', 'x'],
      ['ids string', { notificationIds: 'x' }],
      ['ids con objeto', { notificationIds: [{}] }],
      ['ids con NUL', { notificationIds: ['\u0000'] }],
      ['ids con uuid corto', { notificationIds: ['1234'] }],
      ['más de 100 ids', { notificationIds: Array.from({ length: 101 }, () => '00000000-0000-4000-8000-000000000000') }],
      ['clave desconocida', { ids: [] }],
    ]) {
      await expect422(`notifications ${label}`, () =>
        apiRaw('/notifications/read', {
          method: 'POST',
          token: session.token,
          body: JSON.stringify(body),
        }),
      );
    }
  });

  test('events/poll: cursor con forma y limit entero; repetido es 422', async () => {
    await expect422('cursor basura', () => pollEvents(session.token, { cursor: '@@@' }));
    await expect422('cursor de otra región', () => pollEvents(session.token, { cursor: 'co:000000000001' }));
    await expect422('cursor repetido', () =>
      apiRaw('/events/poll?cursor=a&cursor=b', { token: session.token }),
    );
    await expect422('limit 0', () => pollEvents(session.token, { limit: 0 }));
    await expect422('limit 501', () => pollEvents(session.token, { limit: 501 }));
    await expect422('limit abc', () => pollEvents(session.token, { limit: 'abc' }));
    await expect422('limit repetido', () =>
      apiRaw('/events/poll?limit=10&limit=20', { token: session.token }),
    );
  });

  test('takeover: slot y región obligatorios, del catálogo y sin claves de más', async () => {
    for (const [label, body] of [
      ['body vacío', {}],
      ['sin slot', { regionKey: REGION }],
      ['sin región', { demoSlot: 1 }],
      ['slot 0', { regionKey: REGION, demoSlot: 0 }],
      ['slot decimal', { regionKey: REGION, demoSlot: 2.5 }],
      ['slot string', { regionKey: REGION, demoSlot: '2' }],
      ['región inválida', { regionKey: 'MX', demoSlot: 2 }],
      ['clave desconocida', { regionKey: REGION, demoSlot: 2, force: true }],
    ]) {
      await expect422(`takeover ${label}`, () =>
        apiRaw('/auth/takeover', { method: 'POST', token: session.token, body: JSON.stringify(body) }),
      );
    }
  });

  test('recursos válidos pero inexistentes siguen siendo 404, no 500', async () => {
    const missingPing = await record('accept de uuid inexistente', () =>
      apiRaw('/pings/00000000-0000-4000-8000-000000000000/accept', {
        method: 'POST',
        token: session.token,
      }),
    );
    assert.equal(missingPing.status, 404, JSON.stringify(missingPing.body));

    const missingMatch = await record('mensajes de uuid inexistente', () =>
      listMessages(session.token, '00000000-0000-4000-8000-000000000000'),
    );
    assert.equal(missingMatch.status, 404, JSON.stringify(missingMatch.body));

    const missingProfile = await record('bloqueo de perfil inexistente', () =>
      apiRaw('/blocks', {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({ profileId: 'mx-nope' }),
      }),
    );
    assert.equal(missingProfile.status, 404, JSON.stringify(missingProfile.body));

    const notifications = await record('notificaciones', () => listNotifications(session.token));
    assert.equal(notifications.status, 200, JSON.stringify(notifications.body));
  });

  test('ningún pedido de este archivo terminó en 5xx', () => {
    const serverErrors = attempts.filter((attempt) => attempt.status >= 500);
    assert.deepEqual(
      serverErrors,
      [],
      `estos pedidos dieron 5xx: ${serverErrors.map((attempt) => attempt.label).join(', ')}`,
    );
  });
});
