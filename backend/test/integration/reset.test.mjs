import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  activeSlots,
  assertStackUp,
  countRows,
  createStreamTicket,
  deleteSessionsCreatedSince,
  insertGuestSession,
  listProfiles,
  openSession,
  resetGlobal,
  resetSelf,
  restoreSessions,
  snapshotSessionIds,
  snapshotSessions,
  withDb,
} from '../helpers.mjs';

/**
 * Reset de la demo (fuera del contrato, §11 del plan).
 *
 * El reset global es la única operación del suite que borra filas ajenas, así
 * que este archivo se toma el trabajo de reponerlas: guarda todas las sesiones
 * al empezar y las reinserta al terminar. El token es un JWT sin estado, así
 * que reponer la fila repone la sesión.
 */
describe('reset de la demo', () => {
  let snapshot = [];
  let snapshotRows = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    snapshotRows = await snapshotSessions();
  });

  after(async () => {
    await deleteSessionsCreatedSince(snapshot);
    await restoreSessions(snapshotRows);
  });

  test('reset por usuario cierra su sesión, libera su slot y no toca a nadie más', async () => {
    const mine = await openSession({ regionKey: 'mx', demoSlot: 4 });
    assert.equal(mine.status, 201, JSON.stringify(mine.body));
    assert.equal((await createStreamTicket(mine.body.token)).status, 201);

    const sibling = await openSession({ regionKey: 'co', demoSlot: 5 });
    assert.equal(sibling.status, 201, JSON.stringify(sibling.body));

    const reset = await resetSelf(mine.body.token);
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.deepEqual(reset.body, {
      scope: 'self',
      sessionsDeleted: 1,
      ticketsDeleted: 1,
      regionKey: 'mx',
      demoSlot: 4,
      sourceType: 'human',
    });

    // El token dejó de servir para todo.
    assert.equal((await listProfiles(mine.body.token, 'mx')).status, 401);
    assert.equal((await createStreamTicket(mine.body.token)).status, 401);

    // El slot quedó libre; el del hermano no.
    assert.equal((await activeSlots('mx')).includes(4), false);
    assert.equal((await activeSlots('co')).includes(5), true);
    assert.equal((await listProfiles(sibling.body.token, 'co')).status, 200);

    const reclaimed = await openSession({ regionKey: 'mx', demoSlot: 4 });
    assert.equal(reclaimed.status, 201, JSON.stringify(reclaimed.body));
    assert.equal(reclaimed.body.profileId, mine.body.profileId);

    // Segundo reset con el token viejo: 200 y no rompe nada.
    const again = await resetSelf(mine.body.token);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.sessionsDeleted, 0);
    assert.equal(again.body.demoSlot, 4);
    assert.equal((await activeSlots('mx')).includes(4), true, 'la sesión nueva sigue viva');
  });

  test('reset por usuario exige una sesión válida', async () => {
    const anonymous = await resetSelf(undefined);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, 'UNAUTHENTICATED');

    const garbage = await resetSelf('no-es-un-jwt');
    assert.equal(garbage.status, 401);
    assert.equal(garbage.body.code, 'UNAUTHENTICATED');
  });

  test('reset global libera los slots, elimina invitados y sesiones, y es idempotente', async () => {
    const human = await openSession({ regionKey: 'mx', demoSlot: 1 });
    assert.equal(human.status, 201, JSON.stringify(human.body));
    await insertGuestSession('co');

    // Pings y matches son estado de demo: el reset global los tiene que borrar
    // igual que las sesiones. Se siembra uno de cada uno por SQL para no
    // depender del flujo de S4 en un test que es del reset.
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO pings (region_key, from_profile_id, to_profile_id, expires_at)
         VALUES ('mx', $1, 'mx-p02', now() + interval '1 hour')`,
        [human.body.profileId],
      );
      await client.query(
        `INSERT INTO matches (region_key, profile_a_id, profile_b_id)
         VALUES ('mx', least($1, 'mx-p02'), greatest($1, 'mx-p02'))`,
        [human.body.profileId],
      );
    });
    assert.ok((await countRows('pings')) >= 1, 'el escenario tiene un ping');
    assert.ok((await countRows('matches')) >= 1, 'el escenario tiene un match');

    const expected = await withDb(async (client) => {
      const { rows } = await client.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE source_type = 'guest')::int AS guests
           FROM sessions`,
      );
      return rows[0];
    });
    assert.ok(expected.guests >= 1, 'el escenario tiene al menos el invitado sembrado');

    const reset = await resetGlobal();
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal(reset.body.scope, 'global');
    assert.equal(reset.body.sessionsDeleted, expected.total);
    assert.equal(reset.body.guestsDeleted, expected.guests);
    assert.deepEqual(reset.body.regions, [
      { regionKey: 'co', freeSlots: 10 },
      { regionKey: 'mx', freeSlots: 10 },
    ]);

    assert.equal(await countRows('sessions'), 0);
    assert.equal(await countRows('stream_tickets'), 0);
    assert.equal(await countRows('pings'), 0, 'el reset global vacía la bandeja');
    assert.equal(await countRows('matches'), 0, 'el reset global vacía los matches');

    // Dos veces no rompe: la segunda no encuentra nada.
    const second = await resetGlobal();
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.sessionsDeleted, 0);
    assert.equal(second.body.guestsDeleted, 0);

    // Los 10 slots se pueden volver a reclamar en las dos regiones.
    const mx = await openSession({ regionKey: 'mx', demoSlot: 1 });
    const co = await openSession({ regionKey: 'co', demoSlot: 10 });
    assert.equal(mx.status, 201, JSON.stringify(mx.body));
    assert.equal(co.status, 201, JSON.stringify(co.body));
    assert.equal(mx.body.sourceType, 'human');
    assert.equal(co.body.sourceType, 'human');
  });

  test('reset global no toca el catálogo ni el registro de migraciones', async () => {
    // El conteo se compara contra sí mismo: lo que se prueba es que el reset no
    // re-migra, no cuántas migraciones hay (antes clavaba `1`).
    const migratedBefore = await countRows('schema_migrations');
    await resetGlobal();
    for (const regionKey of ['mx', 'co']) {
      const session = await openSession({ regionKey, demoSlot: 2 });
      assert.equal(session.status, 201, JSON.stringify(session.body));
      const profiles = await listProfiles(session.body.token, regionKey);
      assert.equal(profiles.status, 200);
      assert.equal(profiles.body.profiles.length, 10, `catálogo de ${regionKey} intacto`);
    }
    assert.equal(await countRows('profiles'), 20);
    assert.ok(migratedBefore > 0, 'la base tiene migraciones aplicadas');
    assert.equal(await countRows('schema_migrations'), migratedBefore, 'no se vuelve a migrar');
  });
});
