import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  botRows,
  clearPresence,
  deleteSessionsCreatedSince,
  expireBotLegs,
  extendPresence,
  logout,
  maxEventSeq,
  openSession,
  pollEvents,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
} from '../helpers.mjs';

/**
 * Bots derivados — Sprint 2, S2-B.
 *
 * Lo que este archivo fija:
 *
 *  - dos bots por humano vivo, con `profileId` estable (`<owner>-b1|b2`) y
 *    distinto del humano;
 *  - los bots se mueven por sus waypoints y lo publiques como `profile.moved`
 *    con `distanceM`/`bearingDeg`, sin una sola coordenada;
 *  - el stream de un humano **no** incluye sus propios bots, pero sus bots sí
 *    aparecen para los demás;
 *  - ghost = `DELETE /presence`: los bots propios desaparecen para el otro, en
 *    la lectura y en la tabla;
 *  - cap de 6 bots por observador, con el corte determinista;
 *  - aislamiento por región: mx no ve co.
 *
 * `extendPresence` empuja el vencimiento de las presencias del escenario: el TTL
 * de 12 s se prueba en `presence.test.mjs` y acá lo que se prueba es el mundo, no
 * el reloj. La API nunca lo ve: el filtro de lectura sigue siendo el mismo.
 */

const MX_ZONE = { demoZoneKey: 'cdmx' };
const CO_ZONE = { demoZoneKey: 'bogota' };

const botIdsOf = (ownerProfileId) => [`${ownerProfileId}-b1`, `${ownerProfileId}-b2`];

/** Perfiles nombrados en eventos de bot de un dueño concreto. */
function botProfilesIn(events, ownerProfileId) {
  return events
    .filter((event) => event.type === 'profile.moved')
    .map((event) => event.payload.profileId)
    .filter((profileId) => profileId.startsWith(`${ownerProfileId}-b`));
}

