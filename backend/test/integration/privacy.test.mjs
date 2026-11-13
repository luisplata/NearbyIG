import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  assertStackUp,
  blockRowsOf,
  clearPrivacyOf,
  createBlock,
  createPing,
  createReport,
  deleteBlock,
  deletePingsOf,
  deleteSessionsCreatedSince,
  expireBotLegs,
  extendPresence,
  listBlocks,
  listDiscovery,
  listMessages,
  listNotifications,
  markNotificationsRead,
  maxEventSeq,
  notificationRowsOf,
  openSession,
  pollEvents,
  presenceVisibility,
  reportRowsOf,
  sendMessage,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
  withDb,
} from '../helpers.mjs';

/**
 * Privacidad de S5 (delta v0.5): ghost, bloqueo, reporte, notificaciones y el
 * cierre de conversación por cambio de zona.
 *
 * Lo que fija este archivo, que es la promesa del sprint:
 *
 *  - ghost: el humano y sus bots desaparecen del discovery y del stream de los
 *    demás, el dueño se sigue viendo (sus bots incluidos) y volver a `visible`
 *    los reaparece;
 *  - bloqueo: el par deja de verse, no hay ping en ninguna dirección, la
 *    conversación existente no acepta mensajes nuevos (`403 CHAT_BLOCKED`) y
 *    desbloquear lo revierte; un bot se canoniza a su dueño;
 *  - reporte: queda registrado, el acuse no expone PII y no cambia el
 *    descubrimiento;
 *  - notificaciones: ping, match, mensaje y respuesta de bot generan avisos
 *    persistidos, `unreadCount` cuenta bien y marcar (todas o por id) lo baja;
 *  - cambio de zona: la conversación con un bot queda legible y escribir es
 *    `409 MATCH_CLOSED`; volver a la zona original la reabre.
 *
 * Aislamiento: cada escenario abre sus slots y borra lo suyo (pings, matches,
 * bloqueos, reportes y notificaciones de los perfiles del escenario) y las
 * sesiones que creó.
 */

const REGION = 'mx';
const ZONE = 'cdmx';

const idsOf = (body) => body.results.map((row) => row.profileId);

const botIdsOf = (profileId) => [`${profileId}-b1`, `${profileId}-b2`];

const movedFor = (events, profileIds) =>
  events.filter(
    (event) => event.type === 'profile.moved' && profileIds.includes(event.payload.profileId),
  );

