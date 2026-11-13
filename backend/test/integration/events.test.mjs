import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  api,
  assertStackUp,
  botRows,
  clearPresence,
  createStreamTicket,
  deleteSessionsCreatedSince,
  eventRowsIn,
  expireBotLegs,
  extendPresence,
  logout,
  maxEventSeq,
  openEventStream,
  openSession,
  pollEvents,
  seqOfId,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
} from '../helpers.mjs';

/**
 * `GET /events` y `GET /events/poll` — Sprint 2, S2-B.
 *
 * Lo que fija este archivo:
 *
 *  - el stream se autentica con el ticket de 30 s y un solo uso (reuso → 401
 *    `TICKET_REUSED`, ausente → 401 `TICKET_EXPIRED`), no con el JWT;
 *  - `Last-Event-ID` reanuda en `seq + 1` y no reentrega el último visto;
 *  - un cursor malformado o de otra región es 422, `limit` fuera de 1..500 es 422;
 *  - una página vacía no avanza el cursor;
 *  - SSE y polling son **la misma secuencia** desde el mismo cursor: mismos `id`,
 *    mismo orden, mismo envelope; el dedupe es `seq <= lastSeen`;
 *  - `profile.presence` se emite en la transición (a online y a offline), no en
 *    cada `PUT`;
 *  - ningún payload lleva coordenadas y el stream sólo entrega la región de la
 *    sesión.
 */

