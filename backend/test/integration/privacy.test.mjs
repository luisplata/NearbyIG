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
 * Privacidad de S5 (delta v0.5), recalibrada a humanos en `remove-bots`.
 *
 * Lo que fija este archivo, que es la promesa del sprint:
 *
 *  - ghost: el humano desaparece del discovery y del stream de los demás, sigue
 *    leyendo su propio descubrimiento (sin verse) y volver a `visible` lo
 *    reaparece con su aviso `online:true`;
 *  - bloqueo: el par deja de verse, no hay ping en ninguna dirección y la
 *    conversación existente no acepta mensajes nuevos (`403 CHAT_BLOCKED`);
 *    desbloquear lo revierte. Un id que no está en el catálogo no se bloquea;
 *  - reporte: queda registrado, el acuse no expone PII y no cambia el
 *    descubrimiento;
 *  - notificaciones: ping, match y mensaje generan avisos persistidos con el
 *    peer, `unreadCount` cuenta bien y marcar (todas o por id) lo baja.
 *
 * Aislamiento: cada escenario abre sus slots y borra lo suyo (pings, matches,
 * bloqueos, reportes y notificaciones de los perfiles del escenario) y las
 * sesiones que creó.
 */

const REGION = 'mx';
const ZONE = 'cdmx';

const idsOf = (body) => body.results.map((row) => row.profileId);

describe('ghost: online pero invisible', () => {
  let snapshot = [];
  let a;
  let b;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  /** Página del log de la región desde `seq` inclusive. */
  const eventsSince = async (token, seq) =>
    pollEvents(token, { cursor: `${REGION}:${String(seq).padStart(12, '0')}`, limit: 100 });

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
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('B ve a A; en ghost, A desaparece del descubrimiento', async () => {
    const before = await listDiscovery(b.token);
    assert.equal(before.status, 200, JSON.stringify(before.body));
    assert.deepEqual(idsOf(before.body), [a.profileId], 'B no ve a A visible');

    const ghost = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' });
    assert.equal(ghost.status, 200, JSON.stringify(ghost.body));
    assert.equal(ghost.body.visibility, 'ghost');
    assert.equal(ghost.body.online, true, 'ghost no apaga la presencia');
    assert.equal(await presenceVisibility(a.sessionId), 'ghost');

    const hidden = await listDiscovery(b.token);
    assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
    assert.deepEqual(idsOf(hidden.body), [], 'A aparece para B estando en ghost');
  });

  test('en ghost, A sigue viendo a los demás pero no se ve a sí mismo', async () => {
    // Contrato v0.5: ghost es "online pero invisible" — la sesión sigue viva y
    // **sigue viendo** a los demás; lo que se retira es su propia fila para
    // terceros. El perfil propio nunca aparece, tampoco acá.
    const own = await listDiscovery(a.token);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(idsOf(own.body), [b.profileId], 'el dueño en ghost dejó de ver a los demás');
    assert.ok(!idsOf(own.body).includes(a.profileId), 'el dueño en ghost se ve a sí mismo');
  });

  test('el stream de B recibe el aviso online:false de A en ghost', async () => {
    // Baseline: **visible** y sin evento pendiente que confunda la lectura.
    assert.equal((await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'visible' })).status, 200);
    const seq = await maxEventSeq(REGION);

    // El cursor se toma **antes** del PUT para que la página incluya el aviso.
    assert.equal((await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' })).status, 200);
    const offline = await waitFor(
      async () => {
        const page = await eventsSince(b.token, seq);
        assert.equal(page.status, 200, JSON.stringify(page.body));
        return (
          page.body.events.find(
            (event) => event.type === 'profile.presence' && event.payload.profileId === a.profileId,
          ) ?? null
        );
      },
      { label: 'el online:false de A en ghost' },
    );
    assert.equal(offline.payload.online, false, 'ghost avisa online:false para que el cliente lo saque');
  });

  test('volver a visible reaparece para B y avisa online:true', async () => {
    const seq = await maxEventSeq(REGION);
    const visible = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'visible' });
    assert.equal(visible.status, 200, JSON.stringify(visible.body));
    assert.equal(visible.body.visibility, 'visible');

    const back = await waitFor(
      async () => {
        const page = await eventsSince(b.token, seq);
        return (
          page.body.events.find(
            (event) => event.type === 'profile.presence' && event.payload.profileId === a.profileId,
          ) ?? null
        );
      },
      { label: 'el online:true de A al volver' },
    );
    assert.equal(back.payload.online, true);

    const seen = await listDiscovery(b.token);
    assert.deepEqual(idsOf(seen.body), [a.profileId], 'A no reaparece para B');
  });

  test('un PUT sin visibility conserva el ghost (el heartbeat no lo saca)', async () => {
    const ghost = await updatePresence(a.token, { demoZoneKey: ZONE, visibility: 'ghost' });
    assert.equal(ghost.status, 200, JSON.stringify(ghost.body));

    // El cliente late cada pocos segundos sin repetir `visibility`.
    const beat = await updatePresence(a.token, { demoZoneKey: ZONE });
    assert.equal(beat.status, 200, JSON.stringify(beat.body));
    assert.equal(beat.body.visibility, 'ghost', 'omitir visibility no devuelve a visible');

    const hidden = await listDiscovery(b.token);
    assert.deepEqual(idsOf(hidden.body), [], 'el heartbeat sacó a A del ghost');

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
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
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
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
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
    assert.deepEqual(idsOf(forB.body), [], 'A no está para B');
    const forA = await listDiscovery(a.token);
    assert.deepEqual(idsOf(forA.body), [], 'B no está para A (efecto simétrico)');
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

  test('un perfil fuera del catálogo no se bloquea y desbloquearlo es un no-op', async () => {
    // `mx-p01-b1` era una identidad sintética: con la población fuera del
    // esquema no hay fila que bloquear, ni canónica ni derivada.
    const ghostId = 'mx-p01-b1';
    const blocked = await createBlock(a.token, { profileId: ghostId });
    assert.equal(blocked.status, 404, JSON.stringify(blocked.body));
    assert.equal(blocked.body.code, 'PROFILE_NOT_FOUND');

    // Borrar es idempotente y no exige que el perfil exista: 204.
    assert.equal((await deleteBlock(a.token, ghostId)).status, 204);
    assert.deepEqual(await blockRowsOf(REGION, a.profileId), []);

    // Y no se canoniza a nadie: no existe un dueño detrás de ese id.
    const bBlocks = await blockRowsOf(REGION, b.profileId);
    assert.deepEqual(
      bBlocks.map((row) => row.blocked_profile_id),
      [a.profileId],
      'el bloqueo de B dejó de apuntar a A',
    );

    // Se limpia el bloqueo de B para el caso de unblock.
    const unblock = await deleteBlock(b.token, a.profileId);
    assert.equal(unblock.status, 204);
    assert.equal((await deleteBlock(b.token, a.profileId)).status, 204, 'desbloquear dos veces es 204');
  });

  test('unblock revierte discovery, ping y chat', async () => {
    const forB = await listDiscovery(b.token);
    assert.deepEqual(idsOf(forB.body), [a.profileId], 'A no reaparece para B');

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
    assert.deepEqual(idsOf(forB.body), [a.profileId], 'B dejó de ver a A');
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
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
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
    assert.equal(received.peer.sourceType, 'human');
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