describe('ghost: online pero invisible', () => {
  let snapshot = [];
  let a;
  let b;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(9);
    b = await open(10);
    const aPresence = await updatePresence(a.token, { demoZoneKey: ZONE });
    assert.equal(aPresence.status, 200, JSON.stringify(aPresence.body));
    const bPresence = await updatePresence(b.token, { demoZoneKey: ZONE });
    assert.equal(bPresence.status, 200, JSON.stringify(bPresence.body));
    await extendPresence([a.sessionId, b.sessionId], 600);

    // Los bots de A los crea el ticker: sin ellos no hay nada que esconder.
    await waitFor(
      () =>
        withDb(async (client) => {
          const { rows } = await client.query(
            'SELECT count(*)::int AS count FROM bots WHERE region_key = $1 AND owner_profile_id = $2',
            [REGION, a.profileId],
          );
          return rows[0].count === 2;
        }),
      { label: 'los 2 bots de A', timeoutMs: 15_000 },
    );
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(a.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('B ve a A y sus bots; en ghost, ni el humano ni los bots', async () => {
    const before = await listDiscovery(b.token);
    assert.equal(before.status, 200, JSON.stringify(before.body));
    assert.ok(idsOf(before.body).includes(a.profileId), 'B ve a A visible');
    for (const botId of botIdsOf(a.profileId)) {
      assert.ok(idsOf(before.body).includes(botId), `B ve ${botId}`);
    }

    const ghost = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' });
    assert.equal(ghost.status, 200, JSON.stringify(ghost.body));
    assert.equal(ghost.body.visibility, 'ghost');
    assert.equal(ghost.body.online, true, 'ghost no apaga la presencia');
    assert.equal(await presenceVisibility(a.sessionId), 'ghost');

    const hidden = await listDiscovery(b.token);
    assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
    assert.equal(idsOf(hidden.body).includes(a.profileId), false, 'A no aparece para B');
    for (const botId of botIdsOf(a.profileId)) {
      assert.equal(idsOf(hidden.body).includes(botId), false, `${botId} no aparece para B`);
    }
  });

  test('el dueño se sigue viendo a sí mismo, con sus bots', async () => {
    const own = await listDiscovery(a.token);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(idsOf(own.body).includes(a.profileId), false, 'sigue sin verse el humano (regla de siempre)');
    for (const botId of botIdsOf(a.profileId)) {
      assert.ok(idsOf(own.body).includes(botId), `en ghost, A ve su ${botId}`);
    }
  });

  test('el stream de B deja de mover los bots de A en ghost', async () => {
    // Baseline: **visible**, el ticker mueve los bots de A y B los recibe.
    assert.equal((await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'visible' })).status, 200);
    const baselineSeq = await maxEventSeq(REGION);
    await expireBotLegs(REGION);
    await waitFor(
      async () => movedFor((await pollEvents(b.token, { cursor: `mx:${String(baselineSeq).padStart(12, '0')}` })).body.events, botIdsOf(a.profileId)).length > 0,
      { label: 'los movimientos de los bots de A', timeoutMs: 15_000 },
    );

    // En ghost: el cursor se toma **antes** del PUT para que la página incluya
    // el aviso de que A se fue. Se fuerza el tramo y se mira el log de B.
    const ghostSeq = await maxEventSeq(REGION);
    assert.equal((await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' })).status, 200);
    await expireBotLegs(REGION);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const page = await pollEvents(b.token, { cursor: `mx:${String(ghostSeq).padStart(12, '0')}` });
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(
      movedFor(page.body.events, botIdsOf(a.profileId)),
      [],
      'los bots de un dueño en ghost no se mueven para B',
    );

    // El aviso de "se fue" sí llega: es lo que saca la tarjeta del radar.
    const offline = page.body.events.filter(
      (event) => event.type === 'profile.presence' && event.payload.profileId === a.profileId,
    );
    assert.ok(
      offline.some((event) => event.payload.online === false),
      'ghost avisa online:false para que el cliente lo saque',
    );
  });

  test('volver a visible reaparece para B y vuelve a moverse en el stream', async () => {
    const visible = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'visible' });
    assert.equal(visible.status, 200, JSON.stringify(visible.body));
    assert.equal(visible.body.visibility, 'visible');

    const seen = await listDiscovery(b.token);
    for (const botId of botIdsOf(a.profileId)) {
      assert.ok(idsOf(seen.body).includes(botId), `${botId} reaparece para B`);
    }

    const seq = await maxEventSeq(REGION);
    await expireBotLegs(REGION);
    await waitFor(
      async () =>
        movedFor(
          (await pollEvents(b.token, { cursor: `mx:${String(seq).padStart(12, '0')}` })).body.events,
          botIdsOf(a.profileId),
        ).length > 0,
      { label: 'los movimientos de los bots de A al volver', timeoutMs: 15_000 },
    );
  });

  test('un PUT sin visibility conserva el ghost (el heartbeat no lo saca)', async () => {
    const ghost = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' });
    assert.equal(ghost.status, 200, JSON.stringify(ghost.body));

    // El cliente late cada pocos segundos sin repetir `visibility`.
    const beat = await updatePresence(a.token, { demoZoneKey: ZONE });
    assert.equal(beat.status, 200, JSON.stringify(beat.body));
    assert.equal(beat.body.visibility, 'ghost', 'omitir visibility no devuelve a visible');

    const hidden = await listDiscovery(b.token);
    assert.equal(idsOf(hidden.body).includes(`${a.profileId}-b1`), false);

    const back = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'visible' });
    assert.equal(back.body.visibility, 'visible');
  });

  test('visibility inválida es 422 y el body sigue exigiendo posición', async () => {
    const invalid = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'invisible' });
    assert.equal(invalid.status, 422, JSON.stringify(invalid.body));
    assert.equal(invalid.body.code, 'VALIDATION_FAILED');

    const noPosition = await updatePresence(a.token, { visibility: 'ghost' });
    assert.equal(noPosition.status, 422, JSON.stringify(noPosition.body));
  });
});

