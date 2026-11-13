/**
 * Contrato de eventos: envelope, replay y paridad entre las dos proyecciones.
 *
 * El log es el artefacto congelado (`contract/event/sample-log.json`): 40
 * entradas, 39 `seq` únicos por región y un duplicado idéntico a propósito (el
 * server puede reentregar; el cliente descarta `seq <= lastSeen`). Las funciones
 * de `scripts/lib/events.mjs` son puras, así que SSE ≡ polling se prueba hoy y
 * obliga al server de S2, sin esperar a que exista.
 *
 * El archivo no se escribe a mano: lo deriva `scripts/event-log.mjs` del catálogo
 * (task 5.6, cerrada en PR8). Los últimos dos casos lo atan al seed —bytes y
 * valores— para que editar un perfil sin regenerar el log rompa el gate.
 *
 * Válvula aplicada en PR3: el envelope, los 6 tipos y los payloads de S2
 * (`profile.moved`, `profile.presence`) entraron ahí; los cuatro payloads de S4/S5
 * los sumó PR6 (design D7), así que la unión ya está completa y el log sigue usando
 * sólo los dos tipos que S2 emite.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  MAX_POLL_LIMIT,
  SSE_PREAMBLE,
  formatEventId,
  parseEnvelopeId,
  toPollPage,
  toSseFrames,
} from '../scripts/lib/events.mjs';
import { computeEventLog } from '../scripts/event-log.mjs';
import { listOperations, loadSpec } from '../scripts/lib/spec.mjs';

const LOG_URL = new URL('../event/sample-log.json', import.meta.url);
const LOG = JSON.parse(readFileSync(LOG_URL, 'utf8'));
const CATALOG = ['mx', 'co'].flatMap((regionKey) =>
  JSON.parse(readFileSync(new URL(`../catalog/profiles.${regionKey}.json`, import.meta.url), 'utf8')),
);
const SPEC = loadSpec().spec;
const REGIONS = ['mx', 'co'];

const ENVELOPE_KEYS = ['id', 'occurredAt', 'payload', 'type'];
const ENVELOPE_TYPES = [
  'profile.moved',
  'profile.presence',
  'ping.received',
  'match.created',
  'message.created',
  'typing.started',
];
const PAYLOAD_SCHEMA = {
  'profile.moved': 'ProfileMovedPayload',
  'profile.presence': 'ProfilePresencePayload',
  'ping.received': 'PingReceivedPayload',
  'match.created': 'MatchCreatedPayload',
  'message.created': 'MessageCreatedPayload',
  'typing.started': 'TypingStartedPayload',
};
const COORDINATE_KEY = /^(?:lat|lng|lon|latitude|longitude)$/i;
const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const seqOf = (event) => parseEnvelopeId(event.id).seq;

/** Frames SSE → `{ id, type, data }`, saltando el preámbulo `retry: 5000`. */
function parseFrames(text) {
  assert.ok(text.startsWith(SSE_PREAMBLE), 'el stream abre con `retry: 5000`');
  return text
    .slice(SSE_PREAMBLE.length)
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const field = (name) => lines.find((line) => line.startsWith(`${name}: `)).slice(name.length + 2);
      return { id: field('id'), type: field('event'), data: JSON.parse(field('data')) };
    });
}

test('el log congelado tiene 40 entradas y un duplicado exacto', () => {
  assert.equal(LOG.length, 40, 'el fixture de PR3 son 40 entradas');

  const first = new Map();
  const duplicates = [];
  for (const event of LOG) {
    if (!first.has(event.id)) {
      first.set(event.id, JSON.stringify(event));
      continue;
    }
    duplicates.push(event.id);
    assert.equal(JSON.stringify(event), first.get(event.id), `${event.id}: el duplicado no es idéntico`);
  }

  assert.deepEqual(duplicates, ['mx:000000000007'], 'el duplicado deliberado (D4) es uno solo');
  assert.equal(first.size, 39, '39 eventos únicos: 24 de mx + 15 de co');
});

