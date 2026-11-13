import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  botAnchorRows,
  botWaypointsOutsideZone,
  deleteSessionsCreatedSince,
  expireBotLegs,
  extendPresence,
  listDiscovery,
  logout,
  openSession,
  presenceRow,
  presenceToCentroidM,
  pollEvents,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
} from '../helpers.mjs';

/**
 * Bots derivados: **el ancla es la persona**, no el centroide de la zona.
 *
 * El bug: los bots se sembraban alrededor de `ST_PointOnSurface(zones.polygon)`.
 * Como `GET /discovery` mide desde el punto real del observador, un humano lejos
 * del centroide (el norte de Bogotá está a ~7.7 km) veía sus propios bots a
 * kilómetros y fuera de cualquier radio útil del radar.
 *
 * Lo que fija este archivo:
 *
 *  - el ancla de un humano con GPS es su punto: centro a 900–1200 m, waypoints a
 *    300–449 m del centro, `distanceM` de discovery en cientos de metros (no
 *    kilómetros);
 *  - sin GPS (`demoZoneKey`) el ancla sigue siendo el centroide de la zona;
 *  - moverse más que el umbral (250 m) reubica el loop; el ruido de GPS
 *    (≤ 250 m) no lo recrea, porque resembrar en cada latido resetearía el
 *    waypoint y el radar vería saltos;
 *  - cerca del borde del polígono no se recorta: el loop puede salir de la zona
 *    mientras siga a distancia razonable de la persona;
 *  - `profile.moved` mide contra el dueño: un bot propio publica la misma
 *    distancia que el radar de su dueño, no la que lo alejaría del centroide.
 *
 * Geometría de los escenarios: puntos reales dentro del polígono `bogota`
 * (`contract/catalog/zones.json`). El centroide está en (-74.095176, 4.690000),
 * así que el punto del norte es el escenario del bug sin inventar nada.
 */

/** Norte de Bogotá: dentro del polígono y a ~7.7 km del centroide. */
const NORTH = { lat: 4.75, lng: -74.06 };
/** 2.2 km al norte de `NORTH`: por encima del umbral de resembrado. */
const FAR_NORTH = { lat: 4.77, lng: -74.06 };
/** ~167 m al norte de `FAR_NORTH`: ruido de GPS, por debajo del umbral. */
const DRIFT = { lat: 4.7715, lng: -74.06 };
/** ~110 m del borde norte del polígono: casi todo el loop cae fuera. */
const EDGE = { lat: 4.779, lng: -74.05 };

const at = (point) => ({ point });

