import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  acceptPing,
  activeSlots,
  assertStackUp,
  blockRowsOf,
  clearPrivacyOf,
  createBlock,
  createPing,
  createReport,
  deletePingsOf,
  deleteSessionsCreatedSince,
  expireSession,
  extendPresence,
  listDiscovery,
  listNotifications,
  notificationRowsOf,
  openSession,
  reportRowsOf,
  resetGlobal,
  resetSelf,
  restoreSessions,
  sendMessage,
  sessionIdOf,
  snapshotSessionIds,
  snapshotSessions,
  updatePresence,
  withDb,
} from '../helpers.mjs';

/**
 * Expiración de sesión y reset — recalibrado a humanos en `remove-bots`.
 *
 * Dos preguntas:
 *
 *  1. Cuando una sesión vence, ¿queda presencia "viva" colgando? El TTL es un
 *     filtro de lectura, así que la presencia deja de contar en el instante y el
 *     perfil sale del radar ajeno. Este archivo lo verifica con el reloj real (no
 *     se inventa un cron).
 *  2. Reset propio y global: ¿limpian bloqueos, reportes, notificaciones y el
 *     estado efímero sin tocar lo ajeno? El reset propio borra **lo mío**; el
 *     bloqueo que otra persona puso sobre mí es de esa persona y no se toca.
 */

const REGION = 'mx';
const ZONE = 'cdmx';