test('todo evento cumple el envelope y su payload, sin coordenadas', () => {
  assert.deepEqual(SPEC.components.schemas.EventType.enum, ENVELOPE_TYPES);

  for (const event of LOG) {
    const { regionKey } = parseEnvelopeId(event.id);
    const where = `evento ${event.id}`;

    assert.deepEqual(Object.keys(event).sort(), ENVELOPE_KEYS, `${where}: envelope cerrado`);
    assert.ok(ENVELOPE_TYPES.includes(event.type), `${where}: type fuera del enum`);
    assert.match(event.occurredAt, RFC3339_MS, `${where}: occurredAt no es RFC 3339 UTC con ms`);

    const schema = SPEC.components.schemas[PAYLOAD_SCHEMA[event.type]];
    assert.ok(schema, `${where}: ${event.type} no tiene payload schema todavía`);
    assert.equal(schema.additionalProperties, false, `${where}: el payload tiene que cerrar`);

    // El guard de coordenadas va primero: es el error que hay que ver nombrado.
    const fields = [...new Set([...Object.keys(schema.properties ?? {}), ...Object.keys(event.payload)])];
    for (const field of fields) {
      assert.ok(!COORDINATE_KEY.test(field), `${where}: el payload expone ${field}`);
    }

    assert.deepEqual(
      Object.keys(event.payload).sort(),
      Object.keys(schema.properties).sort(),
      `${where}: payload fuera del schema ${PAYLOAD_SCHEMA[event.type]}`,
    );
    for (const field of schema.required) assert.ok(field in event.payload, `${where}: falta ${field}`);

    // Aislamiento regional: la sesión recibe su prefijo y ningún otro.
    assert.ok(REGIONS.includes(regionKey), `${where}: región fuera de mx/co`);
  }

  const used = [...new Set(LOG.map((event) => event.type))].sort();
  assert.deepEqual(used, ['profile.moved', 'profile.presence'], 'el log sólo usa los tipos que emite S2');
  assert.equal(
    SPEC.components.schemas.EventPayload.oneOf.length,
    Object.keys(PAYLOAD_SCHEMA).length,
    'la unión cubre los seis tipos del enum: S4/S5 agregan campos, no uniones',
  );
});

test('los seis payloads cierran y ninguno lleva coordenadas', () => {
  for (const [type, name] of Object.entries(PAYLOAD_SCHEMA)) {
    const schema = SPEC.components.schemas[name];

    assert.ok(schema, `${type}: falta ${name} en components.schemas`);
    assert.equal(schema.type, 'object', `${type}: el payload es un objeto`);
    assert.equal(schema.additionalProperties, false, `${type}: el payload tiene que cerrar`);
    assert.ok((schema.required ?? []).length > 0, `${type}: un payload sin required acepta {}`);

    for (const field of Object.keys(schema.properties ?? {})) {
      assert.ok(!COORDINATE_KEY.test(field), `${type}: el payload expone ${field}`);
    }

    // Un payload de S4/S5 que todavía no se emite tampoco puede arrastrar la
    // geometría que el envelope nunca lleva.
    assert.deepEqual(
      Object.keys(schema.properties ?? {}).filter((field) => /^(?:polygon|center|geometry)$/i.test(field)),
      [],
      `${type}: el payload nombra geometría`,
    );
  }
});

test('seq es monotónico por región y occurredAt no ordena', () => {
  for (const regionKey of REGIONS) {
    const seqs = LOG.filter((event) => event.id.startsWith(`${regionKey}:`)).map(seqOf);
    for (let index = 1; index < seqs.length; index += 1) {
      assert.ok(seqs[index] >= seqs[index - 1], `${regionKey}: seq ${seqs[index]} retrocede tras ${seqs[index - 1]}`);
    }
  }

  const byClock = [...LOG].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  assert.equal(LOG[0].id, 'mx:000000000001');
  assert.equal(byClock[0].id, 'mx:000000000005', 'mx:…005 tiene occurredAt anterior a mx:…004');
  assert.notDeepEqual(byClock.map((event) => event.id), LOG.map((event) => event.id));
});

