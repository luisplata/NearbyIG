import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  clearPresence,
  deleteSessionsCreatedSince,
  expirePresence,
  listProfiles,
  logout,
  openSession,
  pointSessionToMissingProfile,
  presenceGeometryColumn,
  presenceRow,
  presenceRowsIn,
  sessionIdOf,
  snapshotSessionIds,
  storedPoint,
  updatePresence,
} from '../helpers.mjs';

/**
 * `PUT`/`DELETE /presence` — Sprint 2, presencia y región.
 *
 * Lo que fija este archivo es la **derivación** y el fallback, no la forma (eso
 * lo congela `contract/test/presence-discovery.test.mjs`):
 *
 *  - un punto privado cae en la zona del catálogo por `ST_Covers`;
 *  - fuera de todo polígono no es error: 200 con `zoneKey: null` y
 *    `fallbackRequired: true`, sin cerrar la sesión;
 *  - `demoZoneKey` es el camino del GPS denegado y no inventa coordenada;
 *  - una zona inexistente o de otra región es 422 `ZONE_UNKNOWN`;
 *  - mandar un punto de otra región **no muda** la sesión: fallback, una sola
 *    presencia viva, sin estado duplicado;
 *  - la fila vence a los 12 s y deja de contar sin barrido (filtro de lectura);
 *  - `DELETE` es idempotente en el resultado, no en el status: 204 y después
 *    409 `PRESENCE_STALE`;
 *  - ninguna response repite la coordenada, aunque la base la guarde.
 */

/** v0.5 suma `visibility`: es la única forma existente que cambia en S5. */
const PRESENCE_FIELDS = ['fallbackRequired', 'online', 'profileId', 'regionKey', 'visibility', 'zoneKey'];

/** CDMX y Bogotá centro: caen dentro de los polígonos de `catalog/zones.json`. */
const CDMX = { lat: 19.432608, lng: -99.133209 };
const BOGOTA = { lat: 4.711, lng: -74.0721 };
/** Golfo de Guinea: no cae en ninguna zona del catálogo ni cerca. */
const OCEAN = { lat: 0, lng: 0 };

/**
 * La response es exactamente `PresenceState`: seis campos y ni un número con
 * pinta de coordenada. Se mira el JSON serializado, no sólo las claves, porque
 * una coordenada podría viajar dentro de un campo con otro nombre.
 */
function assertOnlyProjection(response, label) {
  assert.deepEqual(Object.keys(response.body).sort(), PRESENCE_FIELDS, `${label}: campos`);
  const text = JSON.stringify(response.body);
  assert.doesNotMatch(
    text,
    /"(?:lat|lng|lon|latitude|longitude|point)"/i,
    `${label}: la response nombra una coordenada`,
  );
  assert.doesNotMatch(text, /\d+\.\d{3,}/, `${label}: la response trae un decimal con pinta de coordenada`);
}