describe('bloqueo', () => {
  let snapshot = [];
  let a;
  let b;
  let matchId;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(8);
    b = await open(7);

    for (const session of [a, b]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([a.sessionId, b.sessionId], 600);
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(a.profileId), ...botIdsOf(b.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);

    // La conversación que el bloqueo tiene que cerrar (sin borrarla).
    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    const accepted = await acceptPing(b.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    matchId = accepted.body.id;
    const message = await sendMessage(a.token, matchId, { clientMessageId: 'pre-block', body: 'hola' });
    assert.equal(message.status, 201, JSON.stringify(message.body));
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(a.profileId), ...botIdsOf(b.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('B bloquea a A: 201 idempotente y la lista trae la identidad del otro', async () => {
    const blocked = await createBlock(b.token, { profileId: a.profileId });
    assert.equal(blocked.status, 201, JSON.stringify(blocked.body));
    assert.deepEqual(Object.keys(blocked.body).sort(), ['createdAt', 'profileId']);
    assert.equal(blocked.body.profileId, a.profileId);

    const again = await createBlock(b.token, { profileId: a.profileId });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.createdAt, blocked.body.createdAt, 'bloquear dos veces no crea otra fila');

    const rows = await blockRowsOf(REGION, b.profileId);
    assert.equal(rows.length, 1, 'una sola fila para el par');

    const list = await listBlocks(b.token);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.blocks.length, 1);
    assert.equal(list.body.blocks[0].block.profileId, a.profileId);
    assert.equal(list.body.blocks[0].peer.profileId, a.profileId);
    assert.ok(list.body.blocks[0].peer.nickname, 'la lista trae la identidad del otro');

    const mine = await listBlocks(a.token);
    assert.deepEqual(mine.body.blocks, [], 'el bloqueado no ve el bloqueo ajeno en su lista');
  });

  test('el par desaparece del discovery en las dos direcciones', async () => {
    const forB = await listDiscovery(b.token);
    assert.equal(idsOf(forB.body).includes(a.profileId), false, 'A no está para B');
    for (const botId of botIdsOf(a.profileId)) {
      assert.equal(idsOf(forB.body).includes(botId), false, `el ${botId} de A tampoco`);
    }

    const forA = await listDiscovery(a.token);
    assert.equal(idsOf(forA.body).includes(b.profileId), false, 'B no está para A (efecto simétrico)');
  });

  test('no hay ping en ninguna dirección: CHAT_BLOCKED', async () => {
    const fromA = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(fromA.status, 403, JSON.stringify(fromA.body));
    assert.equal(fromA.body.code, 'CHAT_BLOCKED');

    const fromB = await createPing(b.token, { targetProfileId: a.profileId });
    assert.equal(fromB.status, 403, JSON.stringify(fromB.body));
    assert.equal(fromB.body.code, 'CHAT_BLOCKED');
  });

  test('la conversación existente se lee pero no acepta mensajes: CHAT_BLOCKED', async () => {
    const readable = await listMessages(a.token, matchId);
    assert.equal(readable.status, 200, JSON.stringify(readable.body));
    assert.ok(readable.body.messages.length >= 1, 'la historia sigue legible');

    const send = await sendMessage(a.token, matchId, { clientMessageId: 'blocked', body: 'seguimos?' });
    assert.equal(send.status, 403, JSON.stringify(send.body));
    assert.equal(send.body.code, 'CHAT_BLOCKED');
  });

  test('bloquear un bot canoniza al dueño y desbloquear por bot también', async () => {
    // El bot de B: la fila tiene que guardar al dueño, no al bot. El service no
    // exige que el bot esté vivo para canonizar (el dueño es el que existe).
    const botId = `${b.profileId}-b1`;
    const blocked = await createBlock(a.token, { profileId: botId });
    assert.equal(blocked.status, 201, JSON.stringify(blocked.body));
    assert.equal(blocked.body.profileId, b.profileId, 'la fila guarda al dueño, no al bot');

    const rows = await blockRowsOf(REGION, a.profileId);
    assert.deepEqual(rows.map((row) => row.blocked_profile_id), [b.profileId]);

    // Desbloquear por el id del bot revierte el del dueño.
    assert.equal((await deleteBlock(a.token, botId)).status, 204);
    assert.deepEqual(await blockRowsOf(REGION, a.profileId), []);

    // Y B sigue bloqueando a A: se limpia para el caso de unblock.
    const unblock = await deleteBlock(b.token, a.profileId);
    assert.equal(unblock.status, 204);
    assert.equal((await deleteBlock(b.token, a.profileId)).status, 204, 'desbloquear dos veces es 204');
  });

  test('unblock revierte discovery, ping y chat', async () => {
    const forB = await listDiscovery(b.token);
    assert.ok(idsOf(forB.body).includes(a.profileId), 'A reaparece para B');

    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));

    const send = await sendMessage(a.token, matchId, { clientMessageId: 'unblocked', body: 'volvimos' });
    assert.equal(send.status, 201, JSON.stringify(send.body));

    await withDb((client) => client.query('DELETE FROM pings WHERE ping_id = $1', [ping.body.id]));
  });

  test('errores del bloqueo: auto-bloqueo 422 y perfil inexistente 404', async () => {
    const self = await createBlock(b.token, { profileId: b.profileId });
    assert.equal(self.status, 422, JSON.stringify(self.body));

    const unknown = await createBlock(b.token, { profileId: 'mx-nope' });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    assert.equal(unknown.body.code, 'PROFILE_NOT_FOUND');

    const missing = await createBlock(b.token, {});
    assert.equal(missing.status, 422, JSON.stringify(missing.body));
  });
});

