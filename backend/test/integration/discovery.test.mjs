import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  clearPresence,
  deleteSessionsCreatedSince,
  listDiscovery,
  logout,
  openSession,
  PROFILE_FIELDS,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
  waitFor,
} from '../helpers.mjs';

/**
 * `GET /discovery` — Sprint 3, S3-A.
 *
 * Lo que fija este archivo:
 *
 *  - **dos humanos en la misma región ven 5 perfiles**: 1 humano ajeno + 2 bots
 *    propios + 2 bots del otro. El negocio del plan (§4, §5) sólo cierra si el
 *    observador ve sus propios bots; el perfil propio sigue excluido;
 *  - `distanceM`/`bearingDeg` se miden **desde el observador** (no desde el ancla
 *    de la zona) y salen redondeados, enteros y dentro del rango del contrato;
 *  - filtros: radio, intención, género, verificado y online, uno por uno y
 *    combinados, más los 422 de validación;
 *  - exclusiones: ghost (sin presencia viva no se ve y no ve), bloqueados (sin
 *    tabla hasta S5) y otra región;
 *  - cap de 6 bots por observador con los propios adentro y el corte
 *    determinista; y el `maxItems: 10` de `DiscoveryResult` como tope de página;
 *  - ninguna coordenada en la respuesta.
 *
 * Geometría de los escenarios: puntos reales dentro del polígono `cdmx`
 * (`contract/catalog/zones.json`), no `demoZoneKey`. Con zona demo los dos
 * humanos caen en el ancla y la distancia sería 0 para todos: el test de orden y
 * el de "frame del observador" necesitan puntos distintos.
 */

/** Ancla de `cdmx` (`ST_PointOnSurface`) y dos puntos dentro del polígono. */
const ANCHOR = { lat: 19.44, lng: -99.127297 };
const NEAR = { lat: 19.435, lng: -99.12 };
const FAR = { lat: 19.45, lng: -99.095 };
const CO_ANCHOR = { lat: 4.71, lng: -74.0721 };
const CO_NEAR = { lat: 4.69, lng: -74.09 };

const at = (point) => ({ point });

/** `GET /discovery` con status 200 obligatorio: las filas o el fallo del test. */
async function rows(token, filters = {}) {
  const response = await listDiscovery(token, filters);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(Object.keys(response.body), ['results'], 'DiscoveryResult es un objeto con array adentro');
  return response.body.results;
}

/**
 * Repone la presencia del escenario: el TTL de 12 s no espera al suite. Cada
 * entrada lleva su punto porque el escenario tiene dos humanos en dos lugares
 * distintos (y medir desde el mismo punto no mediría nada).
 */