describe('bots: identidad, waypoints y cap', () => {
  let snapshot = [];
  /** 5 humanos en mx (slots 2..6). El de slot 2 es el observador. */
  let humans = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    for (const demoSlot of [2, 3, 4, 5, 6]) {
      const session = await openSession({ regionKey: 'mx', demoSlot });
      assert.equal(session.status, 201, JSON.stringify(session.body));
      assert.equal((await updatePresence(session.body.token, MX_ZONE)).status, 200);
      humans.push({ ...session.body, sessionId: sessionIdOf(session.body.token) });
    }
    await waitFor(() => botRows('mx').then((rows) => rows.length === humans.length * 2), {
      label: 'los 10 bots de 5 humanos',
    });
  });

  after(async () => {
    for (const human of humans) await logout(human.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('cada humano vivo arrastra exactamente 2 bots, con profileId propio y estable', async () => {
    const rows = await botRows('mx');
    for (const human of humans) {
      const own = rows.filter((row) => row.owner_profile_id === human.profileId);
      assert.equal(own.length, 2, `${human.profileId}: dos bots, ni uno más`);
      assert.deepEqual(
        own.map((row) => row.bot_profile_id).sort(),
        botIdsOf(human.profileId).sort(),
        `${human.profileId}: ids estables <owner>-b1/-b2`,
      );
      assert.deepEqual(
        own.map((row) => row.bot_index).sort(),
        [1, 2],
        `${human.profileId}: índices 1 y 2`,
      );
      assert.ok(
        own.every((row) => row.zone_key === 'cdmx'),
        `${human.profileId}: los bots viven en la zona del humano`,
      );
    }
  });

  test('los bots se mueven por sus waypoints y publican distancia y rumbo sin coordenadas', async () => {
    await extendPresence(humans.map((human) => human.sessionId));
    const before = await botRows('mx');
    const cursor = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;

    await expireBotLegs('mx');
    await waitFor(
      async () => {
        const now = await botRows('mx');
        return now.some(
          (row) =>
            before.find((old) => old.bot_profile_id === row.bot_profile_id)?.waypoint_index !==
            row.waypoint_index,
        );
      },
      { label: 'el avance de waypoint de los bots' },
    );

    const moved = await botRows('mx');
    for (const row of moved) {
      const previous = before.find((old) => old.bot_profile_id === row.bot_profile_id);
      assert.notEqual(row.waypoint_index, previous.waypoint_index, `${row.bot_profile_id}: no avanzó`);
      assert.ok(
        row.distance_m >= 200 && row.distance_m <= 5000,
        `${row.bot_profile_id}: distanceM fuera del contrato (${row.distance_m})`,
      );
      assert.ok(
        row.bearing_deg >= 0 && row.bearing_deg <= 359,
        `${row.bot_profile_id}: bearingDeg fuera del contrato (${row.bearing_deg})`,
      );
    }

    // El observador (slot 2) ve los bots ajenos moverse; sus propios bots no.
    const observer = humans[0];
    const page = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { cursor, limit: 100 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return response.body.events.filter((event) => event.type === 'profile.moved').length >= 4
          ? response.body
          : null;
      },
      { label: 'eventos profile.moved ajenos' },
    );

    const ownBots = botIdsOf(observer.profileId);
    const payloadFields = ['bearingDeg', 'distanceM', 'profileId'];
    for (const event of page.events) {
      assert.match(event.id, /^mx:[0-9]{12}$/, `id del envelope: ${event.id}`);
      assert.deepEqual(Object.keys(event).sort(), ['id', 'occurredAt', 'payload', 'type']);
      assert.ok(['profile.moved', 'profile.presence'].includes(event.type));
      assert.doesNotMatch(JSON.stringify(event), /"(?:lat|lng|lon|latitude|longitude)"/i, 'coordenadas en el payload');
      if (event.type !== 'profile.moved') continue;
      assert.deepEqual(Object.keys(event.payload).sort(), payloadFields, 'payload exacto');
      assert.ok(!ownBots.includes(event.payload.profileId), 'el stream propio trae un bot propio');
      assert.ok(event.payload.distanceM >= 200 && event.payload.distanceM <= 5000);
      assert.ok(event.payload.bearingDeg >= 0 && event.payload.bearingDeg <= 359);
    }
  });

  test('el humano no se ve a sí mismo, pero sus bots sí aparecen a los demás', async () => {
    await extendPresence(humans.map((human) => human.sessionId));
    const [observer, neighbour] = humans;

    const page = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { limit: 100 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return response.body.events.some(
          (event) => event.payload.profileId === `${neighbour.profileId}-b1`,
        )
          ? response.body
          : null;
      },
      { label: 'los bots del vecino en el stream del observador' },
    );

    const profiles = page.events.map((event) => event.payload.profileId);
    assert.ok(!profiles.includes(observer.profileId), 'el observador aparece en su propio stream');
    assert.ok(!profiles.some((id) => botIdsOf(observer.profileId).includes(id)), 'bots propios en el stream propio');
    assert.ok(profiles.includes(`${neighbour.profileId}-b1`), 'los bots ajenos sí se ven');

    // Desde el otro lado también: el vecino ve al observador, no a sí mismo.
    const mirror = await pollEvents(neighbour.token, { limit: 100 });
    const mirrored = mirror.body.events.map((event) => event.payload.profileId);
    assert.ok(!mirrored.some((id) => botIdsOf(neighbour.profileId).includes(id)));
    assert.ok(mirrored.includes(`${observer.profileId}-b1`));
  });

  test('con 3 humanos el observador ve 4 bots (por debajo del cap de 6)', async () => {
    await extendPresence(humans.map((human) => human.sessionId));
    const observer = humans[0];
    const [first, second] = humans.slice(1);

    // Dos humanos salen de escena: sus bots dejan de existir.
    for (const human of humans.slice(3)) {
      assert.equal((await clearPresence(human.token)).status, 204);
    }
    await waitFor(
      () => botRows('mx').then((rows) => rows.length === 3 * 2),
      { label: 'la retirada de los bots de los humanos en ghost' },
    );

    const cursor = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;
    await expireBotLegs('mx');
    const page = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { cursor, limit: 100 });
        const moved = response.body.events.filter((event) => event.type === 'profile.moved');
        return moved.length >= 4 ? moved : null;
      },
      { label: 'los 4 bots de 3 humanos' },
    );

    const visible = new Set(page.map((event) => event.payload.profileId));
    assert.deepEqual(
      [...visible].sort(),
      [...botIdsOf(first.profileId), ...botIdsOf(second.profileId)].sort(),
      '3 humanos ⇒ 2 dueños ajenos ⇒ 4 bots, y ningún bot propio',
    );
    assert.ok(visible.size <= 6, 'cap de 6 respetado');

    // Vuelven los dos humanos: 8 bots en la región.
    for (const human of humans.slice(3)) {
      assert.equal((await updatePresence(human.token, MX_ZONE)).status, 200);
    }
    await waitFor(() => botRows('mx').then((rows) => rows.length === humans.length * 2), {
      label: 'los 10 bots de vuelta',
    });
  });

  test('cap de 6 bots por observador: 5 humanos, 8 bots ajenos, 6 visibles', async () => {
    await extendPresence(humans.map((human) => human.sessionId));
    const observer = humans[0];
    const others = humans.slice(1);

    assert.equal(others.length * 2, 8, 'el escenario tiene 8 bots ajenos: el cap tiene que cortar');
    assert.equal((await botRows('mx')).filter((row) => row.owner_profile_id !== observer.profileId).length, 8);

    const cursor = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;
    await expireBotLegs('mx');
    const page = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { cursor, limit: 100 });
        const moved = response.body.events.filter((event) => event.type === 'profile.moved');
        return moved.length >= 6 ? moved : null;
      },
      { label: 'los bots visibles del observador' },
    );

    const visible = [...new Set(page.map((event) => event.payload.profileId))].sort();
    assert.equal(visible.length, 6, `el observador ve ${visible.length} bots, no 6`);

    // El corte es determinista: los 6 primeros por id, no "los que llegaron".
    const expected = others
      .flatMap((human) => botIdsOf(human.profileId))
      .sort()
      .slice(0, 6);
    assert.deepEqual(visible, expected, 'el cap no es determinista');
    assert.ok(visible.every((id) => !id.startsWith(observer.profileId)), 'el cap incluyó bots propios');
  });

  test('aislamiento por región: dos humanos en mx y dos en co no se ven', async () => {
    const mx = await openSession({ regionKey: 'mx', demoSlot: 8 });
    const coObserver = await openSession({ regionKey: 'co', demoSlot: 4 });
    const coSubject = await openSession({ regionKey: 'co', demoSlot: 5 });
    for (const [label, response] of [
      ['mx', mx],
      ['co observador', coObserver],
      ['co sujeto', coSubject],
    ]) {
      assert.equal(response.status, 201, `${label}: ${JSON.stringify(response.body)}`);
    }
    assert.equal((await updatePresence(mx.body.token, MX_ZONE)).status, 200);
    assert.equal((await updatePresence(coObserver.body.token, CO_ZONE)).status, 200);
    assert.equal((await updatePresence(coSubject.body.token, CO_ZONE)).status, 200);

    const mxSessionId = sessionIdOf(mx.body.token);
    const coObserverId = sessionIdOf(coObserver.body.token);
    const coSubjectId = sessionIdOf(coSubject.body.token);
    await waitFor(
      () =>
        botRows('co').then((rows) =>
          rows.some((row) => row.owner_profile_id === coSubject.body.profileId),
        ),
      { label: 'los bots de co' },
    );
    await extendPresence([mxSessionId, coObserverId, coSubjectId]);
    await expireBotLegs('co');

    const page = await waitFor(
      async () => {
        const response = await pollEvents(coObserver.body.token, { limit: 100 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return botProfilesIn(response.body.events, coSubject.body.profileId).length > 0
          ? response.body
          : null;
      },
      { label: 'los bots del vecino de co' },
    );

    for (const event of page.events) {
      assert.match(event.id, /^co:[0-9]{12}$/, `${event.id}: el stream de co entregó otro prefijo`);
      assert.ok(
        !event.payload.profileId.startsWith('mx-'),
        `${event.payload.profileId}: perfil de mx en el stream de co`,
      );
    }

    // Y al revés: el stream de mx no lleva un solo perfil de co.
    const mxPage = await pollEvents(mx.body.token, { limit: 100 });
    assert.equal(mxPage.status, 200);
    for (const event of mxPage.body.events) {
      assert.match(event.id, /^mx:[0-9]{12}$/);
      assert.ok(!event.payload.profileId.startsWith('co-'), `${event.payload.profileId}: perfil de co en mx`);
    }
    assert.deepEqual(botProfilesIn(mxPage.body.events, coSubject.body.profileId), [], 'mx ve los bots de co');

    await logout(mx.body.token);
    await logout(coObserver.body.token);
    await logout(coSubject.body.token);
  });
});