describe('bots: el ancla es la persona, no el centroide de la zona', () => {
  let snapshot = [];
  let human;

  /** Los bots del humano del escenario, con sus distancias a su punto privado. */
  const ownBots = async () => {
    const rows = await botAnchorRows('co');
    return rows.filter((row) => row.owner_profile_id === human.profileId);
  };

  const createdAtOf = (rows) =>
    new Map(rows.map((row) => [row.bot_profile_id, row.created_ms]));

  /** Discovery con status 200 obligatorio: las filas propias o el fallo. */
  const ownVisible = async (radiusM = 2000) => {
    const response = await listDiscovery(human.token, { radiusM });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.results.filter((row) => row.profileId.startsWith(`${human.profileId}-b`));
  };

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const session = await openSession({ regionKey: 'co', demoSlot: 6 });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    human = { ...session.body, sessionId: sessionIdOf(session.body.token) };
    assert.equal((await updatePresence(human.token, at(NORTH))).status, 200);
    await waitFor(
      async () => {
        const rows = await ownBots();
        return rows.length === 2 ? rows : null;
      },
      { label: 'los 2 bots del humano en el norte de Bogotá' },
    );
  });

  after(async () => {
    await logout(human.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('con GPS en el norte de Bogotá los bots nacen alrededor de la persona', async () => {
    await extendPresence([human.sessionId]);

    // El escenario reproduce el bug: a más de 5 km del centroide, un ancla de
    // zona dejaría a sus propios bots fuera de cualquier radio del radar.
    const toCentroid = await presenceToCentroidM(human.sessionId);
    assert.ok(toCentroid > 5_000, `escenario flojo: el punto está a ${toCentroid} m del centroide`);

    for (const bot of await ownBots()) {
      assert.equal(bot.anchor_to_ref_m, 0, `${bot.bot_profile_id}: el ancla no es la persona`);
      assert.ok(
        bot.center_to_ref_m >= 900 && bot.center_to_ref_m <= 1_200,
        `${bot.bot_profile_id}: centro a ${bot.center_to_ref_m} m del dueño`,
      );
      assert.ok(
        bot.position_to_ref_m >= 400 && bot.position_to_ref_m <= 1_700,
        `${bot.bot_profile_id}: posición a ${bot.position_to_ref_m} m del dueño`,
      );
    }

    // La lectura que ve el usuario: sus 2 bots, a metros, no a kilómetros.
    const visible = await ownVisible();
    assert.equal(visible.length, 2, `radiusM=2000 devolvió ${visible.length} bots propios`);
    for (const bot of visible) {
      assert.ok(
        bot.distanceM >= 400 && bot.distanceM <= 1_700,
        `${bot.profileId}: distanceM=${bot.distanceM} (¿ancla de zona?)`,
      );
    }

    // Y el stream mide contra el dueño: el payload de su propio bot no puede
    // decir "a 7.7 km". Con el ancla de zona quedaría clampado en 5000.
    await expireBotLegs('co');
    const moved = await waitFor(
      async () => {
        const response = await pollEvents(human.token, { limit: 100 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const own = response.body.events
          .filter((event) => event.type === 'profile.moved')
          .filter((event) => event.payload.profileId.startsWith(`${human.profileId}-b`));
        return own.length >= 2 ? own : null;
      },
      { label: 'los profile.moved de los bots propios' },
    );
    for (const event of moved) {
      assert.ok(
        event.payload.distanceM >= 400 && event.payload.distanceM <= 1_700,
        `${event.payload.profileId}: profile.moved a ${event.payload.distanceM} m del dueño`,
      );
    }
  });

  test('sin GPS (demoZoneKey) el ancla sigue siendo el centroide de la zona', async () => {
    assert.equal((await updatePresence(human.token, { demoZoneKey: 'bogota' })).status, 200);
    const presence = await presenceRow(human.sessionId);
    assert.equal(presence.has_point, false, 'la zona demo no debería guardar un punto');

    // Con punto NULL, `ref` del helper es el centroide: centro a 900–1200 m y
    // ancla a 0 m prueban que el loop se sembró contra la zona, como antes.
    const rows = await waitFor(
      async () => {
        const now = await ownBots();
        return now.length === 2 && now.every((bot) => bot.anchor_to_ref_m === 0) ? now : null;
      },
      { label: 'el resembrado con ancla de zona' },
    );
    for (const bot of rows) {
      assert.ok(
        bot.center_to_ref_m >= 900 && bot.center_to_ref_m <= 1_200,
        `${bot.bot_profile_id}: centro a ${bot.center_to_ref_m} m del centroide`,
      );
    }

    const visible = await ownVisible();
    assert.equal(visible.length, 2, `radiusM=2000 devolvió ${visible.length} bots propios de zona demo`);
  });

  test('moverse más que el umbral reubica el loop alrededor del punto nuevo', async () => {
    const beforeCreated = createdAtOf(await ownBots());

    assert.equal((await updatePresence(human.token, at(FAR_NORTH))).status, 200);

    const after = await waitFor(
      async () => {
        const now = await ownBots();
        return now.length === 2 &&
          now.every((bot) => bot.created_ms > (beforeCreated.get(bot.bot_profile_id) ?? 0))
          ? now
          : null;
      },
      { label: 'la reubicación de los bots (2.2 km de desplazamiento)' },
    );

    for (const bot of after) {
      assert.equal(bot.anchor_to_ref_m, 0, `${bot.bot_profile_id}: el ancla no siguió a la persona`);
      assert.ok(
        bot.center_to_ref_m >= 900 && bot.center_to_ref_m <= 1_200,
        `${bot.bot_profile_id}: centro a ${bot.center_to_ref_m} m del punto nuevo`,
      );
    }

    const visible = await ownVisible();
    assert.equal(visible.length, 2, 'después de mudarse no ve sus 2 bots');
    assert.ok(visible.every((bot) => bot.distanceM <= 1_700), 'las distancias no volvieron al rango');
  });

  test('el ruido de GPS (≤ 250 m) no recrea el loop', async () => {
    await extendPresence([human.sessionId]);
    const before = await ownBots();
    const beforeCreated = createdAtOf(before);
    const beforeIndex = new Map(before.map((bot) => [bot.bot_profile_id, bot.waypoint_index]));

    assert.equal((await updatePresence(human.token, at(DRIFT))).status, 200);

    // Un tick que avanza waypoints prueba que la conciliación de ese mismo tick
    // ya vio el punto nuevo: si fuera a resembrar, ya lo habría hecho.
    await expireBotLegs('co');
    await waitFor(
      async () => {
        const now = await ownBots();
        return now.length === 2 &&
          now.some((bot) => bot.waypoint_index !== beforeIndex.get(bot.bot_profile_id))
          ? now
          : null;
      },
      { label: 'el avance de waypoint después del movimiento chico' },
    );

    const after = await ownBots();
    assert.equal(after.length, 2);
    for (const bot of after) {
      assert.equal(
        bot.created_ms,
        beforeCreated.get(bot.bot_profile_id),
        `${bot.bot_profile_id}: el loop se recreó por ruido de GPS`,
      );
      // El ancla se quedó donde estaba: la distancia es el desplazamiento real
      // (~167 m), no 0. Es la histéresis, no un olvido.
      assert.ok(
        bot.anchor_to_ref_m > 120 && bot.anchor_to_ref_m < 220,
        `${bot.bot_profile_id}: ancla a ${bot.anchor_to_ref_m} m (se esperaban ~167)`,
      );
    }
  });

  test('cerca del borde del polígono no se recorta: el loop puede salir de la zona', async () => {
    await extendPresence([human.sessionId]);
    assert.equal((await updatePresence(human.token, at(EDGE))).status, 200);

    const rows = await waitFor(
      async () => {
        const now = await ownBots();
        return now.length === 2 && now.every((bot) => bot.anchor_to_ref_m === 0) ? now : null;
      },
      { label: 'el resembrado cerca del borde' },
    );

    for (const bot of rows) {
      // Con el recorte al polígono (`ST_Covers` → ancla) el centro habría
      // colapsado al punto de la persona: 0 m en vez de 900–1200.
      assert.ok(
        bot.center_to_ref_m >= 900 && bot.center_to_ref_m <= 1_200,
        `${bot.bot_profile_id}: centro a ${bot.center_to_ref_m} m: se recortó al polígono`,
      );
    }

    const outside = await botWaypointsOutsideZone('co', human.profileId);
    assert.ok(outside > 0, 'ningún waypoint salió de la zona: el recorte sigue ahí');

    const visible = await ownVisible();
    assert.equal(visible.length, 2, 'cerca del borde no ve sus 2 bots');
  });
});
