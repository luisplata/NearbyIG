import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  deletePingsOf,
  deleteSessionsCreatedSince,
  listMatches,
  listMessages,
  markMatchRead,
  messageRowsOf,
  notificationRowsOf,
  openSession,
  PROBLEM_FIELDS,
  sendMessage,
  sessionIdOf,
  snapshotSessionIds,
  withDb,
} from '../helpers.mjs';

/**
 * Un match cuyo peer no tiene fila en `profiles`.
 *
 * `matches` no tiene FK a `profiles` (`005_pings.sql`): el par es texto. Ese
 * hueco es el que dejaba escribirle a una identidad que no existe —y que con la
 * población sintética fuera del esquema ya no puede existir—. La regla es:
 *
 *  - **escribir** ⇒ `409 MATCH_CLOSED`, sin insertar mensaje ni notificación;
 *  - **leer** (mensajes y `read`) sigue funcionando: la historia es un hecho y no
 *    depende de que el otro lado siga en el catálogo;
 *  - `GET /matches` no lista la conversación, porque la bandeja es una proyección
 *    de perfiles y no un log.
 *
 * El match se inserta por SQL a propósito: el flujo humano normal no puede
 * producirlo (el ping valida contra el catálogo), así que un fixture por API
 * estaría probando otra cosa.
 */

const REGION = 'mx';

/** Un `profileId` con forma válida que ningún seed va a crear. */
const ABSENT_PEER = 'mx-absent-peer';

describe('chat: peer ausente del catálogo', () => {
  let snapshot = [];
  let session;
  let matchId;

  const send = (text) => sendMessage(session.token, matchId, { clientMessageId: `cm-${text}`, body: text });

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();

    const response = await openSession({ regionKey: REGION, demoSlot: 7 });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    session = {
      token: response.body.token,
      profileId: response.body.profileId,
      sessionId: sessionIdOf(response.body.token),
    };

    // Un run abortado puede dejar el match del escenario: se limpia antes.
    await deletePingsOf(REGION, [session.profileId, ABSENT_PEER]);

    matchId = await withDb(async (client) => {
      const [profileA, profileB] = [session.profileId, ABSENT_PEER].sort();
      const { rows } = await client.query(
        `INSERT INTO matches (region_key, profile_a_id, profile_b_id)
         VALUES ($1, $2, $3)
         RETURNING match_id`,
        [REGION, profileA, profileB],
      );
      return rows[0].match_id;
    });
    assert.equal(typeof matchId, 'string', 'el match del escenario no se creó');
  });

  after(async () => {
    await deletePingsOf(REGION, [session.profileId, ABSENT_PEER]);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('escribir es 409 MATCH_CLOSED y no deja mensaje ni notificación', async () => {
    const countNotifications = async () =>
      (await notificationRowsOf(REGION, session.profileId)).length +
      (await notificationRowsOf(REGION, ABSENT_PEER)).length;
    const before = {
      messages: (await messageRowsOf(matchId)).length,
      notifications: await countNotifications(),
    };

    const response = await send('hola?');
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.code, 'MATCH_CLOSED');

    const after = {
      messages: (await messageRowsOf(matchId)).length,
      notifications: await countNotifications(),
    };
    assert.deepEqual(after, before, 'el intento escribió un mensaje o una notificación');
  });

  test('el 409 no es un problem de forma inválida', async () => {
    const response = await send('otra');
    assert.equal(response.status, 409);
    assert.deepEqual(Object.keys(response.body).sort(), [...PROBLEM_FIELDS].sort());
    assert.equal(response.body.status, 409);
  });

  test('leer la conversación sigue funcionando: la historia es un hecho', async () => {
    const page = await listMessages(session.token, matchId);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(page.body.messages, []);
    assert.equal(page.body.hasMore, false);

    // `read` es una escritura del watermark propio, no del match: no cierra.
    const read = await markMatchRead(session.token, matchId);
    assert.equal(read.status, 204, JSON.stringify(read.body));
  });

  test('la bandeja no lista un match sin peer projectable', async () => {
    const response = await listMatches(session.token);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(
      !response.body.matches.some((item) => item.match.id === matchId),
      'la bandeja muestra un match cuyo peer no tiene fila en profiles',
    );
  });
});