describe('presence: PUT y DELETE /presence', () => {
  let snapshot = [];
  let mx;
  let co;
  let mxSessionId;
  let coSessionId;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();

    const mxSession = await openSession({ regionKey: 'mx', demoSlot: 2 });
    assert.equal(mxSession.status, 201, JSON.stringify(mxSession.body));
    mx = mxSession.body;
    mxSessionId = sessionIdOf(mx.token);

    const coSession = await openSession({ regionKey: 'co', demoSlot: 2 });
    assert.equal(coSession.status, 201, JSON.stringify(coSession.body));
    co = coSession.body;
    coSessionId = sessionIdOf(co.token);
  });

  after(async () => {
    // La presencia cae en cascada con la sesión; no hay nada más que limpiar.
    await logout(mx.token);
    await logout(co.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('sin token responde 401 UNAUTHENTICATED', async () => {
    const response = await updatePresence(undefined, { demoZoneKey: 'cdmx' });
    assert.equal(response.status, 401, JSON.stringify(response.body));
    assert.equal(response.body.code, 'UNAUTHENTICATED');
  });

  test('el body exige exactamente uno de point o demoZoneKey', async () => {
    const rejected = [
      [{}, 'sin punto ni zona'],
      [{ point: CDMX, demoZoneKey: 'cdmx' }, 'las dos cosas'],
      [{ point: CDMX, distanceM: 240 }, 'propiedad de más en el body'],
      [{ point: { lat: CDMX.lat, lng: CDMX.lng, accuracy: 5 } }, 'propiedad de más en el punto'],
      [{ point: { lat: 91, lng: 0 } }, 'latitud fuera de rango'],
      [{ point: { lat: 0, lng: -181 } }, 'longitud fuera de rango'],
      [{ point: { lat: 19.43 } }, 'medio punto'],
      [{ point: { lat: '19.43', lng: '-99.13' } }, 'punto con strings'],
      [{ point: null }, 'punto nulo'],
      [{ point: [19.43, -99.13] }, 'punto como array'],
      [{ demoZoneKey: 'Guadalajara' }, 'zona que no es clave'],
      [{ demoZoneKey: 42 }, 'zona que no es string'],
    ];

    for (const [body, label] of rejected) {
      const response = await updatePresence(mx.token, body);
      assert.equal(response.status, 422, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED', label);
    }
  });

  test('un punto dentro de CDMX deriva mx/cdmx y sólo devuelve la proyección', async () => {
    const response = await updatePresence(mx.token, { point: CDMX });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assertOnlyProjection(response, 'CDMX');

    assert.equal(response.body.profileId, mx.profileId);
    assert.equal(response.body.regionKey, 'mx');
    assert.equal(response.body.zoneKey, 'cdmx');
    assert.equal(response.body.online, true);
    assert.equal(response.body.fallbackRequired, false);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const row = await presenceRow(mxSessionId);
    assert.equal(row.region_key, 'mx');
    assert.equal(row.zone_key, 'cdmx');
    assert.equal(row.has_point, true, 'el punto privado sí se guarda, en su columna');
    assert.equal(row.live, true);
    assert.ok(row.remaining_s >= 11 && row.remaining_s <= 12, `TTL de 12 s (vio ${row.remaining_s}s)`);
  });

  test('un punto dentro de Bogotá deriva co/bogota', async () => {
    const response = await updatePresence(co.token, { point: BOGOTA });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assertOnlyProjection(response, 'Bogotá');
    assert.equal(response.body.regionKey, 'co');
    assert.equal(response.body.zoneKey, 'bogota');
    assert.equal(response.body.fallbackRequired, false);
    assert.equal((await presenceRow(coSessionId)).zone_key, 'bogota');
  });

  test('un punto fuera de todo polígono es fallback, no un error', async () => {
    const response = await updatePresence(mx.token, { point: OCEAN });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assertOnlyProjection(response, 'océano');
    assert.equal(response.body.regionKey, 'mx', 'la región es la de la sesión, no la del punto');
    assert.equal(response.body.zoneKey, null);
    assert.equal(response.body.fallbackRequired, true);
    assert.equal(response.body.online, true);

    const row = await presenceRow(mxSessionId);
    assert.equal(row.zone_key, null, 'sin zona derivada');
    assert.equal(row.has_point, true, 'el punto fuera de región se guarda igual');

    // Sin logout ni error duro: la sesión sigue sirviendo para todo lo demás.
    const profiles = await listProfiles(mx.token, 'mx');
    assert.equal(profiles.status, 200);
  });

  test('GPS denegado: sólo demoZoneKey funciona y no inventa coordenada', async () => {
    const response = await updatePresence(mx.token, { demoZoneKey: 'cdmx' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assertOnlyProjection(response, 'demoZoneKey');
    assert.equal(response.body.zoneKey, 'cdmx');
    assert.equal(response.body.fallbackRequired, false);

    const row = await presenceRow(mxSessionId);
    assert.equal(row.zone_key, 'cdmx');
    assert.equal(row.has_point, false, 'elegir zona no fabrica un punto');
  });

  test('una demoZoneKey inexistente o de otra región es 422 ZONE_UNKNOWN', async () => {
    // Estado de partida: cdmx. Ninguno de los 422 de abajo lo puede pisar.
    assert.equal((await updatePresence(mx.token, { demoZoneKey: 'cdmx' })).status, 200);

    for (const [zone, label] of [
      ['bogota', 'zona de la otra región'],
      ['guadalajara', 'zona que no existe'],
    ]) {
      const response = await updatePresence(mx.token, { demoZoneKey: zone });
      assert.equal(response.status, 422, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, 'ZONE_UNKNOWN', label);
    }

    assert.equal((await presenceRow(mxSessionId)).zone_key, 'cdmx', 'el 422 no tocó la presencia viva');
  });

  test('un punto de otra región no muda la sesión ni duplica el estado', async () => {
    assert.equal((await updatePresence(mx.token, { point: CDMX })).status, 200);
    assert.equal((await presenceRow(mxSessionId)).zone_key, 'cdmx');

    // Sesión `mx` con un punto de Bogotá: fallback, no mudanza silenciosa.
    const response = await updatePresence(mx.token, { point: BOGOTA });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.regionKey, 'mx');
    assert.equal(response.body.zoneKey, null);
    assert.equal(response.body.fallbackRequired, true);

    const mxRows = (await presenceRowsIn('mx')).filter((row) => row.session_id === mxSessionId);
    assert.equal(mxRows.length, 1, 'una sola presencia viva por sesión');
    assert.equal(mxRows[0].zone_key, null);

    const coRows = (await presenceRowsIn('co')).filter((row) => row.session_id === mxSessionId);
    assert.deepEqual(coRows, [], 'la sesión no quedó con una presencia en la otra región');

    // La sesión sigue viva: no hay logout ni loss de credencial.
    assert.equal((await listProfiles(mx.token, 'mx')).status, 200);

    // Y volver a una zona del catálogo reemplaza el fallback (upsert, no acumula).
    const back = await updatePresence(mx.token, { demoZoneKey: 'cdmx' });
    assert.equal(back.body.zoneKey, 'cdmx');
    assert.equal(back.body.fallbackRequired, false);
    assert.equal((await presenceRowsIn('mx')).filter((row) => row.session_id === mxSessionId).length, 1);
  });

  test('un perfil fuera del catálogo responde 404 PROFILE_NOT_FOUND', async () => {
    const orphan = await openSession({ regionKey: 'mx', demoSlot: 7 });
    assert.equal(orphan.status, 201, JSON.stringify(orphan.body));
    await pointSessionToMissingProfile(sessionIdOf(orphan.body.token), 'mx-p99');

    const response = await updatePresence(orphan.body.token, { demoZoneKey: 'cdmx' });
    assert.equal(response.status, 404, JSON.stringify(response.body));
    assert.equal(response.body.code, 'PROFILE_NOT_FOUND');

    await logout(orphan.body.token);
  });

  test('la base guarda el punto redondeado a 6 decimales y la response no lo repite', async () => {
    const response = await updatePresence(mx.token, {
      point: { lat: 19.432608123456789, lng: -99.133209987654321 },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assertOnlyProjection(response, 'punto con ruido');

    const stored = await storedPoint(mxSessionId);
    assert.ok(Math.abs(stored.lat - 19.432608) < 1e-9, `lat guardada ${stored.lat}`);
    assert.ok(Math.abs(stored.lng - -99.13321) < 1e-9, `lng guardada ${stored.lng}`);
  });

  test('la presencia vence a los 12 s y deja de contar sin barrido', async () => {
    assert.equal((await updatePresence(mx.token, { demoZoneKey: 'cdmx' })).status, 200);
    const fresh = await presenceRow(mxSessionId);
    assert.equal(fresh.live, true);
    assert.ok(fresh.remaining_s >= 11 && fresh.remaining_s <= 12, `TTL de 12 s (vio ${fresh.remaining_s}s)`);

    // El paso del tiempo, sin dormir el suite: la fila queda vencida en la base.
    await expirePresence(mxSessionId);
    const expired = await presenceRow(mxSessionId);
    assert.equal(expired.live, false, 'una fila vencida no cuenta como presencia');

    // El filtro de lectura es la autoridad: para `DELETE` ya no hay nada vivo.
    const stale = await clearPresence(mx.token);
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, 'PRESENCE_STALE');

    // Y el siguiente PUT reusa la fila vencida: revive, no se duplica.
    assert.equal((await updatePresence(mx.token, { demoZoneKey: 'cdmx' })).status, 200);
    const revived = await presenceRow(mxSessionId);
    assert.equal(revived.live, true);
    const rows = (await presenceRowsIn('mx')).filter((row) => row.session_id === mxSessionId);
    assert.equal(rows.length, 1, 'el upsert no creó una segunda presencia');
  });

  test('DELETE apaga la presencia y no cierra la sesión', async () => {
    assert.equal((await updatePresence(mx.token, { demoZoneKey: 'cdmx' })).status, 200);

    const cleared = await clearPresence(mx.token);
    assert.equal(cleared.status, 204);
    assert.equal(cleared.body, null, 'un 204 no lleva body');
    assert.equal(await presenceRow(mxSessionId), undefined, 'la fila de la sesión ya no está');

    // La sesión sigue viva: la presencia es estado, no la credencial.
    assert.equal((await listProfiles(mx.token, 'mx')).status, 200);

    const again = await clearPresence(mx.token);
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.code, 'PRESENCE_STALE');
  });

  test('cada sesión tiene su propia presencia (una fila por sesión)', async () => {
    const other = await openSession({ regionKey: 'mx', demoSlot: 3 });
    assert.equal(other.status, 201, JSON.stringify(other.body));
    const otherId = sessionIdOf(other.body.token);

    assert.equal((await updatePresence(mx.token, { point: CDMX })).status, 200);
    assert.equal((await updatePresence(other.body.token, { point: OCEAN })).status, 200);

    const rows = await presenceRowsIn('mx');
    const mine = rows.filter((row) => row.session_id === mxSessionId);
    const theirs = rows.filter((row) => row.session_id === otherId);
    assert.equal(mine.length, 1);
    assert.equal(theirs.length, 1);
    assert.equal(mine[0].zone_key, 'cdmx');
    assert.equal(theirs[0].zone_key, null, 'el fallback de una sesión no toca la otra');

    await logout(other.body.token);
  });

  test('la columna de geometría es geometry(Point,4326)', async () => {
    const column = await presenceGeometryColumn();
    assert.deepEqual(column, { srid: 4326, type: 'POINT' });
  });
});
