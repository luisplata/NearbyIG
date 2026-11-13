import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  activeSlots,
  api,
  assertStackUp,
  createStreamTicket,
  deleteSessionsCreatedSince,
  listProfiles,
  logout,
  openSession,
  snapshotSessionIds,
} from '../helpers.mjs';

/**
 * `POST /auth/logout`
 *
 * El contrato declara 204 sin cuerpo e idempotencia ("cerrar una sesión ya
 * cerrada no rompe nada"). Lo que se prueba acá es el efecto que importa:
 * el token deja de servir **en el acto** (no al vencer) y el slot queda libre
 * para el siguiente navegador.
 */
describe('POST /auth/logout', () => {
  let snapshot = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
  });

  test('el slot está ocupado antes, libre después y el token muere en el acto', async () => {
    const session = await openSession({ regionKey: 'mx', demoSlot: 5 });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    assert.ok((await activeSlots('mx')).includes(5), 'el slot 5 debería estar ocupado');

    const closed = await logout(session.body.token);
    assert.equal(closed.status, 204, JSON.stringify(closed.body));
    assert.equal(closed.body, null, '204 no lleva cuerpo');
    assert.equal(closed.headers.get('cache-control'), 'no-store');

    // Las dos capacidades que tenía el token se apagan a la vez.
    const profiles = await listProfiles(session.body.token, 'mx');
    assert.equal(profiles.status, 401);
    assert.equal(profiles.body.code, 'UNAUTHENTICATED');

    const ticket = await createStreamTicket(session.body.token);
    assert.equal(ticket.status, 401);
    assert.equal(ticket.body.code, 'UNAUTHENTICATED');

    assert.equal((await activeSlots('mx')).includes(5), false, 'el slot 5 debería quedar libre');

    // Y el siguiente navegador entra al mismo perfil, no a otro.
    const reclaimed = await openSession({ regionKey: 'mx', demoSlot: 5 });
    assert.equal(reclaimed.status, 201, JSON.stringify(reclaimed.body));
    assert.equal(reclaimed.body.demoSlot, 5);
    assert.equal(reclaimed.body.profileId, session.body.profileId);
  });

  test('dos logout con el mismo token devuelven 204 los dos', async () => {
    const session = await openSession({ regionKey: 'mx', demoSlot: 6 });
    assert.equal(session.status, 201, JSON.stringify(session.body));

    assert.equal((await logout(session.body.token)).status, 204);
    assert.equal((await logout(session.body.token)).status, 204);

    assert.equal((await listProfiles(session.body.token, 'mx')).status, 401);
  });

  test('sin token o con un token que no es un JWT responde 401', async () => {
    const none = await api('/auth/logout', { method: 'POST' });
    assert.equal(none.status, 401);
    assert.equal(none.body.code, 'UNAUTHENTICATED');

    const garbage = await api('/auth/logout', { method: 'POST', token: 'no-es-un-jwt' });
    assert.equal(garbage.status, 401);
    assert.equal(garbage.body.code, 'UNAUTHENTICATED');
  });

  test('logout no toca la sesión de otro navegador', async () => {
    const first = await openSession({ regionKey: 'co', demoSlot: 2 });
    const second = await openSession({ regionKey: 'co', demoSlot: 3 });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));

    assert.equal((await logout(first.body.token)).status, 204);

    assert.deepEqual(
      (await activeSlots('co')).filter((slot) => slot === 2 || slot === 3),
      [3],
      'el slot del logout se libera; el del otro navegador sigue ocupado',
    );
    assert.equal((await listProfiles(second.body.token, 'co')).status, 200);
    assert.equal((await listProfiles(first.body.token, 'co')).status, 401);
  });
});