describe('bots: ghost y pausa', () => {
  let snapshot = [];
  let observer;
  let ghost;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const observerSession = await openSession({ regionKey: 'mx', demoSlot: 8 });
    const ghostSession = await openSession({ regionKey: 'mx', demoSlot: 9 });
    assert.equal(observerSession.status, 201, JSON.stringify(observerSession.body));
    assert.equal(ghostSession.status, 201, JSON.stringify(ghostSession.body));
    observer = { ...observerSession.body, sessionId: sessionIdOf(observerSession.body.token) };
    ghost = { ...ghostSession.body, sessionId: sessionIdOf(ghostSession.body.token) };
    assert.equal((await updatePresence(observer.token, MX_ZONE)).status, 200);
    assert.equal((await updatePresence(ghost.token, MX_ZONE)).status, 200);
    await waitFor(() => botRows('mx').then((rows) => rows.some((row) => row.owner_profile_id === ghost.profileId)), {
      label: 'los bots del humano que va a entrar en ghost',
    });
  });

  after(async () => {
    await logout(observer.token);
    await logout(ghost.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('ghost (DELETE /presence) retira los bots propios para el otro, en el acto', async () => {
    await extendPresence([observer.sessionId, ghost.sessionId]);

    // Punto de partida: el observador ve los bots del otro.
    const before = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { limit: 100 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return botProfilesIn(response.body.events, ghost.profileId).length > 0
          ? response.body
          : null;
      },
      { label: 'los bots del otro antes del ghost' },
    );
    const cursor = before.nextCursor;

    const cleared = await clearPresence(ghost.token);
    assert.equal(cleared.status, 204, JSON.stringify(cleared.body));

    // La tabla: los bots del fantasma ya no están.
    await waitFor(
      () =>
        botRows('mx').then((rows) => !rows.some((row) => row.owner_profile_id === ghost.profileId)),
      { label: 'la retirada de los bots del ghost' },
    );

    // La lectura: ni los bots nuevos ni los que ya estaban en el log.
    const after = await pollEvents(observer.token, { cursor, limit: 100 });
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.deepEqual(botProfilesIn(after.body.events, ghost.profileId), [], 'el ghost dejó ver sus bots');

    const offline = after.body.events.find(
      (event) => event.type === 'profile.presence' && event.payload.profileId === ghost.profileId,
    );
    assert.ok(offline, 'el ghost no avisó con profile.presence');
    assert.equal(offline.payload.online, false);
    assert.deepEqual(Object.keys(offline.payload).sort(), ['online', 'profileId']);

    // El dueño sigue con sesión viva: ghost es pausa de presencia, no logout.
    const profiles = await pollEvents(ghost.token, { limit: 1 });
    assert.equal(profiles.status, 200, 'el ghost cerró la sesión');

    // Y al volver, sus bots vuelven con los mismos ids.
    assert.equal((await updatePresence(ghost.token, MX_ZONE)).status, 200);
    const back = await waitFor(
      async () => {
        const rows = await botRows('mx');
        const own = rows.filter((row) => row.owner_profile_id === ghost.profileId);
        return own.length === 2 ? own : null;
      },
      { label: 'los bots del fantasma al volver' },
    );
    assert.deepEqual(
      back.map((row) => row.bot_profile_id).sort(),
      botIdsOf(ghost.profileId).sort(),
      'el ghost no cambia la identidad de los bots',
    );
  });
});