test('el id se formatea y se parsea en los dos sentidos', () => {
  assert.equal(formatEventId('mx', 42), 'mx:000000000042');
  assert.deepEqual(parseEnvelopeId('mx:000000000042'), { regionKey: 'mx', seq: 42 });

  for (const bad of ['mx:42', 'MX:000000000042', 'mx:00000000004a', 'mx:000000000042 ', '', null]) {
    assert.throws(() => parseEnvelopeId(bad), /malformado/, `${JSON.stringify(bad)} debería fallar (422)`);
  }
});

test('dedupe: el log entrega 39 eventos únicos, no 40', () => {
  const delivered = REGIONS.flatMap((regionKey) =>
    toPollPage(LOG, { regionKey, limit: MAX_POLL_LIMIT }).events.map((event) => event.id),
  );

  assert.equal(delivered.length, 39);
  assert.equal(new Set(delivered).size, 39, 'un seq repetido no se entrega dos veces');
});

test('el replay desde un cursor arranca en seq + 1', () => {
  const { events } = toPollPage(LOG, { regionKey: 'mx', cursor: 'mx:000000000007', limit: MAX_POLL_LIMIT });

  assert.equal(events[0].id, 'mx:000000000008');
  assert.ok(events.every((event) => seqOf(event) > 7), 'no se reentrega el último visto');
  assert.equal(events.length, 17, 'mx tiene 24 seqs: quedan 17 después de 7');
});

test('paridad SSE vs polling: misma secuencia desde cualquier cursor', () => {
  const cases = [
    { regionKey: 'mx', cursor: null },
    { regionKey: 'mx', cursor: 'mx:000000000001' },
    { regionKey: 'mx', cursor: 'mx:000000000007' },
    { regionKey: 'mx', cursor: 'mx:000000000024' },
    { regionKey: 'co', cursor: null },
    { regionKey: 'co', cursor: 'co:000000000009' },
  ];

  for (const { regionKey, cursor } of cases) {
    const polled = [];
    let page = toPollPage(LOG, { regionKey, cursor, limit: 10 });
    polled.push(...page.events);
    while (page.hasMore && page.events.length > 0) {
      page = toPollPage(LOG, { regionKey, cursor: page.nextCursor, limit: 10 });
      polled.push(...page.events);
    }

    const frames = parseFrames(toSseFrames(LOG, { regionKey, cursor }));
    const where = `${regionKey} desde ${cursor}`;

    assert.deepEqual(polled.map((event) => event.id), frames.map((frame) => frame.id), `${where}: mismo id y orden`);
    assert.deepEqual(polled, frames.map((frame) => frame.data), `${where}: mismo envelope en data:`);

    const seqs = polled.map(seqOf);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), `${where}: ascendente`);
    assert.equal(new Set(seqs).size, seqs.length, `${where}: sin duplicados`);
  }
});

test('una página vacía no avanza el cursor', () => {
  const cases = [
    ['mx', 'mx:000000000024'],
    ['co', 'co:000000000015'],
    ['mx', 'mx:000000000099'],
  ];

  for (const [regionKey, cursor] of cases) {
    const page = toPollPage(LOG, { regionKey, cursor });

    assert.deepEqual(page.events, []);
    assert.equal(page.nextCursor, cursor, `${cursor}: el cursor no se mueve`);
    assert.equal(page.hasMore, false);
  }
});

test('un cursor de otra región o un limit inválido se rechazan (422)', () => {
  assert.throws(() => toPollPage(LOG, { regionKey: 'mx', cursor: 'co:000000000001' }), /otra región/);
  assert.throws(() => toPollPage(LOG, { regionKey: 'mx', cursor: 'mx:42' }), /malformado/);
  assert.throws(() => toPollPage(LOG, { regionKey: 'mx', limit: MAX_POLL_LIMIT + 1 }), /1\.\.500/);
});