describe('reportes', () => {
  let snapshot = [];
  let a;
  let b;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(6);
    b = await open(5);
    for (const session of [a, b]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([a.sessionId, b.sessionId], 600);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
  });

  after(async () => {
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('A reporta a B: 202 con acuse sin PII', async () => {
    const report = await createReport(a.token, { profileId: b.profileId, reason: 'harassment' });
    assert.equal(report.status, 202, JSON.stringify(report.body));
    assert.deepEqual(Object.keys(report.body).sort(), ['createdAt', 'reportId']);
    assert.equal(typeof report.body.reportId, 'string');
    assert.equal(report.body.reportId.length > 0, true);

    const rows = await reportRowsOf(REGION, a.profileId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reported_profile_id, b.profileId);
    assert.equal(rows[0].reason, 'harassment');
  });

  test('reportar no cambia el descubrimiento del reportado', async () => {
    const forB = await listDiscovery(b.token);
    assert.equal(forB.status, 200, JSON.stringify(forB.body));
    assert.ok(idsOf(forB.body).includes(a.profileId), 'B sigue viendo a A');
  });

  test('errores del reporte: motivo fuera del enum, auto-reporte y perfil inexistente', async () => {
    const reason = await createReport(a.token, { profileId: b.profileId, reason: 'me cae mal' });
    assert.equal(reason.status, 422, JSON.stringify(reason.body));

    const self = await createReport(a.token, { profileId: a.profileId, reason: 'spam' });
    assert.equal(self.status, 422, JSON.stringify(self.body));

    const unknown = await createReport(a.token, { profileId: 'mx-nope', reason: 'spam' });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
  });
});

describe('notificaciones', () => {
  let snapshot = [];
  let a;
  let b;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  const readIds = async (token) => {
    const list = await listNotifications(token);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    return list.body;
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(4);
    b = await open(3);
    for (const session of [a, b]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([a.sessionId, b.sessionId], 600);
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(a.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);

    // Para el caso del bot: el ping a `<b>-b1` exige que el bot exista, y lo
    // crea el ticker cuando B tiene presencia.
    await waitFor(
      () =>
        withDb(async (client) => {
          const { rows } = await client.query(
            'SELECT count(*)::int AS count FROM bots WHERE region_key = $1 AND owner_profile_id = $2',
            [REGION, b.profileId],
          );
          return rows[0].count === 2;
        }),
      { label: 'los bots de B', timeoutMs: 15_000 },
    );
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(a.profileId), ...botIdsOf(b.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('ping, match y mensaje generan avisos persistidos con el peer', async () => {
    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));

    const inbox = await readIds(b.token);
    assert.equal(inbox.unreadCount, 1, JSON.stringify(inbox));
    assert.equal(inbox.notifications.length, 1);
    const received = inbox.notifications[0];
    assert.equal(received.kind, 'ping.received');
    assert.equal(received.readAt, null);
    assert.equal(received.pingId, ping.body.id);
    assert.equal(received.matchId, null);
    assert.equal(received.peer.profileId, a.profileId);
    assert.ok(received.peer.nickname);

    const accepted = await acceptPing(b.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const forA = await readIds(a.token);
    assert.equal(forA.unreadCount, 1);
    assert.equal(forA.notifications[0].kind, 'match.created');
    assert.equal(forA.notifications[0].matchId, accepted.body.id);
    assert.equal(forA.notifications[0].peer.profileId, b.profileId);

    const send = await sendMessage(a.token, accepted.body.id, {
      clientMessageId: 'notif-1',
      body: 'hola de nuevo',
    });
    assert.equal(send.status, 201, JSON.stringify(send.body));

    const forB = await readIds(b.token);
    // El ping recibido sigue sin leer (nadie lo marcó) y el mensaje agrega uno.
    assert.equal(forB.unreadCount, 2, JSON.stringify(forB));
    const kinds = forB.notifications.map((item) => item.kind).sort();
    assert.deepEqual(kinds, ['message.created', 'ping.received']);
    const messageNotification = forB.notifications.find((item) => item.kind === 'message.created');
    assert.equal(messageNotification.matchId, accepted.body.id);
    assert.equal(messageNotification.messageId, send.body.id);
  });

  test('marcar una por id baja el contador y persiste', async () => {
    const before = await readIds(b.token);
    assert.ok(before.unreadCount >= 2, JSON.stringify(before));

    const newest = before.notifications[0];
    const marked = await markNotificationsRead(b.token, { notificationIds: [newest.id] });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(marked.body.marked, 1);
    assert.equal(marked.body.unreadCount, before.unreadCount - 1);

    const after = await readIds(b.token);
    assert.equal(after.unreadCount, before.unreadCount - 1);
    assert.equal(after.notifications.find((item) => item.id === newest.id).readAt !== null, true);

    const rows = await notificationRowsOf(REGION, b.profileId);
    assert.equal(rows.find((row) => row.notification_id === newest.id).read, true, 'persistido en la tabla');
  });

  test('marcar todas deja 0 y repetirlo es idempotente', async () => {
    const all = await markNotificationsRead(b.token);
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.ok(all.body.marked >= 1);
    assert.equal(all.body.unreadCount, 0);

    const again = await markNotificationsRead(b.token);
    assert.equal(again.body.marked, 0);
    assert.equal(again.body.unreadCount, 0);

    const list = await readIds(b.token);
    assert.equal(list.unreadCount, 0);
    for (const item of list.notifications) assert.notEqual(item.readAt, null);
  });

  test('la respuesta del bot también deja notificación para el humano', async () => {
    const ping = await createPing(a.token, { targetProfileId: `${b.profileId}-b1` });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    assert.equal(ping.body.status, 'accepted', 'el bot acepta solo');

    const sent = await sendMessage(a.token, ping.body.matchId, {
      clientMessageId: 'notif-bot',
      body: 'hola bot',
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));

    const notification = await waitFor(
      async () => {
        const list = await readIds(a.token);
        return list.notifications.find((item) => item.kind === 'message.created' && item.peer.sourceType === 'bot');
      },
      { label: 'la notificación de la respuesta del bot', timeoutMs: 10_000 },
    );
    assert.equal(notification.matchId, ping.body.matchId);
    assert.equal(notification.peer.profileId, `${b.profileId}-b1`);
  });

  test('un id ajeno se ignora y un body malformado es 422', async () => {
    const foreign = await markNotificationsRead(a.token, {
      notificationIds: ['00000000-0000-4000-8000-000000000000'],
    });
    assert.equal(foreign.status, 200, JSON.stringify(foreign.body));
    assert.equal(foreign.body.marked, 0);

    const malformed = await markNotificationsRead(a.token, { notificationIds: ['nope'] });
    assert.equal(malformed.status, 422, JSON.stringify(malformed.body));
  });
});

describe('cambio de zona: la conversación se cierra', () => {
  let snapshot = [];
  let a;
  let b;
  let matchId;
  const botId = (profileId) => `${profileId}-b1`;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  /** La zona con la que la conversación quedó atada, leída de la tabla. */
  const recordedZone = async () =>
    withDb(async (client) => {
      const { rows } = await client.query('SELECT bot_zone_key FROM matches WHERE match_id = $1', [matchId]);
      return rows[0]?.bot_zone_key;
    });

  /** La zona vigente del bot, leída de la tabla (no hay endpoint que la exponga). */
  const botZone = async () =>
    withDb(async (client) => {
      const { rows } = await client.query(
        'SELECT zone_key FROM bots WHERE region_key = $1 AND bot_profile_id = $2',
        [REGION, botId(b.profileId)],
      );
      return rows[0]?.zone_key;
    });

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(2);
    b = await open(1);
    for (const session of [a, b]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([a.sessionId, b.sessionId], 600);
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(b.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);

    await waitFor(
      () =>
        withDb(async (client) => {
          const { rows } = await client.query(
            'SELECT count(*)::int AS count FROM bots WHERE region_key = $1 AND owner_profile_id = $2',
            [REGION, b.profileId],
          );
          return rows[0].count === 2;
        }),
      { label: 'los bots de B', timeoutMs: 15_000 },
    );

    const ping = await createPing(a.token, { targetProfileId: botId(b.profileId) });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    matchId = ping.body.matchId;
    assert.equal(await recordedZone(), ZONE, 'el match nace con la zona del bot');
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId, ...botIdsOf(b.profileId)]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('el bot ya no está en la zona de la conversación: legible, MATCH_CLOSED al escribir', async () => {
    assert.equal(await botZone(), ZONE, 'el bot vive en cdmx');

    // La demo tiene **una** zona por región (`mx → cdmx`, `co → bogota`), así que
    // no hay una segunda zona real a la que mudar al dueño; y mover `bots.zone_key`
    // a mano lo deshace `reconcile()` en el tick siguiente (2 s), que es
    // exactamente el mecanismo real: el bot se vuelve a sembrar en su zona. Para
    // probar la regla de forma determinista se mueve el **otro** lado de la
    // comparación: la zona con la que nació la conversación. La invariante es la
    // misma (`matches.bot_zone_key` == `bots.zone_key`).
    await withDb((client) =>
      client.query('UPDATE matches SET bot_zone_key = $2 WHERE match_id = $1', [matchId, 'mx-otra-zona']),
    );

    const readable = await listMessages(a.token, matchId);
    assert.equal(readable.status, 200, JSON.stringify(readable.body), 'la historia sigue legible');

    const send = await sendMessage(a.token, matchId, { clientMessageId: 'zona-1', body: 'seguimos?' });
    assert.equal(send.status, 409, JSON.stringify(send.body));
    assert.equal(send.body.code, 'MATCH_CLOSED');

    assert.equal((await listMessages(a.token, matchId)).status, 200);
  });

  test('volver a la zona del bot reabre la conversación', async () => {
    await withDb(async (client) => {
      await client.query(
        `UPDATE matches m
            SET bot_zone_key = b.zone_key
           FROM bots b
          WHERE m.match_id = $1
            AND b.region_key = $2
            AND b.bot_profile_id = $3`,
        [matchId, REGION, botId(b.profileId)],
      );
    });
    const send = await sendMessage(a.token, matchId, { clientMessageId: 'zona-2', body: 'volvimos' });
    assert.equal(send.status, 201, JSON.stringify(send.body));
  });
});