describe('expiración de sesión: la presencia deja de contar', () => {
  let snapshot = [];
  let expiring;
  let observer;

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    expiring = await open(6);
    observer = await open(7);
    for (const session of [expiring, observer]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([observer.sessionId], 600);
  });

  after(async () => {
    await deletePingsOf(REGION, [expiring.profileId, observer.profileId]);
    await clearPrivacyOf(REGION, [expiring.profileId, observer.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('al vencer, la sesión deja de servir y el perfil sale del radar ajeno', async () => {
    await expireSession(expiring.sessionId);

    assert.equal((await listNotifications(expiring.token)).status, 401, 'el token vencido no lee');
    assert.equal((await activeSlots(REGION)).includes(6), false, 'el slot quedó libre');

    // La presencia ya no cuenta: toda lectura que la usa (discovery, pings) la
    // cruza contra la sesión viva, y esta sesión no lo está. La fila puede seguir
    // hasta su propio TTL o el reset; lo que no puede es contar.
    const effective = await withDb(async (client) => {
      const { rows } = await client.query(
        `SELECT count(*)::int AS count
           FROM presence p
           JOIN sessions s ON s.session_id = p.session_id
          WHERE p.session_id = $1
            AND p.expires_at > now()
            AND s.revoked_at IS NULL
            AND s.expires_at > now()`,
        [expiring.sessionId],
      );
      return rows[0].count;
    });
    assert.equal(effective, 0, 'la presencia no cuenta sin sesión viva');

    // Y el único humano que queda vivo no tiene contrapartes que descubrir.
    const seen = await listDiscovery(observer.token);
    assert.equal(seen.status, 200, JSON.stringify(seen.body));
    assert.deepEqual(
      seen.body.results.map((row) => row.profileId),
      [],
      'el perfil vencido sigue en el radar ajeno',
    );
  });

  test('el slot vencido se puede reclamar sin tocar nada más', async () => {
    const reclaimed = await openSession({ regionKey: REGION, demoSlot: 6 });
    assert.equal(reclaimed.status, 201, JSON.stringify(reclaimed.body));
    assert.equal(reclaimed.body.profileId, expiring.profileId);
    const fresh = { token: reclaimed.body.token };
    assert.equal((await listNotifications(fresh.token)).status, 200, 'la sesión nueva sirve');
  });
});

describe('reset propio: limpia lo mío y no lo ajeno', () => {
  let snapshot = [];
  let a;
  let b;
  // Un perfil del catálogo que **no** es el slot de ninguna sesión del escenario
  // (A ocupa el 5; bloquearse a sí mismo es 422).
  const unrelatedTarget = 'mx-p08';

  const open = async (slot) => {
    const session = await openSession({ regionKey: REGION, demoSlot: slot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    return { ...session.body, sessionId: sessionIdOf(session.body.token) };
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    a = await open(5);
    b = await open(4);
    for (const session of [a, b]) {
      const presence = await updatePresence(session.token, { demoZoneKey: ZONE });
      assert.equal(presence.status, 200, JSON.stringify(presence.body));
    }
    await extendPresence([a.sessionId, b.sessionId], 600);
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);

    // A se relaciona con B (ping → match → mensaje) y bloquea/reporta a un
    // tercero del catálogo que no tiene sesión en el escenario.
    const ping = await createPing(a.token, { targetProfileId: b.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    const accepted = await acceptPing(b.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(
      (await sendMessage(a.token, accepted.body.id, { clientMessageId: 'reset-1', body: 'hola' })).status,
      201,
    );

    assert.equal((await createBlock(a.token, { profileId: unrelatedTarget })).status, 201);
    assert.equal((await createReport(a.token, { profileId: unrelatedTarget, reason: 'spam' })).status, 202);
    assert.equal((await createBlock(b.token, { profileId: a.profileId })).status, 201);
  });

  after(async () => {
    await deletePingsOf(REGION, [a.profileId, b.profileId]);
    await clearPrivacyOf(REGION, [a.profileId, b.profileId]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('el reset de A limpia lo suyo y deja intacto lo de B', async () => {
    const before = await listNotifications(a.token);
    assert.ok(before.body.unreadCount >= 1, JSON.stringify(before.body));

    const reset = await resetSelf(a.token);
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal(reset.body.scope, 'self');
    assert.equal(reset.body.sessionsDeleted, 1);

    assert.equal((await activeSlots(REGION)).includes(5), false, 'el slot 5 quedó libre');
    assert.deepEqual(await blockRowsOf(REGION, a.profileId), [], 'sus bloqueos se fueron');
    assert.deepEqual(await reportRowsOf(REGION, a.profileId), [], 'sus reportes se fueron');
    assert.deepEqual(await notificationRowsOf(REGION, a.profileId), [], 'sus notificaciones se fueron');

    // El bloqueo que B puso sobre A sigue siendo de B: reset por usuario no
    // afecta a otros, y los avisos de B tampoco se tocaron (son suyos).
    const rows = await blockRowsOf(REGION, b.profileId);
    assert.deepEqual(
      rows.map((row) => row.blocked_profile_id),
      [a.profileId],
      'reset por usuario no afecta a otros',
    );
    const own = await notificationRowsOf(REGION, b.profileId);
    assert.ok(own.length >= 1, JSON.stringify(own));
  });
});

describe('reset global: la demo vuelve a cero', () => {
  let snapshot = [];
  let sessions = [];

  before(async () => {
    await assertStackUp();
    sessions = await snapshotSessions();
    snapshot = await snapshotSessionIds();

    // Algo de cada tabla nueva, para que el reset tenga qué borrar.
    const a = await openSession({ regionKey: REGION, demoSlot: 3 });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await openSession({ regionKey: REGION, demoSlot: 2 });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    await updatePresence(a.body.token, { demoZoneKey: ZONE });
    await updatePresence(b.body.token, { demoZoneKey: ZONE });
    await extendPresence([sessionIdOf(a.body.token), sessionIdOf(b.body.token)], 600);

    const ping = await createPing(a.body.token, { targetProfileId: b.body.profileId });
    assert.equal(ping.status, 201, JSON.stringify(ping.body));
    const accepted = await acceptPing(b.body.token, ping.body.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal((await sendMessage(a.body.token, accepted.body.id, { clientMessageId: 'g-1', body: 'hola' })).status, 201);

    assert.equal((await createBlock(a.body.token, { profileId: b.body.profileId })).status, 201);
    assert.equal((await createReport(a.body.token, { profileId: b.body.profileId, reason: 'other' })).status, 202);
  });

  after(async () => {
    // El reset global borra sesiones ajenas: se reponen las que había.
    await restoreSessions(sessions);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('el reset global vacía el estado de demo y libera los slots', async () => {
    const counts = async () =>
      withDb(async (client) => {
        const { rows } = await client.query(`
          SELECT (SELECT count(*)::int FROM blocks) AS blocks,
                 (SELECT count(*)::int FROM reports) AS reports,
                 (SELECT count(*)::int FROM notifications) AS notifications,
                 (SELECT count(*)::int FROM pings) AS pings,
                 (SELECT count(*)::int FROM matches) AS matches,
                 (SELECT count(*)::int FROM messages) AS messages,
                 (SELECT count(*)::int FROM sessions) AS sessions,
                 (SELECT count(*)::int FROM presence) AS presence,
                 (SELECT count(*)::int FROM events) AS events
        `);
        return rows[0];
      });

    const before = await counts();
    assert.ok(
      before.blocks > 0 &&
        before.reports > 0 &&
        before.notifications > 0 &&
        before.pings > 0 &&
        before.matches > 0 &&
        before.messages > 0 &&
        before.sessions > 0,
      JSON.stringify(before),
    );

    const reset = await resetGlobal();
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal(reset.body.scope, 'global');
    assert.deepEqual(
      reset.body.regions.map((region) => region.freeSlots),
      [10, 10],
      'los 10 slots de cada región quedan libres',
    );

    // Lo que el reset deja atrás: nada de estado de demo. La presencia cae en
    // cascada con la sesión y el log de eventos se vacía para que el `seq` de
    // cada región vuelva a empezar.
    assert.deepEqual(await counts(), {
      blocks: 0,
      reports: 0,
      notifications: 0,
      pings: 0,
      matches: 0,
      messages: 0,
      sessions: 0,
      presence: 0,
      events: 0,
    });
  });
});