const MX_ZONE = { demoZoneKey: 'cdmx' };
const CO_ZONE = { demoZoneKey: 'bogota' };
const ENVELOPE_FIELDS = ['id', 'occurredAt', 'payload', 'type'];
const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Pagina desde `cursor` (exclusivo) hasta pasar `untilSeq`, sin repetidos. */
async function pollUntil(token, cursor, untilSeq) {
  const collected = [];
  let next = cursor;
  for (let guard = 0; guard < 50; guard += 1) {
    const response = await pollEvents(token, { cursor: next, limit: 2 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { events, nextCursor, hasMore } = response.body;
    collected.push(...events.filter((event) => seqOfId(event.id) <= untilSeq));
    const reached = events.length === 0 || seqOfId(nextCursor) >= untilSeq;
    const lastDelivered = collected.length === 0 ? cursor : collected[collected.length - 1].id;
    if (reached || !hasMore) return { events: collected, nextCursor: lastDelivered };
    next = nextCursor;
  }
  throw new Error('pollUntil: demasiadas páginas');
}

describe('events: ticket, cursor, polling y SSE', () => {
  let snapshot = [];
  let observer;
  let neighbour;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const observerSession = await openSession({ regionKey: 'mx', demoSlot: 9 });
    const neighbourSession = await openSession({ regionKey: 'mx', demoSlot: 10 });
    assert.equal(observerSession.status, 201, JSON.stringify(observerSession.body));
    assert.equal(neighbourSession.status, 201, JSON.stringify(neighbourSession.body));
    observer = { ...observerSession.body, sessionId: sessionIdOf(observerSession.body.token) };
    neighbour = { ...neighbourSession.body, sessionId: sessionIdOf(neighbourSession.body.token) };
    assert.equal((await updatePresence(observer.token, MX_ZONE)).status, 200);
    assert.equal((await updatePresence(neighbour.token, MX_ZONE)).status, 200);

    // Un tick del mundo asegura bots y movimiento: sin eventos no hay paridad
    // que comparar.
    await waitFor(
      () => eventRowsIn('mx').then((rows) => rows.some((row) => row.type === 'profile.moved')),
      { label: 'el primer profile.moved del ticker' },
    );
    await extendPresence([observer.sessionId, neighbour.sessionId]);
  });

  after(async () => {
    await logout(observer.token);
    await logout(neighbour.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('sin ticket es 401 TICKET_EXPIRED y el ticket se consume una sola vez', async () => {
    const missing = await openEventStream('');
    assert.equal(missing.status, 401, JSON.stringify(missing.body));
    assert.equal(missing.body.code, 'TICKET_EXPIRED');

    const issued = await createStreamTicket(observer.token);
    assert.equal(issued.status, 201, JSON.stringify(issued.body));

    const first = await openEventStream(issued.body.ticket, { maxMs: 1_500 });
    assert.equal(first.status, 200);
    assert.match(String(first.headers.get('content-type')), /^text\/event-stream/);
    assert.equal(first.headers.get('cache-control'), 'no-cache');

    const reused = await openEventStream(issued.body.ticket, { maxMs: 1_500 });
    assert.equal(reused.status, 401, JSON.stringify(reused.body));
    assert.equal(reused.body.code, 'TICKET_REUSED');
  });

  test('el stream abre con retry: 5000 y manda id/event/data por frame', async () => {
    const issued = await createStreamTicket(observer.token);
    const maxSeq = await maxEventSeq('mx');
    const stream = await openEventStream(issued.body.ticket, { untilSeq: maxSeq, maxMs: 6_000 });

    assert.equal(stream.status, 200);
    assert.ok(stream.head.startsWith('retry: 5000'), `preámbulo: ${JSON.stringify(stream.head)}`);
    assert.ok(stream.frames.length > 0, 'el replay no entregó ningún frame');

    for (const frame of stream.frames) {
      assert.match(frame.id, /^mx:[0-9]{12}$/);
      assert.ok(['profile.moved', 'profile.presence'].includes(frame.type), frame.type);
      assert.deepEqual(Object.keys(frame.data).sort(), ENVELOPE_FIELDS);
      assert.equal(frame.data.id, frame.id);
      assert.equal(frame.data.type, frame.type);
    }
  });

  test('cursor malformado, de otra región o limit fuera de rango son 422', async () => {
    for (const [query, label] of [
      ['cursor=mx%3A42', 'seq sin 12 dígitos'],
      ['cursor=mx%3A00000000004a', 'seq no numérico'],
      ['cursor=MX%3A000000000001', 'región en mayúsculas'],
      ['cursor=co%3A000000000001', 'cursor de otra región'],
      ['limit=0', 'limit por debajo'],
      ['limit=501', 'limit por encima'],
      ['limit=abc', 'limit no numérico'],
      ['limit=1.5', 'limit con decimales'],
    ]) {
      const response = await pollEvents(observer.token, {});
      assert.equal(response.status, 200, 'sanity: sin query la página es válida');
      const rejected = await api(`/events/poll?${query}`, { token: observer.token });
      assert.equal(rejected.status, 422, `${label}: ${JSON.stringify(rejected.body)}`);
      assert.equal(rejected.body.code, 'VALIDATION_FAILED', label);
    }
  });

  test('polling: envelope cerrado, orden ascendente por seq y sin coordenadas', async () => {
    const response = await pollEvents(observer.token, { limit: 100 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(Object.keys(response.body).sort(), ['events', 'hasMore', 'nextCursor']);
    assert.ok(response.body.events.length > 0, 'no hay eventos que revisar');

    let previous = 0;
    for (const event of response.body.events) {
      assert.deepEqual(Object.keys(event).sort(), ENVELOPE_FIELDS);
      assert.match(event.id, /^mx:[0-9]{12}$/);
      assert.match(event.occurredAt, RFC3339_MS);
      assert.ok(seqOfId(event.id) > previous, `${event.id}: el orden no es por seq`);
      previous = seqOfId(event.id);
      assert.doesNotMatch(JSON.stringify(event), /"(?:lat|lng|lon|latitude|longitude)"/i);

      if (event.type === 'profile.moved') {
        assert.deepEqual(Object.keys(event.payload).sort(), ['bearingDeg', 'distanceM', 'profileId']);
        assert.ok(Number.isInteger(event.payload.distanceM));
        assert.ok(event.payload.distanceM >= 200 && event.payload.distanceM <= 5000);
        assert.ok(Number.isInteger(event.payload.bearingDeg));
        assert.ok(event.payload.bearingDeg >= 0 && event.payload.bearingDeg <= 359);
      } else {
        assert.deepEqual(Object.keys(event.payload).sort(), ['online', 'profileId']);
        assert.equal(typeof event.payload.online, 'boolean');
      }
    }

    assert.equal(response.body.hasMore, response.body.events.length === 100);
  });

  test('una página vacía no avanza el cursor y el dedupe es seq <= lastSeen', async () => {
    const future = 'mx:999999999999';
    const empty = await pollEvents(observer.token, { cursor: future });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.events, []);
    assert.equal(empty.body.nextCursor, future, 'la página vacía movió el cursor');
    assert.equal(empty.body.hasMore, false);

    // El mismo cursor, dos veces: mismo conjunto, sin reentrega del último visto.
    const first = await pollEvents(observer.token, { limit: 3 });
    assert.ok(first.body.events.length > 0);
    const cursor = first.body.events[0].id;
    const once = await pollEvents(observer.token, { cursor, limit: 100 });
    const twice = await pollEvents(observer.token, { cursor, limit: 100 });
    assert.deepEqual(twice.body, once.body, 'dos lecturas del mismo cursor no coinciden');
    assert.ok(
      once.body.events.every((event) => seqOfId(event.id) > seqOfId(cursor)),
      'el replay reentregó el último visto',
    );
    assert.equal(new Set(once.body.events.map((event) => event.id)).size, once.body.events.length);
  });

  test('paridad SSE↔polling: mismo cursor ⇒ mismo id, orden y envelope', async () => {
    await extendPresence([observer.sessionId, neighbour.sessionId]);
    // Un empujón del mundo antes de congelar el borde: hay al menos un
    // `profile.moved` fresco de cada bot visible.
    await expireBotLegs('mx');
    await waitFor(
      async () => {
        const page = await pollEvents(observer.token, { limit: 100 });
        return page.body.events.filter((event) => event.type === 'profile.moved').length >= 2
          ? page.body
          : null;
      },
      { label: 'los profile.moved del empujón' },
    );

    const maxSeq = await maxEventSeq('mx');
    const first = await pollEvents(observer.token, { limit: 2 });
    const cursor = first.body.events[0].id;

    const polled = await pollUntil(observer.token, cursor, maxSeq);
    assert.ok(polled.events.length >= 2, `pocos eventos para comparar (${polled.events.length})`);

    const issued = await createStreamTicket(observer.token);
    const stream = await openEventStream(issued.body.ticket, { lastEventId: cursor, untilSeq: maxSeq, maxMs: 8_000 });
    assert.equal(stream.status, 200, JSON.stringify(stream.body));
    const frames = stream.frames.filter((frame) => seqOfId(frame.id) <= maxSeq);

    assert.deepEqual(
      frames.map((frame) => frame.id),
      polled.events.map((event) => event.id),
      'SSE y polling no entregan el mismo id/orden desde el mismo cursor',
    );
    assert.deepEqual(
      frames.map((frame) => frame.data),
      polled.events,
      'el envelope de `data:` no es el mismo que el de `events[]`',
    );
    assert.equal(
      polled.nextCursor,
      frames[frames.length - 1]?.id ?? cursor,
      'el nextCursor del polling no coincide con el último frame del SSE',
    );

    // `Last-Event-ID` tampoco reentrega el último visto en un segundo stream.
    const issuedAgain = await createStreamTicket(observer.token);
    const resumed = await openEventStream(issuedAgain.body.ticket, {
      lastEventId: cursor,
      untilSeq: maxSeq,
      maxMs: 8_000,
    });
    assert.deepEqual(
      resumed.frames.filter((frame) => seqOfId(frame.id) <= maxSeq).map((frame) => frame.id),
      frames.map((frame) => frame.id),
      'reabrir el stream desde el mismo Last-Event-ID no es idempotente',
    );
  });

  test('profile.presence se emite en la transición, no en cada PUT', async () => {
    const subject = await openSession({ regionKey: 'mx', demoSlot: 6 });
    assert.equal(subject.status, 201, JSON.stringify(subject.body));
    const subjectId = sessionIdOf(subject.body.token);
    const cursor = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;

    assert.equal((await updatePresence(subject.body.token, MX_ZONE)).status, 200);
    await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { cursor, limit: 100 });
        return response.body.events.some(
          (event) => event.type === 'profile.presence' && event.payload.profileId === subject.body.profileId,
        )
          ? response.body
          : null;
      },
      { label: 'el profile.presence de la transición a online' },
    );

    // Segundo PUT (renovar presencia): no es una transición, no hay evento.
    const afterOnline = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;
    assert.equal((await updatePresence(subject.body.token, MX_ZONE)).status, 200);
    const quiet = await pollEvents(observer.token, { cursor: afterOnline, limit: 100 });
    assert.deepEqual(
      quiet.body.events.filter((event) => event.payload.profileId === subject.body.profileId),
      [],
      'renovar presencia emitió un evento de presencia',
    );

    // DELETE: transición a offline.
    const beforeOffline = `mx:${String(await maxEventSeq('mx')).padStart(12, '0')}`;
    assert.equal((await clearPresence(subject.body.token)).status, 204);
    const offline = await waitFor(
      async () => {
        const response = await pollEvents(observer.token, { cursor: beforeOffline, limit: 100 });
        return (
          response.body.events.find(
            (event) =>
              event.type === 'profile.presence' && event.payload.profileId === subject.body.profileId,
          ) ?? null
        );
      },
      { label: 'el profile.presence de la transición a offline' },
    );
    assert.equal(offline.payload.online, false);

    await logout(subject.body.token);
  });

  test('aislamiento por región: el stream de co no entrega nada de mx', async () => {
    const coObserver = await openSession({ regionKey: 'co', demoSlot: 4 });
    const coSubject = await openSession({ regionKey: 'co', demoSlot: 5 });
    assert.equal(coObserver.status, 201, JSON.stringify(coObserver.body));
    assert.equal(coSubject.status, 201, JSON.stringify(coSubject.body));
    assert.equal((await updatePresence(coObserver.body.token, CO_ZONE)).status, 200);
    assert.equal((await updatePresence(coSubject.body.token, CO_ZONE)).status, 200);
    await extendPresence([sessionIdOf(coObserver.body.token), sessionIdOf(coSubject.body.token)]);
    await waitFor(
      () =>
        botRows('co').then((rows) =>
          rows.some((row) => row.owner_profile_id === coSubject.body.profileId),
        ),
      { label: 'los bots de co' },
    );
    await expireBotLegs('co');

    const response = await waitFor(
      async () => {
        const page = await pollEvents(coObserver.body.token, { limit: 100 });
        assert.equal(page.status, 200, JSON.stringify(page.body));
        return page.body.events.length > 0 ? page.body : null;
      },
      { label: 'eventos de co' },
    );

    for (const event of response.events) {
      assert.match(event.id, /^co:[0-9]{12}$/, `${event.id}: prefijo ajeno en el stream de co`);
      assert.ok(!event.payload.profileId.startsWith('mx-'), `${event.payload.profileId}: perfil de mx en co`);
    }

    // El stream de mx tampoco lleva eventos de co.
    const mxPage = await pollEvents(observer.token, { limit: 100 });
    for (const event of mxPage.body.events) {
      assert.match(event.id, /^mx:[0-9]{12}$/);
      assert.ok(!event.payload.profileId.startsWith('co-'), `${event.payload.profileId}: perfil de co en mx`);
    }

    await logout(coObserver.body.token);
    await logout(coSubject.body.token);
  });

  test('el log no guarda coordenadas en ningún payload', async () => {
    for (const regionKey of ['mx', 'co']) {
      for (const row of await eventRowsIn(regionKey)) {
        assert.doesNotMatch(
          JSON.stringify(row.payload),
          /"(?:lat|lng|lon|latitude|longitude|point|center|position)"/i,
          `${regionKey}:${row.seq}: payload con geometría`,
        );
      }
    }
  });
});
