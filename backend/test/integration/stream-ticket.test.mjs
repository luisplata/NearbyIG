import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  DATABASE_URL,
  api,
  assertStackUp,
  createStreamTicket,
  deleteSessionsCreatedSince,
  listProfiles,
  logout,
  openSession,
  snapshotSessionIds,
  streamTicketsOf,
  withDb,
} from '../helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * El consumidor HTTP del ticket es `GET /events`, que es de Sprint 2. Este batch
 * deja la costura implementada y la prueba contra el módulo compilado: el
 * `dist/` es lo que corre el contenedor, así que no hay una segunda copia de la
 * lógica en el test. Se instancia a mano (Pool + config) porque no hay un
 * segundo proceso Nest en el escenario de test.
 */
const SERVICE_PATH = resolve(HERE, '..', '..', 'dist', 'auth', 'stream-tickets.service.js');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('POST /auth/stream-ticket', () => {
  let snapshot = [];
  let pool;
  let consume;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();

    assert.ok(
      existsSync(SERVICE_PATH),
      `falta ${SERVICE_PATH}: corré "npm run build" o los tests dentro del contenedor`,
    );
    await import('reflect-metadata');
    const module = await import(SERVICE_PATH);
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const service = new module.StreamTicketsService(pool, { streamTicketTtlSeconds: 30 });
    consume = (ticket) => service.consume(ticket);
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
    await pool.end();
  });

  /** Abre sesión + pide ticket, y devuelve las dos mitades. */
  async function issue(regionKey, demoSlot) {
    const session = await openSession({ regionKey, demoSlot });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    const response = await createStreamTicket(session.body.token);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return { session: session.body, ticket: response.body };
  }

  test('emite { ticket, expiresAt } a 30 s y no se cachea', async () => {
    const { ticket } = await issue('mx', 1);
    assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'ticket']);
    assert.equal(typeof ticket.ticket, 'string');
    assert.ok(ticket.ticket.length >= 32, 'el valor es opaco y largo');
    const ttl = Date.parse(ticket.expiresAt) - Date.now();
    assert.ok(ttl > 25_000 && ttl <= 30_000, `ttl inesperado: ${ttl} ms`);
  });

  test('persiste el sha256 del ticket, nunca el valor', async () => {
    const { session, ticket } = await issue('mx', 2);
    const rows = await streamTicketsOf(sessionIdOf(session.token));
    assert.equal(rows.length, 1, 'un ticket por pedido');
    assert.equal(rows[0].ticket_hash, sha256(ticket.ticket));
    assert.notEqual(rows[0].ticket_hash, ticket.ticket);
    assert.equal(rows[0].consumed_at, null);
  });

  test('el ticket no sirve como token de sesión', async () => {
    const { ticket } = await issue('mx', 3);
    const asBearer = await listProfiles(ticket.ticket, 'mx');
    assert.equal(asBearer.status, 401);
    assert.equal(asBearer.body.code, 'UNAUTHENTICATED');

    const ticketEndpoint = await createStreamTicket(ticket.ticket);
    assert.equal(ticketEndpoint.status, 401);
    assert.equal(ticketEndpoint.body.code, 'UNAUTHENTICATED');
  });

  test('se consume una sola vez: el segundo uso es TICKET_REUSED', async () => {
    const { session, ticket } = await issue('mx', 4);

    const consumed = await consume(ticket.ticket);
    assert.equal(consumed.profileId, session.profileId);
    assert.equal(consumed.regionKey, session.regionKey);
    assert.equal(consumed.demoSlot, session.demoSlot);

    await assert.rejects(consume(ticket.ticket), (error) => {
      assert.equal(error.code, 'TICKET_REUSED');
      assert.equal(error.status, 401);
      return true;
    });

    const rows = await streamTicketsOf(sessionIdOf(session.token));
    assert.notEqual(rows[0].consumed_at, null, 'consumed_at quedó marcado');
  });

  test('un ticket vencido es TICKET_EXPIRED', async () => {
    const { session, ticket } = await issue('co', 1);
    const sessionId = sessionIdOf(session.token);
    await withDb((client) =>
      client.query(
        `UPDATE stream_tickets
            SET issued_at = now() - interval '1 hour',
                expires_at = now() - interval '1 second'
          WHERE session_id = $1`,
        [sessionId],
      ),
    );

    await assert.rejects(consume(ticket.ticket), (error) => error.code === 'TICKET_EXPIRED');
  });

  test('un ticket desconocido es TICKET_EXPIRED', async () => {
    await assert.rejects(consume('ticket-que-no-existe'), (error) => error.code === 'TICKET_EXPIRED');
  });

  test('el logout quema los tickets pendientes de la sesión', async () => {
    const { session, ticket } = await issue('co', 2);
    assert.equal((await logout(session.token)).status, 204);
    await assert.rejects(consume(ticket.ticket), (error) => error.code === 'TICKET_EXPIRED');
  });

  test('sin sesión responde 401', async () => {
    const response = await api('/auth/stream-ticket', { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHENTICATED');
  });
});

/** El `DemoSession` no expone `sessionId`: el `sid` está en el JWT (sin firmar de nuevo). */
function sessionIdOf(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sid;
}