test('el contrato declara SSE y polling como dos vistas del mismo envelope', () => {
  const operations = listOperations(SPEC);
  const byLabel = Object.fromEntries(
    operations.map(({ method, path, operation }) => [`${method.toUpperCase()} ${path}`, operation]),
  );
  const stream = byLabel['GET /events'];
  const poll = byLabel['GET /events/poll'];

  assert.ok(stream && poll, 'faltan las dos operations de events');
  for (const [label, operation] of [['GET /events', stream], ['GET /events/poll', poll]]) {
    assert.equal(operation['x-implementation-sprint'], 2, `${label}: sprint`);
    for (const status of ['200', '401', '410', '422']) {
      assert.ok(operation.responses[status], `${label}: falta el ${status}`);
    }
  }

  assert.deepEqual(stream.security, [{ streamTicket: [] }], 'SSE autentica con ticket en query');
  assert.equal(poll.security, undefined, 'polling hereda demoSession');
  const ticketUsers = operations
    .filter(({ operation }) => JSON.stringify(operation.security ?? []).includes('"streamTicket"'))
    .map(({ method, path }) => `${method.toUpperCase()} ${path}`);
  assert.deepEqual(ticketUsers, ['GET /events'], 'streamTicket sólo existe en GET /events');

  assert.deepEqual(stream.parameters.map((parameter) => parameter.name), ['Last-Event-ID']);
  assert.deepEqual(poll.parameters.map((parameter) => parameter.name), ['cursor', 'limit'], 'es `cursor`, no `since`');
  assert.equal(poll.parameters[1].schema.maximum, MAX_POLL_LIMIT);
  assert.equal(poll.parameters[1].schema.default, 100);

  const expired = poll.responses['410'].content['application/problem+json'].schema;
  assert.ok(expired.properties.code.enum.includes('CURSOR_EXPIRED'), '410 = CURSOR_EXPIRED, no un 400');

  const page = SPEC.components.schemas.EventsPage;
  assert.equal(page.additionalProperties, false);
  assert.deepEqual(Object.keys(page.properties).sort(), ['events', 'hasMore', 'nextCursor']);
  assert.equal(page.properties.truncated, undefined, 'no hay `truncated`: `hasMore` alcanza');

  const envelope = SPEC.components.schemas.EventEnvelope;
  assert.equal(envelope.additionalProperties, false);
  assert.deepEqual([...envelope.required].sort(), ENVELOPE_KEYS);
});

test('el log commiteado es el derivado del catálogo, byte a byte (task 5.6)', () => {
  const derived = computeEventLog();
  const committed = readFileSync(LOG_URL, 'utf8').replace(/\r\n/g, '\n');

  assert.equal(
    committed,
    derived.text,
    'el log no es el derivado del catálogo: corré `npm run contract:event-log` y commiteá el resultado',
  );
  assert.equal(derived.log.length, 40, 'la agenda sigue emitiendo 40 entradas');
  assert.equal(derived.contractId, SPEC.info['x-contract-id'], 'el log no declara el contrato vigente');
});

test('los valores de cada evento salen del perfil que nombran', () => {
  const byId = new Map(CATALOG.map((profile) => [profile.profileId, profile]));

  // El log no es un fixture suelto: cubre los 20 perfiles del catálogo.
  assert.deepEqual(
    [...new Set(LOG.map((event) => event.payload.profileId))].sort(),
    [...byId.keys()].sort(),
    'el log tiene que referenciar todos los perfiles del catálogo',
  );

  for (const event of LOG) {
    const profile = byId.get(event.payload.profileId);
    assert.ok(profile, `${event.id}: ${event.payload.profileId} no está en el catálogo`);
    assert.equal(event.id.startsWith(`${profile.regionKey}:`), true, `${event.id}: perfil de otra región`);

    if (event.type === 'profile.moved') {
      assert.equal(event.payload.distanceM, profile.distanceM, `${event.id}: distanceM inventado`);
      assert.equal(event.payload.bearingDeg, profile.bearingDeg, `${event.id}: bearingDeg inventado`);
      continue;
    }

    assert.equal(event.type, 'profile.presence', `${event.id}: tipo fuera de la agenda`);
    assert.equal(event.payload.online, profile.online, `${event.id}: online inventado`);
  }
});