async function renew(entries) {
  for (const { token, point = ANCHOR } of entries) {
    const response = await updatePresence(token, at(point));
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
}

/** Espera a que el ticker siembre los bots: hasta entonces la página es corta. */
async function waitForRows(token, expected, filters = {}) {
  return waitFor(
    async () => {
      const page = await rows(token, filters);
      return page.length === expected ? page : null;
    },
    { label: `${expected} perfiles en discovery` },
  );
}

const ids = (page) => page.map((row) => row.profileId);

describe('discovery: 5 perfiles, medidas, filtros, región y ghost', () => {
  let snapshot = [];
  let observer;
  let neighbour;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const observerSession = await openSession({ regionKey: 'mx', demoSlot: 1 });
    const neighbourSession = await openSession({ regionKey: 'mx', demoSlot: 2 });
    assert.equal(observerSession.status, 201, JSON.stringify(observerSession.body));
    assert.equal(neighbourSession.status, 201, JSON.stringify(neighbourSession.body));
    observer = { ...observerSession.body, sessionId: sessionIdOf(observerSession.body.token) };
    neighbour = { ...neighbourSession.body, sessionId: sessionIdOf(neighbourSession.body.token) };
    assert.equal((await updatePresence(observer.token, at(ANCHOR))).status, 200);
    assert.equal((await updatePresence(neighbour.token, at(NEAR))).status, 200);
  });

  /** El escenario base: el observador en el ancla y el vecino en `NEAR`. */
  const renewScene = () =>
    renew([{ token: observer.token }, { token: neighbour.token, point: NEAR }]);

  after(async () => {
    for (const session of [observer, neighbour]) await logout(session.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('dos humanos en la misma región ven 5 perfiles: 1 humano + 4 bots', async () => {
    await renewScene();
    const page = await waitForRows(observer.token, 5);

    const humans = page.filter((row) => row.sourceType === 'human');
    const bots = page.filter((row) => row.sourceType === 'bot');
    assert.equal(humans.length, 1, `un solo humano ajeno: ${ids(page).join(' ')}`);
    assert.equal(bots.length, 4, `cuatro bots (2 propios + 2 ajenos): ${ids(page).join(' ')}`);

    // El otro humano sí, el propio no.
    assert.equal(humans[0].profileId, neighbour.profileId);
    assert.ok(!ids(page).includes(observer.profileId), 'el observador aparece en su propio descubrimiento');

    // Sus 2 bots sí: es lo que hace que "2 humanos ⇒ 5" cierre.
    const ownBots = [`${observer.profileId}-b1`, `${observer.profileId}-b2`];
    for (const botId of ownBots) {
      assert.ok(ids(page).includes(botId), `falta el bot propio ${botId}`);
    }
    assert.deepEqual(
      bots.map((row) => row.profileId).filter((id) => id.startsWith(neighbour.profileId)).sort(),
      [`${neighbour.profileId}-b1`, `${neighbour.profileId}-b2`],
    );

    // La fila es `ProfileSummary`: 17 campos, ni uno más ni uno menos.
    for (const row of page) {
      assert.deepEqual(Object.keys(row).sort(), PROFILE_FIELDS, `${row.profileId}: campos de ProfileSummary`);
      assert.equal(row.regionKey, 'mx');
      assert.equal(row.online, true, 'lo visible está online por construcción');
      assert.ok(row.demoSlot !== null, 'un humano o un bot siempre ocupa slot');
      assert.equal(row.inUse, true, 'la fila existe porque hay una sesión viva en ese slot');
      assert.ok(Number.isInteger(row.distanceM) && row.distanceM >= 200 && row.distanceM <= 5000);
      assert.ok(Number.isInteger(row.bearingDeg) && row.bearingDeg >= 0 && row.bearingDeg <= 359);
    }

    // Ni una coordenada en la respuesta.
    assert.doesNotMatch(
      JSON.stringify(page),
      /"(?:lat|lng|lon|latitude|longitude|point|center|position)"/i,
      'la respuesta lleva geometría',
    );

    // Orden ascendente por distancia, desempatado por `profileId`.
    const sorted = [...page].sort(
      (left, right) => left.distanceM - right.distanceM || left.profileId.localeCompare(right.profileId),
    );
    assert.deepEqual(ids(page), ids(sorted), 'la página no está ordenada por distancia');

    // El otro humano ve lo mismo desde su lado: 1 + 2 propios + 2 ajenos.
    await renewScene();
    const mirror = await waitForRows(neighbour.token, 5);
    assert.equal(mirror.filter((row) => row.sourceType === 'human').length, 1);
    assert.ok(ids(mirror).includes(observer.profileId));
    assert.ok(!ids(mirror).includes(neighbour.profileId));
  });

  test('distanceM/bearingDeg son relativos al observador, no al ancla de la zona', async () => {
    await renewScene();
    const page = await waitForRows(observer.token, 5);
    const other = page.find((row) => row.profileId === neighbour.profileId);
    assert.ok(other, 'el otro humano no está en la página');

    // ANCHOR→NEAR son ~945 m al sudeste. Contra el ancla daría 0 (los dos
    // humanos están en la zona demo del mismo polígono), que es exactamente la
    // deuda que S3-B dejó abierta: el número tiene que medirse desde el
    // observador.
    assert.ok(
      other.distanceM > 900 && other.distanceM < 1_000,
      `distanceM=${other.distanceM}: no se midió desde el observador`,
    );
    assert.ok(
      other.bearingDeg > 110 && other.bearingDeg < 140,
      `bearingDeg=${other.bearingDeg}: el rumbo no apunta al sudeste`,
    );

    // Y es simétrico: el vecino mide el mismo par de puntos desde su lado.
    await renewScene();
    const mirror = await waitForRows(neighbour.token, 5);
    const back = mirror.find((row) => row.profileId === observer.profileId);
    assert.ok(back);
    assert.ok(Math.abs(back.distanceM - other.distanceM) <= 1, 'ida y vuelta no miden lo mismo');
  });

  test('radio: filtra por distancia real y no clampa fuera de rango', async () => {
    await renewScene();
    // El vecino está a 945 m del observador: un radio de 900 lo deja afuera y
    // uno de 1000 lo incluye, así que el filtro es la distancia medida.
    //
    // Desde que los bots orbitan a su propio dueño (y no al ancla de la zona),
    // los bots del vecino pueden caer cerca del observador: el borde del radio
    // se fija sobre un sujeto con distancia conocida, no sobre "no hay bots".
    const tight = await rows(observer.token, { radiusM: 900 });
    assert.ok(!ids(tight).includes(neighbour.profileId), 'radiusM=900 no filtró al vecino de 945 m');

    const page = await waitFor(
      async () => {
        const now = await rows(observer.token, { radiusM: 1000 });
        const other = now.find((row) => row.profileId === neighbour.profileId);
        return other === undefined ? null : now;
      },
      { label: 'el vecino de 945 m dentro del radio de 1000 m' },
    );
    assert.equal(
      page.find((row) => row.profileId === neighbour.profileId).distanceM,
      945,
      'la distancia proyectada no es la medida',
    );
    assert.ok(page.every((row) => row.distanceM <= 1000), 'el radio devolvió una fila más lejana');

    // El default cubre la región entera.
    assert.equal((await waitForRows(observer.token, 5)).length, 5);
  });

  test('zona demo sin GPS: el radar conserva el vector autorado del catálogo', async () => {
    // Sin GPS, la presencia es una zona: el observador es el origen (el ancla) y
    // el sujeto se ubica donde el catálogo lo dibuja. Si los dos cayeran en el
    // ancla, toda la región aparecería a 200 m y el radar sería un punto.
    assert.equal((await updatePresence(observer.token, { demoZoneKey: 'cdmx' })).status, 200);
    assert.equal((await updatePresence(neighbour.token, { demoZoneKey: 'cdmx' })).status, 200);
    const page = await waitForRows(observer.token, 5);

    const other = page.find((row) => row.profileId === neighbour.profileId);
    assert.ok(other, 'el otro humano no está en la página');
    // mx-p02 está en el catálogo a 480 m y 118° del ancla de cdmx.
    assert.equal(other.distanceM, 480, `distanceM=${other.distanceM}: no es el vector del catálogo`);
    assert.ok(
      Math.abs(other.bearingDeg - 118) <= 2,
      `bearingDeg=${other.bearingDeg}: no apunta al vector del catálogo`,
    );

    // El frame sigue siendo el observador: si el observador se mueve, la medida
    // del mismo perfil cambia (con un frame de ancla no cambiaría).
    assert.equal((await updatePresence(observer.token, at(FAR))).status, 200);
    const moved = await waitFor(
      async () => {
        const rowsNow = await rows(observer.token);
        const row = rowsNow.find((entry) => entry.profileId === neighbour.profileId);
        return row !== undefined && row.distanceM > 2_000 ? row : null;
      },
      { label: 'la medida del vecino desde el punto nuevo' },
    );
    assert.notEqual(moved.distanceM, 480, 'la distancia no dependió del observador');

    await renewScene();
  });

  test('filtros: intención, género, verificado y online, uno por uno y combinados', async () => {
    await renewScene();
    const all = await waitForRows(observer.token, 5);
    const byId = Object.fromEntries(all.map((row) => [row.profileId, row]));

    // El vecino es friendship/male/no verificado; el observador networking/female
    // verificado. Los bots heredan la fila de su dueño.
    const friendship = await rows(observer.token, { intention: 'friendship' });
    assert.deepEqual(
      ids(friendship).sort(),
      [neighbour.profileId, `${neighbour.profileId}-b1`, `${neighbour.profileId}-b2`].sort(),
      'intention=friendship no filtró',
    );
    assert.deepEqual(await rows(observer.token, { intention: 'activities' }), [], 'hay un perfil de activities');

    const male = await rows(observer.token, { gender: 'male' });
    assert.deepEqual(ids(male).sort(), ids(friendship).sort(), 'gender=male no filtró');

    const verified = await rows(observer.token, { verified: true });
    assert.deepEqual(
      ids(verified).sort(),
      [`${observer.profileId}-b1`, `${observer.profileId}-b2`].sort(),
      'verified=true no filtró',
    );
    assert.ok(verified.every((row) => row.verified === true));

    // `false` no filtra: el contrato dice "sólo cuando es `true`".
    assert.equal((await rows(observer.token, { verified: false })).length, 5, 'verified=false filtró');
    assert.equal((await rows(observer.token, { online: true })).length, 5, 'online=true filtró de más');
    assert.equal((await rows(observer.token, { online: false })).length, 5, 'online=false filtró');

    // Combinado: dos filtros que se suman y uno que no filtra.
    const combined = await rows(observer.token, {
      intention: 'friendship',
      gender: 'male',
      verified: true,
      online: true,
    });
    assert.deepEqual(combined, [], 'la combinación no es intersección');

    const combined2 = await rows(observer.token, {
      intention: 'friendship',
      gender: 'male',
      verified: false,
      radiusM: 1000,
    });
    // Con los bots alrededor de su dueño, algunos del vecino pueden entrar en
    // los 1000 m: lo que se fija es la intersección (toda fila cumple los
    // filtros y el vecino sigue estando), no un conteo que dependía del ancla.
    assert.ok(
      combined2.every(
        (row) => row.intention === 'friendship' && row.gender === 'male' && row.distanceM <= 1000,
      ),
      'combinado: radio + intención + género no es una intersección',
    );
    assert.ok(ids(combined2).includes(neighbour.profileId), 'el combinado perdió al vecino');

    // Y un filtro que excluye todo sin ser un error.
    const none = await rows(observer.token, { intention: 'networking', verified: true, radiusM: 200 });
    assert.deepEqual(none, [], 'una combinación imposible no devuelve página vacía');
    assert.equal(byId[neighbour.profileId].gender, 'male');
  });

  test('validación: radio, enums, flags y parámetros repetidos son 422', async () => {
    await renew([{ token: observer.token }]);
    for (const [filters, label] of [
      [{ radiusM: 199 }, 'radio por debajo'],
      [{ radiusM: 5001 }, 'radio por encima'],
      [{ radiusM: 'abc' }, 'radio no numérico'],
      [{ radiusM: 1.5 }, 'radio con decimales'],
      [{ radiusM: '1e3' }, 'radio en notación científica'],
      [{ intention: 'nope' }, 'intención fuera del enum'],
      [{ gender: 'other' }, 'género fuera del enum'],
      [{ verified: 'maybe' }, 'flag de verificado inválido'],
      [{ online: 'si' }, 'flag de online inválido'],
      [{ radiusM: [1000, 2000] }, 'parámetro repetido'],
    ]) {
      const response = await listDiscovery(observer.token, filters);
      assert.equal(response.status, 422, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED', label);
    }

    // Sin token no hay descubrimiento (ni siquiera vacío).
    const anonymous = await listDiscovery('', {});
    assert.equal(anonymous.status, 401, JSON.stringify(anonymous.body));
    assert.equal(anonymous.body.code, 'UNAUTHENTICATED');

    // El filtro vacío (`?radiusM=`) es el default, no 422.
    const blank = await listDiscovery(observer.token, { radiusM: '' });
    assert.equal(blank.status, 200, JSON.stringify(blank.body));
    assert.ok(blank.body.results.length > 0, 'un parámetro vacío dejó la página sin filas');
  });

  test('aislamiento por región: mx y co no se ven ni se cruzan', async () => {
    const coObserverSession = await openSession({ regionKey: 'co', demoSlot: 4 });
    const coSubjectSession = await openSession({ regionKey: 'co', demoSlot: 5 });
    assert.equal(coObserverSession.status, 201, JSON.stringify(coObserverSession.body));
    assert.equal(coSubjectSession.status, 201, JSON.stringify(coSubjectSession.body));
    const coObserver = coObserverSession.body;
    const coSubject = coSubjectSession.body;
    await renew([
      { token: coObserver.token, point: CO_ANCHOR },
      { token: coSubject.token, point: CO_NEAR },
    ]);

    await renewScene();
    const mxPage = await waitForRows(observer.token, 5);
    await renewScene();
    const coPage = await waitForRows(coObserver.token, 5);

    assert.ok(mxPage.every((row) => row.regionKey === 'mx'), 'mx ve perfiles de otra región');
    assert.ok(coPage.every((row) => row.regionKey === 'co'), 'co ve perfiles de otra región');
    assert.ok(!ids(mxPage).some((id) => id.startsWith('co-')), 'mx ve co');
    assert.ok(!ids(coPage).some((id) => id.startsWith('mx-')), 'co ve mx');
    // La misma regla de negocio en co: 1 humano + 2 propios + 2 ajenos.
    assert.equal(coPage.filter((row) => row.sourceType === 'human').length, 1);
    assert.deepEqual(
      ids(coPage).filter((id) => id.startsWith('co-')).length,
      coPage.length,
      'co mezcló regiones',
    );

    await logout(coObserver.token);
    await logout(coSubject.token);
  });

  test('ghost: sin presencia viva el perfil y sus bots desaparecen en el acto', async () => {
    await renewScene();
    const before = await waitForRows(observer.token, 5);
    assert.ok(ids(before).includes(neighbour.profileId));

    assert.equal((await clearPresence(neighbour.token)).status, 204);

    // Al otro le quedan sus propios 2 bots: el ghost es del vecino, no de él.
    await renew([{ token: observer.token }]);
    const after = await waitForRows(observer.token, 2);
    assert.deepEqual(
      ids(after).sort(),
      [`${observer.profileId}-b1`, `${observer.profileId}-b2`].sort(),
      'el ghost del vecino dejó sus perfiles a la vista',
    );

    // Y el que entró en ghost no descubre a nadie: invisible ⇒ ciego.
    assert.deepEqual(await rows(neighbour.token), [], 'un ghost ve a los demás');

    // La sesión sigue viva (ghost es pausa de presencia, no logout).
    assert.equal((await listDiscovery(neighbour.token)).status, 200);

    // Al volver, vuelve el 5.
    assert.equal((await updatePresence(neighbour.token, at(NEAR))).status, 200);
    await renew([{ token: observer.token }]);
    const back = await waitForRows(observer.token, 5);
    assert.ok(ids(back).includes(neighbour.profileId), 'el perfil no volvió al reaparecer');
  });
});

describe('discovery: cap de 6 bots y tope de página', () => {
  let snapshot = [];
  /** 5 humanos vivos en mx: el observador y 4 más. */
  let humans = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const spots = [
      { lat: 19.44, lng: -99.127297 }, // el observador, en el ancla
      { lat: 19.422, lng: -99.13 },
      { lat: 19.426, lng: -99.14 },
      { lat: 19.43, lng: -99.11 },
      { lat: 19.434, lng: -99.15 },
    ];
    for (const [index, demoSlot] of [6, 7, 8, 9, 10].entries()) {
      const session = await openSession({ regionKey: 'mx', demoSlot });
      assert.equal(session.status, 201, JSON.stringify(session.body));
      const human = { ...session.body, sessionId: sessionIdOf(session.body.token), spot: spots[index] };
      assert.equal((await updatePresence(human.token, at(human.spot))).status, 200);
      humans.push(human);
    }
  });

  after(async () => {
    for (const human of humans) await logout(human.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('5 humanos: 10 bots en la región, 6 visibles, los propios adentro y 10 filas', async () => {
    const renewAll = async () => {
      for (const human of humans) {
        const response = await updatePresence(human.token, at(human.spot));
        assert.equal(response.status, 200, JSON.stringify(response.body));
      }
    };
    await renewAll();
    const observer = humans[0];

    const page = await waitForRows(observer.token, 10);
    const bots = page.filter((row) => row.sourceType === 'bot');
    const others = humans.slice(1);

    assert.equal(bots.length, 6, `el cap de 6 bots no se respetó (${bots.length})`);
    assert.equal(page.length, 10, 'el tope de página del contrato es 10');
    assert.equal(page.filter((row) => row.sourceType === 'human').length, 4);

    // Los propios siempre entran (son los primeros del orden del cap).
    for (const ownBot of [`${observer.profileId}-b1`, `${observer.profileId}-b2`]) {
      assert.ok(ids(page).includes(ownBot), `el cap dejó afuera ${ownBot}`);
    }

    // El corte es determinista: 2 propios + los 4 primeros ajenos por id.
    const expected = [
      `${observer.profileId}-b1`,
      `${observer.profileId}-b2`,
      ...others
        .flatMap((human) => [`${human.profileId}-b1`, `${human.profileId}-b2`])
        .sort()
        .slice(0, 4),
    ].sort();
    assert.deepEqual(bots.map((row) => row.profileId).sort(), expected, 'el cap no es determinista');

    // Dos lecturas seguidas del mismo instante devuelven el mismo conjunto.
    await renewAll();
    const again = await rows(observer.token);
    assert.deepEqual(ids(again), ids(page), 'dos lecturas del mismo instante difieren');
  });
});
